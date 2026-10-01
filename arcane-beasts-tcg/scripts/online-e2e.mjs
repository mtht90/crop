// Two real browsers play an online game through the UI: node scripts/online-e2e.mjs <outprefix> [mode=friend|random]
import { chromium } from 'playwright';
const [out, mode = 'friend'] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const mk = async (name, starter) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror:`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}] console.error:`, m.text().slice(0, 200)));
  await page.goto(BASE + '/');
  await page.evaluate(([n, s]) => {
    localStorage.clear();
    localStorage.setItem('arcane-beasts-online-v1', JSON.stringify({ name: n }));
    localStorage.setItem('arcane-beasts-public-url', 'https://arcane.example.com');
  }, [name, starter]);
  await page.goto(BASE + '/?speed=3');
  await page.evaluate((s) => { const st = window.__stores.useStore.getState(); st.chooseStarter(s); st.update((x) => { x.guideSeen = true; x.settings.speed = 3; }); }, starter);
  await page.evaluate(() => window.__stores.useStore.getState().go('lobby'));
  return page;
};
const A = await mk('アリス', 'fire');
const B = await mk('ボブ', 'water');
await A.waitForTimeout(1500);
let shot = 0;
const snap = async (p, tag) => p.screenshot({ path: `${out}-${String(shot++).padStart(2, '0')}-${tag}.png` });
await snap(A, 'lobby');

if (mode === 'friend') {
  await A.getByText('部屋を作る').click();
  await A.waitForSelector('.lb-room-code');
  await A.waitForSelector('.lb-qr img', { timeout: 10000 });
  const code = await A.locator('.lb-room-code').innerText();
  console.log('room code', code);
  await A.waitForTimeout(500);
  await snap(A, 'room');
  await B.getByPlaceholder('部屋コード', { exact: true }).fill(code);
  await B.getByRole('button', { name: '入る' }).click();
} else {
  await A.getByText('相手をさがす').click();
  await B.getByText('相手をさがす').click();
}

// a UI-level bot: answers prompts the way the unit-test bot does
const bot = (page) => page.evaluate(() => {
  if (window.__bot) return;
  window.__bot = true;
  const { useBattle } = window.__stores;
  const card = window.__card;
  setInterval(() => {
    const ctrl = window.__ctrl; const st = useBattle.getState();
    if (!ctrl || !st.prompt || st.result) return;
    const pr = st.prompt;
    if (window.__lastPrompt === pr) return;
    window.__lastPrompt = pr;
    let ans;
    if (pr.type === 'action') {
      const legal = ctrl.legal();
      const prefer = ['attack', 'playBasic', 'attachEnergy', 'evolve', 'playTrainer', 'endTurn'];
      let a = null;
      for (const t of prefer) { const as = legal.filter((x) => x.t === t); if (as.length) { a = t === 'attack' ? as[as.length - 1] : as[0]; break; } }
      ans = { type: 'action', action: a ?? { t: 'endTurn' } };
    } else if (pr.type === 'cards') ans = { type: 'cards', uids: pr.selectable.slice(0, pr.min) };
    else if (pr.type === 'slot') ans = { type: 'slot', pos: pr.optional ? null : pr.options[0] };
    else if (pr.type === 'choice') ans = { type: 'choice', index: 0 };
    else if (pr.type === 'setup') {
      const hand = st.view.players[0].hand;
      const basics = hand.filter((c) => window.__isBasic(c.cid));
      ans = { type: 'setup', active: basics[0].uid, bench: basics.slice(1, 4).map((c) => c.uid) };
    }
    ctrl.answer(ans);
  }, 120);
});
for (const p of [A, B]) {
  await p.evaluate(async () => {
    const m = await import('/src/engine/cards/index.ts');
    window.__isBasic = (cid) => { const d = m.card(cid); return d.kind === 'monster' && d.stage === 'basic'; };
  });
  await p.waitForSelector('.battle-screen', { timeout: 20000 });
  await bot(p);
}
let C = null;
if (mode === 'random') {
  // a third browser watches the game from the live list
  C = await mk('カール', 'grass');
  await C.waitForSelector('.lb-game', { timeout: 20000 });
  await C.locator('.lb-game').first().click();
  await C.waitForSelector('.battle-screen', { timeout: 10000 });
  console.log('spectator joined');
}
await A.waitForTimeout(6000);
if (process.env.DROP) {
  // cut Alice's connection a few times in mid-game: she must reconnect and resume
  for (let k = 0; k < 3; k++) {
    await A.evaluate(() => window.__online.online.ws.close());
    await A.waitForTimeout(2500);
    console.log('dropped', k + 1, 'status', await A.evaluate(() => window.__online.useOnline.getState().status));
  }
}
if (C) await snap(C, 'spectator');
await snap(A, 'battleA');
await snap(B, 'battleB');
let done = false;
for (let i = 0; i < 90 && !done; i++) {
  await A.waitForTimeout(2000);
  done = (await A.locator('.result').count()) > 0 && (await B.locator('.result').count()) > 0;
  if (i === 10) { await snap(A, 'midA'); await snap(B, 'midB'); }
}
console.log('finished:', done);
if (C) { await C.waitForSelector('.result', { timeout: 15000 }).catch(() => console.log('spectator saw no result')); await snap(C, 'spectatorResult'); }
await A.waitForTimeout(3500);
await snap(A, 'resultA');
await snap(B, 'resultB');
await browser.close();
