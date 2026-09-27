import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.argv[2] || 'http://localhost:5173/');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const r = await page.evaluate(async () => {
  const g = window.__game;
  g.ui.closeAll();
  await g.startGame(g.model.constructor.create('依頼堂'), false);
  g.ui.closeAll();
  g.engine.paused = true;
  const m = g.model;
  const it = m.stockItems().find((i) => i.defId === 'pot_a');
  it.condition = 95; it.dirt = 0; it.defects = [];
  m.requests().push({ id: 'rq1', customerName: '依頼 太郎さん', archetype: 'homemaker', defId: 'pot_a', minGrade: 'B', budget: 3000, deadline: m.state.day + 2, status: 'open' });
  const moneyBefore = m.state.money;
  g.toggleOpen();
  let arrived = false;
  for (let i = 0; i < 4000; i++) {
    g.update(0.1);
    const c = g.customers.list.find((x) => x.requestId === 'rq1');
    if (c) arrived = true;
    const b = g.customers.buyQueue[0];
    if (b && b.state === 'checkout') { g.checkout.start(b); g.checkout.finish(false, 0); }
    if (m.requests()[0].status === 'done') break;
  }
  return { arrived, status: m.requests()[0]?.status, gained: m.state.money - moneyBefore, minute: Math.round(m.state.minute), rep: m.state.reputation };
});
console.log(JSON.stringify(r), 'errors:', errs.length ? errs : 'none');
await browser.close();
