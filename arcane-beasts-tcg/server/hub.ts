// ============================================================================
// The hub: connections, rooms, matchmaking, timers. It speaks the protocol of
// src/online/protocol.ts and owns one GameSession per running game. Sockets
// are abstracted (`Socket`) so the same code runs under the real WebSocket
// server and in tests.
// ============================================================================
import { validateDeck } from '../src/engine/decks';
import { card } from '../src/engine/cards';
import { GameSession, promptMs, type Outgoing } from '../src/online/session';
import { PROTOCOL, type ClientMsg, type ErrorCode, type MatchKind, type OppInfo, type RoomInfo, type ServerMsg } from '../src/online/protocol';
import { judgeName } from '../src/online/names';
import { PlayerStore, portraitOk, type PlayerRecord } from './players';
import { randomInt } from 'node:crypto';

export interface Socket {
  send(data: string): void;
  close(): void;
}

export interface HubOptions {
  store: PlayerStore;
  /** multiplies every timeout (tests use a small number) */
  timeScale?: number;
  /** how long a dropped player may come back (ms, before scaling) */
  graceMs?: number;
  /** messages per second one connection may send before it is dropped */
  rateLimit?: number;
  log?: (msg: string) => void;
}

interface Seat {
  player: PlayerRecord;
  conn: Conn | null;
  deck: string[];
  grace: ReturnType<typeof setTimeout> | null;
  graceUntil: number | null;
}

interface Room {
  code: string;
  kind: MatchKind;
  state: 'waiting' | 'playing' | 'over';
  seats: [Seat | null, Seat | null];
  session: GameSession | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  cleanup: ReturnType<typeof setTimeout> | null;
  created: number;
}

class Conn {
  player: PlayerRecord | null = null;
  room: Room | null = null;
  seat: 0 | 1 | null = null;
  queued: { kind: 'random'; deck: string[]; since: number } | null = null;
  replaced = false;
  windowStart = 0;
  windowCount = 0;
  lastStamp = 0;
  badCodes = 0;
  constructor(
    readonly sock: Socket,
    readonly id: number,
  ) {}
}

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const sleepless = <T extends { unref?: () => void }>(t: T) => (t.unref?.(), t);

export class Hub {
  readonly store: PlayerStore;
  private conns = new Set<Conn>();
  private byPlayer = new Map<string, Conn>();
  private rooms = new Map<string, Room>();
  private queue: Conn[] = [];
  private nextId = 1;
  private scale: number;
  private grace: number;
  private rateLimit: number;
  private tick: ReturnType<typeof setInterval>;
  private log: (m: string) => void;

  constructor(opts: HubOptions) {
    this.store = opts.store;
    this.scale = opts.timeScale ?? 1;
    this.grace = opts.graceMs ?? 60_000;
    this.rateLimit = opts.rateLimit ?? 60;
    this.log = opts.log ?? (() => undefined);
    this.tick = sleepless(setInterval(() => this.matchmake(), Math.max(50, 2000 * this.scale)));
  }

  /** counts shown in the lobby */
  stats() {
    return { online: [...this.conns].filter((c) => c.player).length, waiting: this.queue.length, rooms: this.rooms.size };
  }

  close() {
    clearInterval(this.tick);
    for (const r of this.rooms.values()) this.clearRoomTimers(r);
    for (const r of this.rooms.values()) for (const s of r.seats) if (s?.grace) clearTimeout(s.grace);
    this.store.flush();
  }

  // ------------------------------------------------------------------------
  // connections
  // ------------------------------------------------------------------------
  connect(sock: Socket): Conn {
    const c = new Conn(sock, this.nextId++);
    this.conns.add(c);
    return c;
  }

  disconnect(c: Conn) {
    this.conns.delete(c);
    if (c.replaced) return;
    if (c.player && this.byPlayer.get(c.player.id) === c) this.byPlayer.delete(c.player.id);
    this.dequeue(c);
    const room = c.room;
    if (!room) return;
    if (c.seat === null) return;
    const seat = room.seats[c.seat];
    if (!seat) return;
    if (room.state === 'waiting') {
      this.destroyRoom(room);
      return;
    }
    if (room.state === 'playing') {
      seat.conn = null;
      const ms = this.grace * this.scale;
      seat.graceUntil = Date.now() + ms;
      seat.grace = sleepless(setTimeout(() => this.forfeit(room, c.seat as 0 | 1, 'disconnect'), ms));
      this.send(room.seats[c.seat === 0 ? 1 : 0]?.conn ?? null, { t: 'peer', connected: false, until: this.grace });
      this.broadcastRoom(room);
    }
  }

  message(c: Conn, raw: string) {
    // simple flood guard
    const now = Date.now();
    if (now - c.windowStart > 1000) {
      c.windowStart = now;
      c.windowCount = 0;
    }
    if (++c.windowCount > this.rateLimit) {
      c.sock.close();
      return;
    }
    let m: ClientMsg;
    try {
      m = JSON.parse(raw) as ClientMsg;
    } catch {
      return this.error(c, 'bad_request', 'invalid message');
    }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return this.error(c, 'bad_request', 'invalid message');
    if (m.t === 'hello') return this.hello(c, m);
    if (m.t === 'link') {
      this.linkDevice(c, String(m.code ?? ''));
      return;
    }
    if (!c.player) return this.error(c, 'bad_request', 'say hello first');
    switch (m.t) {
      case 'rename': {
        const verdict = judgeName(m.name);
        if (!verdict.ok) return this.error(c, 'bad_name', verdict.message);
        if (m.portrait !== undefined && !portraitOk(m.portrait)) return this.error(c, 'bad_request', 'その絵は選べません');
        this.store.rename(c.player, verdict.name, m.portrait);
        return this.send(c, { t: 'renamed', profile: this.store.profile(c.player) });
      }
      case 'transfer': {
        const { code, expires } = this.store.createTransfer(c.player);
        return this.send(c, { t: 'transferCode', code, expires });
      }
      case 'create':
        return this.create(c, m.deck);
      case 'join':
        return this.join(c, m.code, m.deck);
      case 'queue':
        return this.enqueue(c, m.kind, m.deck);
      case 'cancel':
        this.dequeue(c);
        if (c.room?.state === 'waiting') this.leave(c);
        return;
      case 'answer':
        return this.answer(c, m.seq, m.answer);
      case 'surrender':
        if (c.room?.state === 'playing' && (c.seat === 0 || c.seat === 1)) this.forfeit(c.room, c.seat, 'surrender');
        return;
      case 'stamp':
        return this.stamp(c, m.id);
      case 'leave':
        return this.leave(c);
      case 'ping': {
        const s = this.stats();
        return this.send(c, { t: 'pong', n: m.n, online: s.online, waiting: s.waiting });
      }
    }
  }

  // ------------------------------------------------------------------------
  // identity
  // ------------------------------------------------------------------------
  private hello(c: Conn, m: Extract<ClientMsg, { t: 'hello' }>) {
    if (m.v !== PROTOCOL) return this.error(c, 'version', 'クライアントとサーバーのバージョンが違います。ページを再読み込みしてください');
    if (c.player) return;
    let player = this.store.authenticate(m.id, m.secret);
    let secret = m.secret ?? '';
    if (!player) {
      const made = this.store.create(m.name, m.portrait);
      player = made.player;
      secret = made.secret;
      this.log(`new player ${player.name}`);
    }
    // the same player on a new connection takes over the old one
    const old = this.byPlayer.get(player.id);
    c.player = player;
    this.byPlayer.set(player.id, c);
    if (old && old !== c) {
      old.replaced = true;
      old.player = null;
      this.conns.delete(old);
      old.sock.close();
      c.queued = old.queued;
      if (old.queued) this.queue = this.queue.map((q) => (q === old ? c : q));
      c.room = old.room;
      c.seat = old.seat;
      const room = c.room;
      if (room && c.seat !== null) {
        if (room.seats[c.seat]) room.seats[c.seat]!.conn = c;
      }
    }
    const s = this.stats();
    this.send(c, { t: 'welcome', v: PROTOCOL, profile: this.store.profile(player), secret, online: s.online, waiting: s.waiting, resume: c.room && c.room.state !== 'over' ? c.room.code : undefined });
    // rejoin a running game
    const room = this.findActiveRoom(player.id);
    if (room && c.seat === null) {
      const idx = room.seats[0]?.player.id === player.id ? 0 : 1;
      c.room = room;
      c.seat = idx;
      room.seats[idx]!.conn = c;
    }
    if (room && c.room === room && room.state === 'playing' && (c.seat === 0 || c.seat === 1)) {
      const seat = room.seats[c.seat]!;
      if (seat.grace) {
        clearTimeout(seat.grace);
        seat.grace = null;
        seat.graceUntil = null;
      }
      this.sendStart(room, c);
      this.send(c, room.session!.snapshot(c.seat));
      this.send(room.seats[c.seat === 0 ? 1 : 0]?.conn ?? null, { t: 'peer', connected: true, until: null });
      this.broadcastRoom(room);
    }
  }

  /** `link`: a new device presents a transfer code instead of an id */
  linkDevice(c: Conn, code: string): boolean {
    const r = this.store.redeem(code);
    if (!r) {
      c.badCodes++;
      this.error(c, 'bad_code', 'コードが違うか、期限切れです');
      if (c.badCodes > 5) c.sock.close();
      return false;
    }
    this.send(c, { t: 'linked', profile: this.store.profile(r.player), secret: r.secret });
    return true;
  }

  // ------------------------------------------------------------------------
  // rooms
  // ------------------------------------------------------------------------
  private checkDeck(c: Conn, deck: unknown): string[] | null {
    if (!Array.isArray(deck) || deck.length !== 60 || deck.some((x) => typeof x !== 'string')) {
      this.error(c, 'bad_deck', 'デッキが正しくありません');
      return null;
    }
    try {
      for (const id of deck) card(id);
      const errs = validateDeck(deck);
      if (errs.length) {
        this.error(c, 'bad_deck', errs[0]);
        return null;
      }
    } catch {
      this.error(c, 'bad_deck', '存在しないカードが含まれています');
      return null;
    }
    return deck as string[];
  }

  /** a connection that is idle (no room, or a finished one) may start something new */
  private free(c: Conn): boolean {
    if (c.queued) {
      this.error(c, 'busy', 'すでにマッチング中です');
      return false;
    }
    if (c.room) {
      if (c.room.state === 'over') this.leave(c);
      else {
        this.error(c, 'busy', 'すでに部屋にいます');
        return false;
      }
    }
    return true;
  }

  private newCode(): string {
    for (;;) {
      const code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  private makeRoom(kind: MatchKind): Room {
    const room: Room = { code: this.newCode(), kind, state: 'waiting', seats: [null, null], session: null, turnTimer: null, cleanup: null, created: Date.now() };
    this.rooms.set(room.code, room);
    return room;
  }

  private sit(room: Room, idx: 0 | 1, c: Conn, deck: string[]) {
    room.seats[idx] = { player: c.player!, conn: c, deck, grace: null, graceUntil: null };
    c.room = room;
    c.seat = idx;
  }

  private create(c: Conn, deckIn: string[]) {
    const deck = this.checkDeck(c, deckIn);
    if (!deck || !this.free(c)) return;
    const room = this.makeRoom('friend');
    this.sit(room, 0, c, deck);
    this.broadcastRoom(room);
  }

  private join(c: Conn, codeIn: string, deckIn: string[]) {
    const code = String(codeIn ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const room = this.rooms.get(code);
    if (!room || room.kind !== 'friend' || room.state !== 'waiting') {
      c.badCodes++;
      if (c.badCodes > 8) c.sock.close();
      return this.error(c, 'no_room', '部屋が見つかりません');
    }
    if (room.seats[1]) return this.error(c, 'room_full', 'この部屋はいっぱいです');
    if (room.seats[0]?.player.id === c.player!.id) return this.error(c, 'busy', '自分の部屋には入れません');
    const deck = this.checkDeck(c, deckIn);
    if (!deck || !this.free(c)) return;
    this.sit(room, 1, c, deck);
    this.startGame(room);
  }

  leave(c: Conn) {
    this.dequeue(c);
    const room = c.room;
    if (!room) return;
    if (room.state === 'playing' && (c.seat === 0 || c.seat === 1)) return this.forfeit(room, c.seat, 'surrender');
    c.room = null;
    c.seat = null;
    if (room.state === 'waiting') this.destroyRoom(room);
  }

  private destroyRoom(room: Room) {
    this.clearRoomTimers(room);
    for (const s of room.seats) if (s?.grace) clearTimeout(s.grace);
    for (const s of room.seats) if (s?.conn && s.conn.room === room) (s.conn.room = null), (s.conn.seat = null);
    this.rooms.delete(room.code);
  }

  private clearRoomTimers(room: Room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.cleanup) clearTimeout(room.cleanup);
    room.turnTimer = room.cleanup = null;
  }

  private findActiveRoom(playerId: string): Room | null {
    for (const r of this.rooms.values()) {
      if (r.state !== 'playing') continue;
      if (r.seats.some((s) => s?.player.id === playerId)) return r;
    }
    return null;
  }

  // ------------------------------------------------------------------------
  // matchmaking
  // ------------------------------------------------------------------------
  private enqueue(c: Conn, kind: 'random', deckIn: string[]) {
    const deck = this.checkDeck(c, deckIn);
    if (!deck || !this.free(c)) return;
    c.queued = { kind, deck, since: Date.now() };
    this.queue.push(c);
    this.send(c, { t: 'queued', kind, waiting: this.queue.length });
    this.matchmake();
  }

  private dequeue(c: Conn) {
    if (!c.queued) return;
    c.queued = null;
    this.queue = this.queue.filter((q) => q !== c);
  }

  private matchmake() {
    for (const kind of ['random'] as const) {
      for (;;) {
        const pool = this.queue.filter((q) => q.queued?.kind === kind && q.player);
        let pair: [Conn, Conn] | null = null;
        for (let i = 0; i < pool.length && !pair; i++) {
          for (let j = i + 1; j < pool.length; j++) {
            const a = pool[i];
            const b = pool[j];
            if (a.player!.id === b.player!.id) continue;
            pair = [a, b];
            break;
          }
        }
        if (!pair) break;
        const [a, b] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
        const da = a.queued!.deck;
        const db = b.queued!.deck;
        this.dequeue(a);
        this.dequeue(b);
        const room = this.makeRoom(kind);
        this.sit(room, 0, a, da);
        this.sit(room, 1, b, db);
        this.startGame(room);
      }
    }
  }

  // ------------------------------------------------------------------------
  // games
  // ------------------------------------------------------------------------
  private oppInfo(p: PlayerRecord): OppInfo {
    return { name: p.name, portrait: p.portrait };
  }

  private sendStart(room: Room, c: Conn) {
    const you = c.seat!;
    const [s0, s1] = room.seats;
    const mine = you === 1 ? s1 : s0;
    const theirs = you === 1 ? s0 : s1;
    this.send(c, { t: 'start', you, kind: room.kind, code: room.code, me: this.oppInfo(mine!.player), opp: this.oppInfo(theirs!.player) });
  }

  private startGame(room: Room) {
    room.state = 'playing';
    const [s0, s1] = room.seats as [Seat, Seat];
    room.session = new GameSession([s0.deck, s1.deck], [s0.player.name, s1.player.name]);
    this.log(`game ${room.code} (${room.kind}): ${s0.player.name} vs ${s1.player.name}`);
    for (const s of [s0, s1]) if (s.conn) this.sendStart(room, s.conn);
    for (const s of [s0, s1]) if (s.conn) this.send(s.conn, room.session.snapshot(s === s0 ? 0 : 1));
    this.broadcastRoom(room);
    this.dispatch(room, room.session.begin());
  }

  private answer(c: Conn, seq: number, ans: Parameters<GameSession['answer']>[2]) {
    const room = c.room;
    if (!room || room.state !== 'playing' || !room.session || (c.seat !== 0 && c.seat !== 1)) return this.error(c, 'not_in_game', '対戦中ではありません');
    const r = room.session.answer(c.seat, seq, ans);
    if (r.error) {
      // stale answers are normal after a reconnect; show others
      if (r.error !== 'stale answer') this.error(c, 'bad_answer', r.error);
      return;
    }
    this.dispatch(room, r.out);
  }

  private forfeit(room: Room, loser: 0 | 1, reason: string) {
    if (room.state !== 'playing' || !room.session) return;
    this.dispatch(room, room.session.forfeit(loser, reason));
  }

  private dispatch(room: Room, out: Outgoing[]) {
    for (const o of out) {
      if (o.to !== 'spectator') this.send(room.seats[o.to]?.conn ?? null, o.msg);
    }
    const session = room.session!;
    if (session.over) return this.finish(room);
    this.armTimer(room);
  }

  /** the player who has to act gets a limited time */
  private armTimer(room: Room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = null;
    const pr = room.session?.pending;
    if (!pr) return;
    const actor = pr.player;
    const seq = room.session!.seq;
    room.turnTimer = sleepless(
      setTimeout(() => {
        if (room.session?.seq === seq) this.forfeit(room, actor, 'timeout');
      }, promptMs(pr) * this.scale),
    );
  }

  private finish(room: Room) {
    if (room.state === 'over') return;
    room.state = 'over';
    const session = room.session!;
    this.clearRoomTimers(room);
    for (const s of room.seats) if (s?.grace) (clearTimeout(s.grace), (s.grace = null));
    const w = session.game.s.winner;
    this.log(`game ${room.code} over: ${w} (${session.game.s.winReason})`);
    ([0, 1] as const).forEach((idx) => {
      const seat = room.seats[idx];
      if (!seat) return;
      const r = session.result(idx);
      const win = w === idx;
      if (w === 0 || w === 1) this.store.recordCasual(seat.player, win);
      this.send(seat.conn, { t: 'over', winner: r.winner, reason: r.reason });
    });
    this.broadcastRoom(room);
    room.cleanup = sleepless(setTimeout(() => this.destroyRoom(room), 90_000 * this.scale));
  }

  private stamp(c: Conn, id: string) {
    if (!c.room || c.room.state !== 'playing' || typeof id !== 'string' || !/^[a-z]{1,12}$/.test(id)) return;
    const now = Date.now();
    if (now - c.lastStamp < 1000 * this.scale) return;
    c.lastStamp = now;
    const room = c.room;
    const other = room.seats[c.seat === 0 ? 1 : 0]?.conn;
    this.send(other ?? null, { t: 'stamp', from: 1, id });
  }

  // ------------------------------------------------------------------------
  // info
  // ------------------------------------------------------------------------
  private roomInfo(room: Room): RoomInfo {
    return {
      code: room.code,
      kind: room.kind,
      state: room.state,
      players: room.seats.filter(Boolean).map((s) => ({ name: s!.player.name, connected: !!s!.conn })),
    };
  }

  private broadcastRoom(room: Room) {
    const info = this.roomInfo(room);
    room.seats.forEach((s, i) => this.send(s?.conn ?? null, { t: 'room', room: info, you: i as 0 | 1 }));
  }

  // ------------------------------------------------------------------------
  private send(c: Conn | null, msg: ServerMsg) {
    if (!c) return;
    try {
      c.sock.send(JSON.stringify(msg));
    } catch {
      /* the socket is closing */
    }
  }
  private error(c: Conn, code: ErrorCode, message: string) {
    this.send(c, { t: 'error', code, message });
  }
}

export type { Conn };
