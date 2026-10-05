import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, textureCompress, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// Unzipped downloads (see CREDITS.md): ual/, ual2/, ubc/ under this folder.
const SRC = process.env.ASSET_SRC ?? './asset-src';
const OUT = new URL('../public/assets/models', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const UBC = `${SRC}/ubc/Universal Base Characters[Standard]`;

async function slimTextures(doc, size) {
  // Toon shading only needs base color: drop normal / roughness maps.
  for (const m of doc.getRoot().listMaterials()) {
    m.setNormalTexture(null);
    m.setMetallicRoughnessTexture(null);
    m.setOcclusionTexture(null);
    // Hair and eyebrows are flat toon colors at runtime.
    if (/Hair/.test(m.getName())) m.setBaseColorTexture(null);
  }
  await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [size, size], quality: 85 }));
}

for (const name of ['Superhero_Female_FullBody', 'Superhero_Male_FullBody']) {
  const doc = await io.read(`${UBC}/Base Characters/Godot - UE/${name}.gltf`);
  // Use the light skin tone variant; per-character tint is applied at runtime.
  const light = name.includes('Female') ? 'T_Superhero_Female_Light_BaseColor.png' : 'T_Superhero_Male_Ligh.png';
  for (const t of doc.getRoot().listTextures()) if (/Superhero_.*(Dark|BaseColor)/.test(t.getURI()) && !/Normal|Rough/.test(t.getURI())) t.setImage(fs.readFileSync(`${UBC}/Base Characters/Textures/${light}`)).setMimeType('image/png');
  await slimTextures(doc, 1024);
  await doc.transform(quantize());
  await io.write(`${OUT}/${name}.glb`, doc);
  console.log(name, fs.statSync(`${OUT}/${name}.glb`).size);
}

for (const name of ['Hair_Buns', 'Hair_Long', 'Hair_SimpleParted', 'Hair_Buzzed', 'Hair_BuzzedFemale', 'Hair_Beard']) {
  const doc = await io.read(`${UBC}/Hairstyles/Origin at 0/glTF (Godot)/${name}.gltf`);
  await slimTextures(doc, 512);
  await io.write(`${OUT}/${name}.glb`, doc);
  console.log(name, fs.statSync(`${OUT}/${name}.glb`).size);
}

const keep1 = ['Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Walk_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Punch_Jab', 'Punch_Cross', 'Roll', 'Hit_Chest', 'Hit_Head', 'Death01', 'Pistol_Idle_Loop', 'Pistol_Shoot', 'Pistol_Reload', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down', 'Sword_Attack', 'Sword_Idle', 'Spell_Simple_Shoot', 'Spell_Simple_Idle_Loop', 'Dance_Loop', 'Crouch_Idle_Loop'];
const keep2 = ['Hit_Knockback', 'LayToIdle', 'Melee_Hook', 'Melee_Hook_Rec', 'Idle_Shield_Loop', 'Idle_Shield_Break', 'Shield_Dash', 'Sword_Dash', 'Sword_Block', 'NinjaJump_Start', 'NinjaJump_Idle_Loop', 'NinjaJump_Land', 'Yes', 'Idle_No_Loop', 'Idle_FoldArms_Loop', 'Slide_Start', 'Slide_Loop', 'Slide_Exit', 'OverhandThrow', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Heavy_Combo', 'Sword_Regular_Combo'];

async function anims(file, keep, out) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!keep.includes(a.getName())) a.dispose();
  // Drop the mannequin mesh; keep only the skeleton nodes the clips target.
  for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
  for (const s of root.listSkins()) s.dispose();
  await doc.transform(resample({ tolerance: 0.0005 }), prune({ keepLeaves: true }), dedup());
  await io.write(out, doc);
  console.log(out, fs.statSync(out).size, root.listAnimations().length);
}
await anims(`${SRC}/ual/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb`, keep1, `${OUT}/anims1.glb`);
await anims(`${SRC}/ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb`, keep2, `${OUT}/anims2.glb`);
