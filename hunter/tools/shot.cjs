const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  for (const spec of process.argv.slice(2)) {
    const [m, out, qs] = spec.split('|');
    await p.goto(`http://localhost:5199/tools/viewer.html?m=${m}&${qs||''}`);
    await p.waitForFunction(() => document.title === 'done', null, { timeout: 60000 });
    const info = await p.evaluate(() => window.INFO);
    console.log(m, JSON.stringify(info).slice(0, 1500));
    await p.screenshot({ path: out });
  }
  await b.close();
})();
