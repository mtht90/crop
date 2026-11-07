/**
 * 決定論的な整数演算。座標は「ミリタイル」(1タイル = 1000) の整数で持つ。
 * JS の number は 2^53 まで整数を正確に扱えるので、掛け算の途中結果もこの範囲に収まるようにする。
 * 割り算は必ず idiv（0方向への切り捨て）を使い、浮動小数点の結果をそのまま状態に入れない。
 */
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const UNIT = 1000;

export const secondsToTicks = (s: number): number => Math.round(s * TICK_RATE);
export const tilesToMilli = (t: number): number => Math.round(t * UNIT);
/** タイル/分 → ミリタイル/tick */
export const speedToPerTick = (tilesPerMinute: number): number => Math.round((tilesPerMinute * UNIT) / 60 / TICK_RATE);
/** タイル/秒 → ミリタイル/tick */
export const velocityToPerTick = (tilesPerSecond: number): number => Math.round((tilesPerSecond * UNIT) / TICK_RATE);

export const idiv = (a: number, b: number): number => Math.trunc(a / b);
export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

/** 整数平方根（floor）。Math.sqrt は IEEE754 で正しく丸められるので全環境で同じ値になる。 */
export function isqrt(v: number): number {
  if (v <= 0) return 0;
  let x = Math.floor(Math.sqrt(v));
  while (x * x > v) x--;
  while ((x + 1) * (x + 1) <= v) x++;
  return x;
}

export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const vecFromTiles = (x: number, y: number): Vec => ({ x: tilesToMilli(x), y: tilesToMilli(y) });
export const sqrDist = (a: Vec, b: Vec): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
export const dist = (a: Vec, b: Vec): number => isqrt(sqrDist(a, b));
export const vecEq = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;

export function moveTowards(from: Vec, to: Vec, maxStep: number): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = isqrt(dx * dx + dy * dy);
  if (len <= maxStep || len === 0) return { x: to.x, y: to.y };
  return { x: from.x + idiv(dx * maxStep, len), y: from.y + idiv(dy * maxStep, len) };
}

export function withLength(v: Vec, length: number): Vec {
  const mag = isqrt(v.x * v.x + v.y * v.y);
  if (mag === 0) return { x: v.x, y: v.y };
  return { x: idiv(v.x * length, mag), y: idiv(v.y * length, mag) };
}

/** xorshift32。Math.random は使わない。 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = ((seed | 0) ^ 0x9e3779b9) >>> 0;
    if (this.state === 0) this.state = 0x6d2b79f5;
  }

  nextUint(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x;
  }

  /** [0, max) */
  range(max: number): number {
    return max <= 0 ? 0 : this.nextUint() % max;
  }

  /** [min, max] */
  between(min: number, max: number): number {
    return min + this.range(max - min + 1);
  }

  chance(permille: number): boolean {
    return this.range(1000) < permille;
  }
}

/** FNV-1a 32bit を2本使った64bit相当のハッシュ（状態比較・同期ずれ検出用）。 */
export class StateHasher {
  private h1 = 0x811c9dc5;
  private h2 = 0x01000193 ^ 0x5bd1e995;

  mix(v: number): void {
    // 負数・大きな値も扱えるよう、上位と下位に分けて混ぜる
    const lo = v | 0;
    const hi = Math.floor(v / 4294967296) | 0;
    this.h1 = Math.imul(this.h1 ^ lo, 0x01000193) >>> 0;
    this.h1 = Math.imul(this.h1 ^ hi, 0x01000193) >>> 0;
    this.h2 = Math.imul(this.h2 ^ (lo + 0x7f4a7c15), 0x01000193) >>> 0;
    this.h2 = Math.imul(this.h2 ^ hi, 0x01000193) >>> 0;
  }

  mixString(s: string): void {
    for (let i = 0; i < s.length; i++) this.mix(s.charCodeAt(i));
  }

  digest(): string {
    return this.h1.toString(16).padStart(8, '0') + this.h2.toString(16).padStart(8, '0');
  }
}
