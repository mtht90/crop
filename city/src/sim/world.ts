// 状態を変える小さな共通処理（乱数・記録・店の作成など）
import type { IndustryId } from '../config/buildings';
import { INDUSTRIES, QUALITY, STORE, TIME } from '../config/economy';
import { PRODUCTS } from '../config/products';
import { fairPrice, isStoreIndustry } from './model';
import type { DayStats, GameState, LogEntry, Store } from './types';

/** 乱数（状態に種を持つので、保存・再開しても同じ流れになる） */
export function rand(s: GameState): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function emptyDay(): DayStats {
  return { customers: 0, lost: 0, revenue: 0, cogs: 0, wages: 0, upkeep: 0, ads: 0, fTraffic: 0, fAwareness: 0, fPrice: 0, fQuality: 0, fShare: 0, fService: 0, weight: 0 };
}

export function addLog(s: GameState, text: string, kind: LogEntry['kind'] = 'info') {
  s.log.push({ day: s.day, text, kind });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

/** 現実の分 → ゲーム内の日 */
export function minutesToDays(min: number): number {
  return (min * 60) / TIME.realSecondsPerDay;
}

export function createStore(s: GameState, company: number, lotId: number, industry: IndustryId, opts: { instant?: boolean; level?: number } = {}): Store {
  const level = opts.level ?? 1;
  const ind = INDUSTRIES[industry];
  const comp = s.companies[company];
  const prices: Record<string, number> = {};
  if (isStoreIndustry(industry)) {
    for (const p of PRODUCTS.filter((x) => x.industry === industry)) {
      const q = comp.quality[p.id] ?? QUALITY.start;
      prices[p.id] = Math.round(fairPrice(p, q) / p.priceStep) * p.priceStep;
    }
  }
  const maxStaff = ind.maxStaff[level - 1];
  const st: Store = {
    id: s.nextId++,
    company,
    lotId,
    industry,
    level,
    buildUntil: opts.instant ? null : s.day + minutesToDays(ind.levels[level - 1].buildMinutes),
    upgradeTo: null,
    prices,
    adsPerDay: 0,
    staff: isStoreIndustry(industry) ? Math.max(2, Math.round(maxStaff * 0.5)) : Math.round(maxStaff * 0.8),
    training: 0,
    manager: false,
    awareness: STORE.awarenessStart,
    satisfaction: 0.5,
    openedDay: s.day,
    today: emptyDay(),
    yesterday: null,
    lossDays: 0,
    notes: [],
    reasons: [],
    invested: ind.levels.slice(0, level).reduce((a, l) => a + l.cost, 0),
  };
  s.stores.push(st);
  s.lotOwner[lotId] = company;
  return st;
}

export function removeStore(s: GameState, st: Store, freeLot: boolean) {
  s.stores = s.stores.filter((x) => x.id !== st.id);
  if (freeLot) s.lotOwner[st.lotId] = -1;
}

export function companyStores(s: GameState, companyId: number): Store[] {
  return s.stores.filter((st) => st.company === companyId);
}

export const PLAYER = 0;
