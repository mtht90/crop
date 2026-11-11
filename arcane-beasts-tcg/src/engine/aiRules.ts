// ============================================================================
// Rules of thumb every CPU level follows (what good players do), applied to the
// list of legal actions before any search:
//
//  • にげる costs energy and a turn's tempo. Retreat only when it buys
//    something: the active is asleep / confused / can't attack for a long while,
//    or it is about to be knocked out and is worth saving (an evolved monster, an
//    ace, or one carrying energy) — and what comes in is better off. A free
//    retreat is fine when it brings in a monster that can hit harder right now.
//  • Never retreat into a monster that the opponent's active knocks out anyway,
//    unless the active is worth far more (a cheap basic thrown in to buy time).
// ============================================================================
import { canPay, energyCount, energyUnits, hpLeft, other, retreatCost, topCard, type Game } from './game';
import type { Action, GameState, Slot } from './types';

/** the best damage the slot could deal with the energy it has now */
function bestDamage(slot: Slot): number {
  const units = energyUnits(slot);
  let best = 0;
  for (const a of topCard(slot).attacks) if (canPay(units, a.cost)) best = Math.max(best, a.damage ?? 20);
  return best;
}

/** energy still missing for the cheapest attack (0 = can attack) */
function missing(slot: Slot): number {
  const have = energyCount(slot);
  const atks = topCard(slot).attacks;
  if (atks.some((a) => canPay(energyUnits(slot), a.cost))) return 0;
  return Math.max(1, Math.min(...atks.map((a) => a.cost.length)) - have);
}

/** what the opponent's active could hit for next turn (an attack one energy short counts as paid) */
function threat(s: GameState, p: 0 | 1, target: Slot): number {
  const them = s.players[other(p)].active;
  if (!them) return 0;
  const tm = topCard(them);
  const units = energyCount(them);
  let dmg = 0;
  for (const a of tm.attacks) if (a.cost.length <= units + 1) dmg = Math.max(dmg, a.damage ?? 20);
  if (topCard(target).weakness === tm.type) dmg *= 2;
  return dmg;
}

/** how much a slot is worth keeping alive (evolution, energy on it, an ace) */
function worth(slot: Slot): number {
  const mc = topCard(slot);
  return (mc.stage === 'basic' ? 1 : mc.stage === 'stage1' ? 2 : 3) + energyCount(slot) + (mc.ace ? 2 : 0) + (mc.rarity >= 4 ? 2 : 0);
}

/** may this retreat be played? */
export function retreatMakesSense(s: GameState, p: 0 | 1, a: Extract<Action, { t: 'retreat' }>): boolean {
  const pl = s.players[p];
  const act = pl.active;
  const to = pl.bench[a.to];
  if (!act || !to) return false;
  const cost = retreatCost(s, act);
  // stuck or confused: getting out is the point
  if (act.conditions.includes('asleep') || act.conditions.includes('confused')) return true;
  const inDmg = bestDamage(to);
  const outDmg = bestDamage(act);
  // a free retreat into a monster that hits harder now
  if (cost === 0 && inDmg > outDmg) return true;
  const actLeft = hpLeft(s, act);
  const toLeft = hpLeft(s, to);
  const actDies = threat(s, p, act) >= actLeft;
  const toDies = threat(s, p, to) >= toLeft;
  // about to be knocked out: save it if it is worth more than what comes in
  if (actDies && worth(act) >= 3) {
    if (!toDies) return true;
    // a cheap basic thrown in to buy time for something valuable
    if (worth(to) + 2 <= worth(act)) return true;
  }
  // the active can't attack for two more turns and the one coming in can attack now
  if (missing(act) >= 2 && missing(to) === 0 && !toDies) return true;
  return false;
}

/** the legal actions with the senseless ones taken out (never empty) */
export function sensibleActions(g: Game, p: 0 | 1, legal: Action[]): Action[] {
  const out = legal.filter((a) => a.t !== 'retreat' || retreatMakesSense(g.s, p, a));
  return out.length ? out : legal;
}
