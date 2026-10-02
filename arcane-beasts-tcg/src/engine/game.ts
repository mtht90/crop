// ============================================================================
// ARCANE BEASTS — rules engine
//
// The whole match is a single coroutine (generator). Every decision point —
// including the main-phase action choice — is a Prompt that the driver answers
// (human UI or AI). Every visible change emits a GameEvent together with a
// snapshot of the state, so the UI can replay the match beat by beat.
// ============================================================================
import { card, byName, COND_JP, TYPE_JP } from './cards';
import type {
  Action,
  Answer,
  AttackEffect,
  CardDef,
  CardInst,
  Condition,
  EnergyCard,
  EType,
  Frame,
  GameEvent,
  GameState,
  MonsterCard,
  PlayerState,
  Pos,
  Prompt,
  Slot,
  TrainerCard,
} from './types';

type Gen<T = void> = Generator<Prompt, T, Answer>;

export class GameOver extends Error {
  constructor() {
    super('game over');
  }
}

export const other = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);
export const posEq = (a: Pos, b: Pos) => a.p === b.p && a.z === b.z && (a.z === 'active' || (b.z === 'bench' && a.i === b.i));
export const posKey = (a: Pos) => (a.z === 'active' ? `${a.p}a` : `${a.p}b${a.i}`);

const BENCH_MAX = 5;
const PRIZES = 6;
const HAND_START = 7;

// ----------------------------------------------------------------------------
// Static helpers operating on state
// ----------------------------------------------------------------------------
export function topCard(slot: Slot): MonsterCard {
  return card(slot.stack[slot.stack.length - 1].cid) as MonsterCard;
}

/** Prize cards the opponent takes when this monster is knocked out */
export const prizeValue = (mc: MonsterCard) => (mc.ex ? 3 : mc.omega ? 2 : 1);
/** Ω and EX monsters carry a rule box */
export const hasRule = (mc: MonsterCard) => !!(mc.omega || mc.ex);

export function slotAt(s: GameState, pos: Pos): Slot | null {
  const pl = s.players[pos.p];
  return pos.z === 'active' ? pl.active : pl.bench[pos.i] ?? null;
}

export function slotsOf(s: GameState, p: 0 | 1): { pos: Pos; slot: Slot }[] {
  const pl = s.players[p];
  const out: { pos: Pos; slot: Slot }[] = [];
  if (pl.active) out.push({ pos: { p, z: 'active' }, slot: pl.active });
  pl.bench.forEach((slot, i) => out.push({ pos: { p, z: 'bench', i }, slot }));
  return out;
}

function toolKey(slot: Slot): string | null {
  if (!slot.tool) return null;
  return (card(slot.tool.cid) as TrainerCard).key;
}

export function stadiumKey(s: GameState): string | null {
  return s.stadium ? (card(s.stadium.cid) as TrainerCard).key : null;
}

export function maxHp(s: GameState, slot: Slot): number {
  const mc = topCard(slot);
  let hp = mc.hp;
  if (toolKey(slot) === 'charm') hp += 30;
  if (toolKey(slot) === 'mailcoat' && mc.stage === 'basic') hp += 60;
  if (stadiumKey(s) === 'harbor' && !hasRule(mc)) hp += 30;
  return hp;
}

export function hpLeft(s: GameState, slot: Slot) {
  return Math.max(0, maxHp(s, slot) - slot.damage);
}

/** Energy units a slot provides: each unit is a set of types it can pay for. */
export function energyUnits(slot: Slot): EType[][] {
  const units: EType[][] = [];
  for (const e of slot.energy) {
    const ec = card(e.cid) as EnergyCard;
    const count = ec.count ?? 1;
    for (let i = 0; i < count; i++) units.push(ec.provides);
  }
  return units;
}

export function energyCount(slot: Slot): number {
  return energyUnits(slot).length;
}

/** Can the given units pay a cost? Colored costs need matching units; colorless takes any. */
export function canPay(units: EType[][], cost: EType[]): boolean {
  const colored = cost.filter((c) => c !== 'colorless');
  const colorless = cost.length - colored.length;
  if (units.length < cost.length) return false;
  const used = new Array(units.length).fill(false);
  // backtracking assignment of colored requirements
  const assign = (i: number): boolean => {
    if (i === colored.length) return units.length - colored.length >= colorless;
    for (let u = 0; u < units.length; u++) {
      if (!used[u] && units[u].includes(colored[i])) {
        used[u] = true;
        if (assign(i + 1)) return true;
        used[u] = false;
      }
    }
    return false;
  };
  return assign(0);
}

export function hasAbility(slot: Slot, k: string) {
  const a = topCard(slot).ability;
  return a && a.spec.k === k ? a.spec : null;
}

export function retreatCost(s: GameState, slot: Slot): number {
  if (hasAbility(slot, 'freeRetreat')) return 0;
  if (toolKey(slot) === 'float') return 0;
  let c = topCard(slot).retreat;
  if (stadiumKey(s) === 'coast') c -= 1;
  return Math.max(0, c);
}

function hasFlag(s: GameState, slot: Slot, k: string) {
  return slot.flags.find((f) => f.k === k && f.untilTurn >= s.turn);
}

export function isFirstTurnOf(s: GameState) {
  // true during each player's own first turn
  return s.turn <= 2;
}

export function cardName(cid: string) {
  return card(cid).name;
}

// ----------------------------------------------------------------------------
// RNG (mulberry32)
// ----------------------------------------------------------------------------
function nextRand(s: GameState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ----------------------------------------------------------------------------
// Game
// ----------------------------------------------------------------------------
export interface GameOptions {
  record?: boolean; // capture state snapshots per event (UI)
}

export class Game {
  s: GameState;
  pending: Prompt | null = null;
  frames: Frame[] = [];
  record: boolean;
  private gen: Gen;

  constructor(state: GameState, opts: GameOptions = {}) {
    this.s = state;
    this.record = opts.record ?? false;
    this.gen = this.flow();
  }

  static create(decks: [string[], string[]], names: [string, string], seed = Date.now() >>> 0, opts: GameOptions = {}): Game {
    let uid = 1;
    const mk = (ids: string[], owner: 0 | 1): CardInst[] => ids.map((cid) => ({ uid: uid++, cid, owner }));
    const pl = (i: 0 | 1): PlayerState => ({
      deck: mk(decks[i], i),
      hand: [],
      discard: [],
      prizes: [],
      active: null,
      bench: [],
      name: names[i],
      mulligans: 0,
    });
    const s: GameState = {
      players: [pl(0), pl(1)],
      turn: 0,
      current: 0,
      first: 0,
      phase: 'setup',
      flags: freshFlags(),
      stadium: null,
      stadiumOwner: null,
      playing: null,
      winner: null,
      winReason: '',
      rng: seed | 0,
      nextUid: uid,
      log: [],
    };
    return new Game(s, opts);
  }

  /** Clone for AI simulation. Only valid while waiting on an 'action' prompt. */
  fork(): Game {
    const g = new Game(structuredClone(this.s), { record: false });
    g.s.rng = (Math.random() * 2 ** 31) | 0; // hide future randomness
    g.start();
    return g;
  }

  // --------------------------------------------------------------------------
  // Driver
  // --------------------------------------------------------------------------
  start() {
    this.step(undefined);
  }

  answer(a: Answer) {
    if (!this.pending) throw new Error('No pending prompt');
    this.validate(this.pending, a);
    this.pending = null;
    this.step(a);
  }

  private step(a: Answer | undefined) {
    try {
      const r = a === undefined ? this.gen.next() : this.gen.next(a);
      if (r.done) {
        this.pending = null;
      } else {
        this.pending = r.value;
      }
    } catch (e) {
      if (e instanceof GameOver) {
        this.pending = null;
        return;
      }
      throw e;
    }
  }

  drainFrames(): Frame[] {
    const f = this.frames;
    this.frames = [];
    return f;
  }

  get over() {
    return this.s.phase === 'over';
  }

  /** end the game from outside the rules (surrender, timeout, disconnect) */
  forfeit(winner: 0 | 1 | -1, reason: string) {
    if (this.s.phase === 'over') return;
    try {
      this.win(winner, reason);
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    this.pending = null;
  }

  private validate(p: Prompt, a: Answer) {
    if (p.type !== a.type) throw new Error(`Answer type ${a.type} does not match prompt ${p.type}`);
    if (p.type === 'cards' && a.type === 'cards') {
      if (a.uids.length < p.min || a.uids.length > p.max) throw new Error('Wrong number of cards');
      for (const u of a.uids) if (!p.selectable.includes(u)) throw new Error('Card not selectable');
      if (new Set(a.uids).size !== a.uids.length) throw new Error('Duplicate');
    }
    if (p.type === 'slot' && a.type === 'slot') {
      if (a.pos === null) {
        if (!p.optional) throw new Error('Slot required');
      } else if (!p.options.some((o) => posEq(o, a.pos!))) throw new Error('Invalid slot');
    }
    if (p.type === 'choice' && a.type === 'choice') {
      if (a.index < 0 || a.index >= p.options.length) throw new Error('Invalid choice');
    }
    if (p.type === 'action' && a.type === 'action') {
      if (!this.isLegal(p.player, a.action)) throw new Error('Illegal action ' + JSON.stringify(a.action));
    }
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------
  rand() {
    return nextRand(this.s);
  }

  emit(ev: GameEvent) {
    const text = this.describe(ev);
    if (text) {
      this.s.log.push({ turn: this.s.turn, player: 'p' in ev ? (ev.p as 0 | 1) : null, text });
      if (this.s.log.length > 400) this.s.log.shift();
    }
    if (this.record) this.frames.push({ ev, state: structuredClone(this.s) });
  }

  pl(p: 0 | 1) {
    return this.s.players[p];
  }

  shuffle(p: 0 | 1) {
    const d = this.pl(p).deck;
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    this.emit({ e: 'shuffle', p });
  }

  flip(p: 0 | 1, label?: string): boolean {
    const heads = this.rand() < 0.5;
    this.emit({ e: 'coin', p, heads, label });
    return heads;
  }

  draw(p: 0 | 1, n: number): CardInst[] {
    const pl = this.pl(p);
    const got = pl.deck.splice(0, Math.min(n, pl.deck.length));
    if (!got.length) return got;
    pl.hand.push(...got);
    this.emit({ e: 'draw', p, uids: got.map((c) => c.uid) });
    return got;
  }

  newSlot(c: CardInst): Slot {
    return {
      stack: [c],
      energy: [],
      tool: null,
      damage: 0,
      conditions: [],
      playedTurn: this.s.turn,
      evolvedTurn: -1,
      abilityUsedTurn: -1,
      flags: [],
    };
  }

  removeFromHand(p: 0 | 1, uid: number): CardInst {
    const h = this.pl(p).hand;
    const i = h.findIndex((c) => c.uid === uid);
    if (i < 0) throw new Error('Card not in hand ' + uid);
    return h.splice(i, 1)[0];
  }

  win(winner: 0 | 1 | -1, reason: string): never {
    this.s.winner = winner;
    this.s.winReason = reason;
    this.s.phase = 'over';
    this.emit({ e: 'gameover', winner, reason });
    throw new GameOver();
  }

  // --------------------------------------------------------------------------
  // Prompt helpers
  // --------------------------------------------------------------------------
  *chooseCards(p: 0 | 1, title: string, cards: CardInst[], selectable: number[], min: number, max: number): Gen<number[]> {
    max = Math.min(max, selectable.length);
    min = Math.min(min, max);
    if (max === 0) {
      if (cards.length) {
        // still reveal so the player sees the search failed
        const a = yield { type: 'cards', player: p, title, cards, selectable: [], min: 0, max: 0 };
        return a.type === 'cards' ? a.uids : [];
      }
      return [];
    }
    const a = yield { type: 'cards', player: p, title, cards, selectable, min, max };
    return a.type === 'cards' ? a.uids : [];
  }

  *chooseSlot(p: 0 | 1, title: string, options: Pos[], optional = false): Gen<Pos | null> {
    if (!options.length) return null;
    if (options.length === 1 && !optional) return options[0];
    const a = yield { type: 'slot', player: p, title, options, optional };
    return a.type === 'slot' ? a.pos : null;
  }

  *choice(p: 0 | 1, title: string, options: string[]): Gen<number> {
    const a = yield { type: 'choice', player: p, title, options };
    return a.type === 'choice' ? a.index : 0;
  }

  // --------------------------------------------------------------------------
  // Flow
  // --------------------------------------------------------------------------
  private *flow(): Gen {
    const s = this.s;
    if (s.phase === 'setup') {
      yield* this.setup();
      s.phase = 'main';
      yield* this.startTurn(s.first, true);
    }
    while (s.phase === 'main') {
      const a = yield { type: 'action', player: s.current };
      if (a.type !== 'action') continue;
      const act = a.action;
      const endsTurn = yield* this.perform(s.current, act);
      yield* this.resolveKOs();
      if (endsTurn) {
        yield* this.checkup();
        yield* this.startTurn(other(s.current), false);
      }
    }
  }

  private *setup(): Gen {
    const s = this.s;
    this.emit({ e: 'start' });
    // coin toss for first player
    const heads = this.flip(0, '先攻・後攻を決めるコイントス');
    const winner: 0 | 1 = heads ? 0 : 1;
    const pick = yield* this.choice(winner, 'コイントスに勝ちました！先攻・後攻を選んでください', ['先攻', '後攻']);
    s.first = pick === 0 ? winner : other(winner);
    s.current = s.first;
    this.emit({ e: 'first', p: s.first });

    for (const p of [0, 1] as const) this.shuffle(p);
    // draw & mulligan
    const hasBasic = (p: 0 | 1) => this.pl(p).hand.some((c) => isBasic(c.cid));
    for (const p of [0, 1] as const) {
      this.draw(p, HAND_START);
      let guard = 0;
      while (!hasBasic(p) && guard++ < 50) {
        const pl = this.pl(p);
        this.emit({ e: 'mulligan', p, uids: pl.hand.map((c) => c.uid) });
        pl.mulligans++;
        pl.deck.push(...pl.hand.splice(0));
        this.shuffle(p);
        this.draw(p, HAND_START);
      }
    }
    // extra draws for opponent's mulligans
    for (const p of [0, 1] as const) {
      const opp = this.pl(other(p));
      if (opp.mulligans > 0) this.draw(p, opp.mulligans);
    }
    // choose active & bench
    for (const p of [0, 1] as const) {
      const a = yield { type: 'setup', player: p };
      if (a.type !== 'setup') throw new Error('bad setup');
      const pl = this.pl(p);
      const act = this.removeFromHand(p, a.active);
      if (!isBasic(act.cid)) throw new Error('Active must be basic');
      pl.active = this.newSlot(act);
      for (const u of a.bench.slice(0, BENCH_MAX)) {
        const c = this.removeFromHand(p, u);
        if (!isBasic(c.cid)) throw new Error('Bench must be basic');
        pl.bench.push(this.newSlot(c));
      }
    }
    // prizes
    for (const p of [0, 1] as const) {
      const pl = this.pl(p);
      pl.prizes = pl.deck.splice(0, PRIZES);
    }
    this.emit({ e: 'setupDone' });
  }

  private *startTurn(p: 0 | 1, first: boolean): Gen {
    const s = this.s;
    s.turn++;
    s.current = p;
    s.flags = freshFlags();
    // expire flags
    for (const q of [0, 1] as const) for (const { slot } of slotsOf(s, q)) slot.flags = slot.flags.filter((f) => f.untilTurn >= s.turn);
    this.emit({ e: 'turn', p, turn: s.turn });
    if (this.pl(p).deck.length === 0) {
      this.win(other(p), `${this.pl(p).name}は山札が引けなくなった！`);
    }
    this.draw(p, 1);
    void first;
    yield* [];
  }

  // --------------------------------------------------------------------------
  // Legal actions
  // --------------------------------------------------------------------------
  legalActions(p: 0 | 1): Action[] {
    const s = this.s;
    const out: Action[] = [];
    if (s.phase !== 'main' || s.current !== p) return out;
    const pl = this.pl(p);
    const firstTurn = s.turn === 1;
    const noEvolve = isFirstTurnOf(s);

    for (const c of pl.hand) {
      const def = card(c.cid);
      if (def.kind === 'monster') {
        if (def.stage === 'basic') {
          if (pl.bench.length < BENCH_MAX) out.push({ t: 'playBasic', uid: c.uid });
        } else if (!noEvolve) {
          for (const { pos, slot } of slotsOf(s, p)) if (this.canEvolve(slot, def)) out.push({ t: 'evolve', uid: c.uid, target: pos });
        }
      } else if (def.kind === 'energy') {
        if (!s.flags.energyAttached) for (const { pos } of slotsOf(s, p)) out.push({ t: 'attachEnergy', uid: c.uid, target: pos });
      } else {
        if (def.sub === 'tool') {
          for (const { pos, slot } of slotsOf(s, p)) if (!slot.tool) out.push({ t: 'playTrainer', uid: c.uid, target: pos });
        } else if (this.canPlayTrainer(p, c)) out.push({ t: 'playTrainer', uid: c.uid });
      }
    }
    // retreat
    const act = pl.active;
    if (act && this.canRetreat(p)) {
      const cost = retreatCost(s, act);
      const discard = autoRetreatDiscard(act, cost);
      pl.bench.forEach((_, i) => out.push({ t: 'retreat', to: i, discard }));
    }
    // abilities
    for (const { pos, slot } of slotsOf(s, p)) if (this.canUseAbility(p, pos, slot)) out.push({ t: 'ability', pos });
    // stadium
    if (stadiumKey(s) === 'forest' && !s.flags.stadiumUsed && pl.bench.length < BENCH_MAX && pl.deck.some((c) => isBasic(c.cid)))
      out.push({ t: 'stadium' });
    if (stadiumKey(s) === 'mine' && !s.flags.stadiumUsed && pl.hand.length > 0 && pl.deck.length > 1) out.push({ t: 'stadium' });
    // attacks
    if (act && !firstTurn) {
      topCard(act).attacks.forEach((_, i) => {
        if (this.canAttack(p, i)) out.push({ t: 'attack', index: i });
      });
    }
    out.push({ t: 'endTurn' });
    return out;
  }

  isLegal(p: 0 | 1, a: Action): boolean {
    if (a.t === 'retreat') {
      const act = this.pl(p).active;
      if (!act || !this.canRetreat(p)) return false;
      if (a.to < 0 || a.to >= this.pl(p).bench.length) return false;
      const chosen = act.energy.filter((e) => a.discard.includes(e.uid));
      if (chosen.length !== a.discard.length) return false;
      const units = chosen.reduce((n, e) => n + ((card(e.cid) as EnergyCard).count ?? 1), 0);
      return units >= retreatCost(this.s, act);
    }
    return this.legalActions(p).some((b) => actionEq(a, b));
  }

  canEvolve(slot: Slot, def: MonsterCard): boolean {
    const s = this.s;
    if (def.stage === 'basic' || !def.evolvesFrom) return false;
    if (isFirstTurnOf(s)) return false;
    if (topCard(slot).name !== def.evolvesFrom) return false;
    if (slot.playedTurn >= s.turn || slot.evolvedTurn >= s.turn) return false;
    return true;
  }

  canRetreat(p: 0 | 1): boolean {
    const s = this.s;
    const act = this.pl(p).active;
    if (!act || s.flags.retreated || !this.pl(p).bench.length) return false;
    if (act.conditions.includes('asleep') || act.conditions.includes('paralyzed')) return false;
    if (hasFlag(s, act, 'cantRetreat')) return false;
    return energyCount(act) >= retreatCost(s, act);
  }

  canAttack(p: 0 | 1, i: number): boolean {
    const s = this.s;
    const act = this.pl(p).active;
    if (!act || s.turn === 1) return false;
    if (act.conditions.includes('asleep') || act.conditions.includes('paralyzed')) return false;
    if (hasFlag(s, act, 'cantAttack')) return false;
    const atk = topCard(act).attacks[i];
    if (!atk) return false;
    return canPay(energyUnits(act), atk.cost);
  }

  canUseAbility(p: 0 | 1, pos: Pos, slot: Slot): boolean {
    const s = this.s;
    const ab = topCard(slot).ability;
    if (!ab || slot.abilityUsedTurn === s.turn) return false;
    const pl = this.pl(p);
    const spec = ab.spec;
    switch (spec.k) {
      case 'drawOnce':
        return pl.deck.length > 0 && (!spec.activeOnly || pos.z === 'active');
      case 'energyFromHand':
        return pl.hand.some((c) => isBasicEnergyOf(c.cid, spec.type));
      case 'energyFromDiscard':
        return pl.discard.some((c) => isBasicEnergyOf(c.cid, spec.type));
      case 'healOnce':
        return slotsOf(s, p).some((x) => x.slot.damage > 0);
      case 'searchBasicOnce':
        return pl.bench.length < BENCH_MAX && pl.deck.length > 0;
      case 'switchInOnce':
        return pos.z === 'bench';
      default:
        return false;
    }
  }

  canPlayTrainer(p: 0 | 1, c: CardInst): boolean {
    const s = this.s;
    const def = card(c.cid) as TrainerCard;
    const pl = this.pl(p);
    const opp = this.pl(other(p));
    if (def.sub === 'supporter') {
      if (s.flags.supporterPlayed || s.turn === 1) return false;
    }
    if (def.sub === 'stadium') {
      if (s.flags.stadiumPlayed) return false;
      if (s.stadium && card(s.stadium.cid).name === def.name) return false;
      return true;
    }
    const handOthers = pl.hand.filter((h) => h.uid !== c.uid);
    const damaged = slotsOf(s, p).some((x) => x.slot.damage > 0);
    switch (def.key) {
      case 'research':
        return pl.deck.length > 0;
      case 'boss':
        return opp.bench.length > 0;
      case 'iono':
      case 'judge':
        return true;
      case 'hunter':
      case 'ultra':
      case 'pokeball':
      case 'compass':
      case 'vessel':
        if (def.key === 'ultra' && handOthers.length < 2) return false;
        if (def.key === 'vessel' && handOthers.length < 1) return false;
        return pl.deck.length > 0;
      case 'cleric':
        return slotsOf(s, p).some((x) => x.slot.damage > 0 || x.slot.conditions.length > 0);
      case 'necro':
        return pl.discard.some((d) => card(d.cid).kind === 'monster' || isBasicEnergy(d.cid));
      case 'general':
      case 'scholar':
        return pl.deck.length > 0 || def.key === 'general';
      case 'nest':
        return pl.bench.length < BENCH_MAX && pl.deck.length > 0;
      case 'potion':
      case 'superpotion':
        return damaged;
      case 'switch':
        return pl.bench.length > 0;
      case 'candy':
        return this.candyTargets(p, c.uid).length > 0;
      case 'retrieval':
        return pl.discard.some((d) => isBasicEnergy(d.cid));
      case 'stretcher':
        return pl.discard.some((d) => card(d.cid).kind === 'monster' || isBasicEnergy(d.cid));
      case 'catcher':
        return opp.bench.length > 0;
      case 'rally':
        return pl.bench.length < BENCH_MAX && pl.deck.some((d) => isBasic(d.cid));
      case 'assassin':
        return true;
      case 'paladin':
        return damaged;
      case 'tutor':
        return pl.deck.some((d) => card(d.cid).kind === 'trainer');
      case 'energyswap':
        return slotsOf(s, p).length > 1 && slotsOf(s, p).some((x) => x.slot.energy.some((e) => isBasicEnergy(e.cid)));
      case 'hammer':
        return slotsOf(s, other(p)).some((x) => x.slot.energy.length > 0);
      case 'spy':
      case 'mercenary':
        return pl.deck.length > 0;
      case 'smith':
        return pl.discard.some((d) => isBasicEnergy(d.cid)) && slotsOf(s, p).length > 0;
      case 'herbalist':
        return true;
      case 'warchief':
        return handOthers.length < 5 && pl.deck.length > 0;
      case 'thief':
        return opp.hand.length > 0;
      case 'venom':
      case 'snare':
        return !!opp.active;
      case 'guide':
        return pl.bench.length < BENCH_MAX && pl.discard.some((d) => isBasic(d.cid));
      case 'bomb':
        return true;
      case 'scroll2':
        return handOthers.length <= 5 && pl.deck.length > 0;
      case 'tonic':
        return slotsOf(s, p).some((x) => x.slot.damage > 0 || x.slot.conditions.length > 0);
      case 'relay':
        return !!pl.active && pl.bench.length > 0 && pl.active.energy.length > 0;
      case 'shovel':
        return pl.discard.some((d) => card(d.cid).kind === 'trainer');
      case 'nectar':
        return damaged;
      case 'ladder':
        return pl.bench.length > 0;
      default:
        return true;
    }
  }

  candyTargets(p: 0 | 1, exceptUid?: number): { stage2: CardInst; pos: Pos }[] {
    const s = this.s;
    if (isFirstTurnOf(s)) return [];
    const out: { stage2: CardInst; pos: Pos }[] = [];
    for (const h of this.pl(p).hand) {
      if (h.uid === exceptUid) continue;
      const d = card(h.cid);
      if (d.kind !== 'monster' || d.stage !== 'stage2' || !d.evolvesFrom) continue;
      const mid = byNameSafe(d.evolvesFrom);
      if (!mid || mid.kind !== 'monster' || !mid.evolvesFrom) continue;
      for (const { pos, slot } of slotsOf(s, p)) {
        const top = topCard(slot);
        if (top.stage === 'basic' && top.name === mid.evolvesFrom && slot.playedTurn < s.turn && slot.evolvedTurn < s.turn)
          out.push({ stage2: h, pos });
      }
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // Perform actions
  // --------------------------------------------------------------------------
  private *perform(p: 0 | 1, a: Action): Gen<boolean> {
    const s = this.s;
    const pl = this.pl(p);
    switch (a.t) {
      case 'playBasic': {
        const c = this.removeFromHand(p, a.uid);
        pl.bench.push(this.newSlot(c));
        this.emit({ e: 'play', p, uid: c.uid, to: { p, z: 'bench', i: pl.bench.length - 1 } });
        return false;
      }
      case 'evolve': {
        const c = this.removeFromHand(p, a.uid);
        yield* this.evolveSlot(p, a.target, c);
        return false;
      }
      case 'attachEnergy': {
        const c = this.removeFromHand(p, a.uid);
        const slot = slotAt(s, a.target)!;
        slot.energy.push(c);
        s.flags.energyAttached = true;
        this.emit({ e: 'attach', p, uid: c.uid, pos: a.target });
        if ((card(c.cid) as EnergyCard).any) this.putDamage(a.target, 10, 'colorless', 'effect');
        return false;
      }
      case 'playTrainer': {
        const c = this.removeFromHand(p, a.uid);
        const def = card(c.cid) as TrainerCard;
        if (def.sub === 'tool') {
          const slot = slotAt(s, a.target!)!;
          slot.tool = c;
          this.emit({ e: 'attach', p, uid: c.uid, pos: a.target! });
          return false;
        }
        if (def.sub === 'stadium') {
          s.flags.stadiumPlayed = true;
          if (s.stadium) {
            const old = s.stadium;
            this.pl(old.owner).discard.push(old);
          }
          s.stadium = c;
          s.stadiumOwner = p;
          this.emit({ e: 'stadium', p, uid: c.uid });
          return false;
        }
        if (def.sub === 'supporter') s.flags.supporterPlayed = true;
        s.playing = c;
        this.emit({ e: 'trainer', p, uid: c.uid });
        yield* this.trainerEffect(p, def, c);
        s.playing = null;
        pl.discard.push(c);
        this.emit({ e: 'discard', p, uids: [c.uid] });
        return false;
      }
      case 'retreat': {
        const act = pl.active!;
        const disc = act.energy.filter((e) => a.discard.includes(e.uid));
        act.energy = act.energy.filter((e) => !a.discard.includes(e.uid));
        pl.discard.push(...disc);
        if (disc.length) this.emit({ e: 'discard', p, uids: disc.map((d) => d.uid) });
        s.flags.retreated = true;
        this.switchActive(p, a.to);
        this.emit({ e: 'retreat', p });
        return false;
      }
      case 'ability': {
        const slot = slotAt(s, a.pos)!;
        slot.abilityUsedTurn = s.turn;
        const ab = topCard(slot).ability!;
        this.emit({ e: 'ability', p, pos: a.pos, name: ab.name });
        yield* this.useAbility(p, a.pos, slot);
        return false;
      }
      case 'stadium': {
        s.flags.stadiumUsed = true;
        this.emit({ e: 'message', text: `${pl.name}は${cardName(s.stadium!.cid)}の効果を使った` });
        if (stadiumKey(s) === 'mine') {
          const [u] = yield* this.chooseCards(p, 'トラッシュする手札を1枚選んでください', pl.hand, pl.hand.map((c) => c.uid), 1, 1);
          const moved = pl.hand.filter((c) => c.uid === u);
          pl.hand = pl.hand.filter((c) => c.uid !== u);
          pl.discard.push(...moved);
          if (moved.length) this.emit({ e: 'discard', p, uids: [u] });
          this.draw(p, 2);
        } else yield* this.benchFromDeck(p, 1, () => true);
        return false;
      }
      case 'attack': {
        yield* this.attack(p, a.index);
        return true;
      }
      case 'endTurn':
        return true;
    }
  }

  *evolveSlot(p: 0 | 1, pos: Pos, c: CardInst): Gen {
    const s = this.s;
    const slot = slotAt(s, pos)!;
    slot.stack.push(c);
    slot.evolvedTurn = s.turn;
    slot.conditions = [];
    slot.flags = [];
    this.emit({ e: 'evolve', p, uid: c.uid, pos });
    const ab = topCard(slot).ability;
    if (ab?.spec.k === 'onEvolveDraw') {
      this.emit({ e: 'ability', p, pos, name: ab.name });
      this.draw(p, ab.spec.n);
    }
    yield* [];
  }

  switchActive(p: 0 | 1, benchIndex: number) {
    const pl = this.pl(p);
    const old = pl.active!;
    const nu = pl.bench[benchIndex];
    old.conditions = [];
    old.flags = [];
    pl.bench[benchIndex] = old;
    pl.active = nu;
    this.emit({ e: 'switch', p });
  }

  *promptSwitch(p: 0 | 1, chooser: 0 | 1, title: string): Gen<boolean> {
    const pl = this.pl(p);
    if (!pl.bench.length || !pl.active) return false;
    const pos = yield* this.chooseSlot(
      chooser,
      title,
      pl.bench.map((_, i) => ({ p, z: 'bench', i }) as Pos),
    );
    if (!pos || pos.z !== 'bench') return false;
    this.switchActive(p, pos.i);
    return true;
  }

  // --------------------------------------------------------------------------
  // Damage
  // --------------------------------------------------------------------------
  putDamage(pos: Pos, amount: number, type: EType, source: 'attack' | 'effect' | 'checkup', weak = false, resist = false) {
    const slot = slotAt(this.s, pos);
    if (!slot || amount <= 0) return;
    slot.damage += amount;
    this.emit({ e: 'damage', pos, amount, weak, resist, type, source });
  }

  heal(pos: Pos, amount: number) {
    const slot = slotAt(this.s, pos);
    if (!slot || slot.damage <= 0) return;
    const h = Math.min(slot.damage, amount);
    slot.damage -= h;
    this.emit({ e: 'heal', pos, amount: h });
  }

  addCondition(pos: Pos, cond: Condition) {
    const slot = slotAt(this.s, pos);
    if (!slot || pos.z !== 'active') return;
    const rot: Condition[] = ['asleep', 'paralyzed', 'confused'];
    if (rot.includes(cond)) slot.conditions = slot.conditions.filter((c) => !rot.includes(c));
    if (!slot.conditions.includes(cond)) slot.conditions.push(cond);
    this.emit({ e: 'condition', pos, cond });
  }

  /** Is this slot protected from the opponent's attack effects this turn? */
  private prevented(slot: Slot) {
    return !!hasFlag(this.s, slot, 'prevent');
  }

  private benchProtected(p: 0 | 1) {
    return slotsOf(this.s, p).some((x) => hasAbility(x.slot, 'benchBarrier'));
  }

  /** Damage from an attack effect to a non-active or any target (no W/R). */
  snipe(attacker: 0 | 1, pos: Pos, amount: number, type: EType) {
    const slot = slotAt(this.s, pos);
    if (!slot) return;
    if (pos.p !== attacker) {
      if (pos.z === 'bench' && this.benchProtected(pos.p)) return;
      if (this.prevented(slot)) return;
      const red = hasAbility(slot, 'damageReduce');
      if (red && red.k === 'damageReduce') amount -= red.n;
    }
    this.putDamage(pos, amount, type, 'attack');
  }

  private *attack(p: 0 | 1, index: number): Gen {
    const s = this.s;
    const me = this.pl(p);
    const opp = other(p);
    const A = me.active!;
    const mc = topCard(A);
    const atk = mc.attacks[index];
    const effects = atk.effects ?? [];
    const has = <K extends AttackEffect['k']>(k: K) => effects.filter((e) => e.k === k) as Extract<AttackEffect, { k: K }>[];

    this.emit({ e: 'attack', p, name: atk.name, type: mc.type, attacker: A.stack[A.stack.length - 1].uid });

    // confusion
    if (A.conditions.includes('confused')) {
      const h = this.flip(p, 'こんらん');
      if (!h) {
        this.emit({ e: 'fail', p, text: 'こんらんしていてワザが失敗した！' });
        this.putDamage({ p, z: 'active' }, 30, mc.type, 'effect');
        return;
      }
    }

    // gust before damage
    if (has('gustBefore').length && this.pl(opp).bench.length) {
      yield* this.promptSwitch(opp, p, 'バトル場に引きずり出す相手のモンスターを選んでください');
    }

    let dmg = atk.damage ?? 0;
    let failed = false;
    for (const e of effects) {
      switch (e.k) {
        case 'flipMulti': {
          let h = 0;
          for (let i = 0; i < e.flips; i++) if (this.flip(p, atk.name)) h++;
          dmg = h * e.per;
          break;
        }
        case 'flipUntilTails': {
          let h = 0;
          while (this.flip(p, atk.name) && h < 20) h++;
          dmg = h * e.per;
          break;
        }
        case 'flipBonus':
          if (this.flip(p, atk.name)) dmg += e.bonus;
          break;
        case 'flipFail':
          if (!this.flip(p, atk.name)) failed = true;
          break;
        case 'bonusPerEnergy': {
          const oa = this.pl(opp).active;
          const n = (e.on !== 'opp' ? energyCount(A) : 0) + (e.on !== 'self' && oa ? energyCount(oa) : 0);
          dmg += n * e.per;
          break;
        }
        case 'bonusPerSelfDamage':
          dmg += (A.damage / 10) * e.per;
          break;
        case 'bonusIfOppDamaged':
          if ((this.pl(opp).active?.damage ?? 0) > 0) dmg += e.bonus;
          break;
        case 'bonusIfSelfDamaged':
          if (A.damage > 0) dmg += e.bonus;
          break;
        case 'bonusIfOppCondition':
          if (this.pl(opp).active?.conditions.includes(e.cond)) dmg += e.bonus;
          break;
        case 'bonusPerBench': {
          const count = (q: 0 | 1) =>
            this.pl(q).bench.filter((b) => !e.nameIncludes || topCard(b).name.includes(e.nameIncludes)).length;
          const n = (e.whose !== 'opp' ? count(p) : 0) + (e.whose !== 'self' ? count(opp) : 0);
          dmg += n * e.per;
          break;
        }
        case 'bonusPerDiscardMonster': {
          const n = me.discard.filter((c) => card(c.cid).kind === 'monster').length;
          dmg += Math.min(e.max ?? 9999, n * e.per);
          break;
        }
        case 'bonusIfOmega':
          if (this.pl(opp).active && hasRule(topCard(this.pl(opp).active!))) dmg += e.bonus;
          break;
        case 'bonusPerHand':
          dmg += Math.min(e.max ?? 9999, this.pl(e.whose === 'self' ? p : opp).hand.length * e.per);
          break;
        case 'bonusPerTrash': {
          const n = me.discard.filter((c) => (e.of === 'energy' ? card(c.cid).kind === 'energy' : card(c.cid).kind === 'trainer')).length;
          dmg += Math.min(e.max ?? 9999, n * e.per);
          break;
        }
      }
    }
    if (failed) {
      this.emit({ e: 'fail', p, text: `${atk.name}は失敗した！` });
      return;
    }

    // main damage
    const D = this.pl(opp).active;
    const hasDamage = atk.damage !== undefined || effects.some((e) => e.k === 'flipMulti' || e.k === 'flipUntilTails');
    if (D && hasDamage) {
      if (this.prevented(D)) {
        this.emit({ e: 'fail', p, text: 'ワザのダメージは防がれた！' });
      } else if (dmg > 0) {
        // attacker-side modifiers
        dmg += s.flags.attackBonus;
        if (toolKey(A) === 'band') dmg += 20;
        if (toolKey(A) === 'drum' && mc.stage === 'basic') dmg += 30;
        let boost = 0;
        for (const { slot } of slotsOf(s, p)) {
          const sp = hasAbility(slot, 'typeBoost');
          if (sp && sp.k === 'typeBoost') {
            const ok = (!sp.type || sp.type === mc.type) && (!sp.nameIncludes || mc.name.includes(sp.nameIncludes));
            if (ok) boost = Math.max(boost, sp.n);
          }
        }
        dmg += boost;
        const st = stadiumKey(s);
        if (st === 'volcano' && mc.type === 'fire') dmg += 20;
        if (st === 'ruins' && mc.type === 'psychic') dmg += 20;
        if (st === 'crypt' && mc.type === 'dark') dmg += 20;
        if (st === 'peak' && mc.type === 'lightning') dmg += 20;
        if (st === 'battlefield') dmg += 10;
        // weakness / resistance
        const dc = topCard(D);
        let weak = false;
        let resist = false;
        if (dc.weakness && dc.weakness === mc.type) {
          dmg *= 2;
          weak = true;
        }
        if (dc.resistance && dc.resistance === mc.type) {
          dmg -= 30;
          resist = true;
        }
        // defender-side modifiers
        const red = hasAbility(D, 'damageReduce');
        if (red && red.k === 'damageReduce') dmg -= red.n;
        if (toolKey(D) === 'crest' && hasRule(dc)) dmg -= 30;
        if (toolKey(D) === 'tower') dmg -= 20;
        for (const f of D.flags) if (f.k === 'reduce' && f.untilTurn >= s.turn) dmg -= f.n ?? 0;
        dmg = Math.max(0, dmg);
        if (dmg > 0) {
          this.putDamage({ p: opp, z: 'active' }, dmg, mc.type, 'attack', weak, resist);
          if (toolKey(A) === 'fangs') this.heal({ p, z: 'active' }, 20);
          // reactive effects
          const cd = hasAbility(D, 'counterDamage');
          if (cd && cd.k === 'counterDamage') this.putDamage({ p, z: 'active' }, cd.n, topCard(D).type, 'effect');
          if (toolKey(D) === 'helmet') this.putDamage({ p, z: 'active' }, 20, 'colorless', 'effect');
        } else {
          this.emit({ e: 'fail', p, text: 'ダメージを与えられなかった…' });
        }
      }
    }

    // post-damage effects
    for (const e of effects) {
      const Dn = this.pl(opp).active;
      switch (e.k) {
        case 'condition':
          if (Dn && !this.prevented(Dn)) {
            if (!e.flip || this.flip(p, `${atk.name}（${COND_JP[e.cond]}）`)) this.addCondition({ p: opp, z: 'active' }, e.cond);
          }
          break;
        case 'selfCondition':
          this.addCondition({ p, z: 'active' }, e.cond);
          break;
        case 'selfDamage':
          this.putDamage({ p, z: 'active' }, e.n, mc.type, 'effect');
          break;
        case 'healSelf':
          this.heal({ p, z: 'active' }, e.n);
          break;
        case 'benchSnipe': {
          const cnt = e.count ?? 1;
          for (let i = 0; i < cnt; i++) {
            const opts = this.pl(opp).bench.map((_, j) => ({ p: opp, z: 'bench', i: j }) as Pos);
            const pos = yield* this.chooseSlot(p, `${e.n}ダメージを与える相手のベンチモンスターを選んでください`, opts);
            if (pos) this.snipe(p, pos, e.n, mc.type);
          }
          break;
        }
        case 'anySnipe': {
          const opts = slotsOf(s, opp).map((x) => x.pos);
          const pos = yield* this.chooseSlot(p, `${e.n}ダメージを与える相手のモンスターを選んでください`, opts);
          if (pos) this.snipe(p, pos, e.n, mc.type);
          break;
        }
        case 'spread':
          this.pl(opp).bench.forEach((_, i) => this.snipe(p, { p: opp, z: 'bench', i }, e.n, mc.type));
          break;
        case 'hitBench':
          me.bench.forEach((_, i) => this.putDamage({ p, z: 'bench', i }, e.n, mc.type, 'effect'));
          break;
        case 'discardSelfEnergy': {
          const cands = A.energy.filter((c) => !e.type || (card(c.cid) as EnergyCard).provides.includes(e.type));
          let chosen: number[];
          if (e.n === 'all') chosen = A.energy.map((c) => c.uid);
          else if (cands.length <= e.n) chosen = cands.map((c) => c.uid);
          else
            chosen = yield* this.chooseCards(p, `トラッシュするエネルギーを${e.n}枚選んでください`, A.energy, cands.map((c) => c.uid), e.n, e.n);
          this.discardEnergyFrom(p, { p, z: 'active' }, chosen);
          break;
        }
        case 'discardOppEnergy': {
          if (!Dn || !Dn.energy.length || this.prevented(Dn)) break;
          if (e.flip && !this.flip(p, atk.name)) break;
          const chosen = yield* this.chooseCards(
            p,
            'トラッシュする相手のエネルギーを選んでください',
            Dn.energy,
            Dn.energy.map((c) => c.uid),
            Math.min(e.n, Dn.energy.length),
            e.n,
          );
          this.discardEnergyFrom(opp, { p: opp, z: 'active' }, chosen);
          break;
        }
        case 'draw':
          this.draw(p, e.n);
          break;
        case 'discardOppHand': {
          const oh = this.pl(opp).hand;
          const out: CardInst[] = [];
          for (let i = 0; i < e.n && oh.length; i++) out.push(...oh.splice(Math.floor(this.rand() * oh.length), 1));
          if (out.length) {
            this.pl(opp).discard.push(...out);
            this.emit({ e: 'discard', p: opp, uids: out.map((c) => c.uid) });
          }
          break;
        }
        case 'healAllSelf':
          for (const { pos, slot } of slotsOf(s, p)) if (slot.damage > 0) this.heal(pos, e.n);
          break;
        case 'millOpp': {
          const od = this.pl(opp).deck;
          const out = od.splice(0, Math.min(e.n, od.length));
          if (out.length) {
            this.pl(opp).discard.push(...out);
            this.emit({ e: 'discard', p: opp, uids: out.map((c) => c.uid) });
          }
          break;
        }
        case 'searchEnergyAttach':
          yield* this.searchEnergyAttach(p, e.n, e.type, e.from, e.to);
          break;
        case 'callForFamily':
          yield* this.benchFromDeck(p, e.n, (c) => !e.name || c.name.includes(e.name));
          break;
        case 'cantAttackNext':
          A.flags.push({ k: 'cantAttack', untilTurn: s.turn + 2 });
          break;
        case 'reduceNext':
          A.flags.push({ k: 'reduce', n: e.n, untilTurn: s.turn + 1 });
          break;
        case 'preventNext':
          if (!e.flip || this.flip(p, atk.name)) A.flags.push({ k: 'prevent', untilTurn: s.turn + 1 });
          break;
        case 'oppCantRetreat':
          if (Dn) Dn.flags.push({ k: 'cantRetreat', untilTurn: s.turn + 1 });
          break;
        case 'switchSelf':
          if (me.bench.length) yield* this.promptSwitch(p, p, '入れ替えるベンチモンスターを選んでください');
          break;
      }
    }
  }

  discardEnergyFrom(p: 0 | 1, pos: Pos, uids: number[]) {
    const slot = slotAt(this.s, pos);
    if (!slot || !uids.length) return;
    const moved = slot.energy.filter((c) => uids.includes(c.uid));
    slot.energy = slot.energy.filter((c) => !uids.includes(c.uid));
    for (const c of moved) this.pl(c.owner).discard.push(c);
    this.emit({ e: 'discard', p, uids: moved.map((c) => c.uid) });
  }

  *searchEnergyAttach(p: 0 | 1, n: number, type: EType, from: 'deck' | 'discard', to: 'any' | 'bench' | 'self'): Gen {
    const pl = this.pl(p);
    const src = from === 'deck' ? pl.deck : pl.discard;
    const sel = src.filter((c) => isBasicEnergyOf(c.cid, type)).map((c) => c.uid);
    const targets = slotsOf(this.s, p)
      .filter((x) => (to === 'bench' ? x.pos.z === 'bench' : to === 'self' ? x.pos.z === 'active' : true))
      .map((x) => x.pos);
    if (!targets.length) {
      if (from === 'deck') this.shuffle(p);
      return;
    }
    const chosen = yield* this.chooseCards(
      p,
      `${from === 'deck' ? '山札' : 'トラッシュ'}から基本${TYPE_JP[type]}エネルギーを${n}枚まで選んでください`,
      from === 'deck' ? src : src.filter((c) => sel.includes(c.uid)),
      sel,
      0,
      n,
    );
    for (const uid of chosen) {
      const i = src.findIndex((c) => c.uid === uid);
      const c = src.splice(i, 1)[0];
      const pos = yield* this.chooseSlot(p, `${cardName(c.cid)}をつけるモンスターを選んでください`, targets);
      slotAt(this.s, pos!)!.energy.push(c);
      this.emit({ e: 'attach', p, uid: c.uid, pos: pos! });
    }
    if (from === 'deck') this.shuffle(p);
  }

  *benchFromDeck(p: 0 | 1, n: number, filter: (c: MonsterCard) => boolean): Gen {
    const pl = this.pl(p);
    const room = BENCH_MAX - pl.bench.length;
    const sel = pl.deck
      .filter((c) => {
        const d = card(c.cid);
        return d.kind === 'monster' && d.stage === 'basic' && filter(d);
      })
      .map((c) => c.uid);
    const chosen = yield* this.chooseCards(p, `ベンチに出すたねモンスターを${Math.min(n, room)}枚まで選んでください`, pl.deck, sel, 0, Math.min(n, room));
    for (const uid of chosen) {
      const i = pl.deck.findIndex((c) => c.uid === uid);
      const c = pl.deck.splice(i, 1)[0];
      pl.bench.push(this.newSlot(c));
      this.emit({ e: 'play', p, uid: c.uid, to: { p, z: 'bench', i: pl.bench.length - 1 } });
    }
    this.shuffle(p);
  }

  *searchToHand(p: 0 | 1, title: string, filter: (d: CardDef) => boolean, max: number): Gen<number[]> {
    const pl = this.pl(p);
    const sel = pl.deck.filter((c) => filter(card(c.cid))).map((c) => c.uid);
    const chosen = yield* this.chooseCards(p, title, pl.deck, sel, 0, max);
    const got: CardInst[] = [];
    for (const uid of chosen) {
      const i = pl.deck.findIndex((c) => c.uid === uid);
      got.push(pl.deck.splice(i, 1)[0]);
    }
    pl.hand.push(...got);
    if (got.length) this.emit({ e: 'search', p, uids: got.map((c) => c.uid) });
    this.shuffle(p);
    return chosen;
  }

  *fromDiscardToHand(p: 0 | 1, title: string, filter: (d: CardDef) => boolean, max: number): Gen<number[]> {
    const pl = this.pl(p);
    const cands = pl.discard.filter((c) => filter(card(c.cid)));
    const chosen = yield* this.chooseCards(p, title, cands, cands.map((c) => c.uid), 1, max);
    const got = pl.discard.filter((c) => chosen.includes(c.uid));
    pl.discard = pl.discard.filter((c) => !chosen.includes(c.uid));
    pl.hand.push(...got);
    if (got.length) this.emit({ e: 'search', p, uids: got.map((c) => c.uid) });
    return chosen;
  }

  // --------------------------------------------------------------------------
  // Abilities
  // --------------------------------------------------------------------------
  private *useAbility(p: 0 | 1, pos: Pos, slot: Slot): Gen {
    const s = this.s;
    const pl = this.pl(p);
    const spec = topCard(slot).ability!.spec;
    switch (spec.k) {
      case 'drawOnce':
        this.draw(p, spec.n);
        break;
      case 'energyFromHand':
      case 'energyFromDiscard': {
        const src = spec.k === 'energyFromHand' ? pl.hand : pl.discard;
        const cands = src.filter((c) => isBasicEnergyOf(c.cid, spec.type));
        const [uid] = yield* this.chooseCards(p, 'つけるエネルギーを選んでください', cands, cands.map((c) => c.uid), 1, 1);
        const target = yield* this.chooseSlot(p, 'エネルギーをつけるモンスターを選んでください', slotsOf(s, p).map((x) => x.pos));
        const i = src.findIndex((c) => c.uid === uid);
        const c = src.splice(i, 1)[0];
        slotAt(s, target!)!.energy.push(c);
        this.emit({ e: 'attach', p, uid: c.uid, pos: target! });
        if (spec.k === 'energyFromDiscard' && spec.selfDamage) this.putDamage(pos, spec.selfDamage, 'colorless', 'effect');
        break;
      }
      case 'healOnce': {
        const opts = slotsOf(s, p).filter((x) => x.slot.damage > 0).map((x) => x.pos);
        const target = yield* this.chooseSlot(p, '回復するモンスターを選んでください', opts);
        if (target) this.heal(target, spec.n);
        break;
      }
      case 'searchBasicOnce':
        yield* this.benchFromDeck(p, 1, (c) => !spec.nameIncludes || c.name.includes(spec.nameIncludes));
        break;
      case 'switchInOnce':
        if (pos.z === 'bench') this.switchActive(p, pos.i);
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Trainers
  // --------------------------------------------------------------------------
  private *trainerEffect(p: 0 | 1, def: TrainerCard, inst: CardInst): Gen {
    const s = this.s;
    const pl = this.pl(p);
    const opp = other(p);
    const isMon = (d: CardDef) => d.kind === 'monster';
    switch (def.key) {
      case 'research': {
        const h = pl.hand.splice(0);
        pl.discard.push(...h);
        if (h.length) this.emit({ e: 'discard', p, uids: h.map((c) => c.uid) });
        this.draw(p, 7);
        break;
      }
      case 'boss':
        yield* this.promptSwitch(opp, p, 'バトル場に呼び出す相手のベンチモンスターを選んでください');
        break;
      case 'iono': {
        for (const q of [p, opp] as const) {
          const pq = this.pl(q);
          const h = pq.hand.splice(0);
          // shuffle hand then put at bottom
          for (let i = h.length - 1; i > 0; i--) {
            const j = Math.floor(this.rand() * (i + 1));
            [h[i], h[j]] = [h[j], h[i]];
          }
          pq.deck.push(...h);
          this.emit({ e: 'shuffle', p: q });
        }
        for (const q of [p, opp] as const) this.draw(q, this.pl(q).prizes.length);
        break;
      }
      case 'hunter': {
        yield* this.searchToHand(p, 'モンスターを1枚選んでください', isMon, 1);
        yield* this.searchToHand(p, '基本エネルギーを1枚選んでください', (d) => d.kind === 'energy' && d.basic, 1);
        break;
      }
      case 'cleric': {
        const opts = slotsOf(s, p).filter((x) => x.slot.damage > 0 || x.slot.conditions.length).map((x) => x.pos);
        const pos = yield* this.chooseSlot(p, '回復するモンスターを選んでください', opts);
        if (pos) {
          this.heal(pos, 80);
          const sl = slotAt(s, pos)!;
          if (sl.conditions.length) {
            sl.conditions = [];
            this.emit({ e: 'cure', pos });
          }
        }
        break;
      }
      case 'judge': {
        const h = pl.hand.splice(0);
        pl.deck.push(...h);
        this.shuffle(p);
        this.draw(p, 6);
        break;
      }
      case 'necro': {
        yield* this.fromDiscardToHand(p, 'トラッシュから手札に加えるカードを3枚まで選んでください', (d) => isMon(d) || (d.kind === 'energy' && d.basic), 3);
        break;
      }
      case 'general':
        s.flags.attackBonus += 30;
        this.emit({ e: 'message', text: 'この番、ワザのダメージが+30される！' });
        break;
      case 'scholar':
        this.draw(p, pl.bench.length === 0 ? 5 : 3);
        break;
      case 'nest':
        yield* this.benchFromDeck(p, 1, () => true);
        break;
      case 'ultra': {
        const cands = pl.hand;
        const disc = yield* this.chooseCards(p, 'トラッシュする手札を2枚選んでください', cands, cands.map((c) => c.uid), 2, 2);
        const moved = pl.hand.filter((c) => disc.includes(c.uid));
        pl.hand = pl.hand.filter((c) => !disc.includes(c.uid));
        pl.discard.push(...moved);
        this.emit({ e: 'discard', p, uids: disc });
        yield* this.searchToHand(p, '手札に加えるモンスターを選んでください', isMon, 1);
        break;
      }
      case 'potion':
      case 'superpotion': {
        const opts = slotsOf(s, p).filter((x) => x.slot.damage > 0).map((x) => x.pos);
        const pos = yield* this.chooseSlot(p, '回復するモンスターを選んでください', opts);
        if (!pos) break;
        this.heal(pos, def.key === 'potion' ? 30 : 90);
        if (def.key === 'superpotion') {
          const sl = slotAt(s, pos)!;
          if (sl.energy.length) {
            const [u] = yield* this.chooseCards(p, 'トラッシュするエネルギーを選んでください', sl.energy, sl.energy.map((c) => c.uid), 1, 1);
            this.discardEnergyFrom(p, pos, [u]);
          }
        }
        break;
      }
      case 'switch':
        yield* this.promptSwitch(p, p, 'バトル場に出すベンチモンスターを選んでください');
        break;
      case 'candy': {
        const t = this.candyTargets(p, inst.uid);
        const stage2s = [...new Map(t.map((x) => [x.stage2.uid, x.stage2])).values()];
        const [u] = yield* this.chooseCards(p, '進化させる2進化モンスターを選んでください', stage2s, stage2s.map((c) => c.uid), 1, 1);
        const opts = t.filter((x) => x.stage2.uid === u).map((x) => x.pos);
        const pos = yield* this.chooseSlot(p, '進化させるたねモンスターを選んでください', opts);
        const c = this.removeFromHand(p, u);
        yield* this.evolveSlot(p, pos!, c);
        break;
      }
      case 'retrieval':
        yield* this.fromDiscardToHand(p, '手札に加える基本エネルギーを2枚まで選んでください', (d) => d.kind === 'energy' && d.basic, 2);
        break;
      case 'vessel': {
        const disc = yield* this.chooseCards(p, 'トラッシュする手札を1枚選んでください', pl.hand, pl.hand.map((c) => c.uid), 1, 1);
        const moved = pl.hand.filter((c) => disc.includes(c.uid));
        pl.hand = pl.hand.filter((c) => !disc.includes(c.uid));
        pl.discard.push(...moved);
        this.emit({ e: 'discard', p, uids: disc });
        yield* this.searchToHand(p, '基本エネルギーを2枚まで選んでください', (d) => d.kind === 'energy' && d.basic, 2);
        break;
      }
      case 'stretcher':
        yield* this.fromDiscardToHand(p, '手札に加えるカードを選んでください', (d) => isMon(d) || (d.kind === 'energy' && d.basic), 1);
        break;
      case 'pokeball':
        if (this.flip(p, def.name)) yield* this.searchToHand(p, '手札に加えるモンスターを選んでください', isMon, 1);
        break;
      case 'catcher':
        if (this.flip(p, def.name)) yield* this.promptSwitch(opp, p, 'バトル場に呼び出す相手のベンチモンスターを選んでください');
        break;
      case 'compass':
        yield* this.searchToHand(p, '基本エネルギーを1枚選んでください', (d) => d.kind === 'energy' && d.basic, 1);
        break;
      case 'rally':
        yield* this.benchFromDeck(p, 2, () => true);
        break;
      case 'assassin': {
        const opts = slotsOf(s, opp).map((x) => x.pos);
        const pos = yield* this.chooseSlot(p, '30ダメージぶんのダメカンをのせる相手のモンスターを選んでください', opts);
        if (pos) this.putDamage(pos, 30, 'colorless', 'effect');
        break;
      }
      case 'paladin':
        for (const { pos, slot } of slotsOf(s, p)) if (slot.damage > 0) this.heal(pos, 30);
        break;
      case 'tutor':
        yield* this.searchToHand(p, '手札に加えるトレーナーズを選んでください', (d) => d.kind === 'trainer', 1);
        break;
      case 'energyswap': {
        const from = slotsOf(s, p).filter((x) => x.slot.energy.some((e) => isBasicEnergy(e.cid))).map((x) => x.pos);
        const src = yield* this.chooseSlot(p, 'エネルギーを移すモンスターを選んでください', from);
        if (!src) break;
        const sl = slotAt(s, src)!;
        const basics = sl.energy.filter((e) => isBasicEnergy(e.cid));
        const [u] = yield* this.chooseCards(p, '移す基本エネルギーを選んでください', sl.energy, basics.map((c) => c.uid), 1, 1);
        const dests = slotsOf(s, p).filter((x) => !posEq(x.pos, src)).map((x) => x.pos);
        const dst = yield* this.chooseSlot(p, 'エネルギーをつけるモンスターを選んでください', dests);
        if (!dst || u === undefined) break;
        const i = sl.energy.findIndex((c) => c.uid === u);
        const [c] = sl.energy.splice(i, 1);
        slotAt(s, dst)!.energy.push(c);
        this.emit({ e: 'attach', p, uid: c.uid, pos: dst });
        break;
      }
      case 'spy': {
        const top = pl.deck.slice(0, 5);
        if (!top.length) break;
        const [u] = yield* this.chooseCards(p, '手札に加えるカードを1枚選んでください', top, top.map((c) => c.uid), 1, 1);
        const got = top.find((c) => c.uid === u);
        const rest = top.filter((c) => c.uid !== u);
        pl.deck.splice(0, top.length);
        pl.deck.push(...rest);
        if (got) {
          pl.hand.push(got);
          this.emit({ e: 'search', p, uids: [got.uid] });
        }
        break;
      }
      case 'smith': {
        for (let k = 0; k < 2; k++) {
          const cands = pl.discard.filter((d) => isBasicEnergy(d.cid));
          if (!cands.length) break;
          const [u] = yield* this.chooseCards(p, 'つけるエネルギーを選んでください', cands, cands.map((c) => c.uid), 1, 1);
          const target = yield* this.chooseSlot(p, 'エネルギーをつけるモンスターを選んでください', slotsOf(s, p).map((x) => x.pos));
          if (!target || u === undefined) break;
          const i = pl.discard.findIndex((c) => c.uid === u);
          const [c] = pl.discard.splice(i, 1);
          slotAt(s, target)!.energy.push(c);
          this.emit({ e: 'attach', p, uid: c.uid, pos: target });
        }
        break;
      }
      case 'herbalist': {
        for (const { pos, slot } of slotsOf(s, p)) {
          if (slot.conditions.length) {
            slot.conditions = [];
            this.emit({ e: 'cure', pos });
          }
        }
        this.draw(p, 1);
        break;
      }
      case 'warchief':
        this.draw(p, Math.max(0, 5 - pl.hand.length));
        break;
      case 'mercenary': {
        for (let k = 0; k < 2; k++) if (this.flip(p, def.name)) yield* this.searchToHand(p, '手札に加えるカードを1枚選んでください', () => true, 1);
        break;
      }
      case 'thief': {
        const oh = this.pl(opp).hand;
        const out: CardInst[] = [];
        for (let i = 0; i < 2 && oh.length; i++) out.push(...oh.splice(Math.floor(this.rand() * oh.length), 1));
        if (out.length) {
          this.pl(opp).discard.push(...out);
          this.emit({ e: 'discard', p: opp, uids: out.map((c) => c.uid) });
        }
        break;
      }
      case 'venom':
        this.addCondition({ p: opp, z: 'active' }, 'poisoned');
        break;
      case 'snare':
        if (this.flip(p, def.name)) this.addCondition({ p: opp, z: 'active' }, 'paralyzed');
        break;
      case 'guide': {
        const room = BENCH_MAX - pl.bench.length;
        const cands = pl.discard.filter((d) => isBasic(d.cid));
        const chosen = yield* this.chooseCards(p, 'ベンチに出すたねモンスターを選んでください', cands, cands.map((c) => c.uid), 0, Math.min(2, room));
        for (const uid of chosen) {
          const i = pl.discard.findIndex((c) => c.uid === uid);
          const c = pl.discard.splice(i, 1)[0];
          pl.bench.push(this.newSlot(c));
          this.emit({ e: 'play', p, uid: c.uid, to: { p, z: 'bench', i: pl.bench.length - 1 } });
        }
        break;
      }
      case 'bomb': {
        const pos = yield* this.chooseSlot(p, '20ダメージぶんのダメカンをのせる相手のモンスターを選んでください', slotsOf(s, opp).map((x) => x.pos));
        if (pos) this.putDamage(pos, 20, 'colorless', 'effect');
        break;
      }
      case 'scroll2':
        this.draw(p, 2);
        break;
      case 'tonic': {
        const opts = slotsOf(s, p).filter((x) => x.slot.damage > 0 || x.slot.conditions.length).map((x) => x.pos);
        const pos = yield* this.chooseSlot(p, '回復するモンスターを選んでください', opts);
        if (pos) {
          this.heal(pos, 50);
          const sl = slotAt(s, pos)!;
          if (sl.conditions.length) {
            sl.conditions = [];
            this.emit({ e: 'cure', pos });
          }
        }
        break;
      }
      case 'relay': {
        const act = pl.active;
        if (!act) break;
        const dst = yield* this.chooseSlot(p, 'エネルギーを移すベンチモンスターを選んでください', pl.bench.map((_, i) => ({ p, z: 'bench', i }) as Pos));
        if (!dst) break;
        const moved = act.energy.splice(0);
        for (const c of moved) {
          slotAt(s, dst)!.energy.push(c);
          this.emit({ e: 'attach', p, uid: c.uid, pos: dst });
        }
        break;
      }
      case 'shovel':
        yield* this.fromDiscardToHand(p, '手札に加えるトレーナーズを選んでください', (d) => d.kind === 'trainer', 1);
        break;
      case 'nectar': {
        const opts = slotsOf(s, p).filter((x) => x.slot.damage > 0).map((x) => x.pos);
        const pos = yield* this.chooseSlot(p, '回復するモンスターを選んでください', opts);
        if (pos) this.heal(pos, 30);
        this.draw(p, 1);
        break;
      }
      case 'ladder': {
        const ok = yield* this.promptSwitch(p, p, 'バトル場に出すベンチモンスターを選んでください');
        if (ok && pl.active) this.heal({ p, z: 'active' }, 20);
        break;
      }
      case 'hammer': {
        if (!this.flip(p, def.name)) break;
        const opts = slotsOf(s, opp).filter((x) => x.slot.energy.length).map((x) => x.pos);
        const pos = yield* this.chooseSlot(p, 'エネルギーをトラッシュする相手のモンスターを選んでください', opts);
        if (!pos) break;
        const sl = slotAt(s, pos)!;
        const chosen = yield* this.chooseCards(p, 'トラッシュする相手のエネルギーを選んでください', sl.energy, sl.energy.map((c) => c.uid), 1, 1);
        this.discardEnergyFrom(opp, pos, chosen);
        break;
      }
    }
  }

  // --------------------------------------------------------------------------
  // KO / checkup
  // --------------------------------------------------------------------------
  *resolveKOs(): Gen {
    const s = this.s;
    let any = true;
    while (any) {
      any = false;
      const prizesFor: [number, number] = [0, 0];
      for (const p of [s.current, other(s.current)] as const) {
        for (const { pos, slot } of slotsOf(s, p).reverse()) {
          if (slot.damage >= maxHp(s, slot)) {
            any = true;
            const top = topCard(slot);
            this.emit({ e: 'ko', pos, uid: slot.stack[slot.stack.length - 1].uid });
            const pl = this.pl(p);
            pl.discard.push(...slot.stack, ...slot.energy, ...(slot.tool ? [slot.tool] : []));
            if (pos.z === 'active') pl.active = null;
            else pl.bench.splice(pos.i, 1);
            prizesFor[other(p)] += prizeValue(top);
          }
        }
      }
      if (!any) break;
      // take prizes
      for (const q of [s.current, other(s.current)] as const) {
        const n = prizesFor[q];
        if (!n) continue;
        const pl = this.pl(q);
        const got = pl.prizes.splice(0, Math.min(n, pl.prizes.length));
        pl.hand.push(...got);
        this.emit({ e: 'prize', p: q, uids: got.map((c) => c.uid) });
      }
      // win conditions
      const lost: [boolean, boolean] = [false, false];
      const reason: [string, string] = ['', ''];
      for (const q of [0, 1] as const) {
        if (this.pl(q).prizes.length === 0 && prizesFor[q] > 0) {
          lost[other(q)] = true;
          reason[other(q)] = `${this.pl(q).name}がサイドをすべてとった！`;
        }
        if (!this.pl(q).active && this.pl(q).bench.length === 0) {
          lost[q] = true;
          reason[q] = `${this.pl(q).name}の場にモンスターがいなくなった！`;
        }
      }
      if (lost[0] && lost[1]) this.win(-1, '引き分け！');
      if (lost[0]) this.win(1, reason[0]);
      if (lost[1]) this.win(0, reason[1]);
      // promote
      for (const q of [other(s.current), s.current] as const) {
        const pl = this.pl(q);
        if (!pl.active && pl.bench.length) {
          const pos = yield* this.chooseSlot(
            q,
            '新しいバトルモンスターを選んでください',
            pl.bench.map((_, i) => ({ p: q, z: 'bench', i }) as Pos),
          );
          const i = pos && pos.z === 'bench' ? pos.i : 0;
          pl.active = pl.bench.splice(i, 1)[0];
          this.emit({ e: 'promote', p: q });
        }
      }
    }
  }

  private *checkup(): Gen {
    const s = this.s;
    this.emit({ e: 'checkup' });
    const order = [s.current, other(s.current)] as const;
    for (const p of order) {
      const slot = this.pl(p).active;
      if (!slot) continue;
      const pos: Pos = { p, z: 'active' };
      if (slot.conditions.includes('poisoned')) this.putDamage(pos, stadiumKey(s) === 'swamp' ? 30 : 10, 'grass', 'checkup');
      if (slot.conditions.includes('burned')) {
        this.putDamage(pos, 20, 'fire', 'checkup');
        if (this.flip(p, 'やけどの回復')) {
          slot.conditions = slot.conditions.filter((c) => c !== 'burned');
          this.emit({ e: 'cure', pos });
        }
      }
      if (slot.conditions.includes('asleep')) {
        if (this.flip(p, 'ねむりの回復')) {
          slot.conditions = slot.conditions.filter((c) => c !== 'asleep');
          this.emit({ e: 'cure', pos });
        }
      }
      if (slot.conditions.includes('paralyzed') && p === s.current) {
        slot.conditions = slot.conditions.filter((c) => c !== 'paralyzed');
        this.emit({ e: 'cure', pos });
      }
    }
    if (stadiumKey(s) === 'oasis') {
      for (const p of order) if (this.pl(p).active && this.pl(p).active!.damage > 0) this.heal({ p, z: 'active' }, 10);
    }
    // abilities between turns
    for (const p of order) {
      for (const { pos, slot } of slotsOf(s, p)) {
        const r = hasAbility(slot, 'regen');
        if (r && r.k === 'regen' && slot.damage > 0) this.heal(pos, r.n);
        const nm = hasAbility(slot, 'nightmare');
        if (nm && nm.k === 'nightmare') {
          const oa = this.pl(other(p)).active;
          if (oa && oa.conditions.includes('asleep')) this.putDamage({ p: other(p), z: 'active' }, nm.n, 'psychic', 'checkup');
        }
      }
    }
    yield* this.resolveKOs();
  }

  // --------------------------------------------------------------------------
  // Log text
  // --------------------------------------------------------------------------
  private slotName(pos: Pos) {
    const sl = slotAt(this.s, pos);
    return sl ? topCard(sl).name : '???';
  }

  describe(ev: GameEvent): string | null {
    const s = this.s;
    const n = (p: 0 | 1) => s.players[p].name;
    switch (ev.e) {
      case 'coin':
        return `コイン${ev.label ? `（${ev.label}）` : ''}：${ev.heads ? 'オモテ' : 'ウラ'}`;
      case 'first':
        return `${n(ev.p)}の先攻でゲーム開始！`;
      case 'mulligan':
        return `${n(ev.p)}の手札にたねモンスターがいない！引き直し`;
      case 'turn':
        return `━━ ターン${ev.turn}：${n(ev.p)}の番 ━━`;
      case 'draw':
        return ev.uids.length > 1 ? `${n(ev.p)}はカードを${ev.uids.length}枚引いた` : null;
      case 'play':
        return `${n(ev.p)}は${cardName(this.findCid(ev.uid))}をベンチに出した`;
      case 'evolve':
        return `${n(ev.p)}は${cardName(this.findCid(ev.uid))}に進化させた！`;
      case 'attach':
        return `${n(ev.p)}は${cardName(this.findCid(ev.uid))}を${this.slotName(ev.pos)}につけた`;
      case 'trainer':
        return `${n(ev.p)}は${cardName(this.findCid(ev.uid))}を使った`;
      case 'stadium':
        return `${n(ev.p)}はスタジアム「${cardName(this.findCid(ev.uid))}」を出した`;
      case 'retreat':
        return `${n(ev.p)}はバトルモンスターをにがした`;
      case 'ability':
        return `${this.slotName(ev.pos)}の特性「${ev.name}」！`;
      case 'attack':
        return `${n(ev.p)}の${cardName(this.findCid(ev.attacker))}の「${ev.name}」！`;
      case 'damage':
        return `${this.slotName(ev.pos)}に${ev.amount}ダメージ${ev.weak ? '（弱点！）' : ''}${ev.resist ? '（抵抗力）' : ''}`;
      case 'heal':
        return `${this.slotName(ev.pos)}のHPが${ev.amount}回復した`;
      case 'condition':
        return `${this.slotName(ev.pos)}は${COND_JP[ev.cond]}になった！`;
      case 'cure':
        return `${this.slotName(ev.pos)}の状態が回復した`;
      case 'ko':
        return `${cardName(this.findCid(ev.uid))}はきぜつした！`;
      case 'prize':
        return `${n(ev.p)}はサイドを${ev.uids.length}枚とった！`;
      case 'promote':
        return `${n(ev.p)}は${s.players[ev.p].active ? topCard(s.players[ev.p].active!).name : ''}をバトル場に出した`;
      case 'fail':
        return ev.text;
      case 'message':
        return ev.text;
      case 'gameover':
        return ev.reason;
      default:
        return null;
    }
  }

  findCid(uid: number): string {
    const s = this.s;
    if (s.playing?.uid === uid) return s.playing.cid;
    if (s.stadium?.uid === uid) return s.stadium.cid;
    for (const pl of s.players) {
      for (const z of [pl.hand, pl.deck, pl.discard, pl.prizes]) {
        const c = z.find((x) => x.uid === uid);
        if (c) return c.cid;
      }
      for (const sl of [pl.active, ...pl.bench]) {
        if (!sl) continue;
        const c = [...sl.stack, ...sl.energy, ...(sl.tool ? [sl.tool] : [])].find((x) => x.uid === uid);
        if (c) return c.cid;
      }
    }
    return '';
  }
}

// ----------------------------------------------------------------------------
export function actionEq(a: Action, b: Action): boolean {
  if (a.t !== b.t) return false;
  const A = a as Record<string, unknown>;
  const B = b as Record<string, unknown>;
  if (A.uid !== B.uid || A.index !== B.index || A.to !== B.to) return false;
  const ta = (A.target ?? A.pos) as Pos | undefined;
  const tb = (B.target ?? B.pos) as Pos | undefined;
  if (!!ta !== !!tb) return false;
  if (ta && tb && !posEq(ta, tb)) return false;
  return true;
}

function freshFlags() {
  return { energyAttached: false, supporterPlayed: false, stadiumPlayed: false, retreated: false, stadiumUsed: false, attackBonus: 0 };
}

export function isBasic(cid: string) {
  const d = card(cid);
  return d.kind === 'monster' && d.stage === 'basic';
}

export function isBasicEnergy(cid: string) {
  const d = card(cid);
  return d.kind === 'energy' && d.basic;
}

export function isBasicEnergyOf(cid: string, t: EType) {
  const d = card(cid);
  return d.kind === 'energy' && d.basic && d.provides.includes(t);
}

function byNameSafe(name: string) {
  try {
    return byName(name);
  } catch {
    return null;
  }
}

/** Pick energy to discard for a retreat: prefer the least useful units. */
export function autoRetreatDiscard(slot: Slot, cost: number): number[] {
  if (cost <= 0) return [];
  const es = [...slot.energy].sort((a, b) => {
    const ca = card(a.cid) as EnergyCard;
    const cb = card(b.cid) as EnergyCard;
    // discard basic before special, single before double
    const sa = (ca.basic ? 0 : 2) + ((ca.count ?? 1) > 1 ? 1 : 0);
    const sb = (cb.basic ? 0 : 2) + ((cb.count ?? 1) > 1 ? 1 : 0);
    return sa - sb;
  });
  const out: number[] = [];
  let paid = 0;
  for (const e of es) {
    if (paid >= cost) break;
    out.push(e.uid);
    paid += (card(e.cid) as EnergyCard).count ?? 1;
  }
  return out;
}
