import type { ModelName } from '../core/assets';
import type { Uniform } from '../render/character';

/**
 * 球種。キャップ野球で知られている投げ方に合わせる。
 * キャップの面の向きと傾き、回転のかけ方で変化が決まる。
 */
export type PitchKind = 'straight' | 'curve' | 'slider' | 'knuckle' | 'rise';

export interface PitchDef {
  kind: PitchKind;
  name: string;
  /** 握りと投げ方（画面に出す説明） */
  grip: string;
  dir: 'up' | 'down' | 'left' | 'right' | 'none' | 'down-left' | 'down-right' | 'wobble';
  // 変化の向き（右投手・捕手視点、+x が一塁側、+y が上）と量（変化量1あたりのメートル）
  bx: number;
  by: number;
  /** 0〜1。大きいほど本塁直前で曲がる */
  late: number;
  speedMul: number;
  arc: number; // 山なりの高さ
  /** 画面のキャップの傾き（ラジアン） */
  tilt: number;
}

export const PITCHES: Record<PitchKind, PitchDef> = {
  straight: { kind: 'straight', name: 'ストレート', grip: '面を進行方向に向け、回転を抑えて押し出す', dir: 'none', bx: 0, by: 0.015, late: 0.5, speedMul: 1, arc: 0.04, tilt: 0 },
  curve: { kind: 'curve', name: 'カーブ', grip: '面を約45度傾けて弾く。横回転で大きく曲がる', dir: 'down-left', bx: -0.1, by: -0.055, late: 0.3, speedMul: 0.72, arc: 0.35, tilt: 0.78 },
  slider: { kind: 'slider', name: 'スライダー', grip: '面を上に向けて約30度傾け、横に滑らせる', dir: 'left', bx: -0.12, by: -0.005, late: 0.7, speedMul: 0.84, arc: 0.08, tilt: 0.52 },
  rise: { kind: 'rise', name: 'ライズ', grip: '下から面を寝かせて弾き、打者の手元で浮き上がらせる', dir: 'up', bx: 0, by: 0.095, late: 0.75, speedMul: 0.86, arc: -0.1, tilt: -0.9 },
  knuckle: { kind: 'knuckle', name: 'ナックル', grip: 'キャップを90度立てて無回転で投げる。揺れて落ちる', dir: 'wobble', bx: 0, by: -0.035, late: 0.4, speedMul: 0.62, arc: 0.18, tilt: 1.57 },
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
  pitches?: [PitchKind, number][]; // 球種と変化量(1〜7)
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
      { ...P('青井 レン', 1, 'P', 'knight', 'R', 44, 40, 62, 56), velo: 96, control: 72, stamina: 78, pitches: [['slider', 5], ['curve', 3], ['rise', 4]] },
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
      { ...P('真田 ヒカル', 18, 'P', 'mage', 'R', 40, 36, 64, 58), velo: 90, control: 64, stamina: 85, pitches: [['knuckle', 6], ['rise', 5], ['curve', 3]] },
    ],
    bench: [{ ...P('雨宮 シズク', 16, 'P', 'rogue', 'R', 30, 28, 60, 52), velo: 100, control: 56, stamina: 55, pitches: [['slider', 6], ['rise', 3]] }],
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
