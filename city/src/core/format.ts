import { TIME } from '../config/economy';

/** 大きな数字を 万・億・兆 で表す（例: 123456789 → "1.23億円"） */
export function formatYen(n: number, unit = '円'): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const units: [number, string][] = [[1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '万']];
  for (const [v, u] of units) {
    if (a >= v) {
      const x = a / v;
      const s = x >= 1000 ? x.toFixed(0) : x >= 100 ? x.toFixed(1) : x.toFixed(2);
      return `${sign}${s.includes('.') ? s.replace(/\.?0+$/, '') : s}${u}${unit}`;
    }
  }
  return `${sign}${Math.round(a).toLocaleString('ja-JP')}${unit}`;
}

export function formatSigned(n: number): string {
  return (n >= 0 ? '+' : '') + formatYen(n);
}

export function formatCount(n: number, unit = '人'): string {
  if (Math.abs(n) >= 1e4) return formatYen(n, unit);
  return `${Math.round(n).toLocaleString('ja-JP')}${unit}`;
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** ゲーム内の日数 → 現実の時間の表記 */
export function realDuration(days: number): string {
  const sec = Math.max(0, days * TIME.realSecondsPerDay);
  if (sec < 60) return `${Math.ceil(sec)}秒`;
  const min = sec / 60;
  if (min < 60) return `${Math.ceil(min)}分`;
  const hr = Math.floor(min / 60);
  const m = Math.round(min - hr * 60);
  if (hr < 24) return m ? `${hr}時間${m}分` : `${hr}時間`;
  const d = Math.floor(hr / 24);
  return `${d}日${hr - d * 24}時間`;
}

export function minutesLabel(min: number): string {
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

/** 短い表記（有効数字3桁）：21.35万円 → 21.4万 */
export function yenShort(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  for (const [v, u] of [[1e12, '兆'], [1e8, '億'], [1e4, '万']] as [number, string][]) {
    if (a >= v) {
      const x = a / v;
      const t = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      return `${sign}${t.includes('.') ? t.replace(/\.?0+$/, '') : t}${u}`;
    }
  }
  return `${sign}${Math.round(a).toLocaleString('ja-JP')}円`;
}
