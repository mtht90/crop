// Render named camera views of a running ?test=new game after simulating N seconds.
// node tools/shots.mjs <outDir> <simSeconds> name:x,y,z,lx,ly,lz[:hour] ...
import { chromium } from 'playwright-core';
import fs from 'fs';
const [out, sim, ...views] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text()); });
await page.goto('http://127.0.0.1:5173/?test=new');
await page.waitForFunction('window.DONE', null, { timeout: 300000, polling: 500 });
if (process.env.PRE) await page.evaluate(process.env.PRE);
await page.evaluate((s) => window.__sim(Number(s), 1 / 20), sim);
for (const v of views) {
  const [name, c, hour] = v.split(':');
  const [x, y, z, lx, ly, lz] = c.split(',').map(Number);
  const data = await page.evaluate(([x, y, z, lx, ly, lz, hour]) => {
    const g = window.__game;
    if (hour) g.state.minute = Number(hour) * 60;
    window.__sim(0.1, 0.05);
    const cam = g.engine.camera;
    g.player.setFocus(new cam.position.constructor(x, y, z), new cam.position.constructor(lx, ly, lz));
    g.player.focus && (g.player.focusT = 1);
    window.__sim(0.1, 0.05);
    const r = window.__shot();
    g.player.setFocus(null);
    return r;
  }, [x, y, z, lx, ly, lz, hour]);
  fs.writeFileSync(`${out}/${name}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('shot', name);
}
await browser.close();
