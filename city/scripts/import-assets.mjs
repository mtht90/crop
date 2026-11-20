#!/usr/bin/env node
// 素材の取り込みスクリプト
//   1. assets_src/*.unitypackage を展開（中身は tar.gz。GUIDフォルダごとに asset / pathname が入っている）
//   2. 取り出した FBX を FBX2glTF で .glb に変換して .import-cache/glb/ に置く
//   3. src/config/buildings.ts で使うと決めたモデルだけを public/assets/models/ にコピー
//      （使わない素材はビルドに入れない）
//
// 使い方:  npm run import-assets            … 展開＋変換＋コピー
//          npm run import-assets -- --list  … 変換済みモデルの一覧を表示するだけ
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets_src');
const CACHE = path.join(ROOT, '.import-cache');
const RAW = path.join(CACHE, 'unity');
const GLB = path.join(CACHE, 'glb');
const OUT_MODELS = path.join(ROOT, 'public', 'assets', 'models');

const TEXTURE_EXT = new Set(['.png', '.jpg', '.jpeg', '.tga', '.psd', '.tif', '.tiff']);

function fbx2gltfBin() {
  const plat = { linux: 'Linux', darwin: 'Darwin', win32: 'Windows_NT' }[process.platform];
  const exe = process.platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF';
  const p = path.join(ROOT, 'node_modules', 'fbx2gltf', 'bin', plat, exe);
  if (!fs.existsSync(p)) throw new Error(`FBX2glTF が見つかりません: ${p}（npm install を実行してください）`);
  return p;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** モデル名: FBX のファイル名（拡張子なし）。同名があればフォルダ名を前に付ける */
function modelName(rel, used) {
  let name = path.basename(rel, path.extname(rel)).replace(/[^\w-]+/g, '_');
  if (used.has(name)) name = `${path.basename(path.dirname(rel))}_${name}`.replace(/[^\w-]+/g, '_');
  used.add(name);
  return name;
}

async function extractUnityPackages() {
  const pkgs = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.unitypackage'));
  if (pkgs.length === 0) {
    console.warn('! assets_src/ に .unitypackage がありません（SimplePoly City をここに置いてください）');
    return [];
  }
  const tmp = path.join(CACHE, 'pkg-tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(RAW, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const files = [];
  for (const pkg of pkgs) {
    console.log(`- 展開: ${pkg}`);
    await tar.x({ file: path.join(SRC, pkg), cwd: tmp });
    for (const guid of fs.readdirSync(tmp)) {
      const dir = path.join(tmp, guid);
      const pnFile = path.join(dir, 'pathname');
      const asset = path.join(dir, 'asset');
      if (!fs.existsSync(pnFile) || !fs.existsSync(asset)) continue;
      // pathname は1行目がパス（末尾に "00" などが付くことがある）
      const rel = fs.readFileSync(pnFile, 'utf8').split('\n')[0].trim();
      const ext = path.extname(rel).toLowerCase();
      if (ext !== '.fbx' && !TEXTURE_EXT.has(ext)) continue;
      // パス・トラバーサル対策
      const dest = path.join(RAW, rel);
      if (!dest.startsWith(RAW + path.sep)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(asset, dest);
      files.push(rel);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`  FBX/テクスチャ ${files.length} 件を取り出しました`);
  return files;
}

function convertFbx() {
  const bin = fbx2gltfBin();
  fs.rmSync(GLB, { recursive: true, force: true });
  fs.mkdirSync(GLB, { recursive: true });
  const fbxs = walk(RAW).filter((f) => f.toLowerCase().endsWith('.fbx')).sort();
  const used = new Set();
  const catalog = [];
  for (const fbx of fbxs) {
    const rel = path.relative(RAW, fbx);
    const name = modelName(rel, used);
    const out = path.join(GLB, name); // FBX2glTF が .glb を付ける
    try {
      execFileSync(bin, ['--binary', '--input', fbx, '--output', out, '--pbr-metallic-roughness'], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      const size = fs.statSync(out + '.glb').size;
      catalog.push({ name, source: rel, bytes: size });
    } catch (e) {
      console.warn(`  ! 変換失敗: ${rel}: ${String(e.stderr ?? e).slice(0, 200)}`);
    }
  }
  fs.writeFileSync(path.join(CACHE, 'catalog.json'), JSON.stringify(catalog, null, 2));
  console.log(`- 変換: ${catalog.length}/${fbxs.length} 件 → .import-cache/glb/（一覧は .import-cache/catalog.json）`);
  return catalog;
}

/** src/config/buildings.ts から、使うモデル名（model: '...'）を拾う */
function referencedModels() {
  const files = ['buildings.ts'].map((f) => path.join(ROOT, 'src', 'config', f));
  const names = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/model:\s*'([^']+)'/g)) names.add(m[1]);
  }
  return names;
}

function copyUsedModels() {
  fs.rmSync(OUT_MODELS, { recursive: true, force: true });
  fs.mkdirSync(OUT_MODELS, { recursive: true });
  const names = referencedModels();
  let total = 0;
  const missing = [];
  for (const n of names) {
    const src = path.join(GLB, n + '.glb');
    if (!fs.existsSync(src)) { missing.push(n); continue; }
    fs.copyFileSync(src, path.join(OUT_MODELS, n + '.glb'));
    total += fs.statSync(src).size;
  }
  console.log(`- コピー: ${names.size - missing.length} 件（${(total / 1024).toFixed(0)} KB）→ public/assets/models/`);
  if (missing.length) console.warn(`  ! 設定にあるが変換済みに無いモデル: ${missing.join(', ')}`);
}

async function main() {
  fs.mkdirSync(SRC, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  if (process.argv.includes('--list')) {
    const cat = JSON.parse(fs.readFileSync(path.join(CACHE, 'catalog.json'), 'utf8'));
    for (const c of cat) console.log(`${c.name.padEnd(40)} ${(c.bytes / 1024).toFixed(0).padStart(6)} KB  ${c.source}`);
    return;
  }
  const extracted = await extractUnityPackages();
  if (extracted.length) convertFbx();
  if (fs.existsSync(GLB)) copyUsedModels();
}

main().catch((e) => { console.error(e); process.exit(1); });
