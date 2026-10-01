// サバイバーごとの個性 (DbD のパーク相当)。数値は倍率で、1 が基準。
// model は public/assets/models/ の glb 名。

export const SURVIVOR_CHARACTERS = {
  knight: {
    name: 'ナイト',
    perk: '修理工: 発電機の修理が 15% 速い',
    model: 'survivor_knight',
    color: '#9aa7b8',
    repair: 1.15,
  },
  barbarian: {
    name: 'バーバリアン',
    perk: '全力疾走: 窓枠越えが速く、被弾後のダッシュが長い',
    model: 'survivor_barbarian',
    color: '#b5835a',
    vault: 0.72,
    haste: 1.35,
  },
  mage: {
    name: 'メイジ',
    perk: '癒し手: 仲間の治療とフック救出が速い',
    model: 'survivor_mage',
    color: '#7d6bb3',
    heal: 1.4,
    unhook: 0.6,
  },
  rogue: {
    name: 'ローグ',
    perk: '身軽: 足跡が半分しか残らず、しゃがみ移動が速い',
    model: 'survivor_rogue',
    color: '#3f8f5a',
    prints: 0.5,
    sneak: 1.3,
  },
};

export const KILLER_CHARACTER = {
  name: 'スケルトン',
  model: 'killer_skeleton',
  color: '#c9c2b0',
};

export const CHARACTER_IDS = Object.keys(SURVIVOR_CHARACTERS);

export function perk(character, key) {
  const a = SURVIVOR_CHARACTERS[character];
  return a && a[key] !== undefined ? a[key] : 1;
}
