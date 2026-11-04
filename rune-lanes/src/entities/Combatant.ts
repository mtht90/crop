import type { Team, TargetType } from '../core/types';
import { BuffSet } from '../systems/BuffSystem';
import type { Lane } from '../systems/Arena';

export type CombatantKind = 'unit' | 'building' | 'tower';

export interface AttackProfile {
  damage: number;
  attackInterval: number;
  range: number;
  sightRange: number;
  moveSpeed: number;
  targetType: TargetType;
  splashRadius: number;
  /** 弾のテクスチャキー。null なら近接（即時ダメージ） */
  projectile: string | null;
  projectileSpeed: number;
}

/** ユニット・建物・塔の共通データ。ロジックは systems 側で扱う。 */
export interface Combatant {
  id: number;
  team: Team;
  kind: CombatantKind;
  cardId: string | null;
  towerType: 'king' | 'guard' | null;
  lane: Lane | null;
  x: number;
  y: number;
  radius: number;
  mass: number;
  hp: number;
  maxHp: number;
  shield: number;
  isFlying: boolean;
  base: AttackProfile;
  buffs: BuffSet;
  /** 出現待機の残り秒数（この間は無敵・行動なし） */
  deployTimer: number;
  /** 時限建物の残り寿命（無限なら Infinity） */
  lifetime: number;
  lifetimeMax: number;
  attackCooldown: number;
  targetId: number | null;
  /** 塔：休眠中は false */
  active: boolean;
  alive: boolean;
  // 描画用の状態
  moving: boolean;
  facing: -1 | 1;
  attackedAt: number;
}

export function isStructure(c: Combatant): boolean {
  return c.kind === 'tower' || c.kind === 'building';
}

export function isDeploying(c: Combatant): boolean {
  return c.deployTimer > 0;
}

export function makeCombatant(partial: Partial<Combatant> & Pick<Combatant, 'id' | 'team' | 'kind' | 'x' | 'y' | 'base'>): Combatant {
  return {
    cardId: null,
    towerType: null,
    lane: null,
    radius: 0.4,
    mass: 1,
    hp: 100,
    maxHp: 100,
    shield: 0,
    isFlying: false,
    buffs: new BuffSet(),
    deployTimer: 0,
    lifetime: Infinity,
    lifetimeMax: Infinity,
    attackCooldown: 0,
    targetId: null,
    active: true,
    alive: true,
    moving: false,
    facing: 1,
    attackedAt: -999,
    ...partial,
  };
}
