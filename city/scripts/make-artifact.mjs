#!/usr/bin/env node
// claude.ai のアーティファクトとして公開するための1ページ版を作る。
// JS と CSS をページに埋め込み、素材パックは横に置いたファイルとして読む。文字は Google Fonts から読む。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-artifact');
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const js = [...html.matchAll(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g)].map((m) => fs.readFileSync(path.join(DIST, m[1]), 'utf8'));
const css = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g)].map((m) => fs.readFileSync(path.join(DIST, m[1]), 'utf8'));
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const page = `<title>シティ・コングロマリット</title>
<meta name="theme-color" content="#bfe3f5">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=swap">
<style>${css.join('\n')}</style>
${body.trim()}
<script type="module">${js.join('\n').replace(/<\/script/gi, '<\\/script')}</script>
`;
fs.writeFileSync(path.join(DIST, 'game.html'), page);
// パックは base64 の .txt にする（アーティファクトに置けるファイルの種類に合わせる）
for (const f of fs.readdirSync(path.join(DIST, 'assets'))) {
  if (!f.endsWith('.pack')) continue;
  const p = path.join(DIST, 'assets', f);
  fs.writeFileSync(p + '.txt', fs.readFileSync(p).toString('base64'));
}
console.log(`dist-artifact/game.html (${(page.length / 1024).toFixed(0)} KB) と dist-artifact/assets/*.pack を公開する`);
