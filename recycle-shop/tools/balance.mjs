// バランス検証: ボットが数日間プレイして収支の推移を出力する
//   node tools/balance.mjs [days] [url]
import { chromium } from 'playwright-core';

const days = Number(process.argv[2] || 5);
const url = process.argv[3] || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

await page.evaluate(async () => {
  const g = window.__game;
  g.ui.closeAll();
  await g.startGame(g.model.constructor.create('ボット堂'), false);
  g.ui.closeAll();
  g.engine.paused = true; // 描画側の update を止めて手動で進める
  window.__lots = (await import('/src/game/model.ts')).LOTS;
  window.__bot = {
    log: [],
    tick() {
      const m = g.model;
      const s = m.state;
      // 陳列: 空き枠に在庫を並べる (清掃済み扱い・相場の 100%)
      for (const it of [...m.stockItems()]) {
        g.interaction.takeFromStock(it.uid);
        const v = g.interaction.held;
        const slot = g.world.fixtures.filter((f) => f.def.kind === 'display').flatMap((f) => [...f.slots.values()]).find((sl) => sl.fixture.canAccept(sl.def.id, v.def.sizeClass));
        if (!slot) { g.interaction.stashHeld(); continue; }
        it.dirt = 0;
        g.interaction.placeHeld(slot);
        it.price = Math.round(m.value(it) / 10) * 10;
        g.world.view(it.uid)?.refreshTag(true);
      }
      // 買取
      const c = g.customers.appraisalCustomer();
      if (c && c.state === 'waitAppraisal' && !g.ui.modalOpen) {
        g.appraisal.open();
        const a = g.appraisal;
        a.stage.revealAll();
        const it = c.sellItem;
        it.tested = true;
        if (it.mark) it.verdict = Math.random() < 0.85 ? (it.authentic ? 'genuine' : 'fake') : (it.authentic ? 'fake' : 'genuine');
        a.renderSide?.();
        for (const p of [0.4, 0.45, 0.5, 0.55]) {
          if (!g.ui.isOpen(a) || !a.el.querySelector('.offer-btn')) break;
          const kv = a.el.querySelector('.quick .chip');
          const est = window.__game.debug; // eslint-disable-line
          const value = Number(a.el.querySelector('.ap-market .row.big b').textContent.replace(/[^0-9]/g, ''));
          a.offer.set(Math.max(10, Math.round(value * p / 10) * 10));
          a.el.querySelector('.offer-btn').click();
          void kv; void est;
        }
        if (g.ui.isOpen(a)) {
          const st = a.el.querySelector('.to-stock');
          if (st) st.click(); else g.ui.close(a);
        }
      }
      // 会計
      const b = g.customers.buyQueue[0];
      if (b && b.state === 'checkout' && !g.ui.modalOpen) {
        g.checkout.start(b);
        g.checkout.finish(false, 0);
      }
      // 日次
      if (s.phase === 'prep' && !g.ui.modalOpen) {
        // 在庫が少なければまとめ仕入れ
        const LOTS = window.__lots;
        for (const lot of LOTS) if (m.stockItems().length < 6 && s.money > lot.price + 25000) m.buyLot(lot);
        // 余裕があれば棚を増やす
        if (s.money > 90000 && m.stockItems().length > 5) {
          const R = g.world.canPlaceFixture.bind(g.world);
          outer: for (let x = -1; x <= 7; x += 0.5) for (let z = -5.5; z <= 0; z += 0.5) {
            const r = { x0: x - 0.75, x1: x + 0.75, z0: z - 0.3, z1: z + 0.3 };
            if (R(r)) { m.addMoney(-18000, 'bot'); s.today.expenses += 18000; g.world.spawnFixture(m.addFixture({ defId: 'wall_shelf', x, z, rot: 0 })); g.world.rebuildNav(); this.log.push?.call; break outer; }
          }
        }
        g.toggleOpen();
      }
      if (g.ui.top?.el.classList.contains('summary')) {
        const t = s.today;
        this.log.push({ day: s.day, sales: t.sales, buy: t.purchases, exp: t.expenses, profit: t.sales - t.purchases - t.expenses, money: s.money, rep: Math.round(s.reputation), lv: s.level, cust: t.customers, lost: t.lostCustomers, sold: t.sold, bought: t.bought, stock: m.stockItems().length, shelf: m.displayed().length });
        g.ui.top.el.querySelector('.next').click();
        g.ui.closeAll();
      }
    },
  };
});

const t0 = Date.now();
for (;;) {
  const done = await page.evaluate((days) => {
    const g = window.__game;
    for (let i = 0; i < 400; i++) {
      g.update(0.1);
      if (i % 10 === 0) window.__bot.tick();
    }
    return window.__bot.log.length >= days;
  }, days);
  if (done) break;
  if (Date.now() - t0 > 20 * 60 * 1000) { console.log('timeout'); break; }
}
const log = await page.evaluate(() => window.__bot.log);
console.table(log);
console.log('ERRORS', errors.length ? errors.slice(0, 5).join('\n---\n') : 'none');
await browser.close();
