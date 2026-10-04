import type { ActionDef, CharacterDef, Spawn } from '../combat/types';

const shot = (hand: 'L' | 'R'): Spawn => ({
  frame: 1,
  hand,
  speed: 62,
  radius: 0.28,
  life: 42,
  damage: 26,
  knockback: 4,
  knockUp: 0.8,
  hitstun: 12,
  hitstop: 2,
  guardDamage: 6,
});

const storm: Spawn[] = [];
for (let f = 10, i = 0; f <= 80; f += 3, i++) {
  storm.push({
    frame: f,
    hand: i % 2 === 0 ? 'L' : 'R',
    speed: 66,
    radius: 0.32,
    life: 40,
    spread: 0.09,
    damage: 13,
    knockback: 1.6,
    knockUp: 0.6,
    hitstun: 14,
    hitstop: 1,
    guardDamage: 4,
  });
}
storm.push({
  frame: 94,
  hand: 'R',
  speed: 48,
  radius: 0.9,
  life: 60,
  size: 3,
  damage: 150,
  knockback: 19,
  knockUp: 12,
  hitstun: 40,
  hitstop: 14,
  heavy: true,
  guardDamage: 100,
});

const actions: Record<string, ActionDef> = {
  // Click: "DO-DON!" right then left, then a short pause (holding repeats with the gap).
  burst: {
    id: 'burst',
    kind: 'attack',
    anim: 'burst',
    total: 30,
    spawns: [
      { ...shot('R'), frame: 2 },
      { ...shot('L'), frame: 7 },
    ],
    usesAmmo: true,
    upperBody: true,
    moveScale: 0.8,
  },
  backflipShot: {
    id: 'backflipShot',
    kind: 'skill',
    anim: 'backflipShot',
    total: 44,
    motion: [{ start: 0, end: 12, forward: -13, up: 7.5 }],
    spawns: [
      { ...shot('L'), frame: 11, speed: 72, damage: 55, knockback: 9, knockUp: 5, hitstun: 22, hitstop: 7, heavy: true, size: 1.6, radius: 0.4, guardDamage: 25 },
      { ...shot('R'), frame: 14, speed: 72, damage: 55, knockback: 9, knockUp: 5, hitstun: 22, hitstop: 7, heavy: true, size: 1.6, radius: 0.4, guardDamage: 25 },
    ],
    invuln: [0, 10],
    moveScale: 0,
  },
  // Click during a dash: slide in low while firing both blasters.
  slideShot: {
    id: 'slideShot',
    kind: 'attack',
    anim: 'slideShot',
    total: 32,
    motion: [{ start: 0, end: 16, forward: 13 }],
    spawns: [
      { ...shot('L'), frame: 6, damage: 32, knockback: 5 },
      { ...shot('R'), frame: 10, damage: 32, knockback: 5 },
    ],
    moveScale: 0,
  },
  starStorm: {
    id: 'starStorm',
    kind: 'ult',
    anim: 'starStorm',
    total: 112,
    spawns: storm,
    moveScale: 0.15,
    committed: true,
    armor: true,
    invuln: [0, 10],
  },
};

export const star: CharacterDef = {
  id: 'star',
  name: 'スター',
  title: '電光のガンスリンガー',
  weapon: 'guns',
  archetype: 'ranged',
  element: { color: 0xffd22e, color2: 0x4fd8ff },
  autoFire: true,
  dashAttack: 'slideShot',
  recoil: 5.5,
  maxHp: 1000,
  walkSpeed: 7.2,
  jumpSpeed: 11.5,
  preferredRange: [7, 13],
  ammo: 12,
  reloadFrames: 70,
  skillCooldown: 300,
  actions,
  basic: 'burst',
  skill: 'backflipShot',
  ult: 'starStorm',
  airBasic: 'burst',
  look: {
    skin: 0xf7cfae,
    hair: 0xffcf4a,
    top: 0x2f6fe0,
    topAccent: 0xffffff,
    pants: 0x26335e,
    shoes: 0xf2a516,
    glove: 0x2b2b3d,
    eyes: 0x2a7fe0,
    hairStyle: 'spiky',
    body: 'male',
    hairModel: 'hairBuzzed',
  },
};
