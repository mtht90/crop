import type { CardDef, Team } from '../core/types';
import { enemyOf } from '../core/types';
import type { Combatant } from '../entities/Combatant';
import type { BattleWorld } from '../systems/BattleWorld';
import type { CardInstance } from '../systems/DeckSystem';
import { ARENA_H, BRIDGES } from '../systems/Arena';

/** 自陣の奥（王の塔側）からの距離。0 = 自陣最奥、32 = 相手陣最奥 */
export function depthOf(team: Team, y: number): number {
  return team === 1 ? y : ARENA_H - y;
}

export function yFromDepth(team: Team, depth: number): number {
  return team === 1 ? depth : ARENA_H - depth;
}

export interface HandOption {
  inst: CardInstance;
  card: CardDef;
}

export function affordableHand(world: BattleWorld, team: Team): HandOption[] {
  const p = world.players[team];
  return p.deck.hand
    .map((inst) => ({ inst, card: world.card(inst.cardId) }))
    .filter((o) => p.mana.canAfford(o.card.cost));
}

export function enemyUnits(world: BattleWorld, team: Team): Combatant[] {
  const e = enemyOf(team);
  return world.combatants.filter((c) => c.alive && c.team === e && c.kind === 'unit');
}

export function ownUnits(world: BattleWorld, team: Team): Combatant[] {
  return world.combatants.filter((c) => c.alive && c.team === team && c.kind === 'unit' && c.deployTimer <= 0);
}

/** 自陣に攻め込んでいる（または橋に迫っている）敵ユニット */
export function threats(world: BattleWorld, team: Team): Combatant[] {
  return enemyUnits(world, team)
    .filter((u) => depthOf(team, u.y) <= 18.5)
    .sort((a, b) => depthOf(team, a.y) - depthOf(team, b.y));
}

export function clusterAround(units: readonly Combatant[], x: number, y: number, r: number): Combatant[] {
  return units.filter((u) => Math.hypot(u.x - x, u.y - y) <= r);
}

/** 敵が最も密集している点（候補は各ユニットの位置） */
export function densestPoint(units: readonly Combatant[], r: number): { x: number; y: number; units: Combatant[] } | null {
  let best: { x: number; y: number; units: Combatant[] } | null = null;
  for (const u of units) {
    const near = clusterAround(units, u.x, u.y, r);
    if (!best || near.length > best.units.length) {
      const cx = near.reduce((s, n) => s + n.x, 0) / near.length;
      const cy = near.reduce((s, n) => s + n.y, 0) / near.length;
      best = { x: cx, y: cy, units: near };
    }
  }
  return best;
}

export function canHitAir(card: CardDef): boolean {
  return card.targetType === 'both' || card.targetType === 'air';
}

export function bridgeX(lane: 0 | 1): number {
  return BRIDGES[lane].x;
}

/** 指定位置が置けなければ自陣奥へ少しずつずらして探す */
export function findDeployPoint(world: BattleWorld, team: Team, x: number, y: number): { x: number; y: number } | null {
  const back = team === 1 ? -1 : 1;
  for (let i = 0; i < 12; i++) {
    for (const dx of [0, 0.8, -0.8, 1.6, -1.6]) {
      const px = Math.max(0.6, Math.min(17.4, x + dx));
      const py = y + back * i * 0.7;
      if (world.canDeployAt(team, px, py)) return { x: px, y: py };
    }
  }
  return null;
}
