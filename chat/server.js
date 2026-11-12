'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');
const { createStore } = require('./store');
const { preview } = require('./preview');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_MESSAGES = 2000; // kept per room
const PAGE = 60;
const MAX_ROOMS = 1000;
const MAX_SUBS_PER_USER = 10;
const MAX_UPLOAD = 3 * 1024 * 1024;
const MEDIA_BUDGET = (Number(process.env.MEDIA_BUDGET_MB) || (process.env.REDIS_URL ? 12 : 500)) * 1024 * 1024;
const LOBBY = 'lobby';
const REACTIONS = ['💙', '🩵', '👍', '😂', '🥺', '✨'];
const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
// Free (SIL Open Font License) Japanese fonts from Google Fonts, bought with points.
const FONTS = [
  { id: 'zen-maru', name: 'Zen Maru Gothic', family: 'Zen Maru Gothic', price: 300 },
  { id: 'mplus-rounded', name: 'M PLUS Rounded 1c', family: 'M PLUS Rounded 1c', price: 300 },
  { id: 'kosugi-maru', name: 'Kosugi Maru', family: 'Kosugi Maru', price: 300 },
  { id: 'klee', name: 'Klee One', family: 'Klee One', price: 500 },
  { id: 'yomogi', name: 'Yomogi', family: 'Yomogi', price: 500 },
  { id: 'kurenaido', name: 'Zen Kurenaido', family: 'Zen Kurenaido', price: 500 },
  { id: 'mochiy', name: 'Mochiy Pop One', family: 'Mochiy Pop One', price: 800 },
  { id: 'hachimaru', name: 'Hachi Maru Pop', family: 'Hachi Maru Pop', price: 800 },
  { id: 'yusei', name: 'Yusei Magic', family: 'Yusei Magic', price: 800 },
  { id: 'dotgothic', name: 'DotGothic16', family: 'DotGothic16', price: 800 },
  { id: 'shippori', name: 'Shippori Mincho', family: 'Shippori Mincho', price: 1000 },
  { id: 'kaisei', name: 'Kaisei Decol', family: 'Kaisei Decol', price: 1000 },
  { id: 'rocknroll', name: 'RocknRoll One', family: 'RocknRoll One', price: 1200 },
  { id: 'reggae', name: 'Reggae One', family: 'Reggae One', price: 1500 },
  { id: 'dela', name: 'Dela Gothic One', family: 'Dela Gothic One', price: 1500 },
  { id: 'rampart', name: 'Rampart One', family: 'Rampart One', price: 1500 },
];
const FONT_BY_ID = new Map(FONTS.map((f) => [f.id, f]));
const POINTS_PER_MESSAGE_MAX = 100;
const MEDIA_TYPES = {
  image: ['image/jpeg', 'image/webp', 'image/png', 'image/gif'],
  avatar: ['image/jpeg', 'image/webp', 'image/png'],
  audio: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'],
};

/* =====================================================================
   State & persistence
   ===================================================================== */

const users = new Map(); // id -> { id, name, blocks: [], createdAt }
const rooms = new Map(); // id -> room (runtime: clients, msgs, call)
const subs = new Map(); // userId -> Map(endpoint -> subscription)
const media = new Map(); // mediaId -> { type, kind, size, ts, room, by }
const transfers = new Map(); // code -> { uid, name, exp }
const store = createStore();

const dirty = { rooms: new Set(), deletedRooms: new Set(), messages: new Map(), deletedMessages: [], users: new Set(), subs: new Set(), meta: {} };
let flushTimer = null;
let flushing = Promise.resolve();

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flush, 800);
}
const markRoom = (room) => { dirty.rooms.add(room.id); dirty.deletedRooms.delete(room.id); scheduleFlush(); };
const markMsg = (room, msg) => { dirty.messages.set(`${room.id}\n${msg.id}`, { room: room.id, msg }); scheduleFlush(); };
const markUser = (user) => { dirty.users.add(user.id); scheduleFlush(); };
const markSubs = (userId) => { dirty.subs.add(userId); scheduleFlush(); };

function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (movedTo) return flushing; // a newer service owns the store now
  const batch = {
    rooms: [...dirty.rooms].map((id) => rooms.get(id)).filter(Boolean).map(serializeRoom),
    deletedRooms: [...dirty.deletedRooms],
    messages: [...dirty.messages.values()].filter((m) => rooms.has(m.room)),
    deletedMessages: dirty.deletedMessages,
    users: [...dirty.users].map((id) => users.get(id)).filter(Boolean),
    subs: Object.fromEntries([...dirty.subs].map((u) => [u, [...(subs.get(u)?.values() || [])]])),
    meta: dirty.meta,
  };
  dirty.rooms = new Set();
  dirty.deletedRooms = new Set();
  dirty.messages = new Map();
  dirty.deletedMessages = [];
  dirty.users = new Set();
  dirty.subs = new Set();
  dirty.meta = {};
  flushing = flushing
    .then(() => store.write(batch))
    .catch((err) => {
      console.error('[store] write failed, will retry:', err.message);
      for (const r of batch.rooms) dirty.rooms.add(r.id);
      for (const id of batch.deletedRooms) dirty.deletedRooms.add(id);
      for (const m of batch.messages) if (!dirty.messages.has(`${m.room}\n${m.msg.id}`)) dirty.messages.set(`${m.room}\n${m.msg.id}`, m);
      dirty.deletedMessages.push(...batch.deletedMessages);
      for (const u of batch.users) dirty.users.add(u.id);
      for (const u of Object.keys(batch.subs)) dirty.subs.add(u);
      dirty.meta = { ...batch.meta, ...dirty.meta };
      setTimeout(scheduleFlush, 4000);
    });
  return flushing;
}

function serializeRoom(room) {
  const { clients, msgs, call, ...data } = room;
  return data;
}

function createRoom(fields) {
  const room = {
    id: fields.id,
    kind: fields.kind || 'group',
    name: fields.name || '',
    isPublic: !!fields.isPublic,
    pass: fields.pass || null,
    owner: fields.owner || null,
    admins: [],
    banned: [],
    createdAt: Date.now(),
    lastTs: Date.now(),
    members: {},
    clients: new Set(),
    msgs: [],
    call: new Map(),
  };
  rooms.set(room.id, room);
  markRoom(room);
  return room;
}

function deleteRoom(room) {
  rooms.delete(room.id);
  dirty.rooms.delete(room.id);
  dirty.deletedRooms.add(room.id);
  dropMedia(room.msgs.filter((m) => m.media).map((m) => m.media.id));
  scheduleFlush();
}

function dropMedia(ids) {
  const list = ids.filter((id) => media.delete(id));
  if (list.length) store.delMedia(list).catch((err) => console.error('[media] delete failed:', err.message));
}

/* ---------- passwords (scrypt) ---------- */

function hashPass(pass) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('base64')}:${crypto.scryptSync(pass, salt, 32).toString('base64')}`;
}
function checkPass(pass, stored) {
  if (typeof pass !== 'string' || !pass) return false;
  const [salt, hash] = stored.split(':').map((s) => Buffer.from(s, 'base64'));
  return crypto.timingSafeEqual(crypto.scryptSync(pass.slice(0, 64), salt, 32), hash);
}

const userIdOf = (uid) => crypto.createHash('sha256').update(uid).digest('hex').slice(0, 16);
const nameOf = (id) => users.get(id)?.name || '退出したユーザー';
// Public face of a user: what other people see next to their messages.
function face(id) {
  const u = users.get(id);
  return { id, name: u?.name || '退出したユーザー', font: u?.font || null, avatar: u?.avatar || null };
}
const me = (user) => ({
  ...face(user.id), blocks: user.blocks, points: user.points || 0, fonts: user.fonts || [], earned: user.earned || 0,
});

/* ---------- web push ---------- */

let vapidPublic = null;

/* ---------- moving to a new URL ----------
   The service with CANONICAL=1 records its public URL in the shared store.
   Any other service on the same store then stops writing and sends its
   visitors (with their identity) to that URL. */
const OWN_URL = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
let movedTo = null;

async function announceCanonical() {
  if (!process.env.CANONICAL || !OWN_URL) return;
  dirty.meta.canonical = OWN_URL;
  scheduleFlush();
}
async function checkMoved() {
  if (process.env.CANONICAL || movedTo) return;
  try {
    const url = await store.getMeta('canonical');
    if (url && url !== OWN_URL) {
      movedTo = url;
      console.log(`[moved] this service is replaced by ${url}; redirecting clients and no longer writing`);
      for (const c of wss.clients) send(c, { type: 'moved', url });
    }
  } catch { /* try again later */ }
}

function setupVapid(meta) {
  let pub;
  let priv;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    pub = process.env.VAPID_PUBLIC_KEY;
    priv = process.env.VAPID_PRIVATE_KEY;
  } else if (meta.vapid) {
    // Keys already in the shared store win, so a new service keeps existing subscriptions working.
    ({ publicKey: pub, privateKey: priv } = meta.vapid);
  } else if (process.env.SECRET) {
    // Deterministic keys from a stable secret, saved so other services on the same store reuse them.
    const d = crypto.createHash('sha256').update(`vapid:${process.env.SECRET}`).digest();
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    pub = ecdh.getPublicKey().toString('base64url');
    priv = d.toString('base64url');
    dirty.meta.vapid = { publicKey: pub, privateKey: priv };
    scheduleFlush();
  } else {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey;
    priv = keys.privateKey;
    dirty.meta.vapid = keys;
    scheduleFlush();
  }
  const subject = process.env.VAPID_SUBJECT || (OWN_URL.startsWith('https://') ? OWN_URL : 'mailto:noreply@example.com');
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
  for (const [other, m] of subs) if (other !== userId && m.delete(sub.endpoint)) markSubs(other);
  map.delete(sub.endpoint);
  map.set(sub.endpoint, sub);
  while (map.size > MAX_SUBS_PER_USER) map.delete(map.keys().next().value);
  markSubs(userId);
}
function removeSub(endpoint) {
  for (const [userId, map] of subs) if (map.delete(endpoint)) markSubs(userId);
}

function pushTo(userId, payload, topic) {
  const list = subs.get(userId);
  if (!vapidPublic || !list || !list.size) return;
  const body = JSON.stringify(payload);
  for (const sub of list.values()) {
    webpush
      .sendNotification(sub, body, { TTL: 6 * 3600, urgency: 'high', topic: topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) })
      .catch((err) => {
        if (err.statusCode === 404 || err.statusCode === 410) removeSub(sub.endpoint);
        else console.error('[push]', err.statusCode || '', err.body || err.message);
      });
  }
}

const isWatching = (room, userId) => [...room.clients].some((c) => c.user.id === userId && c.active === room.id && c.visible);
const inForeground = (userId) => [...wss.clients].some((c) => c.user?.id === userId && c.visible);
const blocks = (userId, otherId) => !!users.get(userId)?.blocks?.includes(otherId);

function previewText(m) {
  if (m.deleted) return 'メッセージの送信を取り消しました';
  if (m.sticker) return 'スタンプ';
  if (m.media?.kind === 'image') return m.text ? `📷 ${m.text}` : '📷 写真';
  if (m.media?.kind === 'audio') return '🎤 音声メッセージ';
  return m.text;
}

function notifyMessage(room, m) {
  const sender = nameOf(m.from.id);
  const title = room.kind === 'dm' ? sender : room.name;
  const text = [...previewText(m)].slice(0, 140).join('');
  for (const [userId, member] of Object.entries(room.members)) {
    if (userId === m.from.id || blocks(userId, m.from.id) || inForeground(userId)) continue;
    const mentioned = m.mentions?.includes(userId);
    if (member.muted && !mentioned) continue;
    pushTo(userId, {
      title: mentioned && room.kind !== 'dm' ? `${room.name} ・ あなたへのメンション` : title,
      body: room.kind === 'dm' ? text : `${sender}: ${text}`,
      room: room.id,
      ts: m.ts,
    }, room.id);
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
  '/vendor/jsqr.js': path.join(__dirname, 'node_modules', 'jsqr', 'dist', 'jsQR.js'),
};
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('too large'), { code: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const uploads = new Map(); // userId -> { count, since }
function uploadAllowed(userId) {
  const now = Date.now();
  const u = uploads.get(userId);
  if (!u || now - u.since > 60000) {
    uploads.set(userId, { count: 1, since: now });
    return true;
  }
  return ++u.count <= 20;
}

async function handleUpload(req, res, url) {
  const json = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  const uid = String(req.headers['x-lynq-uid'] || '');
  const userId = uid.length >= 16 ? userIdOf(uid) : null;
  const room = rooms.get(url.searchParams.get('room') || '');
  const kind = url.searchParams.get('kind');
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!userId || !users.has(userId)) return json(401, { error: 'auth' });
  if (kind !== 'avatar' && (!room || !room.members[userId])) return json(403, { error: 'room' });
  if (!MEDIA_TYPES[kind]?.includes(type)) return json(415, { error: 'type' });
  if (!uploadAllowed(userId)) return json(429, { error: 'rate' });
  let buf;
  try {
    buf = await readBody(req, MAX_UPLOAD);
  } catch (err) {
    return json(err.code === 413 ? 413 : 400, { error: 'body' });
  }
  if (!buf.length || (kind === 'avatar' && buf.length > 300 * 1024)) return json(400, { error: 'size' });
  const id = crypto.randomBytes(12).toString('base64url');
  const info = { type, kind, size: buf.length, ts: Date.now(), room: room?.id || null, by: userId };
  try {
    await store.putMedia(id, buf, info);
  } catch (err) {
    console.error('[media] store failed:', err.message);
    return json(507, { error: 'storage' });
  }
  media.set(id, info);
  enforceMediaBudget();
  json(200, { id });
}

// Keep stored media under budget by dropping the oldest files first.
function enforceMediaBudget() {
  let total = 0;
  for (const m of media.values()) if (m.kind !== 'avatar') total += m.size;
  if (total <= MEDIA_BUDGET) return;
  const drop = [];
  for (const [id, m] of [...media].sort((a, b) => a[1].ts - b[1].ts)) {
    if (m.kind === 'avatar') continue; // icons are small and always kept
    if (total <= MEDIA_BUDGET * 0.9) break;
    total -= m.size;
    drop.push(id);
  }
  dropMedia(drop);
}

async function serveMedia(req, res, id) {
  const info = media.get(id);
  const buf = info && (await store.getMedia(id).catch(() => null));
  if (!buf) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('gone');
  }
  const headers = {
    'content-type': info.type,
    'cache-control': 'private, max-age=31536000, immutable',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  };
  // Safari only plays audio served with byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    let start = range[1] === '' ? buf.length - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : buf.length - 1;
    start = Math.max(0, start);
    end = Math.min(end, buf.length - 1);
    if (start > end) {
      res.writeHead(416, { 'content-range': `bytes */${buf.length}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${buf.length}`, 'content-length': end - start + 1 });
    return res.end(req.method === 'HEAD' ? undefined : buf.subarray(start, end + 1));
  }
  res.writeHead(200, { ...headers, 'content-length': buf.length });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

const server = http.createServer(async (req, res) => {
  const end = (code, body = '') => {
    res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(body);
  };
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
    url.pathname = decodeURIComponent(url.pathname);
  } catch {
    return end(400, 'bad request');
  }
  let pathname = url.pathname;

  if (pathname === '/healthz') return end(200, 'ok');
  if (pathname === '/api/media' && req.method === 'POST') return handleUpload(req, res, url);
  if (pathname.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) return serveMedia(req, res, pathname.slice(7));

  // Called by the service worker when the browser rotates a push subscription.
  if (pathname === '/api/push/renew' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req, 8192)).toString('utf8'));
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
    if (ext === '.html') {
      headers['content-security-policy'] = CSP;
      headers['permissions-policy'] = 'camera=(self), microphone=(self)';
    }
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

/* =====================================================================
   Chat
   ===================================================================== */

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
  for (const c of room.clients) if (c !== except && c.readyState === c.OPEN) c.send(data);
}
const socketsOf = (userId) => [...wss.clients].filter((c) => c.user && c.user.id === userId);

function online(room) {
  const seen = new Map();
  for (const c of room.clients) if (c.user) seen.set(c.user.id, face(c.user.id));
  return [...seen.values()];
}

const isAdmin = (room, userId) => room.owner === userId || room.admins.includes(userId);

function roomName(room, userId) {
  if (room.kind !== 'dm') return room.name;
  return nameOf(Object.keys(room.members).find((id) => id !== userId) || room.dm?.find((id) => id !== userId));
}

function lastOf(room) {
  for (let i = room.msgs.length - 1; i >= 0; i--) {
    const m = room.msgs[i];
    if (!m.sys) return { name: nameOf(m.from.id), text: [...previewText(m)].slice(0, 60).join(''), ts: m.ts };
  }
  return null;
}

function summary(room, userId) {
  const member = room.members[userId];
  let unread = 0;
  if (member) {
    for (let i = room.msgs.length - 1; i >= 0; i--) {
      const m = room.msgs[i];
      if (m.ts <= member.read) break;
      if (!m.sys && !m.deleted && m.from.id !== userId && !blocks(userId, m.from.id)) unread++;
    }
  }
  const peer = room.kind === 'dm' ? room.dm.find((id) => id !== userId) : null;
  return {
    id: room.id,
    kind: room.kind,
    name: roomName(room, userId),
    peer,
    avatar: room.kind === 'dm' ? face(peer).avatar : room.avatar || null,
    allowEdit: room.allowEdit !== false,
    allowUnsend: room.allowUnsend !== false,
    isPublic: room.isPublic,
    locked: !!room.pass,
    owner: room.owner === userId,
    admin: isAdmin(room, userId),
    muted: !!member?.muted,
    member: !!member,
    unread,
    last: lastOf(room),
    lastTs: room.lastTs,
    members: Object.keys(room.members).length,
    online: online(room).length,
    call: room.call.size,
  };
}

// Messages carry the sender's current name.
const out = (m) => (m.sys ? m : { ...m, from: face(m.from.id) });
const reads = (room) => Object.fromEntries(Object.entries(room.members).map(([id, m]) => [id, m.read]));

function allow(ws, cost = 1) {
  const now = Date.now();
  ws.tokens = Math.min(12, ws.tokens + (now - ws.lastRefill) / 500);
  ws.lastRefill = now;
  if (ws.tokens < cost) return false;
  ws.tokens -= cost;
  return true;
}

function pushMessage(room, m) {
  room.msgs.push(m);
  room.lastTs = m.ts;
  markMsg(room, m);
  markRoom(room);
  while (room.msgs.length > MAX_MESSAGES) {
    const old = room.msgs.shift();
    dirty.deletedMessages.push({ room: room.id, id: old.id });
    if (old.media) dropMedia([old.media.id]);
  }
}

function systemMessage(room, text, extra) {
  const m = { id: crypto.randomUUID(), sys: true, text, ts: Date.now(), ...extra };
  pushMessage(room, m);
  broadcast(room, { type: 'msg', room: room.id, message: m });
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
    .filter((r) => r.isPublic && r.kind === 'group' && !r.banned.includes(ws.user.id))
    .map((r) => summary(r, ws.user.id))
    .sort((a, b) => b.online - a.online || b.lastTs - a.lastTs)
    .slice(0, 60);
  send(ws, { type: 'explore', rooms: list });
}

function subscribe(ws, room) {
  room.clients.add(ws);
  ws.rooms.add(room.id);
}
function unsubscribe(ws, room) {
  leaveCall(ws, room);
  room.clients.delete(ws);
  ws.rooms.delete(room.id);
  if (ws.active === room.id) ws.active = null;
}

function memberRoom(ws, id) {
  if (typeof id !== 'string') return null;
  const room = rooms.get(id);
  return room && room.members[ws.user.id] ? room : null;
}

function refreshFor(room, userId) {
  for (const s of socketsOf(userId)) {
    subscribe(s, room);
    send(s, { type: 'room', room: summary(room, userId) });
  }
}

function addMember(room, user) {
  room.members[user.id] = { read: Date.now(), muted: false, joinedAt: Date.now() };
  markRoom(room);
  refreshFor(room, user.id);
  if (room.kind === 'group') systemMessage(room, `${user.name}さんが参加しました`);
  sendPresence(room);
  if (room.isPublic) exploreChanged();
}

function removeMember(room, userId, reason) {
  delete room.members[userId];
  room.admins = room.admins.filter((id) => id !== userId);
  for (const s of socketsOf(userId)) {
    unsubscribe(s, room);
    send(s, { type: 'removed', room: room.id, reason });
  }
  if (room.id !== LOBBY && Object.keys(room.members).length === 0) deleteRoom(room);
  else {
    markRoom(room);
    sendPresence(room);
  }
  if (room.isPublic) exploreChanged();
}

function mentionsIn(room, text) {
  if (!text.includes('@')) return [];
  const found = [];
  for (const id of Object.keys(room.members)) {
    const name = nameOf(id);
    if (name && text.includes(`@${name}`)) found.push(id);
  }
  return found;
}

/* ---------- calls (signaling only; media is peer to peer) ---------- */

function iceServers() {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URLS) {
    list.push({
      urls: process.env.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    });
  }
  return list;
}

function sendYou(user) {
  for (const s of socketsOf(user.id)) send(s, { type: 'you', you: me(user), blocks: user.blocks });
}
// Tell everyone who shares a room with this user about their new look.
function profileChanged(userId) {
  const f = face(userId);
  const seen = new Set();
  for (const room of rooms.values()) {
    if (!room.members[userId]) continue;
    for (const c of room.clients) {
      if (seen.has(c)) continue;
      seen.add(c);
      send(c, { type: 'profile', user: f });
    }
    if (room.kind === 'dm') for (const id of room.dm) for (const s of socketsOf(id)) send(s, { type: 'room', room: summary(room, id) });
  }
}

const callPeers = (room) => [...room.call.values()].map(({ id, name, since, cam, mic }) => ({ id, name, since, cam, mic }));
function broadcastCall(room) {
  broadcast(room, { type: 'call', room: room.id, peers: callPeers(room), startedAt: room.callStarted || null });
  for (const id of Object.keys(room.members)) for (const s of socketsOf(id)) send(s, { type: 'room', room: summary(room, id) });
}

function leaveCall(ws, room) {
  const p = room.call.get(ws.user?.id);
  if (!p || p.ws !== ws) return;
  room.call.delete(ws.user.id);
  for (const other of room.call.values()) send(other.ws, { type: 'signal', room: room.id, from: ws.user.id, data: { bye: true } });
  if (room.call.size === 0) {
    const mins = Math.max(1, Math.round((Date.now() - room.callStarted) / 60000));
    room.callStarted = null;
    systemMessage(room, `通話が終了しました（${mins}分）`, { call: 'end' });
  }
  broadcastCall(room);
}

/* ---------- handlers ---------- */

const handlers = {
  hello(ws, msg) {
    if (movedTo) return send(ws, { type: 'moved', url: movedTo });
    const name = clean(msg.name, 20);
    const uid = clean(msg.uid, 64);
    if (!name || uid.length < 16) return send(ws, { type: 'error', code: 'invalid' });
    const id = userIdOf(uid);
    let user = users.get(id);
    if (!user) {
      user = { id, name, blocks: [], points: 0, fonts: [], font: null, avatar: null, createdAt: Date.now() };
      users.set(id, user);
      markUser(user);
    } else if (user.name !== name) {
      user.name = name;
      markUser(user);
    }
    ws.user = { id, name };
    const mine = [];
    for (const room of rooms.values()) {
      if (!room.members[id]) continue;
      subscribe(ws, room);
      mine.push(summary(room, id));
    }
    send(ws, {
      type: 'ready', you: me(user), blocks: user.blocks, rooms: mine, shop: { fonts: FONTS },
      reactions: REACTIONS, vapid: vapidPublic, ice: iceServers(),
    });
    for (const rid of ws.rooms) sendPresence(rooms.get(rid));
  },

  // Account transfer: the old device asks for a short code that hands its secret to a new device.
  transfer(ws, msg) {
    if (typeof msg.uid !== 'string' || userIdOf(msg.uid) !== ws.user.id || !allow(ws, 3)) return;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do code = Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
    while (transfers.has(code));
    const exp = Date.now() + 10 * 60 * 1000;
    transfers.set(code, { uid: msg.uid, name: ws.user.name, exp });
    send(ws, { type: 'transfer', code, exp });
  },
  redeem(ws, msg) {
    if (!allow(ws, 3)) return send(ws, { type: 'error', code: 'rate', op: 'redeem' });
    const code = clean(msg.code, 16).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const t = transfers.get(code);
    if (!t || t.exp < Date.now()) {
      transfers.delete(code);
      return send(ws, { type: 'error', code: 'notfound', op: 'redeem' });
    }
    transfers.delete(code);
    send(ws, { type: 'redeemed', uid: t.uid, name: nameOf(userIdOf(t.uid)) || t.name });
  },

  rename(ws, msg) {
    const name = clean(msg.name, 20);
    if (!name || !allow(ws)) return;
    const user = users.get(ws.user.id);
    user.name = name;
    markUser(user);
    for (const s of socketsOf(ws.user.id)) {
      s.user = { ...s.user, name };
      send(s, { type: 'you', you: me(user), blocks: user.blocks });
    }
    for (const rid of ws.rooms) sendPresence(rooms.get(rid));
    profileChanged(ws.user.id);
  },

  buy(ws, msg) {
    const font = FONT_BY_ID.get(msg.font);
    const user = users.get(ws.user.id);
    if (!font || !allow(ws)) return;
    user.fonts = user.fonts || [];
    if (user.fonts.includes(font.id)) return sendYou(user);
    if ((user.points || 0) < font.price) return send(ws, { type: 'error', code: 'points', op: 'buy' });
    user.points -= font.price;
    user.fonts.push(font.id);
    markUser(user);
    sendYou(user);
    send(ws, { type: 'bought', font: font.id });
  },

  equip(ws, msg) {
    const user = users.get(ws.user.id);
    const id = msg.font == null ? null : String(msg.font);
    if (id && !(user.fonts || []).includes(id)) return;
    user.font = id;
    markUser(user);
    sendYou(user);
    profileChanged(user.id);
  },

  avatar(ws, msg) {
    const user = users.get(ws.user.id);
    const id = msg.media == null ? null : String(msg.media);
    if (id) {
      const info = media.get(id);
      if (!info || info.kind !== 'avatar' || info.by !== user.id) return;
    }
    if (user.avatar && user.avatar !== id) dropMedia([user.avatar]);
    user.avatar = id;
    markUser(user);
    sendYou(user);
    profileChanged(user.id);
  },

  roomSettings(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room || room.kind !== 'group' || !isAdmin(room, ws.user.id)) return;
    if ('avatar' in msg) {
      const id = msg.avatar == null ? null : String(msg.avatar);
      if (id) {
        const info = media.get(id);
        if (!info || info.kind !== 'avatar' || info.by !== ws.user.id) return;
      }
      if (room.avatar && room.avatar !== id) dropMedia([room.avatar]);
      room.avatar = id;
    }
    if ('allowEdit' in msg) room.allowEdit = !!msg.allowEdit;
    if ('allowUnsend' in msg) room.allowUnsend = !!msg.allowUnsend;
    if (typeof msg.name === 'string') {
      const name = clean(msg.name, 30);
      if (name && name !== room.name) {
        room.name = name;
        systemMessage(room, `${ws.user.name}さんがルーム名を「${name}」に変更しました`);
      }
    }
    markRoom(room);
    for (const id of Object.keys(room.members)) for (const s of socketsOf(id)) send(s, { type: 'room', room: summary(room, id) });
    if (room.isPublic) exploreChanged();
  },

  block(ws, msg) {
    if (typeof msg.user !== 'string' || msg.user === ws.user.id || !users.has(msg.user)) return;
    const user = users.get(ws.user.id);
    user.blocks = user.blocks.filter((id) => id !== msg.user);
    if (msg.on) user.blocks.push(msg.user);
    markUser(user);
    sendYou(user);
  },

  create(ws, msg) {
    const name = clean(msg.name, 30);
    const pass = clean(msg.pass, 32);
    if (!name) return send(ws, { type: 'error', code: 'invalid', op: 'create' });
    if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'error', code: 'full', op: 'create' });
    if (!allow(ws, 4)) return send(ws, { type: 'error', code: 'rate', op: 'create' });
    let id;
    do id = crypto.randomBytes(6).toString('base64url');
    while (rooms.has(id));
    const room = createRoom({ id, name, isPublic: !!msg.isPublic, pass: pass ? hashPass(pass) : null, owner: ws.user.id });
    room.members[ws.user.id] = { read: Date.now(), muted: false, joinedAt: Date.now() };
    refreshFor(room, ws.user.id);
    systemMessage(room, `${ws.user.name}さんが「${name}」を作成しました`);
    send(ws, { type: 'created', room: id });
    if (room.isPublic) exploreChanged();
  },

  dm(ws, msg) {
    const other = typeof msg.user === 'string' ? users.get(msg.user) : null;
    if (!other || other.id === ws.user.id || !allow(ws, 2)) return send(ws, { type: 'error', code: 'invalid', op: 'dm' });
    const pair = [ws.user.id, other.id].sort();
    const id = `dm${crypto.createHash('sha256').update(pair.join(':')).digest('base64url').slice(0, 14)}`;
    let room = rooms.get(id);
    if (!room) {
      room = createRoom({ id, kind: 'dm' });
      room.dm = pair;
    }
    for (const uid of pair) {
      if (!room.members[uid]) room.members[uid] = { read: Date.now(), muted: false, joinedAt: Date.now() };
    }
    markRoom(room);
    for (const uid of pair) refreshFor(room, uid);
    sendPresence(room);
    send(ws, { type: 'created', room: id, dm: true });
  },

  peek(ws, msg) {
    const room = typeof msg.room === 'string' && ID_RE.test(msg.room) ? rooms.get(msg.room) : null;
    const visible = room && room.kind === 'group';
    send(ws, { type: 'peek', id: msg.room, room: visible ? summary(room, ws.user.id) : null });
  },

  join(ws, msg) {
    if (typeof msg.room !== 'string') return;
    const room = rooms.get(msg.room);
    if (!room || room.kind !== 'group') return send(ws, { type: 'error', code: 'notfound', op: 'join', room: msg.room });
    if (room.members[ws.user.id]) return send(ws, { type: 'joined', room: room.id });
    if (room.banned.includes(ws.user.id)) return send(ws, { type: 'error', code: 'banned', op: 'join', room: room.id });
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
    const start = Math.max(0, room.msgs.length - PAGE);
    send(ws, {
      type: 'history', room: room.id, messages: room.msgs.slice(start).map(out), more: start > 0,
      online: online(room), reads: reads(room), summary: summary(room, ws.user.id),
      call: { peers: callPeers(room), startedAt: room.callStarted || null },
    });
  },

  older(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    const idx = room.msgs.findIndex((m) => m.id === msg.before);
    const endAt = idx < 0 ? room.msgs.length : idx;
    const start = Math.max(0, endAt - PAGE);
    send(ws, { type: 'older', room: room.id, messages: room.msgs.slice(start, endAt).map(out), more: start > 0 });
  },

  jump(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    const idx = room.msgs.findIndex((m) => m.id === msg.id);
    if (idx < 0) return send(ws, { type: 'error', code: 'notfound', op: 'jump', room: room.id });
    const start = Math.max(0, idx - 15);
    send(ws, {
      type: 'history', room: room.id, messages: room.msgs.slice(start).map(out), more: start > 0, jump: msg.id,
      online: online(room), reads: reads(room), summary: summary(room, ws.user.id),
      call: { peers: callPeers(room), startedAt: room.callStarted || null },
    });
  },

  search(ws, msg) {
    const room = memberRoom(ws, msg.room);
    const q = clean(msg.q, 50).toLowerCase();
    if (!room || !q || !allow(ws, 0.5)) return;
    const results = [];
    for (let i = room.msgs.length - 1; i >= 0 && results.length < 40; i--) {
      const m = room.msgs[i];
      if (m.sys || m.deleted || !m.text) continue;
      if (m.text.toLowerCase().includes(q) || nameOf(m.from.id).toLowerCase().includes(q)) {
        results.push({ id: m.id, name: nameOf(m.from.id), from: m.from.id, text: [...m.text].slice(0, 120).join(''), ts: m.ts });
      }
    }
    send(ws, { type: 'search', room: room.id, q: msg.q, results });
  },

  members(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    const on = new Set(online(room).map((u) => u.id));
    const role = (id) => (room.owner === id ? 'owner' : room.admins.includes(id) ? 'admin' : 'member');
    const order = { owner: 0, admin: 1, member: 2 };
    const list = Object.entries(room.members)
      .map(([id, m]) => ({ ...face(id), role: role(id), online: on.has(id), joinedAt: m.joinedAt }))
      .sort((a, b) => order[a.role] - order[b.role] || b.online - a.online || a.name.localeCompare(b.name, 'ja'));
    send(ws, { type: 'members', room: room.id, list, banned: isAdmin(room, ws.user.id) ? room.banned.map((id) => ({ id, name: nameOf(id) })) : [] });
  },

  kick(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room || room.kind !== 'group' || !isAdmin(room, ws.user.id)) return;
    const target = msg.user;
    if (typeof target !== 'string' || target === ws.user.id || target === room.owner) return;
    if (room.admins.includes(target) && room.owner !== ws.user.id) return;
    if (msg.ban && !room.banned.includes(target)) room.banned.push(target);
    if (room.members[target]) {
      systemMessage(room, `${nameOf(target)}さんが${msg.ban ? 'ルームから追放されました' : '退出させられました'}`);
      removeMember(room, target, msg.ban ? 'banned' : 'kicked');
    } else markRoom(room);
    handlers.members(ws, { room: room.id });
  },

  unban(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room || !isAdmin(room, ws.user.id)) return;
    room.banned = room.banned.filter((id) => id !== msg.user);
    markRoom(room);
    handlers.members(ws, { room: room.id });
  },

  promote(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room || room.owner !== ws.user.id || !room.members[msg.user] || msg.user === room.owner) return;
    room.admins = room.admins.filter((id) => id !== msg.user);
    if (msg.on) room.admins.push(msg.user);
    markRoom(room);
    systemMessage(room, `${nameOf(msg.user)}さんが管理者${msg.on ? 'になりました' : 'ではなくなりました'}`);
    refreshFor(room, msg.user);
    handlers.members(ws, { room: room.id });
  },

  leave(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    const name = ws.user.name;
    if (room.kind === 'group') systemMessage(room, `${name}さんが退出しました`);
    if (room.owner === ws.user.id && room.admins.length) {
      room.owner = room.admins.shift(); // hand the room over to an admin
    }
    removeMember(room, ws.user.id, 'left');
  },

  delete(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room || room.owner !== ws.user.id || room.id === LOBBY) return;
    broadcast(room, { type: 'removed', room: room.id, reason: 'deleted' });
    for (const c of [...room.clients]) unsubscribe(c, room);
    deleteRoom(room);
    if (room.isPublic) exploreChanged();
  },

  msg(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    const text = clean(msg.text, 2000, true);
    const cid = clean(msg.cid, 40);
    let attach = null;
    if (msg.media && typeof msg.media.id === 'string') {
      const info = media.get(msg.media.id);
      if (!info || info.by !== ws.user.id || info.room !== room.id) return send(ws, { type: 'error', code: 'media', op: 'msg', room: room.id, cid });
      const num = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
      attach = { id: msg.media.id, kind: info.kind, type: info.type, w: num(msg.media.w, 10000), h: num(msg.media.h, 10000), dur: num(msg.media.dur, 600) };
      if (info.kind === 'audio' && Array.isArray(msg.media.peaks)) attach.peaks = msg.media.peaks.slice(0, 64).map((v) => num(v, 100));
    }
    if (!text && !attach) return;
    if (!allow(ws)) return send(ws, { type: 'error', code: 'rate', op: 'msg', room: room.id, cid });
    if (room.kind === 'dm' && room.dm.some((id) => id !== ws.user.id && blocks(id, ws.user.id))) {
      return send(ws, { type: 'error', code: 'blocked', op: 'msg', room: room.id, cid });
    }

    let replyTo = null;
    if (typeof msg.replyTo === 'string') {
      const t = room.msgs.find((m) => m.id === msg.replyTo && !m.sys && !m.deleted);
      if (t) replyTo = { id: t.id, name: nameOf(t.from.id), text: [...previewText(t)].slice(0, 80).join('') };
    }
    const m = { id: crypto.randomUUID(), from: { id: ws.user.id }, text, ts: Date.now(), replyTo, reactions: {} };
    if (attach) m.media = attach;
    const mentions = room.kind === 'group' ? mentionsIn(room, m.text) : [];
    if (mentions.length) m.mentions = mentions;
    pushMessage(room, m);
    room.members[ws.user.id].read = m.ts;
    // Points: one per character typed (spaces don't count), capped per message.
    const chars = [...text.replace(/\s/g, '')].length;
    if (chars >= 2) {
      const user = users.get(ws.user.id);
      const gain = Math.min(chars, POINTS_PER_MESSAGE_MAX);
      user.points = (user.points || 0) + gain;
      user.earned = (user.earned || 0) + gain;
      markUser(user);
      for (const s of socketsOf(user.id)) send(s, { type: 'points', points: user.points, gain });
    }

    broadcast(room, { type: 'msg', room: room.id, message: out(m) }, ws);
    send(ws, { type: 'msg', room: room.id, message: out(m), cid });
    notifyMessage(room, m);
    if (room.isPublic) exploreChanged();

    const link = m.text.match(/https?:\/\/[^\s<>"']+/)?.[0];
    if (link) {
      preview(link).then((data) => {
        if (!data || m.deleted || !rooms.has(room.id)) return;
        m.preview = data;
        markMsg(room, m);
        broadcast(room, { type: 'update', room: room.id, message: out(m) });
      });
    }
  },

  edit(ws, msg) {
    const room = memberRoom(ws, msg.room);
    const m = room?.msgs.find((x) => x.id === msg.id);
    const text = clean(msg.text, 2000, true);
    if (!m || m.sys || m.deleted || m.sticker || m.from.id !== ws.user.id || !allow(ws)) return;
    if (room.allowEdit === false && !isAdmin(room, ws.user.id)) return send(ws, { type: 'error', code: 'forbidden', op: 'edit', room: room.id });
    if (!text && !m.media) return;
    m.text = text;
    m.edited = Date.now();
    m.mentions = room.kind === 'group' ? mentionsIn(room, text) : [];
    if (!m.mentions.length) delete m.mentions;
    markMsg(room, m);
    broadcast(room, { type: 'update', room: room.id, message: out(m) });
  },

  unsend(ws, msg) {
    const room = memberRoom(ws, msg.room);
    const m = room?.msgs.find((x) => x.id === msg.id);
    if (!m || m.sys || m.deleted) return;
    const mine = m.from.id === ws.user.id;
    const admin = room.kind === 'group' && isAdmin(room, ws.user.id);
    if (!mine && !admin) return;
    if (mine && !admin && room.allowUnsend === false) return send(ws, { type: 'error', code: 'forbidden', op: 'unsend', room: room.id });
    if (m.media) dropMedia([m.media.id]);
    Object.assign(m, { deleted: mine ? 'self' : 'admin', text: '', reactions: {} });
    for (const k of ['media', 'sticker', 'preview', 'mentions', 'replyTo', 'edited']) delete m[k];
    markMsg(room, m);
    broadcast(room, { type: 'update', room: room.id, message: out(m) });
  },

  react(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room || !REACTIONS.includes(msg.emoji) || !allow(ws, 0.5)) return;
    const m = room.msgs.find((x) => x.id === msg.id && !x.sys && !x.deleted);
    if (!m) return;
    const list = m.reactions[msg.emoji] || [];
    const i = list.indexOf(ws.user.id);
    if (i >= 0) list.splice(i, 1);
    else list.push(ws.user.id);
    if (list.length) m.reactions[msg.emoji] = list;
    else delete m.reactions[msg.emoji];
    markMsg(room, m);
    broadcast(room, { type: 'react', room: room.id, id: m.id, reactions: m.reactions });
  },

  typing(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (room) broadcast(room, { type: 'typing', room: room.id, id: ws.user.id, name: ws.user.name, on: !!msg.on }, ws);
  },

  read(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    const member = room.members[ws.user.id];
    const ts = Math.min(Number(msg.ts) || 0, Date.now());
    if (ts <= member.read) return;
    member.read = ts;
    markRoom(room);
    broadcast(room, { type: 'read', room: room.id, user: ws.user.id, ts }, ws);
    for (const s of socketsOf(ws.user.id)) if (s !== ws) send(s, { type: 'room', room: summary(room, ws.user.id) });
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
    ws.exploring = !!msg.on;
    if (ws.exploring) sendExplore(ws);
  },

  push(ws, msg) {
    const sub = validSub(msg.sub);
    if (sub) addSub(ws.user.id, sub);
  },
  unpush(ws, msg) {
    if (typeof msg.endpoint === 'string' && subs.get(ws.user.id)?.delete(msg.endpoint)) markSubs(ws.user.id);
  },

  call(ws, msg) {
    const room = memberRoom(ws, msg.room);
    if (!room) return;
    if (msg.action === 'leave') return leaveCall(ws, room);
    if (msg.action === 'state') {
      const p = room.call.get(ws.user.id);
      if (!p || p.ws !== ws) return;
      p.cam = !!msg.cam;
      p.mic = !!msg.mic;
      return broadcastCall(room);
    }
    if (msg.action !== 'join' || !allow(ws, 2)) return;
    const prev = room.call.get(ws.user.id);
    if (prev && prev.ws !== ws) {
      send(prev.ws, { type: 'call-ended', room: room.id, reason: 'elsewhere' });
      leaveCall(prev.ws, room);
    }
    const starting = room.call.size === 0;
    const others = callPeers(room).filter((p) => p.id !== ws.user.id);
    room.call.set(ws.user.id, { id: ws.user.id, name: ws.user.name, since: Date.now(), cam: !!msg.cam, mic: msg.mic !== false, ws });
    if (starting) {
      room.callStarted = Date.now();
      systemMessage(room, `${ws.user.name}さんが通話を開始しました`, { call: 'start' });
      for (const [userId, member] of Object.entries(room.members)) {
        if (userId === ws.user.id || blocks(userId, ws.user.id) || isWatching(room, userId) || member.muted) continue;
        pushTo(userId, {
          title: room.kind === 'dm' ? ws.user.name : room.name,
          body: `📞 ${ws.user.name}さんが通話を開始しました`,
          room: room.id, ts: Date.now(), call: true,
        }, `${room.id}c`);
      }
    }
    send(ws, { type: 'call-joined', room: room.id, peers: others, ice: iceServers() });
    broadcastCall(room);
  },

  signal(ws, msg) {
    const room = memberRoom(ws, msg.room);
    const me = room?.call.get(ws.user.id);
    const target = room?.call.get(msg.to);
    if (!me || me.ws !== ws || !target || !msg.data || typeof msg.data !== 'object') return;
    send(target.ws, { type: 'signal', room: room.id, from: ws.user.id, name: ws.user.name, data: msg.data });
  },
};

const PRE_HELLO = new Set(['hello', 'redeem']);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 96 * 1024 });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.user = null;
  ws.rooms = new Set();
  ws.active = null;
  ws.visible = false;
  ws.exploring = false;
  ws.tokens = 12;
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
    if (!handler || (!PRE_HELLO.has(msg.type) && !ws.user)) return;
    if (movedTo && msg.type !== 'hello') return send(ws, { type: 'moved', url: movedTo });
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
      leaveCall(ws, room);
      room.clients.delete(ws);
      broadcast(room, { type: 'typing', room: id, id: ws.user.id, on: false });
      sendPresence(room);
    }
    ws.rooms.clear();
  });
  ws.on('error', () => ws.terminate());
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [code, t] of transfers) if (t.exp < now) transfers.delete(code);
}, 30000);

/* =====================================================================
   Boot & shutdown
   ===================================================================== */

async function main() {
  const data = await store.load();
  for (const u of Object.values(data.users || {})) users.set(u.id, { blocks: [], points: 0, fonts: [], ...u });
  for (const r of data.rooms) {
    // Rooms saved by the previous version keep their messages in `history` and names on members.
    const { history, ...rest } = r;
    const legacy = Array.isArray(history);
    const msgs = (legacy ? history : data.messages[r.id] || []).sort((a, b) => a.ts - b.ts).slice(-MAX_MESSAGES);
    const room = { admins: [], banned: [], kind: 'group', ...rest, clients: new Set(), msgs, call: new Map() };
    rooms.set(r.id, room);
    if (!legacy) continue;
    for (const [id, m] of Object.entries(room.members)) {
      if (!users.has(id)) {
        const user = { id, name: m.name || 'ユーザー', blocks: [], createdAt: m.joinedAt || Date.now() };
        users.set(id, user);
        markUser(user);
      }
      room.members[id] = { read: m.read || 0, muted: !!m.muted, joinedAt: m.joinedAt || Date.now() };
    }
    markRoom(room);
    for (const m of msgs) markMsg(room, m);
  }
  for (const [userId, list] of Object.entries(data.subs || {})) {
    subs.set(userId, new Map(list.map((s) => [s.endpoint, s])));
    if (data.legacy) markSubs(userId);
  }
  for (const [id, info] of Object.entries(data.media || {})) media.set(id, info);
  if (data.legacy && data.meta?.vapid) dirty.meta.vapid = data.meta.vapid;
  if (!rooms.has(LOBBY)) createRoom({ id: LOBBY, name: 'ロビー', isPublic: true });
  setupVapid(data.meta);
  await announceCanonical();
  await checkMoved();
  setInterval(checkMoved, 20000).unref();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`chat listening on :${PORT} (store: ${store.kind}, rooms: ${rooms.size}, users: ${users.size})`);
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
