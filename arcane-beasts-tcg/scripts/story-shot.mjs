// Visual-novel check: node scripts/story-shot.mjs <outprefix> [prologue|c01|c16 ...]
import { chromium } from 'playwright';
const [out, which = 'prologue'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console.error:', m.text().slice(0, 200)));
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => localStorage.clear());
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => { const st = window.__stores.useStore.getState(); st.chooseStarter('fire'); st.update((s) => { s.guideSeen = true; }); });
await page.evaluate(async (w) => {
  const st = window.__stores.useStore.getState();
  const m = await import('/src/story/index.ts');
  const beats = w === 'prologue' ? m.PROLOGUE : (m.chapterById(w.slice(0, 3)) ?? m.CHAPTERS[0])[w.endsWith('a') ? 'after' : 'before'];
  st.playScene('test:' + w, beats, () => st.go('home'));
}, which);
let n = 0;
const snap = async (tag) => page.screenshot({ path: `${out}-${String(n++).padStart(2, '0')}-${tag}.png` });
await page.waitForTimeout(1500);
await snap('start');
// click through, taking a shot every few lines
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(450);
  const box = await page.locator('.story-text').count();
  if (!box) { if (await page.locator('.story-choice .opt').count()) { await snap('choice'); await page.locator('.story-choice .opt').first().click(); } else if (await page.locator('.story-card').count()) { await snap('card'); await page.waitForTimeout(3600); } continue; }
  await page.mouse.click(640, 300); // finish typing
  await page.waitForTimeout(150);
  if (i % 3 === 0) await snap('line' + i);
  await page.mouse.click(640, 300); // next
  if ((await page.evaluate(() => window.__stores.useStore.getState().screen)) !== 'scene') break;
}
console.log('screen at end:', await page.evaluate(() => window.__stores.useStore.getState().screen));
await browser.close();
