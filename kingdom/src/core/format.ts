// 数値表示: 1万未満はカンマ区切り、それ以上は日本語の命数法（万・億・兆…）で4桁精度。
const UNITS = ['', '万', '億', '兆', '京', '垓', '𥝱', '穣', '溝', '澗', '正', '載', '極', '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数'];

export function fmt(n: number, opts: { decimals?: boolean } = {}): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n, opts);
  if (n < 10 && opts.decimals && n % 1 !== 0) return n.toFixed(1);
  if (n < 1e4) {
    if (opts.decimals && n < 100 && n % 1 !== 0) return n.toFixed(1);
    return Math.floor(n).toLocaleString('ja-JP');
  }
  const exp = Math.floor(Math.log10(n) / 4);
  if (exp >= UNITS.length) {
    const e = Math.floor(Math.log10(n));
    return (n / Math.pow(10, e)).toFixed(2) + 'e' + e;
  }
  const v = n / Math.pow(10, exp * 4);
  // 4 significant digits: 1.234万 / 12.34万 / 123.4万 / 1234万
  // 切り捨て（持っていない額を表示しない）
  const dec = v < 10 ? 3 : v < 100 ? 2 : v < 1000 ? 1 : 0;
  const k = Math.pow(10, dec);
  let s = (Math.floor(v * k + 1e-9) / k).toFixed(dec);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s + UNITS[exp];
}

export function fmtRate(n: number): string {
  return fmt(n, { decimals: true });
}

export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
