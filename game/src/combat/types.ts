/** All combat timing is expressed in fixed 60Hz simulation frames. */
export const TICK = 1 / 60;

export interface HitProps {
  damage: number;
  /** Horizontal launch speed (m/s) before HP scaling. */
  knockback: number;
  /** Vertical launch speed (m/s). */
  knockUp: number;
  /** Frames of hitstun on a grounded, non-launching hit. */
  hitstun: number;
  /** Frames of global hit-stop (freeze) on contact. */
  hitstop: number;
  /** Damage dealt to guard meter when blocked. */
  guardDamage?: number;
  /** Big effects (shockwave, long shake). */
  heavy?: boolean;
  /** Keeps the target close to the attacker (rush combos). */
  pull?: boolean;
}

/** A melee active window: a sphere placed along the aim direction. */
export interface HitWindow extends HitProps {
  start: number;
  end: number;
  range: number;
  radius: number;
  /** Which hand drives the trail effect. */
  hand?: 'L' | 'R' | 'B';
}

/** Projectile emission at a given frame. */
export interface Spawn extends HitProps {
  frame: number;
  hand: 'L' | 'R';
  speed: number;
  radius: number;
  life: number;
  count?: number;
  spread?: number;
  size?: number;
}

/** Self velocity applied during frames [start, end). Relative to facing. */
export interface Motion {
  start: number;
  end: number;
  forward: number;
  up?: number;
  /** Steer toward the opponent when roughly in front (melee magnet). */
  magnet?: boolean;
}

export type ActionKind = 'attack' | 'skill' | 'ult';

export interface ActionDef {
  id: string;
  kind: ActionKind;
  /** Animation clip id for the full-body rig and viewmodel. */
  anim: string;
  total: number;
  hits?: HitWindow[];
  spawns?: Spawn[];
  motion?: Motion[];
  /** Next action in the combo chain and the earliest frame it may start. */
  comboNext?: string;
  comboFrom?: number;
  /** Movement speed multiplier while performing the action (0 = rooted). */
  moveScale?: number;
  /** Uses ammo per spawn (shooter characters). */
  usesAmmo?: boolean;
  /** Cannot be cancelled by dash/skill. */
  committed?: boolean;
  /** Invulnerable frames [start, end). */
  invuln?: [number, number];
  /** Ignores hitstun from incoming hits. */
  armor?: boolean;
  /** Animation only affects the upper body (legs keep running). */
  upperBody?: boolean;
}

export interface Look {
  skin: number;
  hair: number;
  top: number;
  topAccent: number;
  pants: number;
  shoes: number;
  glove: number;
  eyes: number;
  hairStyle: 'ponytail' | 'spiky';
  /** Base body model and hairstyle from the CC0 character kit. */
  body: 'female' | 'male';
  hairModel: 'hairBuns' | 'hairLong' | 'hairParted' | 'hairBuzzed' | 'hairBuzzedF';
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  weapon: 'fists' | 'guns';
  element: { name: string; color: number; color2: number };
  maxHp: number;
  walkSpeed: number;
  jumpSpeed: number;
  /** Preferred engagement distance used by the CPU. */
  preferredRange: [number, number];
  ammo?: number;
  reloadFrames?: number;
  skillCooldown: number; // frames
  actions: Record<string, ActionDef>;
  basic: string;
  skill: string;
  ult: string;
  airBasic?: string;
  look: Look;
}

export interface Intent {
  /** Local move: x = right, z = forward. */
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  attack: boolean;
  attackPressed: boolean;
  guard: boolean;
  jumpPressed: boolean;
  dashPressed: boolean;
  skillPressed: boolean;
  ultPressed: boolean;
  reloadPressed: boolean;
}

export const emptyIntent = (): Intent => ({
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  attack: false,
  attackPressed: false,
  guard: false,
  jumpPressed: false,
  dashPressed: false,
  skillPressed: false,
  ultPressed: false,
  reloadPressed: false,
});
