import type { SizeClass } from './items';

export type FixtureKind = 'display' | 'register' | 'appraisal' | 'workbench' | 'stock' | 'decor';

export interface SlotDef {
  id: string;
  /** 什器ローカル座標 (m) */
  pos: [number, number, number];
  size: SizeClass;
  /** 同時に使えない枠 (床展示の特大枠 ↔ 大型枠 など) */
  overlaps?: string[];
  /** 表示時のモデルの回転 */
  rotY?: number;
}

export interface FixtureDef {
  id: string;
  name: string;
  kind: FixtureKind;
  price: number;
  level: number;
  desc: string;
  /** 占有サイズ (m, 回転前) */
  w: number;
  d: number;
  h: number;
  slots: SlotDef[];
  /** 購入して配置できるか */
  buyable: boolean;
  /** 客が商品を見る場所 (ローカル座標, 什器の手前) */
  viewOffset?: number;
  /** 高級感ボーナス (ブランド・骨董の見栄え) */
  prestige?: number;
}

const row = (prefix: string, n: number, y: number, z: number, width: number, size: SizeClass): SlotDef[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, pos: [-width / 2 + (width / n) * (i + 0.5), y, z] as [number, number, number], size }));

export const FIXTURES: Record<string, FixtureDef> = {
  wall_shelf: {
    id: 'wall_shelf', name: '陳列棚', kind: 'display', price: 18000, level: 1,
    desc: '小物を 9 点並べられる定番の棚。',
    w: 1.5, d: 0.55, h: 1.9, buyable: true, viewOffset: 0.9,
    slots: [...row('a', 3, 0.5, -0.05, 1.4, 'S'), ...row('b', 3, 1.05, -0.05, 1.4, 'S'), ...row('c', 3, 1.6, -0.05, 1.4, 'S')],
  },
  display_table: {
    id: 'display_table', name: '陳列台', kind: 'display', price: 24000, level: 1,
    desc: '中型までの商品を 6 点置ける平台。',
    w: 3.0, d: 1.5, h: 0.78, buyable: true, viewOffset: 1.2,
    slots: [...row('f', 3, 0.75, 0.36, 2.8, 'M'), ...row('b', 3, 0.75, -0.36, 2.8, 'M')],
  },
  showcase: {
    id: 'showcase', name: 'ガラスショーケース', kind: 'display', price: 65000, level: 2, prestige: 0.12,
    desc: 'ブランド品・骨董が映える鍵付きケース。高級品の見栄え +12%。',
    w: 1.5, d: 0.75, h: 1.25, buyable: true, viewOffset: 0.95,
    slots: row('s', 4, 0.76, 0.02, 1.3, 'S'),
  },
  floor_display: {
    id: 'floor_display', name: '床展示スペース', kind: 'display', price: 12000, level: 1,
    desc: '家具や家電を置く展示ラグ。大型 2 点、または特大 1 点。',
    w: 2.25, d: 1.5, h: 0.05, buyable: true, viewOffset: 1.25,
    slots: [
      { id: 'xl', pos: [0, 0.03, 0], size: 'XL', overlaps: ['l0', 'l1'] },
      { id: 'l0', pos: [-0.56, 0.03, 0], size: 'L', overlaps: ['xl'] },
      { id: 'l1', pos: [0.56, 0.03, 0], size: 'L', overlaps: ['xl'] },
    ],
  },
  register: {
    id: 'register', name: 'レジカウンター', kind: 'register', price: 0, level: 1, desc: '会計を行うカウンター。',
    w: 3.0, d: 0.9, h: 1.0, buyable: false, slots: [],
  },
  appraisal: {
    id: 'appraisal', name: '買取カウンター', kind: 'appraisal', price: 0, level: 1, desc: '持ち込み品を査定するカウンター。',
    w: 1.5, d: 0.9, h: 1.0, buyable: false, slots: [{ id: 'mat', pos: [0, 0.76, 0.1], size: 'XL' }],
  },
  workbench: {
    id: 'workbench', name: '作業台', kind: 'workbench', price: 0, level: 1, desc: '清掃・修理を行う台。',
    w: 2.25, d: 1.1, h: 0.8, buyable: false, slots: [{ id: 'bench', pos: [0, 0.8, 0.05], size: 'XL' }],
  },
  stock: {
    id: 'stock', name: '在庫置き場', kind: 'stock', price: 0, level: 1, desc: '買い取った商品の保管場所。',
    w: 1.5, d: 1.5, h: 1.2, buyable: false, slots: [],
  },
  plant_decor: {
    id: 'plant_decor', name: '観葉植物 (装飾)', kind: 'decor', price: 3000, level: 1,
    desc: '店の雰囲気が少し良くなる (客の我慢 +2%)。', w: 0.7, d: 0.7, h: 0.8, buyable: true, slots: [],
  },
  bench_decor: {
    id: 'bench_decor', name: '待合ソファ (装飾)', kind: 'decor', price: 15000, level: 2,
    desc: '待っている客がイライラしにくくなる (客の我慢 +8%)。', w: 2.25, d: 1.0, h: 0.9, buyable: true, slots: [],
  },
  drink_cooler: {
    id: 'drink_cooler', name: 'ドリンククーラー (装飾)', kind: 'decor', price: 45000, level: 4,
    desc: '店内が華やかに。評判の上がり方 +5%。', w: 0.9, d: 0.9, h: 2.2, buyable: true, slots: [],
  },
};

export const fixtureDef = (id: string) => {
  const f = FIXTURES[id];
  if (!f) throw new Error(`unknown fixture ${id}`);
  return f;
};
