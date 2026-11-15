const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + e.stack));
  const t0 = Date.now();
  await p.goto('http://localhost:5199/?autolock');
  await p.waitForSelector('#title', { state: 'visible', timeout: 180000 });
  console.log('loaded in', (Date.now() - t0) / 1000, 's');
  await p.screenshot({ path: OUT + '/01_title.png' });
  await p.click('#start');
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/02_base.png' });
  await p.click('#go');
  await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '/03_hunt.png' });
  const steps = JSON.parse(process.env.STEPS || '[]');
  for (const s of steps) {
    if (s.eval) { const r = await p.evaluate(s.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r).slice(0, 800)); }
    if (s.key) { await p.keyboard.down(s.key); await p.waitForTimeout(s.ms || 500); await p.keyboard.up(s.key); }
    if (s.click) { await p.mouse.move(640, 360); await p.mouse.down({ button: s.button || 'left' }); await p.waitForTimeout(s.ms || 80); await p.mouse.up({ button: s.button || 'left' }); }
    if (s.wait) await p.waitForTimeout(s.wait);
    if (s.shot) await p.screenshot({ path: OUT + '/' + s.shot + '.png' });
  }
  const fps = await p.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  console.log('fps', fps);
  console.log(errs.slice(0, 30).join('\n'));
  await b.close();
})();
