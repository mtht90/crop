import type { ActionDef, CharacterDef, Spawn } from '../combat/types';

/** Suction-cup grapple: sticks to terrain or the opponent and reels Zip in. */
const hook = (frame: number, extra: Partial<Spawn> = {}): Spawn => ({
  frame,
  hand: 'R',
  speed: 54,
  radius: 0.45,
  life: 32,
  visual: 'hook',
  hook: 'self',
  damage: 22,
  knockback: 0,
  knockUp: 1,
  hitstun: 22,
  hitstop: 4,
  guardDamage: 6,
  ...extra,
});

const actions: Record<string, ActionDef> = {
  // Click (ground or air): fire the hook where you aim. On terrain it reels Zip in;
  // on the opponent it reels Zip in knee-first.
  hookShot: {
    id: 'hookShot',
    kind: 'attack',
    anim: 'hookShot',
    total: 48,
    spawns: [hook(5, { onHit: 'kneeStrike', damage: 8, hitstun: 16, life: 17 })],
    moveScale: 0.6,
    upperBody: true,
  },
  // Flying knee: active for the whole reel-in, lands on arrival.
  kneeStrike: {
    id: 'kneeStrike',
    kind: 'attack',
    anim: 'kneeStrike',
    total: 34,
    hits: [{ start: 1, end: 30, damage: 40, knockback: 8, knockUp: 6, hitstun: 26, hitstop: 11, range: 0.7, radius: 1.1, hand: 'B', heavy: true, guardDamage: 30 }],
    moveScale: 0,
  },
  // E: double hook. Two cords fan out left and right; once both bite (terrain,
  // the opponent, or the end of the line) Zip is slingshot through the midpoint.
  slingShot: {
    id: 'slingShot',
    kind: 'skill',
    anim: 'slingShot',
    total: 40,
    spawns: [hook(6, { hook: 'anchor', count: 2, fan: 0.62, speed: 62, life: 15, damage: 12, hitstun: 18, knockUp: 0.5 })],
    moveScale: 0.25,
  },
  // The slingshot flight: Zip's whole body is the hitbox.
  slingRush: {
    id: 'slingRush',
    kind: 'attack',
    anim: 'slingRush',
    total: 30,
    hits: [{ start: 1, end: 24, area: true, range: 0, radius: 1.35, damage: 66, knockback: 13, knockUp: 7, hitstun: 26, hitstop: 10, hand: 'B', heavy: true, guardDamage: 30 }],
    moveScale: 0,
  },
  // Air Space: the same hook as an edge recovery (once per airtime).
  hookAir: {
    id: 'hookAir',
    kind: 'attack',
    anim: 'hookShot',
    total: 22,
    spawns: [hook(4)],
    moveScale: 0.6,
  },
  // Click during a dash: flying drop kick.
  dropKick: {
    id: 'dropKick',
    kind: 'attack',
    anim: 'dropKick',
    total: 32,
    hits: [{ start: 4, end: 12, damage: 62, knockback: 12, knockUp: 5, hitstun: 24, hitstop: 8, range: 1.4, radius: 1.0, hand: 'B', heavy: true, guardDamage: 25 }],
    motion: [{ start: 0, end: 12, forward: 18, up: 3, magnet: true }],
    moveScale: 0,
  },
  // Q: a giant hook that reels the opponent in for a launcher uppercut.
  reelIn: {
    id: 'reelIn',
    kind: 'ult',
    name: 'リール・アンド・アッパー',
    anim: 'reelIn',
    total: 44,
    spawns: [hook(12, { hook: 'yank', onHit: 'reelFinisher', speed: 52, life: 42, radius: 0.75, size: 1.8, damage: 40, hitstun: 50, hitstop: 10, guardDamage: 40 })],
    committed: true,
    invuln: [0, 12],
    moveScale: 0,
  },
  reelFinisher: {
    id: 'reelFinisher',
    kind: 'attack',
    anim: 'reelFinisher',
    total: 70,
    hits: [{ start: 8, end: 46, damage: 160, knockback: 18, knockUp: 15, hitstun: 40, hitstop: 18, range: 1.4, radius: 1.5, hand: 'L', heavy: true, guardDamage: 100 }],
    committed: true,
    armor: true,
    moveScale: 0,
  },
};

export const zip: CharacterDef = {
  id: 'zip',
  name: 'ジップ',
  title: '空翔けるフック使い',
  weapon: 'grapple',
  archetype: 'ranged',
  element: { color: 0xff8a1f, color2: 0x2fd0ff },
  recovery: 'hookAir',
  dashAttack: 'dropKick',
  maxHp: 920,
  walkSpeed: 7.5,
  jumpSpeed: 11.5,
  preferredRange: [3, 12],
  skillCooldown: 150,
  autoFire: true,
  actions,
  basic: 'hookShot',
  skill: 'slingShot',
  ult: 'reelIn',
  airBasic: 'hookShot',
  look: {
    skin: 0x7c4e33,
    hair: 0x2b1d14,
    top: 0xff8a1f,
    topAccent: 0x2fd0ff,
    pants: 0x3a4250,
    shoes: 0x2fd0ff,
    glove: 0x2b2b3d,
    eyes: 0x2b1d14,
    hairStyle: 'spiky',
    face: { marks: [{ kind: 'noseBand', color: 0xf2e6d0 }] },
    body: 'male',
    hairModel: 'hairBuzzed',
    outfit: { set: 'ranger', parts: ['body', 'arms', 'bracer', 'belt', 'legs', 'feet', 'pauldron'] },
    beard: true,
  },
};
