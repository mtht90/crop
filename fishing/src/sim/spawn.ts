import type { Conditions, Mult, Rarity, Species } from '../data/types';
import type { Rng } from './rng';

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 1,
  uncommon: 0.45,
  rare: 0.13,
  epic: 0.03,
  legend: 0.0008,
};

export function mult<K extends string>(table: Mult<K>, key: K, fallback = 1): number {
  const v = table[key];
  return v === undefined ? fallback : v;
}

const MOTION_ORDER = { still: 0, slow: 1, fast: 2 } as const;

export function motionMatch(pref: Species['motion'], actual: Conditions['motion']): number {
  if (pref === 'any') return 1;
  const d = Math.abs(MOTION_ORDER[pref] - MOTION_ORDER[actual]);
  return [1.3, 0.6, 0.2][d];
}

/** 出現の重み = 基本レア度 × 時間 × 天候 × 季節 × タナ × ポイント × ルアー相性 × 動かし方 */
export function speciesWeight(s: Species, c: Conditions): number {
  return (
    RARITY_WEIGHT[s.rarity] *
    mult(s.times, c.time) *
    mult(s.weathers, c.weather) *
    mult(s.seasons, c.season) *
    mult(s.layers, c.layer) *
    mult(s.structures, c.structure) *
    mult(s.lures, c.lure, 0) *
    motionMatch(s.motion, c.motion)
  );
}

export interface BiteContext {
  activity: number;
  /** ラインの見えやすさ */
  lineVisibility: number;
  /** 0..1 着水直後やアワセ失敗で魚が散っている度合い */
  spook: number;
}

/** 1秒あたりのアタリ確率 */
export function biteChancePerSecond(species: Species[], c: Conditions, ctx: BiteContext): number {
  let total = 0;
  for (const s of species) total += speciesWeight(s, c);
  const lineFactor = 1.25 - 0.35 * ctx.lineVisibility;
  if (total <= 0) return 0;
  const p = (0.012 + 0.04 * Math.sqrt(total)) * ctx.activity * lineFactor * (1 - ctx.spook);
  return Math.max(0, Math.min(0.3, p));
}

export function pickSpecies(species: Species[], c: Conditions, rng: Rng): Species | null {
  return rng.weighted(species, (s) => speciesWeight(s, c));
}
