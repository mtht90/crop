import type { ActionDef, CharacterDef, Spawn } from '../combat/types';

const arrow = (frame: number): Spawn => ({
  frame,
  hand: 'L',
  speed: 46,
  radius: 0.26,
  life: 80,
  gravity: 7,
  visual: 'arrow',
  damage: 60,
  knockback: 4,
  knockUp: 1.5,
  hitstun: 14,
  hitstop: 3,
  guardDamage: 8,
});

const rain: Spawn[] = [];
for (let i = 0; i < 24; i++) {
  rain.push({ ...arrow(22 + Math.floor(i * 2.5)), from: 'sky', speed: 30, gravity: 0, damage: 16, knockback: 1.5, knockUp: 0.5, hitstun: 14, hitstop: 1, guardDamage: 4, life: 60 });
}
rain.push({ ...arrow(92), speed: 72, gravity: 2, size: 2.4, radius: 0.6, damage: 120, knockback: 18, knockUp: 10, hitstun: 36, hitstop: 14, heavy: true, guardDamage: 80 });

const actions: Record<string, ActionDef> = {
  // Click: tap for a quick arrow, hold to draw for a stronger, faster shot.
  drawShot: {
    id: 'drawShot',
    kind: 'attack',
    anim: 'drawShot',
    total: 18,
    spawns: [arrow(7)],
    charge: { at: 6, max: 36, damage: 2.6, knockback: 2.8, speed: 1.6, size: 1.4, guard: 6 },
    upperBody: true,
    moveScale: 0.45,
  },
  // E: three arrows in a fan.
  triShot: {
    id: 'triShot',
    kind: 'skill',
    anim: 'triShot',
    total: 30,
    spawns: [{ ...arrow(10), count: 3, fan: 0.12, damage: 44, knockback: 8, knockUp: 3, hitstun: 20, hitstop: 5 }],
    upperBody: true,
    moveScale: 0.3,
  },
  // Click during a dash: tumble forward and loose an arrow from the roll.
  rollShot: {
    id: 'rollShot',
    kind: 'attack',
    anim: 'rollShot',
    total: 30,
    motion: [{ start: 0, end: 12, forward: 12 }],
    spawns: [{ ...arrow(14), speed: 60, damage: 40, knockback: 7, knockUp: 3, hitstun: 18 }],
    invuln: [0, 8],
    moveScale: 0,
  },
  // Q: arrows rain on the opponent, then a huge piercing finisher.
  arrowRain: {
    id: 'arrowRain',
    kind: 'ult',
    name: 'アローレイン',
    anim: 'arrowRain',
    total: 110,
    spawns: rain,
    moveScale: 0.25,
    committed: true,
    armor: true,
    invuln: [0, 10],
  },
};

export const arrowChar: CharacterDef = {
  id: 'arrow',
  name: 'アロー',
  title: '翠風のアーチャー',
  weapon: 'bow',
  archetype: 'ranged',
  element: { color: 0x3fd98a, color2: 0xd8ffb0 },
  dashAttack: 'rollShot',
  recoil: 7,
  maxHp: 1180,
  walkSpeed: 7.0,
  jumpSpeed: 12,
  preferredRange: [7, 13],
  skillCooldown: 240,
  actions,
  basic: 'drawShot',
  skill: 'triShot',
  ult: 'arrowRain',
  airBasic: 'drawShot',
  look: {
    skin: 0xc58f66,
    hair: 0x5a3a24,
    top: 0x2f9e5e,
    topAccent: 0xf2e6c9,
    pants: 0x6b4a2e,
    shoes: 0x3b2a1e,
    glove: 0x6b4a2e,
    eyes: 0x2f9e5e,
    hairStyle: 'spiky',
    face: { marks: [{ kind: 'stripes', color: 0x2f6e3c }] },
    body: 'male',
    hairModel: 'hairParted',
    outfit: { set: 'ranger', parts: ['body', 'arms', 'bracer', 'belt', 'legs', 'feet', 'hood', 'pauldron'] },
  },
};
