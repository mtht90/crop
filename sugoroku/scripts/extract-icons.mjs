// game-icons.net の公式アーカイブ（作者ごとのフォルダ）から、使うアイコンだけを取り出して
// src/data/icons.gen.ts に書き出す。CC0 の作者（Viscious Speed / Zeromancer）は使わない。
// 使い方: node scripts/extract-icons.mjs <アーカイブを展開した 1x1 フォルダ>
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: extract-icons.mjs <.../icons/ffffff/transparent/1x1>');
const NAMES = fs.readFileSync(new URL('./icon-list.txt', import.meta.url), 'utf8').split(/\s+/).filter(Boolean);
const authors = fs.readdirSync(root).filter((a) => !['viscious-speed', 'zeromancer'].includes(a)).sort((a, b) => (a === 'lorc' ? -1 : a === 'delapouite' ? -1 : 0) - (b === 'lorc' ? -1 : b === 'delapouite' ? -1 : 0));
const out = {};
for (const n of NAMES) {
  const a = authors.find((x) => fs.existsSync(path.join(root, x, `${n}.svg`)));
  if (!a) throw new Error(`アイコンがありません: ${n}`);
  const svg = fs.readFileSync(path.join(root, a, `${n}.svg`), 'utf8');
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]).filter((d) => d !== 'M0 0h512v512H0z');
  out[n] = { a, d: paths.join(' ') };
}
const body = `// 自動生成: scripts/extract-icons.mjs\n// game-icons.net (CC BY 3.0) https://game-icons.net — 作者は各アイコンの a\nexport const ICONS: Record<string, { a: string; d: string }> = ${JSON.stringify(out)};\n`;
fs.writeFileSync(new URL('../src/data/icons.gen.ts', import.meta.url), body);
console.log(`${Object.keys(out).length} 個のアイコンを書き出しました`);
