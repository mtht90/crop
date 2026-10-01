import { afterEach, describe, expect, test } from 'vitest';
import { card } from '../../src/engine/cards';
import { ALL_DECKS, expand } from '../../src/engine/decks';
import type { Action, GameState, Prompt } from '../../src/engine/types';
import { PROTOCOL, type ClientMsg, type ServerMsg } from '../../src/online/protocol';
import { HIDDEN_CID } from '../../src/online/view';
import { Hub } from '../hub';
import { PlayerStore } from '../players';

const deckOf = (i: number) => expand(ALL_DECKS[i % ALL_DECKS.length].cards);
const until = async (f: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 2));
  }
};

/** a scripted player on a fake socket */
class Bot {
  msgs: ServerMsg[] = [];
  conn;
  id = '';
  secret = '';
  state: GameState | null = null;
  prompt: Prompt | null = null;
  legal: Action[] = [];
  seq = 0;
  you: 0 | 1 | 'spectator' | null = null;
  over: Extract<ServerMsg, { t: 'over' }> | null = null;
  auto = true;
  closed = false;
  allStates: GameState[] = [];
  private queue: ServerMsg[] = [];
  private busy = false;

  constructor(
    readonly hub: Hub,
    readonly name: string,
  ) {
    this.conn = hub.connect({ send: (d) => this.receive(JSON.parse(d)), close: () => (this.closed = true) });
  }
  say(m: ClientMsg) {
    this.hub.message(this.conn, JSON.stringify(m));
  }
  hello(creds?: { id: string; secret: string }) {
    this.say({ t: 'hello', v: PROTOCOL, name: this.name, ...creds });
  }
  private receive(m: ServerMsg) {
    this.msgs.push(m);
    if (m.t === 'welcome') (this.id = m.profile.id), (this.secret = m.secret);
    this.queue.push(m);
    if (!this.busy) {
      this.busy = true;
      setImmediate(() => this.drain());
    }
  }
  private drain() {
    this.busy = false;
    for (const m of this.queue.splice(0)) this.handle(m);
  }
  private handle(m: ServerMsg) {
    if (m.t === 'start') this.you = m.you;
    if (m.t === 'snapshot') {
      this.state = m.state;
      this.seq = m.seq;
      this.prompt = m.prompt;
      this.legal = m.legal;
    }
    if (m.t === 'batch') {
      for (const f of m.frames) {
        this.state = f.state;
        this.allStates.push(f.state);
      }
      this.seq = m.seq;
      this.prompt = m.prompt;
      this.legal = m.legal;
    }
    if (m.t === 'over') this.over = m;
    if ((m.t === 'batch' || m.t === 'snapshot') && this.prompt && this.auto) this.respond();
  }
  respond() {
    const pr = this.prompt;
    if (!pr) return;
    this.prompt = null;
    this.say({ t: 'answer', seq: this.seq, answer: this.choose(pr) });
  }
  choose(pr: Prompt) {
    switch (pr.type) {
      case 'action': {
        const prefer = ['attack', 'playBasic', 'attachEnergy', 'evolve', 'playTrainer', 'endTurn'] as const;
        for (const t of prefer) {
          const as = this.legal.filter((a) => a.t === t);
          if (as.length) return { type: 'action' as const, action: t === 'attack' ? as[as.length - 1] : as[0] };
        }
        return { type: 'action' as const, action: { t: 'endTurn' as const } };
      }
      case 'cards':
        return { type: 'cards' as const, uids: pr.selectable.slice(0, pr.min) };
      case 'slot':
        return { type: 'slot' as const, pos: pr.optional ? null : pr.options[0] };
      case 'choice':
        return { type: 'choice' as const, index: 0 };
      case 'setup': {
        const hand = this.state!.players[0].hand;
        const basics = hand.filter((c) => {
          const d = card(c.cid);
          return d.kind === 'monster' && d.stage === 'basic';
        });
        return { type: 'setup' as const, active: basics[0].uid, bench: basics.slice(1, 4).map((c) => c.uid) };
      }
    }
  }
  last<T extends ServerMsg['t']>(t: T) {
    return [...this.msgs].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
  errors() {
    return this.msgs.filter((m) => m.t === 'error') as Extract<ServerMsg, { t: 'error' }>[];
  }
}

let hubs: Hub[] = [];
const makeHub = (o: { timeScale?: number; graceMs?: number; rateLimit?: number } = {}) => {
  const hub = new Hub({ store: new PlayerStore(null), rateLimit: 1e9, ...o });
  hubs.push(hub);
  return hub;
};
afterEach(() => {
  hubs.forEach((h) => h.close());
  hubs = [];
});

describe('online hub', () => {
  test('many games between all decks always run to the end', async () => {
    for (let n = 0; n < 24; n++) {
      const hub = makeHub();
      const a = new Bot(hub, 'A');
      const b = new Bot(hub, 'B');
      a.hello();
      b.hello();
      a.say({ t: 'queue', kind: 'random', deck: deckOf(n) });
      b.say({ t: 'queue', kind: 'random', deck: deckOf(n * 3 + 1) });
      await until(() => !!a.over && !!b.over, 10_000);
      expect(a.errors()).toEqual([]);
      expect(b.errors()).toEqual([]);
      hub.close();
    }
  }, 120_000);

  test('friend room plays a whole game; views are masked and mirrored', async () => {
    const hub = makeHub();
    const a = new Bot(hub, 'アリス');
    const b = new Bot(hub, 'ボブ');
    a.hello();
    b.hello();
    a.say({ t: 'create', deck: deckOf(0) });
    const code = a.last('room')!.room.code;
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}$/);
    b.say({ t: 'join', code: code.toLowerCase(), deck: deckOf(1) });
    await until(() => !!a.over && !!b.over, 20_000);
    expect(a.errors()).toEqual([]);
    expect(b.errors()).toEqual([]);
    // the result is mirrored
    expect(a.over!.winner === -1 ? -1 : 1 - a.over!.winner).toBe(b.over!.winner);
    // masking: in every state each viewer saw, the opponent's hand and both decks are hidden,
    // and the viewer's own hand is real
    for (const bot of [a, b]) {
      expect(bot.allStates.length).toBeGreaterThan(20);
      for (const s of bot.allStates) {
        expect(s.rng).toBe(0);
        expect(s.players[1].hand.every((c) => c.cid === HIDDEN_CID)).toBe(true);
        expect(s.players[0].deck.concat(s.players[1].deck, s.players[0].prizes, s.players[1].prizes).every((c) => c.cid === HIDDEN_CID)).toBe(true);
        expect(s.players.map((p) => p.name)).toEqual([bot.name, bot === a ? 'ボブ' : 'アリス']);
        for (const c of s.players[0].hand) expect(c.owner).toBe(0);
        for (const c of s.players[1].hand) expect(c.owner).toBe(1);
      }
      expect(bot.allStates.some((s) => s.players[0].hand.some((c) => c.cid !== HIDDEN_CID))).toBe(true);
    }
    expect(hub.stats().rooms).toBe(1);
  }, 90_000);

  test('flooding a connection gets it dropped', () => {
    const hub = makeHub({ rateLimit: 20 });
    const a = new Bot(hub, 'A');
    a.hello();
    for (let i = 0; i < 40; i++) a.say({ t: 'ping', n: i });
    expect(a.closed).toBe(true);
    expect(a.msgs.filter((m) => m.t === 'pong').length).toBeLessThan(40);
  });

  test('bad decks, unknown rooms and double booking are refused', () => {
    const hub = makeHub();
    const a = new Bot(hub, 'A');
    a.hello();
    a.say({ t: 'create', deck: ['nope'] });
    expect(a.errors().at(-1)?.code).toBe('bad_deck');
    a.say({ t: 'create', deck: [...deckOf(0).slice(0, 59), 'ghost'] });
    expect(a.errors().at(-1)?.code).toBe('bad_deck');
    a.say({ t: 'join', code: 'ZZZZ', deck: deckOf(0) });
    expect(a.errors().at(-1)?.code).toBe('no_room');
    a.say({ t: 'create', deck: deckOf(0) });
    a.say({ t: 'create', deck: deckOf(0) });
    expect(a.errors().at(-1)?.code).toBe('busy');
    // a wrong protocol version
    const old = new Bot(hub, 'old');
    old.say({ t: 'hello', v: 999 });
    expect(old.errors().at(-1)?.code).toBe('version');
    // messages before hello
    const anon = new Bot(hub, 'anon');
    anon.say({ t: 'queue', kind: 'random', deck: deckOf(0) });
    expect(anon.errors().at(-1)?.code).toBe('bad_request');
  });

  test('random matchmaking pairs two waiting players', async () => {
    const hub = makeHub();
    const a = new Bot(hub, 'A');
    const b = new Bot(hub, 'B');
    a.hello();
    b.hello();
    a.say({ t: 'queue', kind: 'random', deck: deckOf(2) });
    expect(a.last('queued')).toBeTruthy();
    expect(hub.stats().waiting).toBe(1);
    b.say({ t: 'queue', kind: 'random', deck: deckOf(3) });
    expect(a.last('start')?.kind).toBe('random');
    expect(b.last('start')?.opp.name).toBe('A');
    expect(hub.stats().waiting).toBe(0);
    await until(() => !!a.over && !!b.over, 60_000);
    expect(a.over!.rank).toBeUndefined();
  }, 90_000);

  test('ranked games move the ladder; casual ones do not', async () => {
    const hub = makeHub();
    const a = new Bot(hub, 'A');
    const b = new Bot(hub, 'B');
    a.hello();
    b.hello();
    a.say({ t: 'queue', kind: 'ranked', deck: deckOf(0) });
    b.say({ t: 'queue', kind: 'ranked', deck: deckOf(4) });
    await until(() => !!a.over && !!b.over, 60_000);
    const w = a.over!.winner === 0 ? a : a.over!.winner === 1 ? b : null;
    if (w) {
      const l = w === a ? b : a;
      expect(w.over!.rank!.delta).toBe(50);
      expect(w.over!.rankNow!.wins).toBe(1);
      expect(l.over!.rank!.delta).toBe(0); // 級: no points lost
      expect(l.over!.rankNow!.losses).toBe(1);
    }
  }, 90_000);

  test('a far-away rank has to wait before it is matched', () => {
    const hub = makeHub();
    const a = new Bot(hub, 'A');
    const b = new Bot(hub, 'B');
    a.hello();
    b.hello();
    hub.store.get(b.id)!.rank.rank = 15;
    a.say({ t: 'queue', kind: 'ranked', deck: deckOf(0) });
    b.say({ t: 'queue', kind: 'ranked', deck: deckOf(1) });
    expect(a.last('start')).toBeUndefined();
    expect(hub.stats().waiting).toBe(2);
    a.say({ t: 'cancel' });
    expect(hub.stats().waiting).toBe(1);
  });

  test('surrender ends the game; an idle player loses on time', async () => {
    const hub = makeHub({ timeScale: 0.002 });
    const a = new Bot(hub, 'A');
    const b = new Bot(hub, 'B');
    a.hello();
    b.hello();
    a.say({ t: 'create', deck: deckOf(0) });
    b.say({ t: 'join', code: a.last('room')!.room.code, deck: deckOf(1) });
    a.auto = false; // A never answers
    b.auto = true;
    await until(() => !!b.over, 5000);
    expect(b.over!.reason).toBe('timeout');
    expect(b.over!.winner === 0 || b.over!.winner === 1).toBe(true);
    // the player who timed out is the loser
    expect(a.over!.winner).toBe(b.over!.winner === 0 ? 1 : 0);
    expect(a.over!.winner).toBe(1);

    const c = new Bot(hub, 'C');
    const d = new Bot(hub, 'D');
    c.hello();
    d.hello();
    c.auto = d.auto = false;
    c.say({ t: 'create', deck: deckOf(2) });
    d.say({ t: 'join', code: c.last('room')!.room.code, deck: deckOf(3) });
    c.say({ t: 'surrender' });
    await until(() => !!c.over && !!d.over, 2000);
    expect(c.over!.winner).toBe(1);
    expect(c.over!.reason).toBe('surrender');
    expect(d.over!.winner).toBe(0);
  });

  test('a dropped player can come back; otherwise they forfeit', async () => {
    const hub = makeHub({ timeScale: 0.01, graceMs: 30_000 });
    const a = new Bot(hub, 'A');
    const b = new Bot(hub, 'B');
    a.hello();
    b.hello();
    a.say({ t: 'create', deck: deckOf(0) });
    b.say({ t: 'join', code: a.last('room')!.room.code, deck: deckOf(1) });
    a.auto = b.auto = false;
    await until(() => !!a.prompt || !!b.prompt);
    // whoever has to decide first drops and returns inside the grace period (300ms at this scale)
    const first = a.prompt ? a : b;
    const other = first === a ? b : a;
    const seat = first === a ? 0 : 1;
    hub.disconnect(first.conn);
    expect(other.last('peer')?.connected).toBe(false);
    const back = new Bot(hub, first.name);
    back.auto = false;
    back.hello({ id: first.id, secret: first.secret });
    await until(() => !!back.last('snapshot'));
    expect(back.last('start')?.you).toBe(seat);
    expect(back.last('snapshot')!.prompt?.type).toBe(first.prompt!.type); // the same decision is waiting again
    expect(other.last('peer')?.connected).toBe(true);
    // now the other player drops for good
    hub.disconnect(other.conn);
    await until(() => !!back.over, 3000);
    expect(back.over!.reason).toBe('disconnect');
    expect(back.over!.winner).toBe(0);
  });

  test('spectators see the game without hands or prompts', async () => {
    const hub = makeHub();
    const a = new Bot(hub, 'A');
    const b = new Bot(hub, 'B');
    const s = new Bot(hub, 'S');
    a.hello();
    b.hello();
    s.hello();
    a.say({ t: 'queue', kind: 'random', deck: deckOf(0) });
    b.say({ t: 'queue', kind: 'random', deck: deckOf(1) });
    s.say({ t: 'live' });
    const live = s.last('live')!.games;
    expect(live).toHaveLength(1);
    s.say({ t: 'spectate', code: live[0].code });
    expect(s.last('start')?.you).toBe('spectator');
    await until(() => !!a.over && !!b.over && !!s.over, 60_000);
    expect(s.errors()).toEqual([]);
    expect(s.allStates.length).toBeGreaterThan(20);
    for (const st of s.allStates) {
      expect(st.players[0].hand.every((c) => c.cid === HIDDEN_CID)).toBe(true);
      expect(st.players[1].hand.every((c) => c.cid === HIDDEN_CID)).toBe(true);
    }
    expect(s.msgs.every((m) => m.t !== 'batch' || m.prompt === null)).toBe(true);
    // a spectator cannot play
    s.say({ t: 'answer', seq: 1, answer: { type: 'choice', index: 0 } });
    expect(s.errors().at(-1)?.code).toBe('not_in_game');
  }, 90_000);

  test('friend rooms can be watched by code', () => {
    const hub = makeHub();
    const a = new Bot(hub, 'A');
    const b = new Bot(hub, 'B');
    const s = new Bot(hub, 'S');
    a.hello();
    b.hello();
    s.hello();
    a.auto = b.auto = false;
    a.say({ t: 'create', deck: deckOf(0) });
    const code = a.last('room')!.room.code;
    s.say({ t: 'spectate', code });
    expect(s.errors().at(-1)?.code).toBe('no_room'); // not started yet
    b.say({ t: 'join', code, deck: deckOf(1) });
    s.say({ t: 'live' });
    expect(s.last('live')!.games).toHaveLength(0); // friend games are not listed
    s.say({ t: 'spectate', code });
    expect(s.last('start')?.you).toBe('spectator');
  });

  test('stamps reach the opponent and spectators, rate limited', () => {
    const hub = makeHub();
    const a = new Bot(hub, 'A');
    const b = new Bot(hub, 'B');
    const s = new Bot(hub, 'S');
    for (const x of [a, b, s]) (x.hello(), (x.auto = false));
    a.say({ t: 'create', deck: deckOf(0) });
    const code = a.last('room')!.room.code;
    b.say({ t: 'join', code, deck: deckOf(1) });
    s.say({ t: 'spectate', code });
    a.say({ t: 'stamp', id: 'hi' });
    a.say({ t: 'stamp', id: 'hi' });
    expect(b.msgs.filter((m) => m.t === 'stamp')).toEqual([{ t: 'stamp', from: 1, id: 'hi' }]);
    expect(s.msgs.filter((m) => m.t === 'stamp')).toEqual([{ t: 'stamp', from: 0, id: 'hi' }]);
    expect(a.msgs.some((m) => m.t === 'stamp')).toBe(false);
    a.say({ t: 'stamp', id: '../x' });
  });

  test('identity: secrets, renaming and transfer codes', () => {
    const hub = makeHub();
    const a = new Bot(hub, '<b>アリス</b>');
    a.hello();
    const w = a.last('welcome')!;
    expect(w.profile.name).toBe('bアリス/b');
    // wrong secret → a fresh identity, not someone else's
    const imp = new Bot(hub, 'imp');
    imp.hello({ id: a.id, secret: 'guess' });
    expect(imp.id).not.toBe(a.id);
    // the right secret on a new connection takes over
    const a2 = new Bot(hub, 'x');
    a2.hello({ id: a.id, secret: a.secret });
    expect(a2.id).toBe(a.id);
    expect(a.closed).toBe(true);
    // transfer code to another device
    a2.say({ t: 'transfer' });
    const { code } = a2.last('transferCode')!;
    const dev = new Bot(hub, 'phone');
    dev.say({ t: 'link', code: 'WRONG123' });
    expect(dev.errors().at(-1)?.code).toBe('bad_code');
    dev.say({ t: 'link', code: code.toLowerCase() });
    const linked = dev.last('linked')!;
    expect(linked.profile.id).toBe(a.id);
    expect(linked.secret).not.toBe(a.secret);
    dev.say({ t: 'link', code }); // one use only
    expect(dev.errors().at(-1)?.code).toBe('bad_code');
    a2.say({ t: 'rename', name: '勇者' });
    expect(a2.last('renamed')!.profile.name).toBe('勇者');
  });
});
