// Builds glyph-subset web fonts from Google Fonts containing only the characters
// the game actually uses. Re-run (`npm run fonts`) whenever new Japanese text is added.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|html)$/.test(f)) out.push(p);
  }
  return out;
}

const chars = new Set();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
for (const ch of '　、。・ー〜！？「」『』（）【】☆★♪♥◆●▲■×÷…→←↑↓％＋－：／') chars.add(ch);
for (const file of [...walk(join(root, 'src')), join(root, 'index.html')]) {
  for (const ch of readFileSync(file, 'utf8')) if (ch.codePointAt(0) > 0x7f) chars.add(ch);
}
const text = [...chars].sort().join('');
console.log(`glyphs: ${chars.size}`);

const fonts = [
  { family: 'M+PLUS+Rounded+1c:wght@800', out: 'rounded-800.woff2' },
  { family: 'M+PLUS+Rounded+1c:wght@500', out: 'rounded-500.woff2' },
  { family: 'Dela+Gothic+One', out: 'dela.woff2' },
];
mkdirSync(join(root, 'public/fonts'), { recursive: true });
for (const f of fonts) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${f.family}&text=${encodeURIComponent(text)}`, { headers: { 'User-Agent': UA } })).text();
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  if (urls.length !== 1) throw new Error(`unexpected css for ${f.family}: ${css.slice(0, 300)}`);
  const buf = Buffer.from(await (await fetch(urls[0], { headers: { 'User-Agent': UA } })).arrayBuffer());
  writeFileSync(join(root, 'public/fonts', f.out), buf);
  console.log(`${f.out}: ${(buf.length / 1024).toFixed(1)} KB`);
}
