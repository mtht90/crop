// 3D モデルの取り込み：必要なアニメーションだけ残し、頂点を結合して軽量化する。
// 使い方: node tools/build_models.mjs <KayKit Adventures dir> <KayKit Skeletons dir> <Quaternius glb dir(FBX2glTF 変換済み)>
// 素材: KayKit Character Pack Adventures / Skeletons (CC0, Kay Lousberg)、Quaternius Monster Pack / Easy Enemy Pack (CC0)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, weld, dedup, simplify, resample } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import path from 'node:path';

const [adv, skel, quat] = process.argv.slice(2);
const OUT = process.env.OUT || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'models');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const kayAdv = (n) => path.join(adv, 'addons/kaykit_character_pack_adventures/Characters/gltf', n + '.glb');
const kaySk = (n) => path.join(skel, 'addons/kaykit_character_pack_skeletons/Characters/gltf', n + '.glb');
const q = (n) => path.join(quat, n + '.glb');

const SK = ['Idle', 'Walking_D_Skeletons', 'Running_C', 'Spawn_Ground_Skeletons', 'Death_C_Skeletons', '1H_Melee_Attack_Chop', 'Hit_A', 'Taunt', 'Spellcast_Shoot', '2H_Melee_Attack_Spin', 'Spellcast_Summon'];
const JOBS = [
  // [出力名, 入力, 残すアニメ, 隠すメッシュノード, 簡略化率]
  // KayKit は同じリグなので、アニメは player / sk_minion にだけ持たせて他はメッシュのみ
  ['player', kayAdv('Mage'), ['Idle', 'Running_A', 'Running_B', 'Spellcast_Shoot', 'Spellcasting', 'Spellcast_Raise', 'Hit_A', 'Death_A', 'Cheer',
    'Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Chop', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', '1H_Melee_Attack_Stab', 'Throw'], ['Spellbook', 'Spellbook_open', '1H_Wand']],
  ['ally_hooded', kayAdv('Rogue_Hooded'), [], []],
  ['ally_rogue', kayAdv('Rogue'), [], []],
  ['ally_barbarian', kayAdv('Barbarian'), [], []],
  ['sk_minion', kaySk('Skeleton_Minion'), SK, []],
  ['sk_warrior', kaySk('Skeleton_Warrior'), [], []],
  ['sk_rogue', kaySk('Skeleton_Rogue'), [], []],
  ['sk_mage', kaySk('Skeleton_Mage'), [], []],
  ['bat', q('Bat'), null, [], 0],
  ['dragon', q('Dragon'), null, [], 0],
  ['slime', q('Slime'), null, [], 0],
  ['frog', q('Frog'), null, [], 0.45],
  ['rat', q('Rat'), null, [], 0.45],
  ['spider', q('Spider'), null, [], 0.6],
  ['snake', q('Snake_angry'), null, [], 0],
  ['wasp', q('Wasp'), null, [], 0.5],
];

await MeshoptSimplifier.ready;
for (const [name, src, keep, hide, ratio] of JOBS) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    const n = a.getName().replace(/^.*\|/, '');
    a.setName(n);
    if (keep && !keep.includes(n)) {
      for (const c of a.listChannels()) c.dispose();
      for (const sm of a.listSamplers()) sm.dispose();
      a.dispose();
    }
  }
  for (const node of root.listNodes()) if (hide.includes(node.getName())) node.dispose();
  const tf = [dedup(), weld(), resample({ tolerance: 0.002 })];
  if (ratio) tf.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004 }));
  tf.push(prune());
  await doc.transform(...tf);
  await io.write(path.join(OUT, name + '.glb'), doc);
  console.log(name, root.listAnimations().map((a) => a.getName()).join(','));
}
