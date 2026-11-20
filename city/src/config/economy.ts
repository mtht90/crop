// ゲームの数値（初期値）。調整はこのファイルと products.ts / research.ts / events.ts / rivals.ts で行う。
import type { IndustryId } from './buildings';

/** 時間 */
export const TIME = {
  /** ゲーム内1日 = 現実の何秒か */
  realSecondsPerDay: 3600,
  /** 四半期の日数 */
  daysPerQuarter: 90,
  /** 留守中に進める上限（現実の時間） */
  offlineCapHours: 48,
  /** 自動保存の間隔（秒） */
  autosaveSeconds: 30,
  /** ゲーム開始時の時刻（ゲーム内の時。朝9時から始める） */
  startHour: 9,
  /** 留守中の計算でまとめて進める幅（ゲーム内の時間） */
  offlineStepHours: 1,
} as const;

/** 開始時の状態 */
export const START = {
  /** 創業融資（開始資金はすべて借金） */
  loanAmount: 50_000_000,
  loanAnnualRate: 0.05,
  /** 返済までの四半期数（4 = ゲーム内360日） */
  loanQuarters: 4,
  /** 本社を置く区画 */
  hqLot: { gx: 4, gz: 4 },
  /** 会社名・色（あとで変更可能） */
  companyName: 'わたしの商会',
  companyColor: '#ff8a3d',
} as const;

/** 区画 */
export const LAND = {
  /** 中心の地価（円）。端は edgeMultiplier 倍 */
  basePrice: 8_000_000,
  edgeMultiplier: 0.25,
  /** 街の成長で地価が上がる（1年で何倍になるか） */
  annualGrowth: 0.15,
  /** 買える範囲：中心からの距離（チェビシェフ距離、中心=4.5）。自社の店の数で広がる */
  buyableRadiusStart: 1.5,
  buyableRadiusPerStores: 3,
  buyableRadiusMax: 4.5,
  /** 区画を売るときの割合 */
  sellRatio: 0.8,
} as const;

/** 街の人の流れ */
export const CITY_DEMAND = {
  /** 人通り 1.0 の区画を1時間に通る人数（ピーク時） */
  peoplePerTrafficHour: 700,
  /** 店が客を集める範囲（区画）と距離による重み */
  catchmentRadius: 2,
  catchmentFalloff: 0.45,
  /** 同じ業種の店どうしが客を取り合う範囲 */
  competitionRadius: 3,
  /** 1年で人口が何倍に増えるか */
  annualPopulationGrowth: 0.8,
  /** 店のレベルが1上がるごとに、集客できる範囲の人が増える割合 */
  levelReach: 0.6,
} as const;

/** 1日の時間帯ごとの人出（0〜23時）。業種ごと */
export const HOUR_CURVES: Record<'food' | 'retail', number[]> = {
  // 朝・昼・夕方に山
  food: [0.05, 0.03, 0.02, 0.02, 0.03, 0.08, 0.25, 0.55, 0.75, 0.6, 0.55, 0.8, 1.0, 0.85, 0.55, 0.6, 0.7, 0.8, 0.9, 0.8, 0.55, 0.35, 0.2, 0.1],
  retail: [0.1, 0.06, 0.05, 0.05, 0.06, 0.1, 0.2, 0.4, 0.55, 0.6, 0.7, 0.8, 0.85, 0.8, 0.75, 0.8, 0.9, 1.0, 1.0, 0.9, 0.7, 0.5, 0.3, 0.15],
};

/** 業種ごとの基本値 */
export interface IndustryConfig {
  name: string;
  shortName: string;
  /** 解禁条件 */
  unlock: { storesOf?: IndustryId; storesCount?: number; cumulativeSales?: number; factories?: number };
  /** 店の種類か（客が来る）、施設か */
  kind: 'store' | 'facility';
  /** レベルごとの建設費・建設時間（現実の分）・維持費（ゲーム内1時間あたり） */
  levels: { cost: number; buildMinutes: number; upkeepPerHour: number; capacityMul: number; appeal: number }[];
  /** 人通りのうち、この業種の店に来る割合 */
  demandPerPerson?: number;
  /** 店に来ない人の取り分（大きいほど、店が少ないうちは客が来にくい） */
  outsideOption?: number;
  /** 従業員1人が1時間にさばける客の数 */
  customersPerStaffHour?: number;
  /** 時給（円） */
  wagePerHour: number;
  /** 従業員の上限（レベルごと） */
  maxStaff: number[];
  /** 研修1段階の費用（1人あたり） */
  trainingCostPerStaff: number;
}

export const INDUSTRIES: Record<IndustryId, IndustryConfig> = {
  food: {
    name: '飲食（カフェ）',
    shortName: '飲食',
    unlock: {},
    kind: 'store',
    levels: [
      { cost: 8_000_000, buildMinutes: 5, upkeepPerHour: 1_500, capacityMul: 1, appeal: 1 },
      { cost: 30_000_000, buildMinutes: 20, upkeepPerHour: 4_000, capacityMul: 2.5, appeal: 1.5 },
      { cost: 120_000_000, buildMinutes: 60, upkeepPerHour: 10_000, capacityMul: 6, appeal: 2.2 },
    ],
    demandPerPerson: 0.12,
    outsideOption: 0.6,
    customersPerStaffHour: 12,
    wagePerHour: 1_200,
    maxStaff: [6, 14, 30],
    trainingCostPerStaff: 60_000,
  },
  retail: {
    name: '小売（コンビニ）',
    shortName: '小売',
    unlock: { storesOf: 'food', storesCount: 3, cumulativeSales: 50_000_000 },
    kind: 'store',
    levels: [
      { cost: 25_000_000, buildMinutes: 10, upkeepPerHour: 4_000, capacityMul: 1, appeal: 1 },
      { cost: 90_000_000, buildMinutes: 40, upkeepPerHour: 10_000, capacityMul: 2.5, appeal: 1.5 },
      { cost: 350_000_000, buildMinutes: 120, upkeepPerHour: 25_000, capacityMul: 6, appeal: 2.2 },
    ],
    demandPerPerson: 0.16,
    outsideOption: 0.6,
    customersPerStaffHour: 18,
    wagePerHour: 1_150,
    maxStaff: [8, 18, 40],
    trainingCostPerStaff: 50_000,
  },
  factory: {
    name: '製造（工場）',
    shortName: '製造',
    unlock: { storesOf: 'retail', storesCount: 3, cumulativeSales: 500_000_000 },
    kind: 'facility',
    levels: [
      { cost: 300_000_000, buildMinutes: 60, upkeepPerHour: 30_000, capacityMul: 1, appeal: 1 },
      { cost: 900_000_000, buildMinutes: 180, upkeepPerHour: 70_000, capacityMul: 2.5, appeal: 1 },
      { cost: 2_500_000_000, buildMinutes: 360, upkeepPerHour: 150_000, capacityMul: 6, appeal: 1 },
    ],
    wagePerHour: 1_400,
    maxStaff: [40, 100, 240],
    trainingCostPerStaff: 80_000,
  },
  logistics: {
    name: '物流（物流センター）',
    shortName: '物流',
    unlock: { factories: 1, cumulativeSales: 3_000_000_000 },
    kind: 'facility',
    levels: [
      { cost: 1_200_000_000, buildMinutes: 120, upkeepPerHour: 60_000, capacityMul: 1, appeal: 1 },
      { cost: 3_500_000_000, buildMinutes: 300, upkeepPerHour: 140_000, capacityMul: 2.5, appeal: 1 },
    ],
    wagePerHour: 1_300,
    maxStaff: [60, 160],
    trainingCostPerStaff: 70_000,
  },
  it: {
    name: 'IT（オフィス）',
    shortName: 'IT',
    unlock: { cumulativeSales: 20_000_000_000 },
    kind: 'facility',
    levels: [
      { cost: 5_000_000_000, buildMinutes: 240, upkeepPerHour: 250_000, capacityMul: 1, appeal: 1 },
      { cost: 15_000_000_000, buildMinutes: 600, upkeepPerHour: 600_000, capacityMul: 2.5, appeal: 1 },
    ],
    wagePerHour: 3_000,
    maxStaff: [80, 200],
    trainingCostPerStaff: 200_000,
  },
};

/** 業種どうしのつながり */
export const LINKS = {
  /** 工場1レベルあたり、卸せる自社の店（飲食・小売）の数 */
  factoryStoresPerLevel: 6,
  /** 工場から仕入れた店の原価の下がり方 */
  factoryCostDiscount: 0.3,
  /** 工場の外販（他社への卸）の売上：1レベル・1時間あたり。品質で増える */
  factoryWholesalePerLevelHour: 1_200_000,
  factoryWholesaleMargin: 0.3,
  /** 物流センター1レベルあたり、受け持てる店・工場の数 */
  logisticsStoresPerLevel: 12,
  /** 物流が届いている店の維持費・人件費の下がり方 */
  logisticsOpexDiscount: 0.15,
  /** 物流が届いていない店の品切れ（自社の店がこの数を超えると起きる） */
  stockoutFreeStores: 6,
  stockoutLoss: 0.08,
  /** ITオフィス1レベルあたりの全事業の効率（売上）アップ。上限あり */
  itEfficiencyPerLevel: 0.03,
  itEfficiencyMax: 0.2,
  /** アプリ事業：ITオフィス1レベル・1時間あたりの基本売上（研究で増える） */
  appRevenuePerLevelHour: 6_000_000,
} as const;

/** 店の運営 */
export const STORE = {
  /** 広告：1日の予算（円）→ 知名度の伸び */
  adEffectPerYen: 1 / 3_000_000,
  adEffectMax: 0.12,
  /** 知名度の自然減（1日あたり、今の知名度に対する割合） */
  awarenessDecay: 0.04,
  /** 口コミ：満足度 0.5 を超えた分が知名度を伸ばす（1日あたり） */
  wordOfMouth: 0.05,
  /** 新店の知名度 */
  awarenessStart: 0.15,
  /** 満足度が目標値に近づく速さ（1日あたり） */
  satisfactionRate: 0.25,
  /** 価格の効き方（大きいほど価格に敏感） */
  priceElasticity: 1.6,
  /** 研修レベルの上限と、1段階ごとのさばける客の増え方 */
  maxTraining: 5,
  trainingCapacityBonus: 0.15,
  /** 従業員1人を雇う・やめさせるときの費用 */
  hireCost: 30_000,
  /** 店長の給料（ゲーム内1時間） */
  managerWagePerHour: 4_000,
  /** 店長が決める価格の、最適値からのずれ（自分で調整した方が少し得） */
  managerPriceSkill: 0.9,
  /** 店を閉じる（取り壊す）ときに戻る建設費の割合 */
  demolishRefund: 0.3,
} as const;

/** 品質（会社ごと・商品ごと） */
export const QUALITY = {
  start: 30,
  /** 研究していない状態の上限 */
  capStart: 50,
  /** 品質を1上げる投資額（基本値 × 今の品質） */
  investPerPoint: 40_000,
  /** 品質が原価に与える影響（品質100で 1+costSlope 倍） */
  costSlope: 0.6,
} as const;

/** 財務 */
export const FINANCE = {
  /** 銀行融資：借りられる額の目安 = 時価総額 × creditRatio（最低 minCredit） */
  creditRatio: 0.3,
  minCredit: 30_000_000,
  /** 金利（年）：基本 + 信用の悪さで上乗せ */
  baseRate: 0.04,
  /** 融資の返済期間（四半期） */
  loanQuarters: [4, 8],
  /** 返済日に払えないときの猶予（ゲーム内日数） */
  graceDays: 7,
  /** 時価総額：利益の何倍か（成長率で変わる） */
  peBase: 8,
  peGrowthFactor: 8,
  peMin: 4,
  peMax: 25,
  /** 上場できる時価総額 */
  ipoMarketCap: 100_000_000_000,
  /** 上場で売り出す株の割合 */
  ipoFloat: 0.25,
  /** 法人税（四半期の利益に対して） */
  taxRate: 0.3,
} as const;

/** 買収 */
export const ACQUISITION = {
  /** 店1つを買うとき：評価額 × premium */
  storePremium: 1.35,
  /** 店の評価額 = 土地 + 建設費 × ratio + 年間利益 × years */
  storeBuildingRatio: 0.7,
  storeProfitYears: 2,
  /** 会社の株を買うとき：1回で買う割合と、買い進めるほど上がる上乗せ */
  shareStep: 0.1,
  sharePremiumBase: 1.2,
  sharePremiumPerStep: 0.05,
  /** この割合を超えると会社ごと手に入る */
  controlShare: 0.5,
} as const;

/** イベント */
export const EVENTS = {
  /** 次のイベントまでの間隔（現実の時間、最小・最大） */
  intervalHours: [2, 4] as [number, number],
  /** 答えないまま過ぎると、無難な選択肢が自動で選ばれるまでの時間（現実の分） */
  autoResolveMinutes: 60,
} as const;
