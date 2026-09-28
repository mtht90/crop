// Card back close-up via a god pack: node scripts/back-shot.mjs <out.png>
import { chromium } from 'playwright';
const [out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5173/?screen=shop&godpack');
await page.waitForTimeout(1500);
await page.evaluate(() => window.__stores.useStore.getState().update((s) => { s.coins = 99999; }));
await page.locator('.pill', { hasText: '開封する' }).first().click();
await page.waitForFunction(() => (window.__cineT ?? 0) >= 0.5, null, { timeout: 90000 });
await page.mouse.click(640, 360);
await page.waitForTimeout(9000);
await page.keyboard.press('Enter');
await page.waitForTimeout(4000);
const b = await page.locator('.sc.top').boundingBox();
await page.screenshot({ path: out, clip: { x: b.x - 40, y: b.y - 20, width: b.width + 80, height: b.height + 40 } });
await browser.close();
