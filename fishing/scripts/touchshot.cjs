// 開発用：スマホ相当（タッチ）でのスクリーンショット
const { chromium, devices } = require('playwright');
(async () => {
  const [url, out, wait = '15000'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url);
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: out, timeout: 120000 });
  await browser.close();
})();
