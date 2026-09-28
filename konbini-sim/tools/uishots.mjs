// Full-page screenshots including the HTML UI (title screen and in-game HUD).
import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5173/');
await page.waitForSelector('.title-screen', { timeout: 300000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${out}/title.png`, timeout: 180000 });
console.log('title ok');
await page.click('.menu button.primary');
await page.waitForTimeout(15000);
await page.evaluate(() => { const g = window.__game; g.engine.stop(); g.headless = true; document.querySelectorAll('.clickcatch').forEach((e) => e.remove()); g.player.position.set(-1.0, 0, 3.8); g.player.yaw = 0.6; g.player.pitch = -0.1; for (let i = 0; i < 1200; i++) g.engine.simulate(1 / 20); g.player.position.set(-4.4, 0, 3.6); g.player.lookAtPoint(new g.engine.camera.position.constructor(-6, 1.0, 1)); g.engine.simulate(0.05); g.engine.composer.render(0.016); });
await page.screenshot({ path: `${out}/hud.png`, timeout: 180000 });
console.log('hud ok');
await browser.close();
