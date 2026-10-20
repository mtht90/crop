// Builds a glyph-subset web font of めもかっち (SIL OFL 1.1) containing only the
// characters the game actually uses. Re-run (`npm run fonts`) whenever new text is added.
// Needs fonts-src/Memokatchi.ttf (from the official release) and `pip install fonttools brotli`.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
console.log(`glyphs: ${chars.size}`);

mkdirSync(join(root, 'public/fonts'), { recursive: true });
const textFile = join(root, 'fonts-src/.glyphs.txt');
writeFileSync(textFile, [...chars].join(''));
const tmp = join(root, 'public/fonts/memokatchi.tmp.woff2');
execFileSync('pyftsubset', [join(root, 'fonts-src/Memokatchi.ttf'), `--text-file=${textFile}`, '--flavor=woff2', '--layout-features=*', `--output-file=${tmp}`], { stdio: 'inherit' });
// content-hashed name, so a deploy never pairs new text with a cached older subset
const hash = createHash('sha256').update(readFileSync(tmp)).digest('hex').slice(0, 8);
const name = `memokatchi-${hash}.woff2`;
for (const f of readdirSync(join(root, 'public/fonts'))) if (/^memokatchi.*\.woff2$/.test(f) && f !== 'memokatchi.tmp.woff2') unlinkSync(join(root, 'public/fonts', f));
renameSync(tmp, join(root, 'public/fonts', name));
const html = join(root, 'index.html');
writeFileSync(html, readFileSync(html, 'utf8').replace(/fonts\/memokatchi[^']*\.woff2/, `fonts/${name}`));
console.log(`${name}: ${(statSync(join(root, 'public/fonts', name)).size / 1024).toFixed(1)} KB`);
