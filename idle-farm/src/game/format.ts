// 日本語の単位（万・億・兆…）で大きな数を短く表示する。

const UNITS = ['', '万', '億', '兆', '京', '垓', '秭', '穣', '溝', '澗', '正', '載', '極'];

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + formatMoney(-n);
  if (n < 10_000) return Math.floor(n).toLocaleString('ja-JP');
  const unit = Math.min(Math.floor(Math.log10(n) / 4), UNITS.length - 1);
  const v = n / Math.pow(10, unit * 4);
  const digits = v >= 1000 ? 0 : v >= 100 ? 1 : 2;
  return v.toFixed(digits).replace(/\.?0+$/, '') + UNITS[unit];
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}分${s % 60}秒` : `${m}分`;
  return `${Math.floor(m / 60)}時間${m % 60}分`;
}

export const stars = (quality: number) => '★'.repeat(quality + 1);
