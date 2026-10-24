// 開発用：各画面のスクリーンショット
const { chromium } = require('playwright');
(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 120000 });
  await page.goto(`${base}/?q=low&hour=17.6&weather=sunny`);
  await page.waitForTimeout(15000);
  await shot('u1-title');
  await page.goto(`${base}/?start&nolock&q=low&hour=10`);
  await page.waitForTimeout(12000);
  await page.evaluate(() => {
    const g = window.__game;
    g.save.money = 50000;
    g.save.cooler.push({ uid: 'a', speciesId: 'koi', length: 62, weight: 4100, iv: { power: 20, stamina: 12, speed: 30, build: 25 }, grade: 'A', colorId: null, patternId: 'mirror', record: {} });
  });
  await page.keyboard.press('KeyE').catch(() => {});
  await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 136.4 + 17 - 2.5 - 1.2;
    g.player.z = -9;
  });
  await page.waitForTimeout(3000);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(5000);
  await shot('u2-shop');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2000);
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(4000);
  await shot('u3-tackle');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2000);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(4000);
  await shot('u4-map');
  await browser.close();
})();
