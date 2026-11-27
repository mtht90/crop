// game-icons.net のアイコンを SVG 文字列にする
import { ICONS } from '../data/icons.gen.ts';

export function icon(name: string, cls = ''): string {
  const ic = ICONS[name];
  if (!ic) return '';
  return `<svg class="gi ${cls}" viewBox="0 0 512 512" aria-hidden="true"><path d="${ic.d}"/></svg>`;
}
export function iconAuthors(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [n, v] of Object.entries(ICONS)) (out[v.a] ??= []).push(n);
  return out;
}
