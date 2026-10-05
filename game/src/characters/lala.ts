import type { ActionDef, CharacterDef, HitWindow } from '../combat/types';

/** A yo-yo throw: the hit sphere travels out along the aim and comes back. */
function throwHits(out: [number, number], back: [number, number], max: number, dmg: number, extra: Partial<HitWindow> = {}): HitWindow[] {
  return [
    { start: out[0], end: out[1], reach: [0.9, max], range: max, radius: 0.6, damage: dmg, knockback: 4, knockUp: 1.5, hitstun: 18, hitstop: 5, hand: 'R', guardDamage: 10, ...extra },
    // On the way back it tugs the target slightly toward Lala.
    { start: back[0], end: back[1], reach: [max, 0.9], range: max, radius: 0.55, damage: Math.round(dmg * 0.5), knockback: -4, knockUp: 1, hitstun: 16, hitstop: 3, hand: 'R', guardDamage: 6 },
  ];
}

const giant: HitWindow[] = [
  { start: 22, end: 28, reach: [1, 3.5], range: 3.5, radius: 1.5, damage: 25, knockback: 1, knockUp: 1, hitstun: 34, hitstop: 4, hand: 'R', guardDamage: 15 },
  { start: 28, end: 34, reach: [3.5, 6], range: 6, radius: 1.6, damage: 25, knockback: 1, knockUp: 1, hitstun: 34, hitstop: 4, hand: 'R', guardDamage: 15 },
  { start: 34, end: 40, reach: [6, 8.5], range: 8.5, radius: 1.7, damage: 25, knockback: 1, knockUp: 1, hitstun: 34, hitstop: 4, hand: 'R', guardDamage: 15 },
  { start: 40, end: 47, reach: [8.5, 8.5], range: 8.5, radius: 1.9, damage: 140, knockback: 19, knockUp: 11, hitstun: 40, hitstop: 16, heavy: true, hand: 'R', guardDamage: 100 },
];

const actions: Record<string, ActionDef> = {
  // Click: straight throw (out and back); x2 then "around the world".
  yoyoShot: {
    id: 'yoyoShot',
    kind: 'attack',
    anim: 'yoyoShot',
    total: 30,
    hits: throwHits([7, 13], [13, 19], 4.3, 25),
    comboNext: 'yoyoShot2',
    comboFrom: 18,
    moveScale: 0.6,
    upperBody: true,
  },
  yoyoShot2: {
    id: 'yoyoShot2',
    kind: 'attack',
    anim: 'yoyoShot2',
    total: 30,
    hits: throwHits([7, 13], [13, 19], 4.3, 28),
    comboNext: 'aroundWorld',
    comboFrom: 18,
    moveScale: 0.6,
    upperBody: true,
  },
  aroundWorld: {
    id: 'aroundWorld',
    kind: 'attack',
    anim: 'aroundWorld',
    total: 36,
    hits: [{ start: 9, end: 20, area: true, range: 0, radius: 2.9, damage: 62, knockback: 10, knockUp: 6, hitstun: 26, hitstop: 9, heavy: true, hand: 'R', guardDamage: 30 }],
    moveScale: 0.2,
  },
  // Air click: throw (follows the aim, so it can go downward).
  airYoyo: {
    id: 'airYoyo',
    kind: 'attack',
    anim: 'airYoyo',
    total: 26,
    hits: throwHits([5, 11], [11, 17], 4.6, 36, { knockUp: -1 }),
    moveScale: 0.6,
  },
  // Air Space: loop the yo-yo overhead and ride the spin upward.
  loopUp: {
    id: 'loopUp',
    kind: 'attack',
    anim: 'loopUp',
    total: 34,
    hits: [{ start: 3, end: 16, area: true, range: 0, radius: 1.7, damage: 40, knockback: 5, knockUp: 10, hitstun: 24, hitstop: 5, hand: 'R', guardDamage: 15 }],
    motion: [{ start: 1, end: 16, forward: 6, up: 14, lift: 3 }],
    moveScale: 0.7,
  },
  // Click during a dash: "walk the dog" - the yo-yo races ahead along the floor and pops the target up.
  walkDog: {
    id: 'walkDog',
    kind: 'attack',
    anim: 'walkDog',
    total: 30,
    hits: [{ start: 4, end: 14, reach: [1, 6.5], range: 6.5, radius: 0.8, damage: 46, knockback: 4, knockUp: 10, hitstun: 26, hitstop: 7, hand: 'R', guardDamage: 20 }],
    motion: [{ start: 0, end: 8, forward: 12 }],
    moveScale: 0,
  },
  // E: long snare throw that reels the opponent in.
  snare: {
    id: 'snare',
    kind: 'skill',
    anim: 'snare',
    total: 36,
    hits: [{ start: 7, end: 15, reach: [1, 9], range: 9, radius: 0.75, damage: 40, knockback: -21, knockUp: 4, hitstun: 32, hitstop: 7, hand: 'R', guardDamage: 20 }],
    moveScale: 0.2,
  },
  // Q: giant yo-yo shoots out, grinds, then explodes at full length.
  giantYoyo: {
    id: 'giantYoyo',
    kind: 'ult',
    name: 'ジャイアント・ヨーヨー',
    anim: 'giantYoyo',
    total: 76,
    hits: giant,
    moveScale: 0,
    committed: true,
    armor: true,
    invuln: [0, 14],
  },
};

export const lala: CharacterDef = {
  id: 'lala',
  name: 'ララ',
  title: 'くるくるヨーヨーガール',
  weapon: 'yoyo',
  archetype: 'melee',
  element: { color: 0x19c9b8, color2: 0xff5fd2 },
  recovery: 'loopUp',
  dashAttack: 'walkDog',
  maxHp: 920,
  walkSpeed: 7.4,
  jumpSpeed: 12,
  preferredRange: [2.6, 4.4],
  skillCooldown: 220,
  actions,
  basic: 'yoyoShot',
  skill: 'snare',
  ult: 'giantYoyo',
  airBasic: 'airYoyo',
  look: {
    skin: 0xffdcc4,
    hair: 0x7a3cff,
    top: 0x19c9b8,
    topAccent: 0xff5fd2,
    pants: 0x2b2b55,
    shoes: 0xff5fd2,
    glove: 0xffffff,
    eyes: 0xff5fd2,
    hairStyle: 'spiky',
    body: 'female',
    hairModel: 'hairBuzzedF',
    outfit: { set: 'peasant', parts: ['body', 'arms', 'legs', 'feet'] },
    accessories: [{ kind: 'twinTails', color: 0xff5fd2 }],
  },
};
