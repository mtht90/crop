// Evaluate a JS snippet in a fresh ?test=new game. Usage: node tools/evaljs.mjs "<js returning value>"
import { chromium } from 'playwright-core';
const code = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(process.argv[3] ?? 'http://127.0.0.1:5173/?test=new');
await page.waitForFunction('window.DONE', null, { timeout: 300000, polling: 500 });
console.log(JSON.stringify(await page.evaluate(code), null, 1));
await browser.close();
