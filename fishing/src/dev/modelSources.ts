/** 外部素材 → ゲーム用 glTF(JSON) の変換設定。出典とライセンスは CREDITS.md */
export interface ModelSource {
  id: string;
  kind: 'fish' | 'prop';
  type: 'gltf' | 'obj' | 'fbx';
  file: string;
  mtl?: string;
  /** 元モデルとは別に貼るテクスチャ */
  texture?: string;
  /** UDIM タイル（1001, 1002, ...） */
  udim?: string[];
  texSize?: number;
  /** 正規化後に頭が -X を向いていたら反転 */
  flip?: boolean;
  /** 背が +Y を向くよう X 軸まわりに回す (rad) */
  roll?: number;
  /** 小道具の高さ (m) */
  height?: number;
  keepUv?: boolean;
  /** 色の値が sRGB で書かれている（Kenney） */
  srgbColors?: boolean;
  /** 取り込まないメッシュ名 */
  skip?: string[];
  /**
   * 高精細な元モデル。指定すると、元モデルを左右の真横から撮った画像をテクスチャにして
   * 軽いメッシュ（file）へ投影し直す（写真測量の細切れ UV を簡略化で壊さないため）
   */
  hiFile?: string;
  out: string;
}

const K = '/assets-src/kenney_nature_x/Models/GLTF format/';
const fish = (id: string, s: Omit<ModelSource, 'id' | 'kind' | 'out'>): ModelSource => ({ id, kind: 'fish', out: `public/assets/fish/${id}.json`, ...s });
const prop = (id: string, s: Omit<ModelSource, 'id' | 'kind' | 'out'>): ModelSource => ({ id, kind: 'prop', out: `public/assets/props/${id}.json`, ...s });
const kenney = (id: string, height?: number) => prop(id, { type: 'gltf', file: `${K}${id}.glb`, height, srgbColors: true });

const P = '/assets-src/polyyai/3D_Fish_Pack_LowPoly/models/';
const polyy = (id: string, file: string, extra: Partial<ModelSource> = {}) => fish(id, { type: 'gltf', file: `${P}${file}.glb`, texSize: 1024, ...extra });

const F = '/assets-src/ffish/';
/** ffish.asia の実写スキャン（CC0）。大きさ比較用の立方体（Object_4）は取り込まない */
const scan = (id: string, file: string, hi: string, extra: Partial<ModelSource> = {}) =>
  fish(id, { type: 'gltf', file: `${F}lite/${file}.glb`, hiFile: `${F}${hi}.glb`, texSize: 1024, skip: ['Object_4'], flip: true, ...extra });

export const MODEL_SOURCES: ModelSource[] = [
  scan('s_carp', 'carp', 'scan_carp'),
  scan('s_crucian', 'crucian', 'scan_crucian'),
  scan('s_namazu', 'amur_catfish', 'scan_amur_catfish'),
  scan('s_snakehead', 'snakehead', 'scan_snakehead'),
  scan('s_oikawa', 'horsemouth', 'scan_horsemouth'),
  scan('s_hasu', 'threelips', 'scan_threelips'),
  scan('s_bluegill', 'bluegill', 'scan_bluegill'),
  scan('s_bass', 'bass', 'scan_bass'),
  scan('s_ayu', 'ayu', 'scan_ayu'),
  // 写実系の魚はすべて Polyy.AI「3D Fish Pack」(CC0) にそろえる
  polyy('trout', '10_rainbow_trout'),
  polyy('salmon', '11_sockeye_salmon'),
  polyy('koi', '06_koi'),
  polyy('catfish', '18_channel_catfish'),
  polyy('arowana', '25_silver_arowana'),

  ...['tree_pineTallA', 'tree_pineTallB', 'tree_pineDefaultA', 'tree_pineRoundA', 'tree_oak', 'tree_default', 'tree_detailed', 'tree_fat'].map((id) => kenney(id)),
  ...['plant_bush', 'plant_bushLarge', 'grass_large', 'grass_leafsLarge', 'lily_large', 'lily_small', 'rock_largeA', 'rock_largeC', 'rock_tallA', 'stone_largeB', 'stump_old', 'log', 'canoe', 'mushroom_redGroup', 'flower_yellowA', 'flower_purpleA'].map((id) => kenney(id)),
  prop('barrel', { type: 'gltf', file: '/assets-src/polyhaven/barrel_03/barrel_03.gltf', keepUv: true }),
  prop('fern', { type: 'gltf', file: '/assets-src/polyhaven/fern_02/fern_02.gltf', keepUv: true }),
];
