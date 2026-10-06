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
  /** Area hit centered on the attacker's body (shockwaves, spins) instead of the aim line. */
  area?: boolean;
  /** Range grows/shrinks linearly over the window (yo-yo throws): [range at start, range at end]. */
  reach?: [number, number];
}

/** Projectile emission at a given frame. */
export interface Spawn extends HitProps {
  frame: number;
  hand: 'L' | 'R';
  speed: number;
  radius: number;
  life: number;
  count?: number;
  /** Random cone half-angle (radians-ish). */
  spread?: number;
  /** Fixed fan step between `count` projectiles (radians). */
  fan?: number;
  size?: number;
  /** Downward acceleration (m/s^2) for arcing projectiles. */
  gravity?: number;
  visual?: 'star' | 'arrow' | 'hook' | 'wave' | 'umbrella' | 'shell' | 'card' | 'bullet';
  /** Blows up where it stops; the splash hits the opponent unless the shell itself already did. */
  blast?: Blast;
  /** Rain down from above the opponent, or run along the floor from the feet (shockwaves). */
  from?: 'hand' | 'sky' | 'ground' | 'down';
  /**
   * Grappling hook: 'self' pulls the shooter to whatever it latches onto
   * (terrain or the opponent); 'yank' reels the opponent in instead;
   * 'tether' only catches the opponent (then `onHit` swings them), and does nothing on a miss.
   */
  hook?: 'self' | 'yank' | 'tether';
  /** On hit, marks the target for this many frames (see `seekMarked`). */
  mark?: number;
  /** Steers toward a target marked by the shooter at this turn rate (rad/s). */
  seekMarked?: number;
  /** Steers toward the opponent at this turn rate (rad/s). */
  homing?: number;
  /** After hitting or expiring, flies back to the owner (harmless) instead of vanishing. */
  returns?: boolean;
  /** Action the shooter starts when this projectile connects with the opponent. */
  onHit?: string;
}

/** Self velocity applied during frames [start, end). Relative to facing. */
export interface Motion {
  start: number;
  end: number;
  forward: number;
  up?: number;
  /** Steer toward the opponent when roughly in front (melee magnet). */
  magnet?: boolean;
  /** Keeps vertical speed at least this high during the window (hover / rising spins). */
  lift?: number;
  /** Sidestep speed (toward the held strafe direction, right by default). */
  side?: number;
}

/** Hold-to-charge: the action pauses at frame `at` while the button is held. */
export interface Charge {
  at: number;
  /** Frames to reach full charge. */
  max: number;
  /** Multipliers at full charge (`guard` scales guard damage). */
  damage?: number;
  knockback?: number;
  speed?: number;
  size?: number;
  guard?: number;
  /** Gravity multiplier at full charge (heavier shells drop sooner). */
  gravity?: number;
}

/** Explosion when a projectile stops (terrain, the opponent, or end of life). */
export interface Blast {
  radius: number;
  damage: number;
  knockback: number;
  knockUp: number;
  hitstun: number;
  hitstop?: number;
  guardDamage?: number;
}

export type ActionKind = 'attack' | 'skill' | 'ult';

export interface ActionDef {
  id: string;
  kind: ActionKind;
  /** Display name (ult cut-ins). */
  name?: string;
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
  charge?: Charge;
  /** Ends the action on landing (air slams). */
  landCancel?: boolean;
  /** Counter stance: a hit landing in [start, end) is negated and `follow` starts behind the attacker. */
  counter?: { start: number; end: number; follow: string };
  /**
   * Tether throw: while a tether hook holds the opponent, they are hauled overhead
   * and slung forward; `hit` lands on them at `release`.
   */
  tether?: { release: number; hit: HitProps };
  /**
   * Decoys: copies of the user appear at `frame`. Without `around` one copy runs
   * straight ahead from the user's spot; with it they ring the opponent. A decoy
   * pops (with `burst`) when anything hits it or its time runs out. `cloak`
   * turns the user nearly invisible for that many frames.
   */
  decoy?: { frame: number; life: number; speed: number; burst: Blast; cloak?: number; around?: { count: number; radius: number }; fire?: { every: number; spawn: Spawn } };
  /** After this action, fall no faster than this (m/s) until landing, with light air steering (umbrella float). */
  float?: number;
  /** Bodies don't collide during the action (pass-through slashes). */
  passThrough?: boolean;
  /** Parry: frontal projectiles in [start, end) are sent back, melee is blocked and bounced. */
  reflect?: [number, number];
}

/** Pieces of the Quaternius modular outfits. */
export type OutfitPart = 'body' | 'arms' | 'legs' | 'feet' | 'hood' | 'pauldron' | 'bracer' | 'belt';

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
  /** CC0 outfit (Quaternius Modular Character Outfits) tinted with the colors above; replaces the code-built clothes. */
  outfit?: { set: 'ranger' | 'peasant'; parts: OutfitPart[]; mix?: { set: 'ranger' | 'peasant'; parts: OutfitPart[] } };
  /** Painted face details (see render/face.ts). */
  face?: FaceLook;
  /** CC0 beard from the base-character kit. */
  beard?: boolean;
  /** Code-built head accessories. */
  accessories?: { kind: 'headband' | 'hachimaki' | 'twinTails' | 'cap' | 'ribbon' | 'obi' | 'topHat' | 'beret'; color: number }[];
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  weapon: 'fists' | 'guns' | 'bow' | 'hammer' | 'katana' | 'yoyo' | 'grapple' | 'umbrella' | 'cannon' | 'cards' | 'rifle';
  /** CPU play style. */
  archetype: 'melee' | 'ranged';
  /** Theme colors for trails, sparks and auras. */
  element: { color: number; color2: number };
  /** Fire repeatedly while the attack button is held. */
  autoFire?: boolean;
  /** Rising move on Space while airborne (once per jump); optional. */
  recovery?: string;
  /** Attack performed when clicking during a dash; optional. */
  dashAttack?: string;
  /** Push-back (m/s) per shot that hits the floor or a floating rock nearby (not the opponent). */
  recoil?: number;
  /** Knockback taken is divided by this (heavyweights > 1). */
  weight?: number;
  /**
   * Umbrella: reflect windows only stop projectiles (melee goes through) and wear
   * down the canopy's HP; at zero it stays shut for `breakFrames` (no stun),
   * during which `brokenBasic` replaces the basic attack and canopy moves are off.
   */
  canopy?: { breakFrames: number; brokenBasic: string };
  /** Holding jump in the air caps the fall speed at this value (umbrella glide). */
  glide?: number;
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
  /** Jump held (gliding). */
  jump: boolean;
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
  jump: false,
  dashPressed: false,
  skillPressed: false,
  ultPressed: false,
  reloadPressed: false,
});

/** Details painted onto the base face texture so the shared head reads as different people. */
export interface FaceLook {
  /** Paint over the baked stubble (male head). */
  shave?: boolean;
  freckles?: boolean;
  /** Cheek blush strength 0..1. */
  blush?: number;
  lips?: number;
  /** Dark upper-lid liner. */
  liner?: boolean;
  mole?: boolean;
  marks?: { kind: 'scar' | 'plaster' | 'stripes' | 'star' | 'heart' | 'noseBand'; color: number; side?: 1 | -1 }[];
}
