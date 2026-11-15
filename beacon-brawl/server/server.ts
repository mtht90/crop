/**
 * BEACON BRAWL のサーバー（Node.js 22 以上。追加ライブラリなし）
 * - ビルド済みのゲーム（dist/）を配信する
 * - /api でアカウントとセーブデータを管理する。ルールはブラウザと同じ src/meta/economy.ts を使う
 *
 * 環境変数
 *   PORT      待ち受けるポート（既定 8080）
 *   DATA_DIR  セーブデータを置くフォルダ（既定 ./data）。再起動しても消えない場所を指定すること
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { apply, migrate, newProfile, GameError, type Action, type Profile } from '../src/meta/economy';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const STATIC_DIR = process.env.STATIC_DIR ?? join(process.cwd(), 'dist');
const DB_FILE = join(DATA_DIR, 'accounts.json');

// ---------- 保存（JSON ファイル。書き込みはまとめて、一時ファイル経由で置き換える） ----------
interface Account { id: string; tokenHash: string; created: number; lastMatch: number; profile: Profile }
let accounts = new Map<string, Account>(); // key = tokenHash
let dirty = false;

async function loadDb() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const list = JSON.parse(await readFile(DB_FILE, 'utf8')) as Account[];
    accounts = new Map(list.map((a) => [a.tokenHash, { ...a, profile: migrate(a.profile, Date.now()) }]));
  } catch { accounts = new Map(); }
  console.log(`accounts: ${accounts.size}`);
}
async function flush() {
  if (!dirty) return;
  dirty = false;
  const tmp = DB_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify([...accounts.values()]));
  await rename(tmp, DB_FILE);
}
setInterval(() => { flush().catch((e) => console.error('save failed', e)); }, 2000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { dirty = true; flush().finally(() => process.exit(0)); });

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

// ---------- 乱用対策（とても簡単なもの） ----------
const guestLog = new Map<string, number[]>();
function allowGuest(ip: string) {
  const now = Date.now(), list = (guestLog.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= 20) return false;
  list.push(now); guestLog.set(ip, list); return true;
}
/** 1試合の最短時間。これより短い間隔の対戦報告は受け付けない */
const MIN_MATCH_MS = 30_000;

// ---------- HTTP ----------
function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const c of req) { size += c.length; if (size > 16_384) throw new GameError('リクエストが大きすぎます'); chunks.push(c as Buffer); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new GameError('リクエストの形式が正しくありません'); }
}
function accountOf(req: IncomingMessage) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? '');
  return m ? accounts.get(hash(m[1])) ?? null : null;
}

const ACTIONS = new Set(['login', 'match', 'claimMission', 'claimRoad', 'gacha', 'upgrade', 'select', 'setUlt', 'rename']);

async function api(req: IncomingMessage, res: ServerResponse, path: string) {
  if (path === '/api/health') return send(res, 200, { ok: true });
  if (path === '/api/guest' && req.method === 'POST') {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    if (!allowGuest(ip)) return send(res, 429, { error: 'しばらく時間をおいてからお試しください' });
    const token = randomBytes(32).toString('hex');
    const acc: Account = { id: randomBytes(8).toString('hex'), tokenHash: hash(token), created: Date.now(), lastMatch: 0, profile: newProfile(Date.now()) };
    accounts.set(acc.tokenHash, acc); dirty = true;
    return send(res, 200, { token, profile: acc.profile });
  }
  const acc = accountOf(req);
  if (path === '/api/ranking' && req.method === 'GET') {
    const list = [...accounts.values()].sort((a, b) => b.profile.trophies - a.profile.trophies).slice(0, 50)
      .map((a) => ({ name: a.profile.name, trophies: a.profile.trophies, me: a === acc || undefined }));
    return send(res, 200, { ranking: list });
  }
  if (!acc) return send(res, 401, { error: 'ログインし直してください' });
  if (path === '/api/profile' && req.method === 'GET') return send(res, 200, { profile: acc.profile });
  if (path === '/api/act' && req.method === 'POST') {
    const action = (await readBody(req)) as Action;
    if (!action || typeof action !== 'object' || !ACTIONS.has(action.type)) throw new GameError('不明な操作です');
    if (action.type === 'match') {
      if (Date.now() - acc.lastMatch < MIN_MATCH_MS) throw new GameError('対戦結果の送信が早すぎます');
      acc.lastMatch = Date.now();
    }
    const draft = structuredClone(acc.profile);
    const result = apply(draft, action, Date.now());
    acc.profile = draft; dirty = true;
    return send(res, 200, { profile: acc.profile, result });
  }
  send(res, 404, { error: 'not found' });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.vrm': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
async function serveStatic(res: ServerResponse, path: string) {
  const rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '');
  if (rel.startsWith('..')) return send(res, 400, { error: 'bad path' });
  let file = join(STATIC_DIR, rel || 'index.html');
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(STATIC_DIR, 'index.html'); }
  try {
    const data = await readFile(file);
    const ext = extname(file);
    // ファイル名にハッシュが付くビルド成果物と素材は長くキャッシュ
    const cache = ext === '.html' ? 'no-cache' : file.includes(`${'/assets/'}`) ? 'public, max-age=604800' : 'public, max-age=3600';
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': cache });
    res.end(data);
  } catch { send(res, 404, { error: 'not found' }); }
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  try {
    if (path.startsWith('/api/')) await api(req, res, path);
    else await serveStatic(res, path);
  } catch (e) {
    if (e instanceof GameError) send(res, 400, { error: e.message });
    else { console.error(e); send(res, 500, { error: 'サーバーでエラーが起きました' }); }
  }
});

await loadDb();
server.listen(PORT, () => console.log(`listening on :${PORT}`));
