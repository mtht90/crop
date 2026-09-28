// Captures the 流星降臨 cinematic: node scripts/cinema.mjs <url> <outprefix>
import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)); });
await page.goto(url);
await page.waitForTimeout(2500);
await page.locator('.pill', { hasText: '開封する' }).click();
// follow the cinematic's own clock (software GL renders slowly)
const marks = [0.2, 0.8, 1.2, 1.6, 2.0, 2.3, 2.5, 2.7, 3.0, 3.4, 3.9, 4.3];
for (const m of marks) {
  await page.waitForFunction((x) => (window.__cineT ?? 0) >= x || !document.querySelector('.cine-tap'), m, { timeout: 60000, polling: 50 });
  await page.screenshot({ path: `${out}-${m.toFixed(1).padStart(4, '0')}.png` });
}
for (const w of [1500, 3000, 4500]) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}-post${w}.png` });
}
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
console.log('fps', fps);
await browser.close();
