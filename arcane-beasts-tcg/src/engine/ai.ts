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
          const dmgTitle = /(\d+)ダメージ/.exec(t);
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

export function chooseAction(g: Game, p: 0 | 1, level: Difficulty = 'normal', actionsThisTurn = 0): Action {
  const legal = g.legalActions(p);
  if (legal.length <= 1 || actionsThisTurn > 40) return { t: 'endTurn' };
  const base = evaluate(g.s, p);
  const noise = level === 'easy' ? 25 : level === 'normal' ? 5 : 0;

  // Retreat actions: only consider one per bench target (auto discard)
  let best: Action = { t: 'endTurn' };
  let bestV = -Infinity;
  const attacks: Action[] = [];
  for (const a of legal) {
    if (a.t === 'endTurn') continue;
    if (a.t === 'attack') {
      attacks.push(a);
      continue;
    }
    // Easy CPU skips some good plays
    if (level === 'easy' && Math.random() < 0.1) continue;
    const v = simulate(g, p, a) + (Math.random() - 0.5) * noise;
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
    const v = simulate(g, p, a) + (Math.random() - 0.5) * noise;
    if (v > atkV - 1) {
      atkV = v;
      atkBest = a;
    }
  }
  return atkBest;
}

export function aiAnswer(g: Game, level: Difficulty = 'normal', actionsThisTurn = 0): Answer {
  const pr = g.pending!;
  if (pr.type === 'action') return { type: 'action', action: chooseAction(g, pr.player, level, actionsThisTurn) };
  return heuristicAnswer(g, pr);
}
