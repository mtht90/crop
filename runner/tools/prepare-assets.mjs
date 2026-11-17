// Packs selected models from the downloaded CC0 packs into a few optimized GLBs.
// usage: node tools/prepare-assets.mjs <srcdir from fetch-assets.sh> <outdir>
// deps: npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, unpartition, mergeDocuments } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const [SRC, OUT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });

async function pack(name, files, { resize = 1024, keepAnims = null } = {}) {
  let doc = null;
  for (const [file, rename] of files) {
    const d = await io.read(file);
    // rename root scene nodes so that each model can be found by name
    const scene = d.getRoot().getDefaultScene() || d.getRoot().listScenes()[0];
    const roots = scene.listChildren();
    if (rename) {
      if (roots.length === 1) roots[0].setName(rename);
      else {
        const g = d.createNode(rename);
        for (const r of roots) { scene.removeChild(r); g.addChild(r); }
        scene.addChild(g);
      }
    }
    if (keepAnims) for (const a of d.getRoot().listAnimations()) if (!keepAnims.some((k) => a.getName().startsWith(k))) a.dispose();
    if (!doc) { doc = d; continue; }
    mergeDocuments(doc, d);
  }
  // collapse all scenes into the first
  const scenes = doc.getRoot().listScenes();
  const main = scenes[0];
  for (const s of scenes.slice(1)) { for (const c of s.listChildren()) { s.removeChild(c); main.addChild(c); } s.dispose(); }
  doc.getRoot().setDefaultScene(main);
  await doc.transform(unpartition(), dedup(), prune({ keepLeaves: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [resize, resize], quality: 82 }));
  const out = path.join(OUT, 'models', name + '.glb');
  await io.write(out, doc);
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(2) + 'MB');
}

const k = (kit, n) => [path.join(SRC, kit, 'Models', 'GLB format', n + '.glb'), n];
const nat = (n) => [path.join(SRC, 'nature', 'Models', 'GLTF format', n + '.glb'), n];
const sf = (dir, n) => [path.join(SRC, 'scifi', 'Modular SciFi MegaKit[Standard]', 'glTF', dir, n + '.gltf'), n];

// ---------- character (Quaternius UAL) ----------
await pack('runner', [[path.join(SRC, 'ual', 'Animation Library[Standard]', 'Godot', 'AnimationLibrary_Godot_Standard.glb'), null]], {
  keepAnims: ['A_TPose', 'Sprint_Loop', 'Jog_Fwd_Loop', 'Idle_Loop', 'Jump_', 'Roll', 'Death01', 'Hit_Chest', 'Crouch_Fwd_Loop', 'Walk_Loop', 'Dance_Loop', 'Punch_Jab'],
});
await pack('runner_extra', [[path.join(SRC, 'ual2', 'Universal Animation Library 2 [Standard]', 'Unreal-Godot', 'UAL2_Standard.glb'), null]], {
  keepAnims: ['A_TPose', 'Slide_', 'NinjaJump_', 'ClimbUp_1m_RM', 'Hit_Knockback'],
});

// ---------- Kenney City ----------
const cityNames = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l', 'building-m', 'building-n',
  'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e',
  'low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c', 'low-detail-building-d', 'low-detail-building-e', 'low-detail-building-f', 'low-detail-building-g', 'low-detail-building-h',
  'low-detail-building-wide-a', 'low-detail-building-wide-b', 'detail-parasol-a', 'detail-awning-wide', 'detail-overhang-wide'];
await pack('city', cityNames.map((n) => k('city', n)));

// ---------- Kenney Factory ----------
const facNames = ['structure-tall', 'structure-yellow-tall', 'structure-high', 'structure-wall', 'structure-window-wide', 'pipe-large-long', 'pipe-large', 'pipe-large-bend', 'pipe-glass-large-long',
  'catwalk-straight', 'conveyor-long-stripe-sides', 'conveyor-long', 'box-large', 'box-wide', 'box-long', 'box-small', 'crane', 'hopper-high-round', 'hopper-high-square', 'machine', 'machine-fortified',
  'warning-traffic', 'warning-orange', 'cog-a', 'cog-b', 'robot-arm-a', 'robot-arm-b', 'top-large', 'top-large-checkerboard', 'floor-large', 'cone', 'screen-hanging-wide', 'piston-round', 'scanner-high', 'arrow', 'arrow-basic', 'indicator-special-arrow', 'button-floor-square', 'catwalk-stairs', 'door-wide-open', 'lever-double'];
await pack('factory', facNames.map((n) => k('factory', n)));

// ---------- Kenney Nature ----------
const natNames = ['cliff_large_rock', 'cliff_block_rock', 'cliff_blockHalf_rock', 'cliff_top_rock', 'cliff_large_stone', 'cliff_block_stone', 'cliff_waterfall_rock',
  'rock_tallA', 'rock_tallB', 'rock_tallC', 'rock_tallD', 'rock_tallE', 'rock_tallF', 'rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_smallA', 'rock_smallC', 'stone_tallA', 'stone_tallB', 'stone_largeA',
  'tree_pineTallA', 'tree_pineTallB', 'tree_pineTallC', 'tree_pineTallD', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_default', 'tree_oak', 'tree_tall', 'tree_fat', 'tree_detailed',
  'log_large', 'log', 'bridge_wood', 'bridge_woodNarrow', 'bridge_stone', 'grass_large', 'grass', 'plant_bushLarge', 'plant_bush', 'mushroom_redGroup', 'flower_yellowA', 'stump_old', 'cactus_tall'];
await pack('nature', natNames.filter((n) => fs.existsSync(nat(n)[0])).map(nat));

// ---------- Quaternius Sci-Fi ----------
const sfList = [
  ['Platforms', 'Platform_Metal'], ['Platforms', 'Platform_DarkPlates'], ['Platforms', 'Platform_Squares'], ['Platforms', 'Platform_CenterPlate'], ['Platforms', 'Platform_3Plates'], ['Platforms', 'Platform_Simple'], ['Platforms', 'Platform_X'],
  ['Platforms', 'Platform_Rails_4Wide'], ['Platforms', 'Platform_Window_Wide'],
  ['Columns', 'Column_Astra'], ['Columns', 'Column_Pipes'], ['Columns', 'Column_MetalSupport'], ['Columns', 'Column_Hollow'], ['Columns', 'Column_Large_Straight'], ['Columns', 'Column_Round'],
  ['Walls', 'WallAstra_Straight'], ['Walls', 'WallAstra_Straight_Window'], ['Walls', 'WallWindow_Straight'], ['Walls', 'WallBand_Straight'], ['Walls', 'TopCables_Straight_Hanging'], ['Walls', 'TopWindow_Straight'], ['Walls', 'ShortWall_AccentStrip_Straight'],
  ['Props', 'Prop_Light_Wide'], ['Props', 'Prop_Light_Floor'], ['Props', 'Prop_Light_Small'], ['Props', 'Prop_Crate3'], ['Props', 'Prop_Crate4'], ['Props', 'Prop_Barrel_Large'], ['Props', 'Prop_Vent_Big'], ['Props', 'Prop_Rail_4'],
  ['Props', 'Prop_Computer'], ['Props', 'Prop_AccessPoint'], ['Props', 'Prop_Fan_Small'], ['Props', 'Prop_Cable_3'],
];
const sfRoot = path.join(SRC, 'scifi', 'Modular SciFi MegaKit[Standard]');
for (const dir of fs.readdirSync(path.join(sfRoot, 'glTF'))) {
  const dd = path.join(sfRoot, 'glTF', dir); if (!fs.statSync(dd).isDirectory()) continue;
  for (const t of fs.readdirSync(path.join(sfRoot, 'Textures'))) { const dst = path.join(dd, t); if (!fs.existsSync(dst)) fs.copyFileSync(path.join(sfRoot, 'Textures', t), dst); }
}
const sfFiles = [];
for (const [dir, n] of sfList) {
  let p = sf(dir, n)[0];
  if (!fs.existsSync(p)) { const alt = path.join(SRC, 'scifi', 'Modular SciFi MegaKit[Standard]', 'glTF', n + '.gltf'); if (fs.existsSync(alt)) p = alt; else { console.warn('missing', n); continue; } }
  sfFiles.push([p, n]);
}
await pack('scifi', sfFiles, { resize: 1024 });

// ---------- textures / hdri / audio ----------
const tdir = path.join(OUT, 'textures'); fs.mkdirSync(tdir, { recursive: true });
for (const f of fs.readdirSync(path.join(SRC, 'ph'))) {
  const p = path.join(SRC, 'ph', f);
  if (f.endsWith('.hdr')) fs.copyFileSync(p, path.join(tdir, f));
  else if (/_(Diffuse|nor_gl|arm)\.jpg$/.test(f)) await sharp(p).resize(1024, 1024).jpeg({ quality: 85 }).toFile(path.join(tdir, f));
  else if (f.endsWith('.jpg')) await sharp(p, { limitInputPixels: false }).resize(4096, 2048).jpeg({ quality: 82 }).toFile(path.join(tdir, f.replace('.jpg', '_sky.jpg')));
}
const adir = path.join(OUT, 'audio'); fs.mkdirSync(adir, { recursive: true });
for (const f of fs.readdirSync(path.join(SRC, 'audio'))) fs.copyFileSync(path.join(SRC, 'audio', f), path.join(adir, f));
for (const f of ['slam_02.ogg', 'slam_05.ogg', 'hit_03.ogg', 'spring_03.ogg', 'metal_04.ogg', 'noise_01.ogg', 'glass_02.ogg', 'bell_02.ogg', 'other_03.ogg', 'weird_02.ogg', 'explosion.ogg'])
  if (fs.existsSync(path.join(SRC, 'sfx', f))) fs.copyFileSync(path.join(SRC, 'sfx', f), path.join(adir, 'sfx_' + f));
console.log('ok');
