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

// ---- アーティファクトが配信しない形式（.gltf/.bin/.glb/.hdr）を JSON に詰め替える ----
// モデル：外部 .bin を結合した GLB にし、画像は同梱した jpg/png を直接参照させる。GLB と HDR は base64 で .json に格納。
const { PH_MODELS } = await import('../js/asset-models.js');
const { URLS } = await import('../js/asset-data.js');
const readAsset = (url) => readFile(path.join(OUT, map[url]));
const pad4 = (n) => (4 - (n % 4)) % 4;

function makeGLB(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);
  const binPad = Buffer.concat([bin, Buffer.alloc(pad4(bin.length))]);
  const total = 12 + 8 + jsonPad.length + 8 + binPad.length;
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonPad.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, jh, jsonPad, bh, binPad]);
}
function parseGLB(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const o = 20 + jsonLen;
  const bin = buf.slice(o + 8, o + 8 + buf.readUInt32LE(o));
  return { json, bin };
}
async function packJSON(url, payload) {
  const name = createHash('sha1').update('pack:' + url).digest('hex').slice(0, 12) + '.json';
  await writeFile(path.join(ASSET_DIR, name), JSON.stringify(payload));
  return `a/${name}`;
}

const packed = {};
for (const [id, m] of Object.entries(PH_MODELS)) {
  if (!map[m.gltf]) continue;
  const json = JSON.parse(await readAsset(m.gltf));
  const parts = []; let off = 0; const base = [];
  for (const b of json.buffers) {
    const rel = Object.keys(m.include).find((r) => b.uri && (b.uri === r || decodeURIComponent(b.uri) === r));
    const data = await readAsset(m.include[rel]);
    base.push(off); parts.push(data, Buffer.alloc(pad4(data.length))); off += data.length + pad4(data.length);
  }
  for (const bv of json.bufferViews) { bv.byteOffset = (bv.byteOffset || 0) + base[bv.buffer]; bv.buffer = 0; }
  json.buffers = [{ byteLength: off }];
  for (const img of json.images || []) {
    const rel = Object.keys(m.include).find((r) => img.uri === r || decodeURIComponent(img.uri) === r);
    if (rel) img.uri = map[m.include[rel]];
  }
  packed[m.gltf] = await packJSON(m.gltf, { glb: makeGLB(json, Buffer.concat(parts)).toString('base64') });
}
// 主人公（GLB 内蔵の画像は別ファイルへ書き出す）
{
  const { json, bin } = parseGLB(await readAsset(URLS.hero));
  for (const [i, img] of (json.images || []).entries()) {
    if (img.bufferView === undefined) continue;
    const bv = json.bufferViews[img.bufferView];
    const ext = img.mimeType === 'image/png' ? '.png' : '.jpg';
    const name = createHash('sha1').update('hero-img' + i).digest('hex').slice(0, 12) + ext;
    await writeFile(path.join(ASSET_DIR, name), bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    img.uri = `a/${name}`; delete img.bufferView; delete img.mimeType;
  }
  packed[URLS.hero] = await packJSON(URLS.hero, { glb: makeGLB(json, bin).toString('base64') });
}
packed[URLS.hdr] = await packJSON(URLS.hdr, { hdr: (await readAsset(URLS.hdr)).toString('base64') });
// 詰め替えたものは対応表を差し替え、元ファイルは削除
const { unlink } = await import('node:fs/promises');
const drop = new Set();
for (const [id, m] of Object.entries(PH_MODELS)) { if (map[m.gltf]) { drop.add(m.gltf); for (const [r, u] of Object.entries(m.include)) if (!/\.(jpe?g|png)$/i.test(r)) drop.add(u); } }
drop.add(URLS.hero); drop.add(URLS.hdr);
for (const u of drop) { try { await unlink(path.join(OUT, map[u])); } catch { /* 既に無い */ } delete map[u]; }
Object.assign(map, packed);

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

const listing = [];
for (const f of await readdir(ASSET_DIR)) listing.push({ path: `a/${f}` });
for (const f of await readdir(path.join(OUT, 'js'))) listing.push({ path: `js/${f}` });
await writeFile(path.join(OUT, 'files.json'), JSON.stringify(listing));
let total = 0; for (const f of listing) total += (await stat(path.join(OUT, f.path))).size;
console.log(JSON.stringify({ out: OUT, files: listing.length, totalMB: +(total / 1e6).toFixed(1), pageKB: Math.round(page.length / 1024) }));
