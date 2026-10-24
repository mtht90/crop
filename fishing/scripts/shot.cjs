// 開発用スクリーンショット: node scripts/shot.cjs <url> <out.png> [waitMs] [w] [h]
const { chromium } = require('playwright');
(async () => {
  const [url, out, wait = '1500', w = '1280', h = '720'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  page.on('console', (m) => console.log('[console]', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url);
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: out, timeout: 120000 });
  await browser.close();
})();
