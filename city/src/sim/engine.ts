// 時間を進める。画面を開いている間は1秒ごと、留守中はまとめて1時間ずつ進める。
import { CITY } from '../config/city';
import { EVENTS, FINANCE, INDUSTRIES, QUALITY, START, STORE, TIME } from '../config/economy';
import { GAME_EVENTS, type EventEffect } from '../config/events';
import { PRODUCTS } from '../config/products';
import { RIVAL_RULES } from '../config/rivals';
import { researchById } from '../config/research';
import { explainStore, managerAdjust, rivalDaily, rivalOpenStore, spawnRival } from './ai';
import { addLoan, closeQuarter, computeMarketCap, playerShare, processLoans, quarterIndex } from './finance';
import { facilityHour, hourOfDay, isStoreIndustry, layout, makeContext, researchBonuses, storeHour, type TickContext } from './model';
import { addLog, emptyDay, rand } from './world';
import { SAVE_VERSION, type Company, type GameState } from './types';

export function newGame(now: number, seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  const quality: Record<string, number> = {};
  for (const p of PRODUCTS) quality[p.id] = QUALITY.start;
  const player: Company = {
    id: 0, name: START.companyName, color: START.companyColor, isPlayer: true, personality: null,
    industries: ['food'], cash: 0, quality, bankrupt: false, foundedDay: 0, cumulativeSales: 0,
    dailyRevenue: [], dailyProfit: [], marketCap: 0, playerShares: 1, priceMood: 1,
  };
  const hqLot = START.hqLot.gz * CITY.size + START.hqLot.gx;
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    day: TIME.startHour / 24,
    realTime: now,
    companies: [player],
    stores: [],
    lotOwner: layout.lots.map(() => -1),
    hqLot,
    nextId: 1,
    unlocked: ['food'],
    research: { done: [], current: null },
    loans: [],
    effects: [],
    pendingEvent: null,
    nextEventDay: 0,
    log: [],
    reports: [],
    history: [],
    ipo: { done: false, day: null },
    gameOver: null,
    nextRivalDay: RIVAL_RULES.newRivalEveryDays,
    rivalsSpawned: 0,
    settings: { bgm: 0.5, sfx: 0.7, muted: false },
    debug: { speed: 1 },
  };
  s.lotOwner[hqLot] = 0;
  addLoan(s, '創業融資', START.loanAmount, START.loanQuarters, START.loanAnnualRate);
  scheduleNextEvent(s);
  // 最初のライバル
  const ctx = makeContext(s);
  for (let i = 0; i < RIVAL_RULES.startCount; i++) {
    const c = spawnRival(s, i);
    if (c) for (let k = 0; k < RIVAL_RULES.startStores; k++) rivalOpenStore(s, c, ctx, true);
  }
  addLog(s, `${START.companyName}を設立しました。創業融資 ${START.loanAmount / 10_000}万円でスタートです`, 'good');
  return s;
}

function scheduleNextEvent(s: GameState) {
  const [a, b] = EVENTS.intervalHours;
  const hours = a + rand(s) * (b - a);
  s.nextEventDay = s.day + (hours * 3600) / TIME.realSecondsPerDay;
}

export interface TickOptions {
  offline?: boolean;
}

/** 進行のまとめ（留守中のまとめや、画面のお知らせに使う） */
export interface TickSummary {
  revenue: number;
  profit: number;
  days: number;
  quarters: number;
  logsFrom: number;
}

/** dtDays だけ時間を進める */
export function advance(s: GameState, dtDays: number, opts: TickOptions = {}): TickSummary {
  const summary: TickSummary = { revenue: 0, profit: 0, days: 0, quarters: 0, logsFrom: s.log.length };
  const maxStep = TIME.offlineStepHours / 24;
  let left = dtDays;
  while (left > 1e-12 && !s.gameOver) {
    // 日付の変わり目・1時間の変わり目で区切る
    const nextHour = (Math.floor(s.day * 24 + 1e-9) + 1) / 24;
    const step = Math.min(left, maxStep, nextHour - s.day);
    const res = step1(s, step, opts);
    summary.revenue += res.revenue;
    summary.profit += res.profit;
    left -= step;
    const prevDay = Math.floor(s.day);
    s.day += step;
    if (Math.floor(s.day + 1e-9) > prevDay) {
      s.day = Math.round(s.day * 1e9) / 1e9;
      endOfDay(s, opts);
      summary.days++;
      if (quarterIndex(s.day) > quarterIndex(s.day - 0.5)) {
        closeQuarter(s);
        summary.quarters++;
      }
    }
    processLoans(s, !!opts.offline);
  }
  return summary;
}

/** 1歩（1時間以内）進める */
function step1(s: GameState, dt: number, opts: TickOptions): { revenue: number; profit: number } {
  const ctx = makeContext(s);
  const hour = hourOfDay(s.day);
  const hours = dt * 24;
  let pRev = 0;
  let pProfit = 0;
  for (const st of s.stores) {
    if (st.buildUntil !== null) {
      if (s.day + dt >= st.buildUntil) finishBuilding(s, st);
      continue;
    }
    const comp = s.companies[st.company];
    let revenue: number;
    let cost: number;
    if (isStoreIndustry(st.industry)) {
      const r = storeHour(s, st, ctx, hour, hours);
      const t = st.today;
      t.customers += r.served;
      t.lost += r.demand - r.served;
      t.revenue += r.revenue;
      t.cogs += r.cogs;
      t.wages += r.wages;
      t.upkeep += r.upkeep;
      t.ads += r.ads;
      const w = r.potential;
      t.fTraffic += w * (r.potential / Math.max(1e-9, hours));
      t.fAwareness += w * st.awareness;
      t.fPrice += w * r.priceAttr;
      t.fQuality += w * r.qualAttr;
      t.fShare += w * r.share;
      t.fService += w * r.serviceRatio;
      t.weight += w;
      revenue = r.revenue;
      cost = r.cogs + r.wages + r.upkeep + r.ads;
    } else {
      const r = storeHour(s, st, ctx, hour, hours);
      const f = facilityHour(s, st, ctx, hours);
      st.today.revenue += f.revenue;
      st.today.cogs += f.cogs;
      st.today.wages += r.wages;
      st.today.upkeep += r.upkeep;
      revenue = f.revenue;
      cost = f.cogs + r.wages + r.upkeep;
    }
    comp.cash += revenue - cost;
    comp.cumulativeSales += revenue;
    if (comp.isPlayer) {
      pRev += revenue;
      pProfit += revenue - cost;
    }
  }
  // 研究
  const cur = s.research.current;
  if (cur) {
    const r = researchById.get(cur.id);
    cur.progressDays += dt * (1 + ctx.bonus.researchSpeed);
    if (r && cur.progressDays * 60 >= r.minutes) {
      s.research.done.push(cur.id);
      s.research.current = null;
      addLog(s, `研究「${r.name}」が完了しました`, 'good');
    }
  }
  // イベント
  if (!s.pendingEvent && s.day >= s.nextEventDay) startEvent(s);
  if (s.pendingEvent && s.day >= s.pendingEvent.autoDay) {
    const ev = GAME_EVENTS.find((e) => e.id === s.pendingEvent!.id);
    if (ev) resolveEvent(s, ev.safe, true);
    else s.pendingEvent = null;
  }
  void opts;
  return { revenue: pRev, profit: pProfit };
}

function finishBuilding(s: GameState, st: GameState['stores'][number]) {
  const comp = s.companies[st.company];
  if (st.upgradeTo !== null) {
    st.level = st.upgradeTo;
    st.upgradeTo = null;
    if (comp.isPlayer) addLog(s, `${INDUSTRIES[st.industry].shortName}の店がレベル${st.level}に建て替わりました`, 'good');
  } else if (comp.isPlayer) {
    addLog(s, `${INDUSTRIES[st.industry].shortName}の${isStoreIndustry(st.industry) ? '店' : '施設'}が完成しました`, 'good');
  }
  st.buildUntil = null;
  st.openedDay = s.day;
}

function endOfDay(s: GameState, opts: TickOptions) {
  const ctx = makeContext(s);
  const bonus = researchBonuses(s);
  for (const c of s.companies) {
    if (c.bankrupt) continue;
    let rev = 0;
    let profit = 0;
    for (const st of s.stores) {
      if (st.company !== c.id) continue;
      const t = st.today;
      rev += t.revenue;
      profit += t.revenue - t.cogs - t.wages - t.upkeep - t.ads;
    }
    // 法人税：利益が出た日に、その日の分を差し引く（決算日にまとめて払うと資金繰りが急に苦しくなるため）
    const tax = Math.max(0, profit) * FINANCE.taxRate;
    c.cash -= tax;
    c.dailyRevenue.push(rev);
    c.dailyProfit.push(profit - tax);
    if (c.dailyRevenue.length > 400) c.dailyRevenue.shift();
    if (c.dailyProfit.length > 400) c.dailyProfit.shift();
  }
  for (const st of s.stores) {
    if (st.buildUntil !== null) continue;
    const t = st.today;
    const profit = t.revenue - t.cogs - t.wages - t.upkeep - t.ads;
    st.lossDays = profit < 0 ? st.lossDays + 1 : 0;
    if (isStoreIndustry(st.industry)) {
      const comp = s.companies[st.company];
      const adEff = comp.isPlayer ? 1 + bonus.adEfficiency : 1;
      const adGain = Math.min(STORE.adEffectMax, st.adsPerDay * STORE.adEffectPerYen * adEff);
      st.awareness += adGain + STORE.wordOfMouth * (st.satisfaction - 0.5) - STORE.awarenessDecay * st.awareness;
      st.awareness = Math.max(0.02, Math.min(1, st.awareness));
      const w = t.weight || 1;
      const qual = (t.fQuality / w - 0.6) / 0.8; // 0..1
      const priceFair = Math.min(1, (t.fPrice / w) / 1.2);
      const service = t.fService / w;
      const target = 0.45 * qual + 0.35 * priceFair + 0.2 * service;
      st.satisfaction += (target - st.satisfaction) * STORE.satisfactionRate;
      if (comp.isPlayer) st.reasons = explainStore(s, st);
    }
    st.yesterday = t;
    st.today = emptyDay();
    st.notes = st.notes.filter((n) => s.day - n.day < 3);
  }
  // 店長
  for (const st of s.stores) if (st.company === 0 && st.manager) managerAdjust(s, st, ctx, bonus.managerSkill);
  rivalDaily(s, ctx);
  // 業種の解禁
  checkUnlocks(s);
  // 時価総額
  for (const c of s.companies) if (!c.bankrupt) c.marketCap = computeMarketCap(s, c);
  // 期限の切れた効果
  s.effects = s.effects.filter((e) => e.untilDay > s.day);
  const p = s.companies[0];
  s.history.push({
    day: Math.floor(s.day),
    revenue: p.dailyRevenue[p.dailyRevenue.length - 1] ?? 0,
    profit: p.dailyProfit[p.dailyProfit.length - 1] ?? 0,
    cash: p.cash,
    marketCap: p.marketCap,
    share: playerShare(s),
  });
  if (s.history.length > 400) s.history.shift();
  void opts;
}

export function checkUnlocks(s: GameState) {
  const p = s.companies[0];
  for (const [id, ind] of Object.entries(INDUSTRIES) as [keyof typeof INDUSTRIES, (typeof INDUSTRIES)[keyof typeof INDUSTRIES]][]) {
    if (s.unlocked.includes(id)) continue;
    const u = ind.unlock;
    const count = (i: string) => s.stores.filter((st) => st.company === 0 && st.industry === i && st.buildUntil === null).length;
    if (u.storesOf && count(u.storesOf) < (u.storesCount ?? 0)) continue;
    if (u.factories && count('factory') < u.factories) continue;
    if (u.cumulativeSales && p.cumulativeSales < u.cumulativeSales) continue;
    s.unlocked.push(id);
    if (!p.industries.includes(id)) p.industries.push(id);
    addLog(s, `新しい業種「${ind.name}」が解禁されました！`, 'good');
  }
}

/** 解禁条件の説明（UI用） */
export function unlockText(id: keyof typeof INDUSTRIES): string {
  const u = INDUSTRIES[id].unlock;
  const parts: string[] = [];
  if (u.storesOf) parts.push(`${INDUSTRIES[u.storesOf].shortName}の店を${u.storesCount}つ`);
  if (u.factories) parts.push(`工場を${u.factories}つ`);
  if (u.cumulativeSales) parts.push(`累計売上 ${formatShort(u.cumulativeSales)}`);
  return parts.join('、') || '最初から';
}

function formatShort(n: number) {
  if (n >= 1e8) return `${n / 1e8}億円`;
  return `${n / 1e4}万円`;
}

function startEvent(s: GameState) {
  const candidates = GAME_EVENTS.filter((e) => !e.needs || s.stores.some((st) => st.company === 0 && st.industry === e.needs));
  const playerHasStores = s.stores.some((st) => st.company === 0);
  if (!playerHasStores || candidates.length === 0) {
    scheduleNextEvent(s);
    return;
  }
  const total = candidates.reduce((a, e) => a + e.weight, 0);
  let r = rand(s) * total;
  let ev = candidates[0];
  for (const e of candidates) {
    r -= e.weight;
    if (r <= 0) { ev = e; break; }
  }
  s.pendingEvent = { id: ev.id, autoDay: s.day + (EVENTS.autoResolveMinutes * 60) / TIME.realSecondsPerDay };
  addLog(s, `出来事：${ev.title}`, 'event');
}

export function resolveEvent(s: GameState, choiceIndex: number, auto = false) {
  const pe = s.pendingEvent;
  if (!pe) return;
  const ev = GAME_EVENTS.find((e) => e.id === pe.id);
  s.pendingEvent = null;
  scheduleNextEvent(s);
  if (!ev) return;
  const ch = ev.choices[choiceIndex] ?? ev.choices[ev.safe];
  for (const e of ch.effects) applyEffect(s, e);
  addLog(s, `${ev.title}：「${ch.label}」${auto ? '（自動で選ばれました）' : 'を選びました'}`, 'event');
}

function applyEffect(s: GameState, e: EventEffect) {
  const p = s.companies[0];
  const mine = s.stores.filter((st) => st.company === 0 && isStoreIndustry(st.industry));
  switch (e.type) {
    case 'cash': p.cash += e.amount; break;
    case 'cashPctOfDailySales': p.cash += (p.dailyRevenue[p.dailyRevenue.length - 1] ?? 0) * e.days; break;
    case 'awareness': for (const st of mine) st.awareness = Math.min(1, st.awareness + e.amount); break;
    case 'satisfaction': for (const st of mine) st.satisfaction = Math.max(0, Math.min(1, st.satisfaction + e.amount)); break;
    case 'priceAll':
      for (const st of mine) for (const k of Object.keys(st.prices)) {
        const prod = PRODUCTS.find((x) => x.id === k);
        const step = prod?.priceStep ?? 10;
        st.prices[k] = Math.max(step, Math.round((st.prices[k] * e.mul) / step) * step);
      }
      break;
    default:
      s.effects.push({ effect: e, untilDay: s.day + e.days });
  }
}

/** ゲーム内の日付と時刻 */
export function clock(day: number) {
  const d = Math.floor(day);
  const totalMin = Math.floor((day - d) * 24 * 60);
  const year = Math.floor(d / 360) + 1;
  const month = Math.floor((d % 360) / 30) + 1;
  const date = (d % 30) + 1;
  return { year, month, date, hour: Math.floor(totalMin / 60), minute: totalMin % 60, dayIndex: d };
}

export type { TickContext };
