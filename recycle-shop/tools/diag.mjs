import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const r = await page.evaluate(async () => {
  const g = window.__game;
  g.ui.closeAll();
  await g.startGame(g.model.constructor.create('診断堂'), false);
  g.ui.closeAll();
  g.engine.paused = true;
  for (const it of [...g.model.stockItems()]) {
    g.interaction.takeFromStock(it.uid);
    const slot = g.world.fixtures.filter((f) => f.def.kind === 'display').flatMap((f) => [...f.slots.values()]).find((s) => s.fixture.canAccept(s.def.id, g.interaction.held.def.sizeClass));
    if (slot) { g.interaction.placeHeld(slot); it.price = Math.round(g.model.value(it)); g.world.view(it.uid).refreshTag(true); } else g.interaction.stashHeld();
  }
  g.toggleOpen();
  const out = [];
  const life = new Map();
  let spawned = 0;
  const orig = g.customers.spawn.bind(g.customers);
  g.customers.spawn = (...a) => { const c = orig(...a); if (c) { spawned++; life.set(c.id, { t0: g.model.state.minute, states: {} }); } return c; };
  let last = g.model.state.minute;
  for (let i = 0; i < 6000; i++) {
    g.update(0.1);
    for (const c of g.customers.list) { const l = life.get(c.id); if (l) l.states[c.state] = (l.states[c.state] || 0) + 0.1; }
    // 会計・買取を即処理
    const b = g.customers.buyQueue[0]; if (b && b.state === 'checkout') { g.checkout.start(b); g.checkout.finish(false, 0); }
    const s = g.customers.appraisalCustomer(); if (s && s.state === 'waitAppraisal') g.customers.finishAppraisal(s, 'declined');
    if (g.model.state.minute - last >= 60) { last = g.model.state.minute; out.push(`${Math.floor(last/60)}h n=${g.customers.list.length} ` + g.customers.list.map(c=>c.state).join(',')); }
    if (g.model.state.phase !== 'open') break;
  }
  const avg = {};
  for (const l of life.values()) for (const [k, v] of Object.entries(l.states)) avg[k] = (avg[k] || 0) + v / life.size;
  return { spawned, out, avg };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
