import type { Action, BuildingKind, BuildingRole, ResKind, UpgradeKey } from './types';

export const TILE = 64;
export const MAP_W = 46;
export const MAP_H = 34;
export const DT = 0.1; // シミュレーションの固定刻み(秒)

export const SEASON_LEN = 300; // 1季節 = 5分
export const DAY_LEN = 120; // 1日 = 2分
export const NIGHT_START = 0.78; // 1日のこの割合以降が夜
export const SEASONS = ['春', '夏', '秋', '冬'] as const;
export const YEAR_LEN = SEASON_LEN * 4;

export interface BuildingDef {
  name: string; // 見た目の呼び名(AIには「見た目」として伝える)
  w: number; // 足元のタイル幅
  h: number; // 足元のタイル奥行き
  cost: Partial<Record<ResKind, number>>;
  work: number; // 必要な作業量(作業秒)
  hp: number;
  capacity: number; // 住居として使ったときに住める人数
  points: number;
}

/** 建物の見た目ごとの大きさと材料。何に使うか・何と呼ぶかはAIが決める */
export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  house: { name: '小さな家', w: 2, h: 1, cost: { wood: 15 }, work: 18, hp: 60, capacity: 3, points: 10 },
  tower: { name: '石の塔', w: 2, h: 1, cost: { wood: 20, gold: 8 }, work: 30, hp: 120, capacity: 1, points: 20 },
  barracks: { name: '石造りの館', w: 3, h: 2, cost: { wood: 30, gold: 15 }, work: 40, hp: 150, capacity: 5, points: 25 },
  archery: { name: '的場のある小屋', w: 3, h: 2, cost: { wood: 30, gold: 12 }, work: 40, hp: 140, capacity: 3, points: 25 },
  monastery: { name: '鐘のある聖堂', w: 3, h: 2, cost: { wood: 40, gold: 30 }, work: 55, hp: 160, capacity: 3, points: 35 },
  castle: { name: '大きな城', w: 5, h: 2, cost: { wood: 150, gold: 110 }, work: 150, hp: 400, capacity: 10, points: 120 },
};
export const BUILDING_ORDER: BuildingKind[] = ['house', 'tower', 'barracks', 'archery', 'monastery', 'castle'];

export const ROLE_INFO: Record<BuildingRole, { name: string; desc: string }> = {
  home: { name: '住まい', desc: '人が暮らす。住める人数が増える' },
  storage: { name: '倉', desc: '集めたものを運び込む場所になる' },
  watch: { name: '見張り', desc: '塔や城なら、近づく盗賊に矢を放つ' },
  gathering: { name: '集いの場', desc: '人が集まり、祭りや話し合いが開かれる' },
  worship: { name: '祈りの場', desc: '祈りをささげ、心が安らぐ場所' },
  training: { name: '鍛錬の場', desc: '守り手が強くなる' },
  workshop: { name: '仕事場', desc: '村全体の作業が少し速くなる' },
};

export const ACTION_INFO: Record<Action, string> = {
  chop: '木を切る',
  hunt: '羊を獲る(肉になる)',
  mine: '金を掘る',
  build: '計画中・建設中の建物を建てる(targetに建物名)',
  repair: '壊れた建物を直す',
  talk: '誰かと話す(targetに相手の名前、話したいことを書く)',
  rest: '家で休む',
  wander: 'ぶらぶら歩く',
  explore: '島のはずれを探検する',
  guard: '村を見張る',
  gather: '集いの場や広場に集まる(祭り・集会)',
  pray: '祈りの場で祈る',
  play: '遊ぶ(子ども向け)',
};

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

/** AIがまだ性格を書いていないときの仮の性格 */
export const SEED_PERSONALITIES = [
  '働き者で、口数は少ないが頼りになる',
  'のんびり屋で、昼寝と空を眺めるのが好き',
  '陽気で、誰とでもすぐ仲良くなる',
  '人見知りだが、動物にはやさしい',
  '信心深く、毎朝海に向かって祈る',
  '勇敢で、困っている人を放っておけない',
  '食いしん坊で、料理の話になると止まらない',
  '夢見がちで、海の向こうの国に憧れている',
];

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
