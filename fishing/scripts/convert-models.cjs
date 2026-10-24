// 外部素材をゲーム用 glTF(JSON) に変換する（npm run dev 起動中に実行）
// node scripts/convert-models.cjs [http://localhost:5173] [id,id...]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [base = 'http://localhost:5173', only = ''] = process.argv.slice(2);
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('console', (m) => console.log(m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.exposeFunction('__save', (p, data) => {
    const out = path.join(root, p);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
  });
  await page.goto(`${base}/convert.html${only ? `?only=${only}` : ''}`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 });
  await browser.close();
})();
