// 自動プレイテスト: 一日の流れ (陳列 → 値付け → 開店 → 買取 → 会計 → 閉店) を API 経由で進め、スクリーンショットを撮る
//   node tools/playtest.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || '/tmp/playtest';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const ev = (fn, arg) => page.evaluate(fn, arg);
/** ゲームを描画せずに sec 秒ぶん進める */
const sim = (sec, step = 0.05) => ev(([sec, step]) => { const g = window.__game; for (let t = 0; t < sec; t += step) g.update(step); }, [sec, step]);

await shot('01-title');
await ev(async () => {
  const g = window.__game;
  g.ui.closeAll();
  await g.startGame(g.model.constructor.create('テスト堂'), false);
  g.ui.closeAll();
});
await sim(0.5);
// 在庫を陳列して値付け
const placed = await ev(() => {
  const g = window.__game;
  let n = 0;
  for (const it of [...g.model.stockItems()]) {
    g.interaction.takeFromStock(it.uid);
    const slot = g.world.fixtures.filter((f) => f.def.kind === 'display').flatMap((f) => [...f.slots.values()]).find((s) => s.fixture.canAccept(s.def.id, g.interaction.held.def.sizeClass));
    if (slot && g.interaction.placeHeld(slot)) { n++; it.price = Math.round(g.model.value(it) / 10) * 10; g.world.view(it.uid).refreshTag(true); }
    else g.interaction.stashHeld();
  }
  g.model.checkObjectives();
  return n;
});
console.log('placed', placed);
await ev(() => window.__game.debug().teleport(1.5, 1.5, 0.35, -0.25));
await sim(0.2);
await shot('02-shelves');
await ev(() => window.__game.debug().teleport(-1.2, -3.2, 0.2, -0.35));
await sim(0.2);
await shot('03-shelves-close');

// 開店
await ev(() => { window.__game.toggleOpen(); window.__game.debug().spawn('seller', 'elder'); window.__game.debug().spawn('buyer', 'homemaker'); window.__game.debug().spawn('buyer', 'collector'); });
await sim(12);
console.log(await ev(() => window.__game.customers.debugSummary()));
await ev(() => window.__game.debug().teleport(0, 4.5, 0, -0.1));
await sim(0.1);
await shot('04-customers');

// 買取査定 (客がカウンターに着くまで待つ)
for (let i = 0; i < 20 && !(await ev(() => !!window.__game.customers.appraisalCustomer())); i++) await sim(2);
const ap = await ev(() => { const g = window.__game; const c = g.customers.appraisalCustomer(); if (!c) return 'no seller ready: ' + g.customers.debugSummary().join(' | '); g.debug().teleport(-5.8, 2.5, -Math.PI / 2, -0.3); g.appraisal.open(); return 'open'; });
console.log('appraisal', ap);
await sim(0.5);
await shot('05-appraisal');
// 傷を全部見つけて、推定価格の 45% を提示
const deal = await ev(() => {
  const g = window.__game;
  if (!g.ui.isOpen(g.appraisal)) return 'not open';
  g.appraisal.stage.revealAll();
  const btn = g.appraisal.el.querySelector('.tool');
  if (btn && btn.textContent.includes('通電')) btn.click();
  const res = [];
  for (let i = 0; i < 6 && g.ui.isOpen(g.appraisal) && g.appraisal.el.querySelector('.offer-btn'); i++) {
    const chips = g.appraisal.el.querySelectorAll('.quick .chip');
    chips[Math.min(i + 1, chips.length - 1)].click();
    g.appraisal.el.querySelector('.offer-btn').click();
    res.push(g.appraisal.el.querySelector('.ap-log')?.lastElementChild?.textContent);
  }
  return res;
});
console.log('deal', deal);
await shot('06-appraisal-result');
await ev(() => { const g = window.__game; g.ui.closeAll(); });

// 会計 (レジに客が来るまで待つ)
for (let i = 0; i < 40 && !(await ev(() => window.__game.customers.buyQueue[0]?.state === 'checkout')); i++) await sim(2);
console.log(await ev(() => window.__game.customers.debugSummary()));
const co = await ev(() => { const g = window.__game; const c = g.customers.buyQueue[0]; if (!c || c.state !== 'checkout') return 'no buyer at register: ' + g.customers.debugSummary().join(' | '); g.debug().teleport(5.8, 2.6, Math.PI / 2, -0.25); g.checkout.openIfReady(); return 'open'; });
console.log('checkout', co);
await sim(0.2);
await shot('07-checkout');
const pay = await ev(() => {
  const g = window.__game;
  if (!g.ui.isOpen(g.checkout)) return 'closed';
  const el = g.checkout.el;
  for (let i = 0; i < 10; i++) { const b = el.querySelector('.co-item:not(.scanned)'); if (!b) break; b.click(); }
  const ok = el.querySelector('.co-haggle .ok'); if (ok) ok.click();
  const phase = el.querySelector('.co-drawer') ? 'cash' : el.querySelector('.co-terminal') ? 'card' : 'other';
  return phase;
});
console.log('pay', pay);
await shot('08-payment');
const paid = await ev(() => {
  const g = window.__game; const cu = g.checkout;
  if (!g.ui.isOpen(cu)) return 'closed';
  const total = cu.total();
  if (cu.el.querySelector('.co-drawer')) {
    let need = cu.tendered - total;
    for (const d of [10000, 5000, 1000, 500, 100, 50, 10, 5, 1]) while (need >= d) { cu.el.querySelector(`.d${d}`).click(); need -= d; }
    cu.el.querySelector('.give').click();
  } else {
    for (const ch of String(total)) [...cu.el.querySelectorAll('.key')].find((k) => k.textContent === ch).click();
    [...cu.el.querySelectorAll('.key')].find((k) => k.textContent === '決済').click();
  }
  return { open: g.ui.isOpen(cu), money: g.model.state.money, sold: g.model.state.stats.itemsSold };
});
console.log('paid', paid);

// 作業台
const ws = await ev(() => {
  const g = window.__game;
  const it = g.model.stockItems()[0] || g.model.state.items.find((i) => i.loc.type === 'counter');
  if (!it) return 'nothing';
  if (it.loc.type === 'counter') { const v = g.world.view(it.uid); g.interaction.pickUp(v); } else g.interaction.takeFromStock(it.uid);
  g.interaction.placeHeld(g.world.benchSlot());
  it.dirt = 0.8;
  g.debug().teleport(-4.1, -3.7, 0, -0.5);
  g.workshop.open();
  return 'open ' + it.defId;
});
console.log('workshop', ws);
await sim(0.3);
await shot('09-workshop');
await ev(() => window.__game.ui.closeAll());

// PC
await ev(() => { window.__game.terminal.open('market'); });
await sim(0.2);
await shot('10-terminal-market');
await ev(() => { const g = window.__game; g.ui.closeAll(); g.terminal.open('fixtures'); });
await shot('11-terminal-fixtures');
await ev(() => window.__game.ui.closeAll());

// 閉店まで早送り
await ev(() => window.__game.debug().setMinute(18 * 60 + 50));
await sim(40, 0.1);
await shot('12-evening');
await sim(120, 0.25);
const sum = await ev(() => { const g = window.__game; return { phase: g.model.state.phase, top: g.ui.top?.el.className, today: g.model.state.today }; });
console.log('summary', JSON.stringify(sum));
await shot('13-summary');

console.log('ERRORS', errors.length ? errors.join('\n---\n') : 'none');
await browser.close();
