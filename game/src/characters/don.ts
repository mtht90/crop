import type { ActionDef, CharacterDef, Spawn } from '../combat/types';

/**
 * Cannon shell from the arm cannon: heavy, arcing, and it blows up where it
 * stops. Charging loads a heavier shell: it hits and explodes harder but flies
 * slower and drops sooner (shorter range).
 */
const shell = (frame: number, extra: Partial<Spawn> = {}): Spawn => ({
  frame,
  hand: 'R',
  speed: 42,
  gravity: 18,
  radius: 0.4,
  size: 1.3,
  life: 80,
  visual: 'shell',
  damage: 48,
  knockback: 7,
  knockUp: 4,
  hitstun: 20,
  hitstop: 6,
  guardDamage: 14,
  blast: { radius: 2.8, damage: 34, knockback: 7, knockUp: 6, hitstun: 20 },
  ...extra,
});

// Ult: plant the feet and empty the magazine, then one giant shell.
const barrage: Spawn[] = [];
for (let i = 0; i < 7; i++) barrage.push(shell(18 + i * 9, { spread: 0.05, damage: 24, knockback: 4, knockUp: 3, hitstun: 22, blast: { radius: 2.0, damage: 16, knockback: 4, knockUp: 4, hitstun: 22 } }));
barrage.push(shell(94, { speed: 28, gravity: 10, size: 3, radius: 0.9, damage: 90, knockback: 18, knockUp: 11, hitstun: 40, hitstop: 14, heavy: true, guardDamage: 80, blast: { radius: 4.5, damage: 70, knockback: 17, knockUp: 12, hitstun: 36, hitstop: 12 } }));

const actions: Record<string, ActionDef> = {
  // Click: fire a shell (hold to load a heavier one).
  cannonShot: {
    id: 'cannonShot',
    kind: 'attack',
    anim: 'cannonShot',
    total: 30,
    spawns: [shell(7)],
    charge: { at: 6, max: 40, damage: 1.9, knockback: 1.6, speed: 0.6, size: 1.9, gravity: 2.2, guard: 2.5 },
    upperBody: true,
    moveScale: 0.45,
  },
  // E: slam the cannon arm into the floor: an explosion all around.
  groundSlam: {
    id: 'groundSlam',
    kind: 'skill',
    anim: 'groundSlam',
    total: 48,
    hits: [{ start: 16, end: 20, area: true, range: 0.8, radius: 3.4, damage: 70, knockback: 14, knockUp: 11, hitstun: 30, hitstop: 12, heavy: true, guardDamage: 45, hand: 'R' }],
    moveScale: 0,
  },
  // Air Space: fire straight down and ride the blast up (once per airtime).
  cannonJump: {
    id: 'cannonJump',
    kind: 'attack',
    anim: 'cannonJump',
    total: 30,
    spawns: [shell(1, { from: 'down', speed: 40, gravity: 0, life: 20, size: 1.2, damage: 30, blast: { radius: 2.4, damage: 30, knockback: 9, knockUp: 8, hitstun: 22 } })],
    motion: [{ start: 1, end: 10, forward: 5, up: 17, lift: 5 }],
    moveScale: 0.7,
  },
  // Click during a dash: shoulder tackle.
  shoulderTackle: {
    id: 'shoulderTackle',
    kind: 'attack',
    anim: 'shoulderTackle',
    total: 32,
    hits: [{ start: 4, end: 14, damage: 58, knockback: 13, knockUp: 4, hitstun: 24, hitstop: 8, range: 1.2, radius: 1.1, heavy: true, guardDamage: 30, hand: 'B' }],
    motion: [{ start: 0, end: 13, forward: 17, magnet: true }],
    moveScale: 0,
  },
  // Q: "Full Burst".
  fullBurst: {
    id: 'fullBurst',
    kind: 'ult',
    name: 'フルバースト',
    anim: 'fullBurst',
    total: 120,
    spawns: barrage,
    committed: true,
    armor: true,
    invuln: [0, 12],
    moveScale: 0,
  },
};

export const don: CharacterDef = {
  id: 'don',
  name: 'ドン',
  title: '鋼腕の砲撃手',
  weapon: 'cannon',
  archetype: 'ranged',
  element: { color: 0xff6a2a, color2: 0xffd36b },
  recovery: 'cannonJump',
  dashAttack: 'shoulderTackle',
  maxHp: 1200,
  weight: 1.25,
  walkSpeed: 6.9,
  jumpSpeed: 10.8,
  preferredRange: [6, 15],
  skillCooldown: 180,
  actions,
  basic: 'cannonShot',
  skill: 'groundSlam',
  ult: 'fullBurst',
  airBasic: 'cannonShot',
  look: {
    skin: 0xb07850,
    hair: 0x3a2a22,
    top: 0x5a6070,
    topAccent: 0xff6a2a,
    pants: 0x3a3f4a,
    shoes: 0x2a2a30,
    glove: 0x3a3f4a,
    eyes: 0xff8a3a,
    hairStyle: 'spiky',
    face: { marks: [{ kind: 'scar', color: 0x7a3a34, side: 1 }] },
    body: 'male',
    hairModel: 'hairBuzzed',
    outfit: { set: 'ranger', parts: ['body', 'arms', 'bracer', 'belt', 'legs', 'feet', 'pauldron'] },
    beard: true,
  },
};
