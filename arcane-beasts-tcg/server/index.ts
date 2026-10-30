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
import { RateLimit, SaveTransfers } from './saves';

const here = fileURLToPath(new URL('.', import.meta.url));
// the game: WEB_DIR, else the prebuilt web/ that ships with the repo (so the
// host does not have to build it), else a local dist/ build
const prebuilt = join(here, '..', 'web');
const root = resolve(process.env.WEB_DIR ?? (existsSync(join(prebuilt, 'index.html')) ? prebuilt : join(here, '..', 'dist')));
/** images, sounds and the service worker are not copied into web/: they are served from public/ */
const extra = resolve(join(here, '..', 'public'));
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
  '.woff': 'font/woff',
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
const saves = new SaveTransfers(join(dataDir, 'save-transfers.json'));
const saveLimit = new RateLimit(30, 10 * 60 * 1000);

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS });
  res.end(JSON.stringify(body));
};
const clientIp = (req: IncomingMessage) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';

/** POST /api/save-transfer (body: the save JSON) → {code, expires}; GET /api/save-transfer/CODE → the save, once */
function saveTransfer(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (req.method === 'OPTIONS') return void res.writeHead(204, CORS).end();
  if (!saveLimit.allow(clientIp(req))) return json(res, 429, { error: '試行回数が多すぎます。しばらく待ってからお試しください' });
  if (req.method === 'POST' && url.pathname === '/api/save-transfer') {
    let body = '';
    let tooBig = false;
    req.setEncoding('utf8');
    req.on('data', (c: string) => {
      if (tooBig) return;
      body += c;
      if (body.length > 700_000) tooBig = true;
    });
    req.on('end', () => {
      if (tooBig) return json(res, 413, { error: 'データが大きすぎます' });
      const r = saves.create(body);
      if ('error' in r) return json(res, 400, r);
      console.log(`[${stamp()}] save transfer issued (${saves.size} pending)`);
      json(res, 200, r);
    });
    return;
  }
  const m = /^\/api\/save-transfer\/([0-9A-Za-z-]{4,20})$/.exec(url.pathname);
  if (req.method === 'GET' && m) {
    const data = saves.take(m[1]);
    if (!data) return json(res, 404, { error: 'コードが見つかりません（期限切れ・使用済み・入力ミス）' });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS });
    return void res.end(data);
  }
  json(res, 404, { error: 'not found' });
}

// ---------------------------------------------------------------------------
// 引っ越し: the game itself now lives on a static host (no bandwidth limit).
// Visitors of the old address get a tiny page that hands their saved data to
// the new address in the URL fragment; this server keeps the online play and
// the 引き継ぎ API. Off until MOVED_TO is set to the new address.
// ---------------------------------------------------------------------------
const MOVED_TO = (process.env.MOVED_TO ?? '').replace(/\/+$/, '');
const OLD_HOST = /\.onrender\.com$/;
const MOVE_PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ARCANE BEASTS — 引っ越しました</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060a1c;color:#e8ecff;font-family:system-ui,sans-serif;text-align:center}a{color:#ffd77a}</style></head>
<body><div><p style="font-size:20px;font-weight:700">ARCANE BEASTS は新しいアドレスに引っ越しました</p>
<p>データを持って移動しています…</p><p><a id="go" href="${MOVED_TO}/">移動しない場合はこちら</a></p></div>
<script>
(function(){
  var to=${JSON.stringify(MOVED_TO)}+'/'+location.search, data={}, n=0;
  try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('arcane-beasts-')===0&&k!=='arcane-beasts-server'){data[k]=localStorage.getItem(k);n++;}}}catch(e){}
  if(n){var bytes=new TextEncoder().encode(JSON.stringify(data)),bin='';for(var j=0;j<bytes.length;j+=32768)bin+=String.fromCharCode.apply(null,bytes.subarray(j,j+32768));to+='#move='+encodeURIComponent(btoa(bin));}
  document.getElementById('go').href=to;
  try{navigator.serviceWorker&&navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});}catch(e){}
  setTimeout(function(){location.replace(to);},300);
})();
</script></body></html>`;
/** replaces the old service worker: forgets its cache and steps aside, so the move page is what loads */
const KILL_SW = `self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}).then(function(){return self.registration.unregister();}).then(function(){return self.clients.matchAll();}).then(function(cs){cs.forEach(function(c){c.navigate(c.url);});}));});`;

function serve(req: IncomingMessage, res: ServerResponse) {
  // a malformed path (e.g. "//") must not take the whole server down
  let url: URL;
  try {
    url = new URL((req.url ?? '/').replace(/^\/+/, '/'), 'http://x');
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (url.pathname.startsWith('/api/save-transfer')) return saveTransfer(req, res, url);
  if (MOVED_TO && OLD_HOST.test(String(req.headers.host ?? '')) && url.pathname !== '/healthz' && !url.pathname.startsWith('/api/')) {
    if (url.pathname === '/sw.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
      return void res.end(KILL_SW);
    }
    // pages (and anything that is not a file) get the move page; files are not served from here any more
    if (!/\.\w+$/.test(url.pathname) || url.pathname.endsWith('.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      return void res.end(MOVE_PAGE);
    }
    res.writeHead(301, { location: `${MOVED_TO}${url.pathname}${url.search}` });
    return void res.end();
  }
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
  const isFile = (f: string) => existsSync(f) && statSync(f).isFile();
  const fromExtra = normalize(join(extra, rel));
  const target = isFile(file) ? file : fromExtra.startsWith(extra + sep) && isFile(fromExtra) ? fromExtra : join(root, 'index.html');
  if (!existsSync(target)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('ゲームがまだビルドされていません。先に npm run build を実行してください。');
    return;
  }
  const ext = extname(target);
  const hashed = /[\\/]assets[\\/].+-[\w-]{6,}\.\w+$/.test(target);
  const st = statSync(target);
  // a validator, so a browser that already has the file gets a tiny 304 instead of the bytes
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const media = /\.(webp|png|jpg|svg|mp3|ogg|woff2?)$/.test(target);
  const headers: Record<string, string | number> = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    // pages: always check; the bundle: forever (its name changes); art and sound: a week, then revalidate
    'cache-control': target.endsWith('index.html') || target.endsWith('sw.js') ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : media ? 'public, max-age=604800' : 'public, max-age=3600',
    etag,
    'accept-ranges': 'bytes',
  };
  if (req.headers['if-none-match'] === etag) return void res.writeHead(304, headers).end();
  // music streams in pieces: answer range requests instead of sending the whole file each time
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    end = Math.min(end, st.size - 1);
    if (start > end || start >= st.size) return void res.writeHead(416, { 'content-range': `bytes */${st.size}` }).end();
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return void res.end();
    return void createReadStream(target, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
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
