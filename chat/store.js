'use strict';

// Persistence for rooms, push subscriptions and small metadata.
// REDIS_URL (Render Key Value) when set, otherwise a JSON file for local use.

const fs = require('fs');
const path = require('path');

const PREFIX = 'ic:';

class RedisStore {
  constructor(url) {
    const Redis = require('ioredis');
    this.kind = 'redis';
    this.redis = new Redis(url, { maxRetriesPerRequest: 3, enableAutoPipelining: true });
    this.redis.on('error', (err) => console.error('[store] redis:', err.message));
  }

  async load() {
    const r = this.redis;
    const ids = await r.smembers(`${PREFIX}rooms`);
    const raw = ids.length ? await r.mget(ids.map((id) => `${PREFIX}room:${id}`)) : [];
    const rooms = raw.filter(Boolean).map((s) => JSON.parse(s));
    const subsRaw = await r.hgetall(`${PREFIX}subs`);
    const subs = {};
    for (const [user, json] of Object.entries(subsRaw)) subs[user] = JSON.parse(json);
    const metaRaw = await r.hgetall(`${PREFIX}meta`);
    const meta = {};
    for (const [key, json] of Object.entries(metaRaw)) meta[key] = JSON.parse(json);
    return { rooms, subs, meta };
  }

  async write({ rooms, deletedRooms, subs, meta }) {
    const m = this.redis.multi();
    for (const room of rooms) {
      m.set(`${PREFIX}room:${room.id}`, JSON.stringify(room));
      m.sadd(`${PREFIX}rooms`, room.id);
    }
    for (const id of deletedRooms) {
      m.del(`${PREFIX}room:${id}`);
      m.srem(`${PREFIX}rooms`, id);
    }
    for (const [user, list] of Object.entries(subs)) {
      if (list.length) m.hset(`${PREFIX}subs`, user, JSON.stringify(list));
      else m.hdel(`${PREFIX}subs`, user);
    }
    for (const [key, value] of Object.entries(meta)) m.hset(`${PREFIX}meta`, key, JSON.stringify(value));
    await m.exec();
  }

  async close() {
    await this.redis.quit().catch(() => {});
  }
}

class FileStore {
  constructor(dir) {
    this.kind = 'file';
    this.file = path.join(dir, 'state.json');
    fs.mkdirSync(dir, { recursive: true });
    this.data = { rooms: {}, subs: {}, meta: {} };
  }

  async load() {
    try {
      this.data = { rooms: {}, subs: {}, meta: {}, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[store] could not read state:', err.message);
    }
    return { rooms: Object.values(this.data.rooms), subs: this.data.subs, meta: this.data.meta };
  }

  async write({ rooms, deletedRooms, subs, meta }) {
    for (const room of rooms) this.data.rooms[room.id] = room;
    for (const id of deletedRooms) delete this.data.rooms[id];
    for (const [user, list] of Object.entries(subs)) {
      if (list.length) this.data.subs[user] = list;
      else delete this.data.subs[user];
    }
    Object.assign(this.data.meta, meta);
    const tmp = `${this.file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(this.data));
    await fs.promises.rename(tmp, this.file);
  }

  async close() {}
}

function createStore() {
  if (process.env.REDIS_URL) return new RedisStore(process.env.REDIS_URL);
  return new FileStore(process.env.DATA_DIR || path.join(__dirname, 'data'));
}

module.exports = { createStore };
