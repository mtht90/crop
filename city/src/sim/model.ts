// 経済モデル：店ごとの客数・売上・費用を計算する純粋な関数。
// 客数 = 人通り × 時間帯 × 知名度 × 価格の魅力 × 品質 × ライバルとの取り合い（上限：さばける客数）
import { CITY } from '../config/city';
import type { IndustryId } from '../config/buildings';
import { CITY_DEMAND, HOUR_CURVES, INDUSTRIES, LAND, LINKS, QUALITY, STORE } from '../config/economy';
import { PRODUCTS, productById, type ProductConfig } from '../config/products';
import { PERSONALITIES } from '../config/rivals';
import { researchById } from '../config/research';
import { buildLayout, type CityLayout } from '../core/layout';
import type { GameState, Store } from './types';

export const layout: CityLayout = buildLayout();

/** 区画どうしの距離（チェビシェフ距離） */
export function lotDist(a: number, b: number): number {
  const la = layout.lots[a];
  const lb = layout.lots[b];
  return Math.max(Math.abs(la.gx - lb.gx), Math.abs(la.gz - lb.gz));
}

/** 区画ごとの「集客できる人通り」：周りの区画の人通りを距離で重み付けして足す */
export const catchment: number[] = layout.lots.map((l) => {
  let sum = 0;
  for (const o of layout.lots) {
    const d = Math.max(Math.abs(o.gx - l.gx), Math.abs(o.gz - l.gz));
    if (d <= CITY_DEMAND.catchmentRadius) sum += o.traffic * Math.pow(CITY_DEMAND.catchmentFalloff, d);
  }
  return sum;
});

export function hourOfDay(day: number): number {
  return Math.floor((((day % 1) + 1) % 1) * 24);
}

export function isStoreIndustry(i: IndustryId): i is 'food' | 'retail' {
  return INDUSTRIES[i].kind === 'store';
}

/** 研究の効果をまとめたもの（プレイヤー用） */
export interface ResearchBonuses {
  qualityCap: Record<IndustryId, number>;
  costReduction: Record<IndustryId, number>;
  capacity: Record<IndustryId, number>;
  adEfficiency: number;
  manager: boolean;
  managerSkill: number;
  researchSpeed: number;
  factoryOutput: number;
  logisticsRange: number;
  appBusiness: boolean;
  appRevenue: number;
}

const ALL_IND: IndustryId[] = ['food', 'retail', 'factory', 'logistics', 'it'];
const zeroInd = (): Record<IndustryId, number> => ({ food: 0, retail: 0, factory: 0, logistics: 0, it: 0 });

export function researchBonuses(s: GameState): ResearchBonuses {
  const b: ResearchBonuses = {
    qualityCap: zeroInd(), costReduction: zeroInd(), capacity: zeroInd(),
    adEfficiency: 0, manager: false, managerSkill: STORE.managerPriceSkill, researchSpeed: 0,
    factoryOutput: 0, logisticsRange: 0, appBusiness: false, appRevenue: 0,
  };
  for (const id of s.research.done) {
    const r = researchById.get(id);
    if (!r) continue;
    for (const e of r.effects) {
      switch (e.type) {
        case 'qualityCap': b.qualityCap[e.industry] += e.amount; break;
        case 'costReduction':
          if (e.industry === 'all') for (const i of ALL_IND) b.costReduction[i] += e.pct;
          else b.costReduction[e.industry] += e.pct;
          break;
        case 'capacity':
          if (e.industry === 'all') for (const i of ALL_IND) b.capacity[i] += e.pct;
          else b.capacity[e.industry] += e.pct;
          break;
        case 'adEfficiency': b.adEfficiency += e.pct; break;
        case 'manager': b.manager = true; break;
        case 'managerSkill': b.managerSkill += e.amount; break;
        case 'researchSpeed': b.researchSpeed += e.pct; break;
        case 'factoryOutput': b.factoryOutput += e.pct; break;
        case 'logisticsRange': b.logisticsRange += e.pct; break;
        case 'appBusiness': b.appBusiness = true; break;
        case 'appRevenue': b.appRevenue += e.pct; break;
        case 'product': break;
      }
    }
  }
  return b;
}

export function qualityCapFor(s: GameState, companyId: number, industry: IndustryId, bonus?: ResearchBonuses): number {
  const c = s.companies[companyId];
  if (!c.isPlayer) return 100;
  const b = bonus ?? researchBonuses(s);
  return Math.min(100, QUALITY.capStart + b.qualityCap[industry]);
}

/** その会社が売れる商品 */
export function productsFor(s: GameState, companyId: number, industry: IndustryId): ProductConfig[] {
  const c = s.companies[companyId];
  return PRODUCTS.filter((p) => p.industry === industry && (!p.research || !c.isPlayer || s.research.done.includes(p.research) || rivalHasProduct(s, c.id, p)));
}

/** ライバルは時間とともに新商品を出す */
function rivalHasProduct(s: GameState, companyId: number, p: ProductConfig): boolean {
  const c = s.companies[companyId];
  const age = s.day - c.foundedDay;
  const tier = p.research?.endsWith('1') ? 1 : p.research?.endsWith('2') ? 2 : 3;
  return age > 15 * tier + (companyId % 5) * 4;
}

/** 品質を考えた「ふつうの値段」 */
export function fairPrice(p: ProductConfig, quality: number): number {
  return p.refPrice * (0.7 + 0.6 * quality / 100);
}

export function unitCost(s: GameState, store: Store, p: ProductConfig, quality: number, ctx: TickContext): number {
  let c = p.baseCost * (1 + QUALITY.costSlope * (quality - 50) / 100);
  const comp = s.companies[store.company];
  if (comp.isPlayer) {
    c *= 1 - Math.min(0.5, ctx.bonus.costReduction[store.industry]);
    if (ctx.factorySupplied.has(store.id)) c *= 1 - LINKS.factoryCostDiscount;
  }
  c *= ctx.effectMul('costMul', store.industry);
  return c;
}

/** 1回の計算で共通に使う値 */
export interface TickContext {
  bonus: ResearchBonuses;
  popFactor: number;
  factorySupplied: Set<number>;
  logisticsCovered: Set<number>;
  playerStoreCount: number;
  itEfficiency: number;
  effectMul: (type: 'costMul' | 'demandMul' | 'wageMul' | 'capacityMul' | 'rivalPriceCut', industry?: IndustryId) => number;
  /** 店ごとの集客力（取り合いの計算用） */
  appeal: Map<number, number>;
}

export function makeContext(s: GameState): TickContext {
  const bonus = researchBonuses(s);
  const popFactor = 1 + CITY_DEMAND.annualPopulationGrowth * (s.day / 360);
  const playerStores = s.stores.filter((st) => st.company === 0 && st.buildUntil === null);
  // 工場：自社の店（飲食・小売）に卸す
  const factorySupplied = new Set<number>();
  let factorySlots = 0;
  let logisticsSlots = 0;
  let itLevels = 0;
  for (const st of playerStores) {
    if (st.industry === 'factory') factorySlots += st.level * LINKS.factoryStoresPerLevel;
    if (st.industry === 'logistics') logisticsSlots += Math.round(st.level * LINKS.logisticsStoresPerLevel * (1 + bonus.logisticsRange));
    if (st.industry === 'it') itLevels += st.level;
  }
  const retailLike = playerStores.filter((st) => isStoreIndustry(st.industry)).sort((a, b) => a.id - b.id);
  for (const st of retailLike.slice(0, factorySlots)) factorySupplied.add(st.id);
  const logisticsCovered = new Set<number>();
  for (const st of playerStores.filter((x) => x.industry !== 'logistics').sort((a, b) => a.id - b.id).slice(0, logisticsSlots)) logisticsCovered.add(st.id);
  const itEfficiency = Math.min(LINKS.itEfficiencyMax, itLevels * LINKS.itEfficiencyPerLevel);

  const effectMul: TickContext['effectMul'] = (type, industry) => {
    let m = 1;
    for (const a of s.effects) {
      const e = a.effect;
      if (e.type !== type) continue;
      if ('industry' in e && e.industry !== 'all' && industry && e.industry !== industry) continue;
      m *= e.mul;
    }
    return m;
  };
  const ctx: TickContext = {
    bonus, popFactor, factorySupplied, logisticsCovered,
    playerStoreCount: retailLike.length, itEfficiency, effectMul, appeal: new Map(),
  };
  for (const st of s.stores) {
    if (st.buildUntil !== null || !isStoreIndustry(st.industry)) continue;
    ctx.appeal.set(st.id, storeAppeal(s, st, ctx).appeal);
  }
  return ctx;
}

/** 店の集客力と、その内訳 */
export function storeAppeal(s: GameState, st: Store, _ctx: TickContext, prices?: Record<string, number>) {
  const comp = s.companies[st.company];
  const prods = productsFor(s, st.company, st.industry);
  let wSum = 0;
  let pa = 0;
  let q = 0;
  for (const p of prods) {
    const quality = comp.quality[p.id] ?? QUALITY.start;
    const price = (prices ?? st.prices)[p.id] ?? fairPrice(p, quality);
    const attr = Math.min(2.5, Math.pow(fairPrice(p, quality) / Math.max(1, price), STORE.priceElasticity));
    pa += p.weight * attr;
    q += p.weight * quality;
    wSum += p.weight;
  }
  const priceAttr = wSum ? pa / wSum : 0;
  const quality = wSum ? q / wSum : 0;
  const qualAttr = 0.6 + 0.8 * quality / 100;
  const breadth = 1 + 0.08 * Math.max(0, prods.length - 2);
  const lvl = INDUSTRIES[st.industry].levels[st.level - 1];
  const satAttr = 0.6 + 0.8 * st.satisfaction;
  const appeal = st.awareness * priceAttr * qualAttr * lvl.appeal * breadth * satAttr;
  return { appeal, priceAttr, qualAttr, quality };
}

export interface HourResult {
  demand: number;
  served: number;
  revenue: number;
  cogs: number;
  wages: number;
  upkeep: number;
  ads: number;
  potential: number;
  share: number;
  priceAttr: number;
  qualAttr: number;
  serviceRatio: number;
}

/** 店の1時間分の経済（hours 時間ぶん。dt が1時間未満でもよい） */
export function storeHour(s: GameState, st: Store, ctx: TickContext, hour: number, hours: number, override?: { prices?: Record<string, number>; staff?: number }): HourResult {
  const ind = INDUSTRIES[st.industry];
  const comp = s.companies[st.company];
  const lvl = ind.levels[st.level - 1];
  const staff = override?.staff ?? st.staff;
  const logiDisc = comp.isPlayer && ctx.logisticsCovered.has(st.id) ? 1 - LINKS.logisticsOpexDiscount : 1;
  const wageMul = comp.isPlayer ? ctx.effectMul('wageMul') : 1;
  const wages = (staff * ind.wagePerHour * (1 + 0.05 * st.training) * wageMul + (st.manager ? STORE.managerWagePerHour : 0)) * hours * logiDisc;
  const upkeep = lvl.upkeepPerHour * hours * logiDisc;
  const ads = (st.adsPerDay / 24) * hours;
  const res: HourResult = { demand: 0, served: 0, revenue: 0, cogs: 0, wages, upkeep, ads, potential: 0, share: 0, priceAttr: 0, qualAttr: 0, serviceRatio: 1 };
  if (!isStoreIndustry(st.industry)) return res;

  const curve = HOUR_CURVES[st.industry][hour];
  const reach = 1 + CITY_DEMAND.levelReach * (st.level - 1);
  const potential = catchment[st.lotId] * reach * CITY_DEMAND.peoplePerTrafficHour * (ind.demandPerPerson ?? 0) * curve * ctx.popFactor
    * (comp.isPlayer ? ctx.effectMul('demandMul', st.industry) : 1);
  const a = override?.prices ? storeAppeal(s, st, ctx, override.prices) : storeAppeal(s, st, ctx);
  let rivalAppeal = 0;
  for (const o of s.stores) {
    if (o.id === st.id || o.industry !== st.industry || o.buildUntil !== null) continue;
    const d = lotDist(o.lotId, st.lotId);
    if (d > CITY_DEMAND.competitionRadius) continue;
    rivalAppeal += (ctx.appeal.get(o.id) ?? 0) * Math.pow(CITY_DEMAND.catchmentFalloff, d);
  }
  const share = a.appeal / (a.appeal + rivalAppeal + (ind.outsideOption ?? 0.5) * 0.25);
  let demand = potential * share * hours;
  // 品切れ：物流が届いていない自社の店は、店が多いと客を逃す
  if (comp.isPlayer && ctx.playerStoreCount > LINKS.stockoutFreeStores && !ctx.logisticsCovered.has(st.id)) {
    demand *= 1 - LINKS.stockoutLoss;
  }
  const capMul = 1 + (comp.isPlayer ? ctx.bonus.capacity[st.industry] : 0);
  const capacity = staff * (ind.customersPerStaffHour ?? 10) * (1 + STORE.trainingCapacityBonus * st.training) * capMul
    * (comp.isPlayer ? ctx.effectMul('capacityMul') : 1) * hours;
  const served = Math.min(demand, capacity);

  const prods = productsFor(s, st.company, st.industry);
  const prices = override?.prices ?? st.prices;
  let revenue = 0;
  let cogs = 0;
  for (const p of prods) {
    const quality = comp.quality[p.id] ?? QUALITY.start;
    const price = prices[p.id] ?? fairPrice(p, quality);
    const attr = Math.min(1.3, fairPrice(p, quality) / Math.max(1, price));
    const prob = Math.min(1, p.weight * Math.pow(attr, 0.7));
    const units = served * prob;
    revenue += units * price;
    cogs += units * unitCost(s, st, p, quality, ctx);
  }
  if (comp.isPlayer) revenue *= 1 + ctx.itEfficiency;
  Object.assign(res, {
    demand, served, revenue, cogs, potential: potential * hours, share,
    priceAttr: a.priceAttr, qualAttr: a.qualAttr, serviceRatio: demand > 0 ? served / demand : 1,
  });
  return res;
}

/** 施設（工場・物流・IT）の1時間分 */
export function facilityHour(s: GameState, st: Store, ctx: TickContext, hours: number): { revenue: number; cogs: number } {
  if (st.industry === 'factory') {
    const comp = s.companies[st.company];
    const qs = Object.values(comp.quality);
    const q = qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : 50;
    const out = LINKS.factoryWholesalePerLevelHour * INDUSTRIES.factory.levels[st.level - 1].capacityMul * (1 + ctx.bonus.factoryOutput) * (0.6 + 0.8 * q / 100) * ctx.popFactor;
    const staffRatio = Math.min(1, st.staff / Math.max(1, INDUSTRIES.factory.maxStaff[st.level - 1] * 0.8));
    const rev = out * staffRatio * hours;
    return { revenue: rev, cogs: rev * (1 - LINKS.factoryWholesaleMargin) };
  }
  if (st.industry === 'it' && ctx.bonus.appBusiness) {
    const staffRatio = Math.min(1, st.staff / Math.max(1, INDUSTRIES.it.maxStaff[st.level - 1] * 0.8));
    const rev = LINKS.appRevenuePerLevelHour * INDUSTRIES.it.levels[st.level - 1].capacityMul * (1 + ctx.bonus.appRevenue) * ctx.popFactor * staffRatio * hours;
    return { revenue: rev, cogs: rev * 0.2 };
  }
  return { revenue: 0, cogs: 0 };
}

/** 区画の今の値段 */
export function lotPrice(s: GameState, lotId: number): number {
  const base = (layout.lots[lotId].landPrice / CITY.landPrice.base) * LAND.basePrice; // 中心からの距離による割合 × 地価の基本値
  return Math.round(base * (1 + LAND.annualGrowth * (s.day / 360)) / 10_000) * 10_000;
}

/** プレイヤーが今買える範囲（中心からの距離） */
export function buyableRadius(s: GameState): number {
  const n = s.stores.filter((st) => st.company === 0).length;
  return Math.min(LAND.buyableRadiusMax, LAND.buyableRadiusStart + Math.floor(n / LAND.buyableRadiusPerStores));
}

export function lotCenterDist(lotId: number): number {
  const l = layout.lots[lotId];
  const h = (CITY.size - 1) / 2;
  return Math.max(Math.abs(l.gx - h), Math.abs(l.gz - h));
}

export function playerCanBuyLot(s: GameState, lotId: number): boolean {
  return s.lotOwner[lotId] === -1 && lotCenterDist(lotId) <= buyableRadius(s) + 1e-9;
}

export function productIdsOf(industry: IndustryId) {
  return PRODUCTS.filter((p) => p.industry === industry).map((p) => p.id);
}
export { productById };

export function rivalQuality(personality: keyof typeof PERSONALITIES) {
  return PERSONALITIES[personality].quality;
}
