// Freehand tear: node scripts/tear-test.mjs <outprefix>
import { chromium } from 'playwright';
const [out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
let n = 0;
const shot = async (name, w = 0) => { if (w) await page.waitForTimeout(w); await page.screenshot({ path: `${out}-${String(n++).padStart(2, '0')}-${name}.png`, clip: { x: 380, y: 0, width: 520, height: 400 } }); };
await page.goto('http://127.0.0.1:5173/?screen=shop&godpack');
await page.waitForTimeout(1500);
await page.evaluate(() => window.__stores.useStore.getState().update((s) => { s.coins = 99999; }));
await page.locator('.pill', { hasText: '開封する' }).first().click();
await page.waitForFunction(() => (window.__cineT ?? 0) >= 0.5, null, { timeout: 90000 });
await page.mouse.click(640, 360);
await page.waitForTimeout(9000);
const z = await page.locator('.tear-float').last().boundingBox();
const P = (fx, fy) => [z.x + z.width * fx, z.y + z.height * fy];
const mode = process.argv[3] ?? 'full';
if (mode === 'full') {
// 1) a short stroke that leaves the band -> should stop + heal
await page.mouse.move(...P(0.05, 0.1)); await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(...P(0.05 + i * 0.03, 0.1 + i * 0.004));
await shot('short');
for (let i = 1; i <= 6; i++) await page.mouse.move(...P(0.3 + i * 0.02, 0.1 + i * 0.05));
await shot('outside', 150);
await page.mouse.up();
await shot('healed', 700);
}
// 2) a wavy stroke, released at ~60% of the width
await page.mouse.move(...P(0.02, 0.06)); await page.mouse.down();
for (let i = 1; i <= 16; i++) {
  const f = i / 16;
  await page.mouse.move(...P(0.02 + f * 0.6, 0.1 + Math.sin(f * 6) * 0.06));
}
await shot('wavy', 100);
await page.mouse.up();
await shot('torn', 150);
await shot('torn2', 250);
await browser.close();
