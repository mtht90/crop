import type { ActionDef, Blast, CharacterDef, Spawn } from '../combat/types';

/** Playing card: quick, light, flies straight. */
const card = (frame: number, extra: Partial<Spawn> = {}): Spawn => ({
  frame,
  hand: 'R',
  speed: 58,
  radius: 0.26,
  life: 30,
  visual: 'card',
  damage: 15,
  knockback: 2.5,
  knockUp: 0.6,
  hitstun: 13,
  hitstop: 2,
  guardDamage: 5,
  ...extra,
});

const pop: Blast = { radius: 2.4, damage: 36, knockback: 10, knockUp: 8, hitstun: 26, hitstop: 8, guardDamage: 25 };

const actions: Record<string, ActionDef> = {
  // Click (hold to keep throwing): a fan of three cards.
  cardThrow: {
    id: 'cardThrow',
    kind: 'attack',
    anim: 'cardThrow',
    total: 24,
    spawns: [card(5, { count: 3, fan: 0.1 })],
    upperBody: true,
    moveScale: 0.7,
  },
  // E: "Mirage" - a copy of Trick appears on the spot with the same HP, walks at
  // the opponent and throws cards, while the real one sidesteps nearly invisible.
  // The copy flinches like the real one and bursts once its HP runs out (or after 6 s).
  mirage: {
    id: 'mirage',
    kind: 'skill',
    anim: 'mirage',
    total: 18,
    decoy: { frame: 2, life: 360, speed: 0, burst: pop, cloak: 100, sameHp: true, chase: 6, fire: { every: 42, spawn: card(0, { count: 3, fan: 0.1, damage: 10 }) } },
    motion: [{ start: 2, end: 12, forward: -2, side: 13 }],
    invuln: [0, 8],
    moveScale: 0.6,
  },
  // Air Space: a burst of doves lifts Trick (edge recovery).
  doveLift: {
    id: 'doveLift',
    kind: 'attack',
    anim: 'doveLift',
    total: 30,
    hits: [{ start: 2, end: 12, area: true, range: 0, radius: 1.5, damage: 26, knockback: 6, knockUp: 7, hitstun: 20, hitstop: 4, hand: 'R', guardDamage: 10 }],
    motion: [{ start: 1, end: 13, forward: 6, up: 15, lift: 4 }],
    moveScale: 0.8,
  },
  // Click during a dash: cane thrust.
  caneDash: {
    id: 'caneDash',
    kind: 'attack',
    anim: 'caneDash',
    total: 30,
    hits: [{ start: 4, end: 12, damage: 52, knockback: 11, knockUp: 4, hitstun: 24, hitstop: 8, range: 1.5, radius: 1.0, hand: 'R', heavy: true, guardDamage: 25 }],
    motion: [{ start: 0, end: 12, forward: 17, magnet: true }],
    moveScale: 0,
  },
  // Q: "Mirror House" - four copies ring the opponent and pelt them with cards, then burst.
  mirrorHouse: {
    id: 'mirrorHouse',
    kind: 'ult',
    name: 'ミラーハウス',
    anim: 'mirrorHouse',
    total: 50,
    decoy: {
      frame: 14,
      life: 150,
      speed: 0,
      burst: { radius: 2.6, damage: 40, knockback: 12, knockUp: 9, hitstun: 30, hitstop: 8, guardDamage: 30 },
      cloak: 150,
      around: { count: 4, radius: 4.2 },
      fire: { every: 30, spawn: card(0, { damage: 10, hitstun: 16, knockback: 1.5 }) },
    },
    invuln: [0, 20],
    committed: true,
    moveScale: 0.3,
  },
};

export const trick: CharacterDef = {
  id: 'trick',
  name: 'トリック',
  title: '幻影のマジシャン',
  weapon: 'cards',
  archetype: 'ranged',
  element: { color: 0xb44dff, color2: 0xffd84a },
  recovery: 'doveLift',
  dashAttack: 'caneDash',
  maxHp: 940,
  walkSpeed: 7.6,
  jumpSpeed: 11.8,
  preferredRange: [5, 12],
  skillCooldown: 300,
  autoFire: true,
  actions,
  basic: 'cardThrow',
  skill: 'mirage',
  ult: 'mirrorHouse',
  airBasic: 'cardThrow',
  look: {
    skin: 0xf1cfb6,
    hair: 0x2a1f3a,
    top: 0x2a2140,
    topAccent: 0xb44dff,
    pants: 0x1e1a2c,
    shoes: 0x14121c,
    glove: 0xffffff,
    eyes: 0xb44dff,
    hairStyle: 'spiky',
    face: { shave: true, liner: true, marks: [{ kind: 'star', color: 0xb44dff, side: 1 }] },
    body: 'male',
    hairModel: 'hairParted',
    outfit: { set: 'ranger', parts: ['body', 'arms', 'legs', 'feet', 'belt'] },
    accessories: [{ kind: 'topHat', color: 0x1e1a2c }],
  },
};
