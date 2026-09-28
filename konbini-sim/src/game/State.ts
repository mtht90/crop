import { PRODUCTS, product } from '../data/products';

export type Weather = 'sunny' | 'cloudy' | 'rain';

export interface DayStats {
  day: number;
  sales: number;
  cogs: number;
  customers: number;
  lost: number;
  waste: number;
  wasteItems: number;
  theft: number;
  orders: number;
  fixed: number;
  wages: number;
  refunds: number;
  repStart: number;
  repEnd: number;
  sold: Record<string, number>;
  events: string[];
}

export interface PendingOrder {
  productId: string;
  cases: number;
  arriveAt: number; // absolute game minute
}

export interface HotItem {
  id: string;
  madeAt: number;
}

export const DAY_START = 6 * 60;
export const DAY_END = 26 * 60; // 02:00 next day
export const DELIVERY_TIMES = [7 * 60, 13 * 60, 19 * 60];
export const HOT_HOLD_MIN = 180;
export const NEVER = 1e9;

/** Absolute game minute at which a product delivered at `now` expires. */
export function expiryFor(life: number, now: number): number {
  // 1-day items (onigiri, bento …) keep ~30h, so yesterday's stock expires mid-morning.
  return life >= 99 ? NEVER : now + life * 1440 + 6 * 60;
}

export const RANKS = [
  { rank: 1, need: 0, title: '新米オーナー' },
  { rank: 2, need: 120_000, title: '地域の顔' },
  { rank: 3, need: 400_000, title: '繁盛店' },
  { rank: 4, need: 1_000_000, title: '優良店舗' },
];

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  daily?: number;
  rank: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'camera', name: '防犯カメラ', desc: '万引きの瞬間を検知して警告します。', cost: 60_000, rank: 1 },
  { id: 'fryer', name: '高性能フライヤー', desc: '揚げ時間が40%短縮されます。', cost: 45_000, rank: 1 },
  { id: 'wax', name: '床コーティング', desc: '床の汚れが発生しにくくなります。', cost: 25_000, rank: 1 },
  { id: 'changer', name: '自動釣銭機', desc: 'おつりを自動で払い出します。', cost: 90_000, rank: 2 },
  { id: 'led', name: '看板・照明LED化', desc: '夜間の来客数が15%増加、電気代も節約。', cost: 40_000, rank: 2 },
  { id: 'parttimer', name: 'アルバイト雇用 (9-17時)', desc: '日中のレジ対応を任せられます。日給¥9,000。', cost: 0, daily: 9_000, rank: 2 },
  { id: 'ad', name: 'チラシ広告', desc: '評判が+8。来客が増えます(1回限り)。', cost: 30_000, rank: 1 },
];

export function emptyStats(day: number, rep: number): DayStats {
  return { day, sales: 0, cogs: 0, customers: 0, lost: 0, waste: 0, wasteItems: 0, theft: 0, orders: 0, fixed: 0, wages: 0, refunds: 0, repStart: rep, repEnd: rep, sold: {}, events: [] };
}

/** Plain-data game state (serialisable). */
export class GameState {
  day = 1;
  minute = DAY_START;
  money = 120_000;
  reputation = 50;
  totalSales = 0;
  prices: Record<string, number> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.price]));
  hotStock: Record<string, number> = { karaage: 20, chicken: 10, croquette: 10 };
  hotCase: HotItem[] = [];
  upgrades: string[] = [];
  weather: Weather = 'sunny';
  forecast: Weather = 'cloudy';
  orders: PendingOrder[] = [];
  stats: DayStats = emptyStats(1, 50);
  history: DayStats[] = [];
  tutorial = 0;
  /** Seconds of real time per game minute. */
  minuteLength = 1;

  get abs(): number {
    return this.day * 1440 + this.minute;
  }

  get hour(): number {
    return (this.minute / 60) % 24;
  }

  get rank(): number {
    let r = 1;
    for (const x of RANKS) if (this.totalSales >= x.need) r = x.rank;
    return r;
  }

  has(upgrade: string): boolean {
    return this.upgrades.includes(upgrade);
  }

  price(id: string): number {
    return this.prices[id] ?? product(id).price;
  }

  clock(): string {
    const h = Math.floor(this.minute / 60) % 24;
    const m = Math.floor(this.minute % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** 0 morning, 1 day, 2 evening, 3 night */
  band(): number {
    const h = this.minute / 60;
    if (h < 10) return 0;
    if (h < 16) return 1;
    if (h < 22) return 2;
    return 3;
  }

  addRep(d: number, reason?: string): void {
    this.reputation = Math.max(0, Math.min(100, this.reputation + d));
    if (reason) this.stats.events.push(`${d > 0 ? '+' : ''}${d} ${reason}`);
  }

  toJSON(): object {
    const { day, minute, money, reputation, totalSales, prices, hotStock, hotCase, upgrades, weather, forecast, orders, stats, history, tutorial, minuteLength } = this;
    return { day, minute, money, reputation, totalSales, prices, hotStock, hotCase, upgrades, weather, forecast, orders, stats, history, tutorial, minuteLength };
  }

  static from(o: Partial<GameState>): GameState {
    const s = new GameState();
    Object.assign(s, o);
    for (const p of PRODUCTS) if (s.prices[p.id] == null) s.prices[p.id] = p.price;
    return s;
  }
}
