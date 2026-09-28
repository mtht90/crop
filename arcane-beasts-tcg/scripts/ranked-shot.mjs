// Ranked screen + a promotion on the result screen
import { chromium } from 'playwright';
const [out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => localStorage.clear());
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => {
  const { useStore } = window.__stores;
  const st = useStore.getState();
  st.chooseStarter('fire');
  st.update((s) => { s.ranked.rank = 9; s.ranked.pts = 70; s.ranked.wins = 12; s.ranked.losses = 4; s.ranked.streak = 3; s.ranked.best = 9; s.ranked.claimed = [1,2,3,4,5,6,7,8,9]; });
});
await page.goto('http://127.0.0.1:5173/?screen=ranked');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-ranked.png` });
await page.getByText('対戦する').click();
await page.waitForTimeout(3000);
await page.evaluate(() => window.__stores.useBattle.setState({ stats: { kos: 5, damage: 600, prizes: 6, prizesLost: 2, evolves: 2, trainers: 7 }, result: { winner: 0, reason: 'サイドをすべてとった！' } }));
await page.waitForTimeout(4500);
await page.screenshot({ path: `${out}-result.png` });
await page.goto('http://127.0.0.1:5173/?screen=home');
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}-home.png` });
await browser.close();
