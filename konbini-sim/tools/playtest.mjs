// Headless play-test: drives the real game in Chromium (SwiftShader) and
// writes screenshots + a JSON log. Usage: node tools/playtest.mjs <outDir> [url]
import { chromium } from 'playwright-core';
import fs from 'fs';
const out = process.argv[2] ?? 'playtest-out';
const url = process.argv[3] ?? 'http://127.0.0.1:5173/?test=new';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[error]', m.text()); } });
await page.goto(url);
await page.waitForFunction('window.DONE', null, { timeout: 300000, polling: 500 });
const shot = async (name) => {
  const data = await page.evaluate('window.__shot()');
  fs.writeFileSync(`${out}/${name}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
};
const state = () => page.evaluate(() => {
  const g = window.__game;
  return {
    clock: g.state.clock(), day: g.state.day, money: Math.round(g.state.money), rep: Math.round(g.state.reputation * 10) / 10,
    customers: g.customers.list.filter((c) => c.state !== 'gone').map((c) => `${c.type}:${c.state}`),
    queue: g.customers.queue.length, atRegister: !!g.checkout.customer, stats: { ...g.state.stats, sold: Object.keys(g.state.stats.sold).length },
    boxes: g.boxes.length, mode: g.mode,
  };
});
const log = [];
const step = async (label, sec) => {
  await page.evaluate((s) => window.__sim(s, 1 / 20), sec);
  const st = await state();
  log.push({ label, ...st });
  console.log(label, JSON.stringify(st));
};
const setCam = (x, y, z, lx, ly, lz) => page.evaluate(([x, y, z, lx, ly, lz]) => {
  const g = window.__game;
  g.player.position.set(x, 0, z);
  g.player.lookAtPoint({ x: lx, y: ly, z: lz, clone() { return this; }, sub() { return this; } } && new (g.engine.camera.position.constructor)(lx, ly, lz));
  window.__sim(0.05);
}, [x, y, z, lx, ly, lz]);

await shot('00-start');
await step('t+20s', 20);
await step('t+60s', 40);
await setCam(-1, 1.6, 4, -3, 1.2, 0);
await shot('01-floor');
await step('t+120s', 60);
// go to register and serve whoever is there
for (let round = 0; round < 6; round++) {
  const hasCust = await page.evaluate(() => !!window.__game.checkout.customer);
  if (!hasCust) { await step(`wait${round}`, 15); continue; }
  await page.evaluate(() => { const g = window.__game; g.mode = 'play'; g.checkout.enter(); });
  await page.evaluate(() => window.__sim(1));
  if (round === 0) await shot('02-register');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Space');
  await page.evaluate(() => window.__sim(0.5));
  const btns = async () => page.$$eval('.register button', (bs) => bs.map((b) => b.textContent + (b.disabled ? '(x)' : '')));
  console.log('buttons', await btns());
  // hot snack if asked
  for (const txt of ['を入れる', '品切れを伝える', '年齢確認']) {
    const b = await page.$(`.register button:has-text("${txt}"):not([disabled])`);
    if (b) { await b.click(); await page.evaluate(() => window.__sim(0.3)); }
  }
  // dialog (age check etc.)
  const d = await page.$('.dialog button');
  if (d) { await d.click(); await page.evaluate(() => window.__sim(0.3)); }
  const pay = await page.$('.register button:has-text("お会計"):not([disabled])');
  if (pay) { await pay.click(); await page.evaluate(() => window.__sim(0.3)); }
  if (round === 0) await shot('03-payment');
  console.log('buttons2', await btns());
  const ecash = await page.$('.register button:has-text("決済する")');
  const changeBox = await page.$('.change-box');
  if (ecash) await ecash.click();
  else if (!changeBox) { console.log('!! could not pay'); }
  else {
    // count out exact change greedily
    const need = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.change-box .big')];
      return Number(els[1].textContent.replace(/[^0-9]/g, ''));
    });
    let rem = need;
    for (const d of [5000, 1000, 500, 100, 50, 10, 5, 1]) {
      while (rem >= d) { await page.click(`.cash button:text-is("¥${d.toLocaleString('ja-JP')}")`); rem -= d; }
    }
    await page.click('.register button:has-text("おつりを渡す")');
  }
  await page.evaluate(() => window.__sim(0.5));
  console.log('served', JSON.stringify(await state()));
  await page.evaluate(() => window.__game.checkout.exit());
  await step(`after${round}`, 10);
}
await step('t+5min', 120);
await setCam(3.0, 1.6, -1.0, 4.2, 1.1, 2.9);
await shot('04-queue');
await step('t+8min', 180);
await setCam(1, 1.7, 13, -3, 1.4, 4);
await shot('05-outside');
fs.writeFileSync(`${out}/log.json`, JSON.stringify({ errors, log }, null, 1));
console.log('errors', errors.length);
await browser.close();
