// Converts the raw packs in idle/assets-src/ into the small web assets the game loads (public/gen/,
// git-ignored). Only resizing / trimming / recoloring / packing frames happens here — every pixel
// still comes from the external packs listed in CREDITS.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ALLIES, AREAS, slug } from '../src/data/monsters.ts';
import { EQUIPS, SKILLS } from '../src/data/items.ts';
import { BGS, FX, ITEMS, GLYPHS, PAINTED, paintedSrc, ICON_CREAM, ICON_OUTLINE, ELEMENT_COLOR, SFX, MUSIC } from '../src/data/assets.ts';
import { readPsd, initializeCanvas } from 'ag-psd';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'public', 'gen');
const src = (p) => path.join(SRC, p);
fs.rmSync(path.join(OUT, 'ui'), { recursive: true, force: true });
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

// ---------- glyph icons: game-icons.net, recolored, with a dark outline ----------
const GI = src('game-icons/icons/ffffff/transparent/1x1');
const OUTLINE = ICON_OUTLINE;
const disk = (r) => {
  const o = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) o.push([x, y]);
  return o;
};
const DISK = disk(6);
async function icon(name, glyph, color) {
  const out = path.join(OUT, 'icons', name + '.png');
  const sig = { glyph, color, o: OUTLINE, v: 4 };
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
  await sharp(outBuf, { raw: { width: S, height: S, channels: 4 } }).composite([{ input: glyphPng, raw: { width: S, height: S, channels: 4 } }]).png({ compressionLevel: 9 }).toFile(out);
  manifest['ic_' + name] = sig;
}
const iconJobs = [];
for (const [name, glyph] of Object.entries(GLYPHS)) if (!PAINTED[name]) iconJobs.push([name, glyph, ICON_CREAM]);
const kindGlyph = { strike: 'strike', nova: 'nova', bolt: 'bolt', heal: 'heal', buff: 'buff', shield: 'barrier', freeze: 'freeze', drain: 'drain', meteor: 'meteor' };
for (const s of SKILLS) iconJobs.push([`sk_${s.kind}_${s.el}`, GLYPHS[kindGlyph[s.kind]], ELEMENT_COLOR[s.el]]);
const seen = new Set();
await Promise.all(iconJobs.filter(([n]) => !seen.has(n) && seen.add(n)).map(([n, g, c]) => icon(n, g, c)));

// ---------- painted icons (Ravenmore): UI icons + one per equipment item ----------
const painted = Object.entries(PAINTED).map(([n, k]) => [n, k]);
for (const e of EQUIPS) painted.push(['eq_' + e.id, e.icon]);
await Promise.all(
  painted.map(([n, k]) =>
    sharp(src(paintedSrc(k)))
      .trim({ threshold: 1 })
      .resize(112, 112, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, 'icons', n + '.png')),
  ),
);
console.log(`icons: ${seen.size} glyph + ${painted.length} painted`);

// ---------- UI kit: Ravenmore "Fantasy UI Elements" (layered PSD) ----------
initializeCanvas(
  () => {
    throw new Error('canvas not needed');
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
);
const psd = readPsd(fs.readFileSync(src('ravenmore/ADOM-OGA-UI-SmartObject.psd')), { useImageData: true, skipThumbnail: true, skipCompositeImageData: true });
const layers = {};
(function walk(ch, pre) {
  for (const l of ch || []) {
    const n = (pre ? pre + '/' : '') + l.name;
    if (l.imageData) layers[n] = l;
    walk(l.children, n);
  }
})(psd.children, '');
const L = (name) => {
  const l = layers[name];
  if (!l) throw new Error('PSD layer missing: ' + name);
  const { width, height, data } = l.imageData;
  return { img: () => sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } }), l };
};
const UIO = (n) => path.join(OUT, 'ui', n);
const crop = (name, box) => L(name).img().extract(box);
// panels (trimmed to the visible frame)
await crop('Example Dark', { left: 57, top: 143, width: 821, height: 506 }).png().toFile(UIO('panel_dark.png'));
await crop('Example Light', { left: 30, top: 143, width: 821, height: 506 }).png().toFile(UIO('panel_light.png'));
await crop('Header', { left: 6, top: 15, width: 831, height: 196 }).png().toFile(UIO('header.png'));
// gauge frame + fills
const frame = await crop('Progress/Loading Orange/SliderBar', { left: 2, top: 3, width: 569, height: 89 }).png().toBuffer();
await sharp(frame).toFile(UIO('bar_frame.png'));
const fills = {
  orange: await L('Progress/Loading Orange/OrangeBar').img().png().toBuffer(),
  red: await L('Progress/Loading Red/RedBar').img().png().toBuffer(),
  green: await L('Progress/Loading Green/GreenBar').img().png().toBuffer(),
  blue: await L('Progress/Loading Blue/Blue Bar').img().png().toBuffer(),
};
fills.purple = await sharp(fills.blue).modulate({ hue: 60, saturation: 0.9 }).png().toBuffer();
fills.gold = await sharp(fills.orange).modulate({ hue: 12, brightness: 1.12 }).png().toBuffer();
fills.gray = await sharp(fills.green).modulate({ saturation: 0.08, brightness: 1.05 }).png().toBuffer();
fills.teal = await sharp(fills.green).modulate({ hue: 60 }).png().toBuffer();
const INNER = { left: 19, top: 26, width: 531, height: 41 };
for (const [k, buf] of Object.entries(fills)) {
  const fill = await sharp(buf).resize(INNER.width, INNER.height, { fit: 'fill' }).png().toBuffer();
  await sharp(fill).toFile(UIO(`fill_${k}.png`));
  // button = stone frame with the glossy fill inside
  await sharp(frame).composite([{ input: fill, left: INNER.left, top: INNER.top }]).png().toFile(UIO(`btn_${k}.png`));
}
// small pieces
await L('Checkbox/Checkbox Frame').img().png().toFile(UIO('chk_frame.png'));
await L('Checkbox/Checkmark').img().png().toFile(UIO('chk_mark.png'));
await L('Radio/Layer 1').img().png().toFile(UIO('ring.png'));
await L('Radio/Layer 2').img().png().toFile(UIO('dot.png'));
await L('Slider/SliderButton').img().png().toFile(UIO('orb.png'));
await L('Skull').img().png().toFile(UIO('skull.png'));
// close button: stone base + X (positions taken from the PSD)
const base = L('Side Close Button/Button Base');
const x = L('Side Close Button/Close X');
await base.img().composite([{ input: await x.img().png().toBuffer(), left: x.l.left - base.l.left, top: x.l.top - base.l.top }]).png().toFile(UIO('close.png'));
const arrow = L('Side Close Button/Next/Prev Arrow >');
await base.img().composite([{ input: await arrow.img().png().toBuffer(), left: arrow.l.left - base.l.left, top: arrow.l.top - base.l.top }]).png().toFile(UIO('side_btn.png'));
// slider arrows: split the pair into left / right
const arrows = L('Slider/Slider Arrows');
const aw = arrows.l.imageData.width;
const ah = arrows.l.imageData.height;
await arrows.img().extract({ left: 0, top: 0, width: 50, height: ah }).png().toBuffer().then((b) => sharp(b).trim({ threshold: 1 }).toFile(UIO('arrow_left.png')));
await arrows.img().extract({ left: aw - 50, top: 0, width: 50, height: ah }).png().toBuffer().then((b) => sharp(b).trim({ threshold: 1 }).toFile(UIO('arrow_right.png')));
console.log('ui kit ok');

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
