import type { BuildingKind, ResKind, Trait, UpgradeKey } from './types';

export const TILE = 64;
export const MAP_W = 46;
export const MAP_H = 34;
export const DT = 0.1; // シミュレーションの固定刻み(秒)

export const SEASON_LEN = 300; // 1季節 = 5分
export const DAY_LEN = 120; // 1日 = 2分
export const NIGHT_START = 0.78; // 1日のこの割合以降が夜
export const SEASONS = ['春', '夏', '秋', '冬'] as const;
export const YEAR_LEN = SEASON_LEN * 4;

export const STAGE_NAMES = ['開拓', '村', '町', '王国'] as const;

export interface BuildingDef {
  name: string;
  w: number; // 足元のタイル幅
  h: number; // 足元のタイル奥行き
  cost: Partial<Record<ResKind, number>>;
  work: number; // 必要な作業量(作業秒)
  hp: number;
  stage: number; // 解放される段階
  capacity: number; // 住める人数
  points: number;
  limit: number; // 建てられる最大数
  desc: string;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  house: { name: '家', w: 2, h: 1, cost: { wood: 15 }, work: 18, hp: 60, stage: 0, capacity: 3, points: 10, limit: 14, desc: '村人が暮らす家' },
  tower: { name: '見張り塔', w: 2, h: 1, cost: { wood: 20, gold: 8 }, work: 30, hp: 120, stage: 1, capacity: 0, points: 20, limit: 3, desc: '近づく盗賊を矢で追い払う' },
  barracks: { name: '兵舎', w: 3, h: 2, cost: { wood: 30, gold: 15 }, work: 40, hp: 150, stage: 1, capacity: 0, points: 25, limit: 1, desc: '村を守る戦士が暮らす' },
  archery: { name: '弓術場', w: 3, h: 2, cost: { wood: 30, gold: 20 }, work: 40, hp: 140, stage: 2, capacity: 0, points: 25, limit: 1, desc: '弓兵が腕を磨く' },
  monastery: { name: '修道院', w: 3, h: 2, cost: { wood: 40, gold: 30 }, work: 55, hp: 160, stage: 2, capacity: 0, points: 35, limit: 1, desc: '僧侶が祈り、傷ついた者を癒す' },
  castle: { name: '城', w: 5, h: 2, cost: { wood: 150, gold: 110 }, work: 150, hp: 400, stage: 3, capacity: 8, points: 120, limit: 1, desc: '王国の象徴。完成すると旅立ちができる' },
};

export const BUILDING_ORDER: BuildingKind[] = ['house', 'tower', 'barracks', 'archery', 'monastery', 'castle'];

export const STAGE_REQ = [
  { pop: 0, desc: '' },
  { pop: 6, houses: 3, desc: '人口6人・家3軒' },
  { pop: 13, need: ['tower', 'barracks'] as BuildingKind[], desc: '人口13人・見張り塔と兵舎' },
  { pop: 22, need: ['archery', 'monastery'] as BuildingKind[], desc: '人口22人・弓術場と修道院' },
];

export interface UpgradeDef {
  name: string;
  icon: string;
  desc: string;
  base: number;
}
export const UPGRADES: Record<UpgradeKey, UpgradeDef> = {
  work: { name: '働き者', icon: 'hammer', desc: '作業の速さ +12%', base: 30 },
  walk: { name: '健脚', icon: 'boot', desc: '歩く速さ +10%', base: 25 },
  nature: { name: '豊かな大地', icon: 'leaf', desc: '木と羊と金の増え方 +15%', base: 40 },
  housing: { name: 'にぎわい', icon: 'house', desc: '家1軒に住める人数 +1', base: 80 },
  family: { name: '子宝', icon: 'heart', desc: '子どもが生まれやすくなる +20%', base: 50 },
  strength: { name: 'たくましさ', icon: 'shield', desc: '盗賊への強さ +15%', base: 50 },
};
export const UPGRADE_ORDER: UpgradeKey[] = ['work', 'walk', 'nature', 'housing', 'family', 'strength'];
export const upgradeCost = (key: UpgradeKey, lv: number) => Math.round(UPGRADES[key].base * Math.pow(1.6, lv));

export const TRAITS: Record<Trait, string> = {
  hard: '働き者',
  lazy: 'のんびり屋',
  cheer: '陽気',
  shy: '人見知り',
  pious: '信心深い',
  brave: '勇敢',
  glutton: '食いしん坊',
  dreamer: '夢見がち',
};

export const SKILL_NAMES: Record<ResKind | 'build', string> = {
  wood: '木こり',
  meat: '羊飼い',
  gold: '鉱夫',
  build: '大工',
};

export const ROLE_NAMES = {
  pawn: '村人',
  child: '子ども',
  warrior: '戦士',
  archer: '弓兵',
  monk: '僧侶',
} as const;

export const RES_NAMES: Record<ResKind, string> = { wood: '木', meat: '肉', gold: '金' };
