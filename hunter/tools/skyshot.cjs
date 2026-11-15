const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1200, height: 300 } });
for (const [o, out] of process.argv.slice(2).map(s=>s.split('|'))) { await p.goto('http://localhost:5199/tools/sky.html?o='+o); await p.waitForFunction(()=>document.title==='done'); await p.screenshot({path:out}); }
await b.close(); })();
