import type { ColorVariant, Conditions, PatternVariant, Species, VariantBoost } from '../data/types';
import { mult } from './spawn';
import type { Rng } from './rng';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
export const GRADES: Grade[] = ['S', 'A', 'B', 'C', 'D'];
export const IV_MAX = 31;

export interface IVs {
  power: number;
  stamina: number;
  speed: number;
  build: number;
}

export const IV_LABEL: Record<keyof IVs, string> = { power: '力', stamina: '持久', speed: '速さ', build: '体格' };

export interface FishInstance {
  uid: string;
  speciesId: string;
  /** cm */
  length: number;
  /** g */
  weight: number;
  iv: IVs;
  grade: Grade;
  colorId: string | null;
  patternId: string | null;
}

export function gradeOf(iv: IVs): Grade {
  const sum = iv.power + iv.stamina + iv.speed + iv.build;
  if (sum >= 105) return 'S';
  if (sum >= 88) return 'A';
  if (sum >= 62) return 'B';
  if (sum >= 36) return 'C';
  return 'D';
}

export const GRADE_PRICE: Record<Grade, number> = { S: 3, A: 1.6, B: 1.15, C: 1, D: 0.85 };
export const GRADE_RANK: Record<Grade, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };

/** 体格IVによる太り具合 0.85..1.2 */
export function buildFactor(build: number): number {
  return 0.85 + (build / IV_MAX) * 0.35;
}

export function weightOf(s: Species, lengthCm: number, build: number): number {
  return (s.k * lengthCm ** 3) / 100 * buildFactor(build);
}

export function boostOf(boost: VariantBoost | undefined, c: Conditions): number {
  if (!boost) return 1;
  return (
    (boost.time ? mult(boost.time, c.time) : 1) *
    (boost.weather ? mult(boost.weather, c.weather) : 1) *
    (boost.season ? mult(boost.season, c.season) : 1) *
    (boost.lure ? mult(boost.lure, c.lure) : 1)
  );
}

function rollVariant<T extends ColorVariant | PatternVariant>(list: T[], c: Conditions, rng: Rng): T | null {
  for (const v of list) {
    if (rng.chance(Math.min(1, boostOf(v.boost, c) / v.odds))) return v;
  }
  return null;
}

let uidCounter = 0;
export function newUid(): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${Date.now().toString(36)}-${uidCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function generateFish(s: Species, c: Conditions, rng: Rng): FishInstance {
  const iv: IVs = {
    power: rng.int(0, IV_MAX),
    stamina: rng.int(0, IV_MAX),
    speed: rng.int(0, IV_MAX),
    build: rng.int(0, IV_MAX),
  };
  let len = rng.normal(s.length.mean, s.length.sd);
  // 稀に上限近くの大型が出るよう、裾を少し厚くする
  if (rng.chance(0.03)) len = rng.range(s.length.mean + s.length.sd, s.length.max);
  len = Math.max(s.length.min, Math.min(s.length.max, len));
  len = Math.round(len * 10) / 10;
  const color = rollVariant(s.colors, c, rng);
  const pattern = rollVariant(s.patterns, c, rng);
  return {
    uid: newUid(),
    speciesId: s.id,
    length: len,
    weight: Math.round(weightOf(s, len, iv.build)),
    iv,
    grade: gradeOf(iv),
    colorId: color?.id ?? null,
    patternId: pattern?.id ?? null,
  };
}

export function priceOf(s: Species, f: FishInstance): number {
  const refWeight = weightOf(s, s.length.mean, IV_MAX / 2);
  const sizeMult = Math.pow(f.weight / refWeight, 0.7);
  const color = s.colors.find((v) => v.id === f.colorId);
  const pattern = s.patterns.find((v) => v.id === f.patternId);
  const variantMult = (color?.priceMult ?? 1) * (pattern?.priceMult ?? 1);
  return Math.max(1, Math.round(s.price * sizeMult * GRADE_PRICE[f.grade] * variantMult));
}

export function formatWeight(g: number): string {
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
}
