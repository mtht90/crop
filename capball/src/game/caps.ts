/**
 * キャップの銘柄。すべて架空の銘柄（実在のメーカー名・ロゴは使わない）。
 * 飲み物のジャンルごとに色と柄を作り分け、キャップの性格（球速・変化・制球・重さ）を変える。
 *
 * - speed：球速の倍率
 * - brk：変化の倍率（大きいほど曲がる）
 * - control：制球の倍率（大きいほどぶれが小さい）
 * - weight：重さ。重いほど打たれたときに飛ぶ（投手には不利）。軽いほど飛ばない
 */
import { PITCHES, SLOTS, type PitchKind, type PitchSlot } from './data';

export type CapPattern = 'ring' | 'band' | 'dots' | 'stripe' | 'leaf' | 'star' | 'wave' | 'sun' | 'bolt' | 'drop' | 'check' | 'heart';

export interface CapBrand {
  id: string;
  name: string;
  genre: string;
  desc: string;
  /** キャップ本体（側面）の色 */
  body: string;
  /** 天面ラベルの地の色・柄の色・文字の色 */
  label: string;
  accent: string;
  ink: string;
  /** 天面に書く短い文字 */
  mark: string;
  pattern: CapPattern;
  speed: number;
  brk: number;
  control: number;
  weight: number;
  /** 回し方ごとに出る球種（null＝このキャップでは投げられない）。並びは straight, slider, curve, rise, drop, knuckle */
  rep: (PitchKind | null)[];
  /** 表面の仕上げ */
  finish?: 'gloss' | 'matte' | 'metal' | 'pearl';
  /** 側面のみぞの数 */
  ridges?: number;
}

export const CAPS: CapBrand[] = [
  { id: 'kirari', name: 'キラリソーダ', genre: '炭酸', desc: '固めの炭酸用キャップ。素直でクセがない', body: '#d8302a', label: '#ffffff', accent: '#d8302a', ink: '#d8302a', mark: 'KIRARI', pattern: 'ring', speed: 1.04, brk: 1.0, control: 1.0, weight: 1.02, rep: ['straight','slider','curve','rise','drop','knuckle'], finish: 'gloss' },
  { id: 'yamabuki', name: '緑茶 やまぶき', genre: 'お茶', desc: 'みぞが細かく指にかかる。狙った所に投げやすい', body: '#2f8a3e', label: '#f3f6e8', accent: '#3f9a4c', ink: '#1f5e2a', mark: '茶', pattern: 'leaf', speed: 0.98, brk: 0.98, control: 1.14, weight: 1.0, rep: ['twoseam','cutter','curve',null,'splitter','change'], finish: 'matte', ridges: 120 },
  { id: 'aqualan', name: 'アクアラン', genre: 'スポーツドリンク', desc: '口の広い大きめキャップ。空気をつかんでよく曲がるが遅い', body: '#1d6fd1', label: '#ffffff', accent: '#5bb4ff', ink: '#1554a6', mark: 'AQ', pattern: 'wave', speed: 0.9, brk: 1.24, control: 0.92, weight: 0.94, rep: ['straight','sweeper','slowcurve','rise','drop','knuckle'], finish: 'gloss', ridges: 60 },
  { id: 'shizuku', name: '天然水 しずく', genre: '水', desc: '薄くて軽い。よく曲がり、打たれても飛ばない', body: '#eef3f7', label: '#e6f4ff', accent: '#69b7ee', ink: '#2f7fbf', mark: '水', pattern: 'drop', speed: 0.95, brk: 1.16, control: 0.95, weight: 0.86, rep: ['straight','slider','slurve','rise',null,'palm'], finish: 'pearl', ridges: 110 },
  { id: 'hotmilk', name: 'ほっとミルクティー', genre: 'ホット', desc: '分厚いホット用キャップ。速くて重いが、曲がりにくい', body: '#ef7a1a', label: '#fff4e2', accent: '#f39a3d', ink: '#a24a08', mark: 'HOT', pattern: 'sun', speed: 1.1, brk: 0.84, control: 1.02, weight: 1.16, rep: ['gyro','hslider','pcurve',null,'fork','change'], finish: 'matte', ridges: 72 },
  { id: 'bolt', name: 'ボルトコーラ', genre: 'コーラ', desc: '黒くて固い。速いが少し暴れる', body: '#1b1b1f', label: '#1b1b1f', accent: '#f2c230', ink: '#f2c230', mark: 'BOLT', pattern: 'bolt', speed: 1.08, brk: 0.96, control: 0.93, weight: 1.06, rep: ['straight','hslider','curve','hop','fork',null], finish: 'gloss' },
  { id: 'lemon', name: 'レモンスカッシュ', genre: '炭酸', desc: '軽めでキレのある変化', body: '#f4d21c', label: '#fffbe0', accent: '#f4c51c', ink: '#8a6d00', mark: 'LEMON', pattern: 'dots', speed: 1.0, brk: 1.1, control: 0.98, weight: 0.96, rep: ['straight','slider','slurve','upshoot','sinker','knuckle'], finish: 'gloss' },
  { id: 'gorilla', name: 'ゴリラチャージ', genre: 'エナジードリンク', desc: 'とにかく速い。そのぶん制球は荒れる', body: '#9aa3ad', label: '#121417', accent: '#5fe03a', ink: '#5fe03a', mark: 'GO!', pattern: 'stripe', speed: 1.13, brk: 0.92, control: 0.86, weight: 1.08, rep: ['gyro','cutter','pcurve','hop','splitter',null], finish: 'metal' },
  { id: 'milpico', name: 'ミルピコ', genre: '乳酸菌', desc: '小さめで扱いやすい。遅いが狙いやすい', body: '#7fc4f0', label: '#ffffff', accent: '#7fc4f0', ink: '#2a7bbd', mark: 'ミル', pattern: 'heart', speed: 0.93, brk: 1.04, control: 1.12, weight: 0.92, rep: ['twoseam','slider','slowcurve','rise',null,'change'], finish: 'pearl', ridges: 64 },
  { id: 'goldbrew', name: 'ゴールドブリュー', genre: 'ボトルコーヒー', desc: '金属キャップ。重くて速く、曲がりは小さい', body: '#c9a13b', label: '#3a2614', accent: '#d9b456', ink: '#e9cc7a', mark: 'BREW', pattern: 'ring', speed: 1.08, brk: 0.86, control: 1.04, weight: 1.14, rep: ['gyro','cutter',null,null,'splitter','change'], finish: 'metal', ridges: 48 },
  { id: 'hanacha', name: '花茶 さくら', genre: 'ジャスミン茶', desc: 'ふわりと曲がる。曲がり幅が大きい', body: '#ef8fb0', label: '#fff3f7', accent: '#f2a1bd', ink: '#c24272', mark: '花', pattern: 'star', speed: 0.96, brk: 1.18, control: 0.97, weight: 0.95, rep: ['straight','sweeper','slowcurve','upshoot','drop','palm'], finish: 'pearl' },
  { id: 'spark', name: 'ストロングスパーク', genre: '炭酸水', desc: '固くて芯がある。速さと制球のバランスがいい', body: '#cfd6dc', label: '#14324a', accent: '#8fd0ff', ink: '#ffffff', mark: 'SPARK', pattern: 'band', speed: 1.05, brk: 0.97, control: 1.06, weight: 1.02, rep: ['straight','hslider','curve','hop','vslider','knuckle'], finish: 'gloss', ridges: 110 },
  { id: 'orange', name: 'まるごとオレンジ', genre: '果汁', desc: 'いちばん普通のキャップ。基準にちょうどいい', body: '#f08a24', label: '#ffffff', accent: '#f08a24', ink: '#d0661a', mark: '100%', pattern: 'sun', speed: 1.0, brk: 1.0, control: 1.0, weight: 1.0, rep: ['straight','slider','curve','rise','drop','change'], finish: 'gloss' },
  { id: 'kouryu', name: '烏龍茶 紅龍', genre: 'お茶', desc: '重めで落ち着いた球筋。制球がいい', body: '#8e1c1c', label: '#f6e7cf', accent: '#a22a20', ink: '#7a1414', mark: '龍', pattern: 'check', speed: 1.0, brk: 0.94, control: 1.1, weight: 1.06, rep: ['twoseam','cutter','pcurve',null,'sinker','change'], finish: 'matte' },
  { id: 'mugi', name: '麦茶 むぎのわ', genre: '麦茶', desc: '軽くて飛ばない。守りに強い', body: '#a86b2c', label: '#fff1d6', accent: '#c58b44', ink: '#7a4a15', mark: '麦', pattern: 'leaf', speed: 0.97, brk: 1.02, control: 1.03, weight: 0.9, rep: ['twoseam','slider','slurve',null,'sinker','knuckle'], finish: 'matte' },
  { id: 'golden', name: 'ゴールデンキャップ', genre: '限定', desc: '当たりのキャップ。どれも少しずつ良い', body: '#e8b923', label: '#fff6c8', accent: '#e8b923', ink: '#a67a00', mark: '★', pattern: 'star', speed: 1.05, brk: 1.06, control: 1.05, weight: 0.98, rep: ['gyro','sweeper','slurve','upshoot','fork','knuckle'], finish: 'metal' },
];

export const DEFAULT_CAP = CAPS[0];

/** 能力を 1〜5 の星にして表示する（倍率の幅は能力ごとに違う） */
export function capStars(c: CapBrand) {
  const s = (v: number, lo: number, hi: number) => Math.max(1, Math.min(5, Math.round(1 + ((v - lo) / (hi - lo)) * 4)));
  return {
    speed: s(c.speed, 0.88, 1.13),
    brk: s(c.brk, 0.84, 1.24),
    control: s(c.control, 0.86, 1.14),
    weight: s(c.weight, 0.86, 1.16),
  };
}

/** そのキャップで、ある回し方をしたときに出る球種（投げられなければ null） */
export function capPitch(c: CapBrand, slot: PitchSlot): PitchKind | null {
  return c.rep[SLOTS.indexOf(slot)] ?? null;
}

/** キャップの持ち球（投げられるものだけ） */
export function capRepertoire(c: CapBrand) {
  return SLOTS.map((slot) => ({ slot, kind: capPitch(c, slot) })).filter((r): r is { slot: PitchSlot; kind: PitchKind } => !!r.kind && !!PITCHES[r.kind]);
}
