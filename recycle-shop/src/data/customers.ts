import type { CategoryId } from './items';

export interface Archetype {
  id: string;
  label: string;
  /** 来店時に「買う客」になる重み / 「売る客」になる重み */
  buyWeight: number;
  sellWeight: number;
  budget: [number, number];
  /** 相場知識 (0..1)。高いほど査定額の見立てが正確 */
  knowledge: number;
  /** 売り手の希望額の強気さ */
  greed: number;
  /** 我慢強さ (0..1) */
  patience: number;
  /** 値札に対する敏感さ。高いほど高値だと買わない */
  priceSensitivity: number;
  fav: CategoryId[];
  /** レジで値引き交渉してくる確率 */
  haggle: number;
  /** 売りに来た品が偽物である確率の補正 */
  fakeRate: number;
  /** 持ち込む品の状態の良さ (0..1) */
  careful: number;
  models: string[];
  /** 出現に必要な店舗レベル / 評判 */
  minLevel: number;
  /** 出現する時間帯 (時) */
  hours?: [number, number];
  rarity: number;
}

const HUMANS = ['chars/Knight.glb', 'chars/Barbarian.glb', 'chars/Mage.glb', 'chars/Rogue.glb', 'chars/Rogue_Hooded.glb'];

export const ARCHETYPES: Archetype[] = [
  { id: 'student', label: '学生', buyWeight: 7, sellWeight: 3, budget: [500, 9000], knowledge: 0.45, greed: 1.0, patience: 0.5, priceSensitivity: 1.3, fav: ['hobby', 'kitchen', 'appliance'], haggle: 0.3, fakeRate: 0.05, careful: 0.45, models: HUMANS, minLevel: 1, rarity: 10 },
  { id: 'homemaker', label: '主婦・主夫', buyWeight: 6, sellWeight: 4, budget: [1000, 25000], knowledge: 0.6, greed: 1.05, patience: 0.6, priceSensitivity: 1.2, fav: ['kitchen', 'furniture', 'appliance'], haggle: 0.4, fakeRate: 0.05, careful: 0.7, models: HUMANS, minLevel: 1, rarity: 10 },
  { id: 'mover', label: '引っ越し前の人', buyWeight: 1, sellWeight: 8, budget: [1000, 10000], knowledge: 0.45, greed: 0.9, patience: 0.5, priceSensitivity: 1, fav: ['furniture', 'appliance', 'kitchen'], haggle: 0.1, fakeRate: 0.02, careful: 0.55, models: HUMANS, minLevel: 1, rarity: 7 },
  { id: 'elder', label: 'ご年配の方', buyWeight: 3, sellWeight: 6, budget: [2000, 60000], knowledge: 0.3, greed: 0.85, patience: 0.9, priceSensitivity: 0.9, fav: ['antique', 'kitchen', 'furniture'], haggle: 0.2, fakeRate: 0.08, careful: 0.75, models: HUMANS, minLevel: 1, rarity: 6 },
  { id: 'collector', label: 'コレクター', buyWeight: 6, sellWeight: 4, budget: [5000, 220000], knowledge: 0.9, greed: 1.15, patience: 0.7, priceSensitivity: 0.8, fav: ['antique', 'hobby', 'brand'], haggle: 0.15, fakeRate: 0.1, careful: 0.85, models: HUMANS, minLevel: 2, rarity: 5 },
  { id: 'reseller', label: 'せどらー', buyWeight: 7, sellWeight: 3, budget: [3000, 120000], knowledge: 0.95, greed: 1.2, patience: 0.4, priceSensitivity: 2.2, fav: ['brand', 'appliance', 'hobby', 'antique'], haggle: 0.5, fakeRate: 0.15, careful: 0.6, models: HUMANS, minLevel: 2, rarity: 4 },
  { id: 'rich', label: 'セレブ', buyWeight: 8, sellWeight: 2, budget: [30000, 450000], knowledge: 0.7, greed: 1.25, patience: 0.45, priceSensitivity: 0.6, fav: ['brand', 'antique', 'furniture'], haggle: 0.05, fakeRate: 0.05, careful: 0.95, models: HUMANS, minLevel: 3, rarity: 3 },
  { id: 'window', label: '冷やかし客', buyWeight: 9, sellWeight: 0, budget: [300, 3000], knowledge: 0.5, greed: 1, patience: 0.6, priceSensitivity: 1.6, fav: ['hobby', 'furniture'], haggle: 0.3, fakeRate: 0, careful: 0.5, models: HUMANS, minLevel: 1, rarity: 5 },
  { id: 'shady', label: '怪しい客', buyWeight: 0, sellWeight: 10, budget: [0, 0], knowledge: 0.95, greed: 1.3, patience: 0.35, priceSensitivity: 1, fav: ['brand', 'antique'], haggle: 0, fakeRate: 0.75, careful: 0.8, models: ['chars/Rogue_Hooded.glb'], minLevel: 3, rarity: 2 },
  { id: 'phantom', label: '謎の紳士', buyWeight: 4, sellWeight: 6, budget: [20000, 300000], knowledge: 0.6, greed: 0.95, patience: 0.8, priceSensitivity: 0.7, fav: ['antique'], haggle: 0, fakeRate: 0.1, careful: 0.9, models: ['chars/Skeleton_Mage.glb', 'chars/Skeleton_Rogue.glb', 'chars/Skeleton_Warrior.glb', 'chars/Skeleton_Minion.glb'], minLevel: 2, hours: [17, 20], rarity: 1 },
];

export const SURNAMES = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
  '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '石井', '小川', '前田', '岡田', '長谷川', '藤田', '後藤', '近藤', '村上', '遠藤', '青木', '坂本',
];
