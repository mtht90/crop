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
  await g(() => { const x = window.__game.fishing; const o = x.finishFight.bind(x); window.__log = []; x.finishFight = (r) => { const f = x.fight; window.__log.push(`finish ${r} t=${f?.elapsed.toFixed(1)} T=${f?.tension.toFixed(2)} test=${f?.effectiveLineTest.toFixed(2)} slack=${f?.slack.toFixed(2)} wear=${f?.wear.toFixed(2)} lift=${x.rodLift.toFixed(2)}`); o(r); }; });
  await g(() => window.__game.fishing.debugBite('largemouth'));
  for (let i = 0; i < 80 && !(await g(() => window.__game.fishing.bite?.phase === 'take')); i++) await page.waitForTimeout(250);
  // 竿を一度下げてから、一気に振り上げる
  await page.mouse.move(480, 420); await page.waitForTimeout(800);
  await page.mouse.move(480, 120); await page.waitForTimeout(1500);
  await shot('a3-hook');
  // ポンピング：巻きながら上げ下げ。魚が横へ走ったら逆へ竿を倒す
  page.on('console', () => {});
  let mx = 480, my = 150;
  const oppose = async () => {
    const st = await g(() => { const x = window.__game.fishing; return x.fight ? [x.fight.side, x.rodSide] : null; });
    if (!st) return;
    const dx = Math.max(-150, Math.min(150, (-Math.sign(st[0]) * 0.9 - st[1]) / 0.004));
    mx += dx; await page.mouse.move(mx, my);
  };
  for (let k = 0; k < 6 && (await ph()) === 'fight'; k++) {
    my += 230; await page.mouse.move(mx, my); await page.mouse.down();
    for (let j = 0; j < 10; j++) { await oppose(); await page.waitForTimeout(250); }
    await page.mouse.up(); my -= 230; await page.mouse.move(mx, my);
    for (let j = 0; j < 10; j++) { await oppose(); await page.waitForTimeout(250); }
    console.log('k', k, await g(() => { const x = window.__game.fishing, f = x.fight; return f ? `d=${f.distance.toFixed(1)} st=${f.staminaFraction.toFixed(2)} T=${f.tension.toFixed(2)} slack=${f.slack.toFixed(2)} lift=${x.rodLift.toFixed(2)} side=${x.rodSide.toFixed(2)} fs=${f.side.toFixed(2)}` : x.phase; }));
  }
  console.log(await g(() => window.__log.join('\n')));
  console.log('toasts:', await g(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' / ')));
  await shot('a4-fight');
  await g(() => { const f = window.__game.fishing.fight; if (f) { f.stamina = 0; f.distance = 2; f.lineOut = 2 + f.rodLift * 2.2; } });
  for (let i = 0; i < 60 && (await ph()) !== 'net'; i++) await page.waitForTimeout(250);
  await shot('a5-net');
  // 上に振って抜き上げる
  await page.mouse.move(480, 300); await page.waitForTimeout(200);
  await page.mouse.move(480, 200);
  await page.waitForTimeout(100);
  console.log('after swipe:', await ph());
  for (let i = 0; i < 4; i++) {
    await page.screenshot({ path: `${out}/a6-haul${i}.png`, timeout: 120000 });
    console.log('haul', i, await g(() => { const x = window.__game.fishing, h = x.haul; return `${x.phase} t=${h.t.toFixed(2)} fit=${h.fit.toFixed(2)} y=${h.mouth.y.toFixed(2)} len=${h.len.toFixed(2)}`; }));
  }
  await browser.close();
})();
