import type { ActionDef, CharacterDef, Spawn } from '../combat/types';

// Ult: canopy open as a bullet-proof shield while the tip fires, then a stun round.
const barrage: Spawn[] = [];
for (let i = 0; i < 10; i++) {
  barrage.push({ frame: 16 + i * 5, hand: 'R', speed: 72, radius: 0.25, life: 40, damage: 14, knockback: 1.5, knockUp: 0.5, hitstun: 18, hitstop: 2, guardDamage: 5 });
}
barrage.push({ frame: 76, hand: 'R', speed: 64, radius: 0.5, life: 50, size: 1.7, damage: 120, knockback: 18, knockUp: 10, hitstun: 40, hitstop: 15, heavy: true, guardDamage: 90 });

const actions: Record<string, ActionDef> = {
  // While the umbrella is broken, click thrusts with it furled (x3: two thrusts, then a swing).
  pokeA: {
    id: 'pokeA',
    kind: 'attack',
    anim: 'pokeA',
    total: 20,
    hits: [{ start: 5, end: 9, damage: 32, knockback: 3.5, knockUp: 0.5, hitstun: 16, hitstop: 4, range: 2.2, radius: 0.7, hand: 'R', guardDamage: 9 }],
    motion: [{ start: 0, end: 7, forward: 4, magnet: true }],
    comboNext: 'pokeB',
    comboFrom: 9,
    moveScale: 0.4,
  },
  pokeB: {
    id: 'pokeB',
    kind: 'attack',
    anim: 'pokeB',
    total: 22,
    hits: [{ start: 5, end: 9, damage: 35, knockback: 4, knockUp: 1, hitstun: 17, hitstop: 5, range: 2.3, radius: 0.75, hand: 'R', guardDamage: 10 }],
    motion: [{ start: 0, end: 7, forward: 4.5, magnet: true }],
    comboNext: 'sweep',
    comboFrom: 10,
    moveScale: 0.4,
  },
  sweep: {
    id: 'sweep',
    kind: 'attack',
    anim: 'sweep',
    total: 34,
    hits: [{ start: 10, end: 15, damage: 74, knockback: 11, knockUp: 6, hitstun: 26, hitstop: 9, range: 1.9, radius: 1.3, hand: 'R', heavy: true, guardDamage: 28 }],
    motion: [{ start: 6, end: 13, forward: 6, magnet: true }],
    moveScale: 0.15,
  },
  // Air Space: open the umbrella and ride an updraft (then hold Space to glide).
  updraft: {
    id: 'updraft',
    kind: 'attack',
    anim: 'updraft',
    total: 30,
    hits: [{ start: 2, end: 10, area: true, range: 0, radius: 1.6, damage: 30, knockback: 6, knockUp: 6, hitstun: 20, hitstop: 4, hand: 'R', guardDamage: 12 }],
    motion: [{ start: 0, end: 12, forward: 5, up: 14, lift: 5 }],
    moveScale: 0.8,
  },
  // Click during a dash: charge with the umbrella open in front (frontal shots bounce off).
  umbrellaRush: {
    id: 'umbrellaRush',
    kind: 'attack',
    anim: 'umbrellaRush',
    total: 30,
    hits: [{ start: 3, end: 12, damage: 55, knockback: 12, knockUp: 4, hitstun: 24, hitstop: 8, range: 1.3, radius: 1.15, hand: 'R', heavy: true, guardDamage: 30 }],
    motion: [{ start: 0, end: 12, forward: 16, magnet: true }],
    reflect: [0, 13],
    moveScale: 0,
  },
  // Click (hold): open the umbrella in front as a shield (stops shots, not melee),
  // walking at half speed while light rounds fire from the tip.
  umbrellaOpen: {
    id: 'umbrellaOpen',
    kind: 'attack',
    anim: 'umbrellaOpen',
    total: 22,
    spawns: [{ frame: 10, hand: 'R', speed: 62, radius: 0.22, life: 34, damage: 16, knockback: 1.8, knockUp: 0.3, hitstun: 12, hitstop: 1, guardDamage: 5 }],
    reflect: [0, 22],
    moveScale: 0.5,
  },
  // E: hop straight up, then float down under the open umbrella (a little steering).
  hopFloat: {
    id: 'hopFloat',
    kind: 'skill',
    anim: 'hopFloat',
    total: 16,
    motion: [{ start: 1, end: 3, forward: 0, up: 15.5 }],
    float: 2.2,
    moveScale: 0.3,
  },
  // Q: open the umbrella as a shield and fire from the tip.
  shieldFire: {
    id: 'shieldFire',
    kind: 'ult',
    name: 'パラソル・バレット',
    anim: 'shieldFire',
    total: 96,
    spawns: barrage,
    reflect: [4, 86],
    moveScale: 0.5,
    committed: true,
    armor: true,
    invuln: [0, 10],
  },
};

export const ameri: CharacterDef = {
  id: 'ameri',
  name: 'アメリ',
  title: '雨傘のお嬢さま',
  weapon: 'umbrella',
  archetype: 'ranged',
  element: { color: 0x9b7bff, color2: 0x7fd8ff },
  recovery: 'updraft',
  dashAttack: 'umbrellaRush',
  canopy: { breakFrames: 300, brokenBasic: 'pokeA' },
  autoFire: true,
  glide: 3.2,
  maxHp: 950,
  walkSpeed: 7.2,
  jumpSpeed: 11.5,
  preferredRange: [5, 12],
  skillCooldown: 150,
  actions,
  basic: 'umbrellaOpen',
  skill: 'hopFloat',
  ult: 'shieldFire',
  look: {
    skin: 0xffe0cc,
    hair: 0xffe08a,
    top: 0xb9a3ff,
    topAccent: 0xffffff,
    pants: 0x5a4aa8,
    shoes: 0x7fd8ff,
    glove: 0xffffff,
    eyes: 0x6b4ad6,
    hairStyle: 'spiky',
    body: 'female',
    hairModel: 'hairBuns',
    outfit: { set: 'peasant', parts: ['body', 'arms', 'legs', 'feet'] },
    accessories: [{ kind: 'ribbon', color: 0xffffff }],
  },
};
