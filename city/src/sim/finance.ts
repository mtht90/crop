// 財務：時価総額・融資・決算
import { ACQUISITION, FINANCE, INDUSTRIES, LAND, START, TIME } from '../config/economy';
import type { IndustryId } from '../config/buildings';
import { lotPrice } from './model';
import { addLog, companyStores } from './world';
import type { Company, GameState, Loan, QuarterReport, Store } from './types';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** 直近 n 日の合計 */
export function recent(arr: number[], n: number, skip = 0): number {
  return sum(arr.slice(Math.max(0, arr.length - n - skip), arr.length - skip));
}

export function storeValue(s: GameState, st: Store): number {
  const land = lotPrice(s, st.lotId);
  const building = st.invested * ACQUISITION.storeBuildingRatio;
  const y = st.yesterday;
  const dailyProfit = y ? y.revenue - y.cogs - y.wages - y.upkeep - y.ads : 0;
  return land + building + Math.max(0, dailyProfit * 360 * ACQUISITION.storeProfitYears);
}

export function debtOf(s: GameState, c: Company): number {
  return c.isPlayer ? sum(s.loans.map((l) => l.remaining)) : 0;
}

/** 純資産：現金 + 土地 + 建物 − 借金 */
export function netAssets(s: GameState, c: Company): number {
  let v = c.cash - debtOf(s, c);
  for (const st of companyStores(s, c.id)) v += lotPrice(s, st.lotId) * LAND.sellRatio + st.invested * 0.5;
  if (c.isPlayer) v += lotPrice(s, s.hqLot) * LAND.sellRatio;
  return v;
}

/** 時価総額 = 純資産 + 年間利益 × 倍率（成長しているほど倍率が高い） */
export function computeMarketCap(s: GameState, c: Company): number {
  const p30 = recent(c.dailyProfit, 30);
  const prev30 = recent(c.dailyProfit, 30, 30);
  const r30 = recent(c.dailyRevenue, 30);
  const prevR30 = recent(c.dailyRevenue, 30, 30);
  const growth = prevR30 > 0 ? (r30 - prevR30) / prevR30 : 0;
  const pe = Math.max(FINANCE.peMin, Math.min(FINANCE.peMax, FINANCE.peBase + growth * FINANCE.peGrowthFactor));
  const annual = (p30 / Math.max(1, Math.min(30, c.dailyProfit.length))) * 360;
  void prev30;
  const na = netAssets(s, c);
  return Math.max(Math.max(0, na) * 0.5, na + Math.max(0, annual) * pe);
}

export function creditLimit(s: GameState): number {
  const c = s.companies[0];
  const limit = Math.max(FINANCE.minCredit, c.marketCap * FINANCE.creditRatio);
  return Math.max(0, limit - debtOf(s, c));
}

export function loanRate(s: GameState): number {
  const overdue = s.loans.some((l) => l.graceUntil !== null);
  const c = s.companies[0];
  const debtRatio = debtOf(s, c) / Math.max(1, c.marketCap);
  return FINANCE.baseRate + Math.min(0.08, debtRatio * 0.05) + (overdue ? 0.05 : 0);
}

export function quarterIndex(day: number) {
  return Math.floor(day / TIME.daysPerQuarter);
}

export function nextQuarterDay(day: number) {
  return (quarterIndex(day) + 1) * TIME.daysPerQuarter;
}

export function addLoan(s: GameState, name: string, amount: number, quarters: number, rate: number): Loan {
  const loan: Loan = {
    id: s.nextId++,
    name,
    principal: amount,
    remaining: amount,
    annualRate: rate,
    quartersLeft: quarters,
    nextDueDay: nextQuarterDay(s.day + 1),
    graceUntil: null,
  };
  s.loans.push(loan);
  s.companies[0].cash += amount;
  return loan;
}

export function loanPayment(l: Loan): { principal: number; interest: number } {
  const principal = l.remaining / Math.max(1, l.quartersLeft);
  const interest = l.remaining * l.annualRate / 4;
  return { principal, interest };
}

/** 返済日の処理。払えなければ延滞（猶予つき） */
export function processLoans(s: GameState, offline: boolean) {
  const c = s.companies[0];
  for (const l of [...s.loans]) {
    if (l.graceUntil === null && s.day < l.nextDueDay) continue;
    if (l.graceUntil !== null && offline) {
      // 留守中は猶予を進めない（戻ってから猶予が始まる）
      l.graceUntil = Math.max(l.graceUntil, s.day + FINANCE.graceDays);
    }
    const { principal, interest } = loanPayment(l);
    const pay = principal + interest;
    if (c.cash >= pay) {
      c.cash -= pay;
      l.remaining -= principal;
      l.quartersLeft -= 1;
      l.nextDueDay += TIME.daysPerQuarter;
      if (l.graceUntil !== null) addLog(s, `延滞していた「${l.name}」を返済しました`, 'good');
      l.graceUntil = null;
      if (l.quartersLeft <= 0 || l.remaining < 1) {
        s.loans = s.loans.filter((x) => x.id !== l.id);
        addLog(s, `「${l.name}」を完済しました`, 'good');
      }
    } else if (l.graceUntil === null) {
      l.graceUntil = s.day + FINANCE.graceDays;
      addLog(s, `「${l.name}」の返済ができず延滞になりました。${FINANCE.graceDays}日以内に返さないと倒産します`, 'bad');
    } else if (s.day >= l.graceUntil) {
      s.gameOver = { day: s.day, reason: `「${l.name}」を返済できず、倒産しました` };
      addLog(s, s.gameOver.reason, 'bad');
    }
  }
}

/** 返済を手動で前倒しする */
export function repayLoan(s: GameState, loanId: number, amount: number): boolean {
  const l = s.loans.find((x) => x.id === loanId);
  const c = s.companies[0];
  if (!l || amount <= 0) return false;
  const pay = Math.min(amount, l.remaining, c.cash);
  if (pay <= 0) return false;
  c.cash -= pay;
  l.remaining -= pay;
  if (l.remaining < 1) {
    s.loans = s.loans.filter((x) => x.id !== l.id);
    addLog(s, `「${l.name}」を完済しました`, 'good');
  }
  return true;
}

/** 業種ごとのシェア（直近7日の売上） */
export function marketShares(s: GameState): Record<'food' | 'retail', Map<number, number>> {
  const out = { food: new Map<number, number>(), retail: new Map<number, number>() };
  for (const st of s.stores) {
    if (st.industry !== 'food' && st.industry !== 'retail') continue;
    const r = (st.yesterday?.revenue ?? 0) + st.today.revenue;
    out[st.industry].set(st.company, (out[st.industry].get(st.company) ?? 0) + r);
  }
  return out;
}

export function playerShare(s: GameState): Partial<Record<IndustryId, number>> {
  const ms = marketShares(s);
  const res: Partial<Record<IndustryId, number>> = {};
  for (const k of ['food', 'retail'] as const) {
    let total = 0;
    for (const v of ms[k].values()) total += v;
    if (total > 0) res[k] = (ms[k].get(0) ?? 0) / total;
  }
  return res;
}

/** 四半期決算 */
export function closeQuarter(s: GameState) {
  const c = s.companies[0];
  const q = quarterIndex(s.day) - 1;
  const startDay = q * TIME.daysPerQuarter;
  const days = TIME.daysPerQuarter;
  const revenue = recent(c.dailyRevenue, days);
  // 税は毎日差し引いているので、dailyProfit は税引き後
  const profit = recent(c.dailyProfit, days);
  const preTax = profit / (1 - FINANCE.taxRate);
  const tax = Math.max(0, preTax - profit);
  const report: QuarterReport = {
    quarter: q + 1,
    startDay,
    endDay: startDay + days,
    revenue,
    costs: revenue - preTax,
    tax,
    profit,
    cash: c.cash,
    marketCap: c.marketCap,
    share: playerShare(s),
    stores: companyStores(s, 0).length,
  };
  s.reports.push(report);
  addLog(s, `第${report.quarter}四半期の決算：売上 ${Math.round(revenue / 10_000).toLocaleString('ja-JP')}万円`, 'info');
}

export function canIpo(s: GameState): boolean {
  return !s.ipo.done && s.companies[0].marketCap >= FINANCE.ipoMarketCap;
}

export function doIpo(s: GameState): number {
  const c = s.companies[0];
  if (!canIpo(s)) return 0;
  const raised = Math.round(c.marketCap * FINANCE.ipoFloat);
  c.cash += raised;
  s.ipo = { done: true, day: s.day };
  addLog(s, `上場しました！ ${Math.round(raised / 1e8).toLocaleString('ja-JP')}億円を調達しました`, 'good');
  return raised;
}

export function industryBuildCost(industry: IndustryId, level: number) {
  return INDUSTRIES[industry].levels[level - 1].cost;
}

export { START };
