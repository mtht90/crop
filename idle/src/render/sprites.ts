import { slug } from '../data/monsters';

export interface SpriteInfo {
  w: number;
  h: number;
  ow: number;
  oh: number;
}

const BASE = import.meta.env.BASE_URL + 'gen/';
let manifest: Record<string, SpriteInfo> = {};
const images = new Map<string, HTMLImageElement>();
const tinted = new Map<string, HTMLCanvasElement>();

export async function loadManifest() {
  const res = await fetch(BASE + 'manifest.json');
  manifest = await res.json();
}

export function spriteUrl(stem: string) {
  return BASE + 'mon/' + slug(stem) + '.webp';
}
export function uiUrl(name: string) {
  return BASE + 'ui/' + name;
}

export function info(stem: string): SpriteInfo {
  return manifest[slug(stem)] ?? { w: 100, h: 100, ow: 200, oh: 200 };
}

export function img(stem: string): HTMLImageElement | null {
  const id = slug(stem);
  let im = images.get(id);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.src = spriteUrl(stem);
    images.set(id, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

export function preload(stems: string[]): Promise<void> {
  return Promise.all(
    stems.map(
      (s) =>
        new Promise<void>((res) => {
          img(s);
          const im = images.get(slug(s))!;
          if (im.complete) return res();
          im.onload = () => res();
          im.onerror = () => res();
        }),
    ),
  ).then(() => undefined);
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

/** Hue-shifted copy (shiny guardians / later loops). */
export function hueShift(stem: string, deg: number): HTMLCanvasElement | HTMLImageElement | null {
  const key = slug(stem) + '|h' + deg;
  const c = tinted.get(key);
  if (c) return c;
  const im = img(stem);
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
