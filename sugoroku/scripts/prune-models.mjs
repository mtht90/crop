// ビルド後の dist/models から、ゲームで使わないモデルを取り除く（配信サイズを減らす）。
// 使うモデルの一覧はここで管理する。glTF が参照する .bin / テクスチャは自動で残す。
import fs from 'node:fs';
import path from 'node:path';

const C = ['red', 'blue', 'green', 'yellow'];
const each = (names) => names.flatMap((n) => C.map((c) => `${n}_${c}`));
const HEX = [
  'hex_grass', 'hex_water', 'hex_grass_bottom', 'hex_road_A', 'hex_road_B',
  'trees_A_medium', 'trees_B_medium', 'trees_B_large', 'hills_B_trees', 'mountain_A_grass_trees', 'mountain_B_grass_trees',
  'tree_single_A', 'rock_single_B', 'rock_single_C', 'cloud_big', 'cloud_small', 'building_dirt',
  'wall_straight_gate', 'tent', 'building_destroyed', 'building_church_blue', 'building_tower_B_blue', 'building_well_blue',
  'building_stage_A', 'building_tower_catapult_red', 'barrel', 'crate_A_small', 'bucket_water',
  ...C.map((c) => `flag_${c}`),
  ...each(['building_home_A', 'building_home_B', 'building_tower_A', 'building_castle', 'building_windmill', 'building_watermill',
    'building_lumbermill', 'building_tavern', 'building_blacksmith', 'building_mine', 'building_barracks', 'building_archeryrange',
    'building_church', 'building_market']),
];
const BITS = ['coin_10_gold', 'coin_gold', 'cube_gold', ...C.map((c) => `playerstand_${c}`), ...C.map((c) => `cube_${c}`),
  'D6_A', 'D6_A_red', 'D6_B_blue', 'D6_A_yellow', 'D6_C_green', 'D6_C_red'];

const dist = path.resolve(process.argv[2] ?? 'dist', 'models');
let removed = 0;
let kept = 0;
for (const [dir, names] of [['hex', HEX], ['bits', BITS]]) {
  const keep = new Set();
  for (const n of names) {
    const f = path.join(dist, dir, `${n}.gltf`);
    if (!fs.existsSync(f)) throw new Error(`見つかりません: ${dir}/${n}.gltf`);
    keep.add(`${n}.gltf`);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/"uri"\s*:\s*"([^"]+)"/g)) keep.add(decodeURIComponent(m[1]));
  }
  for (const f of fs.readdirSync(path.join(dist, dir))) {
    if (keep.has(f)) kept++;
    else {
      fs.rmSync(path.join(dist, dir, f));
      removed++;
    }
  }
}
console.log(`models: ${kept} 個を残し、${removed} 個を削除しました`);
