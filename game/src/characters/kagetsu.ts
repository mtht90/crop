import type { ActionDef, CharacterDef, HitWindow } from '../combat/types';

// Ult: a vanishing dash, a flurry of cuts that holds the target, then one big slash.
const flurry: HitWindow[] = [];
for (let i = 0; i < 7; i++) {
  flurry.push({ start: 26 + i * 5, end: 29 + i * 5, damage: 14, knockback: 0, knockUp: 0.5, hitstun: 30, hitstop: 2, range: 1.2, radius: 1.4, pull: true, hand: 'R', guardDamage: 8 });
}
flurry.push({ start: 66, end: 71, damage: 150, knockback: 19, knockUp: 11, hitstun: 40, hitstop: 16, range: 1.4, radius: 1.5, heavy: true, hand: 'R', guardDamage: 100 });

const actions: Record<string, ActionDef> = {
  // Click x3: quick diagonal cut, return cut, then a stepping thrust.
  slashA: {
    id: 'slashA',
    kind: 'attack',
    anim: 'slashA',
    total: 22,
    hits: [{ start: 6, end: 10, damage: 40, knockback: 3.5, knockUp: 1, hitstun: 17, hitstop: 5, range: 1.8, radius: 1.0, hand: 'R', guardDamage: 10 }],
    motion: [{ start: 0, end: 8, forward: 4, magnet: true }],
    comboNext: 'slashB',
    comboFrom: 10,
    moveScale: 0.35,
  },
  slashB: {
    id: 'slashB',
    kind: 'attack',
    anim: 'slashB',
    total: 24,
    hits: [{ start: 6, end: 10, damage: 44, knockback: 4, knockUp: 1.5, hitstun: 18, hitstop: 5, range: 1.8, radius: 1.0, hand: 'R', guardDamage: 12 }],
    motion: [{ start: 0, end: 8, forward: 4.5, magnet: true }],
    comboNext: 'slashC',
    comboFrom: 11,
    moveScale: 0.35,
  },
  slashC: {
    id: 'slashC',
    kind: 'attack',
    anim: 'slashC',
    total: 36,
    hits: [{ start: 11, end: 16, damage: 80, knockback: 11, knockUp: 5, hitstun: 26, hitstop: 10, range: 2.1, radius: 1.0, hand: 'R', heavy: true, guardDamage: 30 }],
    motion: [{ start: 7, end: 15, forward: 10, magnet: true }],
    moveScale: 0.1,
  },
  // Air click: a falling crescent cut.
  airSlash: {
    id: 'airSlash',
    kind: 'attack',
    anim: 'airSlash',
    total: 28,
    hits: [{ start: 7, end: 13, damage: 55, knockback: 7, knockUp: -2, hitstun: 22, hitstop: 7, range: 1.8, radius: 1.1, hand: 'R', guardDamage: 18 }],
    motion: [{ start: 4, end: 12, forward: 6, magnet: true }],
    moveScale: 0.5,
  },
  // Air Space: rising "swallow" cut (edge recovery).
  tsubame: {
    id: 'tsubame',
    kind: 'attack',
    anim: 'tsubame',
    total: 34,
    hits: [{ start: 3, end: 14, damage: 50, knockback: 5, knockUp: 12, hitstun: 26, hitstop: 6, range: 1.3, radius: 1.1, hand: 'R', guardDamage: 18 }],
    motion: [{ start: 1, end: 14, forward: 7, up: 15 }],
    invuln: [0, 5],
    moveScale: 0.6,
  },
  // Click during a dash: slip through the opponent with a cut and end up behind them.
  passSlash: {
    id: 'passSlash',
    kind: 'attack',
    anim: 'passSlash',
    total: 30,
    hits: [{ start: 3, end: 11, damage: 60, knockback: 6, knockUp: 6, hitstun: 26, hitstop: 8, range: 0.6, radius: 1.2, hand: 'R', guardDamage: 25 }],
    motion: [{ start: 0, end: 11, forward: 24 }],
    invuln: [0, 10],
    passThrough: true,
    moveScale: 0,
  },
  // E: iai stance. Any attack in the window is countered from behind.
  iai: {
    id: 'iai',
    kind: 'skill',
    anim: 'iai',
    total: 40,
    counter: { start: 2, end: 26, follow: 'iaiStrike' },
    moveScale: 0,
  },
  iaiStrike: {
    id: 'iaiStrike',
    kind: 'attack',
    anim: 'iaiStrike',
    total: 30,
    hits: [{ start: 4, end: 9, damage: 110, knockback: 14, knockUp: 8, hitstun: 32, hitstop: 14, range: 1.7, radius: 1.3, hand: 'R', heavy: true, guardDamage: 60 }],
    committed: true,
    moveScale: 0,
  },
  // Q: "Getsuei Issen" - vanish forward, then the flurry.
  getsuei: {
    id: 'getsuei',
    kind: 'ult',
    name: '月影一閃',
    anim: 'getsuei',
    total: 100,
    hits: [{ start: 12, end: 24, damage: 30, knockback: 0, knockUp: 1, hitstun: 40, hitstop: 8, range: 1.2, radius: 1.3, pull: true, hand: 'R', guardDamage: 20 }, ...flurry],
    motion: [{ start: 10, end: 24, forward: 26, magnet: true }],
    invuln: [0, 26],
    passThrough: true,
    committed: true,
    moveScale: 0,
  },
};

export const kagetsu: CharacterDef = {
  id: 'kagetsu',
  name: 'カゲツ',
  title: '月影の剣士',
  weapon: 'katana',
  archetype: 'melee',
  element: { color: 0x4a6cff, color2: 0xdfe8ff },
  recovery: 'tsubame',
  dashAttack: 'passSlash',
  maxHp: 950,
  walkSpeed: 7.8,
  jumpSpeed: 11.5,
  preferredRange: [0, 2.2],
  skillCooldown: 200,
  actions,
  basic: 'slashA',
  skill: 'iai',
  ult: 'getsuei',
  airBasic: 'airSlash',
  look: {
    skin: 0xf2d0b4,
    hair: 0x1d1d2b,
    top: 0x2a3566,
    topAccent: 0xf2f4ff,
    pants: 0x1b1f33,
    shoes: 0x2a2a3a,
    glove: 0x1b1b26,
    eyes: 0x3b4cc0,
    hairStyle: 'ponytail',
    body: 'male',
    hairModel: 'hairParted',
    // Ranger jacket as a haori, peasant trousers as hakama, an obi sash on top.
    outfit: { set: 'ranger', parts: ['body', 'arms', 'bracer', 'feet'], mix: { set: 'peasant', parts: ['legs'] } },
    accessories: [
      { kind: 'hachimaki', color: 0xf2f4ff },
      { kind: 'obi', color: 0x7a1f2b },
    ],
  },
};
