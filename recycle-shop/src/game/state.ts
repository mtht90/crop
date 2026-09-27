import type { CategoryId } from '../data/items';

export type ItemLoc =
  | { type: 'stock' }
  | { type: 'fixture'; fixture: string; slot: string }
  | { type: 'bench' }
  | { type: 'held' }
  | { type: 'counter' }
  | { type: 'customer'; customer: string }
  | { type: 'gone' };

export interface Defect {
  kind: 'scratch' | 'dent' | 'crack' | 'fade';
  severity: number;
  seed: number;
  found: boolean;
}

export interface ItemState {
  uid: string;
  defId: string;
  /** 本体の状態 0..100 (汚れを除く) */
  condition: number;
  /** 汚れ 0..1 (清掃で落とせる) */
  dirt: number;
  dirtSeed: number;
  defects: Defect[];
  working: boolean;
  accessories: string[];
  authentic: boolean;
  mark: string;
  serial: string;
  weight: number;
  variant: number;
  cost: number;
  price: number | null;
  /** プレイヤーが確認した情報 */
  tested: boolean;
  /** プレイヤーの真贋判定 */
  verdict: 'genuine' | 'fake' | null;
  repaired: boolean;
  loc: ItemLoc;
  day: number;
}

export interface FixtureState {
  uid: string;
  defId: string;
  x: number;
  z: number;
  /** 0..3 (90° 単位) */
  rot: number;
  locked?: boolean;
}

export interface ActiveNews {
  text: string;
  cat: CategoryId | null;
  effect: number;
  daysLeft: number;
}

export interface MarketState {
  trend: Record<CategoryId, number>;
  history: Record<CategoryId, number[]>;
  news: ActiveNews[];
}

export interface DayLedger {
  sales: number;
  purchases: number;
  expenses: number;
  customers: number;
  sold: number;
  bought: number;
  repStart: number;
  xp: number;
  lostCustomers: number;
  events: string[];
}

export interface Stats {
  totalSales: number;
  totalPurchases: number;
  itemsSold: number;
  itemsBought: number;
  fakesCaught: number;
  fakesBought: number;
  customersServed: number;
  bestSale: number;
  profit: number;
  cleaned: number;
  repaired: number;
}

export type Phase = 'prep' | 'open' | 'closing' | 'summary';

export interface GameState {
  version: number;
  shopName: string;
  day: number;
  minute: number;
  phase: Phase;
  money: number;
  reputation: number;
  xp: number;
  level: number;
  items: ItemState[];
  fixtures: FixtureState[];
  upgrades: string[];
  market: MarketState;
  stats: Stats;
  today: DayLedger;
  objectivesDone: string[];
  /** 偽物を知らずに売った記録 (後日クレームの種) */
  pendingComplaints: { itemName: string; price: number; day: number }[];
  seed: number;
}

export const SAVE_VERSION = 3;
export const OPEN_MINUTE = 10 * 60;
export const CLOSE_MINUTE = 19 * 60;

export const emptyLedger = (rep: number): DayLedger => ({
  sales: 0, purchases: 0, expenses: 0, customers: 0, sold: 0, bought: 0, repStart: rep, xp: 0, lostCustomers: 0, events: [],
});
