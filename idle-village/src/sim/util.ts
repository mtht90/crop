// 乱数・名前など小物

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = Math.random;
export const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

const M_NAMES = [
  'タロ', 'ジロ', 'ゴン', 'ハチ', 'ケン', 'リク', 'ソラ', 'ユウ', 'カイ', 'トモ', 'ノブ', 'マサ', 'ヒロ', 'テツ',
  'ゴロウ', 'ゲン', 'ダイ', 'ショウ', 'レン', 'コタ', 'ヨシ', 'タケ', 'ボン', 'ガク', 'ジン', 'ハル', 'ロク', 'シン',
];
const F_NAMES = [
  'ハナ', 'ミミ', 'ユキ', 'サキ', 'モモ', 'リン', 'ナナ', 'アヤ', 'ココ', 'スズ', 'メイ', 'ヒナ', 'ルリ', 'カヤ',
  'チヨ', 'マユ', 'トワ', 'ウメ', 'キク', 'ノノ', 'フキ', 'アン', 'ミツ', 'サヨ', 'イト', 'ネネ', 'エマ', 'ツム',
];

export function makeName(female: boolean, used: Set<string>): string {
  const pool = female ? F_NAMES : M_NAMES;
  for (let i = 0; i < 30; i++) {
    const n = pick(pool);
    if (!used.has(n)) return n;
  }
  // 被ったら二世・三世をつける
  for (let k = 2; k < 20; k++) {
    const base = pick(pool);
    const n = `${base}${'二三四五六七八九'[Math.min(k - 2, 7)]}世`;
    if (!used.has(n)) return n;
  }
  return pick(pool) + Math.floor(Math.random() * 100);
}

const ISLAND_A = ['ひだまり', 'そよかぜ', 'こもれび', 'まどろみ', 'ささなみ', 'あさぎ', 'わたぐも', 'ほしくず', 'しおさい', 'なぎさ', 'みどり', 'こはく'];
const ISLAND_B = ['島', '島', '小島', 'の島'];
export function makeIslandName(r: () => number): string {
  return ISLAND_A[Math.floor(r() * ISLAND_A.length)] + ISLAND_B[Math.floor(r() * ISLAND_B.length)];
}
