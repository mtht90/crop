// 開発用：初めての人の流れ（スマホ）— 投げる → 待つ → アタリ → アワセ → ファイト
const { chromium, devices } = require('playwright');
(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${base}/?start&q=low&hour=8&weather=cloudy&x=113&z=0&yaw=1.57&fish`);
  await page.waitForTimeout(15000);
  const g = (f) => page.evaluate(f);
  const guide = () => g(() => document.querySelector('.guide')?.textContent);
  console.log('ready:', await guide());
  await page.screenshot({ path: `${out}/tu1.png`, timeout: 120000 });
  const cast = page.getByRole('button', { name: /キャスト/ });
  // 長押し：pointer イベントで押しっぱなし
  await cast.dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true });
  for (let i = 0; i < 120 && (await g(() => window.__game.fishing.charge)) < 0.9; i++) await page.waitForTimeout(250);
  await cast.dispatchEvent('pointerup', { pointerId: 7, isPrimary: true });
  for (let i = 0; i < 200 && (await g(() => window.__game.fishing.phase)) !== 'water'; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(3000);
  console.log('water:', await guide());
  await page.screenshot({ path: `${out}/tu2.png`, timeout: 120000 });
  for (let i = 0; i < 400 && !(await g(() => window.__game.fishing.bite?.phase === 'take')); i++) await page.waitForTimeout(250);
  console.log('take:', await guide(), await g(() => JSON.stringify({ph: window.__game.fishing.phase, bite: window.__game.fishing.bite?.phase, t: window.__game.fishing.tutorialTime, left: window.__game.input.left})));
  await page.screenshot({ path: `${out}/tu3.png`, timeout: 120000 });
  await page.getByRole('button', { name: /アワセ/ }).dispatchEvent('pointerdown');
  await page.waitForTimeout(3000);
  console.log('phase:', await g(() => window.__game.fishing.phase), '|', await guide());
  await page.screenshot({ path: `${out}/tu4.png`, timeout: 120000 });
  await browser.close();
})();
