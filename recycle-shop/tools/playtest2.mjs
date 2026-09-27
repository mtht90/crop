// 見た目の確認用シナリオ: 客の表示・偽物鑑定・建築モード・夜景・セーブ/ロード
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || '/tmp/playtest2';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const sim = (sec, step = 0.05) => ev(([sec, step]) => { const g = window.__game; for (let t = 0; t < sec; t += step) g.update(step); }, [sec, step]);

await ev(async () => {
  const g = window.__game;
  g.ui.closeAll();
  const m = g.model.constructor.create('ふくろう堂');
  m.state.level = 4;
  m.state.money = 400000;
  await g.startGame(m, false);
  g.ui.closeAll();
  for (const it of [...g.model.stockItems()]) {
    g.interaction.takeFromStock(it.uid);
    const slot = g.world.fixtures.filter((f) => f.def.kind === 'display').flatMap((f) => [...f.slots.values()]).find((s) => s.fixture.canAccept(s.def.id, g.interaction.held.def.sizeClass));
    if (slot && g.interaction.placeHeld(slot)) { it.price = Math.round(g.model.value(it) * 0.9 / 10) * 10; g.world.view(it.uid).refreshTag(true); } else g.interaction.stashHeld();
  }
  g.toggleOpen();
  for (let i = 0; i < 5; i++) g.customers.spawn('buyer');
});
await sim(22);
await ev(() => window.__game.debug().teleport(3.2, 3.2, 0.55, -0.12));
await sim(0.1);
await shot('01-customers-inside');
await ev(() => window.__game.debug().teleport(-1.5, 5.3, -2.6, -0.05));
await sim(0.1);
await shot('02-customers-2');

// 偽物の腕時計を持った怪しい客
await ev(() => {
  const g = window.__game;
  const c = g.customers.spawn('seller', 'shady');
  const defs = g.model.constructor;
  c.sellItem = null;
  return c.name;
});
await ev(() => {
  // 持ち込み品を偽物の腕時計に差し替え
  const g = window.__game;
  const c = g.customers.list.find((x) => x.arch.id === 'shady');
  const it = g.model.rollSellItem({ careful: 0.9, fakeRate: 1, fav: ['brand'], flyer: false });
  c.sellItem = it;
});
// 腕時計が出るまで引き直し
await ev(() => {
  const g = window.__game;
  const c = g.customers.list.find((x) => x.arch.id === 'shady');
  for (let i = 0; i < 400 && c.sellItem.defId !== 'watch'; i++) c.sellItem = g.model.rollSellItem({ careful: 0.9, fakeRate: 1, fav: ['brand'], flyer: false });
  return c.sellItem.defId;
});
for (let i = 0; i < 20 && !(await ev(() => window.__game.customers.appraisalCustomer()?.arch.id === 'shady')); i++) {
  await sim(2);
  // 先客がいれば断って帰す
  await ev(() => { const g = window.__game; const c = g.customers.appraisalCustomer(); if (c && c.arch.id !== 'shady') g.customers.finishAppraisal(c, 'declined'); });
}
await ev(() => { const g = window.__game; g.debug().teleport(-5.8, 2.5, -Math.PI / 2, -0.3); });
await sim(0.1);
await shot('03-counter-with-watch');
await ev(() => { const g = window.__game; g.appraisal.open(); });
await sim(0.3);
await ev(() => { const g = window.__game; [...g.appraisal.el.querySelectorAll('.tool')].find((b) => b.textContent.includes('ルーペ'))?.click(); });
await sim(0.3);
await shot('04-loupe');
await ev(() => { const g = window.__game; g.appraisal.el.querySelector('.v-fake')?.click(); g.appraisal.el.querySelector('.decline-btn')?.click(); });
console.log('fakes caught', await ev(() => window.__game.model.state.stats.fakesCaught));

// 建築モード
await ev(() => { const g = window.__game; g.ui.closeAll(); g.debug().teleport(4, -0.2, Math.PI * 0.85, -0.55); g.build.startNew('showcase'); });
await sim(0.2);
await shot('05-build-ghost');
await ev(() => { const g = window.__game; g.build.cancel(); });

// 夜の外観
await ev(() => { const g = window.__game; g.debug().setMinute(20 * 60); g.debug().teleport(1, 11.5, 0, 0.12); });
await sim(0.3, 0.1);
await shot('06-night-outside');

// セーブ → リロード → つづきから
const before = await ev(() => { const g = window.__game; g.save(false); return { money: g.model.state.money, items: g.model.state.items.length, fixtures: g.model.state.fixtures.length, name: g.model.state.shopName }; });
await page.reload();
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await shot('07-title-continue');
const after = await ev(async () => {
  const g = window.__game;
  g.ui.root.querySelector('.cont')?.click();
  await new Promise((r) => setTimeout(r, 500));
  return { money: g.model.state.money, items: g.model.state.items.length, fixtures: g.model.state.fixtures.length, name: g.model.state.shopName, placed: g.world.itemViews.size };
});
console.log('save/load', JSON.stringify(before), '->', JSON.stringify(after));

console.log('ERRORS', errors.length ? errors.join('\n---\n') : 'none');
await browser.close();
