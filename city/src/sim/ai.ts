// ライバル企業の行動と、店長（自動調整）の判断
import { CITY_DEMAND, INDUSTRIES, STORE } from '../config/economy';
import { PERSONALITIES, RIVALS, RIVAL_RULES } from '../config/rivals';
import { PRODUCTS } from '../config/products';
import type { IndustryId } from '../config/buildings';
import { catchment, fairPrice, isStoreIndustry, lotDist, lotPrice, productsFor, storeHour, type TickContext } from './model';
import { addLog, companyStores, createStore, rand, removeStore } from './world';
import type { Company, GameState, Store } from './types';

/** 1日の利益を、代表的な時間帯でざっくり見積もる */
const SAMPLE_HOURS: [number, number][] = [[3, 6], [8, 3], [12, 4], [15, 3], [18, 5], [21, 3]];

export function estimateDailyProfit(s: GameState, st: Store, ctx: TickContext, prices: Record<string, number>, staff: number): number {
  let p = 0;
  for (const [h, w] of SAMPLE_HOURS) {
    const r = storeHour(s, st, ctx, h, w, { prices, staff });
    p += r.revenue - r.cogs - r.wages - r.upkeep - r.ads;
  }
  return p;
}

function pricesAt(s: GameState, st: Store, mul: number): Record<string, number> {
  const comp = s.companies[st.company];
  const out: Record<string, number> = { ...st.prices };
  for (const p of productsFor(s, st.company, st.industry)) {
    const q = comp.quality[p.id] ?? 50;
    out[p.id] = Math.max(p.priceStep, Math.round((fairPrice(p, q) * mul) / p.priceStep) * p.priceStep);
  }
  return out;
}

/** 店長：価格（全商品共通の倍率）と従業員を、見積もり利益が大きくなるように選ぶ */
export function managerAdjust(s: GameState, st: Store, ctx: TickContext, skill: number) {
  if (!isStoreIndustry(st.industry) || st.buildUntil !== null) return;
  const maxStaff = INDUSTRIES[st.industry].maxStaff[st.level - 1];
  let best = { profit: -Infinity, mul: 1, staff: st.staff };
  for (let mul = 0.8; mul <= 1.45; mul += 0.1) {
    const prices = pricesAt(s, st, mul);
    for (const f of [0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
      const staff = Math.max(1, Math.round(maxStaff * f));
      const p = estimateDailyProfit(s, st, ctx, prices, staff);
      if (p > best.profit) best = { profit: p, mul, staff };
    }
  }
  // 腕前：最適な倍率から少しずれる（自分で調整した方が少し得になる）
  const mul = 1 + (best.mul - 1) * skill;
  st.prices = pricesAt(s, st, mul);
  st.staff = best.staff;
}

function rivalConfig(c: Company) {
  return PERSONALITIES[c.personality ?? 'steady'];
}

export function spawnRival(s: GameState, index: number): Company | null {
  const t = RIVALS[index];
  if (!t) return null;
  const pc = PERSONALITIES[t.personality];
  const quality: Record<string, number> = {};
  for (const p of PRODUCTS) quality[p.id] = pc.quality;
  const c: Company = {
    id: s.companies.length,
    name: t.name,
    color: t.color,
    isPlayer: false,
    personality: t.personality,
    industries: [...t.industries],
    cash: RIVAL_RULES.startCash,
    quality,
    bankrupt: false,
    foundedDay: s.day,
    cumulativeSales: 0,
    dailyRevenue: [],
    dailyProfit: [],
    marketCap: 0,
    playerShares: 0,
    priceMood: 1,
  };
  s.companies.push(c);
  s.rivalsSpawned = Math.max(s.rivalsSpawned, index + 1);
  return c;
}

/** 空いている区画から、出店先を選ぶ */
function pickLot(s: GameState, industry: IndustryId, ctx: TickContext): number | null {
  let best: { lot: number; score: number } | null = null;
  for (let lot = 0; lot < s.lotOwner.length; lot++) {
    if (s.lotOwner[lot] !== -1 || lot === s.hqLot) continue;
    let comp = 0;
    for (const o of s.stores) {
      if (o.industry !== industry) continue;
      const d = lotDist(o.lotId, lot);
      if (d <= CITY_DEMAND.competitionRadius) comp += (ctx.appeal.get(o.id) ?? 0.2) * Math.pow(CITY_DEMAND.catchmentFalloff, d);
    }
    const score = (catchment[lot] / (1 + comp * 3)) * (0.6 + rand(s) * 0.8) / Math.sqrt(lotPrice(s, lot));
    if (!best || score > best.score) best = { lot, score };
  }
  return best?.lot ?? null;
}

function notifyNearby(s: GameState, lotId: number, industry: IndustryId, kind: Store['notes'][number]['kind'], company: number) {
  for (const st of s.stores) {
    if (st.company !== 0 || st.industry !== industry) continue;
    if (lotDist(st.lotId, lotId) <= CITY_DEMAND.competitionRadius) {
      st.notes.push({ day: s.day, kind, company });
      if (st.notes.length > 10) st.notes.shift();
    }
  }
}

export function rivalOpenStore(s: GameState, c: Company, ctx: TickContext, instant = false): Store | null {
  const industries = c.industries.filter((i) => isStoreIndustry(i));
  const industry = industries[Math.floor(rand(s) * industries.length)];
  if (!industry) return null;
  const lot = pickLot(s, industry, ctx);
  if (lot === null) return null;
  const cost = lotPrice(s, lot) + INDUSTRIES[industry].levels[0].cost;
  if (!instant) {
    if (c.cash < cost) return null;
    c.cash -= cost;
  }
  const st = createStore(s, c.id, lot, industry, { instant });
  st.invested += lotPrice(s, lot) * 0;
  st.adsPerDay = rivalConfig(c).adsPerStore;
  st.prices = pricesAt(s, st, rivalConfig(c).priceMul * c.priceMood);
  if (!instant) {
    notifyNearby(s, lot, industry, 'rivalOpen', c.id);
    addLog(s, `${c.name}が新しい店を出しました`, 'info');
  }
  return st;
}

export function bankruptCompany(s: GameState, c: Company) {
  c.bankrupt = true;
  for (const st of companyStores(s, c.id)) {
    notifyNearby(s, st.lotId, st.industry, 'rivalClose', c.id);
    removeStore(s, st, true);
  }
  addLog(s, `${c.name}が倒産しました`, 'event');
}

/** ライバルの1日の行動 */
export function rivalDaily(s: GameState, ctx: TickContext) {
  const priceCut = ctx.effectMul('rivalPriceCut');
  for (const c of s.companies) {
    if (c.isPlayer || c.bankrupt) continue;
    const pc = rivalConfig(c);
    const stores = companyStores(s, c.id);
    // 値段：性格どおり。値下げ攻勢のイベント中は下げる
    const mood = c.priceMood * priceCut;
    for (const st of stores) {
      if (!isStoreIndustry(st.industry) || st.buildUntil !== null) continue;
      const before = Object.values(st.prices).reduce((a, b) => a + b, 0);
      st.prices = pricesAt(s, st, pc.priceMul * mood);
      const after = Object.values(st.prices).reduce((a, b) => a + b, 0);
      if (after < before * 0.95) notifyNearby(s, st.lotId, st.industry, 'rivalPriceCut', c.id);
      st.adsPerDay = pc.adsPerStore;
      // 従業員：利益が出るように
      const maxStaff = INDUSTRIES[st.industry].maxStaff[st.level - 1];
      let best = { p: -Infinity, n: st.staff };
      for (const f of [0.3, 0.5, 0.7, 0.9]) {
        const n = Math.max(1, Math.round(maxStaff * f));
        const p = estimateDailyProfit(s, st, ctx, st.prices, n);
        if (p > best.p) best = { p, n };
      }
      st.staff = best.n;
      // 建て替え：もうかっていて資金に余裕がある
      const next = INDUSTRIES[st.industry].levels[st.level];
      const y = st.yesterday;
      const profit = y ? y.revenue - y.cogs - y.wages - y.upkeep - y.ads : 0;
      if (next && st.upgradeTo === null && profit > next.upkeepPerHour * 24 * 2 && c.cash > next.cost * 2 && rand(s) < pc.expandChance * 0.3) {
        c.cash -= next.cost;
        st.upgradeTo = st.level + 1;
        st.buildUntil = s.day + next.buildMinutes / 60;
        st.invested += next.cost;
      }
      // 撤退：赤字が続いた
      if (st.lossDays > pc.closeAfterLossDays && stores.length > 1) {
        notifyNearby(s, st.lotId, st.industry, 'rivalClose', c.id);
        c.cash += lotPrice(s, st.lotId) * 0.8;
        removeStore(s, st, true);
        addLog(s, `${c.name}が店を1つ閉めました`, 'info');
      }
    }
    // 出店
    const maxStores = RIVAL_RULES.maxStoresBase + Math.floor(s.day / RIVAL_RULES.maxStoresPerDays);
    const rivalTotal = s.stores.filter((x) => x.company !== 0).length;
    if (rand(s) < pc.expandChance && c.cash * pc.spendRatio > 40_000_000 && companyStores(s, c.id).length < maxStores
      && rivalTotal < s.lotOwner.length * RIVAL_RULES.maxRivalLotShare) rivalOpenStore(s, c, ctx);
    // 倒産
    if (c.cash < RIVAL_RULES.bankruptBelow || (companyStores(s, c.id).length === 0 && c.cash < 10_000_000)) bankruptCompany(s, c);
  }
  // 新しい会社
  const active = s.companies.filter((c) => !c.isPlayer && !c.bankrupt).length;
  if (s.day >= s.nextRivalDay && active < RIVAL_RULES.maxCount && s.rivalsSpawned < RIVALS.length) {
    const c = spawnRival(s, s.rivalsSpawned);
    if (c) {
      rivalOpenStore(s, c, ctx);
      addLog(s, `新しい会社「${c.name}」が街に進出してきました`, 'event');
    }
    s.nextRivalDay = s.day + RIVAL_RULES.newRivalEveryDays;
  }
}

/** 店の売上が変わった理由（昨日と比べる） */
export function explainStore(s: GameState, st: Store): string[] {
  const t = st.today;
  const y = st.yesterday;
  if (!y || y.weight <= 0 || t.weight <= 0 || y.customers < 1) return st.reasons;
  const avg = (d: typeof t, k: 'fTraffic' | 'fAwareness' | 'fPrice' | 'fQuality' | 'fShare' | 'fService') => d[k] / d.weight;
  const total = t.customers / y.customers - 1;
  const factors: [string, number][] = [
    ['traffic', avg(t, 'fTraffic') / Math.max(1e-9, avg(y, 'fTraffic')) - 1],
    ['awareness', avg(t, 'fAwareness') / Math.max(1e-9, avg(y, 'fAwareness')) - 1],
    ['price', avg(t, 'fPrice') / Math.max(1e-9, avg(y, 'fPrice')) - 1],
    ['quality', avg(t, 'fQuality') / Math.max(1e-9, avg(y, 'fQuality')) - 1],
    ['share', avg(t, 'fShare') / Math.max(1e-9, avg(y, 'fShare')) - 1],
    ['service', avg(t, 'fService') / Math.max(1e-9, avg(y, 'fService')) - 1],
  ];
  const out: string[] = [];
  const pct = (x: number) => `${Math.abs(Math.round(x * 100))}%`;
  if (Math.abs(total) >= 0.02) out.push(`客数は昨日より${pct(total)}${total > 0 ? '増' : '減'}`);
  factors.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [k, v] of factors.slice(0, 2)) {
    if (Math.abs(v) < 0.03) continue;
    const up = v > 0;
    const recentNote = [...st.notes].reverse().find((n) => s.day - n.day < 2);
    const who = recentNote ? s.companies[recentNote.company]?.name : '';
    switch (k) {
      case 'share':
        if (recentNote?.kind === 'rivalOpen' && !up) out.push(`${who}の新店オープンで客が${pct(v)}減`);
        else if (recentNote?.kind === 'rivalPriceCut' && !up) out.push(`${who}の値下げで客が${pct(v)}減`);
        else if (recentNote?.kind === 'rivalClose' && up) out.push(`${who}の閉店で客が${pct(v)}増`);
        else out.push(`ライバルとの取り合いで客が${pct(v)}${up ? '増' : '減'}`);
        break;
      case 'traffic': out.push(`街の人出の変化で客が${pct(v)}${up ? '増' : '減'}`); break;
      case 'awareness': out.push(`知名度が${up ? '上がり' : '下がり'}客が${pct(v)}${up ? '増' : '減'}`); break;
      case 'price': out.push(`値段の${up ? '割安感' : '割高感'}で客が${pct(v)}${up ? '増' : '減'}`); break;
      case 'quality': out.push(`品質の${up ? '向上' : '低下'}で客が${pct(v)}${up ? '増' : '減'}`); break;
      case 'service': out.push(up ? `人手が足りて、逃していた客が${pct(v)}戻った` : `人手不足で客を${pct(v)}逃した`); break;
    }
  }
  if (t.lost > t.customers * 0.1) out.push(`人手が足りず、${Math.round(t.lost).toLocaleString('ja-JP')}人の客を逃しています`);
  return out;
}

export { STORE };
