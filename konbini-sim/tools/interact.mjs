// Drives the player with real keyboard/mouse events: pick up a delivery box,
// carry it to a shelf, stock it, open the PC, place an order, fry snacks.
import { chromium } from 'playwright-core';
import fs from 'fs';
const out = process.argv[2] ?? 'interact-out';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[error]', m.text()); } });
await page.goto('http://127.0.0.1:5173/?test=new');
await page.waitForFunction('window.DONE', null, { timeout: 300000, polling: 500 });
const sim = (s) => page.evaluate((s) => window.__sim(s, 1 / 30), s);
const shot = async (name) => fs.writeFileSync(`${out}/${name}.jpg`, Buffer.from((await page.evaluate('window.__shot()')).split(',')[1], 'base64'));
const face = (x, z, lx, ly, lz) => page.evaluate(([x, z, lx, ly, lz]) => {
  const g = window.__game;
  g.player.position.set(x, 0, z);
  g.player.lookAtPoint(new g.engine.camera.position.constructor(lx, ly, lz));
  window.__sim(0.05, 0.05);
}, [x, z, lx, ly, lz]);
const press = async (key) => { await page.keyboard.press(key); await sim(0.1); };
const click = async (button = 'left') => { await page.mouse.click(640, 360, { button }); await sim(0.1); };
const info = () => page.evaluate(() => {
  const g = window.__game;
  const h = g.player.held;
  return { held: h ? (h.kind === 'box' ? `${h.box.productId}:${h.box.count}` : h.kind) : null, prompt: document.querySelector('.prompt')?.textContent, mode: g.mode, money: g.state.money, tut: g.state.tutorial };
});

// 1) pick up the first delivery box
const box = await page.evaluate(() => { const b = window.__game.boxes[0]; const p = b.mesh.position; return [p.x, p.y, p.z, b.productId]; });
console.log('box', box);
await face(box[0], box[2] + 1.2, box[0], box[1] + 0.1, box[2]);
console.log('look box', await info());
await press('e');
console.log('after E', await info());
await shot('01-holding');
// 2) find an empty/matching slot for that product and stock 3 units
const target = await page.evaluate((pid) => {
  const g = window.__game;
  const p = g.boxes.find((b) => b.productId === pid) ?? g.player.held.box;
  const s = g.store.slots.find((s) => s.zone === p.product.zone && (s.productId === pid || !s.items.length) && s.canAccept(p.product));
  const w = s.frame.getWorldPosition(new g.engine.camera.position.constructor());
  const n = new g.engine.camera.position.constructor(0, 0, 1).applyQuaternion(s.frame.getWorldQuaternion(new (g.engine.camera.quaternion.constructor)()));
  return { a: [s.access.x, s.access.z], w: [w.x, w.y + 0.08, w.z], n: [n.x, n.z], before: s.items.length, id: s.id };
}, box[3]);
await face(target.w[0] + target.n[0] * 0.8, target.w[2] + target.n[1] * 0.8, target.w[0] - target.n[0] * 0.15, target.w[1], target.w[2] - target.n[1] * 0.15);
console.log('look slot', await info());
await click(); await click(); await click();
const after = await page.evaluate((id) => window.__game.store.slots.find((s) => s.id === id).items.length, target.id);
console.log('stocked', target.before, '->', after, await info());
await shot('02-stocking');
// 3) put the box down with Q
await press('q');
console.log('after Q', await info());
// 4) PC ordering
const pc = await page.evaluate(() => { const p = window.__game.store.anchors.pc.getWorldPosition(new window.__game.engine.camera.position.constructor()); return [p.x, p.y, p.z]; });
await face(pc[0], pc[2] + 1.0, pc[0], pc[1] + 0.3, pc[2]);
console.log('look pc', await info());
await press('e');
await sim(0.2);
console.log('pc open', await page.$$eval('.modal header h2', (e) => e.map((x) => x.textContent)));
for (let i = 0; i < 2; i++) await page.click('.modal table tr:nth-child(2) .stepper button:nth-child(3)');
await shot('03-pc');
await page.click('.modal footer button.primary');
console.log('ordered', await page.evaluate(() => JSON.stringify(window.__game.state.orders)), await info());
await page.click('.modal header button:has-text("閉じる")');
await sim(0.2);
// 5) fryer
const fr = await page.evaluate(() => { const p = window.__game.store.anchors.fryer.getWorldPosition(new window.__game.engine.camera.position.constructor()); return [p.x, p.y, p.z]; });
await face(fr[0] - 1.0, fr[2], fr[0], fr[1] + 0.3, fr[2]);
console.log('look fryer', await info());
await press('e');
await sim(0.2);
await shot('04-fryer-menu');
const fry = await page.$('.modal button.primary:has-text("揚げる")');
if (fry) await fry.click();
await sim(35);
console.log('fryer after 35s', await info());
await press('e');
console.log('hot case', await page.evaluate(() => window.__game.state.hotCase.length));
// 6) register PC-look & delivery arrival
await sim(60);
console.log('state', await page.evaluate(() => ({ clock: window.__game.state.clock(), orders: window.__game.state.orders.length, boxes: window.__game.boxes.length, driver: !!window.__game.deliveries.driver })));
await shot('05-end');
fs.writeFileSync(`${out}/errors.json`, JSON.stringify(errors));
console.log('errors', errors.length);
await browser.close();
