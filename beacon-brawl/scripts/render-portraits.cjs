// 全ヒーローの顔アイコンを public/assets/portraits/<id>.webp に書き出す。
// 使い方: npm run dev（または preview）を起動した状態で
//   node scripts/render-portraits.cjs http://localhost:5173/
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const url = process.argv[2] || 'http://localhost:5173/';
  const out = path.join(__dirname, '..', 'public', 'assets', 'portraits');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  p.on('pageerror', (e) => console.error(e.message));
  await p.goto(url + '?portraits');
  await p.waitForFunction('window.__portraits', null, { timeout: 600000 });
  const shots = await p.evaluate(() => window.__portraits);
  for (const [id, data] of Object.entries(shots)) {
    fs.writeFileSync(path.join(out, `${id}.webp`), Buffer.from(data.split(',')[1], 'base64'));
    console.log(id);
  }
  await b.close();
})();
