import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { createMailer } from './mail.js';
import { Bus, TicketBook } from './realtime.js';
import { Store } from './store.js';

const cfg = loadConfig();
if (!process.env.DATABASE_URL && process.env.RENDER) {
  console.error('[config] DATABASE_URL が設定されていません。Render Postgres の「Internal Database URL」を API サービスの環境変数 DATABASE_URL に設定してください。');
  process.exit(1);
}
const pool = createPool(cfg.databaseUrl);
try {
  const applied = await migrate(pool);
  if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);
} catch (e) {
  const err = e as Error & { code?: string };
  console.error(`[db] データベースに接続/初期化できませんでした: ${err.code ?? ''} ${err.message}`);
  console.error('[db] DATABASE_URL を確認してください（Render では同じリージョンの Postgres の Internal Database URL を推奨）。');
  process.exit(1);
}

const app = createApp({ cfg, store: new Store(pool), bus: new Bus(), tickets: new TicketBook(), mailer: createMailer(cfg) });

const server = serve({ fetch: app.fetch, port: cfg.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[api] listening on :${info.port}  app=${cfg.appOrigin}  public=${cfg.publicApiUrl}  rpId=${cfg.rpId}`);
});

const shutdown = () => {
  server.close();
  pool.end().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
