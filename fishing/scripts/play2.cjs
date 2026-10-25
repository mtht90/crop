// 開発用：新しい操作（引っぱりキャスト→振り上げアワセ→ポンピング→タモ入れ）を自動操作で確認
const { chromium } = require('playwright');
(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${base}/?start&fish=1&nolock&q=low&hour=9&weather=cloudy&x=113&z=0&yaw=1.57`);
  await page.waitForTimeout(15000);
  const g = (f) => page.evaluate(f);
  const ph = () => g(() => window.__game.fishing.phase);
  const shot = async (n) => { await page.screenshot({ path: `${out}/${n}.png`, timeout: 120000 }); console.log('shot', n, await ph(), '|', await g(() => document.querySelector('.guide')?.textContent)); };
  await page.mouse.move(480, 200);
  await page.waitForTimeout(2000);
  await g(() => { const x = window.__game; x.player.yaw = x.fishYaw = Math.PI / 2; x.player.pitch = -0.1; });
  await page.mouse.down();
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) { await page.mouse.move(480 + i * 4, 200 + (i + 1) * 40); await page.waitForTimeout(700); }
  await shot('a1-aim');
  await page.mouse.up();
  for (let i = 0; i < 200 && (await ph()) !== 'water'; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(4000);
  await shot('a2-water');
  await g(() => window.__game.fishing.debugBite('largemouth'));
  for (let i = 0; i < 80 && !(await g(() => window.__game.fishing.bite?.phase === 'take')); i++) await page.waitForTimeout(250);
  // 竿を一度下げてから、一気に振り上げる
  await page.mouse.move(480, 420); await page.waitForTimeout(800);
  await page.mouse.move(480, 120); await page.waitForTimeout(1500);
  await shot('a3-hook');
  // ポンピング：巻きながら上げ下げ
  for (let k = 0; k < 6 && (await ph()) === 'fight'; k++) {
    await page.mouse.move(480, 380); await page.mouse.down(); await page.waitForTimeout(2500);
    await page.mouse.up(); await page.mouse.move(480, 150); await page.waitForTimeout(2500);
  }
  await shot('a4-fight');
  await g(() => { const f = window.__game.fishing.fight; if (f) { f.stamina = 0; f.distance = 2; f.lineOut = 2 + f.rodLift * 2.2; } });
  for (let i = 0; i < 60 && (await ph()) !== 'net'; i++) await page.waitForTimeout(250);
  await shot('a5-net');
  // 竿を立てたまま巻かずに保つと網に入る
  await page.mouse.move(480, 60); await page.waitForTimeout(400);
  await page.mouse.move(480, 30);
  for (let i = 0; i < 40 && (await ph()) === 'net'; i++) await page.waitForTimeout(250);
  console.log('after net:', await ph(), 'rodLift', await g(() => window.__game.fishing.rodLift));
  await page.waitForTimeout(3000);
  await shot('a6-catch');
  await browser.close();
})();
