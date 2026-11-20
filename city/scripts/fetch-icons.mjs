#!/usr/bin/env node
// Game-icons.net（GitHub の game-icons/icons）から、src/config/icons.ts に書いたアイコンを取得し、
// src/generated/icons.ts（SVG のパスと作者）を作る。作者ごとのクレジットはゲーム内のクレジット画面に自動で出る。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = fs.readFileSync(path.join(ROOT, 'src/config/icons.ts'), 'utf8');
const entries = [...cfg.matchAll(/^\s+(\w+):\s*'([\w-]+)\/([\w-]+)',/gm)].map((m) => ({ key: m[1], author: m[2], name: m[3] }));
const out = {};
for (const e of entries) {
  const url = `https://raw.githubusercontent.com/game-icons/icons/master/${e.author}/${e.name}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const svg = await res.text();
  // 背景の黒い四角（M0 0h512v512H0z）を除いた path の d を集める
  const ds = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]).filter((d) => !/^M0 0h512v512H0z$/.test(d));
  out[e.key] = { author: e.author, name: e.name, d: ds.join(' ') };
  process.stdout.write('.');
}
const body = `// 自動生成（scripts/fetch-icons.mjs）。手で編集しない。\n// Icons from https://game-icons.net/ (CC BY 3.0)\nexport const ICON_DATA: Record<string, { author: string; name: string; d: string }> = ${JSON.stringify(out, null, 1)};\n`;
fs.mkdirSync(path.join(ROOT, 'src/generated'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/generated/icons.ts'), body);
console.log(`\n${entries.length} icons → src/generated/icons.ts`);
