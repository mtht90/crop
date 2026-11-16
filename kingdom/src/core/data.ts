// ゲームの定義データ。数値バランスはすべてここに集約する。
export type Res = 'gold' | 'wood' | 'meat';
export type Cost = Partial<Record<Res, number>>;

export const RES_NAME: Record<Res, string> = { gold: '金貨', wood: '木材', meat: '肉' };

// ---------------------------------------------------------------- 作業員
export type JobId = 'miner' | 'lumberjack' | 'hunter' | 'builder';
export interface JobDef {
  id: JobId;
  name: string;
  desc: string;
  avatar: number; // Human Avatars index
  base: Cost;
  growth: number;
  produces?: Res;
  rate: number; // 1人あたり/秒
  unlock: (s: UnlockCtx) => boolean;
}
export interface UnlockCtx {
  totalGold: number;
  jobs: Record<JobId, number>;
  buildings: Record<BuildingId, number>;
}

export const JOBS: JobDef[] = [
  { id: 'miner', name: '鉱夫', desc: 'つるはしで金鉱石を掘り、金貨を運んでくる。', avatar: 4,
    base: { gold: 12 }, growth: 1.14, produces: 'gold', rate: 0.5, unlock: () => true },
  { id: 'lumberjack', name: '木こり', desc: '森で木を伐り、木材を運ぶ。建設に欠かせない。', avatar: 5,
    base: { gold: 40 }, growth: 1.14, produces: 'wood', rate: 0.35, unlock: (s) => s.totalGold >= 25 },
  { id: 'hunter', name: '羊飼い', desc: '羊の世話をして肉を得る。兵士の食糧になる。', avatar: 9,
    base: { gold: 300, wood: 40 }, growth: 1.15, produces: 'meat', rate: 0.25, unlock: (s) => s.buildings.house >= 1 },
  { id: 'builder', name: '大工', desc: '建設を早め、町を修繕して全生産を高める（1人ごとに建設速度+30%、全生産+2%）。', avatar: 10,
    base: { gold: 600, wood: 150 }, growth: 1.18, rate: 0, unlock: (s) => s.buildings.house >= 2 },
];

// ---------------------------------------------------------------- 建物
export type BuildingId = 'house' | 'tower' | 'barracks' | 'archery' | 'monastery' | 'castle';
export interface BuildingDef {
  id: BuildingId;
  name: string;
  desc: string;
  sprite: string; // file stem under buildings/<color>/
  base: Cost;
  growth: number;
  max: number;
  time: number; // 秒（大工0人時）
  unlock: (s: UnlockCtx) => boolean;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'house', name: '家', desc: '住める人数が 4 人増える。', sprite: 'house1',
    base: { gold: 60, wood: 25 }, growth: 1.32, max: 12, time: 6, unlock: (s) => s.totalGold >= 40 },
  { id: 'tower', name: '見張り塔', desc: '王国の守り。軍事力 +15%、全生産 +3%。', sprite: 'tower',
    base: { gold: 2500, wood: 900 }, growth: 1.9, max: 4, time: 20, unlock: (s) => s.buildings.house >= 3 },
  { id: 'barracks', name: '兵舎', desc: '剣士と槍兵を訓練できるようになる。', sprite: 'barracks',
    base: { gold: 4000, wood: 1500, meat: 200 }, growth: 1, max: 1, time: 30, unlock: (s) => s.buildings.house >= 4 },
  { id: 'archery', name: '弓術場', desc: '弓兵を訓練できるようになる。', sprite: 'archery',
    base: { gold: 1.5e4, wood: 5000, meat: 1000 }, growth: 1, max: 1, time: 45, unlock: (s) => s.buildings.barracks >= 1 },
  { id: 'monastery', name: '修道院', desc: '僧侶を迎えられる。祈りで全生産 +10%。', sprite: 'monastery',
    base: { gold: 6e5, wood: 2e5, meat: 5e4 }, growth: 1, max: 1, time: 60, unlock: (s) => s.buildings.archery >= 1 },
  { id: 'castle', name: '城の増築', desc: '城を一段階大きくする。全生産 ×1.5、住める人数 +6。', sprite: 'castle',
    base: { gold: 2e4, wood: 8000 }, growth: 18, max: 5, time: 40, unlock: (s) => s.buildings.house >= 5 },
];

// ---------------------------------------------------------------- 兵
export type UnitId = 'warrior' | 'lancer' | 'archer' | 'monk';
export interface UnitDef {
  id: UnitId;
  name: string;
  desc: string;
  avatar: number;
  base: Cost;
  growth: number;
  power: number;
  requires: BuildingId;
}
export const UNITS: UnitDef[] = [
  { id: 'warrior', name: '剣士', desc: '剣と盾で戦う王国の主力。', avatar: 1,
    base: { gold: 300, meat: 60 }, growth: 1.11, power: 5, requires: 'barracks' },
  { id: 'lancer', name: '槍兵', desc: '長槍で戦列を支える。', avatar: 3,
    base: { gold: 2000, wood: 300, meat: 300 }, growth: 1.12, power: 22, requires: 'barracks' },
  { id: 'archer', name: '弓兵', desc: '遠くから敵を射抜く。', avatar: 2,
    base: { gold: 2.5e4, wood: 5000, meat: 2500 }, growth: 1.13, power: 120, requires: 'archery' },
  { id: 'monk', name: '僧侶', desc: '軍を癒やし士気を高める。1人ごとに軍事力 +6%、戦の損害を減らす。', avatar: 7,
    base: { gold: 4e5, meat: 4e4 }, growth: 1.25, power: 0, requires: 'monastery' },
];

// ---------------------------------------------------------------- 研究
export type Effect =
  | { kind: 'job'; job: JobId; mult: number }
  | { kind: 'click'; mult: number }
  | { kind: 'clickPct'; pct: number }
  | { kind: 'global'; mult: number }
  | { kind: 'res'; res: Res; mult: number }
  | { kind: 'army'; mult: number }
  | { kind: 'build'; mult: number }
  | { kind: 'synergy'; job: JobId; per: JobId; pct: number }
  | { kind: 'pop'; add: number };

export interface ResearchDef {
  id: string;
  name: string;
  desc: string;
  icon: string; // ui icon / tool sprite path
  cost: Cost;
  effects: Effect[];
  unlock: (s: UnlockCtx & { research: Set<string> }) => boolean;
}

const TOOL_TIERS = ['銅', '鉄', '鋼', 'ミスリル', '黄金', 'アダマン', '星鉄', '神鉄'];

function toolLine(job: JobId, tool: string, icon: string, baseCost: number, startCount: number): ResearchDef[] {
  return TOOL_TIERS.map((t, i) => {
    const need = [startCount, 5, 15, 30, 50, 80, 120, 175][i];
    const cost: Cost = { gold: baseCost * Math.pow(12, i) };
    if (i >= 1) cost.wood = baseCost * 0.3 * Math.pow(12, i);
    return {
      id: `${job}_tool_${i}`,
      name: `${t}の${tool}`,
      desc: `${JOBS.find((j) => j.id === job)!.name}の生産 ×2`,
      icon,
      cost,
      effects: [{ kind: 'job', job, mult: 2 }],
      unlock: (s) => s.jobs[job] >= need && (i === 0 || s.research.has(`${job}_tool_${i - 1}`)),
    } satisfies ResearchDef;
  });
}

export const RESEARCH: ResearchDef[] = [
  ...toolLine('miner', 'つるはし', 'res/tool4', 100, 1),
  ...toolLine('lumberjack', '斧', 'res/tool2', 400, 1),
  ...toolLine('hunter', 'ナイフ', 'res/tool3', 3000, 1),
  // クリック
  { id: 'click_1', name: '腕っぷし', desc: 'クリック ×2', icon: 'icons/icon_01', cost: { gold: 50 }, effects: [{ kind: 'click', mult: 2 }],
    unlock: (s) => s.totalGold >= 20 },
  { id: 'click_2', name: '鉱脈の目利き', desc: 'クリック ×2、さらに毎秒の金貨の 1% を上乗せ', icon: 'icons/icon_01', cost: { gold: 2000 },
    effects: [{ kind: 'click', mult: 2 }, { kind: 'clickPct', pct: 0.01 }], unlock: (s) => s.research.has('click_1') && s.totalGold >= 800 },
  { id: 'click_3', name: '岩割りの技', desc: 'クリック ×3、毎秒の金貨の +2%', icon: 'icons/icon_01', cost: { gold: 1e5 },
    effects: [{ kind: 'click', mult: 3 }, { kind: 'clickPct', pct: 0.02 }], unlock: (s) => s.research.has('click_2') && s.totalGold >= 3e4 },
  { id: 'click_4', name: '黄金の拳', desc: 'クリック ×3、毎秒の金貨の +3%', icon: 'icons/icon_01', cost: { gold: 1e7 },
    effects: [{ kind: 'click', mult: 3 }, { kind: 'clickPct', pct: 0.03 }], unlock: (s) => s.research.has('click_3') && s.totalGold >= 3e6 },
  { id: 'click_5', name: '山をも砕く', desc: 'クリック ×5、毎秒の金貨の +4%', icon: 'icons/icon_01', cost: { gold: 1e10 },
    effects: [{ kind: 'click', mult: 5 }, { kind: 'clickPct', pct: 0.04 }], unlock: (s) => s.research.has('click_4') && s.totalGold >= 3e9 },
  // 相乗効果
  { id: 'syn_1', name: '木の柄のつるはし', desc: '木こり1人ごとに鉱夫の生産 +2%', icon: 'res/tool2', cost: { gold: 1500, wood: 500 },
    effects: [{ kind: 'synergy', job: 'miner', per: 'lumberjack', pct: 0.02 }], unlock: (s) => s.jobs.lumberjack >= 10 },
  { id: 'syn_2', name: '腹ごしらえ', desc: '羊飼い1人ごとに鉱夫と木こりの生産 +2%', icon: 'icons/icon_04', cost: { gold: 4e4, meat: 2000 },
    effects: [{ kind: 'synergy', job: 'miner', per: 'hunter', pct: 0.02 }, { kind: 'synergy', job: 'lumberjack', per: 'hunter', pct: 0.02 }],
    unlock: (s) => s.jobs.hunter >= 10 },
  { id: 'syn_3', name: '親方の号令', desc: '大工1人ごとに全作業員の生産 +3%', icon: 'icons/icon_01', cost: { gold: 5e5, wood: 1e5 },
    effects: [{ kind: 'synergy', job: 'miner', per: 'builder', pct: 0.03 }, { kind: 'synergy', job: 'lumberjack', per: 'builder', pct: 0.03 },
      { kind: 'synergy', job: 'hunter', per: 'builder', pct: 0.03 }], unlock: (s) => s.jobs.builder >= 10 },
  // 経済
  { id: 'eco_1', name: '市場の開設', desc: '金貨 +25%', icon: 'icons/icon_03', cost: { gold: 8000, wood: 2000 }, effects: [{ kind: 'res', res: 'gold', mult: 1.25 }],
    unlock: (s) => s.buildings.house >= 4 },
  { id: 'eco_2', name: '交易路', desc: '金貨 +50%', icon: 'icons/icon_03', cost: { gold: 4e5, wood: 8e4 }, effects: [{ kind: 'res', res: 'gold', mult: 1.5 }],
    unlock: (s) => s.research.has('eco_1') && s.buildings.castle >= 1 },
  { id: 'eco_3', name: '王立銀行', desc: '金貨 ×2', icon: 'icons/icon_03', cost: { gold: 5e7, wood: 1e7 }, effects: [{ kind: 'res', res: 'gold', mult: 2 }],
    unlock: (s) => s.research.has('eco_2') && s.buildings.castle >= 2 },
  { id: 'eco_4', name: '黄金律', desc: '全生産 ×2', icon: 'icons/icon_03', cost: { gold: 5e10, wood: 1e10, meat: 1e9 }, effects: [{ kind: 'global', mult: 2 }],
    unlock: (s) => s.research.has('eco_3') && s.buildings.castle >= 4 },
  { id: 'wood_1', name: '製材所', desc: '木材 +50%', icon: 'icons/icon_02', cost: { gold: 2e4, wood: 6000 }, effects: [{ kind: 'res', res: 'wood', mult: 1.5 }],
    unlock: (s) => s.jobs.lumberjack >= 20 },
  { id: 'meat_1', name: '燻製小屋', desc: '肉 +50%', icon: 'icons/icon_04', cost: { gold: 6e4, wood: 1e4 }, effects: [{ kind: 'res', res: 'meat', mult: 1.5 }],
    unlock: (s) => s.jobs.hunter >= 15 },
  { id: 'build_1', name: '足場の工夫', desc: '建設速度 ×2', icon: 'res/tool1', cost: { gold: 3000, wood: 1500 }, effects: [{ kind: 'build', mult: 2 }],
    unlock: (s) => s.jobs.builder >= 1 },
  { id: 'build_2', name: '滑車と起重機', desc: '建設速度 ×3', icon: 'res/tool1', cost: { gold: 3e5, wood: 1e5 }, effects: [{ kind: 'build', mult: 3 }],
    unlock: (s) => s.research.has('build_1') && s.jobs.builder >= 8 },
  { id: 'pop_1', name: '二段ベッド', desc: '住める人数 +10', icon: 'icons/icon_06', cost: { gold: 5e4, wood: 2e4 }, effects: [{ kind: 'pop', add: 10 }],
    unlock: (s) => s.buildings.house >= 8 },
  { id: 'pop_2', name: '城下町', desc: '住める人数 +25', icon: 'icons/icon_06', cost: { gold: 2e7, wood: 5e6 }, effects: [{ kind: 'pop', add: 25 }],
    unlock: (s) => s.research.has('pop_1') && s.buildings.castle >= 2 },
  { id: 'pop_3', name: '王都', desc: '住める人数 +50', icon: 'icons/icon_06', cost: { gold: 2e10, wood: 5e9 }, effects: [{ kind: 'pop', add: 50 }],
    unlock: (s) => s.research.has('pop_2') && s.buildings.castle >= 4 },
  // 軍
  ...['鍛冶場', '鎖かたびら', '戦術書', '騎士道', '王家の紋章', '伝説の武具'].map((n, i) => ({
    id: `army_${i}`, name: n, desc: '軍事力 ×2', icon: 'icons/icon_05',
    cost: { gold: 2e4 * Math.pow(30, i), wood: 5e3 * Math.pow(30, i), meat: 4e3 * Math.pow(30, i) },
    effects: [{ kind: 'army', mult: 2 } as Effect],
    unlock: (s: UnlockCtx & { research: Set<string> }) => s.buildings.barracks >= 1 && (i === 0 || s.research.has(`army_${i - 1}`)),
  })),
];

// ---------------------------------------------------------------- 遠征
export interface RivalDef {
  id: string;
  color: 'red' | 'purple' | 'yellow' | 'black';
  name: string;
  ruler: number; // avatar
  bonusDesc: string;
  forts: string[];
}
export const RIVALS: RivalDef[] = [
  { id: 'red', color: 'red', name: '紅の公国', ruler: 6, bonusDesc: '金貨 ×2', forts: ['見張り小屋', '川辺の砦', '赤土の塔', '紅蓮の兵舎', '紅の城'] },
  { id: 'purple', color: 'purple', name: '紫霧の王国', ruler: 16, bonusDesc: '木材・肉 ×3', forts: ['霧の小屋', '紫水晶の塔', '修道士の庵', '霧隠れの兵舎', '紫霧の城'] },
  { id: 'yellow', color: 'yellow', name: '黄金の商業都市', ruler: 11, bonusDesc: 'クリック ×5', forts: ['関所', '黄金の塔', '弓兵の詰所', '商人ギルド', '黄金宮'] },
  { id: 'black', color: 'black', name: '黒鉄の帝国', ruler: 21, bonusDesc: '王位継承の王冠 ×2', forts: ['黒き前哨', '鉄の塔', '黒鉄の兵舎', '影の修道院', '黒鉄城'] },
];
export const FORT_POWER = (i: number) => 60 * Math.pow(2.7, i); // i = 0..19
export const FORT_STAGE_BONUS = 0.1; // 拠点1つごとに全生産 +10%

// ---------------------------------------------------------------- 王家の遺産（転生ボーナス）
export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  cost: number; // 王冠
  avatar: number;
}
export const PERKS: PerkDef[] = [
  { id: 'start_gold', name: '王家の金庫', desc: '新しい治世を金貨 5,000 枚で始める。', cost: 1, avatar: 15 },
  { id: 'start_miners', name: '忠実な民', desc: '新しい治世を鉱夫 5 人・木こり 3 人・家 2 軒で始める。', cost: 2, avatar: 5 },
  { id: 'auto_click', name: '王の手', desc: '毎秒 3 回、自動で金鉱石を叩く。', cost: 3, avatar: 1 },
  { id: 'fast_build', name: '名工の血筋', desc: '建設速度 ×3。', cost: 3, avatar: 10 },
  { id: 'offline', name: '留守を守る者', desc: '放置中の生産効率 50% → 100%、最大 24 時間。', cost: 5, avatar: 4 },
  { id: 'big_click', name: '王の威光', desc: 'クリック ×5。', cost: 5, avatar: 12 },
  { id: 'harvest', name: '豊穣の祝福', desc: '木材と肉 ×3。', cost: 8, avatar: 14 },
  { id: 'strategist', name: '名軍師', desc: '遠征の勝率 +20%、損害が半分。', cost: 10, avatar: 3 },
  { id: 'golden', name: '黄金の導き', desc: '黄金の輝きが 2 倍の頻度で現れ、報酬も 2 倍。', cost: 12, avatar: 13 },
  { id: 'dynasty', name: '王朝の礎', desc: '王冠 1 個ごとのボーナスが +10% → +15%。', cost: 25, avatar: 11 },
];

export const CROWN_BONUS = 0.1;
export const PRESTIGE_MIN_GOLD = 1e7;
export function crownsFor(reignGold: number): number {
  if (reignGold < PRESTIGE_MIN_GOLD) return 0;
  return Math.floor(Math.pow(reignGold / PRESTIGE_MIN_GOLD, 0.4) * 2);
}

// ---------------------------------------------------------------- 実績
export interface AchDef {
  id: string;
  name: string;
  desc: string;
  test: (s: AchCtx) => boolean;
  hidden?: boolean;
}
export interface AchCtx {
  clicks: number;
  crits: number;
  allGold: number;
  pawns: number;
  buildings: Record<BuildingId, number>;
  armyPower: number;
  forts: number;
  rivalsDone: number;
  prestiges: number;
  goldens: number;
  duck: number;
  gps: number;
}
const A = (id: string, name: string, desc: string, test: (s: AchCtx) => boolean, hidden = false): AchDef => ({ id, name, desc, test, hidden });
export const ACHIEVEMENTS: AchDef[] = [
  A('click_100', 'はじめの一振り', '金鉱石を 100 回叩く', (s) => s.clicks >= 100),
  A('click_1k', '鍛えられた腕', '金鉱石を 1,000 回叩く', (s) => s.clicks >= 1000),
  A('click_10k', '岩をも穿つ', '金鉱石を 10,000 回叩く', (s) => s.clicks >= 1e4),
  A('crit_50', '会心の一撃', '会心を 50 回出す', (s) => s.crits >= 50),
  A('gold_1k', '小金持ち', '累計で金貨 1,000 枚を得る', (s) => s.allGold >= 1e3),
  A('gold_1m', '豪商', '累計で金貨 100万枚を得る', (s) => s.allGold >= 1e6),
  A('gold_1b', '黄金郷', '累計で金貨 10億枚を得る', (s) => s.allGold >= 1e9),
  A('gold_1t', '富の化身', '累計で金貨 1兆枚を得る', (s) => s.allGold >= 1e12),
  A('gold_1q', '世界の富', '累計で金貨 1京枚を得る', (s) => s.allGold >= 1e16),
  A('gps_100', '回り始めた歯車', '毎秒 100 枚の金貨を得る', (s) => s.gps >= 100),
  A('gps_1m', '金の湧く国', '毎秒 100万枚の金貨を得る', (s) => s.gps >= 1e6),
  A('pawn_10', '村', '作業員を 10 人雇う', (s) => s.pawns >= 10),
  A('pawn_50', '町', '作業員を 50 人雇う', (s) => s.pawns >= 50),
  A('pawn_150', '都', '作業員を 150 人雇う', (s) => s.pawns >= 150),
  A('house_12', '満員御礼', '家を 12 軒建てる', (s) => s.buildings.house >= 12),
  A('tower_4', '四方の守り', '見張り塔を 4 基建てる', (s) => s.buildings.tower >= 4),
  A('castle_5', '天空の城', '城を最大まで増築する', (s) => s.buildings.castle >= 5),
  A('army_1k', '軍隊', '軍事力 1,000 に達する', (s) => s.armyPower >= 1e3),
  A('army_1m', '大軍勢', '軍事力 100万に達する', (s) => s.armyPower >= 1e6),
  A('fort_1', '初陣', '拠点を 1 つ攻略する', (s) => s.forts >= 1),
  A('rival_1', '征服者', '敵国を 1 つ完全に制圧する', (s) => s.rivalsDone >= 1),
  A('rival_4', '天下統一', 'すべての敵国を制圧する', (s) => s.rivalsDone >= 4),
  A('prestige_1', '王位継承', '初めて王位を継承する', (s) => s.prestiges >= 1),
  A('prestige_5', '五代目の王', '王位を 5 回継承する', (s) => s.prestiges >= 5),
  A('golden_1', '光るもの', '黄金の輝きを拾う', (s) => s.goldens >= 1),
  A('golden_25', '幸運の星', '黄金の輝きを 25 回拾う', (s) => s.goldens >= 25),
  A('duck', 'あひる', '海に浮かぶ何かを見つける', (s) => s.duck >= 1, true),
];
export const ACH_BONUS = 0.02;

// ---------------------------------------------------------------- 天候/イベント
export const GOLDEN_MIN = 90; // 秒
export const GOLDEN_MAX = 210;
export const GOLDEN_LIFETIME = 13;
export const FRENZY_DURATION = 30;
export const FRENZY_MULT = 7;
export const DUCK_CHANCE_PER_MIN = 0.04;
