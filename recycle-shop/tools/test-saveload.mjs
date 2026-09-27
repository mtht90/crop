import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const before = await page.evaluate(async () => {
  const g = window.__game; g.ui.closeAll();
  await g.startGame(g.model.constructor.create('保存堂'), false); g.ui.closeAll();
  for (const it of [...g.model.stockItems()]) {
    g.interaction.takeFromStock(it.uid);
    const slot = g.world.fixtures.filter((f) => f.def.kind === 'display').flatMap((f) => [...f.slots.values()]).find((s) => s.fixture.canAccept(s.def.id, g.interaction.held.def.sizeClass));
    if (slot) { g.interaction.placeHeld(slot); it.price = 1234; } else g.interaction.stashHeld();
  }
  g.save(false);
  return { displayed: g.model.displayed().length, views: g.world.itemViews.size };
});
await page.reload();
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const after = await page.evaluate(async () => {
  const g = window.__game;
  g.ui.root.querySelector('.cont').click();
  await new Promise((r) => setTimeout(r, 300));
  return { displayed: g.model.displayed().length, views: g.world.itemViews.size, priced: g.model.displayed().filter((i) => i.price === 1234).length };
});
console.log(JSON.stringify(before), '->', JSON.stringify(after));
await browser.close();
