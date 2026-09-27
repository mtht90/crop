import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
let n = 0;
const shot = async (name, w = 0) => { if (w) await page.waitForTimeout(w); await page.screenshot({ path: `${out}-${String(n++).padStart(2, '0')}-${name}.png` }); };
await page.goto(url);
await shot('shop', 2500);
await page.locator('.pill', { hasText: '開封する' }).click();
await shot('coverflow', 1800);
await page.mouse.move(900, 400); await page.mouse.down(); await page.mouse.move(650, 400, { steps: 10 });
await shot('coverflow-drag', 60);
await page.mouse.up();
await shot('coverflow-snap', 1200);
await page.mouse.click(800, 380);
await shot('picking', 350);
await shot('tear', 1500);
const zone = await page.locator('.tear-float').boundingBox();
const y = zone.y + zone.height * 0.07;
await page.mouse.move(zone.x + 10, y); await page.mouse.down();
await page.mouse.move(zone.x + zone.width * 0.5, y, { steps: 8 });
await shot('tearing', 40);
await page.mouse.move(zone.x + zone.width * 1.0, y, { steps: 6 });
await page.mouse.up();
await shot('torn', 150);
await shot('emerge', 500);
await shot('reveal', 1500);
for (let i = 0; i < 10; i++) {
  if (await page.locator('.results').count()) break;
  const c = await page.locator('.sc.top').boundingBox().catch(() => null);
  if (!c) { await page.waitForTimeout(400); continue; }
  const down = await page.locator('.sc.top .edge-light').count();
  if (down) {
    await shot('rare-waiting', 400);
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
    await shot('rare-lift', 250);
    await shot('rare-turn', 250);
    await shot('rare-done', 1100);
    continue;
  }
  if (i === 1) {
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down();
    await page.mouse.move(c.x + c.width / 2 + 160, c.y + c.height / 2, { steps: 5 });
    await shot('swiping', 30);
    await page.mouse.move(c.x + c.width / 2 + 420, c.y + c.height / 2, { steps: 2 });
    await page.mouse.up();
  } else await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  await shot(`card${i}`, 800);
}
await shot('results', 1600);
await browser.close();
