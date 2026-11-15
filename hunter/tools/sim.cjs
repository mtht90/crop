// 描画を最小限にしてロジックを検証する
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || '/tmp';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); else if (m.text().startsWith('T:')) console.log(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + e.stack));
  await p.goto('http://localhost:5199/?autolock');
  await p.waitForSelector('#title', { state: 'visible', timeout: 180000 });
  await p.click('#start');
  if (process.env.SETUP) await p.evaluate(process.env.SETUP);
  await p.click('#go');
  await p.waitForTimeout(500);
  const script = fs.readFileSync(process.argv[2], 'utf8');
  let res; try { res = await p.evaluate(script); } catch (e) { res = String(e).slice(0, 200); }
  console.log(JSON.stringify(res, null, 1).slice(0, 4000));
  if (process.env.SHOT) { await p.waitForTimeout(1500); await p.screenshot({ path: OUT + '/' + process.env.SHOT + '.png' }); }
  console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();
