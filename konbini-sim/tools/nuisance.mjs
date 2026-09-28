// Force-spawn each nuisance archetype at night and exercise their dialogs.
import { chromium } from 'playwright-core';
import fs from 'fs';
const out = process.argv[2] ?? 'nuisance-out';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[error]', m.text()); } });
await page.goto('http://127.0.0.1:5173/?test=new');
await page.waitForFunction('window.DONE', null, { timeout: 300000, polling: 500 });
const sim = (s) => page.evaluate((s) => window.__sim(s, 1 / 20), s);
const summary = () => page.evaluate(() => {
  const g = window.__game;
  return { clock: g.state.clock(), rep: +g.state.reputation.toFixed(1), money: g.state.money, dirt: g.dirt.count(), theft: g.state.stats.theft, waste: g.state.stats.waste,
    list: g.customers.list.filter((c) => c.state !== 'gone').map((c) => `${c.type}:${c.state}${c.char.bubble ? '「' + c.char.bubble.text + '」' : ''}`) };
});
await page.evaluate(() => { const g = window.__game; g.state.minute = 22 * 60; g.state.stats.lost = 3; });
for (const t of ['drunk', 'loiterer', 'thief', 'claimer', 'underage']) await page.evaluate((t) => window.__game.customers.spawn(t), t);
for (let i = 0; i < 6; i++) { await sim(10); console.log(JSON.stringify(await summary())); }
// talk to the drunk and loiterer
const talk = async (type, choice) => {
  const ok = await page.evaluate((type) => {
    const g = window.__game;
    const c = g.customers.list.find((x) => x.type === type && x.state !== 'gone');
    if (!c) return false;
    g.customers.interact(c.proxy);
    return true;
  }, type);
  await sim(0.2);
  const d = await page.$$('.dialog button');
  console.log('talk', type, ok, 'choices', d.length, await page.$eval('.dialog .text', (e) => e.textContent).catch(() => '-'));
  if (d[choice]) { await d[choice].click(); await sim(0.3); }
};
await talk('drunk', 1);
await talk('loiterer', 0);
await talk('thief', 0);
await sim(5);
await page.evaluate(() => { const g = window.__game; g.player.position.set(3.2, 0, 1.0); g.player.lookAtPoint(new g.engine.camera.position.constructor(3.3, 1.2, 2.9)); });
fs.writeFileSync(`${out}/night.jpg`, Buffer.from((await page.evaluate('window.__shot()')).split(',')[1], 'base64'));
// serve the register (claimer or underage)
for (let i = 0; i < 4; i++) {
  await sim(10);
  const who = await page.evaluate(() => { const c = window.__game.checkout.customer; return c ? c.type + (c.claim ? ':claim' : '') : null; });
  console.log('at register:', who, JSON.stringify(await summary()));
  if (!who) continue;
  await page.evaluate(() => window.__game.checkout.enter());
  await sim(0.3);
  if (who.includes('claim')) {
    await page.click('.register button:has-text("話を聞く")');
    await sim(0.3);
    console.log('claim text', await page.$eval('.dialog .text', (e) => e.textContent).catch(() => '-'));
    await page.click('.dialog button >> nth=0');
  } else {
    for (let k = 0; k < 6; k++) await page.keyboard.press('Space');
    await sim(0.3);
    const age = await page.$('.register button:has-text("年齢確認")');
    if (age) { await age.click(); await sim(0.3); console.log('age dialog', await page.$eval('.dialog .text', (e) => e.textContent).catch(() => '-')); const b = await page.$('.dialog button'); if (b) await b.click(); }
    await sim(0.3);
    console.log('buttons', await page.$$eval('.register button', (bs) => bs.map((b) => b.textContent + (b.disabled ? '(x)' : ''))));
  }
  await sim(0.3);
  if (await page.$('.register')) await page.evaluate(() => window.__game.checkout.exit());
}
await sim(20);
console.log('final', JSON.stringify(await summary()));
console.log('events', JSON.stringify(await page.evaluate(() => window.__game.state.stats.events)));
// end of day
await page.evaluate(() => { window.__game.state.minute = 26 * 60 - 1; });
await sim(2);
console.log('report', await page.$eval('.modal header h2', (e) => e.textContent).catch(() => 'no report'));
await page.screenshot({ path: `${out}/report.png` });
await page.click('.modal footer button.primary');
await sim(1);
console.log('next day', JSON.stringify(await page.evaluate(() => ({ day: window.__game.state.day, clock: window.__game.state.clock(), weather: window.__game.state.weather, mode: window.__game.mode, expired: window.__game.store.slots.reduce((a, s) => a + s.expiredCount(window.__game.state.day), 0) }))));
console.log('errors', errors.length);
await browser.close();
