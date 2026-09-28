// open a screen with a seeded save: node seed.mjs <url> <out.png> [clickText]
import { chromium } from 'playwright';
const [url, out, click] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => {
  const { useStore } = window.__stores;
  const st = useStore.getState();
  st.chooseStarter('water');
  st.update((s) => {
    s.coins = 5000;
    s.progress.loginDay = new Date().toISOString();
    s.shards = { C: 14, U: 9, R: 12, RR: 20, ST: 5, CR: 31 };
    s.beaten = ['tim', 'marina', 'vane'];
  });
});
await page.goto(url);
await page.waitForTimeout(2500);
if (click) { await page.getByText(click).first().click(); await page.waitForTimeout(1500); }
await page.screenshot({ path: out });
await browser.close();
