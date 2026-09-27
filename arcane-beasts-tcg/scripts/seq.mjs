import { chromium } from 'playwright';
const [url, outPrefix, count = '30', every = '700', startWait = '1000'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
await page.goto(url);
await page.waitForTimeout(Number(startWait));
for (let i = 0; i < Number(count); i++) {
  await page.waitForTimeout(Number(every));
  await page.screenshot({ path: `${outPrefix}-${String(i).padStart(2, '0')}.png` });
}
await browser.close();
