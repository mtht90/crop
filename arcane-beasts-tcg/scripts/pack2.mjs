// Full opening with the cinematic: node scripts/pack2.mjs <url> <outprefix>
import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
let n = 0;
const shot = async (name, w = 0) => { if (w) await page.waitForTimeout(w); await page.screenshot({ path: `${out}-${String(n++).padStart(2, '0')}-${name}.png` }); };
await page.goto(url);
await page.waitForTimeout(2000);
await page.locator('.pill', { hasText: '開封する' }).click();
await page.waitForFunction(() => (window.__cineT ?? 0) >= 1.5, null, { timeout: 90000 });
await shot('meteors');
await page.mouse.click(640, 360); // skip the rest of the cinematic
await shot('skipped', 1500);
await shot('promoting', 1500);
await shot('promoted', 3000);
const zone = await page.locator('.tear-float').last().boundingBox();
const y = zone.y + zone.height * 0.07;
await page.mouse.move(zone.x + 10, y); await page.mouse.down();
await page.mouse.move(zone.x + zone.width, y, { steps: 12 });
await page.mouse.up();
await shot('torn', 400);
await shot('reveal', 2500);
for (let i = 0; i < 12; i++) {
  if (await page.locator('.results').count()) break;
  await page.mouse.click(640, 360);
  await page.waitForTimeout(1600);
  await shot(`card${i}`);
}
await shot('results', 1500);
await browser.close();
