import type { LureCategory } from './types';

export interface Rod {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** 基準飛距離 (m) */
  cast: number;
  /** 竿が受け止められる力 (kg)。超えると寄せる力が落ちる */
  power: number;
  /** 衝撃吸収 0..1 */
  cushion: number;
  /** 感度：アタリの見やすさ・アワセの猶予の倍率 */
  sensitivity: number;
}

export interface Reel {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** 最大ドラグ (kg) */
  dragMax: number;
  /** 巻き取り速度 (m/s) */
  speed: number;
  /** 巻き上げ力 (kg) */
  power: number;
  /** 基準糸巻量 (m) */
  capacity: number;
}

export interface Line {
  id: string;
  name: string;
  desc: string;
  price: number;
  lb: number;
  /** 見えやすさ（大きいほど魚に警戒される） */
  visibility: number;
  /** 伸び（衝撃吸収） */
  stretch: number;
  /** 糸巻量の倍率（細いPEほど多く巻ける） */
  capMult: number;
  /** 擦れに対する弱さ（根ズレでの摩耗の倍率） */
  abrasion: number;
}

export type RetrieveMode = 'dive' | 'hold' | 'bottom' | 'lift';

export interface Lure {
  id: string;
  name: string;
  desc: string;
  price: number;
  category: LureCategory;
  /** 沈下速度 (m/s)。0 = 浮く */
  sink: number;
  /** 巻いた時の挙動 */
  retrieve: RetrieveMode;
  /** dive の潜行深度 (m) */
  dive: number;
  /** 飛距離の倍率 */
  castMult: number;
  /** エサ（消耗品）: 1パックの個数 */
  pack?: number;
  /** 止めていても動いて見える（活き餌） */
  alive?: boolean;
  color: string;
}

export const RODS: Rod[] = [
  { id: 'rod_beginner', name: 'ビギナーロッド 6ft', desc: '何でもそこそこ。最初の一本。', price: 0, cast: 28, power: 3, cushion: 0.55, sensitivity: 1.0 },
  { id: 'rod_trout', name: 'トラウトロッド 7ft UL', desc: '細糸を守る柔らかさと、小さなアタリを拾う高感度。', price: 4500, cast: 32, power: 2.5, cushion: 0.75, sensitivity: 1.5 },
  { id: 'rod_bass', name: 'バスロッド 6.6ft ML', desc: '扱いやすい万能ロッド。ルアー釣りの基本。', price: 3500, cast: 36, power: 5, cushion: 0.45, sensitivity: 1.25 },
  { id: 'rod_carp', name: '鯉竿 3.6m', desc: '遠投と粘り。大型のコイやソウギョ向け。', price: 14000, cast: 50, power: 9, cushion: 0.6, sensitivity: 0.9 },
  { id: 'rod_heavy', name: 'ヘビーロッド 7.6ft H', desc: 'ライギョや大ナマズを力でねじ伏せる剛竿。', price: 22000, cast: 42, power: 16, cushion: 0.35, sensitivity: 1.0 },
  { id: 'rod_monster', name: 'モンスターロッド 8ft XXH', desc: '伝説に挑むための怪物竿。', price: 60000, cast: 48, power: 35, cushion: 0.45, sensitivity: 1.1 },
];

export const REELS: Reel[] = [
  { id: 'reel_small', name: '小型スピニング 2000番', desc: '軽量な入門リール。', price: 0, dragMax: 3, speed: 0.75, power: 4, capacity: 110 },
  { id: 'reel_mid', name: '中型スピニング 3000番', desc: 'ドラグと糸巻量に余裕がある。', price: 6000, dragMax: 6, speed: 0.85, power: 7, capacity: 160 },
  { id: 'reel_bait', name: 'ハイギア ベイトリール', desc: '巻き取りが速く、手返しが良い。', price: 12000, dragMax: 8, speed: 1.15, power: 9, capacity: 120 },
  { id: 'reel_large', name: '大型スピニング 6000番', desc: '大物用。強いドラグと大容量。', price: 26000, dragMax: 13, speed: 0.9, power: 15, capacity: 260 },
  { id: 'reel_big', name: '大型両軸リール', desc: '巨魚と渡り合うための重装備。', price: 70000, dragMax: 24, speed: 0.95, power: 30, capacity: 350 },
];

export const LINES: Line[] = [
  { id: 'nylon6', name: 'ナイロン 6lb', desc: '伸びがあり扱いやすい。', price: 0, lb: 6, visibility: 1.0, stretch: 0.15, capMult: 1.0, abrasion: 1 },
  { id: 'fluoro8', name: 'フロロカーボン 8lb', desc: '水中で見えにくく、魚に警戒されにくい。', price: 1200, lb: 8, visibility: 0.65, stretch: 0.08, capMult: 0.95, abrasion: 0.6 },
  { id: 'nylon14', name: 'ナイロン 14lb', desc: '太くて安心。ただし目立つ。', price: 1500, lb: 14, visibility: 1.15, stretch: 0.15, capMult: 0.75, abrasion: 0.8 },
  { id: 'fluoro16', name: 'フロロカーボン 16lb', desc: '強さと見えにくさの両立。', price: 2800, lb: 16, visibility: 0.8, stretch: 0.08, capMult: 0.7, abrasion: 0.45 },
  { id: 'pe3', name: 'PE 3号 (40lb)', desc: '細くて強いが伸びがなく、衝撃に弱い。', price: 4500, lb: 40, visibility: 1.35, stretch: 0, capMult: 1.4, abrasion: 1.6 },
  { id: 'pe8', name: 'PE 8号 (100lb)', desc: '伝説級の大物用。', price: 15000, lb: 100, visibility: 1.6, stretch: 0, capMult: 1.0, abrasion: 0.9 },
];

export const LURES: Lure[] = [
  { id: 'bait_worm', name: 'ミミズ', desc: 'エサ釣りの基本。何でも釣れる。', price: 200, category: 'baitWorm', sink: 0.35, retrieve: 'bottom', dive: 0, castMult: 0.8, pack: 20, color: '#a5584f' },
  { id: 'bait_dough', name: '練りエサ', desc: 'コイ・フナ類に。底でじっと待つ。', price: 300, category: 'baitDough', sink: 0.5, retrieve: 'bottom', dive: 0, castMult: 0.85, pack: 20, color: '#d8c79a' },
  { id: 'bait_live', name: '活き餌（小魚）', desc: '大型の肉食魚に効く。', price: 600, category: 'baitLive', sink: 0.25, retrieve: 'hold', dive: 0, castMult: 0.75, pack: 10, alive: true, color: '#c0c8cc' },
  { id: 'lure_spinner', name: 'スピナー', desc: 'ブレードが回転して光る。巻くだけで釣れる。', price: 700, category: 'spinner', sink: 0.6, retrieve: 'hold', dive: 0, castMult: 1.0, color: '#d8d8d8' },
  { id: 'lure_minnow', name: 'ミノー', desc: '小魚型。巻くと1mほど潜る。トゥイッチで食わせる。', price: 1000, category: 'minnow', sink: 0, retrieve: 'dive', dive: 1.2, castMult: 0.95, color: '#7aa3c4' },
  { id: 'lure_crank', name: 'クランクベイト', desc: 'リップで3mまで潜る。底をたたいて誘う。', price: 1100, category: 'crank', sink: 0, retrieve: 'dive', dive: 3.0, castMult: 1.0, color: '#e08a2c' },
  { id: 'lure_popper', name: 'ポッパー', desc: '水面で「ポコッ」と音を立てる。右クリックでポップ。', price: 900, category: 'topwater', sink: 0, retrieve: 'dive', dive: 0, castMult: 0.9, color: '#f2e6c8' },
  { id: 'lure_frog', name: 'フロッグ', desc: '水草の上も引ける。ライギョの好物。', price: 1200, category: 'frog', sink: 0, retrieve: 'dive', dive: 0, castMult: 0.95, color: '#5a8a3a' },
  { id: 'lure_worm', name: 'ワーム（テキサスリグ）', desc: '底をずる引きする。食わせの切り札。', price: 600, category: 'worm', sink: 0.8, retrieve: 'bottom', dive: 0, castMult: 0.9, color: '#5a3a6a' },
  { id: 'lure_jig', name: 'メタルジグ', desc: '速く沈み遠くへ飛ぶ。深場の魚を狙う。', price: 900, category: 'jig', sink: 2.0, retrieve: 'lift', dive: 0, castMult: 1.25, color: '#c9ced6' },
];

export const ROD_BY_ID = Object.fromEntries(RODS.map((x) => [x.id, x]));
export const REEL_BY_ID = Object.fromEntries(REELS.map((x) => [x.id, x]));
export const LINE_BY_ID = Object.fromEntries(LINES.map((x) => [x.id, x]));
export const LURE_BY_ID = Object.fromEntries(LURES.map((x) => [x.id, x]));

export const LB_TO_KG = 0.4536;

export const COOLER_LEVELS = [
  { capacity: 8, price: 0 },
  { capacity: 15, price: 3000 },
  { capacity: 25, price: 9000 },
  { capacity: 40, price: 25000 },
];
