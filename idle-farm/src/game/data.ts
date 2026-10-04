// ゲームのバランス値はすべてここに集める。調整はこのファイルだけ触ればよい。

export type CropId = 'lettuce' | 'carrot' | 'tomato';

export interface CropDef {
  id: CropId;
  name: string;
  /** 植えてから収穫できるまでの秒数 */
  growSec: number;
  /** 品質★1・品種改良Lv0 の売値 */
  basePrice: number;
  /** 解放に必要なお金（0 なら最初から使える） */
  unlockCost: number;
  /** 畑に並べる3Dモデル */
  model: string;
  /** 1区画に並べる株のスケール */
  scale: number;
  /** 地面に埋める深さ（にんじんは葉だけ出す） */
  sink: number;
  /** 表示色（UI の小さなマーカー） */
  color: string;
}

export const CROPS: Record<CropId, CropDef> = {
  lettuce: {
    id: 'lettuce',
    name: 'レタス',
    growSec: 25,
    basePrice: 4,
    unlockCost: 0,
    model: 'food/food_ingredient_lettuce.gltf',
    scale: 0.42,
    sink: 0,
    color: '#8fd16a',
  },
  carrot: {
    id: 'carrot',
    name: 'にんじん',
    growSec: 75,
    basePrice: 22,
    unlockCost: 250,
    model: 'food/food_ingredient_carrot.gltf',
    scale: 0.5,
    sink: 0.22,
    color: '#f08a3c',
  },
  tomato: {
    id: 'tomato',
    name: 'トマト',
    growSec: 210,
    basePrice: 110,
    unlockCost: 4000,
    model: 'food/food_ingredient_tomato.gltf',
    scale: 0.45,
    sink: 0,
    color: '#e8473c',
  },
};

export const CROP_IDS = Object.keys(CROPS) as CropId[];

/** 品質★1〜★3 の売値倍率 */
export const QUALITY_MULT = [1, 1.5, 2.5] as const;
/** 手で収穫したときに★3 になる確率（それ以外は★2） */
export const MANUAL_STAR3_CHANCE = 0.25;

export const START_PLOTS = 3;
/** 畑として買える最大の環（0 = 中心） */
export const MAX_FARM_RING = 5;
export const MAX_FARMERS = 24;

export const COST = {
  expand: (owned: number) => 15 * Math.pow(1.32, owned - START_PLOTS),
  hire: (farmers: number) => 40 * Math.pow(1.55, farmers),
  train: (lv: number) => 150 * Math.pow(2.1, lv),
  warehouse: (lv: number) => 60 * Math.pow(2.2, lv),
  breed: (crop: CropId, lv: number) => CROPS[crop].basePrice * 40 * Math.pow(1.9, lv),
};

export const EFFECT = {
  /** 農夫の作業・移動速度の倍率 */
  farmerSpeed: (lv: number) => 1 + 0.25 * lv,
  warehouseCap: (lv: number) => Math.floor(40 * Math.pow(1.5, lv)),
  breedMult: (lv: number) => Math.pow(1.25, lv),
};
