import Decimal from 'break_infinity.js';

export { Decimal };
export type D = Decimal;
export type DecimalSource = Decimal | number | string;

export const D0 = new Decimal(0);
export const D1 = new Decimal(1);

export function dec(v: DecimalSource | null | undefined): Decimal {
  if (v === null || v === undefined) return new Decimal(0);
  if (v instanceof Decimal) return v;
  const d = new Decimal(v);
  // 壊れたセーブ等で NaN が紛れ込んだら 0 扱いにする
  if (!Number.isFinite(d.mantissa) || !Number.isFinite(d.exponent)) return new Decimal(0);
  return d;
}

export function dmax(a: DecimalSource, b: DecimalSource): Decimal {
  return Decimal.max(a, b);
}

export function dmin(a: DecimalSource, b: DecimalSource): Decimal {
  return Decimal.min(a, b);
}

/** log10 を安全に取る。0 以下は -Infinity の代わりに 0 を返す */
export function log10(v: Decimal): number {
  if (v.lte(0)) return 0;
  return v.log10();
}
