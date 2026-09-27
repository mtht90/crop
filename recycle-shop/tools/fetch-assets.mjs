#!/usr/bin/env node
// 外部素材を取得 → 最適化 → public/assets へ配置し、CREDITS.md を生成する。
//   npm run assets            … 未取得分だけ処理
//   npm run assets -- --force … すべて作り直す
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { SOURCES, MODELS, FILES } from './asset-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools/.cache');
const OUT = path.join(ROOT, 'public/assets');
const FORCE = process.argv.includes('--force');

const exists = (p) => fs.access(p).then(() => true, () => false);

const inflight = new Map();
function download(url, dest) {
  if (!inflight.has(dest)) inflight.set(dest, downloadOnce(url, dest));
  return inflight.get(dest);
}

async function downloadOnce(url, dest) {
  if (!FORCE && (await exists(dest))) return;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      // 並列ダウンロード中に中途半端なファイルを読まないよう、一時ファイル経由で置き換える
      const tmp = `${dest}.${process.pid}.${Math.random().toString(36).slice(2)}.part`;
      await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
      await fs.rename(tmp, dest);
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

// .gltf は参照している .bin / 画像も一緒に落とす
async function downloadModel(m) {
  const base = SOURCES[m.src].base;
  const dest = path.join(CACHE, m.src, m.path);
  await download(`${base}/${m.path}`, dest);
  {
    // glb でも外部テクスチャを参照していることがある (Kenney)
    const raw = await fs.readFile(dest);
    const json = m.type === 'gltf' ? JSON.parse(raw.toString('utf8')) : JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString('utf8'));
    const dir = path.posix.dirname(m.path);
    const uris = [...(json.buffers || []), ...(json.images || [])].map((x) => x.uri).filter((u) => u && !u.startsWith('data:'));
    for (const uri of uris) {
      await download(`${base}/${dir}/${encodeURI(decodeURI(uri))}`, path.join(CACHE, m.src, dir, decodeURI(uri)));
    }
  }
  return dest;
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

async function processModel(m) {
  const out = path.join(OUT, 'models', m.out);
  if (!FORCE && (await exists(out))) return;
  const src = await downloadModel(m);
  const doc = await io.read(src);
  const root = doc.getRoot();
  // キャラクターはリグ共通なので、アニメーションは anims.glb に一本化して各モデルからは外す
  const dropAnim = (a) => {
    for (const s of a.listSamplers()) s.dispose();
    for (const c of a.listChannels()) c.dispose();
    a.dispose();
  };
  if (m.keepAnims) {
    for (const a of root.listAnimations()) if (!m.keepAnims.includes(a.getName())) dropAnim(a);
  } else if (m.stripAnims) {
    for (const a of root.listAnimations()) dropAnim(a);
  }
  if (m.stripMeshes) for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
  const transforms = [dedup(), prune({ keepLeaves: !!m.stripMeshes }), resample()];
  if (m.tex) transforms.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [m.tex, m.tex], quality: 82 }));
  if (m.meshopt) { await MeshoptEncoder.ready; transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' })); }
  await doc.transform(...transforms);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await io.write(out, doc);
}

async function pool(items, n, fn) {
  const queue = [...items];
  const errors = [];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) {
      const it = queue.shift();
      try { await fn(it); process.stdout.write('.'); } catch (e) { errors.push([it, e]); process.stdout.write('x'); }
    }
  }));
  process.stdout.write('\n');
  return errors;
}

function credits() {
  const lines = [
    '# CREDITS / 外部素材クレジット',
    '',
    'このゲームのグラフィック・サウンド・アイコンは、以下の外部素材で構成されています。',
    '`tools/asset-manifest.mjs` が一次情報で、このファイルは `npm run assets` で自動生成されます。',
    '',
    '## 素材パック',
    '',
    '| パック | 作者 | ライセンス |',
    '|---|---|---|',
  ];
  for (const s of Object.values(SOURCES)) lines.push(`| [${s.title}](${s.url}) | ${s.author} | ${s.license} |`);
  lines.push('', '## 個別ライセンスのモデル (Khronos glTF Sample Assets)', '', '| モデル | 作者 | ライセンス |', '|---|---|---|');
  for (const m of MODELS.filter((x) => x.license)) lines.push(`| [${m.id.replace('khr_', '')}](${m.url}) | ${m.author} | ${m.license} |`);
  lines.push('', '## 個別ライセンスのファイル', '', '| ファイル | 作者 | ライセンス |', '|---|---|---|');
  for (const f of FILES.filter((x) => x.license)) lines.push(`| ${f.out} | ${f.author} | ${f.license} |`);
  const iconAuthors = [...new Set(FILES.filter((f) => f.src === 'icons').map((f) => f.author))];
  lines.push('', `UI アイコン作者 (game-icons.net, CC-BY 3.0): ${iconAuthors.join(', ')}`);
  lines.push('', '日本語フォント: M PLUS Rounded 1c (SIL OFL 1.1, Google Fonts)', '');
  return lines.join('\n');
}

const t0 = Date.now();
console.log(`models: ${MODELS.length}`);
const modelErrors = await pool(MODELS, 6, processModel);
console.log(`files: ${FILES.length}`);
const fileErrors = await pool(FILES, 8, async (f) => {
  const out = path.join(OUT, f.out);
  if (!FORCE && (await exists(out))) return;
  await download(`${SOURCES[f.src].base}/${f.path}`, out);
});
await fs.writeFile(path.join(ROOT, 'CREDITS.md'), credits());
for (const [it, e] of [...modelErrors, ...fileErrors]) console.error('FAILED', it.id || it.out, e.message);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (modelErrors.length + fileErrors.length) process.exit(1);
