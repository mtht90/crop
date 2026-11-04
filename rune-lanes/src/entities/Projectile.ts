import type { Team, TargetType } from '../core/types';

/** 弾・呪文の飛翔体。targetId があれば追尾、無ければ (tx, ty) へ飛ぶ。 */
export interface Projectile {
  id: number;
  team: Team;
  sourceId: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  targetId: number | null;
  speed: number;
  damage: number;
  splashRadius: number;
  targetType: TargetType;
  texture: string;
  /** 塔へのダメージ倍率（呪文用） */
  towerDamageRatio: number;
  isSpell: boolean;
  hitSfx: string | null;
  alive: boolean;
}
