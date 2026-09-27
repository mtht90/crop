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
  hover: string | null; // cid being previewed
  setHover: (cid: string | null) => void;
}

export const useBattle = create<BattleStore>((set) => ({
  view: null,
  prompt: null,
  thinking: false,
  result: null,
  lastEvent: null,
  hover: null,
  setHover: (cid) => set({ hover: cid }),
}));

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__battle = useBattle;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BattleController {
  game: Game;
  level: Difficulty;
  speed = 1;
  autoHuman = false;
  private running = false;
  private disposed = false;
  private actionsThisTurn = 0;
  private lastTurn = 0;

  constructor(decks: [string[], string[]], names: [string, string], level: Difficulty) {
    this.game = Game.create(decks, names, (Math.random() * 2 ** 31) | 0, { record: true });
    this.level = level;
    useBattle.setState({ view: structuredClone(this.game.s), prompt: null, result: null, thinking: false, lastEvent: null, hover: null });
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
        await sleep((pr.type === 'action' ? 520 : 380) / this.speed);
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

  // --------------------------------------------------------------------------
  // Frame playback
  // --------------------------------------------------------------------------
  private async play(f: Frame) {
    const ev = f.ev;
    const prev = useBattle.getState().view;
    useBattle.setState({ view: f.state, lastEvent: ev });
    const d = (ms: number) => sleep(ms / this.speed);
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
        for (let i = 0; i < Math.min(ev.uids.length, 7); i++) setTimeout(() => foley.slide(), (i * 90) / this.speed);
        return d(ev.uids.length > 1 ? 420 + ev.uids.length * 60 : 380);
      case 'mulligan':
        fx.banner(`${s.players[ev.p].name}：たねモンスターがいない！引き直し`, 'info');
        return d(1300);
      case 'coin':
        fx.coin(ev.heads, ev.label ?? '');
        setTimeout(() => sfx('gold', 0.7), 150);
        return d(1500);
      case 'first':
        fx.banner(ev.p === HUMAN ? 'あなたの先攻！' : `${s.players[ev.p].name}の先攻！`, 'turn');
        return d(1300);
      case 'setupDone':
        sfx('horn-1', 0.6);
        fx.banner('バトル開始！', 'start');
        return d(1500);
      case 'turn':
        sfx(ev.p === HUMAN ? 'bell' : 'receive', 0.7);
        fx.banner(ev.p === HUMAN ? 'あなたの番' : '相手の番', ev.p === HUMAN ? 'myturn' : 'oppturn');
        return d(1100);
      case 'play': {
        foley.place();
        const mc = card(this.game.findCidIn(s, ev.uid)) as MonsterCard;
        setTimeout(() => cry(mc), 180 / this.speed);
        fx.dust(ev.to);
        return d(520);
      }
      case 'evolve': {
        sfx('magic-holy-1', 0.7);
        fx.evolve(ev.pos);
        const mc = card(this.game.findCidIn(s, ev.uid)) as MonsterCard;
        setTimeout(() => cry(mc), 600 / this.speed);
        fx.callout(ev.pos, '進化！', 'evolve');
        return d(1300);
      }
      case 'attach': {
        const c = card(this.game.findCidIn(s, ev.uid));
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
        fx.banner(`スタジアム「${card(this.game.findCidIn(s, ev.uid)).name}」`, 'info');
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
        setTimeout(() => attackSound(ev.type, true), 280 / this.speed);
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
        fx.banner(ev.p === HUMAN ? `サイドを${ev.uids.length}枚とった！` : `相手がサイドを${ev.uids.length}枚とった`, ev.p === HUMAN ? 'good' : 'bad');
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

function stopFx() {
  /* hook for future cleanup */
}

// helper on Game prototype to find a cid in an arbitrary state snapshot
declare module '../engine/game' {
  interface Game {
    findCidIn(s: GameState, uid: number): string;
  }
}
Game.prototype.findCidIn = function (this: Game, s: GameState, uid: number): string {
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
  return this.findCid(uid);
};
