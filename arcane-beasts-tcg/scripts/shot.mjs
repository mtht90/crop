// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs]
import { chromium } from 'playwright';
const [url, out, w = '1600', h = '900', wait = '1500'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
await browser.close();
