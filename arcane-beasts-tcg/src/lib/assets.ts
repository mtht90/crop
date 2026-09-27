import type { EType } from '../engine/types';

const BASE = import.meta.env.BASE_URL;

export const asset = (p: string) => `${BASE}assets/${p}`;
export const artUrl = (key: string) => (key.startsWith('story/') ? asset(`${key}.webp`) : asset(`art/${key}.webp`));

export const TYPE_SCENE: Record<EType, string> = {
  fire: 'story/landscape-lava',
  water: 'story/landscape-mountains-01',
  grass: 'story/grim-altar',
  lightning: 'story/landscape-mountains-04',
  psychic: 'story/swamp-02',
  fighting: 'story/landscape-mountains-03',
  dark: 'story/swamp-01',
  colorless: 'story/landscape-plain',
};

export const TYPE_COLOR: Record<EType, { a: string; b: string; c: string; ink: string }> = {
  fire: { a: '#ff7a3d', b: '#e0301e', c: '#ffd36b', ink: '#fff4e6' },
  water: { a: '#4fb3ff', b: '#1d5fd6', c: '#b9ecff', ink: '#eef8ff' },
  grass: { a: '#7fd35b', b: '#2f8f3a', c: '#dcf7a6', ink: '#f2ffe9' },
  lightning: { a: '#ffe04a', b: '#f0a500', c: '#fff6b8', ink: '#2a2100' },
  psychic: { a: '#c77dff', b: '#7b2cbf', c: '#f1d4ff', ink: '#fbf0ff' },
  fighting: { a: '#d98a4a', b: '#8f4a1f', c: '#f5d1a8', ink: '#fff3e8' },
  dark: { a: '#5b5f8a', b: '#1f2140', c: '#a7abd8', ink: '#eef0ff' },
  colorless: { a: '#e8e4dc', b: '#a9a39a', c: '#ffffff', ink: '#2b2824' },
};

const cache = new Map<string, HTMLImageElement>();
export function preload(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((res) => {
          if (cache.has(u)) return res();
          const img = new Image();
          img.onload = img.onerror = () => res();
          img.src = u;
          cache.set(u, img);
        }),
    ),
  ).then(() => undefined);
}
