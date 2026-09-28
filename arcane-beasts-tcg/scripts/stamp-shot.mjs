// Battle stamps: node scripts/stamp-shot.mjs <outprefix>
import { chromium } from 'playwright';
const [out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => { localStorage.clear(); });
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => { const st = window.__stores.useStore.getState(); st.chooseStarter('fire'); st.update((s) => { s.guideSeen = true; }); });
await page.goto('http://127.0.0.1:5173/?battle&speed=3');
await page.waitForTimeout(5000);
await page.locator('.stamp-btn').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-palette.png` });
await page.locator('.stamp-chip', { hasText: 'よろしく' }).click();
await page.waitForTimeout(2200);
await page.screenshot({ path: `${out}-bubbles.png` });
await browser.close();
