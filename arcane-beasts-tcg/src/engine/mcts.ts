// ============================================================================
// Monte Carlo move choice (the strongest CPU levels).
//
// For the move in hand, every legal action is tried many times: the hidden
// cards are dealt again at random (the opponent's hand and deck, and our own
// deck order — what the CPU cannot know), the action is played, and the rest
// of the game is played out quickly by a simple rule-based policy for both
// sides. The action that wins most often is chosen. Tries go to the more
// promising actions first (UCB), within a time budget.
// ============================================================================
import { canPay, energyUnits, Game, hpLeft, other, topCard } from './game';
import { evaluate, heuristicAnswer } from './ai';
import { sensibleActions } from './aiRules';
import type { Action, GameState, Slot } from './types';

const rnd = (n: number) => Math.floor(Math.random() * n);

/** the best damage the slot can deal right now (and the attack index) */
function bestAttack(s: GameState, p: 0 | 1, slot: Slot, legal: Action[]): { a: Action | null; dmg: number } {
  let best: Action | null = null;
  let dmg = -1;
  const mc = topCard(slot);
  for (const a of legal) {
    if (a.t !== 'attack') continue;
    let d = mc.attacks[a.index].damage ?? 10;
    const opp = s.players[other(p)].active;
    if (opp && topCard(opp).weakness === mc.type) d *= 2;
    if (d > dmg) {
      dmg = d;
      best = a;
    }
  }
  return { a: best, dmg };
}

/** whether the slot still needs energy for its best attack */
function needsEnergy(slot: Slot): boolean {
  const atks = topCard(slot).attacks;
  const units = energyUnits(slot);
  return !atks.every((a) => canPay(units, a.cost));
}

/**
 * a fast, sensible policy for play-outs: evolve, fill the bench, power up the
 * attacker, use trainers, then attack with the hardest hit (or knock out).
 */
export function quickAction(g: Game, p: 0 | 1): Action {
  const s = g.s;
  const legal = g.legalActions(p);
  if (legal.length <= 1) return legal[0] ?? { t: 'endTurn' };
  const pl = s.players[p];
  const act = pl.active;
  // a knock-out is always taken
  if (act) {
    const { a, dmg } = bestAttack(s, p, act, legal);
    const opp = s.players[other(p)].active;
    if (a && opp && dmg >= hpLeft(s, opp)) return a;
  }
  const evolve = legal.filter((a) => a.t === 'evolve');
  if (evolve.length) return evolve[rnd(evolve.length)];
  const basics = legal.filter((a) => a.t === 'playBasic');
  if (basics.length && pl.bench.length < 3) return basics[rnd(basics.length)];
  const energy = legal.filter((a) => a.t === 'attachEnergy');
  if (energy.length) {
    // the active first while it still needs energy, else a benched monster that does
    const toActive = energy.find((a) => a.t === 'attachEnergy' && a.target.z === 'active');
    if (toActive && act && needsEnergy(act)) return toActive;
    const toBench = energy.filter((a) => a.t === 'attachEnergy' && a.target.z === 'bench' && needsEnergy(pl.bench[a.target.z === 'bench' ? a.target.i : 0]));
    if (toBench.length) return toBench[rnd(toBench.length)];
    if (toActive) return toActive;
  }
  // trainers: play them more often than not (draw, search, heal…)
  const trainers = legal.filter((a) => a.t === 'playTrainer');
  if (trainers.length && Math.random() < 0.7) return trainers[rnd(trainers.length)];
  if (basics.length && pl.bench.length < 5 && Math.random() < 0.5) return basics[rnd(basics.length)];
  if (act) {
    const { a } = bestAttack(s, p, act, legal);
    if (a) return a;
  }
  return { t: 'endTurn' };
}

/** play the game out from here with the quick policy; 1 = p wins, 0 = loses, in between by the board */
function playout(g: Game, p: 0 | 1, maxTurns: number): number {
  const endTurn = g.s.turn + maxTurns;
  let guard = 0;
  let actions = 0;
  let lastTurn = g.s.turn;
  while (g.pending && g.s.phase !== 'over' && guard++ < 1500) {
    if (g.s.turn !== lastTurn) {
      lastTurn = g.s.turn;
      actions = 0;
      if (g.s.turn > endTurn) break;
    }
    const pr = g.pending;
    if (pr.type === 'action') {
      actions++;
      g.answer({ type: 'action', action: actions > 30 ? { t: 'endTurn' } : quickAction(g, pr.player) });
    } else g.answer(heuristicAnswer(g, pr));
  }
  if (g.s.phase === 'over') return g.s.winner === p ? 1 : g.s.winner === -1 ? 0.5 : 0;
  // not over: judge the board (a squashed score)
  return 1 / (1 + Math.exp(-evaluate(g.s, p) / 250));
}

/** deal the hidden cards again: the opponent's hand and deck, and our own deck order */
function determinize(g: Game, p: 0 | 1) {
  const o = other(p);
  const op = g.s.players[o];
  const pool = [...op.hand, ...op.deck];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  op.hand = pool.slice(0, op.hand.length);
  op.deck = pool.slice(op.hand.length);
  const me = g.s.players[p];
  for (let i = me.deck.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [me.deck[i], me.deck[j]] = [me.deck[j], me.deck[i]];
  }
}

export interface MctsOptions {
  budgetMs: number;
  /** turns to play out before judging the board */
  horizon: number;
  /** sees the hidden cards (the opponent's hand, both decks' order): no re-dealing */
  peek?: boolean;
}

/** a search over the legal actions, run in slices so the screen can keep moving */
class Search {
  legal: Action[];
  stats: { n: number; w: number }[];
  total = 0;
  constructor(
    private g: Game,
    private p: 0 | 1,
    private opt: MctsOptions,
  ) {
    this.legal = sensibleActions(g, p, g.legalActions(p));
    this.stats = this.legal.map(() => ({ n: 0, w: 0 }));
  }
  /** one play-out: UCB1 picks the action (each is tried once first) */
  step() {
    const { stats } = this;
    let k = stats.findIndex((x) => x.n === 0);
    if (k < 0) {
      let best = -Infinity;
      for (let i = 0; i < stats.length; i++) {
        const x = stats[i];
        const u = x.w / x.n + 0.9 * Math.sqrt(Math.log(this.total) / x.n);
        if (u > best) {
          best = u;
          k = i;
        }
      }
    }
    const f = this.g.fork();
    if (!this.opt.peek) determinize(f, this.p);
    let v = 0;
    try {
      f.answer({ type: 'action', action: this.legal[k] });
      v = playout(f, this.p, this.opt.horizon);
    } catch {
      v = 0;
    }
    stats[k].n++;
    stats[k].w += v;
    this.total++;
  }
  /** play-outs until `until` (ms timestamp) */
  run(until: number) {
    while (Date.now() < until) this.step();
  }
  /** the leader is so far ahead that the rest of the time cannot change the pick */
  settled(msLeft: number, msSpent: number) {
    if (this.total < this.legal.length * 4 || msSpent <= 0) return false;
    const rate = this.total / msSpent;
    const ns = this.stats.map((x) => x.n).sort((a, b) => b - a);
    return ns[0] - (ns[1] ?? 0) > rate * msLeft;
  }
  /** the most tried action is the most trusted */
  best(): Action {
    const { stats } = this;
    let k = 0;
    for (let i = 1; i < stats.length; i++) if (stats[i].n > stats[k].n || (stats[i].n === stats[k].n && stats[i].w > stats[k].w)) k = i;
    return this.legal[k];
  }
}

/** choose an action by Monte Carlo play-outs (blocks for up to the budget) */
export function mctsAction(g: Game, p: 0 | 1, opt: MctsOptions): Action {
  const legal = g.legalActions(p);
  if (legal.length <= 1) return legal[0] ?? { t: 'endTurn' };
  const search = new Search(g, p, opt);
  const t0 = Date.now();
  const deadline = t0 + opt.budgetMs;
  while (Date.now() < deadline) {
    search.run(Math.min(deadline, Date.now() + 40));
    const now = Date.now();
    if (search.settled(deadline - now, now - t0)) break;
  }
  return search.best();
}

/** the same, in 30ms slices with a pause between them so animations keep playing */
export async function mctsActionAsync(g: Game, p: 0 | 1, opt: MctsOptions): Promise<Action> {
  const legal = g.legalActions(p);
  if (legal.length <= 1) return legal[0] ?? { t: 'endTurn' };
  const search = new Search(g, p, opt);
  const t0 = Date.now();
  const deadline = t0 + opt.budgetMs;
  while (Date.now() < deadline) {
    search.run(Math.min(deadline, Date.now() + 30));
    const now = Date.now();
    if (search.settled(deadline - now, now - t0)) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  return search.best();
}

/** how many play-outs fit in a budget (for tuning) */
export function mctsRate(g: Game, p: 0 | 1, ms: number) {
  const deadline = Date.now() + ms;
  let n = 0;
  while (Date.now() < deadline) {
    const f = g.fork();
    determinize(f, p);
    playout(f, p, 99);
    n++;
  }
  return n;
}
