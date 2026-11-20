#!/usr/bin/env node
// 素材の取り込みスクリプト
//
//   assets_src/ に置いた zip から、ゲームで使う素材だけを取り出して public/assets/ にまとめる。
//   素材が1ファイルずつ取り出しやすい形で置かれないよう、すべて「パック」（1つのファイルに複数の素材を
//   まとめ、簡単なスクランブルをかけたもの）にする。ゲーム側は src/render/pack.ts で読む。
//
//   - 3Dモデル：dglopez「Low Poly City Builder Asset Pack」無料版の GLB
//       → src/config/ に model: '...' と書いたものだけを models.pack に
//   - UI：Prinbles「Bliss GUI」の PNG（@2x）→ 1枚のアトラス画像にして ui.pack に
//   - 効果音：Shapeforms → src/config/audio.ts の SFX を mp3 に変換して sfx.pack に（ffmpeg が必要）
//   - BGM：JDSherbert / SunixMuz → src/config/audio.ts の BGM を1曲ずつ bgm-<id>.pack に（ffmpeg が必要）
//   - ライセンス文書を licenses/ にコピー
//
// 使い方:  npm run import-assets            … 取り込み
//          npm run import-assets -- --list  … 3Dモデルの一覧を表示
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { PNG } from 'pngjs';

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

function scramble(buf) {
  const key = Buffer.from(PACK_KEY);
  for (let i = 0; i < buf.length; i++) buf[i] ^= key[i % key.length] ^ (i & 0xff);
  return buf;
}

/** files: [{ name, data(Buffer) }] → パック */
function writePack(fileName, files) {
  const index = [];
  let offset = 0;
  for (const f of files) {
    index.push({ name: f.name, offset, length: f.data.length });
    offset += f.data.length;
  }
  const header = Buffer.from(JSON.stringify(index));
  const head = Buffer.alloc(8);
  head.write(PACK_MAGIC, 0, 'ascii');
  head.writeUInt32LE(header.length, 4);
  const body = scramble(Buffer.concat([header, ...files.map((f) => f.data)]));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, fileName), Buffer.concat([head, body]));
  return offset;
}

function readConfig(file) {
  return fs.readFileSync(path.join(ROOT, 'src', 'config', file), 'utf8');
}

// ---------------------------------------------------------------- 3D
function importCityModels() {
  const zipPath = findZip(/^FREE_VERSION_65_MODELS.*\.zip$/i);
  if (!zipPath) return console.warn('! assets_src/FREE_VERSION_65_MODELS.zip がありません（街の3D素材）');
  const zip = new AdmZip(zipPath);
  const glbs = new Map();
  for (const e of zip.getEntries()) {
    const m = e.entryName.match(/\/GLB\/(?:[^/]+\/)?([^/]+)\.glb$/i);
    if (m && !e.isDirectory) glbs.set(m[1], e);
  }
  if (process.argv.includes('--list')) {
    for (const [name, e] of [...glbs].sort()) console.log(`${name.padEnd(28)} ${(e.header.size / 1024).toFixed(0).padStart(5)} KB`);
    process.exit(0);
  }
  const licDir = path.join(LICENSES, 'dglopez-low-poly-city-builder');
  fs.mkdirSync(licDir, { recursive: true });
  for (const e of zip.getEntries()) {
    const base = path.basename(e.entryName);
    if (/^(LICENSE\.txt|AI_NOTICE\.txt|USAGE_TERMS\.json)$/i.test(base) && e.entryName.split('/').length <= 2) {
      fs.writeFileSync(path.join(licDir, base), e.getData());
    }
  }
  const used = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'config'))) {
    for (const m of readConfig(f).matchAll(/model:\s*'([^']+)'/g)) used.add(m[1]);
  }
  const missing = [...used].filter((n) => !glbs.has(n));
  if (missing.length) console.warn(`! 設定にあるが素材に無いモデル: ${missing.join(', ')}`);
  const files = [...used].sort().filter((n) => glbs.has(n)).map((name) => ({ name, data: glbs.get(name).getData() }));
  const bytes = writePack('models.pack', files);
  console.log(`- 3Dモデル: ${files.length}/${glbs.size} 件 → models.pack（${(bytes / 1024).toFixed(0)} KB）`);
}

// ---------------------------------------------------------------- UI
/** Bliss GUI から使う画像（@2x）。name はゲーム側で使う名前 */
const UI_SPRITES = [
  { name: 'button', file: 'Button/Rect-Medium/Default/Background.png' },
  { name: 'buttonHover', file: 'Button/Rect-Medium/Hover/Background.png' },
  { name: 'buttonSquare', file: 'Button/Square-Medium/Default/Background.png' },
  { name: 'buttonSquareHover', file: 'Button/Square-Medium/Hover/Background.png' },
  { name: 'panel', file: 'Panel/Body/Rounded/Background.png' },
  { name: 'progressBg', file: 'ProgressBar/Background.png' },
  { name: 'progressLine', file: 'ProgressBar/Line.png' },
  { name: 'starOn', file: 'Star/Medium/Active.png' },
  { name: 'starOff', file: 'Star/Medium/Unactive.png' },
  { name: 'iconSoundOn', file: 'Icon/SoundOn.png' },
  { name: 'iconSoundOff', file: 'Icon/SoundOff.png' },
  { name: 'iconLock', file: 'Icon/Locker.png' },
];

function importUi() {
  const zipPath = findZip(/^Prinbles_GUI_Asset_Bliss.*\.zip$/i);
  if (!zipPath) return console.warn('! assets_src/Prinbles_GUI_Asset_Bliss_*.zip がありません（UI素材）');
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const find = (rel) => entries.find((e) => e.entryName.endsWith(`/asset/png@2x/${rel.replace(/\.png$/, "@2x.png")}`));
  const imgs = UI_SPRITES.map((s) => {
    const e = find(s.file);
    if (!e) throw new Error(`Bliss GUI に ${s.file} がありません`);
    return { ...s, png: PNG.sync.read(e.getData()) };
  });
  // 棚詰め（高さ順）でアトラスに並べる
  const W = 1300;
  const pad = 2;
  imgs.sort((a, b) => b.png.height - a.png.height);
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const im of imgs) {
    if (x + im.png.width > W) { x = 0; y += rowH + pad; rowH = 0; }
    im.x = x; im.y = y;
    x += im.png.width + pad;
    rowH = Math.max(rowH, im.png.height);
  }
  const H = y + rowH;
  const atlas = new PNG({ width: W, height: H });
  atlas.data.fill(0);
  const rects = {};
  for (const im of imgs) {
    PNG.bitblt(im.png, atlas, 0, 0, im.png.width, im.png.height, im.x, im.y);
    rects[im.name] = { x: im.x, y: im.y, w: im.png.width, h: im.png.height };
  }
  const png = PNG.sync.write(atlas);
  writePack('ui.pack', [{ name: 'atlas.png', data: png }, { name: 'atlas.json', data: Buffer.from(JSON.stringify(rects)) }]);
  console.log(`- UI: ${imgs.length} 枚 → ui.pack（${W}×${H}, ${(png.length / 1024).toFixed(0)} KB）`);
  const licDir = path.join(LICENSES, 'prinbles-bliss-gui');
  fs.mkdirSync(licDir, { recursive: true });
  const readme = entries.find((e) => /\/readme\.txt$/i.test(e.entryName));
  if (readme) fs.writeFileSync(path.join(licDir, 'readme.txt'), readme.getData());
}

// ---------------------------------------------------------------- 音
function parseAudioConfig() {
  const text = readConfig('audio.ts');
  const sfx = [...text.matchAll(/^\s+(\w+):\s*\{\s*zip:\s*'([^']+)',\s*file:\s*'([^']+)',\s*maxSec:\s*([\d.]+)/gm)].map((m) => ({ key: m[1], zip: m[2], file: m[3], maxSec: Number(m[4]) }));
  const bgm = [...text.matchAll(/\{\s*id:\s*'([^']+)',\s*zip:\s*'([^']+)',\s*file:\s*'([^']+)'/g)].map((m) => ({ id: m[1], zip: m[2], file: m[3] }));
  return { sfx, bgm };
}

function hasFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function zipEntry(zipPrefix, file) {
  const zp = findZip(new RegExp('^' + zipPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*\\.zip$', 'i'));
  if (!zp) return null;
  const zip = new AdmZip(zp);
  return zip.getEntries().find((e) => !e.entryName.includes('__MACOSX') && path.basename(e.entryName) === file) ?? null;
}

function encode(data, ext, args) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-audio-'));
  const inp = path.join(tmp, 'in' + ext);
  const out = path.join(tmp, 'out.mp3');
  fs.writeFileSync(inp, data);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', inp, ...args, out]);
  const buf = fs.readFileSync(out);
  fs.rmSync(tmp, { recursive: true, force: true });
  return buf;
}

function importAudio() {
  if (!hasFfmpeg()) return console.warn('! ffmpeg が見つからないため、音の取り込みを飛ばしました');
  const { sfx, bgm } = parseAudioConfig();
  const sfxFiles = [];
  for (const s of sfx) {
    const e = zipEntry(s.zip, s.file);
    if (!e) { console.warn(`! 効果音が見つかりません: ${s.file}`); continue; }
    const fade = Math.max(0.05, s.maxSec - 0.15);
    const data = encode(e.getData(), path.extname(s.file), ['-t', String(s.maxSec), '-af', `afade=t=out:st=${fade}:d=0.15`, '-ac', '1', '-ar', '44100', '-b:a', '80k']);
    sfxFiles.push({ name: s.key, data });
  }
  const b1 = writePack('sfx.pack', sfxFiles);
  console.log(`- 効果音: ${sfxFiles.length} 件 → sfx.pack（${(b1 / 1024).toFixed(0)} KB）`);
  let total = 0;
  for (const b of bgm) {
    const e = zipEntry(b.zip, b.file);
    if (!e) { console.warn(`! BGM が見つかりません: ${b.file}`); continue; }
    const data = encode(e.getData(), path.extname(b.file), ['-ac', '2', '-ar', '44100', '-b:a', '96k']);
    total += writePack(`bgm-${b.id}.pack`, [{ name: 'music', data }]);
  }
  console.log(`- BGM: ${bgm.length} 曲 → bgm-*.pack（合計 ${(total / 1024).toFixed(0)} KB）`);
  // ライセンス文書
  const sf = zipEntry('Shapeforms', 'Shapeforms Audio License Agreement.pdf');
  if (sf) {
    fs.mkdirSync(path.join(LICENSES, 'shapeforms-audio'), { recursive: true });
    fs.writeFileSync(path.join(LICENSES, 'shapeforms-audio', 'Shapeforms Audio License Agreement.pdf'), sf.getData());
  }
  const sx = zipEntry('Casual-mobile', 'Casual mobile Platformer Music Pack Copyright.txt');
  if (sx) {
    fs.mkdirSync(path.join(LICENSES, 'sunixmuz-casual-music-pack'), { recursive: true });
    fs.writeFileSync(path.join(LICENSES, 'sunixmuz-casual-music-pack', 'Copyright.txt'), sx.getData());
  }
}

importCityModels();
importUi();
importAudio();
