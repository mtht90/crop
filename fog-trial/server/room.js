// ロビー (部屋) とゲームループ。ネットワーク層 (index.js) とゲームロジック (game.js) の橋渡し。

import { Game } from './game.js';
import { createBrain } from './bots.js';
import { TICK_RATE, SNAPSHOT_RATE, MAX_SURVIVORS } from '../shared/constants.js';
import { CHARACTER_IDS, SURVIVOR_CHARACTERS } from '../shared/characters.js';
import { mulberry32 } from '../shared/map.js';

const BOT_NAMES = {
  knight: ['レオン', 'アーサー', 'ガレス'],
  barbarian: ['ボルグ', 'ヒルダ', 'スカルガー'],
  mage: ['メルル', 'セレナ', 'オズ'],
  rogue: ['シェイド', 'リン', 'カイ'],
  skeleton: ['ボーンリーパー', 'グレイヴ', 'スカル'],
};

let nextId = 1;
export const newId = (prefix = 'p') => `${prefix}${(nextId++).toString(36)}`;

export class Room {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.members = new Map(); // id -> { id, name, role, character, bot, ws }
    this.hostId = null;
    this.state = 'lobby';
    this.game = null;
    this.brains = new Map();
    this.loop = null;
    this.botSeq = new Map();
    this.botLevel = 1;
    this.rng = mulberry32((Math.random() * 1e9) | 0);
  }

  humans() {
    return [...this.members.values()].filter((m) => !m.bot);
  }

  send(m, msg) {
    if (m.ws && m.ws.readyState === 1) m.ws.send(JSON.stringify(msg));
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const m of this.members.values()) if (m.ws && m.ws.readyState === 1) m.ws.send(data);
  }

  lobbyState() {
    return {
      type: 'lobby',
      room: this.code,
      hostId: this.hostId,
      state: this.state,
      botLevel: this.botLevel,
      players: [...this.members.values()].map((m) => ({ id: m.id, name: m.name, role: m.role, character: m.character, bot: m.bot })),
    };
  }

  broadcastLobby() {
    this.broadcast(this.lobbyState());
  }

  addHuman(ws, name) {
    if (this.state !== 'lobby') return { error: 'この部屋は試合中です。終わるまでお待ちください' };
    let role = 'survivor';
    const survivors = [...this.members.values()].filter((m) => m.role === 'survivor');
    if (survivors.length >= MAX_SURVIVORS) {
      // ボット枠があれば人間に譲る
      const bot = survivors.find((m) => m.bot);
      if (bot) this.members.delete(bot.id);
      else if (![...this.members.values()].some((m) => m.role === 'killer')) role = 'killer';
      else return { error: '部屋が満員です' };
    }
    const m = {
      id: newId(),
      name: (name || '名無し').slice(0, 12),
      role,
      character: role === 'killer' ? 'skeleton' : this.freeCharacter(),
      bot: false,
      ws,
    };
    this.members.set(m.id, m);
    if (!this.hostId) this.hostId = m.id;
    this.broadcastLobby();
    return { member: m };
  }

  freeCharacter() {
    const used = new Set([...this.members.values()].filter((m) => m.role === 'survivor').map((m) => m.character));
    return CHARACTER_IDS.find((a) => !used.has(a)) || CHARACTER_IDS[Math.floor(this.rng() * CHARACTER_IDS.length)];
  }

  addBot(role) {
    if (this.state !== 'lobby') return;
    const members = [...this.members.values()];
    if (role === 'killer' && members.some((m) => m.role === 'killer')) return;
    if (role === 'survivor' && members.filter((m) => m.role === 'survivor').length >= MAX_SURVIVORS) return;
    if (members.length >= MAX_SURVIVORS + 1) return;
    const character = role === 'killer' ? 'skeleton' : this.freeCharacter();
    const names = BOT_NAMES[character];
    const m = { id: newId('b'), name: `${names[Math.floor(this.rng() * names.length)]}`, role, character, bot: true, ws: null };
    this.members.set(m.id, m);
    this.broadcastLobby();
  }

  fillBots() {
    const members = [...this.members.values()];
    if (!members.some((m) => m.role === 'killer')) this.addBot('killer');
    while ([...this.members.values()].filter((m) => m.role === 'survivor').length < MAX_SURVIVORS && this.members.size < MAX_SURVIVORS + 1) {
      this.addBot('survivor');
    }
  }

  removeMember(id) {
    const m = this.members.get(id);
    if (!m) return;
    if (this.state === 'playing' && this.game) {
      // ゲーム中に抜けた人はボットが引き継ぐ
      m.ws = null;
      m.bot = true;
      const p = this.game.players.get(id);
      if (p) {
        p.bot = true;
        p.name = `${p.name}(bot)`;
        this.brains.set(id, createBrain(this.game, p, this.rng, this.botLevel));
      }
    } else {
      this.members.delete(id);
    }
    if (this.hostId === id) {
      const next = this.humans().find((h) => h.ws);
      this.hostId = next ? next.id : null;
    }
    if (!this.humans().some((h) => h.ws)) {
      this.stop();
      this.onEmpty(this);
      return;
    }
    if (this.state === 'lobby') this.broadcastLobby();
  }

  handle(member, msg) {
    switch (msg.type) {
      case 'setRole': {
        if (this.state !== 'lobby') return;
        const role = msg.role === 'killer' ? 'killer' : 'survivor';
        if (role === 'killer') {
          const cur = [...this.members.values()].find((m) => m.role === 'killer' && m.id !== member.id);
          if (cur && !cur.bot) return this.send(member, { type: 'error', text: 'キラーはもう決まっています' });
          if (cur) this.members.delete(cur.id);
          member.role = 'killer';
          member.character = 'skeleton';
        } else {
          if (member.role !== 'survivor') {
            const survivors = [...this.members.values()].filter((m) => m.role === 'survivor');
            if (survivors.length >= MAX_SURVIVORS) {
              const bot = survivors.find((m) => m.bot);
              if (!bot) return this.send(member, { type: 'error', text: 'サバイバーは 4 人までです' });
              this.members.delete(bot.id);
            }
          }
          member.role = 'survivor';
          if (!SURVIVOR_CHARACTERS[member.character]) member.character = this.freeCharacter();
        }
        this.broadcastLobby();
        break;
      }
      case 'setCharacter':
        if (this.state !== 'lobby' || member.role !== 'survivor' || !SURVIVOR_CHARACTERS[msg.character]) return;
        member.character = msg.character;
        this.broadcastLobby();
        break;
      case 'addBot':
        if (member.id !== this.hostId) return;
        this.addBot(msg.role === 'killer' ? 'killer' : 'survivor');
        break;
      case 'fillBots':
        if (member.id !== this.hostId) return;
        this.fillBots();
        break;
      case 'setBotLevel':
        if (member.id !== this.hostId || this.state !== 'lobby') return;
        this.botLevel = Math.max(0, Math.min(2, msg.level | 0));
        this.broadcastLobby();
        break;
      case 'removeBot': {
        if (member.id !== this.hostId || this.state !== 'lobby') return;
        const b = this.members.get(msg.id);
        if (b && b.bot) {
          this.members.delete(b.id);
          this.broadcastLobby();
        }
        break;
      }
      case 'start':
        if (member.id !== this.hostId) return;
        this.start();
        break;
      case 'input':
        if (this.state === 'playing' && this.game && typeof msg.seq === 'number') {
          this.game.queueInput(member.id, {
            seq: msg.seq | 0,
            buttons: msg.buttons | 0,
            pressed: msg.pressed | 0,
            aim: typeof msg.aim === 'number' ? msg.aim : undefined,
            // タッチ操作のアナログスティック (サーバー側で正規化する)
            move: msg.move && typeof msg.move.x === 'number' && typeof msg.move.y === 'number' ? { x: msg.move.x, y: msg.move.y } : undefined,
          });
        }
        break;
      case 'skill':
        if (this.state === 'playing' && this.game) {
          const p = this.game.players.get(member.id);
          if (p) this.game.resolveSkill(p, msg.id, msg.result);
        }
        break;
      case 'ping':
        this.send(member, { type: 'pong', t: msg.t });
        break;
    }
  }

  start(opts = {}) {
    if (this.state !== 'lobby') return;
    const members = [...this.members.values()];
    const killers = members.filter((m) => m.role === 'killer');
    const survivors = members.filter((m) => m.role === 'survivor');
    if (killers.length !== 1) return this.broadcast({ type: 'error', text: 'キラーが 1 人必要です (ボットでも OK)' });
    if (survivors.length < 1) return this.broadcast({ type: 'error', text: 'サバイバーが 1 人以上必要です' });
    this.game = new Game(
      members.map((m) => ({ id: m.id, name: m.name, role: m.role, character: m.character, bot: m.bot })),
      opts,
    );
    this.brains.clear();
    for (const p of this.game.players.values()) {
      if (p.bot) this.brains.set(p.id, createBrain(this.game, p, this.rng, this.botLevel));
    }
    this.state = 'playing';
    const info = this.game.staticInfo();
    for (const m of members) {
      this.send(m, { type: 'start', you: m.id, role: m.role, ...info });
    }
    this.lastTick = Date.now();
    this.acc = 0;
    this.snapAcc = 0;
    this.loop = setInterval(() => this.tickLoop(), 1000 / TICK_RATE / 2);
  }

  tickLoop() {
    const now = Date.now();
    this.acc += (now - this.lastTick) / 1000;
    this.lastTick = now;
    // 処理落ちしても固定ステップで追いつく (最大 5 tick)
    let steps = 0;
    while (this.acc >= 1 / TICK_RATE && steps < 5) {
      this.acc -= 1 / TICK_RATE;
      steps++;
      try {
        this.step();
      } catch (err) {
        console.error('game step error', err);
        this.broadcast({ type: 'error', text: 'サーバーでエラーが起きたため試合を終了しました' });
        this.stop();
        this.state = 'lobby';
        this.game = null;
        this.broadcastLobby();
        return;
      }
      if (!this.game) return;
    }
    if (this.acc > 1) this.acc = 0;
  }

  step() {
    const g = this.game;
    for (const [id, brain] of this.brains) {
      const cmd = brain.think();
      if (!cmd) continue;
      const seq = (this.botSeq.get(id) || 0) + 1;
      this.botSeq.set(id, seq);
      g.queueInput(id, { seq, ...cmd });
    }
    g.update();
    this.routeEvents();
    this.snapAcc += SNAPSHOT_RATE / TICK_RATE;
    if (this.snapAcc >= 1 || g.over) {
      this.snapAcc -= 1;
      for (const m of this.members.values()) {
        if (!m.ws) continue;
        const snap = g.snapshotFor(m.id);
        if (snap) {
          snap.events = m.pending || [];
          m.pending = [];
          this.send(m, snap);
        }
      }
    }
    if (g.over) this.finish();
  }

  routeEvents() {
    const g = this.game;
    if (!g.events.length) return;
    const events = g.events;
    g.events = [];
    for (const e of events) {
      for (const m of this.members.values()) {
        const p = g.players.get(m.id);
        if (!p) continue;
        const to = e.to;
        const match = to === 'all' || to === m.id || (to === 'survivors' && p.role === 'survivor') || (to === 'killer' && p.role === 'killer');
        if (!match) continue;
        // 位置付きの音は聞こえる距離のものだけ (霧の中の情報を漏らさない)
        if (e.kind === 'sound' && e.x !== undefined && Math.hypot(e.x - p.x, e.y - p.y) > 22) continue;
        const brain = this.brains.get(m.id);
        if (brain) brain.onEvent(e);
        if (m.ws) {
          const { to: _to, ...rest } = e;
          (m.pending ||= []).push(rest);
        }
      }
    }
  }

  finish() {
    const result = this.game.result;
    this.stop();
    this.state = 'lobby';
    this.game = null;
    this.brains.clear();
    // 抜けた人の代わりのボットはロビーから外す
    for (const m of [...this.members.values()]) {
      if (m.bot && !m.ws && m.id.startsWith('p')) this.members.delete(m.id);
    }
    this.broadcast({ type: 'over', result });
    this.broadcastLobby();
  }

  stop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }
}
