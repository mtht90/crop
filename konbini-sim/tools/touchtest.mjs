// iPad emulation: drives the on-screen stick / look / buttons with real touch events.
// Usage: node tools/touchtest.mjs <outDir>
import { chromium } from 'playwright-core';
import fs from 'fs';
const out = process.argv[2] ?? 'touch-out';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
await page.goto('http://127.0.0.1:5173/');
await page.waitForSelector('.title-screen', { timeout: 300000 });
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
await page.tap('.menu button.primary');
await page.waitForFunction(() => window.__game?.mode === 'play', null, { timeout: 300000 });
await page.evaluate(() => { const g = window.__game; g.engine.stop(); g.headless = true; });
const sim = (s) => page.evaluate((s) => { const g = window.__game; for (let i = 0; i < s * 20; i++) g.engine.simulate(1 / 20); }, s);
const st = () => page.evaluate(() => { const g = window.__game; return { touch: g.input.touchMode, pos: g.player.position.toArray().map((v) => +v.toFixed(2)), yaw: +g.player.yaw.toFixed(2), held: g.player.held?.kind ?? null, layer: getComputedStyle(document.querySelector('.touch-layer')).display, prompt: document.querySelector('.prompt')?.textContent, quality: g.settings.quality }; });
await sim(0.2);
console.log('start', await st());
// stick: hold left thumb and push forward while simulating
await touch('touchStart', [[200, 600, 1]]);
await touch('touchMove', [[200, 530, 1]]);
const before = await st();
await sim(1.5);
const after = await st();
console.log('stick fwd moved', before.pos, '->', after.pos);
await touch('touchEnd', []);
// look: drag on right side
await touch('touchStart', [[800, 400, 2]]);
for (let i = 1; i <= 5; i++) { await touch('touchMove', [[800 - i * 30, 400, 2]]); await sim(0.05); }
await touch('touchEnd', []);
console.log('look', (await st()).yaw);
// walk to a delivered box and use the 使う button
await page.evaluate(() => { const g = window.__game; const b = g.boxes[0]; const p = b.mesh.position; g.player.position.set(p.x, 0, p.z + 1.1); g.player.lookAtPoint(p.clone().setY(0.1)); });
await sim(0.3);
console.log('look box', await st());
const btn = await page.$('.tbtn[data-id="use"]');
const bb = await btn.boundingBox();
await touch('touchStart', [[bb.x + bb.width / 2, bb.y + bb.height / 2, 3]]);
await sim(0.1);
await touch('touchEnd', []);
await sim(0.2);
console.log('after 使う', await st());
await page.evaluate(() => { const g = window.__game; g.engine.composer.render(0.016); });
await page.screenshot({ path: `${out}/ipad.png`, timeout: 180000 });
// register mode: tap the leave button
await page.evaluate(() => { const g = window.__game; if (g.player.held) g.putDownBox?.(); g.player.held = null; g.checkout.enter(); });
await sim(0.5);
console.log('register', await page.evaluate(() => ({ mode: window.__game.mode, tap: window.__game.input.tapClicks, ctx: document.querySelector('.touch-layer').dataset.ctx, btns: [...document.querySelectorAll('.register button')].map((b) => b.textContent) })));
await page.evaluate(() => { const g = window.__game; g.engine.composer.render(0.016); });
await page.screenshot({ path: `${out}/ipad-register.png`, timeout: 180000 });
console.log('errors', errors.length);
await browser.close();
