// おすすめ編成 modal: node scripts/autodeck-shot.mjs <outprefix>
import { chromium } from 'playwright';
const [out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => localStorage.clear());
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => {
  const st = window.__stores.useStore.getState();
  st.chooseStarter('water');
  st.update((s) => { s.coins = 99999; });
});
await page.goto('http://127.0.0.1:5173/?screen=deck');
await page.waitForTimeout(2000);
await page.getByText('おすすめ編成').first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}-aces.png` });
await page.locator('.ad-ace, .ad-grid > *').first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}-deck.png` });
await browser.close();
