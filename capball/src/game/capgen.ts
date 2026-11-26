/**
 * キャップの銘柄を大量に作る。
 * 飲み物のジャンルごとに「色の幅・柄・書体・形・性格・得意な球種」を決めておき、
 * 銘柄名（頭＋本体）と、限定版・ZERO などの派生を組み合わせて作る。
 * 乱数は種を固定しているので、毎回同じ銘柄が同じ番号でできる（集めた記録が変わらない）。
 */
import type { PitchKind } from './data';
import type { CapBrand, CapFinish, CapLayout, CapPattern, CapShape } from './caps';

/** 種を固定した乱数（mulberry32） */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type R = () => number;
const pick = <T>(r: R, a: readonly T[]) => a[Math.floor(r() * a.length)];
const range = (r: R, lo: number, hi: number) => lo + (hi - lo) * r();

/** HSL → #rrggbb */
function hsl(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
}

/** 配色の作り方 */
type Scheme = 'white' | 'tint' | 'dark' | 'solid' | 'metal';

interface Genre {
  key: string;
  jp: string;
  en: string;
  /** 色相の幅（いくつかの帯から選ぶ） */
  hues: [number, number][];
  sat: [number, number];
  schemes: Scheme[];
  patterns: CapPattern[];
  layouts: CapLayout[];
  fonts: string[];
  shapes: CapShape[];
  finishes: CapFinish[];
  /** 性格の中心（球速・変化・制球・重さ） */
  base: [number, number, number, number];
  /** 回し方ごとの出やすい球種（straight, slider, curve, rise, drop, knuckle） */
  rep: PitchKind[][];
  pre: string[];
  core: string[];
  marks: string[];
  desc: string[];
  /** 何銘柄作るか */
  n: number;
}

const STR: PitchKind[] = ['straight', 'straight', 'twoseam', 'gyro'];
const SLD: PitchKind[] = ['slider', 'cutter', 'sweeper', 'hslider'];
const CRV: PitchKind[] = ['curve', 'slowcurve', 'slurve', 'pcurve'];
const RIS: PitchKind[] = ['rise', 'hop', 'upshoot'];
const DRP: PitchKind[] = ['drop', 'fork', 'splitter', 'sinker', 'vslider'];
const KNU: PitchKind[] = ['knuckle', 'change', 'palm'];

const GENRES: Genre[] = [
  {
    key: 'soda', jp: '炭酸', en: 'SPARKLING SODA', hues: [[0, 15], [195, 225], [130, 160], [40, 55]], sat: [70, 90], schemes: ['white', 'solid', 'tint'],
    patterns: ['bubbles', 'stripe', 'radial', 'dots', 'star'], layouts: ['center', 'band', 'arc', 'badge'], fonts: ['Dela Gothic One', 'Bungee', 'RocknRoll One'], shapes: ['std'], finishes: ['gloss', 'gloss', 'pearl'],
    base: [1.04, 1.0, 1.0, 1.02], rep: [STR, ['slider', 'hslider', 'cutter'], CRV, ['rise', 'hop'], ['drop', 'fork'], ['knuckle', 'change']],
    pre: ['シュワッと', 'ハジける', 'キラッと', 'スカッと', 'ぱちぱち', '爽快', 'ドドン', 'クール', 'ビッグ', 'まっしろ', '青空', 'はなび', 'ピカッと', 'ごくごく'],
    core: ['ソーダ', 'スパーク', 'ポップ', 'フィズ', 'バブル', 'サイダー'], marks: ['FIZZ', 'POP!', 'SODA', 'BANG', '泡', '爽', 'SPARK', 'COOL', 'BOOM'],
    desc: ['固めの炭酸用キャップ。素直で投げやすい', '泡のはじける勢いで、球がよく走る', 'クセのない王道の炭酸キャップ'], n: 44,
  },
  {
    key: 'cola', jp: 'コーラ', en: 'COLA', hues: [[0, 8], [350, 360], [25, 35]], sat: [60, 85], schemes: ['dark', 'solid', 'white'],
    patterns: ['wave', 'bolt', 'radial', 'stripe', 'ring'], layouts: ['center', 'band', 'arc'], fonts: ['Lobster', 'Bungee', 'Dela Gothic One'], shapes: ['std'], finishes: ['gloss', 'gloss', 'metal'],
    base: [1.07, 0.96, 0.95, 1.05], rep: [['straight', 'gyro'], ['hslider', 'slider'], ['curve', 'pcurve'], ['hop', 'rise'], ['fork', 'splitter'], ['knuckle']],
    pre: ['ボルト', 'ブラック', 'ダイナマイト', 'ハイパー', 'ロック', 'スーパー', 'メガ', 'クラシック', 'ナイト', 'レッド'],
    core: ['コーラ', 'コーク', 'キャンディ'], marks: ['COLA', 'Cola', 'ROCK', 'MEGA', 'Classic', 'BLACK', 'JET'],
    desc: ['黒くて固い。速いが少し暴れる', '強い炭酸に耐える分厚いキャップ。重めで速い'], n: 22,
  },
  {
    key: 'ramune', jp: 'ラムネ', en: 'RAMUNE', hues: [[180, 205]], sat: [55, 80], schemes: ['tint', 'white'],
    patterns: ['bubbles', 'ripple', 'dots', 'wave'], layouts: ['arc', 'center', 'badge'], fonts: ['Mochiy Pop One', 'RocknRoll One', 'Kaisei Decol'], shapes: ['slim', 'std'], finishes: ['pearl', 'gloss'],
    base: [0.98, 1.1, 1.0, 0.95], rep: [STR, ['slider', 'sweeper'], ['slurve', 'curve'], ['rise', 'upshoot'], ['drop', 'sinker'], ['knuckle', 'palm']],
    pre: ['夏祭り', 'ビー玉', 'なつかし', '縁日', '浜辺の', '夕涼み', 'からころ', '風鈴'], core: ['ラムネ', 'ラムネソーダ'], marks: ['ラムネ', '夏', '玉', 'RAMUNE', '涼'],
    desc: ['ビー玉の涼しさ。ふわっと浮いてよく曲がる', 'お祭りの夜のキャップ。変化球が得意'], n: 18,
  },
  {
    key: 'greentea', jp: '緑茶', en: 'GREEN TEA', hues: [[85, 130]], sat: [35, 65], schemes: ['tint', 'white', 'solid'],
    patterns: ['leaf', 'seigaiha', 'check', 'mountain', 'ring'], layouts: ['center', 'arc', 'stamp'], fonts: ['Kaisei Decol', 'Dela Gothic One', 'M PLUS Rounded 1c'], shapes: ['std'], finishes: ['matte', 'matte', 'gloss'],
    base: [0.99, 0.98, 1.12, 1.0], rep: [['twoseam', 'straight'], ['cutter', 'slider'], ['curve', 'pcurve'], ['hop', 'rise'], ['splitter', 'sinker'], ['change']],
    pre: ['茶畑の', '一番摘み', '香り立つ', '深蒸し', '静岡', '宇治', '朝摘み', 'かぶせ', 'まろやか', '濃い'], core: ['緑茶', 'お茶', '煎茶', '玉露'], marks: ['茶', '緑', '煎', '和', 'お茶', '濃'],
    desc: ['みぞが細かく指にかかる。狙った所に投げやすい', '落ち着いた球筋。制球で勝負する'], n: 30,
  },
  {
    key: 'roasted', jp: 'ほうじ茶・麦茶', en: 'ROASTED TEA', hues: [[20, 38]], sat: [35, 60], schemes: ['tint', 'white', 'solid'],
    patterns: ['leaf', 'stripe', 'seigaiha', 'ring'], layouts: ['center', 'stamp', 'arc'], fonts: ['Kaisei Decol', 'M PLUS Rounded 1c'], shapes: ['std'], finishes: ['matte'],
    base: [0.97, 1.02, 1.05, 0.9], rep: [['twoseam', 'straight'], ['slider'], ['slurve', 'curve'], ['rise'], ['sinker', 'drop'], ['knuckle', 'change']],
    pre: ['香ばし', '焙煎', 'こんがり', '大麦', '六条', 'すっきり', '冷えた'], core: ['麦茶', 'ほうじ茶', '玄米茶'], marks: ['麦', '焙', 'ほうじ', '香', '冷'],
    desc: ['軽くて飛ばない。守りに強い', '香ばしい色のキャップ。打たれても飛びにくい'], n: 18,
  },
  {
    key: 'blacktea', jp: '紅茶', en: 'BLACK TEA', hues: [[345, 360], [0, 12], [40, 48]], sat: [40, 65], schemes: ['white', 'dark', 'tint'],
    patterns: ['check', 'ring', 'flower', 'stripe'], layouts: ['arc', 'badge', 'center'], fonts: ['Lobster', 'Kaisei Decol', 'RocknRoll One'], shapes: ['std'], finishes: ['gloss', 'pearl'],
    base: [1.0, 1.05, 1.06, 0.98], rep: [STR, ['slider', 'sweeper'], ['curve', 'slowcurve'], ['rise', 'upshoot'], ['drop', 'vslider'], ['change', 'palm']],
    pre: ['午後の', 'ロイヤル', 'ミルク', 'レモン', 'アール', 'ダージリン', 'ティータイム'], core: ['ティー', '紅茶'], marks: ['TEA', 'Tea', '紅', 'Royal', 'MILK'],
    desc: ['ゆったりした変化球が得意', '上品な球筋。制球も変化もそこそこ'], n: 18,
  },
  {
    key: 'oolong', jp: '烏龍・ジャスミン', en: 'CHINESE TEA', hues: [[330, 350], [270, 300], [0, 10]], sat: [40, 65], schemes: ['tint', 'white', 'dark'],
    patterns: ['flower', 'check', 'seigaiha', 'ring'], layouts: ['stamp', 'center', 'arc'], fonts: ['Kaisei Decol', 'Dela Gothic One'], shapes: ['std'], finishes: ['matte', 'pearl'],
    base: [0.99, 1.1, 1.04, 1.02], rep: [['twoseam'], ['sweeper', 'slider'], ['slowcurve', 'slurve'], ['upshoot', 'rise'], ['sinker', 'drop'], ['palm', 'change']],
    pre: ['花香る', '紅龍', '黒', '凍頂', '福建', '月下', '桃源'], core: ['烏龍茶', 'ジャスミン茶', '花茶'], marks: ['龍', '花', '烏', '茉', '香'],
    desc: ['ふわりと曲がる。曲がり幅が大きい', '花の香りのキャップ。変化球で翻弄する'], n: 18,
  },
  {
    key: 'water', jp: '水', en: 'NATURAL WATER', hues: [[190, 215]], sat: [30, 70], schemes: ['white', 'tint'],
    patterns: ['drop', 'mountain', 'ripple', 'wave', 'snow'], layouts: ['arc', 'center', 'badge'], fonts: ['M PLUS Rounded 1c', 'Kaisei Decol', 'RocknRoll One'], shapes: ['slim', 'std'], finishes: ['pearl', 'gloss', 'matte'],
    base: [0.95, 1.14, 0.96, 0.87], rep: [STR, ['slider', 'sweeper'], ['slurve', 'curve'], ['rise', 'upshoot'], ['drop'], ['palm', 'knuckle']],
    pre: ['天然水', '雪どけ', '山の', '南アルプス', '森の', '深層', '湧き', 'やわらか', '清流', '氷河の'], core: ['の水', 'ウォーター', '名水', 'しずく'], marks: ['水', 'WATER', '雫', '山', 'H₂O', '清'],
    desc: ['薄くて軽い。よく曲がり、打たれても飛ばない', 'ペラペラの軽いキャップ。変化球向き'], n: 30,
  },
  {
    key: 'sports', jp: 'スポーツドリンク', en: 'SPORTS DRINK', hues: [[200, 225], [180, 195], [50, 60]], sat: [70, 95], schemes: ['white', 'solid'],
    patterns: ['wave', 'stripe', 'radial', 'chevron'], layouts: ['band', 'center', 'arc'], fonts: ['Bungee', 'RocknRoll One', 'Dela Gothic One'], shapes: ['wide', 'wide', 'std'], finishes: ['gloss', 'matte'],
    base: [0.91, 1.22, 0.93, 0.95], rep: [STR, ['sweeper', 'slider'], ['slowcurve', 'slurve'], ['rise', 'upshoot'], ['drop', 'vslider'], ['knuckle']],
    pre: ['アクア', 'イオン', 'ハイドロ', 'グリーン', 'アクティブ', 'チャージ', 'ブルー', 'ミネラ'], core: ['ラン', 'ゲイン', 'スエット', 'ドリンク', 'ショット'], marks: ['ION', 'AQ', 'RUN', 'H2O', 'GO', 'ACT'],
    desc: ['口の広い大きめキャップ。空気をつかんでよく曲がるが遅い', '広口キャップ。大きく曲がる'], n: 24,
  },
  {
    key: 'energy', jp: 'エナジードリンク', en: 'ENERGY', hues: [[90, 130], [280, 320], [15, 30], [180, 195]], sat: [85, 100], schemes: ['dark', 'dark', 'metal'],
    patterns: ['bolt', 'stripe', 'chevron', 'radial', 'star'], layouts: ['band', 'center', 'badge'], fonts: ['Bungee', 'Dela Gothic One'], shapes: ['std', 'flat'], finishes: ['metal', 'gloss'],
    base: [1.12, 0.93, 0.86, 1.08], rep: [['gyro', 'straight'], ['cutter', 'hslider'], ['pcurve'], ['hop'], ['splitter', 'fork'], ['knuckle', 'change']],
    pre: ['ゴリラ', 'ライオン', 'ドラゴン', 'サンダー', 'ターボ', 'ニトロ', 'マッハ', 'ビースト', 'ジェット', 'ブースト'], core: ['チャージ', 'エナジー', 'パワー', 'ショット', 'ブースト'], marks: ['GO!', 'MAX', 'V8', 'ZAP', 'NRG', '!!', 'X'],
    desc: ['とにかく速い。そのぶん制球は荒れる', '豪速球のキャップ。荒れ球に注意'], n: 28,
  },
  {
    key: 'coffee', jp: 'コーヒー', en: 'COFFEE', hues: [[20, 35]], sat: [30, 55], schemes: ['dark', 'metal', 'white'],
    patterns: ['beans', 'stripe', 'ring', 'check'], layouts: ['arc', 'badge', 'center', 'stamp'], fonts: ['Lobster', 'Kaisei Decol', 'Bungee'], shapes: ['flat', 'std'], finishes: ['metal', 'metal', 'matte'],
    base: [1.07, 0.86, 1.04, 1.13], rep: [['gyro', 'straight'], ['cutter'], ['pcurve', 'curve'], ['hop'], ['splitter', 'fork'], ['change']],
    pre: ['ゴールド', 'ブラック', '深煎り', '朝の', 'ブレンド', '炭焼', 'エメラルド', 'カフェ', '職人'], core: ['ブリュー', 'コーヒー', 'ラテ', 'エスプレッソ'], marks: ['BREW', 'CAFE', 'Latte', '珈琲', 'BLACK', '深'],
    desc: ['金属キャップ。重くて速く、曲がりは小さい', 'ボトル缶の金属キャップ。重い速球が武器'], n: 24,
  },
  {
    key: 'lactic', jp: '乳酸菌', en: 'LACTIC DRINK', hues: [[195, 215], [330, 350], [45, 55]], sat: [45, 75], schemes: ['white', 'tint'],
    patterns: ['heart', 'dots', 'bubbles', 'spots'], layouts: ['center', 'badge', 'arc'], fonts: ['Mochiy Pop One', 'M PLUS Rounded 1c'], shapes: ['slim'], finishes: ['pearl', 'gloss'],
    base: [0.93, 1.04, 1.12, 0.92], rep: [['twoseam', 'straight'], ['slider'], ['slowcurve', 'curve'], ['rise'], ['drop'], ['change', 'knuckle']],
    pre: ['ミル', 'ヤク', 'ぴこ', 'まいにち', 'すこやか', 'ぷるん', 'いちご', 'のむ'], core: ['ピコ', 'ルト', 'ラクト', 'ヨーグル'], marks: ['ミル', 'ピコ', 'LB', '乳', '♥'],
    desc: ['小さめで扱いやすい。遅いが狙いやすい', 'かわいい小粒キャップ。制球がいい'], n: 20,
  },
  {
    key: 'juice', jp: '果汁', en: 'FRUIT JUICE', hues: [[25, 40], [48, 58], [340, 355], [90, 110], [280, 300]], sat: [75, 95], schemes: ['white', 'solid', 'tint'],
    patterns: ['fruit', 'dots', 'radial', 'flower'], layouts: ['center', 'badge', 'band'], fonts: ['Mochiy Pop One', 'RocknRoll One', 'Lobster'], shapes: ['std'], finishes: ['gloss'],
    base: [1.0, 1.04, 1.0, 1.0], rep: [STR, SLD, CRV, RIS, DRP, KNU],
    pre: ['まるごと', 'しぼりたて', '朝の', '完熟', '果実の', 'たっぷり', 'みずみずしい'], core: ['オレンジ', 'りんご', 'ぶどう', 'もも', 'レモン', 'パイン', 'マンゴー', 'メロン', 'いちご'], marks: ['100%', 'FRUIT', '果', 'JUICY', '実'],
    desc: ['いちばん普通のキャップ。基準にちょうどいい', 'フルーツのキャップ。バランス型'], n: 36,
  },
  {
    key: 'hot', jp: 'ホット', en: 'HOT DRINK', hues: [[18, 30]], sat: [80, 95], schemes: ['solid', 'white'],
    patterns: ['radial', 'stripe', 'wave', 'ring'], layouts: ['band', 'center', 'arc'], fonts: ['Dela Gothic One', 'RocknRoll One'], shapes: ['tall'], finishes: ['matte', 'gloss'],
    base: [1.1, 0.84, 1.02, 1.16], rep: [['gyro', 'straight'], ['hslider'], ['pcurve'], ['hop'], ['fork', 'splitter'], ['change']],
    pre: ['ほっと', 'あったか', 'ぬくもり', '冬の', '湯気の', 'ホカホカ'], core: ['ミルクティー', 'ココア', 'レモン', 'ゆず', 'しょうが湯', 'コーンスープ'], marks: ['HOT', '温', 'ほっと', 'WARM', '冬'],
    desc: ['分厚いホット用キャップ。速くて重いが、曲がりにくい', '背の高いホット用。重い速球'], n: 18,
  },
  {
    key: 'milk', jp: 'ミルク', en: 'MILK', hues: [[205, 220], [40, 50], [120, 140]], sat: [40, 70], schemes: ['white'],
    patterns: ['spots', 'check', 'dots', 'mountain'], layouts: ['center', 'arc', 'badge'], fonts: ['Mochiy Pop One', 'Kaisei Decol', 'RocknRoll One'], shapes: ['std', 'wide'], finishes: ['matte', 'gloss'],
    base: [0.97, 1.02, 1.08, 1.03], rep: [STR, ['slider', 'cutter'], ['curve', 'slowcurve'], ['rise'], ['drop', 'sinker'], ['change']],
    pre: ['牧場の', '高原', 'おいしい', 'ほっぺ', 'しぼりたて', 'まきば'], core: ['牛乳', 'ミルク', 'カフェオレ', 'いちごミルク'], marks: ['MILK', '乳', 'モー', '牧'],
    desc: ['ほどよい重さで素直な球筋', '牧場のキャップ。投げやすく粘り強い'], n: 16,
  },
  {
    key: 'wafu', jp: '和風', en: 'JAPANESE', hues: [[350, 360], [0, 8], [40, 50], [150, 170]], sat: [55, 80], schemes: ['white', 'solid', 'dark'],
    patterns: ['seigaiha', 'flower', 'asanoha', 'check'], layouts: ['stamp', 'center', 'arc'], fonts: ['Kaisei Decol', 'Dela Gothic One'], shapes: ['std'], finishes: ['matte', 'pearl'],
    base: [1.0, 1.08, 1.06, 1.0], rep: [['twoseam', 'straight'], ['sweeper', 'slider'], ['slowcurve', 'curve'], ['upshoot', 'rise'], ['sinker', 'vslider'], ['palm', 'knuckle']],
    pre: ['京の', '雅', '桜', '紅葉', '月見', '松竹', '風神', '雷神', '花鳥'], core: ['甘酒', 'ゆず', '梅', '抹茶ラテ', '黒糖', '柚子', 'しそ'], marks: ['雅', '桜', '梅', '柚', '粋', '和', '福'],
    desc: ['和柄のキャップ。変化と制球を両立', '雅な球筋。ゆったり大きく曲がる'], n: 22,
  },
  {
    key: 'vegetable', jp: '野菜', en: 'VEGETABLE', hues: [[0, 10], [25, 35], [95, 120]], sat: [55, 80], schemes: ['white', 'tint'],
    patterns: ['leaf', 'dots', 'stripe', 'fruit'], layouts: ['center', 'arc'], fonts: ['M PLUS Rounded 1c', 'Mochiy Pop One'], shapes: ['std'], finishes: ['matte'],
    base: [0.98, 0.98, 1.08, 1.05], rep: [['twoseam'], ['cutter', 'slider'], ['pcurve'], ['rise'], ['sinker'], ['change']],
    pre: ['一日分の', '畑の', 'まいにち', '緑黄色', 'すりおろし', '30品目'], core: ['野菜', 'トマト', 'にんじん', 'グリーン'], marks: ['菜', 'VEGE', '畑', '緑'],
    desc: ['堅実なキャップ。崩れにくい', '畑のキャップ。じっくり制球で勝負'], n: 14,
  },
  {
    key: 'smoothie', jp: 'スムージー', en: 'SMOOTHIE', hues: [[300, 340], [95, 140], [40, 55]], sat: [60, 85], schemes: ['tint', 'white', 'solid'],
    patterns: ['fruit', 'bubbles', 'chevron', 'heart'], layouts: ['badge', 'center', 'band'], fonts: ['Mochiy Pop One', 'Lobster', 'Bungee'], shapes: ['wide', 'std'], finishes: ['gloss', 'pearl'],
    base: [0.94, 1.16, 0.98, 0.97], rep: [STR, ['sweeper', 'slider'], ['slurve', 'slowcurve'], ['upshoot', 'rise'], ['sinker', 'drop'], ['palm', 'knuckle']],
    pre: ['とろける', 'ベリー', 'トロピカル', 'グリーン', 'ふわとろ', 'もっちり'], core: ['スムージー', 'シェイク', 'ヨーグルト'], marks: ['SMOOTH', 'Berry', 'YUM', 'MIX'],
    desc: ['どろっとした重みで、変化球がよく曲がる', '広めのキャップ。大きく曲がる'], n: 16,
  },
];

/** 派生（同じ銘柄の別バージョン） */
interface Variant { s: string; badge?: string; eff: [number, number, number, number]; boost: number; w: number; metal?: boolean; only?: string[] }
const VARIANTS: Variant[] = [
  { s: '', eff: [0, 0, 0, 0], boost: 0, w: 8 },
  { s: ' ZERO', badge: 'ZERO', eff: [0, 0.02, 0, -0.06], boost: 0, w: 2 },
  { s: ' ライト', badge: 'LIGHT', eff: [-0.02, 0.03, 0, -0.05], boost: 0, w: 2 },
  { s: ' ストロング', badge: 'STRONG', eff: [0.04, -0.02, -0.03, 0.03], boost: 0, w: 2 },
  { s: ' プレミアム', badge: 'PREMIUM', eff: [0.02, 0.03, 0.03, -0.01], boost: 1, w: 1.2 },
  { s: '（期間限定）', badge: '限定', eff: [0, 0.06, 0, 0], boost: 1, w: 1.2 },
  { s: ' ゴールド', badge: 'GOLD', eff: [0.04, 0.04, 0.03, -0.02], boost: 2, w: 0.6, metal: true },
  { s: ' 微糖', badge: '微糖', eff: [0, 0, 0.04, 0], boost: 0, w: 2, only: ['coffee', 'blacktea'] },
  { s: ' 夏限定', badge: '夏', eff: [0.02, 0.04, 0, -0.02], boost: 1, w: 1 },
  { s: ' 冬限定', badge: '冬', eff: [0.03, 0, 0.02, 0.03], boost: 1, w: 1 },
  { s: ' ご当地', badge: 'ご当地', eff: [0, 0.03, 0.03, 0], boost: 1, w: 0.8 },
  { s: ' ビッグ', badge: 'BIG', eff: [-0.02, 0.05, -0.02, 0.04], boost: 0, w: 1.2 },
];

function weighted<T extends { w: number }>(r: R, a: T[]) {
  let x = r() * a.reduce((s, v) => s + v.w, 0);
  for (const v of a) if ((x -= v.w) <= 0) return v;
  return a[a.length - 1];
}

function palette(r: R, g: Genre, metal: boolean) {
  const band = pick(r, g.hues);
  const h = range(r, band[0], band[1]);
  const s = range(r, g.sat[0], g.sat[1]);
  const scheme: Scheme = metal ? 'metal' : pick(r, g.schemes);
  const h2 = h + pick(r, [0, 0, 0, 30, -30, 180]);
  switch (scheme) {
    case 'white':
      return { body: hsl(h, s, range(r, 40, 55)), label: hsl(h, 20, 97), accent: hsl(h2, s, range(r, 42, 52)), ink: hsl(h, s * 0.9, range(r, 25, 38)) };
    case 'tint':
      return { body: hsl(h, s, range(r, 45, 58)), label: hsl(h, s * 0.6, range(r, 86, 92)), accent: hsl(h2, s, range(r, 45, 55)), ink: hsl(h, s, range(r, 22, 32)) };
    case 'dark':
      return { body: hsl(h, s * 0.3, range(r, 12, 20)), label: hsl(h, s * 0.35, range(r, 10, 16)), accent: hsl(h2, s, range(r, 50, 60)), ink: hsl(h2, s, range(r, 58, 70)) };
    case 'solid':
      return { body: hsl(h, s, range(r, 42, 52)), label: hsl(h, s, range(r, 46, 54)), accent: hsl(h2, s * 0.8, range(r, 75, 85)), ink: '#ffffff' };
    case 'metal': {
      const gold = r() < 0.6;
      const mh = gold ? range(r, 40, 48) : h;
      return { body: hsl(mh, gold ? 65 : 20, gold ? 52 : 62), label: hsl(h, s * 0.4, range(r, 12, 20)), accent: hsl(mh, 70, 60), ink: hsl(mh, 75, 70) };
    }
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const SLOT_NULL = 0.12;

/** 銘柄を作る（rarity はあとで能力の順位から決める） */
export function generateCaps(): CapBrand[] {
  const out: (CapBrand & { score: number })[] = [];
  const seen = new Set<string>();
  for (const g of GENRES) {
    const r = rng(hashStr(g.key) ^ 0x5eed);
    let made = 0, guard = 0;
    while (made < g.n && guard++ < g.n * 30) {
      const v = weighted(r, VARIANTS.filter((x) => !x.only || x.only.includes(g.key)));
      const name = `${pick(r, g.pre)}${pick(r, g.core)}${v.s}`;
      if (seen.has(name)) continue;
      seen.add(name);
      const metal = !!v.metal || (g.finishes.includes('metal') && r() < 0.3);
      const pal = palette(r, g, metal);
      const jit = () => range(r, -0.05, 0.05);
      const [bs, bb, bc, bw] = g.base;
      const speed = clamp(bs + jit() + v.eff[0], 0.86, 1.16);
      const brk = clamp(bb + jit() * 1.3 + v.eff[1], 0.8, 1.3);
      const control = clamp(bc + jit() + v.eff[2], 0.84, 1.17);
      const weight = clamp(bw + jit() + v.eff[3], 0.84, 1.2);
      // 持ち球：ジャンルの得意な球種から選ぶ。たまに投げられない回し方がある（ストレート系は必ずある）
      const rep = g.rep.map((pool, i) => (i > 0 && r() < SLOT_NULL ? null : pick(r, pool)));
      const shape = pick(r, g.shapes);
      // 能力の合計（投手に有利な方向）＋派生の格で、あとからレア度を決める
      const score = (speed - 1) * 1.2 + (brk - 1) * 0.9 + (control - 1) * 1.1 - (weight - 1) * 0.6 + rep.filter(Boolean).length * 0.01 + v.boost * 0.05 + range(r, 0, 0.03);
      out.push({
        id: `${g.key}-${made.toString(36)}`,
        name,
        genre: g.jp,
        desc: pick(r, g.desc),
        ...pal,
        mark: pick(r, g.marks),
        pattern: pick(r, g.patterns),
        layout: pick(r, g.layouts),
        font: pick(r, g.fonts),
        sub: g.en,
        badge: v.badge,
        shape,
        finish: metal ? 'metal' : pick(r, g.finishes),
        ridges: shape === 'wide' ? 60 + Math.floor(r() * 3) * 12 : 72 + Math.floor(r() * 5) * 12,
        speed, brk, control, weight,
        rep,
        rarity: 'N',
        score,
      });
      made++;
    }
  }
  // レア度：能力の上位から SSR 3%・SR 10%・R 27%・残り N
  const sorted = [...out].sort((a, b) => b.score - a.score);
  sorted.forEach((c, i) => {
    const p = i / sorted.length;
    c.rarity = p < 0.03 ? 'SSR' : p < 0.13 ? 'SR' : p < 0.4 ? 'R' : 'N';
  });
  return out.map(({ score: _s, ...c }) => c);
}
