// src/renderer 内の HTML / CSS と、同梱フォントを dist/renderer にコピーする
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = 'src/renderer';
const outDir = 'dist/renderer';
mkdirSync(outDir, { recursive: true });

for (const file of readdirSync(srcDir)) {
  if (/\.(html|css|svg|png)$/.test(file)) cpSync(join(srcDir, file), join(outDir, file));
}

// ---- フォント (SIL Open Font License) ----
// 和文: Noto Sans JP (可変ウェイト。Unicode 範囲ごとに分割され、使う文字のファイルだけが読み込まれる)
// 欧文: Inter (可変ウェイト。ラテン文字のみ)
const fontsOut = join(outDir, 'fonts');
mkdirSync(join(fontsOut, 'files'), { recursive: true });

const noto = 'node_modules/@fontsource-variable/noto-sans-jp';
const inter = 'node_modules/@fontsource-variable/inter';

/** fontsource の CSS から、必要な @font-face だけを取り出す */
function pick(css, keep) {
  return css
    .split(/(?=\/\* )/)
    .filter((block) => keep(block))
    .join('');
}

const notoCss = pick(readFileSync(join(noto, 'index.css'), 'utf8'), (b) => !/cyrillic|vietnamese/.test(b));
const interCss = pick(readFileSync(join(inter, 'index.css'), 'utf8'), (b) => /inter-latin(-ext)?-wght-normal/.test(b));
writeFileSync(join(fontsOut, 'fonts.css'), `${interCss}\n${notoCss}`);

for (const [dir, test] of [
  [noto, (f) => !/cyrillic|vietnamese/.test(f)],
  [inter, (f) => /^inter-latin(-ext)?-wght-normal\.woff2$/.test(f)],
]) {
  for (const f of readdirSync(join(dir, 'files')).filter(test)) cpSync(join(dir, 'files', f), join(fontsOut, 'files', f));
}
cpSync(join(noto, 'LICENSE'), join(fontsOut, 'LICENSE-NotoSansJP.txt'));
cpSync(join(inter, 'LICENSE'), join(fontsOut, 'LICENSE-Inter.txt'));
