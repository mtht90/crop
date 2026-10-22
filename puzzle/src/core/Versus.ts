import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js';
import { Save } from './Save';
import { Ranking, playerId } from './Ranking';
import { CHARACTERS, isReleased } from '../data/characters';
import type { GimmickId } from '../data/gimmicks';

/**
 * Real-time 1v1 over Supabase Realtime (broadcast + presence; no tables needed).
 * Lobby: everyone waiting tracks presence; the two who have waited longest pair up and the
 * earlier one picks a room. Room: both send their score twice a second and attacks as they
 * happen; the match starts a few seconds after both have joined. If nobody shows up in time,
 * a CPU opponent (clearly marked) plays instead.
 */
const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const VS_TIME = 60;
/** Obstructions you can send: annoying but fair (nothing that wrecks a whole board for long). */
export const VS_ATTACKS: GimmickId[] = ['rock', 'ice', 'bubble', 'junk', 'ink', 'slime', 'curse', 'hardRock', 'chameleon', 'quake', 'wind', 'comboBreak'];

export interface Opponent {
  name: string;
  charId: string;
  cpu: boolean;
}

export interface VsLink {
  opponent: Opponent;
  /** Opponent's latest score. */
  oppScore: number;
  /** Set by the battle: an attack arrived. */
  onAttack: (id: GimmickId) => void;
  /** Set by the battle: the opponent left mid-match. */
  onGone: () => void;
  start(): void;
  update(dt: number, myScore: number): void;
  sendAttack(id: GimmickId): void;
  /** Sends the final score and waits (a few seconds at most) for the opponent's. */
  finish(score: number): Promise<number>;
  leave(): void;
}

export const Versus = {
  get online(): boolean {
    return !!URL_ && !!KEY;
  },
};

let client: RealtimeClient | null = null;
function rt(): RealtimeClient {
  if (!client) {
    client = new RealtimeClient(`${URL_!.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: KEY! } });
  }
  return client;
}

// ------------------------------------------------------------------ CPU opponent
const CPU_NAMES = ['ぷにロボ', 'CPUくん', 'れんしゅうロボ', 'ホネロボ'];

/** A CPU about as strong as the player (±15%), attacking every 10–14 s. */
export class CpuLink implements VsLink {
  opponent: Opponent;
  oppScore = 0;
  onAttack: (id: GimmickId) => void = () => {};
  onGone: () => void = () => {};
  private target: number;
  private t = 0;
  private atkT = 8 + Math.random() * 4;
  private running = false;
  constructor(expected: number) {
    const pool = CHARACTERS.filter((c) => !c.limitedUntil && isReleased(c));
    this.opponent = { name: CPU_NAMES[Math.floor(Math.random() * CPU_NAMES.length)], charId: pool[Math.floor(Math.random() * pool.length)].id, cpu: true };
    // the CPU plays a 60 s round; expected scores are for 90 s
    this.target = expected * (VS_TIME / 90) * (0.85 + Math.random() * 0.3);
  }
  start(): void {
    this.running = true;
  }
  update(dt: number): void {
    if (!this.running) return;
    this.t += dt;
    // scores come in bursts like a real player's chains
    const k = Math.min(1, this.t / VS_TIME);
    const goal = this.target * (k * 0.85 + k * k * 0.15);
    if (Math.random() < dt * 1.5) this.oppScore = Math.max(this.oppScore, Math.round(goal * (0.97 + Math.random() * 0.06)));
    this.atkT -= dt;
    if (this.atkT <= 0) {
      this.atkT = 10 + Math.random() * 4;
      this.onAttack(VS_ATTACKS[Math.floor(Math.random() * VS_ATTACKS.length)]);
    }
  }
  sendAttack(): void {}
  async finish(): Promise<number> {
    this.running = false;
    // final = where its curve stood when the round ended
    const k = Math.min(1, this.t / VS_TIME);
    this.oppScore = Math.max(this.oppScore, Math.round(this.target * (k * 0.85 + k * k * 0.15)));
    return this.oppScore;
  }
  leave(): void {}
}

// ------------------------------------------------------------------ online opponent
class NetLink implements VsLink {
  oppScore = 0;
  onAttack: (id: GimmickId) => void = () => {};
  onGone: () => void = () => {};
  private sendT = 0;
  private oppFinal: number | null = null;
  private finals: ((v: number) => void)[] = [];
  private ended = false;
  constructor(
    private ch: RealtimeChannel,
    public opponent: Opponent,
    private oppId: string,
  ) {
    ch.on('broadcast', { event: 'score' }, ({ payload }) => {
      if (payload.id === this.oppId) this.oppScore = Math.max(this.oppScore, Number(payload.score) || 0);
    });
    ch.on('broadcast', { event: 'attack' }, ({ payload }) => {
      if (payload.id === this.oppId && VS_ATTACKS.includes(payload.kind)) this.onAttack(payload.kind);
    });
    ch.on('broadcast', { event: 'end' }, ({ payload }) => {
      if (payload.id !== this.oppId) return;
      this.oppFinal = Number(payload.score) || 0;
      this.oppScore = this.oppFinal;
      for (const f of this.finals) f(this.oppFinal);
    });
    ch.on('presence', { event: 'leave' }, ({ key }) => {
      if (key === this.oppId && !this.ended) this.onGone();
    });
  }
  start(): void {}
  update(dt: number, myScore: number): void {
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.5;
      void this.ch.send({ type: 'broadcast', event: 'score', payload: { id: playerId(), score: Math.round(myScore) } });
    }
  }
  sendAttack(id: GimmickId): void {
    void this.ch.send({ type: 'broadcast', event: 'attack', payload: { id: playerId(), kind: id } });
  }
  async finish(score: number): Promise<number> {
    this.ended = true;
    void this.ch.send({ type: 'broadcast', event: 'end', payload: { id: playerId(), score: Math.round(score) } });
    if (this.oppFinal !== null) return this.oppFinal;
    return new Promise((res) => {
      this.finals.push(res);
      // opponent gone or slow (skill cut-ins pause their clock briefly): use the last score we saw
      setTimeout(() => res(this.oppFinal ?? this.oppScore), 20000);
    });
  }
  leave(): void {
    this.ended = true;
    void rt().removeChannel(this.ch);
  }
}

/**
 * Finds an opponent. Calls `status` with progress text; resolves with a link once a match
 * is set up (and both players are in the room), or null when nobody came in `waitMs`.
 */
export async function findMatch(status: (s: string) => void, waitMs = 15000, cancelled: () => boolean = () => false): Promise<VsLink | null> {
  if (!Versus.online) return null;
  const me = playerId();
  const myName = Save.data.rank.name || 'ゲスト';
  const lobby = rt().channel('puni-vs-lobby', { config: { presence: { key: me }, broadcast: { self: false } } });
  let resolveRoom: (r: { room: string; opp: string; oppName: string; oppChar: string } | null) => void = () => {};
  const roomP = new Promise<{ room: string; opp: string; oppName: string; oppChar: string } | null>((r) => (resolveRoom = r));
  const joinedAt = Date.now();
  let matched = false;
  type Waiting = { id: string; name: string; char: string; at: number };
  lobby.on('presence', { event: 'sync' }, () => {
    if (matched) return;
    const state = lobby.presenceState<Waiting>();
    const waiting = Object.values(state).map((l) => l[0]).filter(Boolean).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    const i = waiting.findIndex((w) => w.id === me);
    if (i < 0) return;
    const partner = waiting[i ^ 1];
    // the earlier of each pair hosts and picks the room
    if (partner && i % 2 === 0) {
      matched = true;
      const room = `${me.slice(0, 8)}-${partner.id.slice(0, 8)}-${Date.now().toString(36)}`;
      void lobby.send({ type: 'broadcast', event: 'match', payload: { room, a: me, b: partner.id, aName: myName, aChar: Save.data.selected } });
      resolveRoom({ room, opp: partner.id, oppName: partner.name, oppChar: partner.char });
    }
  });
  lobby.on('broadcast', { event: 'match' }, ({ payload }) => {
    if (matched || payload.b !== me) return;
    matched = true;
    resolveRoom({ room: payload.room, opp: payload.a, oppName: payload.aName, oppChar: payload.aChar });
  });
  status('対戦相手をさがしています…');
  lobby.subscribe((s) => {
    if (s === 'SUBSCRIBED') void lobby.track({ id: me, name: myName, char: Save.data.selected, at: joinedAt });
  });
  const timer = setInterval(() => {
    if (cancelled()) resolveRoom(null);
    const left = Math.max(0, Math.ceil((waitMs - (Date.now() - joinedAt)) / 1000));
    if (!matched) status(`対戦相手をさがしています… ${left}`);
    if (!matched && Date.now() - joinedAt > waitMs) resolveRoom(null);
  }, 250);
  const found = await roomP;
  clearInterval(timer);
  // leaving the last channel closes the socket, so join the room before leaving the lobby
  const leaveLobby = () => {
    void lobby.untrack();
    void rt().removeChannel(lobby);
  };
  if (!found || cancelled()) {
    leaveLobby();
    return null;
  }
  status(`${found.oppName} さんと対戦！`);
  // both join the room; go once the other is there (or give up after 8 s)
  const room = rt().channel(`puni-vs-${found.room}`, { config: { presence: { key: me }, broadcast: { self: false } } });
  const opponent: Opponent = { name: found.oppName || 'ゲスト', charId: found.oppChar, cpu: false };
  const link = new NetLink(room, opponent, found.opp);
  const ready = new Promise<boolean>((res) => {
    const t = setTimeout(() => res(false), 8000);
    room.on('presence', { event: 'sync' }, () => {
      if (room.presenceState()[found.opp]) {
        clearTimeout(t);
        res(true);
      }
    });
  });
  room.subscribe((s) => {
    if (s === 'SUBSCRIBED') {
      void room.track({ id: me });
      leaveLobby();
    }
  });
  if (!(await ready)) {
    link.leave();
    return null;
  }
  return link;
}

/** Ranking registration is used for the nickname shown to the opponent. */
export const vsNeedsName = (): boolean => Ranking.enabled && !Ranking.registered;
