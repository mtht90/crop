// プレイヤーの操作。どれも { ok, msg } を返す。
import type { IndustryId } from '../config/buildings';
import { ACQUISITION, FINANCE, INDUSTRIES, LAND, QUALITY, STORE } from '../config/economy';
import { productById } from '../config/products';
import { researchById } from '../config/research';
import { addLoan, creditLimit, doIpo, loanRate, repayLoan, storeValue } from './finance';
import { isStoreIndustry, lotPrice, playerCanBuyLot, qualityCapFor, researchBonuses } from './model';
import { addLog, companyStores, createStore, minutesToDays, PLAYER, removeStore } from './world';
import type { GameState } from './types';

export interface Result {
  ok: boolean;
  msg: string;
}
const fail = (msg: string): Result => ({ ok: false, msg });
const ok = (msg: string): Result => ({ ok: true, msg });

function pay(s: GameState, amount: number): boolean {
  const p = s.companies[PLAYER];
  if (p.cash < amount) return false;
  p.cash -= amount;
  return true;
}

export function buyLot(s: GameState, lotId: number): Result {
  if (!playerCanBuyLot(s, lotId)) return fail('この区画はまだ買えません');
  const price = lotPrice(s, lotId);
  if (!pay(s, price)) return fail('資金が足りません');
  s.lotOwner[lotId] = PLAYER;
  return ok('区画を買いました');
}

export function sellLot(s: GameState, lotId: number): Result {
  if (s.lotOwner[lotId] !== PLAYER || lotId === s.hqLot) return fail('売れない区画です');
  if (s.stores.some((st) => st.lotId === lotId)) return fail('建物があるので売れません');
  s.lotOwner[lotId] = -1;
  s.companies[PLAYER].cash += lotPrice(s, lotId) * LAND.sellRatio;
  return ok('区画を売りました');
}

export function build(s: GameState, lotId: number, industry: IndustryId): Result {
  if (s.lotOwner[lotId] !== PLAYER || lotId === s.hqLot) return fail('自社の空き区画に建ててください');
  if (s.stores.some((st) => st.lotId === lotId)) return fail('すでに建物があります');
  if (!s.unlocked.includes(industry)) return fail('まだ解禁されていない業種です');
  const cost = INDUSTRIES[industry].levels[0].cost;
  if (!pay(s, cost)) return fail('資金が足りません');
  createStore(s, PLAYER, lotId, industry);
  return ok('建設を始めました');
}

export function upgrade(s: GameState, storeId: number): Result {
  const st = s.stores.find((x) => x.id === storeId && x.company === PLAYER);
  if (!st || st.buildUntil !== null) return fail('今は建て替えられません');
  const next = INDUSTRIES[st.industry].levels[st.level];
  if (!next) return fail('これ以上大きくできません');
  if (!pay(s, next.cost)) return fail('資金が足りません');
  st.upgradeTo = st.level + 1;
  st.buildUntil = s.day + minutesToDays(next.buildMinutes);
  st.invested += next.cost;
  return ok('建て替えを始めました（工事中は営業しません）');
}

export function demolish(s: GameState, storeId: number): Result {
  const st = s.stores.find((x) => x.id === storeId && x.company === PLAYER);
  if (!st) return fail('見つかりません');
  s.companies[PLAYER].cash += st.invested * STORE.demolishRefund;
  removeStore(s, st, false);
  return ok('建物を取り壊しました（区画は残ります）');
}

export function setPrice(s: GameState, storeId: number, productId: string, price: number): Result {
  const st = s.stores.find((x) => x.id === storeId && x.company === PLAYER);
  const p = productById.get(productId);
  if (!st || !p) return fail('見つかりません');
  st.prices[productId] = Math.max(p.priceStep, Math.round(price / p.priceStep) * p.priceStep);
  return ok('');
}

export function setAds(s: GameState, storeId: number, perDay: number): Result {
  const st = s.stores.find((x) => x.id === storeId && x.company === PLAYER);
  if (!st) return fail('見つかりません');
  st.adsPerDay = Math.max(0, Math.round(perDay));
  return ok('');
}

export function setStaff(s: GameState, storeId: number, staff: number): Result {
  const st = s.stores.find((x) => x.id === storeId && x.company === PLAYER);
  if (!st) return fail('見つかりません');
  const max = INDUSTRIES[st.industry].maxStaff[st.level - 1];
  const n = Math.max(1, Math.min(max, Math.round(staff)));
  const diff = Math.abs(n - st.staff);
  if (!pay(s, diff * STORE.hireCost)) return fail('資金が足りません');
  st.staff = n;
  return ok('');
}

export function trainStaff(s: GameState, storeId: number): Result {
  const st = s.stores.find((x) => x.id === storeId && x.company === PLAYER);
  if (!st) return fail('見つかりません');
  if (st.training >= STORE.maxTraining) return fail('これ以上は研修できません');
  const cost = st.staff * INDUSTRIES[st.industry].trainingCostPerStaff * (st.training + 1);
  if (!pay(s, cost)) return fail('資金が足りません');
  st.training++;
  return ok(`研修レベルが${st.training}になりました`);
}

export function trainingCost(s: GameState, storeId: number): number {
  const st = s.stores.find((x) => x.id === storeId);
  if (!st) return 0;
  return st.staff * INDUSTRIES[st.industry].trainingCostPerStaff * (st.training + 1);
}

export function setManager(s: GameState, storeId: number, on: boolean): Result {
  const st = s.stores.find((x) => x.id === storeId && x.company === PLAYER);
  if (!st) return fail('見つかりません');
  if (on && !researchBonuses(s).manager) return fail('研究「店長制度」が必要です');
  st.manager = on;
  return ok(on ? '店長を置きました' : '店長を外しました');
}

export function qualityInvestCost(s: GameState, productId: string, points = 1): number {
  const q = s.companies[PLAYER].quality[productId] ?? QUALITY.start;
  let c = 0;
  for (let i = 0; i < points; i++) c += QUALITY.investPerPoint * (q + i);
  return c;
}

export function investQuality(s: GameState, productId: string, points: number): Result {
  const p = productById.get(productId);
  if (!p) return fail('見つかりません');
  const comp = s.companies[PLAYER];
  const cap = qualityCapFor(s, PLAYER, p.industry);
  const cur = comp.quality[productId] ?? QUALITY.start;
  const n = Math.min(points, Math.floor(cap - cur));
  if (n <= 0) return fail('品質の上限です。研究で上限を上げてください');
  if (!pay(s, qualityInvestCost(s, productId, n))) return fail('資金が足りません');
  comp.quality[productId] = cur + n;
  return ok(`${p.name}の品質が${cur + n}になりました`);
}

export function canResearch(s: GameState, id: string): string | null {
  const r = researchById.get(id);
  if (!r) return '見つかりません';
  if (s.research.done.includes(id)) return '研究済み';
  if (r.industry && !s.unlocked.includes(r.industry)) return `${INDUSTRIES[r.industry].shortName}の解禁が必要`;
  const missing = r.requires.filter((x) => !s.research.done.includes(x));
  if (missing.length) return `先に「${missing.map((m) => researchById.get(m)?.name).join('」「')}」が必要`;
  return null;
}

export function startResearch(s: GameState, id: string): Result {
  if (s.research.current) return fail('研究は1つずつしか進められません');
  const why = canResearch(s, id);
  if (why) return fail(why);
  const r = researchById.get(id)!;
  if (!pay(s, r.cost)) return fail('資金が足りません');
  s.research.current = { id, progressDays: 0 };
  return ok(`研究「${r.name}」を始めました`);
}

export function cancelResearch(s: GameState): Result {
  const cur = s.research.current;
  if (!cur) return fail('研究していません');
  const r = researchById.get(cur.id);
  s.research.current = null;
  if (r) s.companies[PLAYER].cash += r.cost * 0.5;
  return ok('研究を中止しました（費用の半分が戻ります）');
}

export function borrow(s: GameState, amount: number, quarters: number): Result {
  const limit = creditLimit(s);
  if (amount <= 0) return fail('金額を入れてください');
  if (amount > limit) return fail('借りられる額を超えています');
  const rate = loanRate(s);
  addLoan(s, `銀行融資（${quarters / 4}年）`, amount, quarters, rate);
  addLog(s, `銀行から借りました（年利${(rate * 100).toFixed(1)}%）`, 'info');
  return ok('借りました');
}

export function repay(s: GameState, loanId: number, amount: number): Result {
  return repayLoan(s, loanId, amount) ? ok('返済しました') : fail('返済できません');
}

export function storePrice(s: GameState, storeId: number): number {
  const st = s.stores.find((x) => x.id === storeId);
  return st ? Math.round(storeValue(s, st) * ACQUISITION.storePremium) : 0;
}

export function acquireStore(s: GameState, storeId: number): Result {
  const st = s.stores.find((x) => x.id === storeId);
  if (!st || st.company === PLAYER) return fail('買収できません');
  const seller = s.companies[st.company];
  if (companyStores(s, seller.id).length <= 1) return fail('最後の1店は売ってくれません。会社ごと買収してください');
  if (!s.unlocked.includes(st.industry)) return fail('この業種はまだ解禁されていません');
  const price = storePrice(s, storeId);
  if (!pay(s, price)) return fail('資金が足りません');
  seller.cash += price;
  st.company = PLAYER;
  s.lotOwner[st.lotId] = PLAYER;
  st.manager = false;
  st.adsPerDay = 0;
  st.invested = price;
  addLog(s, `${seller.name}の店を買収しました`, 'good');
  return ok('店を買収しました');
}

export function sharePrice(s: GameState, companyId: number): number {
  const c = s.companies[companyId];
  const steps = Math.round(c.playerShares / ACQUISITION.shareStep);
  return Math.round(Math.max(10_000_000, c.marketCap) * ACQUISITION.shareStep * (ACQUISITION.sharePremiumBase + steps * ACQUISITION.sharePremiumPerStep));
}

export function buyShares(s: GameState, companyId: number): Result {
  const c = s.companies[companyId];
  if (!c || c.isPlayer || c.bankrupt) return fail('買えません');
  const price = sharePrice(s, companyId);
  if (!pay(s, price)) return fail('資金が足りません');
  c.playerShares = Math.min(1, c.playerShares + ACQUISITION.shareStep);
  c.cash += price * 0.3; // 新株の一部は会社の資金になる
  if (c.playerShares > ACQUISITION.controlShare) {
    // 会社ごと手に入る
    for (const st of companyStores(s, c.id)) {
      st.company = PLAYER;
      s.lotOwner[st.lotId] = PLAYER;
      st.manager = false;
      if (!s.unlocked.includes(st.industry)) s.unlocked.push(st.industry);
    }
    s.companies[PLAYER].cash += Math.max(0, c.cash);
    c.cash = 0;
    c.bankrupt = true;
    // ブランド（品質）が上なら引き継ぐ
    const pq = s.companies[PLAYER].quality;
    for (const [k, v] of Object.entries(c.quality)) pq[k] = Math.max(pq[k] ?? 0, Math.min(v, qualityCapFor(s, PLAYER, productById.get(k)!.industry)));
    addLog(s, `${c.name}を買収し、子会社にしました！店とブランドがすべて手に入りました`, 'good');
    return ok(`${c.name}を買収しました`);
  }
  return ok(`${c.name}の株を${Math.round(c.playerShares * 100)}%持っています`);
}

export function ipo(s: GameState): Result {
  const raised = doIpo(s);
  return raised ? ok('上場しました') : fail(`時価総額が${FINANCE.ipoMarketCap / 1e8}億円を超えると上場できます`);
}

export function storeIsSellable(industry: IndustryId) {
  return isStoreIndustry(industry);
}
