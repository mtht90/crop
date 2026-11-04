import type { TowerBalance } from '../core/types';
import type { TowerSlot } from '../systems/Arena';
import { makeCombatant, type Combatant } from './Combatant';

export function createTower(id: number, slot: TowerSlot, b: TowerBalance): Combatant {
  return makeCombatant({
    id,
    team: slot.team,
    kind: 'tower',
    towerType: slot.type,
    lane: slot.lane,
    x: slot.x,
    y: slot.y,
    radius: b.radius,
    mass: 10000,
    hp: b.hp,
    maxHp: b.hp,
    // 王の塔は休眠状態で開始
    active: slot.type !== 'king',
    base: {
      damage: b.damage,
      attackInterval: b.attackInterval,
      range: b.range,
      sightRange: b.range,
      moveSpeed: 0,
      targetType: 'both',
      splashRadius: 0,
      projectile: b.projectile,
      projectileSpeed: b.projectileSpeed,
    },
  });
}
