// Play as the human through the real UI (clicks + drags) to exercise interactions.
import { chromium } from 'playwright';
const [url, out, turns = '4'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
await page.goto(url);
const wait = (ms) => page.waitForTimeout(ms);
const has = async (sel) => (await page.locator(sel).count()) > 0;
const btn = (t) => page.locator('button', { hasText: t }).first();
let shots = 0;
const shot = async (n) => page.screenshot({ path: `${out}-${String(shots++).padStart(2, '0')}-${n}.png` });

async function waitMyAction(max = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    if (await has('.guide')) { await btn('はじめる').click(); await wait(300); }
    if (await has('.result')) return 'over';
    const pt = await page.evaluate(() => { const p = window.__battle?.getState().prompt; return p && p.player === 0 ? p.type : null; });
    if (pt === 'setup') return 'setup';
    if (pt === 'choice') return 'choice';
    if (pt === 'cards') { if (await has('.prompt-modal')) return 'cards'; }
    if (pt === 'slot') return 'slot';
    if (pt === 'action' && (await page.locator('.end-turn.ready').count())) return 'action';
    await wait(300);
  }
  return 'timeout';
}

const t00 = Date.now();
for (let step = 0; step < 80 && Date.now() - t00 < 200000; step++) {
  const st = await waitMyAction();
  if (st === 'over' || st === 'timeout') { console.log('end', st); break; }
  if (st === 'choice') { await btn('先攻').click(); continue; }
  if (st === 'setup') {
    const cards = page.locator('.hand-card.can');
    await cards.first().click(); await wait(300);
    if (await cards.count()) { await cards.first().click(); await wait(300); }
    await shot('setup');
    if (await has('.sel-bar.setup')) await btn('準備完了').click({ timeout: 5000 }).catch(() => {});
    continue;
  }
  if (st === 'cards') {
    const picks = page.locator('.prompt-modal .pick.can');
    const n = await picks.count();
    if (n) await picks.first().click();
    await wait(200);
    await shot('cards');
    const ok = page.locator('.prompt-modal .btn.blue');
    if (await ok.isDisabled()) { await picks.nth(1).click().catch(() => {}); }
    await ok.click();
    continue;
  }
  if (st === 'slot') {
    await shot('slot');
    const ok = await page.locator('.slot.hl').first().click({ timeout: 4000 }).then(() => true).catch(() => false);
    if (!ok) {
      const dbg = await page.evaluate(() => {
        const st = window.__battle.getState();
        return { prompt: st.prompt, bench: st.view?.players[0].bench.length, active: !!st.view?.players[0].active, slots: [...document.querySelectorAll('.zone-bench.me .slot, .zone-active.me .slot')].map((e) => e.className + ' ' + e.getAttribute('data-pos')) };
      });
      console.log('DEBUG', JSON.stringify(dbg));
      break;
    }
    continue;
  }
  // my main action: try energy -> active, bench basic via drag, attack
  const turn = await page.locator('.turn-chip small').innerText();
  console.log('my action', turn);
  const energy = page.locator('.hand-card.can').filter({ has: page.locator('.kind-energy') });
  if (await energy.count() && step % 1 === 0) {
    await energy.first().click(); await wait(250);
    if (await has('.slot.hl')) { await page.locator('.zone-active.me .slot').click(); await wait(1500); await shot('attached'); continue; }
    await btn('やめる').click().catch(() => {});
  }
  const basic = page.locator('.hand-card.can').filter({ has: page.locator('.kind-monster') });
  if (await basic.count()) {
    const b = basic.first();
    const box = await b.boundingBox();
    const target = await page.locator('.zone-bench.me').boundingBox();
    if (box && target) {
      await page.mouse.move(box.x + box.width / 2, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
      await page.mouse.up();
      await wait(1200);
      const again = await waitMyAction(8000);
      if (again === 'action') { await shot('dragged'); }
      continue;
    }
  }
  // open menu on active and attack
  await page.locator('.zone-active.me .slot').click(); await wait(500);
  await shot('menu');
  const atk = page.locator('.am-row.attack:not(.disabled)');
  if (await atk.count()) { await atk.last().click(); await wait(2500); await shot('attack'); continue; }
  await page.locator('.am-close').click().catch(() => {});
  await page.locator('.end-turn').click(); await wait(300);
  if (await page.locator('.end-turn.ready').count()) await page.locator('.end-turn').click();
  await wait(1000);
}
await shot('final');
await browser.close();
