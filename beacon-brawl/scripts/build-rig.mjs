// モーション用リグの生成: Quaternius "Universal Animation Library" (CC0) から、
// メッシュを外して骨と必要なアニメーションだけを残した public/assets/rig.glb を作る。
// 使い方: UAL_GLTF=<AnimationLibrary_Godot_Standard.gltf のパス> npm run assets
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = process.env.UAL_GLTF;
if (!SRC) { console.error('UAL_GLTF を指定してください'); process.exit(1); }
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'rig.glb');

const KEEP = new Set([
  'A_TPose', 'Idle_Loop', 'Sword_Idle', 'Pistol_Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
  'Sword_Attack', 'Punch_Jab', 'Punch_Cross', 'Pistol_Shoot', 'Spell_Simple_Shoot', 'Spell_Simple_Enter',
  'Roll', 'Jump_Start', 'Hit_Chest', 'Death01', 'Dance_Loop', 'Interact',
]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
for (const anim of doc.getRoot().listAnimations()) {
  if (KEEP.has(anim.getName())) continue;
  for (const ch of anim.listChannels()) ch.dispose();
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}
for (const node of doc.getRoot().listNodes()) { node.setMesh(null); node.setSkin(null); }
for (const skin of doc.getRoot().listSkins()) skin.dispose();
await doc.transform(prune({ keepLeaves: true }), dedup());
await io.write(OUT, doc);
console.log('rig.glb', (statSync(OUT).size / 1e6).toFixed(2), 'MB,', doc.getRoot().listAnimations().length, 'animations');
