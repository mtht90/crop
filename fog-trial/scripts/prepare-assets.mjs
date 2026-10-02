// 外部素材 (すべて CC0) を public/assets に取り込むスクリプト。
// 取り込み済みの素材はリポジトリに含めているので、通常は実行不要。
//
// 使い方:
//   SRC=/path/to/clones node scripts/prepare-assets.mjs
// SRC には以下のリポジトリを clone しておく (git clone --depth 1):
//   https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0  → kaykit-adv
//   https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
//   https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0
//   https://github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0
//   https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0
//   https://github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0
//   https://github.com/KenneyNL/Starter-Kit-3D-Platformer
//   https://github.com/KenneyNL/Starter-Kit-FPS
//   https://github.com/KenneyNL/Starter-Kit-City-Builder
//   https://github.com/KenneyNL/Starter-Kit-Racing
// 効果音の変換に ffmpeg (libmp3lame) が必要。

import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = process.env.SRC;
if (!SRC) throw new Error('SRC を指定してください');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

const ADV = 'kaykit-adv/addons/kaykit_character_pack_adventures/Characters/gltf';
const SKEL = 'KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons';
const HAL = 'KayKit-Game-Assets_KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf';
const PROTO = 'KayKit-Game-Assets_KayKit-Prototype-Bits-1.0/addons/kaykit_prototype_bits/Assets/gltf';
const DUN = 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf';
const SPACE = 'KayKit-Space-Base-Bits-1.0/addons/kaykit_space_base_bits/Assets/gltf';

// サバイバー: 武器は持たないので消す。使うアニメーションだけ残す
const SURVIVOR_ANIMS = [
  'Idle',
  'Running_A',
  'Walking_B',
  'Walking_C',
  'Interact',
  'Use_Item',
  'Lie_Down',
  'Lie_Idle',
  'Lie_StandUp',
  'Hit_A',
  'Death_A',
  'Death_A_Pose',
  'PickUp',
  'Jump_Full_Short',
  'Cheer',
  'Sit_Floor_Idle',
  'Unarmed_Idle',
  'Block',
];
const KILLER_ANIMS = [
  'Idle',
  'Idle_Combat',
  'Running_A',
  'Running_C',
  'Walking_A',
  'Walking_D_Skeletons',
  '2H_Melee_Attack_Chop',
  '1H_Melee_Attack_Chop',
  '2H_Melee_Idle',
  'Hit_B',
  'PickUp',
  'Interact',
  'Spellcast_Raise',
  'Taunt',
  'Jump_Full_Short',
  'Block',
];
const WEAPONS = /(Sword|Shield|Axe|Mug|Spellbook|Wand|Staff|Crossbow|Knife|Throwable)/;

const characters = [
  { out: 'survivor_knight', src: `${ADV}/Knight.glb`, anims: SURVIVOR_ANIMS, hide: WEAPONS },
  { out: 'survivor_barbarian', src: `${ADV}/Barbarian.glb`, anims: SURVIVOR_ANIMS, hide: WEAPONS },
  { out: 'survivor_mage', src: `${ADV}/Mage.glb`, anims: SURVIVOR_ANIMS, hide: WEAPONS },
  { out: 'survivor_rogue', src: `${ADV}/Rogue_Hooded.glb`, anims: SURVIVOR_ANIMS, hide: WEAPONS },
  { out: 'killer_skeleton', src: `${SKEL}/Characters/gltf/Skeleton_Warrior.glb`, anims: KILLER_ANIMS },
];

const props = {
  killer_axe: `${SKEL}/Assets/gltf/Skeleton_Axe.gltf`,
  generator: `${SPACE}/drill_structure.gltf`,
  hook: `${HAL}/post_skull.gltf`,
  pallet: `${PROTO}/Pallet_Small.gltf`,
  wall: `${DUN}/wall.gltf.glb`,
  wall_window: `${DUN}/wall_window_open.gltf.glb`,
  wall_broken: `${DUN}/wall_broken.gltf.glb`,
  fence: `${HAL}/fence.gltf`,
  locker: `${HAL}/coffin.gltf`,
  exit_gate: `${HAL}/arch_gate.gltf`,
  hatch_open: `${DUN}/floor_tile_big_grate_open.gltf.glb`,
  hatch_closed: `${DUN}/floor_tile_grate.gltf.glb`,
  tree_pine_a: `${HAL}/tree_pine_orange_large.gltf`,
  tree_pine_b: `${HAL}/tree_pine_yellow_medium.gltf`,
  tree_pine_c: `${HAL}/tree_pine_orange_medium.gltf`,
  tree_dead_a: `${HAL}/tree_dead_large.gltf`,
  tree_dead_b: `${HAL}/tree_dead_medium.gltf`,
  grave: `${HAL}/grave_A.gltf`,
  gravestone: `${HAL}/gravestone.gltf`,
  gravemarker: `${HAL}/gravemarker_A.gltf`,
  pumpkin: `${HAL}/pumpkin_orange_jackolantern.gltf`,
  pumpkin_small: `${HAL}/pumpkin_yellow_small.gltf`,
  lantern: `${HAL}/lantern_standing.gltf`,
  candles: `${HAL}/candle_triple.gltf`,
  skull_candle: `${HAL}/skull_candle.gltf`,
  bones: `${HAL}/bone_A.gltf`,
  ribcage: `${HAL}/ribcage.gltf`,
  floor_dirt: `${HAL}/floor_dirt.gltf`,
  path: `${HAL}/path_A.gltf`,
  barrel: `${DUN}/barrel_large.gltf.glb`,
  crates: `${DUN}/crates_stacked.gltf.glb`,
  rock: `${SPACE}/rock_A.gltf`,
  rocks: `${SPACE}/rocks_A.gltf`,
  bench: `${HAL}/bench.gltf`,
  grass: 'Starter-Kit-3D-Platformer/models/grass.glb',
  grass_small: 'Starter-Kit-3D-Platformer/models/grass-small.glb',
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function convertCharacter(c) {
  const doc = await io.read(join(SRC, c.src));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!c.anims.includes(a.getName())) a.dispose();
  if (c.hide) {
    for (const n of root.listNodes()) {
      if (n.getMesh() && c.hide.test(n.getName())) n.dispose();
    }
  }
  await doc.transform(prune(), dedup());
  await io.write(join(OUT, 'models', `${c.out}.glb`), doc);
  console.log('character', c.out, root.listAnimations().length, 'anims');
}

async function convertProp(name, src) {
  const doc = await io.read(join(SRC, src));
  await doc.transform(prune(), dedup());
  await io.write(join(OUT, 'models', `${name}.glb`), doc);
  console.log('prop', name);
}

const SOUNDS = {
  footstep: 'Starter-Kit-3D-Platformer/sounds/walking.ogg',
  land: 'Starter-Kit-3D-Platformer/sounds/land.ogg',
  pallet_break: 'Starter-Kit-3D-Platformer/sounds/break.ogg',
  gen_done: 'Starter-Kit-3D-Platformer/sounds/coin.ogg',
  swing: 'Starter-Kit-FPS/sounds/enemy_attack.ogg',
  hit: 'Starter-Kit-FPS/sounds/enemy_hurt.ogg',
  down: 'Starter-Kit-FPS/sounds/enemy_destroy.ogg',
  ambience: 'Starter-Kit-City-Builder/sounds/ambience.ogg',
  pallet: 'Starter-Kit-City-Builder/sounds/placement-a.ogg',
  hook: 'Starter-Kit-City-Builder/sounds/removal-a.ogg',
  unhook: 'Starter-Kit-City-Builder/sounds/placement-d.ogg',
  ui: 'Starter-Kit-City-Builder/sounds/toggle.ogg',
  stun: 'Starter-Kit-Racing/sounds/impact.ogg',
  dash: 'Starter-Kit-Racing/sounds/skid.ogg',
  gen_loop: 'Starter-Kit-Racing/sounds/engine.ogg',
};

async function findFile(rel) {
  // starter kit のフォルダ構成の違いを吸収する
  const [repo, ...rest] = rel.split('/');
  const name = rest[rest.length - 1];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        const r = await walk(p);
        if (r) return r;
      } else if (e.name === name) return p;
    }
    return null;
  }
  return walk(join(SRC, repo));
}

await mkdir(join(OUT, 'models'), { recursive: true });
await mkdir(join(OUT, 'sounds'), { recursive: true });
for (const c of characters) await convertCharacter(c);
for (const [name, src] of Object.entries(props)) await convertProp(name, src);
for (const [name, rel] of Object.entries(SOUNDS)) {
  const f = await findFile(rel);
  if (!f) {
    console.warn('missing sound', rel);
    continue;
  }
  // Safari でも再生できるよう MP3 (モノラル) に変換する。環境音は長いのでビットレートを下げる
  const rate = name === 'ambience' ? ['-ar', '32000', '-b:a', '64k'] : ['-ar', '44100', '-b:a', '96k'];
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-ac', '1', ...rate, join(OUT, 'sounds', `${name}.mp3`)]);
  console.log('sound', name);
}
