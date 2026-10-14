// ページを見分けるためのアクセントカラーを決める (Electron に依存しない純粋な関数)

type RGB = [number, number, number];

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function parseColor(input: string | null | undefined): RGB | null {
  if (!input) return null;
  const hex = input.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = input.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** 彩度のある色か (白・黒・グレーに近い色は識別に向かない) */
function isColorful(rgb: RGB): boolean {
  const [, s, l] = rgbToHsl(rgb);
  return s >= 0.25 && l >= 0.12 && l <= 0.9;
}

/** 明るい背景でも暗い背景でも見える明るさ・彩度に整える */
export function normalizeAccent(rgb: RGB): string {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToHex(h, Math.max(0.45, Math.min(0.85, s)), Math.max(0.42, Math.min(0.58, l)));
}

/** ページの theme-color をアクセントとして使えるなら返す */
export function accentFromThemeColor(color: string | null | undefined): string | null {
  const rgb = parseColor(color);
  return rgb && isColorful(rgb) ? normalizeAccent(rgb) : null;
}

/**
 * スクリーンショット (BGRA) からページを代表する色を選ぶ。
 * 色を粗く量子化して数え、彩度が高く面積も大きい色を優先する。
 */
export function dominantColor(bgra: Uint8Array, width: number, height: number): string | null {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number; weight: number }>();
  let total = 0;
  for (let y = 0; y < height; y++) {
    // ページ上部 (ヘッダーやロゴのある領域) を重視する
    const rowWeight = y < height * 0.3 ? 2 : 1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const rgb: RGB = [bgra[i + 2], bgra[i + 1], bgra[i]];
      total += rowWeight;
      if (!isColorful(rgb)) continue;
      const key = ((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4);
      const [, s] = rgbToHsl(rgb);
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0, weight: 0 };
      bucket.count += rowWeight;
      bucket.r += rgb[0] * rowWeight;
      bucket.g += rgb[1] * rowWeight;
      bucket.b += rgb[2] * rowWeight;
      bucket.weight += rowWeight * (0.5 + s);
      buckets.set(key, bucket);
    }
  }
  let best: { count: number; r: number; g: number; b: number; weight: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) best = bucket;
  }
  // ごく一部 (3% 未満) にしか無い色 (文字のにじみ等) は代表色にしない
  if (!best || best.count / Math.max(1, total) < 0.03) return null;
  return normalizeAccent([best.r / best.count, best.g / best.count, best.b / best.count]);
}

/** 色が取れないページは、ホスト名から安定した色を作る (同じサイトは常に同じ色) */
export function hostColor(url: string): string {
  let host = url;
  try {
    host = new URL(url).host || url;
  } catch {
    // そのまま使う
  }
  let hash = 0;
  for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) >>> 0;
  return hslToHex(hash % 360, 0.55, 0.5);
}
