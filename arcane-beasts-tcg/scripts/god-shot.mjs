// God-pack cinematic frames: node scripts/god-shot.mjs <outprefix>
import { chromium } from 'playwright';
const [out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5173/?screen=shop&godpack');
await page.waitForTimeout(1500);
await page.evaluate(() => window.__stores.useStore.getState().update((s) => { s.coins = 99999; }));
await page.locator('.pill', { hasText: '開封する' }).first().click();
await page.waitForTimeout(1200);
const pb = await page.locator('.pick-pack').nth(2).boundingBox();
await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2);
for (const [i, t] of [1.6, 2.2, 3.2, 4.0, 5.5].entries()) {
  await page.waitForFunction((x) => (window.__cineT ?? 0) >= x, t, { timeout: 120000 });
  await page.screenshot({ path: `${out}-${i}.png` });
}
await browser.close();
