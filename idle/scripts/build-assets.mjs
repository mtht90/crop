// Turns the raw packs in idle/assets-src/ into the small web assets the game loads (public/gen/,
// git-ignored): trimmed + downscaled WebP monsters, and the Cozy UI pieces (plus recolored variants,
// which the Cozy UI license allows).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ALLIES, AREAS, slug } from '../src/data/monsters.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'public', 'gen');
const MON_SRC = path.join(SRC, 'librarium', 'Aekashics Librarium Static Battlers', 'Sideview Batch Battlers');

fs.mkdirSync(path.join(OUT, 'mon'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'ui'), { recursive: true });

// ---------- monsters ----------
const big = new Set(AREAS.map((a) => a.boss.sprite));
const stems = new Map();
for (const x of ALLIES) stems.set(x.sprite, 300);
for (const ar of AREAS) {
  for (const m of ar.mobs) stems.set(m.sprite, 220);
  for (const m of ar.elites) stems.set(m.sprite, 300);
}
for (const s of big) stems.set(s, 440);

const manifest = {};
const manifestPath = path.join(OUT, 'manifest.json');
const old = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
let made = 0;
await Promise.all(
  [...stems].map(async ([stem, maxSide]) => {
    const id = slug(stem);
    const file = path.join(MON_SRC, stem + '.png');
    const out = path.join(OUT, 'mon', id + '.webp');
    if (!fs.existsSync(file)) throw new Error('missing sprite: ' + stem);
    if (old[id] && old[id].max === maxSide && fs.existsSync(out)) {
      manifest[id] = old[id];
      return;
    }
    const trimmed = await sharp(file).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
    const { width: ow, height: oh } = trimmed.info;
    const scale = Math.min(1, maxSide / Math.max(ow, oh));
    const w = Math.max(1, Math.round(ow * scale));
    const h = Math.max(1, Math.round(oh * scale));
    await sharp(trimmed.data).resize(w, h, { kernel: 'lanczos3' }).webp({ quality: 88, alphaQuality: 95 }).toFile(out);
    manifest[id] = { w, h, ow, oh, max: maxSide };
    made++;
  }),
);
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`monsters: ${Object.keys(manifest).length} (${made} rebuilt)`);

// ---------- Cozy UI ----------
function findFile(dir, name) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const r = findFile(p, name);
      if (r) return r;
    } else if (ent.name === name) return p;
  }
  return null;
}
const COZY = path.join(SRC, 'cozy-ui');
const UI = [
  'Container1.png',
  'Container3.png',
  'ContainerAdvanced4.png',
  'NoteContainerSimple.png',
  'WoodenContainer1.png',
  'CardRegular1_wood.png',
  'CardRegular1_red.png',
  'SquareButton1_wood.png',
  'SquareButton2_wood.png',
  'SquareButton2_red.png',
  'SquareButton2_white.png',
  'RoundButton1_wood.png',
  'RoundButton1_white.png',
  'RoundButton2_wood.png',
  'RoundButton2_white.png',
  'ItemSlot1.png',
  'ItemSlotSelected1.png',
  'InventoryHotbar.png',
  'Checkbox2_checked.png',
  'Checkbox2_unchecked.png',
  'ArrowBrownOuline16.png',
  'ArrowBrownOuline19.png',
  'ArrowBrownOuline22.png',
  'ArrowBrownOuline23.png',
  'IconsDefault5_64px.png',
  'IconsDefault19_64px.png',
  'IconsDefault25_64px.png',
  'IconsDefault38_64px.png',
  'IconsDefault39_64px.png',
  'Cursor2_32px.png',
  'Cursor2Clicked_32px.png',
];
const uiPath = {};
for (const n of UI) {
  const p = findFile(COZY, n);
  if (!p) throw new Error('Cozy UI file not found: ' + n);
  uiPath[n] = p;
  await sharp(p).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'ui', n));
}

// Recolor the saturated red parts of a piece to another hue, leaving the brown outline and cream body.
async function recolor(srcName, outName, { hue, sat = 1, light = 0 }) {
  const { data, info } = await sharp(uiPath[srcName]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255,
      g = data[i + 1] / 255,
      b = data[i + 2] / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const isRed = (h >= 325 || h <= 6) && s > 0.45;
    if (!isRed) continue;
    const ns = Math.min(1, s * sat);
    const nl = Math.min(1, Math.max(0, l + light * (1 - l)));
    const c = (1 - Math.abs(2 * nl - 1)) * ns;
    const hp = hue / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let [rr, gg, bb] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    const m = nl - c / 2;
    data[i] = Math.round((rr + m) * 255);
    data[i + 1] = Math.round((gg + m) * 255);
    data[i + 2] = Math.round((bb + m) * 255);
  }
  await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'ui', outName));
}

const variants = {
  green: { hue: 96, sat: 0.72, light: -0.06 },
  blue: { hue: 204, sat: 0.8, light: -0.04 },
  gold: { hue: 40, sat: 0.95, light: 0.02 },
  purple: { hue: 276, sat: 0.62, light: -0.02 },
  gray: { hue: 30, sat: 0.08, light: 0.04 },
  teal: { hue: 176, sat: 0.6, light: -0.06 },
};
for (const [k, v] of Object.entries(variants)) {
  await recolor('SquareButton2_red.png', `SquareButton2_${k}.png`, v);
  await recolor('CardRegular1_red.png', `CardRegular1_${k}.png`, v);
}
console.log(`ui: ${UI.length} pieces + ${Object.keys(variants).length * 2} recolors`);
