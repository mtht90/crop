import type { ModelName } from '../core/assets';
import type { Uniform } from '../render/character';

/** 球種。キャップは軽いので、本物の野球よりずっと大きく曲がる */
export type PitchKind = 'straight' | 'curve' | 'slider' | 'shoot' | 'fork' | 'rise' | 'knuckle' | 'sinker';

export interface PitchDef {
  kind: PitchKind;
  name: string;
  short: string;
  dir: 'up' | 'down' | 'left' | 'right' | 'none' | 'down-left' | 'down-right' | 'wobble';
  // 変化の向き（右投手・捕手視点、+x が一塁側、+y が上）と量（変化量1あたりのメートル）
  bx: number;
  by: number;
  /** 0〜1。大きいほど本塁直前で曲がる */
  late: number;
  speedMul: number;
  arc: number; // 山なりの高さ
}

export const PITCHES: Record<PitchKind, PitchDef> = {
  straight: { kind: 'straight', name: 'ストレート', short: '直', dir: 'none', bx: 0, by: 0.02, late: 0.5, speedMul: 1, arc: 0.05 },
  curve: { kind: 'curve', name: 'カーブ', short: 'カ', dir: 'down-left', bx: -0.085, by: -0.06, late: 0.25, speedMul: 0.78, arc: 0.45 },
  slider: { kind: 'slider', name: 'スライダー', short: 'ス', dir: 'left', bx: -0.11, by: -0.01, late: 0.65, speedMul: 0.9, arc: 0.1 },
  shoot: { kind: 'shoot', name: 'シュート', short: 'シ', dir: 'right', bx: 0.1, by: -0.01, late: 0.6, speedMul: 0.93, arc: 0.08 },
  sinker: { kind: 'sinker', name: 'シンカー', short: 'シン', dir: 'down-right', bx: 0.075, by: -0.075, late: 0.6, speedMul: 0.86, arc: 0.15 },
  fork: { kind: 'fork', name: 'フォーク', short: 'フ', dir: 'down', bx: 0, by: -0.13, late: 0.85, speedMul: 0.87, arc: 0.12 },
  rise: { kind: 'rise', name: 'ライズボール', short: 'ラ', dir: 'up', bx: 0, by: 0.1, late: 0.7, speedMul: 0.92, arc: -0.12 },
  knuckle: { kind: 'knuckle', name: 'ナックル', short: 'ナ', dir: 'wobble', bx: 0, by: -0.03, late: 0.4, speedMul: 0.72, arc: 0.2 },
};

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

export type Pos = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF';
export const POS_JP: Record<Pos, string> = { P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '遊', LF: '左', CF: '中', RF: '右' };

export interface Player {
  name: string;
  number: number;
  pos: Pos;
  model: ModelName;
  bats: 'R' | 'L';
  meet: number; // ミート（カーソルの大きさ）
  power: number; // パワー
  speed: number; // 走力
  arm: number; // 肩力
  field: number; // 守備力
  // 投手のみ
  velo?: number; // 最高球速 km/h
  control?: number;
  stamina?: number;
  pitches?: [PitchKind, number][]; // 球種と変化量(1〜7)
}

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
  uniform: Uniform;
  awayUniform: Uniform;
  players: Player[]; // 打順（1〜9番）
  bench: Player[]; // 控え投手など
}

const P = (name: string, number: number, pos: Pos, model: ModelName, bats: 'R' | 'L', meet: number, power: number, speed: number, arm: number, field: number): Player =>
  ({ name, number, pos, model, bats, meet, power, speed, arm, field });

export const TEAMS: Team[] = [
  {
    id: 'cider',
    name: '青空サイダーズ',
    short: 'サイダ',
    color: '#2f6fd6',
    uniform: { key: 'cider-h', primary: '#f5f6f2', accent: '#1f4fae', pants: '#f2f2ee', shoes: '#172a55', cap: '#1f4fae', brim: '#1f4fae' },
    awayUniform: { key: 'cider-a', primary: '#8fc5f2', accent: '#1f4fae', pants: '#eef0f2', shoes: '#172a55', cap: '#1f4fae', brim: '#f5f6f2' },
    players: [
      P('早瀬 カケル', 8, 'CF', 'rogue', 'L', 72, 45, 88, 60, 74),
      P('二ノ宮 ツバサ', 4, '2B', 'mage', 'R', 68, 40, 70, 58, 80),
      P('風見 ソウタ', 6, 'SS', 'knight', 'R', 74, 62, 66, 72, 78),
      P('剛田 ダイチ', 3, '1B', 'barbarian', 'R', 60, 88, 38, 55, 52),
      P('鷲尾 ハヤテ', 9, 'RF', 'knight', 'L', 64, 72, 58, 80, 60),
      P('岩城 ゲンタ', 5, '3B', 'barbarian', 'R', 58, 70, 45, 74, 62),
      P('森永 アキラ', 7, 'LF', 'rogue', 'R', 62, 55, 64, 52, 56),
      P('沢村 マモル', 2, 'C', 'mage', 'R', 52, 50, 40, 76, 72),
      { ...P('青井 レン', 1, 'P', 'knight', 'R', 38, 32, 50, 82, 60), velo: 148, control: 72, stamina: 80, pitches: [['slider', 5], ['curve', 3], ['fork', 4]] },
    ],
    bench: [{ ...P('水城 ナギ', 11, 'P', 'rogue', 'L', 35, 30, 55, 70, 58), velo: 138, control: 78, stamina: 60, pitches: [['curve', 5], ['sinker', 4], ['rise', 3]] }],
  },
  {
    id: 'ramune',
    name: '夕焼けラムネーズ',
    short: 'ラムネ',
    color: '#ee6a2c',
    uniform: { key: 'ramune-h', primary: '#fbf3e6', accent: '#e85d1f', pants: '#f4ede0', shoes: '#3b2418', cap: '#e85d1f', brim: '#3b2418' },
    awayUniform: { key: 'ramune-a', primary: '#ee6a2c', accent: '#3b2418', pants: '#efe6d6', shoes: '#2a1a12', cap: '#ee6a2c', brim: '#2a1a12' },
    players: [
      P('小早川 ミノル', 4, '2B', 'rogue', 'R', 76, 38, 84, 56, 76),
      P('日向 コタロウ', 8, 'CF', 'knight', 'L', 70, 52, 80, 66, 72),
      P('大門 タケシ', 3, '1B', 'barbarian', 'L', 66, 84, 42, 50, 54),
      P('黒鉄 ゴウ', 7, 'LF', 'barbarian', 'R', 58, 92, 36, 62, 44),
      P('藤堂 ユウキ', 6, 'SS', 'mage', 'R', 70, 58, 72, 78, 82),
      P('桐生 ジン', 5, '3B', 'knight', 'R', 62, 66, 52, 70, 64),
      P('朝比奈 リク', 9, 'RF', 'rogue', 'R', 60, 56, 60, 74, 58),
      P('熊谷 テツ', 2, 'C', 'barbarian', 'R', 50, 60, 30, 72, 70),
      { ...P('真田 ヒカル', 18, 'P', 'mage', 'R', 36, 34, 52, 78, 62), velo: 142, control: 66, stamina: 85, pitches: [['shoot', 4], ['knuckle', 5], ['rise', 4]] },
    ],
    bench: [{ ...P('雨宮 シズク', 16, 'P', 'rogue', 'R', 30, 28, 50, 72, 60), velo: 151, control: 58, stamina: 55, pitches: [['fork', 6], ['slider', 3]] }],
  },
];

export interface Difficulty {
  id: 'easy' | 'normal' | 'hard';
  name: string;
  /** CPU 打者のタイミングと位置の読みの正確さ */
  cpuBatSkill: number;
  /** CPU 打者の選球眼 */
  cpuEye: number;
  /** CPU 投手の制球 */
  cpuControl: number;
  /** プレイヤーの打撃の補助（カーソルの大きさ倍率） */
  assist: number;
}
export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', name: 'やさしい', cpuBatSkill: 0.45, cpuEye: 0.45, cpuControl: 0.7, assist: 1.25 },
  { id: 'normal', name: 'ふつう', cpuBatSkill: 0.68, cpuEye: 0.65, cpuControl: 0.85, assist: 1.0 },
  { id: 'hard', name: 'つよい', cpuBatSkill: 0.85, cpuEye: 0.82, cpuControl: 1.0, assist: 0.9 },
];
