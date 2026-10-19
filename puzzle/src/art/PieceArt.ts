import { CanvasSource, Texture } from 'pixi.js';
import type { CharDef, CharDesign } from '../data/characters';

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
function bodyPath(ctx: Ctx, shape: CharDesign['body']): void {
  ctx.beginPath();
  if (shape === 'drop') {
    ctx.moveTo(0, -1.28);
    ctx.bezierCurveTo(0.25, -0.95, 1.02, -0.45, 1.0, 0.18);
    ctx.bezierCurveTo(0.98, 0.7, 0.55, 0.94, 0, 0.94);
    ctx.bezierCurveTo(-0.55, 0.94, -0.98, 0.7, -1.0, 0.18);
    ctx.bezierCurveTo(-1.02, -0.45, -0.25, -0.95, 0, -1.28);
  } else if (shape === 'mochi') {
    ctx.moveTo(0, -0.84);
    ctx.bezierCurveTo(0.62, -0.84, 1.08, -0.42, 1.08, 0.18);
    ctx.bezierCurveTo(1.08, 0.72, 0.68, 0.92, 0, 0.92);
    ctx.bezierCurveTo(-0.68, 0.92, -1.08, 0.72, -1.08, 0.18);
    ctx.bezierCurveTo(-1.08, -0.42, -0.62, -0.84, 0, -0.84);
  } else if (shape === 'tall') {
    ctx.moveTo(0, -1.04);
    ctx.bezierCurveTo(0.7, -1.04, 0.94, -0.75, 0.94, -0.1);
    ctx.bezierCurveTo(0.94, 0.62, 0.72, 0.93, 0, 0.93);
    ctx.bezierCurveTo(-0.72, 0.93, -0.94, 0.62, -0.94, -0.1);
    ctx.bezierCurveTo(-0.94, -0.75, -0.7, -1.04, 0, -1.04);
  } else {
    ctx.moveTo(0, -0.97);
    ctx.bezierCurveTo(0.58, -0.97, 1.0, -0.55, 1.0, 0.04);
    ctx.bezierCurveTo(1.0, 0.66, 0.62, 0.93, 0, 0.93);
    ctx.bezierCurveTo(-0.62, 0.93, -1.0, 0.66, -1.0, 0.04);
    ctx.bezierCurveTo(-1.0, -0.55, -0.58, -0.97, 0, -0.97);
  }
  ctx.closePath();
}

function bodyGradient(ctx: Ctx, c: ColorDef): CanvasGradient {
  const g = ctx.createRadialGradient(-0.32, -0.48, 0.05, -0.1, -0.1, 1.45);
  g.addColorStop(0, c.light);
  g.addColorStop(0.42, c.base);
  g.addColorStop(1, c.dark);
  return g;
}

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
function drawBack(ctx: Ctx, d: CharDesign, c: ColorDef): void {
  const accent = d.accent ?? c.dark;
  if (d.wings) {
    const angel = d.ears === 'halo';
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.scale(s, 1);
      ctx.beginPath();
      if (angel) {
        ctx.moveTo(0.78, -0.1);
        ctx.bezierCurveTo(1.05, -0.65, 1.42, -0.55, 1.36, -0.22);
        ctx.bezierCurveTo(1.44, -0.1, 1.36, 0.08, 1.24, 0.08);
        ctx.bezierCurveTo(1.3, 0.2, 1.15, 0.34, 1.0, 0.25);
        ctx.bezierCurveTo(0.95, 0.35, 0.82, 0.3, 0.78, 0.2);
        fillStroke(ctx, '#ffffff', '#9aa3c7', 0.06);
      } else {
        ctx.moveTo(0.75, -0.25);
        ctx.lineTo(1.36, -0.72);
        ctx.lineTo(1.3, -0.22);
        ctx.lineTo(1.4, 0.04);
        ctx.lineTo(1.16, 0.0);
        ctx.lineTo(1.14, 0.25);
        ctx.lineTo(0.85, 0.15);
        ctx.closePath();
        fillStroke(ctx, c.dark, c.line, 0.06);
      }
      ctx.restore();
    }
  }
  switch (d.ears) {
    case 'cat':
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.scale(s, 1);
        ctx.beginPath();
        ctx.moveTo(0.22, -0.72);
        ctx.quadraticCurveTo(0.6, -1.32, 0.72, -1.12);
        ctx.quadraticCurveTo(0.9, -0.8, 0.88, -0.4);
        ctx.closePath();
        fillStroke(ctx, bodyGradient(ctx, c), c.line);
        ctx.beginPath();
        ctx.moveTo(0.38, -0.72);
        ctx.quadraticCurveTo(0.62, -1.08, 0.7, -0.98);
        ctx.quadraticCurveTo(0.78, -0.8, 0.76, -0.55);
        ctx.closePath();
        ctx.fillStyle = '#ffc2d4';
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'bunny':
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 0.38, -1.0, 0.2, 0.5, s * 0.22);
        fillStroke(ctx, bodyGradient(ctx, c), c.line);
        ellipse(ctx, s * 0.38, -0.98, 0.09, 0.34, s * 0.22);
        ctx.fillStyle = '#ffc2d4';
        ctx.fill();
      }
      break;
    case 'bear':
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 0.68, -0.72, 0.28, 0.28);
        fillStroke(ctx, bodyGradient(ctx, c), c.line);
        ellipse(ctx, s * 0.68, -0.72, 0.14, 0.14);
        ctx.fillStyle = c.light;
        ctx.fill();
      }
      break;
    case 'horns':
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.scale(s, 1);
        ctx.beginPath();
        ctx.moveTo(0.28, -0.82);
        ctx.quadraticCurveTo(0.42, -1.22, 0.68, -1.3);
        ctx.quadraticCurveTo(0.6, -1.0, 0.66, -0.66);
        ctx.closePath();
        fillStroke(ctx, accent, '#1a0f22', 0.06);
        ctx.restore();
      }
      break;
    case 'dragon':
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.scale(s, 1);
        ctx.beginPath();
        ctx.moveTo(0.22, -0.85);
        ctx.quadraticCurveTo(0.3, -1.3, 0.62, -1.42);
        ctx.quadraticCurveTo(0.5, -1.1, 0.56, -0.74);
        ctx.closePath();
        fillStroke(ctx, accent, '#7a4a00', 0.06);
        ctx.beginPath();
        ctx.moveTo(0.82, -0.45);
        ctx.lineTo(1.18, -0.62);
        ctx.lineTo(1.0, -0.3);
        ctx.lineTo(1.16, -0.2);
        ctx.lineTo(0.92, -0.06);
        ctx.closePath();
        fillStroke(ctx, c.dark, c.line, 0.06);
        ctx.restore();
      }
      break;
    case 'crest':
      for (const [x, r, h] of [[-0.18, -0.35, 0.42], [0, 0, 0.55], [0.18, 0.35, 0.42]] as const) {
        ctx.save();
        ctx.translate(x, -0.88);
        ctx.rotate(r);
        ellipse(ctx, 0, -h * 0.5, 0.1, h * 0.55);
        fillStroke(ctx, c.dark, c.line, 0.06);
        ctx.restore();
      }
      break;
    case 'flame': {
      ctx.beginPath();
      ctx.moveTo(-0.62, -0.6);
      ctx.bezierCurveTo(-0.75, -1.0, -0.4, -1.05, -0.38, -1.38);
      ctx.bezierCurveTo(-0.15, -1.15, -0.1, -1.05, -0.05, -1.5);
      ctx.bezierCurveTo(0.2, -1.2, 0.28, -1.12, 0.42, -1.4);
      ctx.bezierCurveTo(0.62, -1.1, 0.78, -0.9, 0.62, -0.6);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -1.5, 0, -0.6);
      g.addColorStop(0, '#fff6c2');
      g.addColorStop(0.45, accent);
      g.addColorStop(1, c.dark);
      fillStroke(ctx, g, c.line, 0.06);
      break;
    }
    case 'antenna':
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.35, -0.85);
        ctx.lineTo(s * 0.5, -1.3);
        ctx.lineWidth = 0.08;
        ctx.strokeStyle = '#59627a';
        ctx.stroke();
        ellipse(ctx, s * 0.5, -1.33, 0.13, 0.13);
        fillStroke(ctx, c.light, c.line, 0.05);
      }
      break;
    default:
      break;
  }
}

function drawFrontAccessory(ctx: Ctx, d: CharDesign, c: ColorDef): void {
  const accent = d.accent ?? '#ffd23f';
  switch (d.ears) {
    case 'sprout': {
      ctx.beginPath();
      ctx.moveTo(0, -0.92);
      ctx.quadraticCurveTo(0.03, -1.12, -0.02, -1.22);
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = '#2f8a3a';
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(0, -1.2);
        ctx.rotate(s * 0.9);
        ellipse(ctx, 0, -0.17, 0.11, 0.2);
        fillStroke(ctx, '#6fdc5c', '#2b7a2b', 0.05);
        ctx.restore();
      }
      break;
    }
    case 'halo':
      ellipse(ctx, 0, -1.22, 0.52, 0.14);
      ctx.lineWidth = 0.12;
      ctx.strokeStyle = '#a07a00';
      ctx.stroke();
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = accent;
      ctx.stroke();
      break;
    case 'crown': {
      ctx.beginPath();
      ctx.moveTo(-0.48, -0.72);
      ctx.lineTo(-0.55, -1.22);
      ctx.lineTo(-0.27, -0.98);
      ctx.lineTo(0, -1.32);
      ctx.lineTo(0.27, -0.98);
      ctx.lineTo(0.55, -1.22);
      ctx.lineTo(0.48, -0.72);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -1.3, 0, -0.7);
      g.addColorStop(0, '#fff3a8');
      g.addColorStop(1, accent);
      fillStroke(ctx, g, '#8a5a00', 0.06);
      ellipse(ctx, 0, -0.9, 0.1, 0.1);
      fillStroke(ctx, c.base, c.line, 0.04);
      for (const x of [-0.55, 0, 0.55]) {
        ellipse(ctx, x, x === 0 ? -1.34 : -1.24, 0.06, 0.06);
        ctx.fillStyle = '#fffbe0';
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
}

// ------------------------------------------------------------------ faces
type EyeMode = 'open' | 'happy' | 'half' | 'sparkle' | 'side' | 'blink' | 'squeeze' | 'angry';
type MouthMode = 'base' | 'open' | 'small' | 'smirk' | 'grin' | 'wow';

const INK = '#2a1630';

function eyePair(ctx: Ctx, d: CharDesign, c: ColorDef, mode: EyeMode): void {
  const ex = d.body === 'mochi' ? 0.4 : 0.36;
  const ey = -0.06;
  if (d.eyes === 'visor' && mode !== 'blink' && mode !== 'squeeze' && mode !== 'happy') {
    ctx.beginPath();
    ctx.roundRect(-0.68, ey - 0.22, 1.36, 0.42, 0.21);
    const g = ctx.createLinearGradient(0, ey - 0.22, 0, ey + 0.2);
    g.addColorStop(0, '#3a4560');
    g.addColorStop(1, '#151a2b');
    fillStroke(ctx, g, '#0b0f1a', 0.05);
    for (const s of [-1, 1]) {
      const h = mode === 'half' ? 0.06 : 0.11;
      ellipse(ctx, s * 0.3 + (mode === 'side' ? 0.08 : 0), ey, 0.13, h);
      ctx.fillStyle = mode === 'angry' ? '#ff7070' : c.light;
      ctx.fill();
      ellipse(ctx, s * 0.3 + (mode === 'side' ? 0.08 : 0), ey, 0.07, h * 0.55);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    if (mode === 'sparkle') star(ctx, 0.5, ey - 0.18, 0.12, '#ffffff');
    return;
  }
  const big = d.eyes === 'big';
  const rx = big ? 0.16 : 0.12;
  const ry = big ? 0.22 : 0.16;
  ctx.lineWidth = 0.085;
  ctx.strokeStyle = INK;
  for (const s of [-1, 1]) {
    const x = s * ex;
    switch (mode) {
      case 'happy':
        ctx.beginPath();
        ctx.arc(x, ey + 0.06, 0.13, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        break;
      case 'blink':
        ctx.beginPath();
        ctx.arc(x, ey - 0.06, 0.13, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        break;
      case 'squeeze':
        ctx.beginPath();
        ctx.moveTo(x - s * 0.14, ey - 0.12);
        ctx.lineTo(x + s * 0.08, ey);
        ctx.lineTo(x - s * 0.14, ey + 0.12);
        ctx.stroke();
        break;
      default: {
        const shift = mode === 'side' ? 0.06 : 0;
        if (d.eyes === 'sharp') {
          ctx.beginPath();
          ctx.moveTo(x - rx, ey - ry * 0.3 + (s < 0 ? -0.06 : 0.04));
          ctx.lineTo(x + rx, ey - ry * 0.3 + (s < 0 ? 0.04 : -0.06));
          ctx.quadraticCurveTo(x + rx * 1.1, ey + ry, x, ey + ry);
          ctx.quadraticCurveTo(x - rx * 1.1, ey + ry, x - rx, ey - ry * 0.3 + (s < 0 ? -0.06 : 0.04));
          ctx.fillStyle = INK;
          ctx.fill();
        } else {
          ellipse(ctx, x + shift, ey, rx, ry);
          ctx.fillStyle = INK;
          ctx.fill();
        }
        // highlights
        if (mode === 'sparkle') {
          star(ctx, x - rx * 0.25 + shift, ey - ry * 0.3, big ? 0.13 : 0.1, '#ffffff');
        } else {
          ellipse(ctx, x - rx * 0.35 + shift, ey - ry * 0.4, rx * 0.42, rx * 0.42);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ellipse(ctx, x + rx * 0.35 + shift, ey + ry * 0.45, rx * 0.2, rx * 0.2);
          ctx.fill();
        }
        if (mode === 'half' || mode === 'side') {
          // eyelid
          ctx.save();
          ctx.beginPath();
          ctx.rect(x - rx * 1.6, ey - ry * 1.6, rx * 3.2, ry * 1.45);
          ctx.clip();
          ellipse(ctx, x + shift, ey, rx * 1.18, ry * 1.18);
          ctx.fillStyle = c.base;
          ctx.fill();
          ctx.restore();
          ctx.beginPath();
          ctx.moveTo(x - rx * 1.2 + shift, ey - ry * 0.15);
          ctx.lineTo(x + rx * 1.2 + shift, ey - ry * 0.15);
          ctx.lineWidth = 0.07;
          ctx.stroke();
        }
      }
    }
  }
}

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

function brows(ctx: Ctx, d: CharDesign, kind: 'angry' | 'raised' | 'worried'): void {
  const ex = d.body === 'mochi' ? 0.4 : 0.36;
  const y = d.eyes === 'big' ? -0.36 : -0.3;
  ctx.lineWidth = 0.08;
  ctx.strokeStyle = INK;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (kind === 'angry') {
      ctx.moveTo(s * (ex + 0.15), y - 0.06);
      ctx.lineTo(s * (ex - 0.13), y + 0.06);
    } else if (kind === 'worried') {
      ctx.moveTo(s * (ex + 0.15), y + 0.05);
      ctx.lineTo(s * (ex - 0.13), y - 0.05);
    } else {
      if (s < 0) {
        ctx.moveTo(-ex - 0.14, y + 0.02);
        ctx.lineTo(-ex + 0.13, y + 0.02);
      } else {
        ctx.moveTo(ex - 0.13, y - 0.02);
        ctx.quadraticCurveTo(ex, y - 0.14, ex + 0.15, y - 0.04);
      }
    }
    ctx.stroke();
  }
}

function mouth(ctx: Ctx, d: CharDesign, mode: MouthMode): void {
  const y = 0.28;
  ctx.lineWidth = 0.075;
  ctx.strokeStyle = INK;
  if (d.mouth === 'beak') {
    ctx.beginPath();
    const open = mode === 'open' || mode === 'wow' || mode === 'grin';
    ctx.moveTo(-0.17, y - 0.06);
    ctx.lineTo(0, y - 0.14);
    ctx.lineTo(0.17, y - 0.06);
    ctx.lineTo(0, open ? y + 0.2 : y + 0.08);
    ctx.closePath();
    fillStroke(ctx, d.accent ?? '#ff9f1c', '#8a4600', 0.05);
    if (open) {
      ctx.beginPath();
      ctx.moveTo(-0.15, y - 0.03);
      ctx.lineTo(0.15, y - 0.03);
      ctx.stroke();
    }
    return;
  }
  if (d.mouth === 'cat' && (mode === 'base' || mode === 'smirk' || mode === 'small')) {
    ctx.beginPath();
    ctx.arc(-0.1, y - 0.02, 0.1, Math.PI * 0.1, Math.PI * 0.95);
    ctx.moveTo(0.2, y - 0.01);
    ctx.arc(0.1, y - 0.02, 0.1, Math.PI * 0.05, Math.PI * 0.9);
    ctx.stroke();
    return;
  }
  switch (mode) {
    case 'open':
    case 'grin': {
      const w = mode === 'grin' ? 0.3 : 0.22;
      ctx.beginPath();
      ctx.moveTo(-w, y - 0.06);
      ctx.quadraticCurveTo(0, y - 0.02, w, y - 0.06);
      ctx.quadraticCurveTo(w * 0.9, y + 0.26, 0, y + 0.26);
      ctx.quadraticCurveTo(-w * 0.9, y + 0.26, -w, y - 0.06);
      ctx.closePath();
      fillStroke(ctx, '#7a1838', INK, 0.06);
      ctx.save();
      ctx.clip();
      ellipse(ctx, 0, y + 0.26, w * 0.6, 0.12);
      ctx.fillStyle = '#ff7a95';
      ctx.fill();
      ctx.restore();
      if (d.mouth === 'fang') fang(ctx, 0.1, y - 0.04);
      break;
    }
    case 'wow':
      ellipse(ctx, 0, y + 0.06, 0.1, 0.13);
      fillStroke(ctx, '#7a1838', INK, 0.06);
      break;
    case 'small':
      ctx.beginPath();
      ctx.arc(0, y - 0.04, 0.09, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      break;
    case 'smirk':
      ctx.beginPath();
      ctx.moveTo(-0.16, y + 0.04);
      ctx.quadraticCurveTo(0.05, y + 0.1, 0.18, y - 0.06);
      ctx.stroke();
      if (d.mouth === 'fang') fang(ctx, 0.06, y + 0.06);
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, y - 0.1, 0.16, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      if (d.mouth === 'fang') fang(ctx, 0.08, y + 0.04);
  }
}

function fang(ctx: Ctx, x: number, y: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 0.05, y);
  ctx.lineTo(x + 0.05, y);
  ctx.lineTo(x, y + 0.1);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 0.03;
  ctx.stroke();
}

/** Per-color personality so colors are told apart by face as well as hue. */
const PERSONALITY: { eyes: EyeMode; mouth: MouthMode; brows?: 'angry' | 'raised' | 'worried'; blush?: boolean }[] = [
  { eyes: 'open', mouth: 'grin', brows: 'angry' }, // red: fired up
  { eyes: 'half', mouth: 'small' }, // blue: cool
  { eyes: 'happy', mouth: 'open', blush: true }, // green: cheerful
  { eyes: 'sparkle', mouth: 'open', blush: true }, // yellow: excited
  { eyes: 'side', mouth: 'smirk', brows: 'raised' }, // purple: sly
];

function drawFace(ctx: Ctx, d: CharDesign, c: ColorDef, colorIdx: number, face: Face): void {
  const p = PERSONALITY[colorIdx];
  let eyes = p.eyes;
  let m = p.mouth;
  if (face === 'blink' && eyes !== 'happy') eyes = 'blink';
  if (face === 'linked') {
    eyes = 'squeeze';
    m = 'open';
  }
  if (d.blush || p.blush || face === 'linked') {
    for (const s of [-1, 1]) {
      ellipse(ctx, s * 0.62, 0.2, 0.16, 0.09);
      ctx.fillStyle = 'rgba(255,120,150,0.5)';
      ctx.fill();
    }
  }
  eyePair(ctx, d, c, eyes);
  if (p.brows && face !== 'linked' && d.eyes !== 'visor') brows(ctx, d, p.brows);
  if (d.ears === 'crown') {
    // the king's moustache
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.scale(s, 1);
      ctx.beginPath();
      ctx.moveTo(0.02, 0.18);
      ctx.bezierCurveTo(0.15, 0.08, 0.38, 0.12, 0.42, 0.26);
      ctx.bezierCurveTo(0.3, 0.2, 0.18, 0.26, 0.02, 0.24);
      ctx.closePath();
      fillStroke(ctx, '#6b3d1f', '#2a1630', 0.03);
      ctx.restore();
    }
  }
  mouth(ctx, d, m);
}

const SYMBOLS = ['heart', 'drop', 'leaf', 'star', 'moon'] as const;

function drawSymbol(ctx: Ctx, idx: number): void {
  ctx.save();
  ctx.translate(0.62, 0.6);
  ctx.scale(0.24, 0.24);
  ctx.beginPath();
  switch (SYMBOLS[idx]) {
    case 'heart':
      ctx.moveTo(0, 0.9);
      ctx.bezierCurveTo(-1.3, 0, -0.8, -1.0, 0, -0.35);
      ctx.bezierCurveTo(0.8, -1.0, 1.3, 0, 0, 0.9);
      break;
    case 'drop':
      ctx.moveTo(0, -1);
      ctx.bezierCurveTo(0.4, -0.4, 0.8, 0, 0.8, 0.3);
      ctx.arc(0, 0.3, 0.8, 0, Math.PI);
      ctx.bezierCurveTo(-0.8, 0, -0.4, -0.4, 0, -1);
      break;
    case 'leaf':
      ctx.moveTo(-0.8, 0.8);
      ctx.bezierCurveTo(-0.9, -0.6, 0.2, -1.0, 0.9, -0.9);
      ctx.bezierCurveTo(1.0, 0.0, 0.4, 0.9, -0.8, 0.8);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2;
        const r = i % 2 === 0 ? 1 : 0.45;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      break;
    case 'moon':
      ctx.arc(0, 0, 0.9, Math.PI * 0.35, Math.PI * 1.65);
      ctx.arc(0.45, 0, 0.65, Math.PI * 1.45, Math.PI * 0.55, true);
      break;
  }
  ctx.closePath();
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = '#2a1630';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/** Draws one piece of a character in a color + expression. */
export function drawPiece(def: CharDef, colorIdx: number, face: Face, symbol = false, res = 1): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(res);
  const d = def.design;
  const c = COLORS[colorIdx];
  drawBack(ctx, d, c);
  // body
  bodyPath(ctx, d.body);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  fillStroke(ctx, bodyGradient(ctx, c), c.line, 0.08);
  ctx.restore();
  // inner shading + rim light (clipped to the body)
  ctx.save();
  bodyPath(ctx, d.body);
  ctx.clip();
  const shade = ctx.createRadialGradient(0.15, 0.95, 0.1, 0.1, 0.9, 1.0);
  shade.addColorStop(0, 'rgba(0,0,0,0.22)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(-1.5, -1.5, 3, 3);
  ctx.beginPath();
  ctx.arc(0.0, 0.0, 0.88, Math.PI * 0.15, Math.PI * 0.6);
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.stroke();
  ctx.restore();
  // gloss
  ellipse(ctx, -0.42, -0.52, 0.28, 0.15, -0.55);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
  ellipse(ctx, -0.12, -0.74, 0.07, 0.05, -0.3);
  ctx.fill();
  drawFace(ctx, d, c, colorIdx, face);
  drawFrontAccessory(ctx, d, c);
  if (symbol) drawSymbol(ctx, colorIdx);
  return canvas;
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
const cache = new Map<string, Texture>();

export function pieceTexture(def: CharDef, colorIdx: number, face: Face, symbol = false): Texture {
  const key = `${def.id}:${colorIdx}:${face}:${symbol ? 1 : 0}`;
  let t = cache.get(key);
  if (!t) {
    t = customTexture(def, colorIdx) ?? canvasTexture(drawPiece(def, colorIdx, face, symbol));
    cache.set(key, t);
  }
  return t;
}

/** High-resolution (2x) art for big displays (home, cut-ins, gacha). */
export function bigTexture(def: CharDef, colorIdx: number, face: Face = 'normal'): Texture {
  const key = `big:${def.id}:${colorIdx}:${face}`;
  let t = cache.get(key);
  if (!t) {
    t = customTexture(def, colorIdx) ?? canvasTexture(drawPiece(def, colorIdx, face, false, 2));
    cache.set(key, t);
  }
  return t;
}

const custom = new Map<string, Texture>();
/** Registers user-provided art (see CharDef.customArt). */
export function registerCustomArt(id: string, colorIdx: number, tex: Texture): void {
  // Normalize arbitrary art into the piece layout: the image's width spans the body diameter
  // (with a little overhang) and is centered on the body center.
  const src = tex.source.resource as CanvasImageSource;
  const c = document.createElement('canvas');
  c.width = c.height = ART_SIZE;
  const ctx = c.getContext('2d')!;
  const iw = tex.source.width;
  const ih = tex.source.height;
  const s = Math.min((ART_R * 2.2) / iw, (ART_SIZE * 0.98) / ih);
  ctx.drawImage(src, ART_CX - (iw * s) / 2, Math.min(ART_CY - (ih * s) / 2, ART_SIZE - ih * s), iw * s, ih * s);
  custom.set(`${id}:${colorIdx}`, canvasTexture(c));
}
function customTexture(def: CharDef, colorIdx: number): Texture | undefined {
  return def.customArt ? custom.get(`${def.id}:${colorIdx}`) : undefined;
}

let rockTex: Texture | null = null;
export function rockTexture(): Texture {
  return (rockTex ??= canvasTexture(drawRock()));
}
const bombTex: Record<string, Texture> = {};
export function bombTexture(mega: boolean): Texture {
  return (bombTex[mega ? 'm' : 'n'] ??= canvasTexture(drawBomb(mega)));
}
