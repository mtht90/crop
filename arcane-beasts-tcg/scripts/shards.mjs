// Shards e2e: max out set-2 copies, open a pack (duplicates → shards), then exchange
import { chromium } from 'playwright';
const [out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => {
  localStorage.clear();
});
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => {
  const { useStore } = window.__stores;
  const st = useStore.getState();
  st.chooseStarter('fire');
  st.update((s) => {
    s.coins = 5000;
    s.shards = { C: 8 };
  });
});
const ids = await page.evaluate(async () => {
  const { useStore } = window.__stores;
  const mod = await import('/src/engine/cards/index.ts');
  const list = mod.ALL_CARDS.filter((c) => c.set === 'AB2' && !c.variant && (c.rarity === 'C' || c.rarity === 'U'));
  useStore.getState().update((s) => { for (const c of list) s.collection[c.id] = 10; });
  return list.length;
});
console.log('maxed', ids);
await page.goto('http://127.0.0.1:5173/?screen=shop');
await page.waitForTimeout(2000);
await page.locator('.pill', { hasText: '開封する' }).click();
await page.waitForTimeout(1800);
await page.mouse.click(800, 380);
await page.waitForTimeout(1500);
const zone = await page.locator('.tear-float').boundingBox();
const y = zone.y + zone.height * 0.07;
await page.mouse.move(zone.x + 10, y); await page.mouse.down();
await page.mouse.move(zone.x + zone.width, y, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(2000);
await page.getByText('スキップ').click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}-results.png` });
const shards = await page.evaluate(() => window.__stores.useStore.getState().save.shards);
console.log('shards after pack', JSON.stringify(shards));
await page.goto('http://127.0.0.1:5173/?screen=exchange');
await page.waitForTimeout(2000);
await page.locator('.ex-item').nth(2).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}-confirm.png` });
await page.getByText('交換する', { exact: true }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-got.png` });
console.log('shards after exchange', JSON.stringify(await page.evaluate(() => window.__stores.useStore.getState().save.shards)));
await browser.close();
