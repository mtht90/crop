/** 大きな数字を 万・億・兆 で表す（例: 123456789 → "1.23億"） */
export function formatYen(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const units: [number, string][] = [[1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '万']];
  for (const [v, u] of units) {
    if (a >= v) {
      const x = a / v;
      const s = x >= 1000 ? x.toFixed(0) : x >= 100 ? x.toFixed(1) : x.toFixed(2);
      return `${sign}${s.includes('.') ? s.replace(/\.?0+$/, '') : s}${u}円`;
    }
  }
  return `${sign}${Math.round(a).toLocaleString('ja-JP')}円`;
}
