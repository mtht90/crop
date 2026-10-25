// 開発用：寄せてから抜き上げるまでの動きを、時計を止めてコマ送りで撮る
// node scripts/haul.cjs http://localhost:5173 <出力先> [魚種]
const { chromium } = require('playwright');
(async () => {
  const [base, out, species = 'largemouth'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.clock.install();
  await page.goto(`${base}/?start&fish=1&nolock&q=low&hour=10&weather=sunny&x=113&z=0&yaw=1.57`);
  const run = async (ms) => { for (let t = 0; t < ms; t += 50) await page.clock.runFor(50); };
  const g = (f, a) => page.evaluate(f, a);
  const ph = () => g(() => window.__game.fishing.phase);
  for (let i = 0; i < 60 && !(await g(() => !!window.__game?.fishing)); i++) await run(500);
  console.log('loaded'); await run(4000); console.log('ready', await ph());
  await g(() => { const x = window.__game; x.player.yaw = x.fishYaw = Math.PI / 2; x.player.pitch = -0.1; });
  // キャスト
  await page.mouse.move(480, 200); await run(300);
  await page.mouse.down(); await run(300);
  for (let i = 0; i < 6; i++) { await page.mouse.move(480, 200 + (i + 1) * 30); await run(150); }
  await page.mouse.up();
  for (let i = 0; i < 80 && (await ph()) !== 'water'; i++) await run(100);
  await run(1500);
  await g((id) => window.__game.fishing.debugBite(id), species);
  for (let i = 0; i < 60 && !(await g(() => window.__game.fishing.bite?.phase === 'take')); i++) await run(100);
  await page.mouse.move(480, 420); await run(300);
  await page.mouse.move(480, 120); await run(600);
  console.log('after hookset:', await ph());
  // 足元まで寄せた状態にする
  await g(() => { const f = window.__game.fishing.fight; if (f) { f.stamina = 0; f.distance = 2; f.lineOut = 2 + f.rodLift * 2.2; } });
  for (let i = 0; i < 40 && (await ph()) !== 'net'; i++) await run(100);
  await run(300);
  await page.screenshot({ path: `${out}/h0-net-thrash.png` });
  for (let i = 0; i < 60 && (await g(() => window.__game.fishing.netThrash > 0)); i++) await run(100);
  await run(200);
  await page.screenshot({ path: `${out}/h1-net-quiet.png` });
  // 竿を下げてから一気に振り上げる
  await page.mouse.move(480, 420); await run(200);
  await page.mouse.move(480, 60); await run(50);
  console.log('after flick:', await ph());
  const times = [150, 350, 600, 900, 1300, 2000];
  let last = 0;
  for (const [i, t] of times.entries()) {
    await run(t - last);
    last = t;
    const st = await g(() => { const x = window.__game.fishing, h = x.haul; return `${x.phase} t=${h.t.toFixed(2)} mouth=${h.mouth.toArray().map((v) => v.toFixed(2))} hold=${h.hold.toFixed(2)} dropped=${h.dropped}`; });
    console.log(t, st);
    await page.screenshot({ path: `${out}/h${i + 2}-haul-${t}.png` });
  }
  await browser.close();
})();
