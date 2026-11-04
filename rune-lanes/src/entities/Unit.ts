import type { CardDef, Team } from '../core/types';
import { makeCombatant, type Combatant } from './Combatant';

/** 群れユニットの配置オフセット（タイル） */
export function formationOffsets(count: number): { dx: number; dy: number }[] {
  if (count <= 1) return [{ dx: 0, dy: 0 }];
  const r = count === 2 ? 0.45 : 0.55;
  const out: { dx: number; dy: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    out.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r });
  }
  return out;
}

export function createUnitFromCard(id: number, card: CardDef, team: Team, x: number, y: number): Combatant {
  return makeCombatant({
    id,
    team,
    kind: card.type === 'building' ? 'building' : 'unit',
    cardId: card.id,
    x,
    y,
    radius: card.radius,
    mass: card.mass,
    hp: card.hp,
    maxHp: card.hp,
    isFlying: card.isFlying,
    deployTimer: card.deployTime,
    lifetime: card.lifetime > 0 ? card.lifetime : Infinity,
    lifetimeMax: card.lifetime > 0 ? card.lifetime : Infinity,
    facing: team === 0 ? 1 : -1,
    base: {
      damage: card.damage,
      attackInterval: card.attackInterval,
      range: card.range,
      sightRange: card.sightRange,
      moveSpeed: card.moveSpeed,
      targetType: card.targetType,
      splashRadius: card.splashRadius,
      projectile: card.projectile,
      projectileSpeed: card.projectileSpeed,
    },
  });
}
