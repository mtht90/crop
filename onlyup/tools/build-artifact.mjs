#!/usr/bin/env node
// claude.ai アーティファクト用に、外部素材をすべて同梱した自己完結版を作る。
//   NODE_USE_ENV_PROXY=1 node tools/build-artifact.mjs <出力先ディレクトリ>
// アーティファクトの CSP では画像・音・fetch は自分のファイルしか読めないため、
// 外部URL → 同梱ファイル の対応表 (window.SKYWARD_ASSETS) をページに埋め込む。
// スクリプト（three.js など）は許可された jsDelivr からそのまま読む。
import { mkdir, writeFile, readFile, readdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allAssetUrls } from '../js/asset-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist-artifact'));
const ASSET_DIR = path.join(OUT, 'a');
await mkdir(ASSET_DIR, { recursive: true });
await mkdir(path.join(OUT, 'js'), { recursive: true });

const urls = allAssetUrls();
const map = {};
let bytes = 0;

async function download(url, dest) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'skyward-build/1.0' } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

const queue = [...urls];
async function worker() {
  while (queue.length) {
    const url = queue.shift();
    const ext = path.extname(new URL(url).pathname) || '.bin';
    const name = createHash('sha1').update(url).digest('hex').slice(0, 12) + ext;
    const dest = path.join(ASSET_DIR, name);
    let fresh = false;
    try { await stat(dest); } catch { await download(url, dest); fresh = true; }
    // ガラクタのモデル用テクスチャは 512px に縮小して容量を抑える（ダウンロード直後に一度だけ）
    if (fresh && /\/Models\/jpg\//.test(url)) {
      try { execFileSync('convert', [dest, '-resize', '512x512>', '-quality', '86', dest]); } catch { /* そのまま */ }
    }
    const size = (await stat(dest)).size;
    bytes += size;
    map[url] = `a/${name}`;
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

// JS をコピー
for (const f of await readdir(path.join(ROOT, 'js'))) {
  if (f.endsWith('.js')) await copyFile(path.join(ROOT, 'js', f), path.join(OUT, 'js', f));
}

// ページ本体：アーティファクトの雛形に合わせて <html>/<head>/<body> を外し、CSS とアセット表を埋め込む
let html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const css = await readFile(path.join(ROOT, 'css', 'style.css'), 'utf8');
const title = html.match(/<title>.*?<\/title>/)[0];
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'))
  .replace(/<meta charset[^>]*>\s*/, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace(title, '')
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<link rel="stylesheet" href="css\/style.css">/, `<style>\n${css}\n</style>`);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const assetScript = `<script>window.SKYWARD_ASSETS = ${JSON.stringify(map)};</script>`;
const page = `${title}\n${head}\n${assetScript}\n${body}`;
await writeFile(path.join(OUT, 'index.html'), page);

console.log(JSON.stringify({ out: OUT, files: Object.keys(map).length, assetMB: +(bytes / 1e6).toFixed(1), pageKB: Math.round(page.length / 1024) }));
