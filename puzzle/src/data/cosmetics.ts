import { Assets } from 'pixi.js';
import { Save } from '../core/Save';

/** ★1–4 (0 = starter). Price grows with the rank. */
export type Star = 0 | 1 | 2 | 3 | 4;
export const PRICE: Record<Star, number> = { 0: 0, 1: 1500, 2: 4000, 3: 10000, 4: 25000 };

/** Puzzle wallpapers: the floor inside the bowl (KayKit dioramas, tools/render-wallpapers.mjs; Fairy-Tale backgrounds). */
export interface Wallpaper {
  id: string;
  name: string;
  star: Star;
  /** Image under ./assets/wallpapers, or none for the plain felt. */
  img?: string;
}

/** Board frames ("きせかえ"): what the bowl's rim is made of. */
export interface Frame {
  id: string;
  name: string;
  star: Star;
  /** Rim fill: a texture alias, or gradient stops. */
  rim: { tex?: string; stops?: [number, string][] };
  /** Inner edge and rivets. */
  edge: number;
  rivet: number;
  line: number;
}

/** Trace line styles. Colors: a hex, 'piece' (the chain's color) or 'rainbow'. */
export interface LineStyle {
  id: string;
  name: string;
  star: Star;
  body: number | 'piece' | 'rainbow';
  glow: number | 'piece' | 'rainbow';
  core: number;
}

const w = (id: string, name: string, star: Star, img: string | undefined = id): Wallpaper => ({ id, name, star, img });
export const WALLPAPERS: Wallpaper[] = [
  { id: 'felt', name: 'みどりのフェルト', star: 0 },
  w('stone', 'いしだたみ', 1),
  w('wood', 'もくめのゆか', 1),
  w('meadow', 'くさはら', 1),
  w('forest', 'もり', 1),
  w('tavern', 'さかば', 1),
  w('colorful', 'カラフルタイル', 1),
  w('desert', 'さばく', 2),
  w('cave', 'どうくつ', 2),
  w('library', 'としょしつ', 2),
  w('pumpkin', 'かぼちゃばたけ', 2),
  w('playground', 'あそびば', 2),
  w('fairy1', 'まほうのもり', 2),
  w('fairy2', 'ゆうやけのおか', 2),
  w('grave', 'よるのぼち', 3),
  w('crypt', 'ろうそくのへや', 3),
  w('toybox', 'おもちゃばこ', 3),
  w('gems', 'ほうせきのどうくつ', 3),
  w('fairy3', 'ゆめのおしろ', 3),
  w('fairy4', 'ほしぞらのもり', 3),
  w('treasure', 'たからのへや', 4),
  w('gold', 'きんかのやま', 4),
];

const f = (id: string, name: string, star: Star, rim: Frame['rim'], edge: number, rivet: number, line: number): Frame => ({ id, name, star, rim, edge, rivet, line });
const g = (...c: string[]): [number, string][] => c.map((x, i) => [i / (c.length - 1), x]);
export const FRAMES: Frame[] = [
  f('wood', 'きのフチ', 0, { tex: 'jungle:wood' }, 0xffc94a, 0xffd96a, 0x3b2412),
  f('candy', 'キャンディ', 1, { stops: g('#ffb3d9', '#ff6fb5', '#d63384') }, 0xffffff, 0xfff27a, 0x7a1048),
  f('mint', 'ミント', 1, { stops: g('#c8fff0', '#5fe0c0', '#1a9a80') }, 0xffffff, 0xffffff, 0x0a4a40),
  f('sky', 'あおぞら', 1, { stops: g('#d8f0ff', '#6ac0ff', '#2a6ad8') }, 0xffffff, 0xfff27a, 0x0e2a6a),
  f('stone', 'いしのフチ', 1, { tex: 'wp:stone' }, 0xdfe4ee, 0xb8c0d0, 0x2a2e3a),
  f('forest', 'こもれび', 1, { tex: 'wp:forest' }, 0xc8ff8a, 0xfff27a, 0x0e3a20),
  f('tavern', 'さかばのたる', 1, { tex: 'wp:tavern' }, 0xffb84d, 0xffd96a, 0x2a160a),
  f('meadow', 'もりのフチ', 2, { tex: 'wp:meadow' }, 0xfff27a, 0xff8ad8, 0x0e3a20),
  f('desert', 'すなのフチ', 2, { tex: 'wp:desert' }, 0xff9a3a, 0xfff6d0, 0x6a3a10),
  f('sunset', 'ゆうやけ', 2, { stops: g('#ffe08a', '#ff8a5a', '#c03a6a') }, 0xfff6d0, 0xffffff, 0x4a0a2a),
  f('night', 'よぞら', 2, { stops: g('#5a5ab8', '#2a2a6a', '#10102a') }, 0xfff27a, 0xfff27a, 0x05051a),
  f('colorful', 'カラフル', 2, { tex: 'wp:colorful' }, 0xffffff, 0xffffff, 0x2a1630),
  f('library', 'ほんだな', 2, { tex: 'wp:library' }, 0xffd96a, 0xffd96a, 0x2a160a),
  f('pumpkin', 'かぼちゃ', 2, { tex: 'wp:pumpkin' }, 0xff9a1f, 0xffd23f, 0x3a1a00),
  f('bone', 'ホネのフチ', 3, { tex: 'wp:grave' }, 0xf2ead8, 0xf2ead8, 0x1e1a24),
  f('royal', 'ロイヤル', 3, { stops: g('#7a4dff', '#4a2a9a', '#2a1660') }, 0xffd23f, 0xffe680, 0x140a30),
  f('silver', 'シルバー', 3, { stops: g('#ffffff', '#c8d0e0', '#7a849a', '#e8ecf4') }, 0x5a6478, 0xffffff, 0x2a3040),
  f('gems', 'ほうせき', 3, { tex: 'wp:gems' }, 0x9be7ff, 0xff8ad8, 0x1a1030),
  f('toybox', 'おもちゃ', 3, { tex: 'wp:toybox' }, 0xff6fb5, 0xfff27a, 0x2a1630),
  f('fairy', 'おとぎばなし', 3, { tex: 'wp:fairy3' }, 0xffe6ff, 0xffffff, 0x2a1050),
  f('gold', 'おうごん', 4, { tex: 'wp:treasure' }, 0xffe680, 0xffffff, 0x6a4a00),
  f('coins', 'きんかのフチ', 4, { tex: 'wp:gold' }, 0xfff6c0, 0xffffff, 0x5a3a00),
  f('rainbow', 'にじいろ', 4, { stops: g('#ff6b8a', '#ffb84d', '#fff27a', '#6bf08a', '#5ab8ff', '#b07aff') }, 0xffffff, 0xffffff, 0x2a1630),
];

export const LINES: LineStyle[] = [
  { id: 'basic', name: 'いつものライン', star: 0, body: 'piece', glow: 'piece', core: 0xffffff },
  { id: 'white', name: 'ひかりのライン', star: 1, body: 0xffffff, glow: 0xbfe8ff, core: 0xffffff },
  { id: 'mint', name: 'ミントライン', star: 1, body: 0x5fe0c0, glow: 0xc8fff0, core: 0xffffff },
  { id: 'fire', name: 'ほのおライン', star: 2, body: 0xff6a1f, glow: 0xffb84d, core: 0xfff27a },
  { id: 'ice', name: 'こおりライン', star: 2, body: 0x5ac8ff, glow: 0xc8f4ff, core: 0xffffff },
  { id: 'neon', name: 'ネオンライン', star: 3, body: 0xff3dd8, glow: 0x7cf0ff, core: 0xffffff },
  { id: 'shadow', name: 'かげのライン', star: 3, body: 0x3a1a6a, glow: 0xb07aff, core: 0xe8d8ff },
  { id: 'gold', name: 'おうごんライン', star: 4, body: 0xffc71f, glow: 0xfff27a, core: 0xffffff },
  { id: 'rainbow', name: 'にじいろライン', star: 4, body: 'rainbow', glow: 'rainbow', core: 0xffffff },
];

export const WALLPAPER_BY_ID = Object.fromEntries(WALLPAPERS.map((w) => [w.id, w])) as Record<string, Wallpaper>;
export const FRAME_BY_ID = Object.fromEntries(FRAMES.map((f) => [f.id, f])) as Record<string, Frame>;
export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l])) as Record<string, LineStyle>;

export function currentLine(): LineStyle {
  return LINE_BY_ID[Save.data.look.line] ?? LINES[0];
}

export type LookKind = 'wallpaper' | 'frame' | 'line';
const OWNED_KEY = { wallpaper: 'wallpapers', frame: 'frames', line: 'lines' } as const;
const EQUIP_KEY = { wallpaper: 'wallpaper', frame: 'frame', line: 'line' } as const;

export function ownsLook(kind: LookKind, id: string): boolean {
  return Save.data.look[OWNED_KEY[kind]].includes(id);
}

export function equipped(kind: LookKind): string {
  return Save.data.look[EQUIP_KEY[kind]];
}

export function equip(kind: LookKind, id: string): void {
  Save.data.look[EQUIP_KEY[kind]] = id;
  Save.write();
}

/** Buys with coins; false when short. */
export function buyLook(kind: LookKind, id: string, star: Star): boolean {
  const price = PRICE[star];
  if (Save.data.coins < price || ownsLook(kind, id)) return false;
  Save.data.coins -= price;
  Save.data.look[OWNED_KEY[kind]].push(id);
  Save.write();
  return true;
}

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
