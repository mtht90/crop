import type { ModelName } from '../core/assets';
import type { Uniform } from '../render/character';

/**
 * 球種。キャップ野球で知られている投げ方に合わせる。
 * 投げ方（回し方）は6通り（PitchSlot）で、同じ回し方でもキャップによって出る球種が違う。
 */
export type PitchSlot = 'straight' | 'knuckle' | 'slider' | 'curve' | 'rise' | 'drop';
export type PitchKind =
  | 'straight' | 'twoseam' | 'gyro'
  | 'knuckle' | 'change' | 'palm'
  | 'slider' | 'cutter' | 'sweeper' | 'hslider'
  | 'curve' | 'slowcurve' | 'slurve' | 'pcurve'
  | 'rise' | 'hop' | 'upshoot'
  | 'drop' | 'fork' | 'splitter' | 'sinker' | 'vslider';

export interface PitchDef {
  kind: PitchKind;
  /** どの回し方で出る球種か */
  slot: PitchSlot;
  name: string;
  /** 握りと投げ方（画面に出す説明） */
  grip: string;
  // 変化の量（変化量1あたりのメートル）。横の向きは回した向きで決まるので、bx は大きさだけを使う
  bx: number;
  by: number;
  /** 0〜1。大きいほど本塁直前で曲がる */
  late: number;
  speedMul: number;
  arc: number; // 山なりの高さ
  /** 画面のキャップの傾き（ラジアン） */
  tilt: number;
  /** 無回転の揺れ（0=揺れない） */
  wobble?: number;
}

const D = (kind: PitchKind, slot: PitchSlot, name: string, grip: string, bx: number, by: number, late: number, speedMul: number, arc: number, tilt: number, wobble = 0): PitchDef => ({ kind, slot, name, grip, bx, by, late, speedMul, arc, tilt, wobble });

export const PITCHES: Record<PitchKind, PitchDef> = {
  // 回さずに速く払う
  straight: D('straight', 'straight', 'ストレート', '面を進行方向に向け、回転を抑えて押し出す', 0.012, 0.015, 0.5, 1, 0.04, 0),
  twoseam: D('twoseam', 'straight', 'ツーシーム', '少しだけ面をずらして押し出す。手元でわずかに沈みながら逃げる', 0.035, -0.035, 0.75, 0.97, 0.04, 0.12),
  gyro: D('gyro', 'straight', 'ジャイロボール', '進行方向を軸に回す。いちばん速く、終盤まで落ちずに伸びる', 0, 0.035, 0.9, 1.06, 0, 0),
  // 回さずにゆっくり払う
  knuckle: D('knuckle', 'knuckle', 'ナックル', 'キャップを90度立てて無回転で投げる。揺れて落ちる', 0, -0.035, 0.4, 0.62, 0.18, 1.57, 1),
  change: D('change', 'knuckle', 'チェンジアップ', '腕の振りはそのまま、指を抜く。遅く、少し沈む', 0.02, -0.06, 0.6, 0.7, 0.12, 0.3),
  palm: D('palm', 'knuckle', 'パーム', '手のひらで押し出す。とても遅く、揺れながら落ちる', 0, -0.08, 0.5, 0.58, 0.2, 1.2, 0.45),
  // 大きめに少し回す
  slider: D('slider', 'slider', 'スライダー', '面を上に向けて約30度傾け、横に滑らせる', 0.12, -0.005, 0.7, 0.84, 0.08, 0.52),
  cutter: D('cutter', 'slider', 'カットボール', 'ストレートに近い速さで、手元でほんの少しだけ曲がる', 0.05, -0.005, 0.92, 0.95, 0.04, 0.3),
  sweeper: D('sweeper', 'slider', 'スイーパー', '面を寝かせて大きく払う。真横に大きく滑る', 0.17, 0.0, 0.55, 0.78, 0.1, 0.62),
  hslider: D('hslider', 'slider', '高速スライダー', '速さを保ったまま、手元で鋭く曲がる', 0.08, -0.02, 0.86, 0.92, 0.05, 0.45),
  // 大きめにたくさん回す
  curve: D('curve', 'curve', 'カーブ', '面を約45度傾けて弾く。横回転で大きく曲がる', 0.1, -0.055, 0.3, 0.72, 0.35, 0.78),
  slowcurve: D('slowcurve', 'curve', 'スローカーブ', 'ふわりと山なりに投げる。とても遅く、大きく曲がり落ちる', 0.09, -0.09, 0.2, 0.55, 0.55, 0.9),
  slurve: D('slurve', 'curve', 'スラーブ', 'スライダーとカーブの間。斜めに大きく曲がる', 0.13, -0.08, 0.45, 0.76, 0.25, 0.7),
  pcurve: D('pcurve', 'curve', 'パワーカーブ', '強く弾いて速さのあるカーブ。曲がりは小さめ', 0.07, -0.07, 0.5, 0.86, 0.15, 0.7),
  // 縦長に左回り
  rise: D('rise', 'rise', 'ライズ', '下から面を寝かせて弾き、打者の手元で浮き上がらせる', 0.025, 0.11, 0.88, 0.86, -0.1, -0.9),
  hop: D('hop', 'rise', 'ホップボール', '速さのある球が、最後にふっと浮く', 0.015, 0.065, 0.95, 0.98, -0.05, -0.6),
  upshoot: D('upshoot', 'rise', 'アップシュート', '浮き上がりながら横にも逃げる', 0.07, 0.085, 0.8, 0.84, -0.08, -0.8),
  // 縦長に右回り
  drop: D('drop', 'drop', 'ドロップ', '上から下へ回転をかける。打者の手前でストンと落ちる', 0, -0.11, 0.82, 0.84, 0.12, 0.9),
  fork: D('fork', 'drop', 'フォーク', '指で挟むように抜く。手元で鋭く大きく落ちる', 0, -0.14, 0.93, 0.82, 0.05, 1.1),
  splitter: D('splitter', 'drop', 'スプリット', '速いまま、最後に小さく落ちる', 0, -0.08, 0.94, 0.93, 0.04, 1.0),
  sinker: D('sinker', 'drop', 'シンカー', '落ちながら横にも曲がる', 0.07, -0.09, 0.75, 0.8, 0.1, 0.8),
  vslider: D('vslider', 'drop', '縦スライダー', '縦に滑るように、速く落ちる', 0.03, -0.12, 0.86, 0.86, 0.06, 0.95),
};

export const SLOTS: PitchSlot[] = ['straight', 'slider', 'curve', 'rise', 'drop', 'knuckle'];
/** 回し方の説明 */
export const SLOT_HOW: Record<PitchSlot, string> = {
  straight: '回さず速く',
  knuckle: '回さずゆっくり',
  slider: '大きめに少し回す',
  curve: '大きめにたくさん回す',
  rise: '縦長に左回り',
  drop: '縦長に右回り',
};

/**
 * 変化の向きと量。向き（左右）ははじいた方向 side（-1=三塁側/左、+1=一塁側/右）で決まり、
 * 球種は縦の動きと横の大きさ（＝曲がり方の性格）を決める。
 */
export function breakVector(kind: PitchKind, lv: number, side: number) {
  const def = PITCHES[kind];
  return { x: Math.abs(def.bx) * lv * side, y: def.by * lv };
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export function grade(v: number): Grade {
  if (v >= 90) return 'S';
  if (v >= 80) return 'A';
  if (v >= 70) return 'B';
  if (v >= 60) return 'C';
  if (v >= 50) return 'D';
  if (v >= 40) return 'E';
  if (v >= 20) return 'F';
  return 'G';
}

/** 5人制：投手・捕手・内野手2人・指名打者 */
export type Pos = 'P' | 'C' | 'IF1' | 'IF2' | 'DH';
export const POS_JP: Record<Pos, string> = { P: '投', C: '捕', IF1: '内', IF2: '内', DH: '指' };

export interface Player {
  name: string;
  number: number;
  pos: Pos;
  model: ModelName;
  bats: 'R' | 'L';
  meet: number; // ミート（カーソルの大きさ）
  power: number; // パワー
  field: number; // 守備（反応と捕球）
  speed: number; // 守備範囲（足の速さ）
  // 投手のみ
  velo?: number; // 最高球速 km/h（公式の目安 30〜100km/h）
  control?: number;
  stamina?: number;
  pitches?: [PitchSlot, number][]; // 得意な投げ方と変化量(1〜7)。実際の球種はキャップで決まる
}

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
  uniform: Uniform;
  awayUniform: Uniform;
  players: Player[]; // 打順（1〜5番）
  bench: Player[]; // 控え投手（一度降板した投手は再登板できない）
}

const P = (name: string, number: number, pos: Pos, model: ModelName, bats: 'R' | 'L', meet: number, power: number, field: number, speed: number): Player =>
  ({ name, number, pos, model, bats, meet, power, field, speed });

export const TEAMS: Team[] = [
  {
    id: 'cider',
    name: '青空サイダーズ',
    short: 'サイダ',
    color: '#2f6fd6',
    uniform: { key: 'cider-h', primary: '#f5f6f2', accent: '#1f4fae', pants: '#f2f2ee', shoes: '#172a55', cap: '#1f4fae', brim: '#1f4fae' },
    awayUniform: { key: 'cider-a', primary: '#8fc5f2', accent: '#1f4fae', pants: '#eef0f2', shoes: '#172a55', cap: '#1f4fae', brim: '#f5f6f2' },
    players: [
      P('早瀬 カケル', 8, 'IF1', 'rogue', 'L', 76, 48, 74, 88),
      P('風見 ソウタ', 6, 'IF2', 'knight', 'R', 72, 64, 80, 70),
      P('剛田 ダイチ', 3, 'DH', 'barbarian', 'R', 58, 90, 30, 30),
      P('沢村 マモル', 2, 'C', 'mage', 'R', 60, 56, 72, 46),
      { ...P('青井 レン', 1, 'P', 'knight', 'R', 44, 40, 62, 56), velo: 96, control: 72, stamina: 78, pitches: [['slider', 5], ['curve', 3], ['rise', 4], ['drop', 4]] },
    ],
    bench: [{ ...P('水城 ナギ', 11, 'P', 'rogue', 'R', 38, 30, 58, 55), velo: 82, control: 80, stamina: 60, pitches: [['curve', 6], ['knuckle', 4]] }],
  },
  {
    id: 'ramune',
    name: '夕焼けラムネーズ',
    short: 'ラムネ',
    color: '#ee6a2c',
    uniform: { key: 'ramune-h', primary: '#fbf3e6', accent: '#e85d1f', pants: '#f4ede0', shoes: '#3b2418', cap: '#e85d1f', brim: '#3b2418' },
    awayUniform: { key: 'ramune-a', primary: '#ee6a2c', accent: '#3b2418', pants: '#efe6d6', shoes: '#2a1a12', cap: '#ee6a2c', brim: '#2a1a12' },
    players: [
      P('小早川 ミノル', 4, 'IF2', 'rogue', 'R', 80, 40, 76, 84),
      P('日向 コタロウ', 8, 'IF1', 'knight', 'L', 70, 58, 72, 74),
      P('黒鉄 ゴウ', 7, 'DH', 'barbarian', 'R', 56, 94, 30, 30),
      P('熊谷 テツ', 2, 'C', 'barbarian', 'R', 58, 66, 70, 40),
      { ...P('真田 ヒカル', 18, 'P', 'mage', 'R', 40, 36, 64, 58), velo: 90, control: 64, stamina: 85, pitches: [['knuckle', 6], ['rise', 5], ['curve', 3], ['drop', 3]] },
    ],
    bench: [{ ...P('雨宮 シズク', 16, 'P', 'rogue', 'R', 30, 28, 60, 52), velo: 100, control: 56, stamina: 55, pitches: [['slider', 6], ['drop', 5], ['rise', 3]] }],
  },
];

export interface Difficulty {
  id: 'easy' | 'normal' | 'hard';
  name: string;
  cpuBatSkill: number;
  cpuEye: number;
  cpuControl: number;
  assist: number;
}
export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', name: 'やさしい', cpuBatSkill: 0.45, cpuEye: 0.45, cpuControl: 0.7, assist: 1.25 },
  { id: 'normal', name: 'ふつう', cpuBatSkill: 0.68, cpuEye: 0.65, cpuControl: 0.85, assist: 1.0 },
  { id: 'hard', name: 'つよい', cpuBatSkill: 0.85, cpuEye: 0.82, cpuControl: 1.0, assist: 0.9 },
];
