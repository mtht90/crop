// quick frames at chosen cinematic times: node scripts/cinema-quick.mjs <url> <out> t1,t2,...
import { chromium } from 'playwright';
const [url, out, ts] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url);
await page.waitForTimeout(2000);
await page.locator('.pill', { hasText: '開封する' }).click();
for (const m of ts.split(',').map(Number)) {
  if (m >= 100) { await page.waitForTimeout(m); await page.screenshot({ path: `${out}-w${m}.png` }); continue; }
  await page.waitForFunction((x) => (window.__cineT ?? 0) >= x, m, { timeout: 90000, polling: 50 });
  await page.screenshot({ path: `${out}-${m.toFixed(1)}.png` });
}
await browser.close();
