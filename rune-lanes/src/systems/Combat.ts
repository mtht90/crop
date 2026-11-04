import type { TargetType } from '../core/types';
import type { Combatant } from '../entities/Combatant';
import { canTarget } from './Targeting';

export interface Damageable {
  hp: number;
  shield: number;
  alive: boolean;
  deployTimer: number;
}

/**
 * ダメージを与える。シールドが先に吸収する。出現待機中は無敵。
 * @returns 実際に HP とシールドから減った量
 */
export function dealDamage(target: Damageable, amount: number): { total: number; toShield: number; toHp: number } {
  if (!target.alive || target.deployTimer > 0 || amount <= 0) return { total: 0, toShield: 0, toHp: 0 };
  const toShield = Math.min(target.shield, amount);
  target.shield -= toShield;
  const toHp = Math.min(target.hp, amount - toShield);
  target.hp -= toHp;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
  }
  return { total: toShield + toHp, toShield, toHp };
}

/** 範囲ダメージの対象（中心からの距離 - 半径 <= splash） */
export function splashTargets(
  x: number,
  y: number,
  radius: number,
  enemyTeam: 0 | 1,
  targetType: TargetType,
  all: readonly Combatant[],
): Combatant[] {
  return all.filter(
    (c) => c.team === enemyTeam && c.alive && canTarget(targetType, c) && Math.hypot(c.x - x, c.y - y) - c.radius <= radius,
  );
}
