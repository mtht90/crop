import { Decimal, dec, type DecimalSource } from './decimal';

export type Notation = 'jp' | 'short' | 'sci' | 'eng';

let notation: Notation = 'jp';

export function setNotation(n: Notation): void {
  notation = n;
}

export function getNotation(): Notation {
  return notation;
}

// 日本の命数法。4 桁ごとに単位が変わる
const JP_UNITS = [
  '', '万', '億', '兆', '京', '垓', '𥝱', '穣', '溝', '澗', '正', '載', '極',
  '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数',
];

const SHORT_UNITS = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc',
  'Vg', 'UVg', 'DVg', 'TVg', 'QaVg', 'QiVg', 'SxVg', 'SpVg', 'OcVg', 'NoVg',
  'Tg', 'UTg', 'DTg', 'TTg', 'QaTg', 'QiTg', 'SxTg', 'SpTg', 'OcTg', 'NoTg',
];

function fixedTrim(n: number, digits: number): string {
  return n.toFixed(digits);
}

/** 3 桁の有効数字で整形する (1.23 / 12.3 / 123) */
function sig3(n: number): string {
  if (n >= 100) return fixedTrim(n, 0);
  if (n >= 10) return fixedTrim(n, 1);
  return fixedTrim(n, 2);
}

function formatExponent(e: number): string {
  // 指数自体が巨大な場合 (e1.23e7 のような表記)
  if (e >= 1e6) {
    const ee = Math.floor(Math.log10(e));
    return `${(e / 10 ** ee).toFixed(2)}e${ee}`;
  }
  return e.toLocaleString('en-US');
}

function formatSci(m: number, e: number): string {
  if (e >= 1e6) return `e${formatExponent(e)}`;
  return `${m.toFixed(2)}e${formatExponent(e)}`;
}

/**
 * 巨大数を表示用文字列に整形する。
 * @param places 1000 未満の値に使う小数桁数
 */
export function fmt(value: DecimalSource, places = 0): string {
  const v = dec(value);
  if (v.sign() < 0) return '-' + fmt(v.neg(), places);
  if (v.eq(0)) return '0';
  const e = v.exponent;
  if (e < 3) {
    const n = v.toNumber();
    if (n < 0.01 && places > 0) return n.toExponential(1);
    return places > 0 ? n.toFixed(n >= 100 ? Math.min(places, 1) : places) : Math.floor(n).toLocaleString('en-US');
  }
  let m = v.mantissa;
  switch (notation) {
    case 'jp': {
      const idx = Math.floor(e / 4);
      if (idx < JP_UNITS.length) {
        const n = m * 10 ** (e - idx * 4);
        if (idx === 0) return Math.floor(n).toLocaleString('en-US');
        return sig3(n) + JP_UNITS[idx];
      }
      return formatSci(m, e);
    }
    case 'short': {
      const idx = Math.floor(e / 3);
      if (idx < SHORT_UNITS.length) {
        if (idx === 1 && e === 3) return Math.floor(v.toNumber()).toLocaleString('en-US');
        return sig3(m * 10 ** (e - idx * 3)) + SHORT_UNITS[idx];
      }
      return formatSci(m, e);
    }
    case 'eng': {
      if (e >= 1e6) return formatSci(m, e);
      const e3 = Math.floor(e / 3) * 3;
      return `${sig3(m * 10 ** (e - e3))}e${formatExponent(e3)}`;
    }
    case 'sci':
    default:
      // 丸めで 10.00 になるのを防ぐ
      if (m >= 9.995) {
        m = 1;
        return formatSci(m, e + 1);
      }
      return formatSci(m, e);
  }
}

/** 小さい値も小数で出す版 (毎秒生産など) */
export function fmtRate(value: DecimalSource): string {
  return fmt(value, 1);
}

export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (Math.abs(n) >= 1e15) return fmt(new Decimal(n));
  return Math.floor(n).toLocaleString('en-US');
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtMult(value: DecimalSource): string {
  const v = dec(value);
  if (v.lt(1000)) {
    const n = v.toNumber();
    return '×' + (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
  }
  return '×' + fmt(v);
}

export function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  if (seconds < 0) seconds = 0;
  if (seconds < 1) return `${seconds.toFixed(1)}秒`;
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d >= 365 * 1000) return `${fmt(d / 365)}年`;
  if (d >= 365) return `${Math.floor(d / 365)}年${d % 365}日`;
  if (d > 0) return `${d}日${h}時間`;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${sec}秒`;
  return `${sec}秒`;
}
