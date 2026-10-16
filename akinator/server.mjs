// 依存ゼロの Node サーバー
//   node server.mjs            → http://localhost:3000
// 環境変数:
//   PORT=3000
//   NEW_ENTITY_MIN_VOTES=2     新しく教わった対象を全員の候補に出すまでに必要な投稿数
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from './lib/compile.mjs';
import { recordLearning } from './public/engine.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 3000);
const MIN_VOTES = +(process.env.NEW_ENTITY_MIN_VOTES || 2);
const LEARNED_PATH = path.join(root, 'data', 'learned.json');
const PUBLIC = path.join(root, 'public');

const db = compile(path.join(root, 'data'), (w) => console.warn('WARN', w));
const dbJson = JSON.stringify(db);
const knownTags = new Set(db.questions.map((q) => q.tag));
console.log(`DB: ${db.entities.length} entities / ${db.questions.length} questions`);

let learned = { plays: 0, entities: {} };
try {
  learned = JSON.parse(fs.readFileSync(LEARNED_PATH, 'utf8'));
} catch {}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = LEARNED_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(learned));
    fs.renameSync(tmp, LEARNED_PATH);
  }, 1000);
}

/** 他の人に配る学習データ（票が足りない新規エンティティは除く） */
function publicLearned() {
  const entities = {};
  for (const [name, rec] of Object.entries(learned.entities || {})) {
    if (rec.inDb || (rec.votes || 0) >= MIN_VOTES) entities[name] = rec;
  }
  return { plays: learned.plays || 0, entities };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const dbNames = new Set(db.entities.flatMap((e) => [e.n, ...e.a]));

async function handleLearn(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, '{"error":"bad json"}');
  }
  const name = typeof body.name === 'string' ? body.name.normalize('NFKC').trim().slice(0, 60) : '';
  if (!name || /[\u0000-\u001f<>]/.test(name)) return send(res, 400, '{"error":"bad name"}');
  const answers = {};
  if (body.answers && typeof body.answers === 'object') {
    for (const [tag, a] of Object.entries(body.answers).slice(0, 120)) {
      if (knownTags.has(tag) && Number.isInteger(a) && a >= 0 && a <= 4) answers[tag] = a;
    }
  }
  const domain = ['P', 'C', 'A', 'L', 'F', 'O', 'S'].includes(body.domain) ? body.domain : null;
  recordLearning(learned, { name, answers, domain, win: !!body.win });
  if (dbNames.has(name)) learned.entities[name].inDb = true;
  scheduleSave();
  send(res, 200, '{"ok":true}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/db' && req.method === 'GET') return send(res, 200, dbJson);
    if (url.pathname === '/api/learned' && req.method === 'GET') return send(res, 200, JSON.stringify(publicLearned()));
    if (url.pathname === '/api/learn' && req.method === 'POST') return await handleLearn(req, res);
    if (req.method !== 'GET') return send(res, 405, '{"error":"method"}');

    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'forbidden', 'text/plain');
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'not found', 'text/plain');
      send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
    });
  } catch (e) {
    console.error(e);
    send(res, 500, '{"error":"internal"}');
  }
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
