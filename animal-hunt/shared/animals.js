// サバイバーの動物ごとの個性 (パーク相当)。
// 数値は倍率。1 が基準。

export const SURVIVOR_ANIMALS = {
  rabbit: {
    name: 'うさぎ',
    perk: 'ぴょんぴょん: 窓越えが速く、被弾後のダッシュが長い',
    color: '#f7f1ea',
    accent: '#f4a6b8',
    vault: 0.72,
    haste: 1.35,
  },
  cat: {
    name: 'ねこ',
    perk: 'しのび足: 足あとが半分しか残らず、しのび足が速い',
    color: '#f2b36b',
    accent: '#c97a3a',
    prints: 0.5,
    sneak: 1.3,
  },
  tanuki: {
    name: 'たぬき',
    perk: 'ものづくり: オルゴール修理が 15% 速い',
    color: '#9c8263',
    accent: '#4b3b2c',
    repair: 1.15,
  },
  penguin: {
    name: 'ペンギン',
    perk: 'なかよし: 仲間の治療と救出が速い',
    color: '#3c4a63',
    accent: '#ffb347',
    heal: 1.4,
    unhook: 0.6,
  },
};

export const HUNTER_ANIMAL = {
  name: 'オオカミ',
  color: '#7d8597',
  accent: '#3d4250',
};

export const ANIMAL_IDS = Object.keys(SURVIVOR_ANIMALS);

export function perk(animal, key) {
  const a = SURVIVOR_ANIMALS[animal];
  return a && a[key] !== undefined ? a[key] : 1;
}
