import type { TargetType } from '../core/types';
import { isStructure, type Combatant } from '../entities/Combatant';
import { laneOf } from './Arena';

/** その攻撃タイプで対象を狙えるか */
export function canTarget(targetType: TargetType, target: Combatant): boolean {
  if (!target.alive) return false;
  switch (targetType) {
    case 'buildings':
      return isStructure(target);
    case 'ground':
      return !target.isFlying;
    case 'air':
      return target.isFlying;
    case 'both':
      return true;
  }
}

/** 中心間距離から双方の半径を引いた「縁どうしの距離」 */
export function edgeDistance(a: { x: number; y: number; radius: number }, b: { x: number; y: number; radius: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
}

export function isInRange(self: Combatant, target: Combatant, range: number): boolean {
  return edgeDistance(self, target) <= range;
}

/** 視界内で狙える最も近い敵 */
export function findNearestTarget(self: Combatant, candidates: readonly Combatant[], sight: number): Combatant | null {
  let best: Combatant | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    if (c.team === self.team || !c.alive || c.deployTimer > 0) continue;
    if (!canTarget(self.base.targetType, c)) continue;
    const d = edgeDistance(self, c);
    if (d <= sight && d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * 進軍先の塔：自分のいるレーンの守護塔、無ければ王の塔。
 * 建物狙いのユニットは視界内の敵建物も候補にする（findNearestTarget 側で処理）。
 */
export function findLaneTower(self: Combatant, all: readonly Combatant[]): Combatant | null {
  const lane = laneOf(self.x);
  let guard: Combatant | null = null;
  let king: Combatant | null = null;
  let any: Combatant | null = null;
  let anyD = Infinity;
  for (const c of all) {
    if (c.team === self.team || !c.alive || c.kind !== 'tower') continue;
    if (c.towerType === 'guard' && c.lane === lane) guard = c;
    if (c.towerType === 'king') king = c;
    const d = Math.hypot(c.x - self.x, c.y - self.y);
    if (d < anyD) {
      anyD = d;
      any = c;
    }
  }
  return guard ?? king ?? any;
}
