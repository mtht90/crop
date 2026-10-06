import type { ActionDef, CharacterDef, Spawn } from '../combat/types';

/**
 * Rifle round: very fast and long. Holding the button scopes in and loads a
 * stronger shot; against a target carrying Rei's marker it curves in.
 */
const round = (frame: number, extra: Partial<Spawn> = {}): Spawn => ({
  frame,
  hand: 'R',
  speed: 120,
  radius: 0.17,
  life: 28,
  visual: 'bullet',
  damage: 44,
  knockback: 6,
  knockUp: 1,
  hitstun: 16,
  hitstop: 4,
  guardDamage: 10,
  seekMarked: 7,
  ...extra,
});

const actions: Record<string, ActionDef> = {
  // Click: shoot. Hold to scope in (zoom + visible laser) for up to ~2.5x damage.
  snipe: {
    id: 'snipe',
    kind: 'attack',
    anim: 'snipe',
    total: 28,
    spawns: [round(5)],
    charge: { at: 4, max: 60, damage: 2.3, knockback: 2.4, speed: 1.3, guard: 3 },
    usesAmmo: true,
    upperBody: true,
    moveScale: 0.35,
  },
  // E: marker dart. While the marker sticks (5 s), Rei's rounds home in.
  markDart: {
    id: 'markDart',
    kind: 'skill',
    anim: 'markDart',
    total: 26,
    spawns: [round(6, { speed: 75, radius: 0.45, life: 34, damage: 8, knockback: 0.5, hitstun: 10, hitstop: 2, guardDamage: 4, mark: 300, seekMarked: undefined, homing: 3, size: 1.2 })],
    upperBody: true,
    moveScale: 0.6,
  },
  // Air Space: kick off with a burst from the boot thrusters (edge recovery).
  thrusterJump: {
    id: 'thrusterJump',
    kind: 'attack',
    anim: 'thrusterJump',
    total: 26,
    motion: [{ start: 1, end: 12, forward: 7, up: 15, lift: 4 }],
    moveScale: 0.8,
  },
  // Click during a dash: rifle-butt strike.
  buttStrike: {
    id: 'buttStrike',
    kind: 'attack',
    anim: 'buttStrike',
    total: 30,
    hits: [{ start: 4, end: 11, damage: 46, knockback: 12, knockUp: 4, hitstun: 24, hitstop: 8, range: 1.3, radius: 1.0, hand: 'R', heavy: true, guardDamage: 22 }],
    motion: [{ start: 0, end: 11, forward: 16, magnet: true }],
    moveScale: 0,
  },
  // Q: "Dead Eye" - three heavy rounds that steer into the target.
  deadEye: {
    id: 'deadEye',
    kind: 'ult',
    name: 'デッドアイ',
    anim: 'deadEye',
    total: 96,
    spawns: [30, 50, 70].map((f, i) => round(f, { homing: 9, speed: 95, life: 50, damage: i === 2 ? 95 : 55, knockback: i === 2 ? 19 : 6, knockUp: i === 2 ? 11 : 2, hitstun: 40, hitstop: i === 2 ? 15 : 8, heavy: i === 2, guardDamage: 40, size: 1.6 })),
    committed: true,
    armor: true,
    invuln: [0, 16],
    moveScale: 0,
  },
};

export const rei: CharacterDef = {
  id: 'rei',
  name: 'レイ',
  title: '静寂のスナイパー',
  weapon: 'rifle',
  archetype: 'ranged',
  element: { color: 0x3fd0c8, color2: 0xff4a5a },
  dashAttack: 'buttStrike',
  recovery: 'thrusterJump',
  maxHp: 960,
  walkSpeed: 7.2,
  jumpSpeed: 12,
  preferredRange: [9, 16],
  skillCooldown: 360,
  ammo: 6,
  reloadFrames: 80,
  actions,
  basic: 'snipe',
  skill: 'markDart',
  ult: 'deadEye',
  airBasic: 'snipe',
  look: {
    skin: 0xe8c0a0,
    hair: 0x2b2b33,
    top: 0x45563a,
    topAccent: 0x3fd0c8,
    pants: 0x33402c,
    shoes: 0x22261e,
    glove: 0x22261e,
    eyes: 0x3fd0c8,
    hairStyle: 'spiky',
    face: { liner: true, lips: 0xb0505a, marks: [{ kind: 'plaster', color: 0x2b2b33, side: -1 }] },
    body: 'female',
    hairModel: 'hairBuzzedF',
    outfit: { set: 'ranger', parts: ['body', 'arms', 'bracer', 'belt', 'legs', 'feet'] },
    accessories: [{ kind: 'beret', color: 0x2f3b2a }],
  },
};
