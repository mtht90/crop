// 10-pack opening: node scripts/pack10.mjs <url> <outprefix> [packs=10]
import { chromium } from 'playwright';
const [url, out, packsArg] = process.argv.slice(2);
const ten = (packsArg ?? '10') !== '1';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
let n = 0;
const shot = async (name, w = 0) => { if (w) await page.waitForTimeout(w); await page.screenshot({ path: `${out}-${String(n++).padStart(2, '0')}-${name}.png` }); };
await page.goto(url);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__stores.useStore.getState().update((s) => { s.coins = 99999; }));
await page.waitForTimeout(300);
await page.locator('.pill', { hasText: ten ? '10パック開封' : '開封する' }).first().click();
await page.waitForFunction(() => (window.__cineT ?? 0) >= 1.3, null, { timeout: 90000 });
await shot('meteors1');
await page.waitForFunction(() => (window.__cineT ?? 0) >= 2.1, null, { timeout: 90000 });
await shot('meteors2');
await page.mouse.click(640, 360);
await shot('pack', 1800);
await page.waitForTimeout(5000);
const zone = await page.locator('.tear-float').last().boundingBox();
const y = zone.y + zone.height * 0.07;
await page.mouse.move(zone.x + 10, y); await page.mouse.down();
await page.mouse.move(zone.x + zone.width * 0.45, y, { steps: 8 });
await shot('cutting', 200);
await page.mouse.move(zone.x + zone.width * 0.85, y, { steps: 6 });
await page.mouse.up();
await shot('snap', 30);
await shot('torn', 350);
await shot('rise', 900);
if (ten) {
  await shot('multi', 2600);
  const all = page.locator('.pill', { hasText: 'すべてめくる' });
  if (await all.count()) { await all.click(); await shot('flipping', 700); await page.waitForTimeout(8000); }
  await shot('multi-done', 800);
}
await browser.close();
