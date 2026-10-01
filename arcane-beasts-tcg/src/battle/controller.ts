// ============================================================================
// Battle controller — drives the rules engine, replays frames with timing and
// dispatches FX, runs the CPU, and exposes human prompts to the UI.
// ============================================================================
import { create } from 'zustand';
import { aiAnswer, type Difficulty } from '../engine/ai';
import { card } from '../engine/cards';
import { Game, slotAt, topCard } from '../engine/game';
import type { Action, Answer, Frame, GameEvent, GameState, MonsterCard, Prompt } from '../engine/types';
import { attackSound, cry, foley, sfx } from '../audio/audio';
import { fx } from './fx';

export const HUMAN = 0 as const;

/** what the battle screen needs from whatever runs the match (CPU game or online) */
export interface BattleDriver {
  speed: number;
  autoHuman: boolean;
  start(): void;
  dispose(): void;
  surrender(): void;
  legal(): Action[];
  answer(a: Answer): void;
  act(a: Action): void;
}

export interface BattleStats {
  kos: number;
  damage: number;
  prizes: number;
  prizesLost: number;
  evolves: number;
  trainers: number;
}
const EMPTY: BattleStats = { kos: 0, damage: 0, prizes: 0, prizesLost: 0, evolves: 0, trainers: 0 };

export interface BattleResult {
  winner: 0 | 1 | -1;
  reason: string;
}

interface BattleStore {
  view: GameState | null;
  prompt: Prompt | null;
  thinking: boolean;
  result: BattleResult | null;
  lastEvent: GameEvent | null;
  stats: BattleStats;
  hover: string | null; // cid being previewed
  setHover: (cid: string | null) => void;
  /** online: who the game waits for (0 = you) and when they run out of time (epoch ms) */
  timer: { actor: 0 | 1; until: number } | null;
  /** online: the opponent dropped; they forfeit at this time (epoch ms) */
  peerOffline: number | null;
  /** online: the latest stamp received */
  incomingStamp: { key: number; id: string; from: 0 | 1 | 'spectator' } | null;
  /** online: what the server decided (rank change etc.) */
  onlineResult: import('../online/protocol').ServerMsg | null;
}

export const useBattle = create<BattleStore>((set) => ({
  view: null,
  prompt: null,
  thinking: false,
  result: null,
  lastEvent: null,
  stats: { ...EMPTY },
  hover: null,
  setHover: (cid) => set({ hover: cid }),
  timer: null,
  peerOffline: null,
  incomingStamp: null,
  onlineResult: null,
}));

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__battle = useBattle;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** a source of frames to replay on the board with timing, sound and effects */
export abstract class FramePlayer {
  speed = 1;
  /** extra speed-up while catching up on a backlog */
  protected boost = 1;
  protected disposed = false;
  /** watching an online game: nobody is "you" */
  protected spectator = false;
  protected get rate() {
    return this.speed * this.boost;
  }

  /** find a card in a state snapshot; `fallbackCid` is consulted for cards that left the table */
  protected cidIn(s: GameState, uid: number): string {
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
    return this.fallbackCid(uid);
  }
  protected fallbackCid(_uid: number): string {
    return '';
  }

  protected tally(ev: GameEvent) {
    const st = { ...useBattle.getState().stats };
    if (ev.e === 'ko' && ev.pos.p === 1) st.kos++;
    else if (ev.e === 'damage' && ev.pos.p === 1 && ev.source === 'attack') st.damage += ev.amount;
    else if (ev.e === 'prize') {
      if (ev.p === HUMAN) st.prizes += ev.uids.length;
      else st.prizesLost += ev.uids.length;
    } else if (ev.e === 'evolve' && ev.p === HUMAN) st.evolves++;
    else if ((ev.e === 'trainer' || ev.e === 'stadium') && ev.p === HUMAN) st.trainers++;
    else return;
    useBattle.setState({ stats: st });
  }

  protected async play(f: Frame) {
    const ev = f.ev;
    this.tally(ev);
    const prev = useBattle.getState().view;
    useBattle.setState({ view: f.state, lastEvent: ev });
    const d = (ms: number) => sleep(ms / this.rate);
    const s = f.state;
    switch (ev.e) {
      case 'start':
        sfx('gamestart', 0.8);
        return d(300);
      case 'shuffle':
        foley.shuffle();
        fx.deckShuffle(ev.p);
        return d(260);
      case 'draw':
        for (let i = 0; i < Math.min(ev.uids.length, 7); i++) setTimeout(() => foley.slide(), (i * 90) / this.rate);
        return d(ev.uids.length > 1 ? 420 + ev.uids.length * 60 : 380);
      case 'mulligan':
        fx.banner(`${s.players[ev.p].name}：たねモンスターがいない！引き直し`, 'info');
        return d(1300);
      case 'coin':
        fx.coin(ev.heads, ev.label ?? '');
        setTimeout(() => sfx('gold', 0.7), 150);
        return d(1500);
      case 'first':
        fx.banner(ev.p === HUMAN && !this.spectator ? 'あなたの先攻！' : `${s.players[ev.p].name}の先攻！`, 'turn');
        return d(1300);
      case 'setupDone':
        sfx('horn-1', 0.6);
        fx.banner('バトル開始！', 'start');
        return d(1500);
      case 'turn':
        sfx(ev.p === HUMAN ? 'bell' : 'receive', 0.7);
        fx.banner(this.spectator ? `${s.players[ev.p].name}の番` : ev.p === HUMAN ? 'あなたの番' : '相手の番', ev.p === HUMAN ? 'myturn' : 'oppturn');
        return d(1100);
      case 'play': {
        foley.place();
        const mc = card(this.cidIn(s, ev.uid)) as MonsterCard;
        setTimeout(() => cry(mc), 180 / this.rate);
        fx.dust(ev.to);
        return d(520);
      }
      case 'evolve': {
        sfx('magic-holy-1', 0.7);
        fx.evolve(ev.pos);
        const mc = card(this.cidIn(s, ev.uid)) as MonsterCard;
        setTimeout(() => cry(mc), 600 / this.rate);
        fx.callout(ev.pos, '進化！', 'evolve');
        return d(1300);
      }
      case 'attach': {
        const c = card(this.cidIn(s, ev.uid));
        if (c.kind === 'energy') {
          sfx('magicmissile', 0.45);
          fx.energy(ev.pos, c.energyType);
        } else {
          foley.place();
          sfx('checkbox', 0.6);
        }
        return d(520);
      }
      case 'trainer':
        foley.whoosh();
        sfx('expand', 0.5);
        return d(1150);
      case 'stadium':
        foley.whoosh();
        sfx('magic-holy-2', 0.6);
        fx.banner(`スタジアム「${card(this.cidIn(s, ev.uid)).name}」`, 'info');
        return d(1200);
      case 'discard':
        foley.slide();
        return d(260);
      case 'search':
        foley.flip();
        return d(420);
      case 'retreat':
      case 'switch':
      case 'promote':
        foley.whoosh();
        return d(560);
      case 'ability':
        sfx('magic-faeriefire', 0.5);
        fx.ability(ev.pos, ev.name);
        return d(1050);
      case 'attack': {
        const atk = (prev && prev.players[ev.p].active) ? topCard(prev.players[ev.p].active!) : null;
        fx.attack(ev.p, ev.name, ev.type);
        setTimeout(() => attackSound(ev.type, true), 280 / this.rate);
        if (atk) setTimeout(() => cry(atk), 20);
        return d(900);
      }
      case 'damage': {
        const sl = slotAt(s, ev.pos);
        const heavy = ev.amount >= 100;
        fx.hit(ev.pos, ev.amount, ev.type, { weak: ev.weak, resist: ev.resist, heavy, source: ev.source });
        if (ev.source === 'checkup') sfx(ev.type === 'fire' ? 'fire' : 'poison', 0.6);
        else sfx(heavy ? 'explosion' : 'squishy-hit', heavy ? 0.45 : 0.6);
        void sl;
        return d(ev.weak ? 1100 : 820);
      }
      case 'heal':
        sfx('heal', 0.6);
        fx.heal(ev.pos, ev.amount);
        return d(750);
      case 'condition':
        sfx(ev.cond === 'poisoned' ? 'poison' : ev.cond === 'asleep' ? 'slowed' : ev.cond === 'paralyzed' ? 'lightning' : ev.cond === 'burned' ? 'fire' : 'wail-sml', 0.5);
        fx.condition(ev.pos, ev.cond);
        return d(800);
      case 'cure':
        sfx('potion', 0.5);
        fx.callout(ev.pos, '回復！', 'heal');
        return d(600);
      case 'ko': {
        const sl = prev ? slotAt(prev, ev.pos) : null;
        if (sl) cry(topCard(sl), true);
        sfx('rumble', 0.5);
        fx.ko(ev.pos);
        await d(1200);
        return;
      }
      case 'prize':
        foley.flip();
        sfx('open-chest', 0.5);
        fx.banner(this.spectator ? `${s.players[ev.p].name}がサイドを${ev.uids.length}枚とった` : ev.p === HUMAN ? `サイドを${ev.uids.length}枚とった！` : `相手がサイドを${ev.uids.length}枚とった`, ev.p === HUMAN ? 'good' : 'bad');
        return d(1000);
      case 'fail':
        sfx('miss-1', 0.6);
        fx.toast(ev.text);
        return d(900);
      case 'message':
        fx.toast(ev.text);
        return d(900);
      case 'checkup':
        return d(200);
      case 'gameover':
        stopFx();
        return d(600);
    }
  }
}

export class BattleController extends FramePlayer implements BattleDriver {
  game: Game;
  level: Difficulty;
  autoHuman = false;
  private running = false;
  private actionsThisTurn = 0;
  private lastTurn = 0;

  constructor(decks: [string[], string[]], names: [string, string], level: Difficulty) {
    super();
    this.game = Game.create(decks, names, (Math.random() * 2 ** 31) | 0, { record: true });
    this.level = level;
    useBattle.setState({ view: structuredClone(this.game.s), prompt: null, result: null, thinking: false, lastEvent: null, hover: null, stats: { ...EMPTY } });
  }

  protected fallbackCid(uid: number) {
    return this.game.findCid(uid);
  }

  start() {
    this.game.start();
    void this.pump();
  }

  dispose() {
    this.disposed = true;
  }

  surrender() {
    this.disposed = true;
    useBattle.setState({ result: { winner: 1, reason: 'あなたは降参した…' }, prompt: null, thinking: false });
  }

  /** Legal actions for the human right now. */
  legal(): Action[] {
    const pr = this.game.pending;
    if (!pr || pr.type !== 'action' || pr.player !== HUMAN) return [];
    return this.game.legalActions(HUMAN);
  }

  answer(a: Answer) {
    const pr = this.game.pending;
    if (!pr || pr.player !== HUMAN || this.running || this.autoHuman) return;
    try {
      this.game.answer(a);
    } catch (e) {
      console.error(e);
      return;
    }
    useBattle.setState({ prompt: null });
    void this.pump();
  }

  act(action: Action) {
    this.answer({ type: 'action', action });
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        if (this.disposed) return;
        const frames = this.game.drainFrames();
        for (const f of frames) {
          if (this.disposed) return;
          await this.play(f);
        }
        if (this.game.over) {
          useBattle.setState({ result: { winner: this.game.s.winner as 0 | 1 | -1, reason: this.game.s.winReason }, prompt: null });
          return;
        }
        const pr = this.game.pending;
        if (!pr) return;
        if (pr.player === HUMAN && !this.autoHuman) {
          useBattle.setState({ prompt: pr, view: structuredClone(this.game.s), thinking: false });
          return;
        }
        // CPU turn
        if (this.game.s.turn !== this.lastTurn) {
          this.lastTurn = this.game.s.turn;
          this.actionsThisTurn = 0;
        }
        useBattle.setState({ thinking: pr.type === 'action' });
        await sleep((pr.type === 'action' ? 520 : 380) / this.rate);
        if (this.disposed) return;
        if (pr.type === 'action') this.actionsThisTurn++;
        const ans = aiAnswer(this.game, pr.player === HUMAN ? 'normal' : this.level, this.actionsThisTurn);
        this.game.answer(ans);
      }
    } finally {
      this.running = false;
      useBattle.setState({ thinking: false });
    }
  }
}

function stopFx() {
  /* hook for future cleanup */
}
