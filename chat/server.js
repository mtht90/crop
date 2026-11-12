'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');
const { createStore } = require('./store');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const HISTORY_LIMIT = 200;
const MAX_ROOMS = 500;
const MAX_SUBS_PER_USER = 10;
const LOBBY = 'lobby';
const REACTIONS = ['💙', '🩵', '👍', '😂', '🥺', '✨'];
const ID_RE = /^[A-Za-z0-9_-]{1,16}$/;

/* =====================================================================
   State
   ===================================================================== */

// Persisted: id, name, isPublic, pass, owner, createdAt, lastTs, members, history
// Runtime only: clients (sockets subscribed to the room)
const rooms = new Map();
const subs = new Map(); // userId -> Map(endpoint -> subscription)
const store = createStore();
const dirty = { rooms: new Set(), deleted: new Set(), subs: new Set(), meta: {} };
let flushTimer = null;
let flushing = Promise.resolve();

function markRoom(room) {
  dirty.rooms.add(room.id);
  dirty.deleted.delete(room.id);
  scheduleFlush();
}
function markSubs(userId) {
  dirty.subs.add(userId);
  scheduleFlush();
}
function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flush, 1000);
}
function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  const batch = {
    rooms: [...dirty.rooms].map((id) => rooms.get(id)).filter(Boolean).map(serialize),
    deletedRooms: [...dirty.deleted],
    subs: Object.fromEntries([...dirty.subs].map((u) => [u, [...(subs.get(u)?.values() || [])]])),
    meta: dirty.meta,
  };
  dirty.rooms.clear();
  dirty.deleted.clear();
  dirty.subs.clear();
  dirty.meta = {};
  flushing = flushing
    .then(() => store.write(batch))
    .catch((err) => {
      console.error('[store] write failed, will retry:', err.message);
      for (const r of batch.rooms) if (!dirty.deleted.has(r.id)) dirty.rooms.add(r.id);
      for (const id of batch.deletedRooms) if (!dirty.rooms.has(id)) dirty.deleted.add(id);
      for (const u of Object.keys(batch.subs)) dirty.subs.add(u);
      dirty.meta = { ...batch.meta, ...dirty.meta };
      setTimeout(scheduleFlush, 4000);
    });
  return flushing;
}

function serialize(room) {
  const { clients, ...data } = room;
  return data;
}

function createRoom(fields) {
  const room = {
    id: fields.id,
    name: fields.name,
    isPublic: !!fields.isPublic,
    pass: fields.pass || null,
    owner: fields.owner || null,
    createdAt: Date.now(),
    lastTs: Date.now(),
    members: {},
    history: [],
    clients: new Set(),
  };
  rooms.set(room.id, room);
  markRoom(room);
  return room;
}

function deleteRoom(room) {
  rooms.delete(room.id);
  dirty.rooms.delete(room.id);
  dirty.deleted.add(room.id);
  scheduleFlush();
}

/* ---------- passwords (scrypt) ---------- */

function hashPass(pass) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pass, salt, 32);
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}
function checkPass(pass, stored) {
  if (typeof pass !== 'string' || !pass) return false;
  const [salt, hash] = stored.split(':').map((s) => Buffer.from(s, 'base64'));
  const test = crypto.scryptSync(pass.slice(0, 64), salt, 32);
  return crypto.timingSafeEqual(test, hash);
}

/* ---------- web push ---------- */

let vapidPublic = null;

function setupVapid(meta) {
  let pub;
  let priv;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    pub = process.env.VAPID_PUBLIC_KEY;
    priv = process.env.VAPID_PRIVATE_KEY;
  } else if (process.env.SECRET) {
    // Deterministic keys from a stable secret, so they survive restarts.
    const d = crypto.createHash('sha256').update(`vapid:${process.env.SECRET}`).digest();
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    pub = ecdh.getPublicKey().toString('base64url');
    priv = d.toString('base64url');
  } else if (meta.vapid) {
    ({ publicKey: pub, privateKey: priv } = meta.vapid);
  } else {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey;
    priv = keys.privateKey;
    dirty.meta.vapid = keys;
    scheduleFlush();
  }
  const subject = process.env.VAPID_SUBJECT || process.env.RENDER_EXTERNAL_URL || 'mailto:noreply@example.com';
  webpush.setVapidDetails(subject, pub, priv);
  vapidPublic = pub;
}

function validSub(sub) {
  if (!sub || typeof sub !== 'object' || typeof sub.endpoint !== 'string') return null;
  if (sub.endpoint.length > 1000 || !sub.endpoint.startsWith('https://')) return null;
  const k = sub.keys;
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return null;
  if (k.p256dh.length > 200 || k.auth.length > 100) return null;
  return { endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}

function addSub(userId, sub) {
  let map = subs.get(userId);
  if (!map) subs.set(userId, (map = new Map()));
  // An endpoint belongs to one browser; drop it from any previous owner.
  for (const [other, m] of subs) {
    if (other !== userId && m.delete(sub.endpoint)) markSubs(other);
  }
  map.delete(sub.endpoint);
  map.set(sub.endpoint, sub);
  while (map.size > MAX_SUBS_PER_USER) map.delete(map.keys().next().value);
  markSubs(userId);
}

function removeSub(endpoint) {
  for (const [userId, map] of subs) {
    if (map.delete(endpoint)) markSubs(userId);
  }
}

function notifyRoom(room, message) {
  if (!vapidPublic) return;
  const payload = JSON.stringify({
    title: room.name,
    body: `${message.from.name}: ${[...message.text].slice(0, 140).join('')}`,
    room: room.id,
    ts: message.ts,
  });
  for (const [userId, member] of Object.entries(room.members)) {
    if (userId === message.from.id || member.muted) continue;
    const userSubs = subs.get(userId);
    if (!userSubs || !userSubs.size) continue;
    // Skip people who are looking at this room right now.
    const watching = [...room.clients].some((c) => c.user.id === userId && c.active === room.id && c.visible);
    if (watching) continue;
    for (const sub of userSubs.values()) {
      webpush
        .sendNotification(sub, payload, { TTL: 6 * 3600, urgency: 'high', topic: room.id.replace(/[^A-Za-z0-9_-]/g, '') })
        .catch((err) => {
          if (err.statusCode === 404 || err.statusCode === 410) removeSub(sub.endpoint);
          else console.error('[push]', err.statusCode || '', err.body || err.message);
        });
    }
  }
}

/* =====================================================================
   HTTP
   ===================================================================== */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};
const VENDOR = {
  '/vendor/qrcode.js': path.join(__dirname, 'node_modules', 'qrcode-generator', 'dist', 'qrcode.js'),
};
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

function readBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const end = (code, body = '', type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type });
    res.end(body);
  };

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return end(400, 'bad request');
  }

  if (pathname === '/healthz') return end(200, 'ok');

  // Called by the service worker when the browser rotates a push subscription.
  if (pathname === '/api/push/renew' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const sub = validSub(body.subscription);
      const old = typeof body.oldEndpoint === 'string' ? body.oldEndpoint : '';
      const owner = [...subs].find(([, m]) => m.has(old))?.[0];
      if (!sub || !owner) return end(404, 'unknown subscription');
      removeSub(old);
      addSub(owner, sub);
      return end(204);
    } catch {
      return end(400, 'bad request');
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return end(405, 'method not allowed');
  if (pathname.includes('\0')) return end(400, 'bad request');
  if (pathname === '/') pathname = '/index.html';

  const file = VENDOR[pathname] || path.join(PUBLIC, path.normalize(pathname));
  if (!VENDOR[pathname] && !file.startsWith(PUBLIC + path.sep)) return end(403, 'forbidden');

  fs.readFile(file, (err, data) => {
    if (err) return end(404, 'not found');
    const ext = path.extname(file);
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.png' ? 'public, max-age=86400' : 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    };
    if (ext === '.html') headers['content-security-policy'] = CSP;
    if (pathname === '/sw.js') headers['service-worker-allowed'] = '/';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

/* =====================================================================
   Chat
   ===================================================================== */

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
  for (const c of room.clients) {
    if (c !== except && c.readyState === c.OPEN) c.send(data);
  }
}
function socketsOf(userId) {
  return [...wss.clients].filter((c) => c.user && c.user.id === userId);
}

function online(room) {
  const seen = new Map();
  for (const c of room.clients) if (c.user) seen.set(c.user.id, c.user);
  return [...seen.values()];
}

function summary(room, userId) {
  const member = room.members[userId];
  let last = null;
  let unread = 0;
  for (let i = room.history.length - 1; i >= 0; i--) {
    const m = room.history[i];
    if (!last && !m.sys) last = { name: m.from.name, text: [...m.text].slice(0, 60).join(''), ts: m.ts };
    const newer = member && m.ts > member.read;
    if (newer && !m.sys && m.from.id !== userId) unread++;
    if (!newer && last) break;
  }
  return {
    id: room.id,
    name: room.name,
    isPublic: room.isPublic,
    locked: !!room.pass,
    owner: room.owner === userId,
    muted: !!member?.muted,
    member: !!member,
    unread,
    last,
    lastTs: room.lastTs,
    members: Object.keys(room.members).length,
    online: online(room).length,
  };
}

// Simple token bucket per socket.
function allow(ws, cost = 1) {
  const now = Date.now();
  ws.tokens = Math.min(10, ws.tokens + (now - ws.lastRefill) / 600);
  ws.lastRefill = now;
  if (ws.tokens < cost) return false;
  ws.tokens -= cost;
  return true;
}

function pushHistory(room, entry) {
  room.history.push(entry);
  if (room.history.length > HISTORY_LIMIT) room.history.shift();
  room.lastTs = entry.ts;
  markRoom(room);
}

function systemMessage(room, text) {
  const entry = { id: crypto.randomUUID(), sys: true, text, ts: Date.now() };
  pushHistory(room, entry);
  broadcast(room, { type: 'msg', room: room.id, message: entry });
}

function sendPresence(room) {
  broadcast(room, { type: 'presence', room: room.id, online: online(room), members: Object.keys(room.members).length });
}

let exploreTimer = null;
function exploreChanged() {
  if (exploreTimer) return;
  exploreTimer = setTimeout(() => {
    exploreTimer = null;
    for (const c of wss.clients) if (c.exploring) sendExplore(c);
  }, 600);
}
function sendExplore(ws) {
  const list = [...rooms.values()]
    .filter((r) => r.isPublic)
    .map((r) => summary(r, ws.user.id))
    .sort((a, b) => b.online - a.online || b.lastTs - a.lastTs)
    .slice(0, 60);
  send(ws, { type: 'explore', rooms: list });
}

function subscribe(ws, room) {
  if (room.clients.has(ws)) return;
  room.clients.add(ws);
  ws.rooms.add(room.id);
}
function unsubscribe(ws, room) {
  room.clients.delete(ws);
  ws.rooms.delete(room.id);
  if (ws.active === room.id) ws.active = null;
}

function memberRoom(ws, id) {
  if (!ws.user || typeof id !== 'string') return null;
  const room = rooms.get(id);
  return room && room.members[ws.user.id] ? room : null;
}

function addMember(room, user) {
  room.members[user.id] = { name: user.name, read: Date.now(), muted: false, joinedAt: Date.now() };
  for (const s of socketsOf(user.id)) {
    subscribe(s, room);
    send(s, { type: 'room', room: summary(room, user.id) });
  }
  systemMessage(room, `${user.name}さんが参加しました`);
  sendPresence(room);
  if (room.isPublic) exploreChanged();
}

const handlers = {
  hello(ws, msg) {
    const name = clean(msg.name, 20);
    const uid = clean(msg.uid, 64);
    if (!name || uid.length < 16) return send(ws, { type: 'error', code: 'invalid' });
    // The uid is a private token kept by the browser; others only see its hash.
    const id = crypto.createHash('sha256').update(uid).digest('hex').slice(0, 16);
    ws.user = { id, name };
    const mine = [];
    for (const room of rooms.values()) {
      const member = room.members[id];
      if (!member) continue;
      if (member.name !== name) {
        member.name = name;
        markRoom(room);
      }
      subscribe(ws, room);
      mine.push(summary(room, id));
    }
    send(ws, { type: 'ready', you: ws.user, rooms: mine, reactions: REACTIONS, vapid: vapidPublic });
    for (const id of ws.rooms) sendPresence(rooms.get(id));
  },

  rename(ws, msg) {
    if (!ws.user) return;
    const name = clean(msg.name, 20);
    if (!name || !allow(ws)) return;
    for (const s of socketsOf(ws.user.id)) {
      s.user = { ...s.user, name };
      send(s, { type: 'you', you: s.user });
    }
    for (const id of ws.rooms) {
      const room = rooms.get(id);
      room.members[ws.user.id].name = name;
      markRoom(room);
      sendPresence(room);
    }
  },

  create(ws, msg) {
    if (!ws.user) return;
    const name = clean(msg.name, 30);
    const pass = clean(msg.pass, 32);
    if (!name) return send(ws, { type: 'error', code: 'invalid', op: 'create' });
    if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'error', code: 'full', op: 'create' });
    if (!allow(ws, 4)) return send(ws, { type: 'error', code: 'rate', op: 'create' });
    let id;
    do id = crypto.randomBytes(6).toString('base64url');
    while (rooms.has(id));
    const room = createRoom({ id, name, isPublic: !!msg.isPublic, pass: pass ? hashPass(pass) : null, owner: ws.user.id });
    room.members[ws.user.id] = { name: ws.user.name, read: Date.now(), muted: false, joinedAt: Date.now() };
    for (const s of socketsOf(ws.user.id)) {
      subscribe(s, room);
      send(s, { type: 'room', room: summary(room, ws.user.id) });
    }
    systemMessage(room, `${ws.user.name}さんが「${name}」を作成しました`);
    send(ws, { type: 'created', room: id });
    if (room.isPublic) exploreChanged();
  },

  peek(ws, msg) {
    if (!ws.user) return;
    const room = typeof msg.room === 'string' && ID_RE.test(msg.room) ? rooms.get(msg.room) : null;
    send(ws, { type: 'peek', id: msg.room, room: room ? summary(room, ws.user.id) : null });
  },

  join(ws, msg) {
    if (!ws.user || typeof msg.room !== 'string') return;
    const room = rooms.get(msg.room);
    if (!room) return send(ws, { type: 'error', code: 'notfound', op: 'join', room: msg.room });
    if (room.members[ws.user.id]) return send(ws, { type: 'joined', room: room.id });
    if (!allow(ws, 2)) return send(ws, { type: 'error', code: 'rate', op: 'join', room: room.id });
    if (room.pass && !checkPass(msg.pass, room.pass)) {
      ws.tokens -= 2; // slow down guessing
      return send(ws, { type: 'error', code: 'pass', op: 'join', room: room.id });
    }
    addMember(room, ws.user);
    send(ws, { type: 'joined', room: room.id });
  },

  open(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return send(ws, { type: 'error', code: 'notfound', op: 'open', room: msg.room });
    send(ws, { type: 'history', room: room.id, messages: room.history, online: online(room), summary: summary(room, ws.user.id) });
  },

  leave(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    const user = ws.user;
    delete room.members[user.id];
    for (const s of socketsOf(user.id)) {
      unsubscribe(s, room);
      send(s, { type: 'removed', room: room.id, reason: 'left' });
    }
    if (room.id !== LOBBY && Object.keys(room.members).length === 0) {
      deleteRoom(room);
    } else {
      markRoom(room);
      systemMessage(room, `${user.name}さんが退出しました`);
      sendPresence(room);
    }
    if (room.isPublic) exploreChanged();
  },

  delete(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room || room.owner !== ws.user.id || room.id === LOBBY) return;
    broadcast(room, { type: 'removed', room: room.id, reason: 'deleted' });
    for (const c of room.clients) unsubscribe(c, room);
    deleteRoom(room);
    if (room.isPublic) exploreChanged();
  },

  msg(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    const text = clean(msg.text, 2000, true);
    if (!text) return;
    const cid = clean(msg.cid, 40);
    if (!allow(ws)) return send(ws, { type: 'error', code: 'rate', op: 'msg', room: room.id, cid });

    let replyTo = null;
    if (typeof msg.replyTo === 'string') {
      const target = room.history.find((m) => m.id === msg.replyTo && !m.sys);
      if (target) replyTo = { id: target.id, name: target.from.name, text: [...target.text].slice(0, 80).join('') };
    }
    const message = { id: crypto.randomUUID(), from: ws.user, text, ts: Date.now(), replyTo, reactions: {} };
    pushHistory(room, message);
    room.members[ws.user.id].read = message.ts;

    broadcast(room, { type: 'msg', room: room.id, message }, ws);
    send(ws, { type: 'msg', room: room.id, message, cid });
    notifyRoom(room, message);
    if (room.isPublic) exploreChanged();
  },

  react(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room || !REACTIONS.includes(msg.emoji) || !allow(ws, 0.5)) return;
    const target = room.history.find((m) => m.id === msg.id && !m.sys);
    if (!target) return;
    const users = target.reactions[msg.emoji] || [];
    const i = users.indexOf(ws.user.id);
    if (i >= 0) users.splice(i, 1);
    else users.push(ws.user.id);
    if (users.length) target.reactions[msg.emoji] = users;
    else delete target.reactions[msg.emoji];
    markRoom(room);
    broadcast(room, { type: 'react', room: room.id, id: target.id, reactions: target.reactions });
  },

  typing(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    broadcast(room, { type: 'typing', room: room.id, id: ws.user.id, name: ws.user.name, on: !!msg.on }, ws);
  },

  read(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    const member = room.members[ws.user.id];
    const ts = Math.min(Number(msg.ts) || 0, Date.now());
    if (ts <= member.read) return;
    member.read = ts;
    markRoom(room);
    for (const s of socketsOf(ws.user.id)) {
      if (s !== ws) send(s, { type: 'room', room: summary(room, ws.user.id) });
    }
  },

  focus(ws, msg) {
    ws.active = typeof msg.room === 'string' ? msg.room : null;
    ws.visible = !!msg.visible;
  },

  mute(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    room.members[ws.user.id].muted = !!msg.on;
    markRoom(room);
    for (const s of socketsOf(ws.user.id)) send(s, { type: 'room', room: summary(room, ws.user.id) });
  },

  explore(ws, msg) {
    if (!ws.user) return;
    ws.exploring = !!msg.on;
    if (ws.exploring) sendExplore(ws);
  },

  push(ws, msg) {
    if (!ws.user) return;
    const sub = validSub(msg.sub);
    if (sub) addSub(ws.user.id, sub);
  },

  unpush(ws, msg) {
    if (!ws.user || typeof msg.endpoint !== 'string') return;
    if (subs.get(ws.user.id)?.delete(msg.endpoint)) markSubs(ws.user.id);
  },
};

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.user = null;
  ws.rooms = new Set();
  ws.active = null;
  ws.visible = false;
  ws.exploring = false;
  ws.tokens = 10;
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
    if (!handler || (msg.type !== 'hello' && !ws.user)) return;
    try {
      handler(ws, msg);
    } catch (err) {
      console.error('[ws] handler failed:', msg.type, err);
    }
  });
  ws.on('close', () => {
    for (const id of ws.rooms) {
      const room = rooms.get(id);
      if (!room) continue;
      room.clients.delete(ws);
      broadcast(room, { type: 'typing', room: id, id: ws.user.id, on: false });
      sendPresence(room);
    }
    ws.rooms.clear();
  });
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

/* =====================================================================
   Boot & shutdown
   ===================================================================== */

async function main() {
  const data = await store.load();
  for (const r of data.rooms) {
    rooms.set(r.id, { ...r, clients: new Set() });
  }
  for (const [userId, list] of Object.entries(data.subs)) {
    subs.set(userId, new Map(list.map((s) => [s.endpoint, s])));
  }
  if (!rooms.has(LOBBY)) createRoom({ id: LOBBY, name: 'ロビー', isPublic: true });
  setupVapid(data.meta);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`chat listening on :${PORT} (store: ${store.kind}, rooms: ${rooms.size})`);
  });
}

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1012, 'restarting');
  server.close();
  try {
    await flush();
  } finally {
    await store.close();
    process.exit(0);
  }
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((err) => {
  console.error('failed to start:', err);
  process.exit(1);
});
