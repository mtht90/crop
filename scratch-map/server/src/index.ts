import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { createMailer } from './mail.js';
import { Bus, TicketBook } from './realtime.js';
import { Store } from './store.js';

const cfg = loadConfig();
const pool = createPool(cfg.databaseUrl);
const applied = await migrate(pool);
if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);

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
