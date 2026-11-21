// Loads the converted external assets (public/gen/) — monsters, backgrounds, effect sheets, UI pieces.
import { slug } from '../data/monsters';

export interface SpriteInfo {
  w: number;
  h: number;
  ow: number;
  oh: number;
}
export interface FxInfo {
  n: number;
  w: number;
  h: number;
}
interface Manifest {
  mon: Record<string, SpriteInfo>;
  fx: Record<string, FxInfo>;
  bg: { file: string; ground: number }[];
  sfx: Record<string, string[]>;
  music: Record<string, string>;
}

export const GEN = import.meta.env.BASE_URL + 'gen/';
export let manifest: Manifest = { mon: {}, fx: {}, bg: [], sfx: {}, music: {} };
const images = new Map<string, HTMLImageElement>();
const tinted = new Map<string, HTMLCanvasElement>();

export async function loadManifest() {
  const res = await fetch(GEN + 'manifest.json');
  manifest = await res.json();
}

export const spriteUrl = (stem: string) => GEN + 'mon/' + slug(stem) + '.webp';
export const uiUrl = (name: string) => GEN + 'ui/' + name;
export const iconUrl = (name: string) => GEN + 'icons/' + name + '.png';
export const itemUrl = (name: string) => GEN + 'items/' + name + '.png';
export const bgUrl = (areaIdx: number) => GEN + 'bg/' + (manifest.bg[areaIdx % manifest.bg.length]?.file ?? 'area1.webp');
export const bgGround = (areaIdx: number) => manifest.bg[areaIdx % manifest.bg.length]?.ground ?? 0.3;
export const audioUrl = (file: string) => GEN + 'audio/' + file;

export function info(stem: string): SpriteInfo {
  return manifest.mon[slug(stem)] ?? { w: 100, h: 100, ow: 200, oh: 200 };
}

/** generic cached image by url; returns null until decoded */
export function image(url: string): HTMLImageElement | null {
  let im = images.get(url);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.src = url;
    images.set(url, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}
export function preloadUrls(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((res) => {
          image(u);
          const im = images.get(u)!;
          if (im.complete) return res();
          im.onload = () => res();
          im.onerror = () => res();
        }),
    ),
  ).then(() => undefined);
}

export const img = (stem: string) => image(spriteUrl(stem));
export const preload = (stems: string[]) => preloadUrls(stems.map(spriteUrl));

export function fxSheet(name: string): { im: HTMLImageElement; info: FxInfo } | null {
  const inf = manifest.fx[name];
  if (!inf) return null;
  const im = image(GEN + 'fx/' + name + '.webp');
  return im ? { im, info: inf } : null;
}
export function preloadFx() {
  return preloadUrls(Object.keys(manifest.fx).map((n) => GEN + 'fx/' + n + '.webp'));
}

/** Solid-color silhouette of a sprite (hit flash, freeze tint, guardian glow). */
export function silhouette(stem: string, color: string): HTMLCanvasElement | null {
  const key = slug(stem) + '|' + color;
  const c = tinted.get(key);
  if (c) return c;
  const im = img(stem);
  if (!im) return null;
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth;
  cv.height = im.naturalHeight;
  const g = cv.getContext('2d')!;
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, cv.width, cv.height);
  tinted.set(key, cv);
  return cv;
}

/** Hue-shifted copy of any image (shiny guardians, later loops) */
export function hueShifted(url: string, deg: number): HTMLCanvasElement | HTMLImageElement | null {
  const key = url + '|h' + deg;
  const c = tinted.get(key);
  if (c) return c;
  const im = image(url);
  if (!im) return null;
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth;
  cv.height = im.naturalHeight;
  const g = cv.getContext('2d')!;
  g.filter = `hue-rotate(${deg}deg) saturate(1.15)`;
  g.drawImage(im, 0, 0);
  tinted.set(key, cv);
  return cv;
}
export const hueShift = (stem: string, deg: number) => hueShifted(spriteUrl(stem), deg);

/** Draw an image stretched as a 9-slice (used for Cozy UI pieces drawn on the canvas). */
export function nine(
  g: CanvasRenderingContext2D,
  im: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
  s: [number, number, number, number],
  d: [number, number, number, number],
) {
  const [st, sr, sb, sl] = s;
  let [dt, dr, db, dl] = d;
  const k = Math.min(1, w / (dl + dr), h / (dt + db));
  dt *= k;
  dr *= k;
  db *= k;
  dl *= k;
  const W = im.width,
    H = im.height;
  const sx = [0, sl, W - sr, W];
  const sy = [0, st, H - sb, H];
  const dx = [x, x + dl, x + w - dr, x + w];
  const dy = [y, y + dt, y + h - db, y + h];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const sw = sx[i + 1] - sx[i],
        sh = sy[j + 1] - sy[j];
      const ww = dx[i + 1] - dx[i],
        hh = dy[j + 1] - dy[j];
      if (sw > 0 && sh > 0 && ww > 0.1 && hh > 0.1) g.drawImage(im, sx[i], sy[j], sw, sh, dx[i], dy[j], ww, hh);
    }
}
