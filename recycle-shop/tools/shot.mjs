// 使い方: node tools/shot.mjs <url> <out.png> [waitMs] [--eval "js"]
import { chromium } from 'playwright-core';
const [url, out, wait = '4000'] = process.argv.slice(2);
const evalIdx = process.argv.indexOf('--eval');
const evalJs = evalIdx > 0 ? process.argv[evalIdx + 1] : null;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }); } catch { logs.push('!! __ready timeout'); }
if (evalJs) { const r = await page.evaluate(evalJs); if (r !== undefined) console.log('eval:', JSON.stringify(r)); }
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(-40).join('\n'));
await browser.close();
