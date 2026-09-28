/**
 * Product catalogue. All brands are fictional.
 * Prices are in yen. `cost` is the wholesale price per unit.
 */

export type Shape =
  | 'pet' | 'can' | 'slimcan' | 'carton' | 'onigiri' | 'sandwich' | 'bento' | 'cup' | 'bag' | 'smallbag'
  | 'box' | 'flatbox' | 'bread' | 'magazine' | 'icebar' | 'icecup' | 'pack' | 'tissue' | 'pudding' | 'salad'
  | 'karaage' | 'chicken' | 'croquette' | 'americandog';

/** Where an item can be displayed. */
export type Zone = 'fridge' | 'chilled' | 'shelf' | 'magazine' | 'freezer' | 'hot';

export type Category = 'drink' | 'alcohol' | 'onigiri' | 'bento' | 'bread' | 'snack' | 'noodle' | 'daily' | 'magazine' | 'ice' | 'hot' | 'dessert';

export interface ProductDef {
  id: string;
  name: string;
  brand: string;
  category: Category;
  zone: Zone;
  shape: Shape;
  price: number; // suggested retail
  cost: number;
  caseSize: number;
  /** Days until expiry after delivery (99 = effectively none). */
  life: number;
  age?: boolean;
  rank: number;
  /** Colours for the procedural package: background, accent, text. */
  colors: [string, string, string];
  /** Relative demand by time band: morning(6-10) day(10-16) evening(16-22) night(22-2). */
  demand: [number, number, number, number];
  /** Hot snacks: seconds (real) to fry. */
  fryTime?: number;
}

export const PRODUCTS: ProductDef[] = [
  // ---- drinks (reach-in fridges)
  { id: 'greentea', name: '緑茶 伊吹', brand: 'いぶき', category: 'drink', zone: 'fridge', shape: 'pet', price: 150, cost: 82, caseSize: 24, life: 99, rank: 1, colors: ['#e9f2e0', '#2f7d32', '#1b4d1e'], demand: [1.2, 1.2, 0.9, 0.6] },
  { id: 'water', name: '天然水 やまの泉', brand: 'やまの泉', category: 'drink', zone: 'fridge', shape: 'pet', price: 120, cost: 55, caseSize: 24, life: 99, rank: 1, colors: ['#e8f4fb', '#2d8fd5', '#0f3d63'], demand: [1, 1.3, 0.8, 0.6] },
  { id: 'cola', name: 'コーラ ZERO+', brand: 'SPARK', category: 'drink', zone: 'fridge', shape: 'pet', price: 180, cost: 96, caseSize: 24, life: 99, rank: 1, colors: ['#b3121b', '#1a1a1a', '#ffffff'], demand: [0.5, 1, 1, 0.9] },
  { id: 'sports', name: 'スポーツウォーター', brand: 'AQUA+', category: 'drink', zone: 'fridge', shape: 'pet', price: 170, cost: 90, caseSize: 24, life: 99, rank: 1, colors: ['#1976d2', '#ffffff', '#ffffff'], demand: [0.8, 1.2, 0.8, 0.5] },
  { id: 'milktea', name: 'ロイヤルミルクティー', brand: 'Afternoon', category: 'drink', zone: 'fridge', shape: 'pet', price: 160, cost: 85, caseSize: 24, life: 99, rank: 1, colors: ['#f3e2c7', '#8a5a2b', '#5a3413'], demand: [0.9, 1.1, 0.8, 0.6] },
  { id: 'cancoffee', name: '微糖ブラック缶', brand: 'BOSSO', category: 'drink', zone: 'fridge', shape: 'can', price: 140, cost: 68, caseSize: 30, life: 99, rank: 1, colors: ['#23252b', '#c9a24a', '#f2e3b5'], demand: [1.8, 0.8, 0.6, 1.0] },
  { id: 'energy', name: 'エナジーZ', brand: 'VOLT', category: 'drink', zone: 'fridge', shape: 'slimcan', price: 230, cost: 120, caseSize: 24, life: 99, rank: 2, colors: ['#111111', '#aef227', '#aef227'], demand: [0.8, 0.8, 1, 1.5] },
  { id: 'beer', name: '生ビール 極', brand: 'KIWAMI', category: 'alcohol', zone: 'fridge', shape: 'can', price: 240, cost: 170, caseSize: 24, life: 99, age: true, rank: 2, colors: ['#d8b25a', '#7a1e1e', '#2a1a0a'], demand: [0.1, 0.4, 1.8, 1.8] },
  { id: 'chuhai', name: 'ストロングレモン', brand: 'ZEST', category: 'alcohol', zone: 'fridge', shape: 'can', price: 190, cost: 120, caseSize: 24, life: 99, age: true, rank: 2, colors: ['#f6e34a', '#1f5fbf', '#1f3d7a'], demand: [0.1, 0.3, 1.5, 2.0] },
  // ---- chilled open case
  { id: 'onigiri_salmon', name: '手巻 焼鮭', brand: 'おにぎり', category: 'onigiri', zone: 'chilled', shape: 'onigiri', price: 170, cost: 98, caseSize: 12, life: 1, rank: 1, colors: ['#f08b5b', '#1d1d1d', '#ffffff'], demand: [2.2, 1.6, 0.9, 0.9] },
  { id: 'onigiri_tuna', name: '手巻 ツナマヨ', brand: 'おにぎり', category: 'onigiri', zone: 'chilled', shape: 'onigiri', price: 150, cost: 85, caseSize: 12, life: 1, rank: 1, colors: ['#f4d35e', '#1d1d1d', '#1d1d1d'], demand: [2.0, 1.6, 1.0, 1.0] },
  { id: 'onigiri_ume', name: '手巻 紀州梅', brand: 'おにぎり', category: 'onigiri', zone: 'chilled', shape: 'onigiri', price: 140, cost: 78, caseSize: 12, life: 1, rank: 1, colors: ['#d94f70', '#1d1d1d', '#ffffff'], demand: [1.6, 1.2, 0.7, 0.6] },
  { id: 'sandwich', name: 'ミックスサンド', brand: 'サンド', category: 'bread', zone: 'chilled', shape: 'sandwich', price: 330, cost: 200, caseSize: 10, life: 1, rank: 1, colors: ['#ffffff', '#3aa35b', '#1a4d2a'], demand: [1.8, 1.2, 0.6, 0.5] },
  { id: 'bento_karaage', name: '唐揚げ弁当', brand: 'お弁当', category: 'bento', zone: 'chilled', shape: 'bento', price: 560, cost: 350, caseSize: 6, life: 1, rank: 1, colors: ['#1d1d1d', '#e0a33b', '#ffffff'], demand: [0.3, 2.4, 1.6, 0.9] },
  { id: 'bento_makunouchi', name: '幕の内弁当', brand: 'お弁当', category: 'bento', zone: 'chilled', shape: 'bento', price: 620, cost: 390, caseSize: 6, life: 1, rank: 2, colors: ['#1d1d1d', '#c0392b', '#ffffff'], demand: [0.3, 2.0, 1.4, 0.6] },
  { id: 'salad', name: 'シーザーサラダ', brand: 'サラダ', category: 'bento', zone: 'chilled', shape: 'salad', price: 360, cost: 210, caseSize: 8, life: 1, rank: 2, colors: ['#ffffff', '#6ab04c', '#2d5016'], demand: [0.5, 1.6, 1.2, 0.3] },
  { id: 'pudding', name: 'なめらかプリン', brand: 'スイーツ', category: 'dessert', zone: 'chilled', shape: 'pudding', price: 190, cost: 100, caseSize: 12, life: 4, rank: 1, colors: ['#f7d774', '#6b3e12', '#6b3e12'], demand: [0.3, 1, 1.4, 1.2] },
  { id: 'milk', name: '北の牛乳 1000', brand: 'MILK', category: 'drink', zone: 'chilled', shape: 'carton', price: 240, cost: 150, caseSize: 12, life: 5, rank: 1, colors: ['#ffffff', '#1f6fd1', '#1f3d7a'], demand: [1.4, 0.8, 0.9, 0.3] },
  // ---- gondola shelves
  { id: 'chips', name: 'ポテトチップス うすしお', brand: 'Crispy', category: 'snack', zone: 'shelf', shape: 'bag', price: 170, cost: 95, caseSize: 12, life: 99, rank: 1, colors: ['#f6c945', '#d62828', '#8b1111'], demand: [0.4, 1, 1.4, 1.3] },
  { id: 'chips_cons', name: 'ポテトチップス コンソメ', brand: 'Crispy', category: 'snack', zone: 'shelf', shape: 'bag', price: 170, cost: 95, caseSize: 12, life: 99, rank: 1, colors: ['#ef7d2d', '#5b2e0e', '#ffffff'], demand: [0.3, 0.9, 1.3, 1.2] },
  { id: 'choco', name: 'ミルクチョコレート', brand: 'CACAO', category: 'snack', zone: 'shelf', shape: 'flatbox', price: 210, cost: 120, caseSize: 20, life: 99, rank: 1, colors: ['#5a2d1a', '#e8c07d', '#ffffff'], demand: [0.5, 1, 1.2, 1.0] },
  { id: 'gummy', name: 'もぎたてグミ', brand: 'GUMMY', category: 'snack', zone: 'shelf', shape: 'smallbag', price: 160, cost: 85, caseSize: 20, life: 99, rank: 1, colors: ['#ff6fa8', '#ffe066', '#ffffff'], demand: [0.4, 1.1, 1.1, 0.8] },
  { id: 'senbei', name: '醤油せんべい', brand: '米菓', category: 'snack', zone: 'shelf', shape: 'bag', price: 230, cost: 130, caseSize: 12, life: 99, rank: 2, colors: ['#8a4b1c', '#f2d8a7', '#ffffff'], demand: [0.5, 1.1, 0.8, 0.4] },
  { id: 'cupnoodle', name: 'カップヌードル しょうゆ', brand: 'NOODLE', category: 'noodle', zone: 'shelf', shape: 'cup', price: 240, cost: 140, caseSize: 12, life: 99, rank: 1, colors: ['#ffffff', '#d9261c', '#d9261c'], demand: [0.5, 1.2, 1.1, 1.8] },
  { id: 'cupnoodle_sea', name: 'カップヌードル シーフード', brand: 'NOODLE', category: 'noodle', zone: 'shelf', shape: 'cup', price: 240, cost: 140, caseSize: 12, life: 99, rank: 1, colors: ['#ffffff', '#1c6fd9', '#1c6fd9'], demand: [0.4, 1.1, 1.0, 1.6] },
  { id: 'yakisoba', name: 'ソース焼そば', brand: 'UFO', category: 'noodle', zone: 'shelf', shape: 'flatbox', price: 260, cost: 150, caseSize: 12, life: 99, rank: 2, colors: ['#e53935', '#ffd54f', '#ffffff'], demand: [0.3, 1.1, 1.0, 1.5] },
  { id: 'melonpan', name: 'サクサクメロンパン', brand: 'BAKERY', category: 'bread', zone: 'shelf', shape: 'bread', price: 160, cost: 90, caseSize: 10, life: 3, rank: 1, colors: ['#9ed36a', '#f6e7a1', '#2f5d12'], demand: [1.6, 1.0, 0.6, 0.5] },
  { id: 'anpan', name: 'つぶあんぱん', brand: 'BAKERY', category: 'bread', zone: 'shelf', shape: 'bread', price: 150, cost: 85, caseSize: 10, life: 3, rank: 1, colors: ['#c47a3a', '#fff1d6', '#4a2208'], demand: [1.4, 0.9, 0.5, 0.4] },
  { id: 'tissue', name: 'ポケットティッシュ 6P', brand: 'SOFT', category: 'daily', zone: 'shelf', shape: 'tissue', price: 260, cost: 140, caseSize: 10, life: 99, rank: 2, colors: ['#e3f2fd', '#5c9ded', '#1f4f8a'], demand: [0.6, 0.8, 0.6, 0.4] },
  { id: 'battery', name: 'アルカリ乾電池 単3', brand: 'POWER', category: 'daily', zone: 'shelf', shape: 'pack', price: 480, cost: 260, caseSize: 10, life: 99, rank: 3, colors: ['#111111', '#f4c20d', '#f4c20d'], demand: [0.4, 0.6, 0.6, 0.5] },
  { id: 'mask', name: '不織布マスク 7枚', brand: 'CARE', category: 'daily', zone: 'shelf', shape: 'pack', price: 420, cost: 220, caseSize: 10, life: 99, rank: 2, colors: ['#ffffff', '#37a0c8', '#0b4f6c'], demand: [0.8, 0.6, 0.5, 0.3] },
  // ---- magazine rack
  { id: 'magazine', name: '週刊ポップ', brand: '週刊誌', category: 'magazine', zone: 'magazine', shape: 'magazine', price: 450, cost: 330, caseSize: 5, life: 7, rank: 1, colors: ['#e53935', '#ffffff', '#ffffff'], demand: [0.8, 1, 1, 0.8] },
  { id: 'manga', name: '週刊少年ホップ', brand: '漫画誌', category: 'magazine', zone: 'magazine', shape: 'magazine', price: 320, cost: 240, caseSize: 5, life: 7, rank: 1, colors: ['#ffd400', '#1b1b1b', '#1b1b1b'], demand: [0.8, 1.1, 1.2, 1.0] },
  // ---- ice cream chest
  { id: 'icebar', name: 'ソーダバー', brand: 'ICE', category: 'ice', zone: 'freezer', shape: 'icebar', price: 130, cost: 60, caseSize: 20, life: 99, rank: 2, colors: ['#4fc3f7', '#ffffff', '#0d47a1'], demand: [0.3, 1.4, 1.3, 0.8] },
  { id: 'icecup', name: 'バニラカップ', brand: 'ICE', category: 'ice', zone: 'freezer', shape: 'icecup', price: 290, cost: 150, caseSize: 12, life: 99, rank: 2, colors: ['#fff3e0', '#8d6e63', '#4e342e'], demand: [0.2, 1.1, 1.3, 1.0] },
  // ---- hot snacks (ordered frozen, fried, sold from the hot case)
  { id: 'karaage', name: 'からあげ棒', brand: 'ホットスナック', category: 'hot', zone: 'hot', shape: 'karaage', price: 150, cost: 55, caseSize: 20, life: 99, rank: 1, colors: ['#b9772f', '#ffffff', '#000000'], demand: [0.5, 1.4, 1.5, 1.0], fryTime: 22 },
  { id: 'chicken', name: 'ジューシーチキン', brand: 'ホットスナック', category: 'hot', zone: 'hot', shape: 'chicken', price: 220, cost: 80, caseSize: 20, life: 99, rank: 1, colors: ['#a9661f', '#ffffff', '#000000'], demand: [0.4, 1.3, 1.8, 1.0], fryTime: 28 },
  { id: 'croquette', name: '牛肉コロッケ', brand: 'ホットスナック', category: 'hot', zone: 'hot', shape: 'croquette', price: 110, cost: 38, caseSize: 20, life: 99, rank: 1, colors: ['#c98a3c', '#ffffff', '#000000'], demand: [0.4, 1.2, 1.3, 0.6], fryTime: 18 },
  { id: 'americandog', name: 'アメリカンドッグ', brand: 'ホットスナック', category: 'hot', zone: 'hot', shape: 'americandog', price: 140, cost: 50, caseSize: 20, life: 99, rank: 2, colors: ['#d59a45', '#ffffff', '#000000'], demand: [0.6, 1.0, 1.2, 0.8], fryTime: 20 },
];

export const PRODUCT_MAP = new Map(PRODUCTS.map((p) => [p.id, p]));

export function product(id: string): ProductDef {
  const p = PRODUCT_MAP.get(id);
  if (!p) throw new Error(`unknown product ${id}`);
  return p;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  drink: '飲料', alcohol: '酒類', onigiri: 'おにぎり', bento: '弁当・惣菜', bread: 'パン・サンド', snack: '菓子',
  noodle: 'カップ麺', daily: '日用品', magazine: '雑誌', ice: 'アイス', hot: 'ホットスナック', dessert: 'デザート',
};

export const ZONE_LABEL: Record<Zone, string> = {
  fridge: 'ドリンク冷蔵庫', chilled: '冷蔵オープンケース', shelf: '常温棚', magazine: '雑誌ラック', freezer: 'アイスケース', hot: 'フライヤー(冷凍在庫)',
};

/** Physical size [w, h, d] in metres used for shelf packing. */
export const SHAPE_SIZE: Record<Shape, [number, number, number]> = {
  pet: [0.068, 0.215, 0.068], can: [0.066, 0.123, 0.066], slimcan: [0.058, 0.135, 0.058], carton: [0.075, 0.195, 0.075],
  onigiri: [0.105, 0.1, 0.042], sandwich: [0.12, 0.115, 0.065], bento: [0.2, 0.055, 0.155], cup: [0.098, 0.108, 0.098],
  bag: [0.17, 0.24, 0.07], smallbag: [0.12, 0.16, 0.035], box: [0.14, 0.18, 0.06], flatbox: [0.16, 0.045, 0.12],
  bread: [0.14, 0.065, 0.14], magazine: [0.21, 0.012, 0.28], icebar: [0.075, 0.025, 0.19], icecup: [0.09, 0.06, 0.09],
  pack: [0.11, 0.17, 0.03], tissue: [0.13, 0.09, 0.075], pudding: [0.085, 0.07, 0.085], salad: [0.14, 0.08, 0.14],
  karaage: [0.035, 0.16, 0.035], chicken: [0.1, 0.03, 0.08], croquette: [0.085, 0.025, 0.065], americandog: [0.045, 0.18, 0.045],
};

/** Shapes that stand upright facing forward (label towards customer). */
export const STACKABLE: Partial<Record<Shape, number>> = {
  bento: 2, flatbox: 3, bread: 2, magazine: 6, icebar: 3, icecup: 2, tissue: 2, salad: 2, pudding: 2,
};
