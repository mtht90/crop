#!/usr/bin/env node
// 素材の取り込みスクリプト
//
//   assets_src/ に置いた zip から、ゲームで使う素材だけを取り出して public/assets/ にまとめる。
//   - 3Dモデル：dglopez「Low Poly City Builder Asset Pack」(FREE_VERSION_65_MODELS.zip) の GLB
//     → src/config/buildings.ts で使うと書いたモデルだけを 1 つのパック (models.pack) にまとめる。
//       素材が1ファイルずつ取り出しやすい形で置かれないよう、パックは簡単なスクランブルをかける。
//   - ライセンス文書は licenses/ にコピーする（ライセンス上、素材と一緒に残すことが求められている）。
//
// 使い方:  npm run import-assets            … 取り込み
//          npm run import-assets -- --list  … zip の中のモデル一覧と大きさを表示
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets_src');
const OUT = path.join(ROOT, 'public', 'assets');
const LICENSES = path.join(ROOT, 'licenses');

/** ゲーム側 (src/render/pack.ts) と同じ値にする */
const PACK_MAGIC = 'CCPK';
const PACK_KEY = 'city-conglomerate';

function findZip(pattern) {
  if (!fs.existsSync(SRC)) return null;
  const f = fs.readdirSync(SRC).find((n) => pattern.test(n));
  return f ? path.join(SRC, f) : null;
}

/** src/config/*.ts から model: '...' を拾う（使う素材だけをビルドに入れるため） */
function referencedModels() {
  const dir = path.join(ROOT, 'src', 'config');
  const names = new Set();
  for (const f of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of text.matchAll(/model:\s*'([^']+)'/g)) names.add(m[1]);
  }
  return names;
}

function scramble(buf) {
  const key = Buffer.from(PACK_KEY);
  for (let i = 0; i < buf.length; i++) buf[i] ^= key[i % key.length] ^ (i & 0xff);
  return buf;
}

function importCityModels() {
  const zipPath = findZip(/^FREE_VERSION_65_MODELS.*\.zip$/i);
  if (!zipPath) {
    console.warn('! assets_src/FREE_VERSION_65_MODELS.zip がありません（街の3D素材）');
    return;
  }
  const zip = new AdmZip(zipPath);
  const glbs = new Map();
  for (const e of zip.getEntries()) {
    const m = e.entryName.match(/\/GLB\/(?:[^/]+\/)?([^/]+)\.glb$/i);
    if (m && !e.isDirectory) glbs.set(m[1], e);
  }
  if (process.argv.includes('--list')) {
    for (const [name, e] of [...glbs].sort()) console.log(`${name.padEnd(28)} ${(e.header.size / 1024).toFixed(0).padStart(5)} KB`);
    return;
  }

  // ライセンス文書
  const licDir = path.join(LICENSES, 'dglopez-low-poly-city-builder');
  fs.mkdirSync(licDir, { recursive: true });
  for (const e of zip.getEntries()) {
    const base = path.basename(e.entryName);
    if (/^(LICENSE\.txt|AI_NOTICE\.txt|USAGE_TERMS\.json)$/i.test(base) && e.entryName.split('/').length <= 2) {
      fs.writeFileSync(path.join(licDir, base), e.getData());
    }
  }

  const used = referencedModels();
  const missing = [...used].filter((n) => !glbs.has(n));
  if (missing.length) console.warn(`! 設定にあるが素材に無いモデル: ${missing.join(', ')}`);

  const index = [];
  const parts = [];
  let offset = 0;
  for (const name of [...used].sort()) {
    const e = glbs.get(name);
    if (!e) continue;
    const data = e.getData();
    index.push({ name, offset, length: data.length });
    parts.push(data);
    offset += data.length;
  }
  const header = Buffer.from(JSON.stringify(index));
  const head = Buffer.alloc(8);
  head.write(PACK_MAGIC, 0, 'ascii');
  head.writeUInt32LE(header.length, 4);
  const body = scramble(Buffer.concat([header, ...parts]));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'models.pack'), Buffer.concat([head, body]));
  console.log(`- 3Dモデル: ${index.length}/${glbs.size} 件を models.pack に格納（${(offset / 1024).toFixed(0)} KB）`);
}

importCityModels();
