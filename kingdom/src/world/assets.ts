import { Assets, Rectangle, Texture, TextureSource } from 'pixi.js';

export const BASE = `${import.meta.env.BASE_URL}assets/sprites/`;
export const COLORS = ['blue', 'red', 'purple', 'yellow', 'black'] as const;
export type Color = (typeof COLORS)[number];

const BUILDING_FILES = ['archery', 'barracks', 'castle', 'house1', 'house2', 'house3', 'monastery', 'tower'];

function manifest(): string[] {
  const f: string[] = [];
  for (const c of COLORS) {
    for (const b of BUILDING_FILES) f.push(`buildings/${c}/${b}.png`);
    for (const u of ['warrior_idle', 'warrior_run', 'warrior_attack1', 'warrior_attack2', 'warrior_guard', 'archer_idle', 'archer_run', 'archer_shoot',
      'archer_arrow', 'lancer_idle', 'lancer_run', 'lancer_right_attack', 'monk_idle', 'monk_run', 'monk_heal', 'monk_heal_effect']) f.push(`units/${c}/${u}.png`);
  }
  for (const p of ['idle', 'idle_axe', 'idle_gold', 'idle_hammer', 'idle_knife', 'idle_meat', 'idle_pickaxe', 'idle_wood', 'interact_axe', 'interact_hammer',
    'interact_knife', 'interact_pickaxe', 'run', 'run_axe', 'run_gold', 'run_hammer', 'run_knife', 'run_meat', 'run_pickaxe', 'run_wood']) f.push(`units/blue/pawn_${p}.png`);
  for (let i = 1; i <= 5; i++) f.push(`terrain/tilemap${i}.png`);
  f.push('terrain/shadow.png', 'terrain/foam.png');
  for (let i = 1; i <= 4; i++) f.push(`deco/bush${i}.png`, `deco/rock${i}.png`, `deco/waterrock${i}.png`, `res/tree${i}.png`, `res/stump${i}.png`);
  for (let i = 1; i <= 8; i++) f.push(`deco/cloud${i}.png`);
  f.push('deco/duck.png');
  for (let i = 1; i <= 6; i++) f.push(`res/goldstone${i}.png`, `res/goldstone${i}_hl.png`);
  f.push('res/gold.png', 'res/gold_hl.png', 'res/wood.png', 'res/meat.png', 'res/sheep_idle.png', 'res/sheep_move.png', 'res/sheep_grass.png');
  for (const x of ['dust_01', 'dust_02', 'explosion_01', 'explosion_02', 'fire_01', 'fire_02', 'fire_03', 'water_splash']) f.push(`fx/${x}.png`);
  return f;
}

const cache = new Map<string, Texture>();
const stripCache = new Map<string, Texture[]>();

export async function loadWorldAssets(onProgress: (p: number) => void) {
  TextureSource.defaultOptions.scaleMode = 'linear';
  const files = manifest();
  const urls = files.map((f) => BASE + f);
  const loaded = await Assets.load(urls, onProgress);
  files.forEach((f, i) => cache.set(f.replace(/\.png$/, ''), loaded[urls[i]] as Texture));
}

export function tex(key: string): Texture {
  const t = cache.get(key);
  if (!t) throw new Error('missing texture ' + key);
  return t;
}

/** 横一列に並んだアニメーションを切り出す（コマは正方形、または frameW 指定）。 */
export function strip(key: string, frameW?: number): Texture[] {
  const ck = key + ':' + (frameW ?? '');
  const hit = stripCache.get(ck);
  if (hit) return hit;
  const t = tex(key);
  const fw = frameW ?? t.height;
  const n = Math.max(1, Math.round(t.width / fw));
  const frames: Texture[] = [];
  for (let i = 0; i < n; i++) frames.push(new Texture({ source: t.source, frame: new Rectangle(i * fw, 0, fw, t.height) }));
  stripCache.set(ck, frames);
  return frames;
}

/** タイルマップから64pxの1マスを切り出す */
export function tile(key: string, col: number, row: number): Texture {
  const ck = `${key}@${col},${row}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const t = tex(key);
  const out = new Texture({ source: t.source, frame: new Rectangle(col * 64, row * 64, 64, 64) });
  cache.set(ck, out);
  return out;
}
