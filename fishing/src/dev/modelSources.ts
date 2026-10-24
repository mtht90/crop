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
  out: string;
}

const Q = '/assets-src/quaternius_fish_x/Animated Fish Pack by @Quaternius/OBJ/';
const K = '/assets-src/kenney_nature_x/Models/GLTF format/';
const fish = (id: string, s: Omit<ModelSource, 'id' | 'kind' | 'out'>): ModelSource => ({ id, kind: 'fish', out: `public/assets/fish/${id}.json`, ...s });
const prop = (id: string, s: Omit<ModelSource, 'id' | 'kind' | 'out'>): ModelSource => ({ id, kind: 'prop', out: `public/assets/props/${id}.json`, ...s });
const kenney = (id: string, height?: number) => prop(id, { type: 'gltf', file: `${K}${id}.glb`, height, srgbColors: true });

export const MODEL_SOURCES: ModelSource[] = [
  fish('perch', { type: 'gltf', file: '/assets-src/barramundi.glb', texSize: 1024 }),
  fish('pike', {
    type: 'fbx',
    file: '/assets-src/esox_x/esox.fbx',
    skip: ['Circle001'],
    udim: [1, 2, 3, 4].map((i) => `/assets-src/esox_x/tex/ESOX-V2.100${i}.png`),
  }),
  fish('catfish', { type: 'obj', file: '/assets-src/catfish_obj_x/catfishRawModel.obj', texture: '/assets-src/catfish_x/catfish/catfish.png' }),
  fish('goldfish', { type: 'gltf', file: '/assets-src/goldfish_x/Goldfish/goldfish.glb' }),
  fish('minnow', { type: 'obj', file: `${Q}Fish1.obj`, mtl: 'Fish1.mtl' }),
  fish('shark', { type: 'obj', file: `${Q}Shark.obj`, mtl: 'Shark.mtl' }),

  ...['tree_pineTallA', 'tree_pineTallB', 'tree_pineDefaultA', 'tree_pineRoundA', 'tree_oak', 'tree_default', 'tree_detailed', 'tree_fat'].map((id) => kenney(id)),
  ...['plant_bush', 'plant_bushLarge', 'grass_large', 'grass_leafsLarge', 'lily_large', 'lily_small', 'rock_largeA', 'rock_largeC', 'rock_tallA', 'stone_largeB', 'stump_old', 'log', 'canoe', 'mushroom_redGroup', 'flower_yellowA', 'flower_purpleA'].map((id) => kenney(id)),
  prop('barrel', { type: 'gltf', file: '/assets-src/polyhaven/barrel_03/barrel_03.gltf', keepUv: true }),
  prop('fern', { type: 'gltf', file: '/assets-src/polyhaven/fern_02/fern_02.gltf', keepUv: true }),
];
