export type TimeBand = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'fog';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Layer = 'surface' | 'mid' | 'bottom';
export type Structure = 'weeds' | 'rocks' | 'inflow' | 'dock' | 'shallows' | 'open';
export type LureCategory =
  | 'topwater'
  | 'frog'
  | 'minnow'
  | 'crank'
  | 'spinner'
  | 'worm'
  | 'jig'
  | 'baitWorm'
  | 'baitDough'
  | 'baitLive'
  | 'baitKrill';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legend';
/** 外部モデル（public/assets/fish/<id>.json） */
export type FishModelId =
  | 'trout'
  | 'salmon'
  | 'koi'
  | 'catfish'
  | 'arowana'
  // ffish.asia の実写スキャン
  | 's_carp'
  | 's_crucian'
  | 's_namazu'
  | 's_snakehead'
  | 's_oikawa'
  | 's_hasu'
  | 's_bluegill'
  | 's_bass'
  | 's_ayu'
  // 海の魚（ffish.asia の実写スキャン）
  | 'm_kurodai'
  | 'm_mejina'
  | 'm_aji'
  | 'm_saba'
  | 'm_kasago'
  | 'm_suzuki'
  | 'm_kisu'
  | 'm_kawahagi'
  | 'm_kyusen'
  | 'm_bora'
  | 'm_madai'
  | 'm_ishidai'
  | 'm_buri'
  | 'm_fugu'
  | 'm_iwashi'
  | 'm_tachiuo'
  | 'm_kue';

export interface FishModel {
  id: FishModelId;
  /** 体高・体幅の倍率（同じモデルで体型を作り分ける） */
  sy?: number;
  sz?: number;
  /** 魚種の配色をどれだけ乗せるか（0 = モデルの元テクスチャそのまま） */
  tint?: number;
  /** 元テクスチャの濃淡をどれだけ残すか 0..1（元の模様が強いモデルを別種に使う時は下げる） */
  detail?: number;
  /** 元テクスチャのまま表示する色違い・模様の id */
  native?: string[];
  /** 色違い・模様ごとに別のモデルを使う（例：錦鯉は紅白のモデル） */
  variants?: Record<string, FishModelId>;
}
export type PatternKind =
  | 'none'
  | 'lateralBand'
  | 'bars'
  | 'spots'
  | 'blotches'
  | 'mirror'
  | 'nishiki'
  | 'stripes'
  | 'scutes';
export type SpotId = 'lake' | 'stream' | 'coast' | 'offshore';

export const TIME_BANDS: TimeBand[] = ['dawn', 'day', 'dusk', 'night'];
export const WEATHERS: Weather[] = ['sunny', 'cloudy', 'rain', 'storm', 'fog'];
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const LAYERS: Layer[] = ['surface', 'mid', 'bottom'];
export const STRUCTURES: Structure[] = ['weeds', 'rocks', 'inflow', 'dock', 'shallows', 'open'];

export const TIME_LABEL: Record<TimeBand, string> = { dawn: '朝マヅメ', day: '昼', dusk: '夕マヅメ', night: '夜' };
export const WEATHER_LABEL: Record<Weather, string> = { sunny: '晴れ', cloudy: '曇り', rain: '雨', storm: '嵐', fog: '霧' };
export const SEASON_LABEL: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const LAYER_LABEL: Record<Layer, string> = { surface: '表層', mid: '中層', bottom: '底層' };
export const STRUCTURE_LABEL: Record<Structure, string> = {
  weeds: '水草帯',
  rocks: '岩場',
  inflow: '流れ込み',
  dock: '桟橋',
  shallows: '砂地の浅場',
  open: '沖の深場',
};
/** 海の釣り場でのポイントの呼び名 */
export const STRUCTURE_LABEL_SEA: Record<Structure, string> = {
  weeds: '藻場',
  rocks: '磯',
  inflow: '河口',
  dock: '堤防',
  shallows: '砂浜',
  open: '沖',
};

export function structureLabels(spot: string): Record<Structure, string> {
  return spot === 'coast' || spot === 'offshore' ? STRUCTURE_LABEL_SEA : STRUCTURE_LABEL;
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'コモン',
  uncommon: 'アンコモン',
  rare: 'レア',
  epic: 'エピック',
  legend: '伝説',
};

/** 部分的な倍率表。未指定のキーは 1 として扱う（ルアー相性だけは未指定 = 0）。 */
export type Mult<K extends string> = Partial<Record<K, number>>;

export interface Palette {
  back: string;
  flank: string;
  belly: string;
  fin: string;
  pattern: string;
}

export interface PatternDef {
  kind: PatternKind;
  /** 模様の密度（縞の本数・斑点の細かさ） */
  scale?: number;
  /** 0..1 模様の濃さ */
  intensity?: number;
  /** 錦など2色目を使う模様の色 */
  accent?: string;
}

export interface VariantBoost {
  time?: Mult<TimeBand>;
  weather?: Mult<Weather>;
  season?: Mult<Season>;
  lure?: Mult<LureCategory>;
}

export interface ColorVariant {
  id: string;
  name: string;
  /** 1/odds で出現 */
  odds: number;
  palette: Partial<Palette>;
  /** 光沢（黄金など）0..1 */
  metallic?: number;
  boost?: VariantBoost;
  priceMult?: number;
}

export interface PatternVariant {
  id: string;
  name: string;
  odds: number;
  pattern: PatternDef;
  palette?: Partial<Palette>;
  boost?: VariantBoost;
  priceMult?: number;
}

/**
 * 引きの個性。
 * bulldog = 重く長く底へ突っ込む（コイ・フナ）／ jumper = エラ洗いを繰り返す（バス）／
 * headshaker = 底で首を振り続ける（ナマズ）／ sprinter = 水面近くを速く走り回る（マス・小型の川魚）／
 * diver = 障害物へ一直線に潜る（ライギョ・主）
 */
export type FightStyle = 'bulldog' | 'jumper' | 'headshaker' | 'sprinter' | 'diver';

export interface FightParams {
  /** 体重1kgあたりの引きの強さ係数 */
  pull: number;
  /** スタミナ係数 */
  stamina: number;
  /** 走る速さ m/s（基準） */
  speed: number;
  /** ジャンプのしやすさ 0..1 */
  jump: number;
  /** 走りの頻度 0..1 */
  run: number;
  /** 底に張り付く（根に潜る）傾向 */
  bottom?: boolean;
  /** 引きの個性（未指定なら数値から決める） */
  style?: FightStyle;
}

export interface Species {
  id: string;
  no: number;
  name: string;
  sci: string;
  spot: SpotId;
  rarity: Rarity;
  desc: string;
  model: FishModel;
  length: { min: number; max: number; mean: number; sd: number };
  /** 肥満係数：重さ(g) = k × 体長(cm)^3 / 100 */
  k: number;
  layers: Mult<Layer>;
  structures: Mult<Structure>;
  times: Mult<TimeBand>;
  weathers: Mult<Weather>;
  seasons: Mult<Season>;
  /** ルアー相性（未指定 = 食わない） */
  lures: Mult<LureCategory>;
  /** 好む動き：止め / ゆっくり / 速い */
  motion: 'still' | 'slow' | 'fast' | 'any';
  fight: FightParams;
  /** 前アタリ回数 [min, max] */
  nibbles: [number, number];
  /** 本アタリでアワセが効く猶予（秒） */
  hookWindow: number;
  /** 平均サイズ1匹あたりの基本価格（円） */
  price: number;
  palette: Palette;
  pattern: PatternDef;
  colors: ColorVariant[];
  patterns: PatternVariant[];
}

export interface Conditions {
  time: TimeBand;
  weather: Weather;
  season: Season;
  layer: Layer;
  structure: Structure;
  lure: LureCategory;
  /** ルアーの動き 'still' | 'slow' | 'fast' */
  motion: 'still' | 'slow' | 'fast';
}
