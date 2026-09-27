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
await page.getByText('で開封する').click();
await shot('coverflow-in', 400);
await shot('coverflow', 1500);
// drag coverflow
await page.mouse.move(900, 400); await page.mouse.down(); await page.mouse.move(600, 400, { steps: 10 });
await shot('coverflow-drag', 100);
await page.mouse.up();
await shot('coverflow-snap', 900);
await page.getByText('このパックにする').click();
await shot('picked', 300);
await shot('tear', 1200);
const zone = await page.locator('.tear-float').boundingBox();
const y = zone.y + zone.height * 0.135;
await page.mouse.move(zone.x + 5, y); await page.mouse.down();
await page.mouse.move(zone.x + zone.width * 0.45, y, { steps: 8 });
await shot('tearing', 50);
await page.mouse.move(zone.x + zone.width * 1.0, y, { steps: 8 });
await page.mouse.up();
await shot('torn-0', 120);
await shot('torn-1', 350);
await shot('emerge', 600);
await shot('reveal', 1200);
for (let i = 0; i < 8; i++) {
  if (await page.locator('.results').count()) break;
  const back = await page.locator('.rare-back').count();
  if (back) { await shot('rare-back', 200); }
  const c = await page.locator('.stack-card.top').boundingBox();
  if (!c) { await page.waitForTimeout(400); continue; }
  if (i === 1 && !back) {
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down();
    await page.mouse.move(c.x + c.width / 2 + 180, c.y + c.height / 2 + 10, { steps: 6 });
    await shot('swiping', 50);
    await page.mouse.move(c.x + c.width / 2 + 400, c.y + c.height / 2 + 10, { steps: 3 });
    await page.mouse.up();
  } else {
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  }
  if (back) { await shot('rare-flip-mid', 250); await shot('rare-flipped', 900); await page.waitForTimeout(400); }
  else await shot(`card${i}`, 700);
}
await shot('results', 1500);
await browser.close();
