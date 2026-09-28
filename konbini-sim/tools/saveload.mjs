// Save in one page load, continue in a fresh page, compare state.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5173/?test=new');
await page.waitForFunction('window.DONE', null, { timeout: 300000, polling: 500 });
const snap = () => page.evaluate(() => {
  const g = window.__game;
  return { day: g.state.day, minute: g.state.minute, money: Math.round(g.state.money), items: g.store.slots.reduce((a, s) => a + s.items.length, 0), boxes: g.boxes.length, dirt: g.dirt.count(), orders: g.state.orders.length, hotStock: JSON.stringify(g.state.hotStock) };
});
await page.evaluate(() => { const g = window.__game; g.dirt.spawn('mud', -4.5, 3); g.deliveries.place('water', 1, false); window.__sim(30, 1 / 20); g.save(); });
const a = await snap();
console.log('before', JSON.stringify(a));
await page.goto('http://127.0.0.1:5173/?test=load');
await page.waitForFunction('window.DONE', null, { timeout: 300000, polling: 500 });
await page.evaluate(() => window.__game.continueGame());
const b = await snap();
console.log('after ', JSON.stringify(b));
// rain day render
await page.evaluate(() => { const g = window.__game; g.state.weather = 'rain'; g.env.rain = 1; g.state.minute = 16 * 60; window.__sim(1, 1 / 20); });
const shot = await page.evaluate(() => { const g = window.__game; g.player.position.set(-4.5, 0, 7.5); g.player.lookAtPoint(new g.engine.camera.position.constructor(3, 1.2, 14)); window.__sim(0.1, 0.05); return window.__shot(); });
(await import('fs')).writeFileSync(process.argv[2], Buffer.from(shot.split(',')[1], 'base64'));
await browser.close();
