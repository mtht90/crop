// HTTP (静的ファイル) + WebSocket サーバー
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
};

// /shared/* はクライアントとサーバーで共有する ES モジュール
function resolvePath(url) {
  let path;
  try {
    path = decodeURIComponent(new URL(url, 'http://x').pathname);
  } catch {
    return null;
  }
  // /shared/* は共有モジュール、/vendor/three/* は three.js 本体 (node_modules から配信)
  let base;
  let rel;
  if (path.startsWith('/shared/')) {
    base = join(ROOT, 'shared');
    rel = path.slice('/shared'.length);
  } else if (path.startsWith('/vendor/three/')) {
    base = join(ROOT, 'node_modules', 'three');
    rel = path.slice('/vendor/three'.length);
    if (!/^\/(build|examples\/jsm)\//.test(rel)) return null;
  } else {
    base = join(ROOT, 'public');
    rel = path === '/' ? '/index.html' : path;
  }
  const file = normalize(join(base, rel));
  if (!file.startsWith(base + sep)) return null;
  return file;
}

async function serveStatic(req, res) {
  const file = resolvePath(req.url);
  if (!file) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    // 素材は変わらないので長めにキャッシュ
    const cache = /\/(assets|vendor)\//.test(req.url) ? 'public, max-age=86400' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
}

export function startServer(port = PORT) {
  const server = http.createServer(serveStatic);
  const rooms = new Map();

  function makeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
      if (!rooms.has(c)) return c;
    }
  }

  function createRoom() {
    const code = makeCode();
    const room = new Room(code, (r) => rooms.delete(r.code));
    rooms.set(code, room);
    return room;
  }

  const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

  wss.on('connection', (ws) => {
    let room = null;
    let member = null;
    const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

    const join = (r, name) => {
      const res = r.addHuman(ws, name);
      if (res.error) {
        send({ type: 'error', text: res.error });
        return false;
      }
      room = r;
      member = res.member;
      send({ type: 'joined', room: r.code, you: member.id });
      r.broadcastLobby();
      return true;
    };

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      if (!room) {
        if (msg.type === 'create' || msg.type === 'quick') {
          const r = createRoom();
          if (!join(r, msg.name)) return;
          if (msg.type === 'quick') {
            // ソロ練習: 好きな役を選んで残りをボットで埋めて即開始
            r.handle(member, { type: 'setRole', role: msg.role });
            if (msg.character) r.handle(member, { type: 'setCharacter', character: msg.character });
            if (msg.level !== undefined) r.handle(member, { type: 'setBotLevel', level: msg.level });
            r.fillBots();
            r.start();
          }
        } else if (msg.type === 'join') {
          const r = rooms.get(String(msg.room || '').toUpperCase());
          if (!r) send({ type: 'error', text: '部屋が見つかりません' });
          else join(r, msg.name);
        }
        return;
      }
      if (msg.type === 'leave') {
        room.removeMember(member.id);
        room = null;
        member = null;
        send({ type: 'left' });
        return;
      }
      try {
        room.handle(member, msg);
      } catch (err) {
        console.error('handle error', err);
      }
    });

    ws.on('close', () => {
      if (room && member) room.removeMember(member.id);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`FOG TRIAL サーバー起動: http://localhost:${server.address().port}`);
      resolve({ server, wss, rooms, port: server.address().port });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) startServer();
