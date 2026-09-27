// Drive a battle in the browser: auto-play the human side with simple clicks and grab screenshots.
import { chromium } from 'playwright';
const [url, outPrefix, count = '6', every = '2500'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
await page.goto(url);
for (let i = 0; i < Number(count); i++) {
  await page.waitForTimeout(Number(every));
  await page.screenshot({ path: `${outPrefix}-${i}.png` });
  // try to progress: choice/ setup / cards / end turn
  const clicked = await page.evaluate(() => {
    const click = (el) => { el && el.click(); return !!el; };
    const btns = [...document.querySelectorAll('button')];
    const byText = (t) => btns.find((b) => b.textContent.includes(t) && !b.disabled);
    if (click(byText('先攻'))) return 'first';
    const hand = [...document.querySelectorAll('.hand-card.can')];
    if (document.querySelector('.sel-bar.setup')) {
      if (hand[0]) { hand[0].click(); }
      const r = byText('準備完了'); if (r) { r.click(); return 'setup'; }
      return 'setup-pick';
    }
    if (click(byText('決定')) || click(byText('選ばない')) || click(byText('OK'))) return 'prompt';
    return null;
  });
  console.log(i, clicked);
}
await browser.close();
