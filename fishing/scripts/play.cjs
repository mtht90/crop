// 開発用：釣りの一連の流れを自動操作してスクリーンショットを撮る
// node scripts/play.cjs <baseUrl> <outDir> [speciesId] [query]
const { chromium } = require('playwright');
(async () => {
  const [base, out, species = 'largemouth', query = 'hour=6&weather=cloudy'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  await page.goto(`${base}/?start&fish=1&nolock&q=low&x=113&z=0&${query}`);
  await page.waitForTimeout(15000);
  const phase = () => page.evaluate(() => window.__game.fishing.phase);
  const shot = async (n) => {
    await page.screenshot({ path: `${out}/${n}.png`, timeout: 120000 });
    console.log('shot', n, await phase());
  };
  await page.mouse.move(480, 270);
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.yaw = g.fishYaw = Math.PI / 2;
    g.player.pitch = -0.08;
  });
  await shot('p1-ready');
  await page.mouse.down();
  // 低速環境ではフレームが遅いので、ゲーム内の溜め量で判定する
  for (let i = 0; i < 120 && (await page.evaluate(() => window.__game.fishing.charge)) < 0.9; i++) await page.waitForTimeout(250);
  await shot('p2-charge');
  await page.mouse.up();
  for (let i = 0; i < 240 && (await phase()) !== 'water'; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(6000);
  await shot('p3-water');
  await page.evaluate((s) => window.__game.fishing.debugBite(s), species);
  for (let i = 0; i < 80 && !(await page.evaluate(() => window.__game.fishing.bite?.phase === 'take')); i++) await page.waitForTimeout(250);
  await shot('p4-bite');
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(500);
  await page.mouse.down();
  await page.waitForTimeout(12000);
  await shot('p5-fight');
  await page.waitForTimeout(12000);
  await shot('p6-fight2');
  await page.mouse.up();
  await page.evaluate(() => {
    const f = window.__game.fishing.fight;
    if (f) {
      f.stamina = 0;
      f.distance = f.lineOut = 2;
    }
  });
  for (let i = 0; i < 200 && !(await page.evaluate(() => !!document.querySelector('.catch'))); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(4000);
  await shot('p7-catch');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(8000);
  await shot('p8-dex');
  await browser.close();
})();
