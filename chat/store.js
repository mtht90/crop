'use strict';

// Persistence. REDIS_URL (Render Key Value, Upstash, ...) when set, otherwise
// JSON + files under DATA_DIR for local use.
//
// Layout (Redis):
//   lq:rooms              set of room ids
//   lq:room:<id>          room JSON (no messages)
//   lq:msgs:<id>          hash  messageId -> message JSON
//   lq:users              hash  userId -> user JSON
//   lq:subs               hash  userId -> [push subscription]
//   lq:meta               hash  key -> JSON
//   lq:media:<id>         binary blob
//   lq:mediaidx           hash  mediaId -> { type, size, ts, room }

const fs = require('fs');
const path = require('path');

const P = 'lq:';

class RedisStore {
  constructor(url) {
    const Redis = require('ioredis');
    this.kind = 'redis';
    this.redis = new Redis(url, { maxRetriesPerRequest: 3, enableAutoPipelining: true });
    this.redis.on('error', (err) => console.error('[store] redis:', err.message));
  }

  async load() {
    const r = this.redis;
    const ids = await r.smembers(`${P}rooms`);
    const raw = ids.length ? await r.mget(ids.map((id) => `${P}room:${id}`)) : [];
    const rooms = raw.filter(Boolean).map((s) => JSON.parse(s));
    const messages = {};
    for (const room of rooms) {
      const all = await r.hvals(`${P}msgs:${room.id}`);
      messages[room.id] = all.map((s) => JSON.parse(s));
    }
    const parseHash = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, JSON.parse(v)]));
    return {
      rooms,
      messages,
      users: parseHash(await r.hgetall(`${P}users`)),
      subs: parseHash(await r.hgetall(`${P}subs`)),
      meta: parseHash(await r.hgetall(`${P}meta`)),
      media: parseHash(await r.hgetall(`${P}mediaidx`)),
    };
  }

  async write(b) {
    const m = this.redis.multi();
    for (const room of b.rooms) {
      m.set(`${P}room:${room.id}`, JSON.stringify(room));
      m.sadd(`${P}rooms`, room.id);
    }
    for (const id of b.deletedRooms) {
      m.del(`${P}room:${id}`, `${P}msgs:${id}`);
      m.srem(`${P}rooms`, id);
    }
    for (const { room, msg } of b.messages) m.hset(`${P}msgs:${room}`, msg.id, JSON.stringify(msg));
    for (const { room, id } of b.deletedMessages) m.hdel(`${P}msgs:${room}`, id);
    for (const user of b.users) m.hset(`${P}users`, user.id, JSON.stringify(user));
    for (const [user, list] of Object.entries(b.subs)) {
      if (list.length) m.hset(`${P}subs`, user, JSON.stringify(list));
      else m.hdel(`${P}subs`, user);
    }
    for (const [key, value] of Object.entries(b.meta)) m.hset(`${P}meta`, key, JSON.stringify(value));
    await m.exec();
  }

  async putMedia(id, buf, info) {
    await this.redis.multi().set(`${P}media:${id}`, buf).hset(`${P}mediaidx`, id, JSON.stringify(info)).exec();
  }
  async getMedia(id) {
    return this.redis.getBuffer(`${P}media:${id}`);
  }
  async delMedia(ids) {
    if (!ids.length) return;
    await this.redis.multi().del(...ids.map((id) => `${P}media:${id}`)).hdel(`${P}mediaidx`, ...ids).exec();
  }

  async close() {
    await this.redis.quit().catch(() => {});
  }
}

class FileStore {
  constructor(dir) {
    this.kind = 'file';
    this.dir = dir;
    this.file = path.join(dir, 'state.json');
    this.mediaDir = path.join(dir, 'media');
    fs.mkdirSync(this.mediaDir, { recursive: true });
    this.data = { rooms: {}, messages: {}, users: {}, subs: {}, meta: {}, media: {} };
  }

  async load() {
    try {
      Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[store] could not read state:', err.message);
    }
    const d = this.data;
    return {
      rooms: Object.values(d.rooms),
      messages: Object.fromEntries(Object.entries(d.messages).map(([k, v]) => [k, Object.values(v)])),
      users: d.users,
      subs: d.subs,
      meta: d.meta,
      media: d.media,
    };
  }

  async write(b) {
    const d = this.data;
    for (const room of b.rooms) d.rooms[room.id] = room;
    for (const id of b.deletedRooms) {
      delete d.rooms[id];
      delete d.messages[id];
    }
    for (const { room, msg } of b.messages) (d.messages[room] ||= {})[msg.id] = msg;
    for (const { room, id } of b.deletedMessages) delete d.messages[room]?.[id];
    for (const user of b.users) d.users[user.id] = user;
    for (const [user, list] of Object.entries(b.subs)) {
      if (list.length) d.subs[user] = list;
      else delete d.subs[user];
    }
    Object.assign(d.meta, b.meta);
    await this.save();
  }

  async save() {
    const tmp = `${this.file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(this.data));
    await fs.promises.rename(tmp, this.file);
  }

  async putMedia(id, buf, info) {
    await fs.promises.writeFile(path.join(this.mediaDir, id), buf);
    this.data.media[id] = info;
    await this.save();
  }
  async getMedia(id) {
    try {
      return await fs.promises.readFile(path.join(this.mediaDir, id));
    } catch {
      return null;
    }
  }
  async delMedia(ids) {
    for (const id of ids) {
      delete this.data.media[id];
      await fs.promises.rm(path.join(this.mediaDir, id), { force: true });
    }
    await this.save();
  }

  async close() {}
}

function createStore() {
  if (process.env.REDIS_URL) return new RedisStore(process.env.REDIS_URL);
  return new FileStore(process.env.DATA_DIR || path.join(__dirname, 'data'));
}

module.exports = { createStore };
