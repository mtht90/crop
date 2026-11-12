// 素材最適化スクリプト: KayKit (CC0) の配布物から、ゲームで使うアニメーションだけを残した GLB を生成する。
// 使い方: KAYKIT_DIR=<3つのKayKitリポジトリをcloneした親ディレクトリ> npm run assets
//   必要: KayKit-Character-Pack-Adventures-1.0 → kaykit-adv, KayKit-Dungeon-Remastered-1.0 → kaykit-dungeon
// キャラクター本体 (VRM) は scripts/optimize-vrm.py で別途軽量化する
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = process.env.KAYKIT_DIR;
if (!SRC) { console.error('KAYKIT_DIR を指定してください'); process.exit(1); }
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
mkdirSync(join(OUT, 'props'), { recursive: true });

const KEEP = new Set([
  'Idle', '2H_Melee_Idle', 'Running_A', 'Running_B',
  '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab',
  '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spin',
  'Dualwield_Melee_Attack_Chop', 'Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab',
  '1H_Ranged_Shoot', '2H_Ranged_Shoot', 'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long',
  'Block', 'Hit_A', 'Hit_B', 'Death_A', 'Cheer', 'Dodge_Forward', 'Jump_Full_Short', 'Throw', 'Interact',
  'Unarmed_Melee_Attack_Kick',
]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const ADV = 'kaykit-adv/addons/kaykit_character_pack_adventures';
const DUN = 'kaykit-dungeon/addons/kaykit_dungeon_remastered';

// モーション移植元のリグ: Knight からメッシュを外し、骨とアニメーションだけ残す
{
  const doc = await io.read(join(SRC, ADV, 'Characters', 'gltf', 'Knight.glb'));
  for (const anim of doc.getRoot().listAnimations()) {
    if (KEEP.has(anim.getName())) continue;
    for (const ch of anim.listChannels()) ch.dispose();
    for (const s of anim.listSamplers()) s.dispose();
    anim.dispose();
  }
  for (const node of doc.getRoot().listNodes()) { node.setMesh(null); node.setSkin(null); }
  for (const skin of doc.getRoot().listSkins()) skin.dispose();
  await doc.transform(prune({ keepLeaves: true }), dedup());
  const out = join(OUT, 'rig.glb');
  await io.write(out, doc);
  console.log('rig.glb', (statSync(out).size / 1e6).toFixed(2), 'MB');
}

// 武器 (gltf+bin → glb)
for (const n of ['sword_1handed', 'shield_badge', 'axe_2handed', 'staff', 'dagger', 'crossbow_2handed']) {
  const doc = await io.read(join(SRC, ADV, 'Assets', 'gltf', `${n}.gltf`));
  await io.write(join(OUT, 'props', `${n}.glb`), doc);
}
// ステージ小物
for (const n of ['pillar', 'pillar_decorated', 'barrier', 'box_large', 'crates_stacked', 'barrel_large',
  'banner_shield_blue', 'banner_shield_red', 'wall', 'floor_tile_large']) {
  copyFileSync(join(SRC, DUN, 'Assets', 'gltf', `${n}.gltf.glb`), join(OUT, 'props', `${n}.glb`));
}
console.log('done');
