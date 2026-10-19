import { Assets } from 'pixi.js';
import { Save } from '../core/Save';

/** Puzzle wallpapers: the floor inside the bowl (KayKit dioramas, tools/render-wallpapers.mjs). */
export interface Wallpaper {
  id: string;
  name: string;
  /** Image under ./assets/wallpapers, or none for the plain felt. */
  img?: string;
}

/** Board frames ("きせかえ"): what the bowl's rim is made of. */
export interface Frame {
  id: string;
  name: string;
  /** Rim fill: a texture alias, or gradient stops. */
  rim: { tex?: string; stops?: [number, string][] };
  /** Inner edge and rivets. */
  edge: number;
  rivet: number;
  line: number;
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'felt', name: 'みどりのフェルト' },
  { id: 'stone', name: 'いしだたみ', img: 'stone' },
  { id: 'wood', name: 'もくめのゆか', img: 'wood' },
  { id: 'meadow', name: 'くさはら', img: 'meadow' },
  { id: 'desert', name: 'さばく', img: 'desert' },
  { id: 'cave', name: 'どうくつ', img: 'cave' },
  { id: 'grave', name: 'よるのぼち', img: 'grave' },
  { id: 'treasure', name: 'たからのへや', img: 'treasure' },
];

export const FRAMES: Frame[] = [
  { id: 'wood', name: 'きのフチ', rim: { tex: 'jungle:wood' }, edge: 0xffc94a, rivet: 0xffd96a, line: 0x3b2412 },
  { id: 'candy', name: 'キャンディ', rim: { stops: [[0, '#ffb3d9'], [0.5, '#ff6fb5'], [1, '#d63384']] }, edge: 0xffffff, rivet: 0xfff27a, line: 0x7a1048 },
  { id: 'stone', name: 'いしのフチ', rim: { tex: 'wp:stone' }, edge: 0xdfe4ee, rivet: 0xb8c0d0, line: 0x2a2e3a },
  { id: 'meadow', name: 'もりのフチ', rim: { tex: 'wp:meadow' }, edge: 0xfff27a, rivet: 0xff8ad8, line: 0x0e3a20 },
  { id: 'desert', name: 'すなのフチ', rim: { tex: 'wp:desert' }, edge: 0xff9a3a, rivet: 0xfff6d0, line: 0x6a3a10 },
  { id: 'bone', name: 'ホネのフチ', rim: { tex: 'wp:grave' }, edge: 0xf2ead8, rivet: 0xf2ead8, line: 0x1e1a24 },
  { id: 'royal', name: 'ロイヤル', rim: { stops: [[0, '#7a4dff'], [0.5, '#4a2a9a'], [1, '#2a1660']] }, edge: 0xffd23f, rivet: 0xffe680, line: 0x140a30 },
  { id: 'gold', name: 'おうごん', rim: { tex: 'wp:treasure' }, edge: 0xffe680, rivet: 0xffffff, line: 0x6a4a00 },
  { id: 'rainbow', name: 'にじいろ', rim: { stops: [[0, '#ff6b8a'], [0.2, '#ffb84d'], [0.4, '#fff27a'], [0.6, '#6bf08a'], [0.8, '#5ab8ff'], [1, '#b07aff']] }, edge: 0xffffff, rivet: 0xffffff, line: 0x2a1630 },
];

export const WALLPAPER_BY_ID = Object.fromEntries(WALLPAPERS.map((w) => [w.id, w])) as Record<string, Wallpaper>;
export const FRAME_BY_ID = Object.fromEntries(FRAMES.map((f) => [f.id, f])) as Record<string, Frame>;

export function currentWallpaper(): Wallpaper {
  return WALLPAPER_BY_ID[Save.data.look.wallpaper] ?? WALLPAPERS[0];
}

export function currentFrame(): Frame {
  return FRAME_BY_ID[Save.data.look.frame] ?? FRAMES[0];
}

export function wallpaperAlias(id: string): string {
  return `wp:${id}`;
}

/** Loads wallpaper images (also used as rim textures). */
export async function loadWallpapers(ids: string[]): Promise<void> {
  const list = ids.filter((id) => WALLPAPER_BY_ID[id]?.img).map((id) => ({ alias: wallpaperAlias(id), src: `./assets/wallpapers/${WALLPAPER_BY_ID[id].img}.webp` }));
  for (const a of list) if (!Assets.resolver.hasKey(a.alias)) Assets.add(a);
  await Assets.load(list.map((a) => a.alias));
}

/** Wallpaper ids a frame borrows for its rim. */
export function frameTextures(f: Frame): string[] {
  return f.rim.tex?.startsWith('wp:') ? [f.rim.tex.slice(3)] : [];
}
