// バランス確認用：ボットが遊んだときの進み方を、画面なしで早送りして表示する。
// 使い方: npx tsx scripts/balance.ts [日数]
import { newGame, advance, clock } from '../src/sim/engine';
import * as A from '../src/sim/actions';
import { lotPrice, playerCanBuyLot, catchment, layout, makeContext } from '../src/sim/model';
import { managerAdjust } from '../src/sim/ai';
import { loanPayment } from '../src/sim/finance';
import { INDUSTRIES, FINANCE } from '../src/config/economy';
import { RESEARCH } from '../src/config/research';
import type { GameState } from '../src/sim/types';

const days = Number(process.argv[2] ?? 120);
const s: GameState = newGame(0, 12345);
const fmt = (n: number) => (Math.abs(n) >= 1e8 ? (n / 1e8).toFixed(2) + '億' : Math.round(n / 1e4) + '万');

function bot(s: GameState) {
  const p = s.companies[0];
  // 研究
  if (!s.research.current) {
    for (const r of RESEARCH) if (!A.canResearch(s, r.id) && p.cash > r.cost * 4) { A.startResearch(s, r.id); break; }
  }
  // 出店：一番人通りの多い買える区画
  const mineCount = (i: string) => s.stores.filter((x) => x.company === 0 && x.industry === i).length;
  const want: Record<string, number> = { food: 1, retail: 1, factory: 0.25, logistics: 0.15, it: 0.15 };
  const order = (['it', 'logistics', 'factory', 'retail', 'food'] as const).filter((i) => s.unlocked.includes(i)).sort((a, b) => mineCount(a) / want[a] - mineCount(b) / want[b]);
  for (const ind of order.slice(0, 1)) {
    const cost = INDUSTRIES[ind].levels[0].cost;
    const lots = layout.lots.map((l) => l.id).filter((id) => playerCanBuyLot(s, id)).sort((a, b) => catchment[b] - catchment[a]);
    const lot = lots[0];
    if (lot === undefined) continue;
    const need = lotPrice(s, lot) + cost;
    const reserve = s.loans.reduce((a, l) => { const x = loanPayment(l); return a + x.principal + x.interest; }, 0) * 1.2 + 3_000_000;
    if (p.cash - need > reserve) {
      A.buyLot(s, lot);
      A.build(s, lot, ind);
      break;
    }
  }
  const ctx = makeContext(s);
  for (const st of s.stores.filter((x) => x.company === 0)) {
    if (!st.manager) managerAdjust(s, st, ctx, 1); // 手動で価格と人数を調整したことにする
    if (A.setManager(s, st.id, true).ok === false) { /* 研究前 */ }
    if (st.adsPerDay === 0 && (st.industry === 'food' || st.industry === 'retail')) A.setAds(s, st.id, 30_000);
    const next = INDUSTRIES[st.industry].levels[st.level];
    if (next && st.buildUntil === null && p.cash > next.cost * 1.3) A.upgrade(s, st.id);
  }
  if (!s.ipo.done && p.marketCap >= FINANCE.ipoMarketCap) A.ipo(s);
}

let lastPrint = -1;
const seen = new Set<string>();
for (let h = 0; h < days * 24; h++) {
  advance(s, 1 / 24);
  if (h % 6 === 0) bot(s);
  const d = Math.floor(s.day);
  if (d % 10 === 0 && d !== lastPrint) {
    lastPrint = d;
    const p = s.companies[0];
    const mine = s.stores.filter((x) => x.company === 0);
    const c = clock(s.day);
    console.log(`day ${String(d).padStart(3)} (Y${c.year}/${c.month}/${c.date}) cash ${fmt(p.cash).padStart(9)} sales/day ${fmt(p.dailyRevenue.at(-1) ?? 0).padStart(8)} profit/day ${fmt(p.dailyProfit.at(-1) ?? 0).padStart(8)} cum ${fmt(p.cumulativeSales).padStart(9)} cap ${fmt(p.marketCap).padStart(9)} stores ${mine.map((x) => x.industry[0] + x.level).join('')} unlocked ${s.unlocked.join(',')} rivals ${s.companies.filter((x) => !x.isPlayer && !x.bankrupt).length}/${s.stores.filter(x=>x.company!==0).length} loans ${fmt(s.loans.reduce((a, l) => a + l.remaining, 0))} res ${s.research.done.length} ipo ${s.ipo.done}${s.gameOver ? ' GAMEOVER ' + s.gameOver.reason : ''}`);
  }
  for (const u of s.unlocked) if (!seen.has(u)) { seen.add(u); console.log(`  >> unlock ${u} at day ${Math.floor(s.day)} (real ${(s.day/24).toFixed(1)}d)`); }
  if (s.ipo.done && !seen.has('ipo')) { seen.add('ipo'); console.log(`  >> IPO at day ${Math.floor(s.day)} (real ${(s.day/24).toFixed(1)}d)`); }
  if (s.gameOver) break;
}
const st0 = s.stores.find((x) => x.company === 0 && x.industry === 'food');
if (st0) console.log('sample store', st0.level, st0.staff, st0.prices, st0.awareness.toFixed(2), st0.satisfaction.toFixed(2), st0.yesterday && { cust: Math.round(st0.yesterday.customers), lost: Math.round(st0.yesterday.lost), rev: fmt(st0.yesterday.revenue) }, st0.reasons);
