'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const HISTORY_LIMIT = 200;
const EMPTY_ROOM_TTL = 30 * 60 * 1000;
const REACTIONS = ['💙', '🩵', '👍', '😂', '🥺', '✨'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

/* ---------- static files ---------- */

const server = http.createServer((req, res) => {
  const end = (code, body = '') => {
    res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(body);
  };

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return end(400, 'bad request');
  }

  if (pathname === '/healthz') return end(200, 'ok');
  if (req.method !== 'GET' && req.method !== 'HEAD') return end(405, 'method not allowed');
  if (pathname.includes('\0')) return end(400, 'bad request');
  if (pathname === '/') pathname = '/index.html';

  const file = path.join(PUBLIC, path.normalize(pathname));
  if (!file.startsWith(PUBLIC + path.sep)) return end(403, 'forbidden');

  fs.readFile(file, (err, data) => {
    if (err) return end(404, 'not found');
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

/* ---------- chat ---------- */

const rooms = new Map();

function getRoom(name) {
  let room = rooms.get(name);
  if (!room) {
    room = { name, clients: new Set(), history: [], timer: null };
    rooms.set(name, room);
  }
  clearTimeout(room.timer);
  room.timer = null;
  return room;
}

// Trim, strip control characters, and cap length (by code point).
function clean(value, max, keepNewlines = false) {
  if (typeof value !== 'string') return '';
  const re = keepNewlines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  return [...value.replace(re, ' ').trim()].slice(0, max).join('');
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(room, payload, except) {
  const data = JSON.stringify(payload);
  for (const client of room.clients) {
    if (client !== except && client.readyState === client.OPEN) client.send(data);
  }
}

function members(room) {
  const seen = new Map();
  for (const c of room.clients) seen.set(c.user.id, c.user);
  return [...seen.values()];
}

// Simple token bucket: 8 burst, one token back every 700ms.
function allow(ws) {
  const now = Date.now();
  ws.tokens = Math.min(8, ws.tokens + (now - ws.lastRefill) / 700);
  ws.lastRefill = now;
  if (ws.tokens < 1) return false;
  ws.tokens -= 1;
  return true;
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  room.clients.delete(ws);
  const stillHere = [...room.clients].some((c) => c.user.id === ws.user.id);
  broadcast(room, { type: 'typing', id: ws.user.id, on: false });
  broadcast(room, { type: 'members', members: members(room), left: stillHere ? null : ws.user });
  if (room.clients.size === 0) {
    room.timer = setTimeout(() => rooms.delete(room.name), EMPTY_ROOM_TTL);
  }
}

const handlers = {
  join(ws, msg) {
    const name = clean(msg.name, 20);
    const roomName = clean(msg.room, 30).toLowerCase() || 'lobby';
    const uid = clean(msg.uid, 64);
    if (!name || !uid) return send(ws, { type: 'error', code: 'invalid' });

    leave(ws);
    // The uid is a private token kept by the browser; others only see its hash.
    const id = crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12);
    ws.user = { id, name };
    const room = getRoom(roomName);
    const wasHere = [...room.clients].some((c) => c.user.id === id);
    room.clients.add(ws);
    ws.room = room;

    send(ws, {
      type: 'welcome',
      you: ws.user,
      room: room.name,
      history: room.history,
      members: members(room),
      reactions: REACTIONS,
    });
    broadcast(room, { type: 'members', members: members(room), joined: wasHere ? null : ws.user }, ws);
  },

  msg(ws, msg) {
    const room = ws.room;
    if (!room) return;
    const text = clean(msg.text, 2000, true);
    if (!text) return;
    if (!allow(ws)) return send(ws, { type: 'error', code: 'rate', cid: clean(msg.cid, 40) });

    let replyTo = null;
    if (typeof msg.replyTo === 'string') {
      const target = room.history.find((m) => m.id === msg.replyTo);
      if (target) {
        replyTo = { id: target.id, name: target.from.name, text: [...target.text].slice(0, 80).join('') };
      }
    }

    const message = {
      id: crypto.randomUUID(),
      from: ws.user,
      text,
      ts: Date.now(),
      replyTo,
      reactions: {},
    };
    room.history.push(message);
    if (room.history.length > HISTORY_LIMIT) room.history.shift();

    broadcast(room, { type: 'msg', message }, ws);
    send(ws, { type: 'msg', message, cid: clean(msg.cid, 40) });
  },

  react(ws, msg) {
    const room = ws.room;
    if (!room || !REACTIONS.includes(msg.emoji) || !allow(ws)) return;
    const target = room.history.find((m) => m.id === msg.id);
    if (!target) return;
    const users = target.reactions[msg.emoji] || [];
    const i = users.indexOf(ws.user.id);
    if (i >= 0) users.splice(i, 1);
    else users.push(ws.user.id);
    if (users.length) target.reactions[msg.emoji] = users;
    else delete target.reactions[msg.emoji];
    broadcast(room, { type: 'react', id: target.id, reactions: target.reactions, by: ws.user.id });
  },

  typing(ws, msg) {
    if (!ws.room) return;
    broadcast(ws.room, { type: 'typing', id: ws.user.id, name: ws.user.name, on: !!msg.on }, ws);
  },
};

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.room = null;
  ws.user = null;
  ws.tokens = 8;
  ws.lastRefill = Date.now();

  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const handler = Object.hasOwn(handlers, msg.type) ? handlers[msg.type] : null;
    if (handler) handler(ws, msg);
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => ws.terminate());
});

// Drop dead connections and keep proxies from idling the socket out.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`inachat listening on :${PORT}`);
});
