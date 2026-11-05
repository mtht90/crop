// ============================================================================
// CPU player: one-ply simulation over legal actions + heuristic prompt answers
// ============================================================================
import { card } from './cards';
import {
  canPay,
  energyCount,
  energyUnits,
  Game,
  hpLeft,
  hasRule,
  isBasic,
  prizeValue,
  maxHp,
  other,
  retreatCost,
  slotAt,
  slotsOf,
  topCard,
} from './game';
import type { Action, Answer, CardInst, GameState, MonsterCard, Pos, Prompt, Slot } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

// ----------------------------------------------------------------------------
// Board evaluation
// ----------------------------------------------------------------------------
function bestDamage(slot: Slot): number {
  const units = energyUnits(slot);
  let best = 0;
  for (const a of topCard(slot).attacks) if (canPay(units, a.cost)) best = Math.max(best, a.damage ?? 20);
  return best;
}

function readiness(slot: Slot): number {
  // fraction of the most expensive attack cost we can pay
  const units = energyUnits(slot).length;
  const atks = topCard(slot).attacks;
  const maxCost = Math.max(...atks.map((a) => a.cost.length), 1);
  return Math.min(units, maxCost) / maxCost;
}

function slotValue(s: GameState, slot: Slot, active: boolean): number {
  const mc = topCard(slot);
  const hp = maxHp(s, slot);
  const left = hpLeft(s, slot);
  let v = 0;
  v += (left / hp) * 30 + left * 0.05;
  v += mc.stage === 'basic' ? 10 : mc.stage === 'stage1' ? 32 : 55;
  if (hasRule(mc)) v += 15 * (prizeValue(mc) - 1);
  const atks = mc.attacks;
  const maxCost = Math.max(...atks.map((a) => a.cost.length), 1);
  v += Math.min(energyCount(slot), maxCost + 1) * (active ? 11 : 6);
  if (energyCount(slot) > maxCost + 1) v -= (energyCount(slot) - maxCost - 1) * 3; // wasted energy
  v += readiness(slot) * (active ? 32 : 12);
  const dmg = bestDamage(slot);
  v += dmg * (active ? 0.4 : 0.12);
  if (active && dmg > 0) v += 25;
  if (slot.tool) v += 6;
  if (mc.ability) v += 6;
  if (active) {
    v -= slot.conditions.length * 12;
    if (slot.conditions.includes('asleep') || slot.conditions.includes('paralyzed')) v -= 15;
    // retreat burden
    v -= retreatCost(s, slot) * 2;
  }
  return v;
}

export function evaluate(s: GameState, p: 0 | 1): number {
  if (s.phase === 'over') return s.winner === p ? 1e6 : s.winner === -1 ? 0 : -1e6;
  const o = other(p);
  const side = (q: 0 | 1) => {
    const pl = s.players[q];
    let v = 0;
    v += (6 - pl.prizes.length) * 180;
    if (pl.active) v += slotValue(s, pl.active, true);
    for (const b of pl.bench) v += slotValue(s, b, false);
    v += Math.min(pl.hand.length, 10) * 3.5;
    if (pl.deck.length < 6) v -= (6 - pl.deck.length) * 15;
    if (!pl.active && !pl.bench.length) v -= 5000;
    return v;
  };
  let score = side(p) - side(o) * 0.9;
  // threat: can my active KO their active next attack?
  const me = s.players[p].active;
  const them = s.players[o].active;
  if (me && them) {
    const d = bestDamage(me) * (topCard(them).weakness === topCard(me).type ? 2 : 1);
    if (d >= hpLeft(s, them)) score += 30 * prizeValue(topCard(them));
    const t = bestDamage(them) * (topCard(me).weakness === topCard(them).type ? 2 : 1);
    if (t >= hpLeft(s, me)) score -= 25 * prizeValue(topCard(me));
  }
  return score;
}

// ----------------------------------------------------------------------------
// Card value (for searches / discards)
// ----------------------------------------------------------------------------
function cardValue(g: Game, p: 0 | 1, c: CardInst): number {
  const s = g.s;
  const d = card(c.cid);
  const pl = s.players[p];
  const slots = slotsOf(s, p);
  if (d.kind === 'monster') {
    let v = 20;
    if (d.stage !== 'basic') {
      const target = slots.some((x) => topCard(x.slot).name === d.evolvesFrom);
      v += target ? 45 : 5;
      if (hasRule(d)) v += 10;
    } else {
      v += pl.bench.length < 3 ? 25 : 5;
      if (hasRule(d)) v += 20;
      // a basic whose evolution is in hand
      if (pl.hand.some((h) => {
        const hd = card(h.cid);
        return hd.kind === 'monster' && hd.evolvesFrom === d.name;
      })) v += 10;
    }
    return v + d.hp * 0.05;
  }
  if (d.kind === 'energy') {
    const needed = slots.some((x) => {
      const atks = topCard(x.slot).attacks;
      return atks.some((a) => a.cost.some((t) => d.provides.includes(t) || t === 'colorless')) && !atks.every((a) => canPay(energyUnits(x.slot), a.cost));
    });
    const inHand = pl.hand.filter((h) => card(h.cid).kind === 'energy').length;
    return (needed ? 30 : 10) - inHand * 2;
  }
  // trainer
  let v = 18;
  if (d.sub === 'supporter') v += 8;
  if (d.key === 'research' || d.key === 'boss' || d.key === 'candy') v += 8;
  return v;
}

// ----------------------------------------------------------------------------
// Prompt heuristics
// ----------------------------------------------------------------------------
function slotScoreForActive(s: GameState, slot: Slot): number {
  return bestDamage(slot) * 1.2 + hpLeft(s, slot) * 0.3 + readiness(slot) * 40 + (hasRule(topCard(slot)) ? 10 : 0);
}

export function heuristicAnswer(g: Game, pr: Prompt): Answer {
  const s = g.s;
  switch (pr.type) {
    case 'choice':
      return { type: 'choice', index: 0 };
    case 'setup': {
      const pl = s.players[pr.player];
      const basics = pl.hand.filter((c) => isBasic(c.cid));
      // active: prefer a sturdy non-omega basic with cheap attack; omega if nothing else
      const score = (c: CardInst) => {
        const d = card(c.cid) as MonsterCard;
        const cheap = Math.min(...d.attacks.map((a) => a.cost.length));
        return d.hp * 0.5 - cheap * 10 - d.retreat * 6 - (hasRule(d) ? 30 * (prizeValue(d) - 1) : 0) + (d.retreat === 0 ? 10 : 0);
      };
      basics.sort((a, b) => score(b) - score(a));
      const active = basics[0];
      const bench = basics.slice(1, 6).map((c) => c.uid);
      return { type: 'setup', active: active.uid, bench };
    }
    case 'cards': {
      if (pr.max === 0) return { type: 'cards', uids: [] };
      const discard = pr.title.includes('トラッシュする');
      const oppCards = pr.cards.length > 0 && pr.cards[0].owner !== pr.player;
      const cands = pr.cards.filter((c) => pr.selectable.includes(c.uid));
      const val = (c: CardInst) => cardValue(g, pr.player, c);
      if (discard && !oppCards) cands.sort((a, b) => val(a) - val(b));
      else cands.sort((a, b) => val(b) - val(a));
      const n = discard ? pr.min : pr.max;
      return { type: 'cards', uids: cands.slice(0, Math.max(n, pr.min)).map((c) => c.uid) };
    }
    case 'slot': {
      const opts = pr.options;
      const mine = opts[0].p === pr.player;
      const t = pr.title;
      let best: Pos = opts[0];
      let bestV = -Infinity;
      for (const o of opts) {
        const sl = slotAt(s, o)!;
        let v = 0;
        if (!mine) {
          const myAct = s.players[pr.player].active;
          // 「ダメカンをN個」 (暗殺者の刃) or 「Nダメージ」
          const counters = /ダメカンを(\d+)個/.exec(t);
          const dmgTitle = counters ? ([counters[0], String(Number(counters[1]) * 10)] as const) : /(\d+)ダメージ/.exec(t);
          if (t.includes('エネルギーをトラッシュ')) {
            v = energyCount(sl) * 10 + (o.z === 'active' ? 25 : 0) + (hasRule(topCard(sl)) ? 15 : 0);
          } else if (dmgTitle) {
            const n = Number(dmgTitle[1]);
            v = (n >= hpLeft(s, sl) ? 100 + 100 * prizeValue(topCard(sl)) : 0) + sl.damage + maxHp(s, sl) * 0.05;
          } else {
            // gust: bring out something we can KO, or a stuck high-retreat monster
            const d = myAct ? bestDamage(myAct) : 0;
            v = (d >= hpLeft(s, sl) ? 100 + 200 * prizeValue(topCard(sl)) : 0) - hpLeft(s, sl) * 0.3 + retreatCost(s, sl) * 15 - energyCount(sl) * 5;
          }
        } else if (t.includes('エネルギーを移す')) {
          // move surplus energy off a monster that has more than it needs (prefer the bench)
          const maxCost = Math.max(...topCard(sl).attacks.map((a) => a.cost.length), 1);
          v = energyCount(sl) - maxCost + (o.z === 'bench' ? 0.5 : 0);
        } else if (t.includes('回復')) {
          v = sl.damage + (o.z === 'active' ? 5 : 0);
        } else if (t.includes('つける')) {
          const units = energyUnits(sl);
          const atks = topCard(sl).attacks;
          const maxCost = Math.max(...atks.map((a) => a.cost.length));
          v = (units.length < maxCost ? 30 : 0) + (o.z === 'active' ? 15 : 0) + (hasRule(topCard(sl)) ? 10 : 0) + topCard(sl).hp * 0.05;
        } else {
          v = slotScoreForActive(s, sl);
        }
        if (v > bestV) {
          bestV = v;
          best = o;
        }
      }
      if (pr.optional && !mine && bestV <= 0) return { type: 'slot', pos: best };
      return { type: 'slot', pos: best };
    }
    case 'action':
      return { type: 'action', action: { t: 'endTurn' } };
  }
}

// ----------------------------------------------------------------------------
// Simulation
// ----------------------------------------------------------------------------
function runUntilBack(g: Game, p: 0 | 1, limit = 200) {
  let steps = 0;
  while (g.pending && steps++ < limit) {
    const pr = g.pending;
    if (pr.type === 'action') {
      if (pr.player === p) return; // back to our decision point
      return; // opponent's turn started — evaluate here
    }
    g.answer(heuristicAnswer(g, pr));
  }
}

function simulate(g: Game, p: 0 | 1, a: Action): number {
  const f = g.fork();
  try {
    f.answer({ type: 'action', action: a });
    runUntilBack(f, p);
  } catch {
    return -Infinity;
  }
  return evaluate(f.s, p);
}

// ----------------------------------------------------------------------------
// Strength levels
//   Difficulty (かんたん / ふつう / むずかしい) is what the story rivals use;
//   CPU対戦 uses numbered levels 1–9. A level is a profile:
//     noise / skip / badAttack / slip   how often it errs (low levels)
//     depth / width / budgetMs          how far it plans its own turn (high levels)
//     threat                            how much it fears the reply it is leaving open
//   The CPU never looks at the hand of the human player: its idea of the reply is
//   what the board alone allows (an attack that is one energy short is assumed to
//   get that energy). `replies` (imagining the opponent's turn on a shuffled hand)
//   is kept but off: in play-tests it was noisier than the board-only threat.
// ----------------------------------------------------------------------------
export type CpuLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type AiLevel = Difficulty | number;

export interface AiProfile {
  noise: number;
  skip: number;
  badAttack: number;
  slip: number;
  depth: number;
  width: number;
  threat: number;
  /** how many imagined replies of the opponent it plays out per way of ending its turn */
  replies: number;
  budgetMs: number;
}

export const PROFILES: Record<CpuLevel, AiProfile> = {
  1: { noise: 45, skip: 0.3, badAttack: 0.35, slip: 0.35, depth: 0, width: 0, threat: 0, replies: 0, budgetMs: 0 },
  2: { noise: 30, skip: 0.2, badAttack: 0.2, slip: 0.22, depth: 0, width: 0, threat: 0, replies: 0, budgetMs: 0 },
  3: { noise: 20, skip: 0.12, badAttack: 0.1, slip: 0.12, depth: 0, width: 0, threat: 0, replies: 0, budgetMs: 0 },
  4: { noise: 12, skip: 0.06, badAttack: 0.05, slip: 0.06, depth: 0, width: 0, threat: 0, replies: 0, budgetMs: 0 },
  5: { noise: 5, skip: 0, badAttack: 0, slip: 0, depth: 0, width: 0, threat: 0, replies: 0, budgetMs: 0 },
  6: { noise: 0, skip: 0, badAttack: 0, slip: 0, depth: 1, width: 4, threat: 0.8, replies: 0, budgetMs: 250 },
  7: { noise: 0, skip: 0, badAttack: 0, slip: 0, depth: 2, width: 5, threat: 1, replies: 0, budgetMs: 450 },
  8: { noise: 0, skip: 0, badAttack: 0, slip: 0, depth: 3, width: 6, threat: 1.1, replies: 0, budgetMs: 600 },
  9: { noise: 0, skip: 0, badAttack: 0, slip: 0, depth: 4, width: 7, threat: 1.2, replies: 0, budgetMs: 900 },
};

export const CPU_LEVELS: { level: CpuLevel; name: string; blurb: string }[] = [
  { level: 1, name: 'はじめて', blurb: 'ルールを覚えたてのCPU。よく手を間違える' },
  { level: 2, name: 'みならい', blurb: 'ときどき良い手を見逃す' },
  { level: 3, name: 'ふつう', blurb: '基本はおさえている' },
  { level: 4, name: 'なれた人', blurb: 'ほとんど間違えない' },
  { level: 5, name: 'ベテラン', blurb: '目の前の最善手を選ぶ' },
  { level: 6, name: '上級', blurb: '相手の反撃を考えて攻撃を選ぶ' },
  { level: 7, name: '達人', blurb: '1ターンの手順を先読みする' },
  { level: 8, name: '名人', blurb: '手順と反撃を深く読む' },
  { level: 9, name: '伝説', blurb: 'トッププレイヤーでも負けることがある' },
];

/** the profile for a story difficulty or a CPU level */
export function profileOf(level: AiLevel): AiProfile {
  const n = typeof level === 'number' ? level : level === 'easy' ? 2 : level === 'normal' ? 5 : 6;
  return PROFILES[Math.max(1, Math.min(9, Math.round(n))) as CpuLevel];
}

/** what the board alone says the opponent can do to my active monster after my turn */
function threatPenalty(s: GameState, p: 0 | 1, weight: number): number {
  if (s.phase === 'over' || weight <= 0) return 0;
  const o = other(p);
  const me = s.players[p].active;
  const them = s.players[o].active;
  if (!me || !them) return 0;
  const tm = topCard(them);
  const units = energyCount(them);
  // an attack one energy short is assumed to be paid (the opponent attaches this turn)
  let dmg = 0;
  for (const a of tm.attacks) if (a.cost.length <= units + 1) dmg = Math.max(dmg, a.damage ?? 20);
  if (topCard(me).weakness === tm.type) dmg *= 2;
  const left = hpLeft(s, me);
  let pen = 0;
  if (dmg >= left) {
    pen += 130 * prizeValue(topCard(me));
    // nothing to promote: losing the active may lose the game
    if (!s.players[p].bench.length) pen += 600;
  } else {
    pen += (dmg / left) * 25;
  }
  return pen * weight;
}

const isTerminal = (a: Action) => a.t === 'attack' || a.t === 'endTurn';

/** apply an action on a copy, answering the follow-up prompts with the heuristics */
function step(g: Game, p: 0 | 1, a: Action): Game | null {
  const f = g.fork();
  try {
    f.answer({ type: 'action', action: a });
    runUntilBack(f, p);
  } catch {
    return null;
  }
  return f;
}

/**
 * Imagine the opponent's turn: what it holds is not known, so its hand and deck are
 * shuffled together (it keeps as many cards in hand as it has) and it then plays
 * its turn the way a level-5 CPU would.
 */
function imagineReply(after: Game, p: 0 | 1): number {
  const f = after.fork();
  const o = other(p);
  const pl = f.s.players[o];
  const pool = [...pl.hand, ...pl.deck];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const n = pl.hand.length;
  pl.hand = pool.slice(0, n);
  pl.deck = pool.slice(n);
  let guard = 0;
  let actions = 0;
  try {
    while (f.pending && f.s.phase !== 'over' && guard++ < 120) {
      const pr = f.pending;
      if (pr.type === 'action' && pr.player === p) break; // my turn again
      if (pr.type === 'action') actions++;
      f.answer(aiAnswer(f, 5, actions));
    }
  } catch {
    /* an odd state: judge it where it stands */
  }
  return evaluate(f.s, p);
}

/** the value of ending my turn this way */
function finishValue(g: Game, p: 0 | 1, a: Action, prof: AiProfile): number {
  const f = step(g, p, a);
  if (!f) return -Infinity;
  let v = evaluate(f.s, p) - threatPenalty(f.s, p, prof.threat);
  if (prof.replies > 0 && f.s.phase !== 'over') {
    let sum = 0;
    for (let k = 0; k < prof.replies; k++) sum += imagineReply(f, p);
    v += sum / prof.replies - evaluate(f.s, p);
  }
  return v;
}

interface Found {
  v: number;
  a: Action;
}

/** best way to play out the rest of my turn, `depth` more setup actions deep */
function search(g: Game, p: 0 | 1, depth: number, prof: AiProfile, deadline: number): Found | null {
  const legal = g.legalActions(p);
  let best: Found = { v: -Infinity, a: { t: 'endTurn' } };
  for (const a of legal) {
    if (!isTerminal(a)) continue;
    const v = finishValue(g, p, a, prof);
    if (v > best.v) best = { v, a };
    if (Date.now() > deadline) return null;
  }
  if (depth <= 0) return best;
  const next: { a: Action; f: Game; v: number }[] = [];
  for (const a of legal) {
    if (isTerminal(a)) continue;
    const f = step(g, p, a);
    if (!f || f.s.phase === 'over' || !f.pending || f.pending.type !== 'action' || f.pending.player !== p) continue;
    next.push({ a, f, v: evaluate(f.s, p) });
    if (Date.now() > deadline) return null;
  }
  next.sort((x, y) => y.v - x.v);
  for (const n of next.slice(0, prof.width)) {
    const r = search(n.f, p, depth - 1, prof, deadline);
    if (!r) return null;
    // a setup move has to be worth more than simply finishing now
    if (r.v > best.v + 0.5) best = { v: r.v, a: n.a };
  }
  return best;
}

/** plan my turn deeper and deeper until the time is up; keep the last full answer */
function plan(g: Game, p: 0 | 1, prof: AiProfile): Action {
  const deadline = Date.now() + prof.budgetMs;
  let best: Action | null = null;
  for (let d = 0; d <= prof.depth; d++) {
    const r = search(g, p, d, prof, deadline);
    if (!r) break;
    best = r.a;
  }
  return best ?? { t: 'endTurn' };
}

function randomOf<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

export function chooseAction(g: Game, p: 0 | 1, level: AiLevel = 'normal', actionsThisTurn = 0): Action {
  const legal = g.legalActions(p);
  if (legal.length === 1) return legal[0];
  if (legal.length === 0 || actionsThisTurn > 40) return { t: 'endTurn' };
  const prof = profileOf(level);
  if (prof.depth > 0) return plan(g, p, prof);

  const base = evaluate(g.s, p);
  // the low levels sometimes just attack with whatever they can
  if (prof.badAttack > 0 && Math.random() < prof.badAttack) {
    const atks = legal.filter((a) => a.t === 'attack');
    if (atks.length) return randomOf(atks);
  }

  let best: Action = { t: 'endTurn' };
  let bestV = -Infinity;
  const attacks: Action[] = [];
  for (const a of legal) {
    if (a.t === 'endTurn') continue;
    if (a.t === 'attack') {
      attacks.push(a);
      continue;
    }
    if (prof.skip > 0 && Math.random() < prof.skip) continue;
    const v = simulate(g, p, a) + (Math.random() - 0.5) * prof.noise;
    if (v > bestV) {
      bestV = v;
      best = a;
    }
  }
  const threshold = 1.5;
  if (best.t !== 'endTurn' && bestV > base + threshold) return best;

  // attack or end turn
  let atkBest: Action = { t: 'endTurn' };
  let atkV = simulate(g, p, { t: 'endTurn' });
  for (const a of attacks) {
    const v = simulate(g, p, a) + (Math.random() - 0.5) * prof.noise;
    if (v > atkV - 1) {
      atkV = v;
      atkBest = a;
    }
  }
  return atkBest;
}

export function aiAnswer(g: Game, level: AiLevel = 'normal', actionsThisTurn = 0): Answer {
  const pr = g.pending!;
  if (pr.type === 'action') return { type: 'action', action: chooseAction(g, pr.player, level, actionsThisTurn) };
  const prof = profileOf(level);
  // a beginner sometimes picks a target at random
  if (prof.slip > 0 && Math.random() < prof.slip) {
    if (pr.type === 'slot' && pr.options.length) return { type: 'slot', pos: randomOf(pr.options) };
    if (pr.type === 'cards' && pr.max > 0) {
      const ok = pr.cards.filter((c) => pr.selectable.includes(c.uid)).map((c) => c.uid);
      const n = Math.min(ok.length, Math.max(pr.min, 1));
      return { type: 'cards', uids: [...ok].sort(() => Math.random() - 0.5).slice(0, n) };
    }
  }
  return heuristicAnswer(g, pr);
}
