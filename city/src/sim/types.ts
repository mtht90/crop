import type { IndustryId } from '../config/buildings';
import type { Personality } from '../config/rivals';
import type { EventEffect } from '../config/events';

export const SAVE_VERSION = 1;

/** 1日分の集計 */
export interface DayStats {
  customers: number;
  lost: number;
  revenue: number;
  cogs: number;
  wages: number;
  upkeep: number;
  ads: number;
  /** 客数の要因（客の可能性で重み付けした平均）。理由の説明に使う */
  fTraffic: number;
  fAwareness: number;
  fPrice: number;
  fQuality: number;
  fShare: number;
  fService: number;
  weight: number;
}

export interface StoreNote {
  day: number;
  kind: 'rivalOpen' | 'rivalPriceCut' | 'rivalClose';
  company: number;
}

export interface Store {
  id: number;
  company: number;
  lotId: number;
  industry: IndustryId;
  level: number;
  /** 建設・建て替え中なら完了日（ゲーム内の日） */
  buildUntil: number | null;
  /** 建て替え中の、完成後のレベル */
  upgradeTo: number | null;
  prices: Record<string, number>;
  adsPerDay: number;
  staff: number;
  training: number;
  manager: boolean;
  awareness: number;
  satisfaction: number;
  openedDay: number;
  today: DayStats;
  yesterday: DayStats | null;
  /** 連続赤字日数（ライバルの撤退判断用） */
  lossDays: number;
  notes: StoreNote[];
  /** 最近の売上の変化の理由（UI用） */
  reasons: string[];
  /** 建設に使った金額の合計（評価額用） */
  invested: number;
}

export interface Company {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
  personality: Personality | null;
  industries: IndustryId[];
  cash: number;
  /** 商品ごとの品質（0〜100） */
  quality: Record<string, number>;
  bankrupt: boolean;
  foundedDay: number;
  cumulativeSales: number;
  /** 日ごとの売上・利益（最新が末尾、最大 400 日） */
  dailyRevenue: number[];
  dailyProfit: number[];
  marketCap: number;
  /** プレイヤーが持っている株の割合 */
  playerShares: number;
  /** 価格の倍率（ライバルの値下げなど） */
  priceMood: number;
}

export interface Loan {
  id: number;
  name: string;
  principal: number;
  remaining: number;
  annualRate: number;
  quartersLeft: number;
  nextDueDay: number;
  /** 延滞中なら、猶予の期限（ゲーム内の日） */
  graceUntil: number | null;
}

export interface ActiveEffect {
  effect: EventEffect;
  untilDay: number;
}

export interface PendingEvent {
  id: string;
  /** 自動で無難な選択肢が選ばれる日（ゲーム内） */
  autoDay: number;
}

export interface QuarterReport {
  quarter: number;
  startDay: number;
  endDay: number;
  revenue: number;
  costs: number;
  tax: number;
  profit: number;
  cash: number;
  marketCap: number;
  share: Partial<Record<IndustryId, number>>;
  stores: number;
}

export interface LogEntry {
  day: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'event';
}

export interface HistoryPoint {
  day: number;
  revenue: number;
  profit: number;
  cash: number;
  marketCap: number;
  share: Partial<Record<IndustryId, number>>;
}

export interface GameState {
  version: number;
  seed: number;
  /** ゲーム内の経過日数（0 = 1日目の0時）。小数部が時刻 */
  day: number;
  /** 最後に進めた現実の時刻（ms） */
  realTime: number;
  companies: Company[];
  stores: Store[];
  /** 区画の持ち主（-1 = 空き） */
  lotOwner: number[];
  hqLot: number;
  nextId: number;
  unlocked: IndustryId[];
  research: { done: string[]; current: { id: string; progressDays: number } | null };
  loans: Loan[];
  effects: ActiveEffect[];
  pendingEvent: PendingEvent | null;
  nextEventDay: number;
  log: LogEntry[];
  reports: QuarterReport[];
  history: HistoryPoint[];
  ipo: { done: boolean; day: number | null };
  gameOver: { day: number; reason: string } | null;
  nextRivalDay: number;
  rivalsSpawned: number;
  settings: { bgm: number; sfx: number; muted: boolean };
  debug: { speed: number };
}
