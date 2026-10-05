// Packs Kenney CC0 assets (see CREDITS.md) into public/assets:
//  - Particle Pack sprites -> public/assets/fx/*.png (white + alpha, downsized)
//  - Blaster Kit models    -> public/assets/models/Blaster.glb, HookGun.glb (texture embedded)
// Usage: ASSET_SRC=./asset-src node tools/build-fx.mjs
// with kenney_particle-pack.zip unzipped to asset-src/particle and
// kenney_blaster-kit_2.1.zip unzipped to asset-src/blaster.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';

const SRC = process.env.ASSET_SRC ?? './asset-src';
const ROOT = process.env.ASSET_OUT ?? new URL('../public/assets/', import.meta.url).pathname;
fs.mkdirSync(`${ROOT}fx`, { recursive: true });

// game name -> [Kenney file, size]
const FX = {
  flash: ['star_09', 128],
  burst: ['scorch_02', 256],
  ring: ['circle_02', 256],
  spark: ['star_06', 128],
  glint: ['star_08', 128],
  soft: ['circle_05', 64],
  puff: ['smoke_07', 128],
  dirt: ['dirt_01', 128],
  slash: ['slash_02', 256],
  twirl: ['twirl_01', 256],
  magic: ['magic_03', 256],
  halo: ['light_01', 256],
  smokeRing: ['smoke_10', 256],
  bolt: ['spark_02', 128],
};
for (const [name, [file, size]] of Object.entries(FX)) {
  // The black-background version carries the shape in luminance; use it as alpha on white.
  const alpha = await sharp(`${SRC}/particle/PNG (Black background)/${file}.png`).greyscale().resize(size, size).raw().toBuffer();
  const rgba = Buffer.alloc(size * size * 4, 255);
  for (let i = 0; i < size * size; i++) rgba[i * 4 + 3] = alpha[i];
  const out = `${ROOT}fx/${name}.png`;
  await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9, palette: false }).toFile(out);
  console.log(out, fs.statSync(out).size);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// blaster-j: Star's pistols; blaster-h: Zip's hook launcher.
for (const [src, out] of [['blaster-j', 'Blaster'], ['blaster-h', 'HookGun']]) {
  const doc = await io.read(`${SRC}/blaster/Models/GLB format/${src}.glb`);
  await doc.transform(prune(), dedup());
  await io.write(`${ROOT}models/${out}.glb`, doc);
  console.log(`${out}.glb`, fs.statSync(`${ROOT}models/${out}.glb`).size);
}
