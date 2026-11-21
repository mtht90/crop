// Converts the raw packs in idle/assets-src/ into the small web assets the game loads (public/gen/,
// git-ignored). Only resizing / trimming / recoloring / packing frames happens here — every pixel
// still comes from the external packs listed in CREDITS.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ALLIES, AREAS, slug } from '../src/data/monsters.ts';
import { EQUIPS, SKILLS } from '../src/data/items.ts';
import { BGS, FX, ITEMS, GLYPHS, ICON_CREAM, TIER_COLOR, ELEMENT_COLOR, SFX, MUSIC } from '../src/data/assets.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'public', 'gen');
const src = (p) => path.join(SRC, p);
for (const d of ['mon', 'ui', 'bg', 'fx', 'items', 'icons', 'audio']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const manifestPath = path.join(OUT, 'manifest.json');
const old = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const manifest = { mon: {}, fx: {}, bg: [] };
const fresh = (out, key, sig) => fs.existsSync(out) && old[key] && JSON.stringify(old[key]) === JSON.stringify(sig);
const mod = (img, s) => (s.hue || s.sat || s.light ? img.modulate({ hue: s.hue ?? 0, saturation: s.sat ?? 1, brightness: s.light ?? 1 }) : img);

// ---------- monsters (Librarium) ----------
const MON_SRC = src('librarium/Aekashics Librarium Static Battlers/Sideview Batch Battlers');
const stems = new Map();
for (const x of ALLIES) stems.set(x.sprite, 300);
for (const ar of AREAS) {
  for (const m of ar.mobs) stems.set(m.sprite, 220);
  for (const m of ar.elites) stems.set(m.sprite, 300);
}
for (const ar of AREAS) stems.set(ar.boss.sprite, 440);
const oldMon = old.mon ?? {};
await Promise.all(
  [...stems].map(async ([stem, maxSide]) => {
    const id = slug(stem);
    const out = path.join(OUT, 'mon', id + '.webp');
    if (oldMon[id]?.max === maxSide && fs.existsSync(out)) return (manifest.mon[id] = oldMon[id]);
    const t = await sharp(path.join(MON_SRC, stem + '.png')).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
    const { width: ow, height: oh } = t.info;
    const k = Math.min(1, maxSide / Math.max(ow, oh));
    const w = Math.max(1, Math.round(ow * k));
    const h = Math.max(1, Math.round(oh * k));
    await sharp(t.data).resize(w, h).webp({ quality: 88, alphaQuality: 95 }).toFile(out);
    manifest.mon[id] = { w, h, ow, oh, max: maxSide };
  }),
);
console.log(`monsters: ${Object.keys(manifest.mon).length}`);

// ---------- field backgrounds (CraftPix) ----------
for (let i = 0; i < BGS.length; i++) {
  const b = BGS[i];
  const out = path.join(OUT, 'bg', `area${i + 1}.webp`);
  const sig = { ...b, v: 2 };
  if (!fresh(out, 'bg' + i, sig)) await mod(sharp(src(b.src)).resize(1600, 900), b).webp({ quality: 80 }).toFile(out);
  manifest['bg' + i] = sig;
  manifest.bg.push({ file: `area${i + 1}.webp`, ground: b.ground });
}
console.log(`backgrounds: ${BGS.length}`);

// ---------- effects → horizontal sprite sheets ----------
const frameNo = (f) => Number((f.match(/(\d+)(?=\.png$)/) ?? [0, 0])[1]);
for (const [name, s] of Object.entries(FX)) {
  const files = fs
    .readdirSync(src(s.dir))
    .filter((f) => f.endsWith('.png'))
    .sort((a, b) => frameNo(a) - frameNo(b))
    .slice(0, s.take ?? Infinity);
  const [cw, ch] = s.cell;
  const out = path.join(OUT, 'fx', name + '.webp');
  const sig = { ...s, n: files.length, v: 2 };
  manifest.fx[name] = { n: files.length, w: cw, h: ch };
  if (fresh(out, 'fx_' + name, sig)) {
    manifest['fx_' + name] = sig;
    continue;
  }
  const frames = await Promise.all(
    files.map(async (f) => mod(sharp(path.join(src(s.dir), f)).resize(cw, ch, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }), s).png().toBuffer()),
  );
  await sharp({ create: { width: cw * frames.length, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((input, i) => ({ input, left: i * cw, top: 0 })))
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(out);
  manifest['fx_' + name] = sig;
}
console.log(`effects: ${Object.keys(FX).length}`);

// ---------- items ----------
for (const [name, s] of Object.entries(ITEMS)) {
  const out = path.join(OUT, 'items', name + '.png');
  if (fresh(out, 'it_' + name, s)) {
    manifest['it_' + name] = s;
    continue;
  }
  await mod(sharp(src(s.src)).trim({ threshold: 1 }).resize(s.size, s.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }), s).png().toFile(out);
  manifest['it_' + name] = s;
}

// ---------- icons: game-icons.net glyph, recolored, with a Cozy-style brown outline ----------
const GI = src('game-icons/icons/ffffff/transparent/1x1');
const OUTLINE = [122, 65, 52];
const disk = (r) => {
  const o = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) o.push([x, y]);
  return o;
};
const DISK = disk(6);
async function icon(name, glyph, color) {
  const out = path.join(OUT, 'icons', name + '.png');
  const sig = { glyph, color, v: 3 };
  if (fresh(out, 'ic_' + name, sig)) return (manifest['ic_' + name] = sig);
  const S = 128;
  const P = 12;
  const svg = fs.readFileSync(path.join(GI, glyph), 'utf8').replace(/fill="#fff"/g, `fill="${color}"`);
  const glyphPng = await sharp(Buffer.from(svg), { density: 300 }).resize(S - P * 2, S - P * 2).extend({ top: P, bottom: P, left: P, right: P, background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
  const outBuf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let a = 0;
      for (const [dx, dy] of DISK) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
        const v = glyphPng[(yy * S + xx) * 4 + 3];
        if (v > a) a = v;
        if (a === 255) break;
      }
      const i = (y * S + x) * 4;
      outBuf[i] = OUTLINE[0];
      outBuf[i + 1] = OUTLINE[1];
      outBuf[i + 2] = OUTLINE[2];
      outBuf[i + 3] = a;
    }
  await sharp(outBuf, { raw: { width: S, height: S, channels: 4 } })
    .composite([{ input: glyphPng, raw: { width: S, height: S, channels: 4 } }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  manifest['ic_' + name] = sig;
}
const iconJobs = [];
for (const [name, glyph] of Object.entries(GLYPHS)) iconJobs.push([name, glyph, ICON_CREAM]);
for (const e of EQUIPS) {
  const [shape, tier] = e.icon.split(':');
  iconJobs.push([`eq_${shape}_${tier}`, GLYPHS[shape], TIER_COLOR[tier]]);
}
const kindGlyph = { strike: 'strike', nova: 'nova', bolt: 'bolt', heal: 'heal', buff: 'buff', shield: 'barrier', freeze: 'freeze', drain: 'drain', meteor: 'meteor' };
for (const s of SKILLS) iconJobs.push([`sk_${s.kind}_${s.el}`, GLYPHS[kindGlyph[s.kind]], ELEMENT_COLOR[s.el]]);
const seen = new Set();
await Promise.all(iconJobs.filter(([n]) => !seen.has(n) && seen.add(n)).map(([n, g, c]) => icon(n, g, c)));
console.log(`icons: ${seen.size}`);

// ---------- Cozy UI pieces (+ recolors) ----------
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
const UI = [
  'Container1.png', 'Container3.png', 'ContainerAdvanced4.png', 'NoteContainerSimple.png', 'WoodenContainer1.png',
  'CardRegular1_wood.png', 'CardRegular1_red.png', 'SquareButton1_wood.png', 'SquareButton2_wood.png', 'SquareButton2_red.png',
  'SquareButton2_white.png', 'RoundButton1_wood.png', 'RoundButton1_white.png', 'RoundButton2_wood.png', 'RoundButton2_white.png',
  'ItemSlot1.png', 'ItemSlotSelected1.png', 'InventoryHotbar.png', 'Checkbox2_checked.png', 'Checkbox2_unchecked.png',
  'ArrowBrownOuline16.png', 'ArrowBrownOuline19.png', 'ArrowBrownOuline22.png', 'ArrowBrownOuline23.png',
  'IconsDefault5_64px.png', 'IconsDefault19_64px.png', 'IconsDefault25_64px.png', 'IconsDefault38_64px.png', 'IconsDefault39_64px.png',
  'Cursor2_32px.png', 'Cursor2Clicked_32px.png',
];
const COZY = src('cozy-ui');
const uiPath = {};
for (const n of UI) {
  const p = findFile(COZY, n);
  if (!p) throw new Error('Cozy UI file not found: ' + n);
  uiPath[n] = p;
  await sharp(p).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'ui', n));
}
function rgb2hsl(r, g, b) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
}
/** recolor pixels matching `pick(h,s,l)` to the target hue (keeping relative lightness) */
async function recolor(srcName, outName, pick, { hue, sat = 1, light = 0 }) {
  const { data, info } = await sharp(uiPath[srcName]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [h, s, l] = rgb2hsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    const p = pick(h, s, l);
    if (!p) continue;
    const ns = typeof p === 'object' ? p.s : Math.min(1, s * sat);
    const nl = typeof p === 'object' ? p.l : Math.min(1, Math.max(0, l + light * (1 - l)));
    [data[i], data[i + 1], data[i + 2]] = hsl2rgb(hue, ns, nl);
  }
  await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'ui', outName));
}
const isRed = (h, s) => (h >= 325 || h <= 6) && s > 0.45;
const variants = {
  green: { hue: 96, sat: 0.72, light: -0.06 },
  blue: { hue: 204, sat: 0.8, light: -0.04 },
  gold: { hue: 40, sat: 0.95, light: 0.02 },
  purple: { hue: 276, sat: 0.62, light: -0.02 },
  gray: { hue: 30, sat: 0.08, light: 0.04 },
  teal: { hue: 176, sat: 0.6, light: -0.06 },
};
for (const [k, v] of Object.entries(variants)) {
  await recolor('SquareButton2_red.png', `SquareButton2_${k}.png`, isRed, v);
  await recolor('CardRegular1_red.png', `CardRegular1_${k}.png`, isRed, v);
}
// red notification badge from the round white button (cream face → red, pink rim → dark red)
await recolor('RoundButton1_white.png', 'RoundButton1_red.png', (h, s, l) => (l > 0.9 ? { s: 0.88, l: 0.64 } : l > 0.72 && s > 0.3 ? { s: 0.75, l: 0.45 } : null), { hue: 356 });
await recolor('RoundButton2_white.png', 'RoundButton2_purple.png', (h, s, l) => (l > 0.9 ? { s: 0.45, l: 0.72 } : l > 0.72 && s > 0.3 ? { s: 0.4, l: 0.55 } : null), { hue: 276 });
console.log('ui pieces ok');

// ---------- audio ----------
manifest.sfx = {};
for (const [name, files] of Object.entries(SFX)) {
  manifest.sfx[name] = files.map((f, i) => {
    const outName = `${name}_${i}.ogg`;
    fs.copyFileSync(src(f), path.join(OUT, 'audio', outName));
    return outName;
  });
}
manifest.music = {};
for (const [name, f] of Object.entries(MUSIC)) {
  const outName = name + path.extname(f);
  fs.copyFileSync(src(f), path.join(OUT, 'audio', outName));
  manifest.music[name] = outName;
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
console.log('audio ok, manifest written');
