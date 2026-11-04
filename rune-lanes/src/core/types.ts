/** 0 = プレイヤー（画面下側） / 1 = CPU（画面上側） */
export type Team = 0 | 1;
export type CardType = 'unit' | 'spell' | 'building' | 'support';
export type TargetType = 'ground' | 'air' | 'both' | 'buildings';
export type SupportKind = 'attack' | 'heal' | 'shield' | 'haste';

export interface SupportEffect {
  kind: SupportKind;
  value: number;
  duration: number;
}

export interface CardDef {
  id: string;
  name: string;
  description: string;
  type: CardType;
  cost: number;
  count: number;
  hp: number;
  damage: number;
  attackInterval: number;
  range: number;
  sightRange: number;
  moveSpeed: number;
  targetType: TargetType;
  isFlying: boolean;
  splashRadius: number;
  deployTime: number;
  lifetime: number;
  supportEffect: SupportEffect | null;
  radius: number;
  mass: number;
  projectile: string | null;
  projectileSpeed: number;
  displayScale: number;
  spriteKey: string;
  cardArtKey: string;
  sfx: { attack?: string; hit?: string; deploy?: string };
}

export interface TowerBalance {
  hp: number;
  damage: number;
  attackInterval: number;
  range: number;
  radius: number;
  projectile: string;
  projectileSpeed: number;
}

export interface CpuBalance {
  thinkInterval: number;
  reactionDelay: number;
  randomness: number;
  attackManaThreshold: number;
}

export interface Balance {
  sim: { tickRate: number };
  mana: { max: number; start: number; regenSeconds: number; doubleMultiplier: number };
  deck: { initialHand: number; handLimit: number; drawInterval: number };
  match: { duration: number; doubleManaAt: number; overtime: number };
  buff: { stacking: 'refresh' | 'stack' };
  spell: { towerDamageRatio: number };
  towers: { guard: TowerBalance; king: TowerBalance };
  cpu: { easy: CpuBalance; normal: CpuBalance };
}

export type Difficulty = 'easy' | 'normal';

export function enemyOf(team: Team): Team {
  return team === 0 ? 1 : 0;
}
