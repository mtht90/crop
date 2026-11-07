/**
 * カード絵の撮影：開発サーバーの tools/capture.html を開き、ユニット・建物ごとに PNG を撮って WebP で保存する。
 * 使い方：npm run dev を起動した状態で  node tools/assets/capture.cjs [http://localhost:5173]
 */
const { chromium } = require('playwright');
const sharp = require('sharp');
const path = require('path');

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = path.resolve(__dirname, '../../packages/client/public/assets/game/cards');
const CARDS = ['iron_knight', 'archer_duo', 'rock_giant', 'bone_legion', 'wyvern', 'guard_cannon'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 400 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  for (const card of CARDS) {
    await page.goto(`${BASE}/tools/capture.html?card=${card}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
    const png = await page.locator('#c').screenshot({ omitBackground: true });
    await sharp(png).webp({ quality: 88 }).toFile(path.join(OUT, `unit_${card}.webp`));
    console.log('captured', card);
  }
  await browser.close();
  // ホーム画面用のアイコン（PWA）：鉄の騎士のカード絵を、紺の背景に置いたもの
  const iconDir = path.resolve(OUT, '../icons');
  require('fs').mkdirSync(iconDir, { recursive: true });
  for (const size of [192, 512, 180]) {
    const art = await sharp(path.join(OUT, 'unit_iron_knight.webp')).resize(Math.round(size * 0.82), Math.round(size * 0.82), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: '#1d2a3a' } })
      .composite([{ input: art, gravity: 'south' }])
      .png()
      .toFile(path.join(iconDir, `icon-${size}.png`));
  }
  console.log('icons written');
})();
