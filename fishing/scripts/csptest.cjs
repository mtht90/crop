// 開発用：アーティファクトと同じく通信を自オリジンに制限（CSP）した状態で、モデル読み込みとアワセ→ファイトを確認
const { chromium, devices } = require('playwright');
(async () => {
  const [base] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => /Refused|CSP|failed|Error/i.test(m.text()) && console.log('[console]', m.text().slice(0, 160)));
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.resourceType() !== 'document') return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'" } });
  });
  await page.goto(`${base}/?start&q=low&hour=8&weather=cloudy&x=113&z=0&yaw=1.57&fish`);
  await page.waitForTimeout(20000);
  const g = (f) => page.evaluate(f);
  // 魚モデルが読めているか（代用形状でなく実モデル）
  console.log('fish models loaded:', await g(() => import('/assets/' + [...document.scripts].map(s=>s.src).find(s=>s.includes('index-')).split('/assets/')[1]).then(() => true).catch(() => 'n/a')));
  await g(() => { const f = window.__game.fishing; f.phase = 'water'; f.lure.set(100, -1, 0); f.inWaterTime = 2; f.debugBite('largemouth'); });
  for (let i = 0; i < 120 && !(await g(() => window.__game.fishing.bite?.phase === 'take')); i++) await page.waitForTimeout(250);
  await page.getByRole('button', { name: /アワセ/ }).dispatchEvent('pointerdown');
  await page.waitForTimeout(4000);
  console.log('phase after hookset:', await g(() => window.__game.fishing.phase));
  console.log('fish has texture:', await g(() => !!window.__game.fishing.fishObj?.group.children[0].material.map));
  console.log('fetch data: under CSP:', await g(() => fetch('data:text/plain,hi').then(() => 'ok').catch((e) => 'blocked: ' + e.message)));
  await page.screenshot({ path: process.argv[3], timeout: 120000 });
  await browser.close();
})();
