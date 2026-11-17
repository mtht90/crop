import * as THREE from 'three';

export type Kind = 'solid' | 'boost' | 'orb' | 'ring';

export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  kind: Kind;
  /** solid that the player may wall-run on */
  wallrun?: boolean;
  /** can be smashed through during OVERDRIVE */
  breakable?: boolean;
  /** style tag for scoring */
  tag?: 'vault' | 'slide' | 'blocker' | 'platform' | 'wall';
  obj?: THREE.Object3D;
  dead?: boolean;
  passed?: boolean;
  touched?: boolean;
}

/** Ramp: walkable slope along Z. yNear at zNear (bigger z), yFar at zFar. */
export interface Ramp {
  x0: number; x1: number;
  zNear: number; zFar: number;
  yNear: number; yFar: number;
}

export interface Chunk {
  zNear: number;
  zFar: number;
  group: THREE.Group;
  colliders: Collider[];
  ramps: Ramp[];
  biome: number;
  disposables: { dispose(): void }[];
  /** animated objects (rotate etc.) */
  animators: ((t: number, dt: number) => void)[];
}

export interface BiomeAtmosphere {
  sky: string;           // sky texture key
  fog: THREE.Color;
  fogDensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunDir: THREE.Vector3; // direction *towards* sun
  envIntensity: number;
  exposure: number;
  bloom: number;
  bloomThreshold: number;
  skyIntensity: number;
  speedTint: THREE.Color; // color of speed lines
}
