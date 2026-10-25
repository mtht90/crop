// 開発用：スマホ（縦持ち・タッチ）でタイトル → はじめから → 釣りまでを確認
const { chromium, devices } = require('playwright');
(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  // 既存のセーブがある状態を再現
  await page.addInitScript(() => localStorage.setItem('anglers-atlas-save-v1', JSON.stringify({ version: 1, money: 999 })));
  // 埋め込み表示と同じく confirm() は常にキャンセル
  await page.addInitScript(() => (window.confirm = () => false));
  await page.goto(`${base}/?q=low`);
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `${out}/m1-title.png`, timeout: 120000 });
  const btn = page.getByRole('button', { name: 'はじめから' });
  await btn.tap();
  await page.getByRole('button', { name: /もう一度押して確定/ }).tap();
  await page.waitForTimeout(15000);
  console.log('mode', await page.evaluate(() => window.__game.mode), 'money', await page.evaluate(() => window.__game.save.money));
  await page.screenshot({ path: `${out}/m3-game.png`, timeout: 120000 });
  // 水辺へ移動して「釣る」
  await page.evaluate(() => { const g = window.__game; g.player.x = 113; g.player.z = 0; g.player.yaw = Math.PI / 2; });
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: '釣る' }).tap();
  await page.waitForTimeout(6000);
  console.log('mode', await page.evaluate(() => window.__game.mode));
  await page.screenshot({ path: `${out}/m4-fish.png`, timeout: 120000 });
  await browser.close();
})();
