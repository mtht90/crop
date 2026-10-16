// 外部素材の一覧（純粋なデータ。ビルドスクリプトからも読み込む）
import { PH_MODELS } from './asset-models.js';

const PH = 'https://dl.polyhaven.org/file/ph-assets';
const THREE_EX = 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples';
const UISFX = 'https://cdn.jsdelivr.net/npm/uisfx@0.4.0/sounds';

const phTex = (id) => ({
  map: `${PH}/Textures/jpg/1k/${id}/${id}_diff_1k.jpg`,
  normal: `${PH}/Textures/jpg/1k/${id}/${id}_nor_gl_1k.jpg`,
  arm: `${PH}/Textures/jpg/1k/${id}/${id}_arm_1k.jpg`,
});

// tile = テクスチャ1枚が覆う実寸(m)、zone = 最初に必要になるゾーン（読み込み優先度）
// ゾーン: 0スラム 1線路 2工場 3地下鉄 4工事現場 5道路 6モール 7観覧車 8社長室 9ビル 10天国の階段 11宇宙
export const TEXTURE_SETS = {
  rock: { ...phTex('rock_wall_10'), tile: 3.2, zone: 0 },
  sandrock: { ...phTex('coast_sand_rocks_02'), tile: 4, zone: 0 },
  wood: { ...phTex('weathered_planks'), tile: 2.2, zone: 0 },
  bluewood: { ...phTex('blue_painted_planks'), tile: 2.4, zone: 0 },
  shutter: { ...phTex('painted_metal_shutter'), tile: 2.6, zone: 0, metal: true },
  fabric: { ...phTex('denim_fabric'), tile: 1.4, zone: 0 },
  plaster: { ...phTex('plastered_wall_03'), tile: 3, zone: 0 },
  roofiron: { ...phTex('rusty_corrugated_iron'), tile: 2.4, zone: 0, metal: true },
  brick: { ...phTex('red_brick_03'), tile: 2.2, zone: 0 },
  rust: { ...phTex('rusty_metal_02'), tile: 2.5, metal: true, zone: 0 },
  gravel: { ...phTex('gravel_floor'), tile: 2.5, zone: 1 },
  freight: { ...phTex('box_profile_metal_sheet'), tile: 2.2, zone: 1, metal: true },
  greenmetal: { ...phTex('green_metal_rust'), tile: 2.5, zone: 1, metal: true },
  iron: { ...phTex('corrugated_iron_02'), tile: 2.4, metal: true, zone: 1 },
  metalplate: { ...phTex('metal_plate'), tile: 2, metal: true, zone: 2 },
  grate: { ...phTex('metal_grate_rusty'), tile: 1.6, metal: true, zone: 2 },
  factorywall: { ...phTex('factory_wall'), tile: 3, zone: 2 },
  tilewall: { ...phTex('square_tiled_wall'), tile: 1.6, zone: 3 },
  terrazzo: { ...phTex('terrazzo_tiles'), tile: 2.4, zone: 3 },
  concrete: { ...phTex('concrete_wall_008'), tile: 3, zone: 3 },
  plywood: { ...phTex('raw_plank_wall'), tile: 2.4, zone: 4 },
  rebar: { ...phTex('rebar_reinforced_concrete'), tile: 3, zone: 4 },
  paintedmetal: { ...phTex('rusty_painted_metal'), tile: 2.4, zone: 4, metal: true },
  asphalt: { ...phTex('asphalt_02'), tile: 4, zone: 5 },
  marbletile: { ...phTex('marble_tiles'), tile: 2.5, zone: 6 },
  whiteplaster: { ...phTex('white_plaster_02'), tile: 3, zone: 6 },
  bluemetal: { ...phTex('blue_metal_plate'), tile: 2.4, zone: 7, metal: true },
  woodfloor: { ...phTex('wood_floor'), tile: 2.6, zone: 8 },
  carpet: { ...phTex('dirty_carpet'), tile: 2.5, zone: 8 },
  facade: { ...phTex('concrete_tile_facade'), tile: 3.2, zone: 9 },
  snow: { ...phTex('snow_02'), tile: 3, zone: 10 },
  marble: { ...phTex('marble_01'), tile: 3, zone: 10 },
  rooftile: { ...phTex('clay_roof_tiles'), tile: 2.5, zone: 10 },
  ice: {
    map: `${THREE_EX}/textures/ambientcg/Ice002_1K-JPG_Color.jpg`,
    normal: `${THREE_EX}/textures/ambientcg/Ice002_1K-JPG_NormalGL.jpg`,
    rough: `${THREE_EX}/textures/ambientcg/Ice002_1K-JPG_Roughness.jpg`,
    tile: 3, zone: 10,
  },
  spacemetal: { ...phTex('metal_plate_02'), tile: 2, zone: 11, metal: true },
};

export const URLS = {
  hdr: `${PH}/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr`,
  hero: `${THREE_EX}/models/gltf/Soldier.glb`,
  waterNormals: `${THREE_EX}/textures/waternormals.jpg`,
  smoke: `${THREE_EX}/textures/opengameart/smoke1.png`,
  noise: `${THREE_EX}/textures/noises/perlin/rgb-256x256.png`,
  spark: `${THREE_EX}/textures/sprites/spark1.png`,
  flare0: `${THREE_EX}/textures/lensflare/lensflare0.png`,
  flare3: `${THREE_EX}/textures/lensflare/lensflare3.png`,
  earth: `${THREE_EX}/textures/planets/earth_atmos_2048.jpg`,
  earthClouds: `${THREE_EX}/textures/planets/earth_clouds_1024.png`,
  stars: ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((f) => `${THREE_EX}/textures/cube/MilkyWay/dark-s_${f}.jpg`),
};

// 巨大化して塔に積み上げるガラクタ（Poly Haven CC0）
// scale: 拡大率, collider: box | cyl | hull | car | none, walk: 経路の足場に使えるか, node: キット内の特定ノードだけ使う
export const PROPS = {
  ocean_buoy: { scale: 2.2, collider: 'cyl', walk: false, zone: 0 },
  wooden_crate_01: { scale: 3.6, collider: 'box', walk: true, zone: 0 },
  Barrel_01: { scale: 3.2, collider: 'cyl', walk: true, zone: 0 },
  cardboard_box_01: { scale: 4.2, collider: 'box', walk: true, zone: 0 },
  utility_box_02: { scale: 2.0, collider: 'box', walk: true, zone: 0 },
  Television_01: { scale: 3.6, collider: 'box', walk: true, zone: 0 },
  Sofa_01: { scale: 2.4, collider: 'box', walk: false, zone: 0 },
  ArmChair_01: { scale: 2.4, collider: 'box', walk: false, zone: 0 },
  old_tyre: { scale: 4, collider: 'cyl', walk: true, zone: 0, lieFlat: true },
  trashbag: { scale: 3.2, collider: 'box', walk: false, zone: 0 },
  exterior_aircon_unit: { scale: 1.5, collider: 'box', walk: true, zone: 0, node: 'exterior_aircon_unit' },
  vintage_day_bed: { scale: 1.6, collider: 'box', walk: true, zone: 0 },
  rollershutter_door: { scale: 1.2, collider: 'none', walk: false, zone: 0, node: 'rollershutter_door_graffiti' },
  ceiling_fan: { scale: 2.6, collider: 'none', walk: false, zone: 2 },
  barrel_03: { scale: 3.0, collider: 'cyl', walk: true, zone: 1 },
  metal_tool_chest: { scale: 3.4, collider: 'box', walk: false, zone: 2 },
  steel_frame_shelves_01: { scale: 0.19, collider: 'box', walk: true, zone: 2 },
  propane_tank: { scale: 5, collider: 'cyl', walk: false, zone: 2 },
  modular_industrial_pipes_01: { scale: 2.4, collider: 'none', walk: false, zone: 2 },
  plastic_crate_01: { scale: 4, collider: 'box', walk: true, zone: 3 },
  cement_bag: { scale: 2.6, collider: 'box', walk: true, zone: 4 },
  covered_car: { scale: 1.5, collider: 'car', walk: false, zone: 5 },
  street_lamp_01: { scale: 1.6, collider: 'none', walk: false, zone: 5 },
  CashRegister_01: { scale: 2.2, collider: 'box', walk: true, zone: 6 },
  wooden_display_shelves_01: { scale: 1.6, collider: 'box', walk: true, zone: 6 },
  CoffeeCart_01: { scale: 1.6, collider: 'box', walk: false, zone: 6 },
  modern_arm_chair_01: { scale: 2.2, collider: 'box', walk: false, zone: 6 },
  Chandelier_01: { scale: 4, collider: 'none', walk: false, zone: 6 },
  metal_office_desk: { scale: 2.2, collider: 'box', walk: true, zone: 8 },
  classic_laptop: { scale: 3, collider: 'box', walk: false, zone: 8 },
  drawer_cabinet: { scale: 1.6, collider: 'box', walk: true, zone: 8 },
  marble_bust_01: { scale: 11, collider: 'cyl', walk: false, zone: 8 },
  horse_statue_01: { scale: 26, collider: 'box', walk: false, zone: 10 },
  gothic_statue: { scale: 3, collider: 'box', walk: false, zone: 10 },
  moon_rock_01: { scale: 26, collider: 'hull', walk: true, zone: 11 },
  moon_rock_03: { scale: 40, collider: 'hull', walk: true, zone: 11 },
  moon_rock_05: { scale: 46, collider: 'hull', walk: true, zone: 11 },
  vintage_spacecraft_instrument: { scale: 14, collider: 'box', walk: true, zone: 11 },
};

// tools/measure で測った元サイズ（node 指定のものはそのノードの範囲）
export const PROP_DIMS = {
  ocean_buoy: { min: [-0.476, -0.809, -0.476], size: [1.067, 2.656, 0.952] },
  wooden_crate_01: { min: [-0.413, -0.008, -0.196], size: [0.825, 0.35, 0.409] },
  Barrel_01: { min: [-0.282, -0.007, -0.282], size: [0.563, 0.88, 0.563] },
  cardboard_box_01: { min: [-0.193, -0.007, -0.225], size: [0.387, 0.342, 0.516] },
  utility_box_02: { min: [-0.46, 0, -0.21], size: [0.92, 1.12, 0.432] },
  Television_01: { min: [-0.3, 0, -0.258], size: [0.6, 0.457, 0.471] },
  Sofa_01: { min: [-0.778, -0.001, -0.361], size: [1.571, 0.797, 0.658] },
  ArmChair_01: { min: [-0.424, 0, -0.417], size: [0.848, 1.065, 0.766] },
  old_tyre: { min: [-0.3, -0.3, -0.083], size: [0.6, 0.6, 0.165] },
  trashbag: { min: [-0.26, -0.001, -0.24], size: [0.528, 0.575, 0.463] },
  exterior_aircon_unit: { min: [-0.89, -0.32, -0.22], size: [0.8, 0.93, 0.37] },
  vintage_day_bed: { min: [-0.986, 0, -0.469], size: [1.973, 1.127, 0.855] },
  rollershutter_door: { min: [1.46, 0, 0], size: [1.08, 2.4, 0.3] },
  ceiling_fan: { min: [-0.732, -0.516, -0.731], size: [1.463, 0.516, 1.463] },
  barrel_03: { min: [-0.317, 0, -0.319], size: [0.634, 0.93, 0.639] },
  metal_tool_chest: { min: [-0.369, 0.001, -0.197], size: [0.685, 0.652, 0.407] },
  steel_frame_shelves_01: { min: [-5.487, -0.011, -2.511], size: [10.974, 21.405, 5.021] },
  propane_tank: { min: [-0.169, 0, -0.169], size: [0.337, 0.554, 0.337] },
  modular_industrial_pipes_01: { min: [-0.704, -1.002, -0.128], size: [1.403, 1.955, 0.308] },
  plastic_crate_01: { min: [-0.149, 0, -0.204], size: [0.298, 0.264, 0.408] },
  cement_bag: { min: [-0.229, 0.001, -0.348], size: [0.462, 0.18, 0.7] },
  covered_car: { min: [-0.847, 0, -2.166], size: [1.789, 1.411, 4.38] },
  street_lamp_01: { min: [-0.352, 0, -0.193], size: [0.704, 3.871, 0.386] },
  CashRegister_01: { min: [-0.225, 0.002, -0.173], size: [0.6, 0.621, 0.624] },
  wooden_display_shelves_01: { min: [-0.186, 0, -0.539], size: [0.372, 1.556, 1.078] },
  CoffeeCart_01: { min: [-1.397, 0.004, -0.558], size: [2.168, 1.718, 1.073] },
  modern_arm_chair_01: { min: [-0.407, 0, -0.575], size: [0.82, 1.023, 0.987] },
  Chandelier_01: { min: [-0.373, -0.798, -0.402], size: [0.746, 0.798, 0.816] },
  metal_office_desk: { min: [-1, 0, -0.469], size: [2, 0.788, 0.947] },
  classic_laptop: { min: [-0.326, -0.001, -0.242], size: [0.652, 0.543, 0.486] },
  drawer_cabinet: { min: [-0.571, 0, -0.248], size: [1.141, 1.881, 0.488] },
  marble_bust_01: { min: [-0.123, 0, -0.145], size: [0.272, 0.515, 0.3] },
  horse_statue_01: { min: [-0.086, 0, -0.054], size: [0.165, 0.221, 0.108] },
  gothic_statue: { min: [-0.783, -0.016, -1.189], size: [1.477, 1.74, 1.564] },
  moon_rock_01: { min: [-0.105, -0.003, -0.05], size: [0.212, 0.075, 0.112] },
  moon_rock_03: { min: [-0.053, -0.002, -0.045], size: [0.112, 0.058, 0.086] },
  moon_rock_05: { min: [-0.037, -0.002, -0.04], size: [0.072, 0.073, 0.081] },
  vintage_spacecraft_instrument: { min: [-0.205, -0.135, -0.085], size: [0.41, 0.269, 0.204] },
};

export const SOUNDS = {
  bgm: [`${THREE_EX}/sounds/Project_Utopia.ogg`, `${THREE_EX}/sounds/Project_Utopia.mp3`],
  jump: [`${UISFX}/rubber/press.ogg`, `${UISFX}/rubber/press.mp3`],
  land: [`${UISFX}/organic/drop.ogg`, `${UISFX}/organic/drop.mp3`],
  step: [`${UISFX}/soft/press.ogg`, `${UISFX}/soft/press.mp3`],
  bounce: [`${UISFX}/rubber/release.ogg`, `${UISFX}/rubber/release.mp3`],
  zone: [`${UISFX}/cinematic/level-up.ogg`, `${UISFX}/cinematic/level-up.mp3`],
  fall: [`${UISFX}/cinematic/error.ogg`, `${UISFX}/cinematic/error.mp3`],
  splash: [`${UISFX}/glass/collapse.ogg`, `${UISFX}/glass/collapse.mp3`],
  crumble: [`${UISFX}/mechanical/collapse.ogg`, `${UISFX}/mechanical/collapse.mp3`],
  hit: [`${UISFX}/mechanical/blocked.ogg`, `${UISFX}/mechanical/blocked.mp3`],
  goal: [`${UISFX}/arcade/achievement.ogg`, `${UISFX}/arcade/achievement.mp3`],
  click: [`${UISFX}/minimal/select.ogg`, `${UISFX}/minimal/select.mp3`],
  hover: [`${UISFX}/minimal/hover.ogg`, `${UISFX}/minimal/hover.mp3`],
  fan: [`${UISFX}/scifi/swipe.ogg`, `${UISFX}/scifi/swipe.mp3`],
  record: [`${UISFX}/arcade/level-up.ogg`, `${UISFX}/arcade/level-up.mp3`],
  grab: [`${UISFX}/mechanical/snap.ogg`, `${UISFX}/mechanical/snap.mp3`],
  climb: [`${UISFX}/organic/press.ogg`, `${UISFX}/organic/press.mp3`],
};

/** アーティファクト同梱用：読み込む全URLの一覧 */
export function allAssetUrls() {
  const urls = new Set();
  for (const s of Object.values(TEXTURE_SETS)) for (const k of ['map', 'normal', 'arm', 'rough']) if (s[k]) urls.add(s[k]);
  for (const v of Object.values(URLS)) (Array.isArray(v) ? v : [v]).forEach((u) => urls.add(u));
  for (const v of Object.values(SOUNDS)) v.forEach((u) => urls.add(u));
  for (const id of Object.keys(PROPS)) { urls.add(PH_MODELS[id].gltf); Object.values(PH_MODELS[id].include).forEach((u) => urls.add(u)); }
  return [...urls];
}

