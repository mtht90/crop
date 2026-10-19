import { CanvasSource, Texture } from 'pixi.js';
import { Assets, Rectangle } from 'pixi.js';
import type { CharDef } from '../data/characters';

/** The five piece colors. Order matters: it is the color index used everywhere. */
export const COLORS = [
  { key: 'red', name: 'あか', base: '#ff4d6a', light: '#ffa3b4', dark: '#c4173f', line: '#7a0d2a', hex: 0xff4d6a, glow: 0xff8aa0 },
  { key: 'blue', name: 'あお', base: '#36a2ff', light: '#a8dbff', dark: '#155ec9', line: '#0b3577', hex: 0x36a2ff, glow: 0x8fd0ff },
  { key: 'green', name: 'みどり', base: '#3fd35c', light: '#b4f5b4', dark: '#16903a', line: '#0b5222', hex: 0x3fd35c, glow: 0x9cf5a8 },
  { key: 'yellow', name: 'きいろ', base: '#ffc71f', light: '#fff1a6', dark: '#e07f00', line: '#8a4600', hex: 0xffc71f, glow: 0xffe680 },
  { key: 'purple', name: 'むらさき', base: '#a65cff', light: '#dcbcff', dark: '#6a26cc', line: '#3b0f7a', hex: 0xa65cff, glow: 0xcfa3ff },
] as const;
export type ColorDef = (typeof COLORS)[number];

/** Expression drawn on the piece. */
export type Face = 'normal' | 'blink' | 'linked';

export const ART_SIZE = 256;
/** Body radius in texture pixels. */
export const ART_R = 86;
/** Body center within the texture. */
export const ART_CX = 128;
export const ART_CY = 150;

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function makeCanvas(res = 1): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = c.height = ART_SIZE * res;
  const ctx = c.getContext('2d')!;
  ctx.scale(res, res);
  ctx.translate(ART_CX, ART_CY);
  ctx.scale(ART_R, ART_R);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return [c, ctx];
}

export function canvasTexture(c: HTMLCanvasElement): Texture {
  return new Texture({ source: new CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear' }) });
}

// ------------------------------------------------------------------ shapes
function fillStroke(ctx: Ctx, fill: string | CanvasGradient, line: string, w = 0.075): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = w;
  ctx.strokeStyle = line;
  ctx.stroke();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

// ------------------------------------------------------------ accessories
function star(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.32;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawRock(): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas();
  ctx.beginPath();
  const pts = [[0, -0.95], [0.65, -0.78], [1.0, -0.1], [0.82, 0.68], [0.1, 0.94], [-0.7, 0.75], [-1.0, 0.05], [-0.72, -0.7]];
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    ctx.quadraticCurveTo(a[0] * 1.08, a[1] * 1.08, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-0.3, -0.45, 0.05, 0, 0, 1.3);
  g.addColorStop(0, '#d9dce6');
  g.addColorStop(0.5, '#8d93a8');
  g.addColorStop(1, '#4b506a');
  fillStroke(ctx, g, '#262a3d', 0.08);
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = '#3a3f57';
  ctx.beginPath();
  ctx.moveTo(-0.2, -0.6);
  ctx.lineTo(0.05, -0.2);
  ctx.lineTo(-0.1, 0.15);
  ctx.moveTo(0.05, -0.2);
  ctx.lineTo(0.45, -0.05);
  ctx.moveTo(0.3, 0.4);
  ctx.lineTo(0.55, 0.55);
  ctx.stroke();
  ellipse(ctx, -0.42, -0.45, 0.2, 0.1, -0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  // grumpy face so it reads as "enemy junk"
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = '#1e2133';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.45, 0.12);
    ctx.lineTo(s * 0.2, 0.2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-0.15, 0.48);
  ctx.quadraticCurveTo(0, 0.4, 0.15, 0.48);
  ctx.stroke();
  return canvas;
}

export function drawBomb(mega: boolean): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas();
  // fuse
  ctx.beginPath();
  ctx.moveTo(0.35, -0.75);
  ctx.quadraticCurveTo(0.65, -1.2, 0.95, -1.05);
  ctx.lineWidth = 0.1;
  ctx.strokeStyle = '#8a6a3a';
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(0.12, -0.95, 0.36, 0.28, 0.06);
  ctx.save();
  ctx.translate(0, 0);
  fillStroke(ctx, '#7c839b', '#1b1e2c', 0.06);
  ctx.restore();
  ellipse(ctx, 0, 0.05, 0.92, 0.9);
  const g = ctx.createRadialGradient(-0.35, -0.4, 0.05, 0, 0, 1.2);
  if (mega) {
    g.addColorStop(0, '#ff9ab0');
    g.addColorStop(0.45, '#e0204a');
    g.addColorStop(1, '#5a0018');
  } else {
    g.addColorStop(0, '#7d86a8');
    g.addColorStop(0.45, '#2c3149');
    g.addColorStop(1, '#0d0f1a');
  }
  fillStroke(ctx, g, '#07080f', 0.08);
  ellipse(ctx, -0.38, -0.4, 0.25, 0.13, -0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
  // spark
  star(ctx, 0.98, -1.08, 0.3, '#fff3a0');
  star(ctx, 0.98, -1.08, 0.16, '#ffffff');
  // face
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 0.3, 0.05, 0.1, 0.15);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0.32, 0.15, Math.PI * 0.15, Math.PI * 0.85);
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  if (mega) {
    for (const s of [-1, 1]) star(ctx, s * 0.62, -0.35, 0.16, '#ffe680');
  }
  return canvas;
}

// --------------------------------------------------------- texture cache

// ------------------------------------------------------------ character pieces
// Each character ships as a 5-cell strip (red, blue, green, yellow, purple) of
// pre-rendered KayKit heads, plus a portrait in its original colors.
export const PIECE_CELL = 320;
/** How large the art is drawn relative to the physics circle (heads overlap a little). */
export const PIECE_ART_SCALE = 1.2;

const atlasCache = new Map<string, Texture>();

export function piecesAlias(id: string): string {
  return `pieces:${id}`;
}
export function portraitAlias(id: string): string {
  return `portrait:${id}`;
}

/** Loads the strip + portrait for the given characters (no-op when cached). */
export async function loadCharacterArt(ids: string[]): Promise<void> {
  const list: { alias: string; src: string }[] = [];
  for (const id of ids) {
    if (!Assets.cache.has(piecesAlias(id))) list.push({ alias: piecesAlias(id), src: `./assets/pieces/${id}.webp` });
    if (!Assets.cache.has(portraitAlias(id))) list.push({ alias: portraitAlias(id), src: `./assets/pieces/${id}_portrait.webp` });
  }
  if (list.length) await Assets.load(list);
}

export function pieceTexture(def: CharDef, colorIdx: number): Texture {
  const key = `${def.id}:${colorIdx}`;
  let t = atlasCache.get(key);
  if (!t) {
    const base = Assets.get<Texture>(piecesAlias(def.id));
    if (!base) return Texture.WHITE;
    t = new Texture({ source: base.source, frame: new Rectangle(colorIdx * PIECE_CELL, 0, PIECE_CELL, PIECE_CELL) });
    atlasCache.set(key, t);
  }
  return t;
}

/** Larger art for menus, cut-ins and gacha. colorIdx < 0 = original colors. */
export function bigTexture(def: CharDef, colorIdx = -1): Texture {
  if (colorIdx >= 0) return pieceTexture(def, colorIdx);
  return Assets.get<Texture>(portraitAlias(def.id)) ?? Texture.WHITE;
}

let rockTex: Texture | null = null;
export function rockTexture(): Texture {
  return (rockTex ??= canvasTexture(drawRock()));
}
const bombTex: Record<string, Texture> = {};
export function bombTexture(mega: boolean): Texture {
  return (bombTex[mega ? 'm' : 'n'] ??= canvasTexture(drawBomb(mega)));
}
