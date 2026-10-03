// ============================================================================
// ARCANE BEASTS server: serves the built game (dist/) and the online play
// WebSocket (/ws) from one port, so a single tunnel URL is all you need.
//
//   npm run build        build the game once
//   npm run server       start (default port 8787)
//   PORT=3000 DATA_DIR=./data npm run server
// ============================================================================
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import { Hub } from './hub';
import { PlayerStore } from './players';
import { backendFromEnv } from './remote';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(process.env.WEB_DIR ?? join(here, '..', 'dist'));
const port = Number(process.env.PORT ?? 8787);
const dataDir = resolve(process.env.DATA_DIR ?? join(here, '..', 'data'));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const backend = backendFromEnv();
const store = new PlayerStore(join(dataDir, 'players.json'), Date.now, backend);
// with a database, load it before taking connections
await store.init().catch((e) => {
  console.error('could not read the player database:', e instanceof Error ? e.message : e);
  process.exit(1);
});
const stamp = () => new Date().toISOString().slice(11, 19);
const hub = new Hub({ store, log: (m) => console.log(`[${stamp()}] ${m}`) });

function serve(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ publicUrl: process.env.PUBLIC_URL?.replace(/\/+$/, '') || null }));
    return;
  }
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...hub.stats(), players: store.size }));
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(root, rel));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  const target = existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
  if (!existsSync(target)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('ゲームがまだビルドされていません。先に npm run build を実行してください。');
    return;
  }
  const ext = extname(target);
  const hashed = /[\\/]assets[\\/].+-[\w-]{6,}\.\w+$/.test(target);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': target.endsWith('index.html') || target.endsWith('sw.js') ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') return void res.end();
  createReadStream(target).pipe(res);
}

const server = createServer(serve);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  const conn = hub.connect({ send: (d) => ws.send(d), close: () => ws.close() });
  ws.on('message', (data) => hub.message(conn, data.toString()));
  ws.on('close', () => hub.disconnect(conn));
  ws.on('error', () => ws.close());
  // drop dead connections
  (ws as unknown as { alive: boolean }).alive = true;
  ws.on('pong', () => ((ws as unknown as { alive: boolean }).alive = true));
});
setInterval(() => {
  for (const ws of wss.clients) {
    const w = ws as unknown as { alive: boolean };
    if (!w.alive) {
      ws.terminate();
      continue;
    }
    w.alive = false;
    ws.ping();
  }
}, 20_000).unref();

server.listen(port, '0.0.0.0', () => {
  console.log(`ARCANE BEASTS server  http://localhost:${port}`);
  console.log(`  game files : ${root}${existsSync(root) ? '' : '  (not built yet: run npm run build)'}`);
  console.log(backend ? '  player data: hosted database (Supabase)' : `  player data: ${dataDir}`);
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => `http://${n!.address}:${port}`);
  if (lan.length) console.log(`  same Wi-Fi : ${lan.join('  ')}`);
  console.log(process.env.PUBLIC_URL ? `  public URL : ${process.env.PUBLIC_URL}` : '  public URL : (not set) open the game through your tunnel address so QR codes work');
});

const quit = async () => {
  hub.close();
  await store.close().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
