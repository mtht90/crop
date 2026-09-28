import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PRODUCTS, SHAPE_SIZE, type ProductDef } from '../data/products';
import { canvas, fitText, friedCrust, rand } from './Textures';

/**
 * Builds a realistic-looking package model for every product: geometry sized
 * in metres with its origin at the bottom centre, plus a material array whose
 * indices match the geometry groups. Package art is drawn procedurally on
 * canvases (all brands are fictional).
 */
export interface ProductVisual {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
  /** Bounding size (w, h, d). */
  size: THREE.Vector3;
}

const JP = '"Noto Sans JP", sans-serif';
const cache = new Map<string, ProductVisual>();

const LIQUID: Record<string, string> = {
  greentea: '#b9c24a', water: '#d8ecf5', cola: '#2a120a', sports: '#dbeefc', milktea: '#caa47c',
};

function ctex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function mat(opts: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ roughness: 0.45, ...opts });
}

// ------------------------------------------------------------------ art

function barcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = '#000';
  for (let i = 0; i < w; i += 2) if (rand() > 0.4) ctx.fillRect(x + i, y, rand() < 0.3 ? 2 : 1, h);
}

function stripes(ctx: CanvasRenderingContext2D, W: number, H: number, col: string) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = col;
  for (let i = -H; i < W; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 18, 0);
    ctx.lineTo(i + 18 + H, H);
    ctx.lineTo(i + H, H);
    ctx.fill();
  }
  ctx.restore();
}

/** Generic front label: background, brand wordmark, product name. */
function drawLabel(p: ProductDef, W: number, H: number, opts: { wrap?: boolean; small?: boolean } = {}): HTMLCanvasElement {
  const [c, ctx] = canvas(W, H);
  const [bg, accent, text] = p.colors;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const reps = opts.wrap ? 2 : 1;
  for (let r = 0; r < reps; r++) {
    const ox = (r * W) / reps;
    const w = W / reps;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, 0, w, H);
    ctx.clip();
    stripes(ctx, W, H, accent);
    // accent swoosh
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(ox + w * 0.5, H * 1.05, w * 0.7, H * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, p.brand, ox + w / 2, H * 0.24, w * 0.86, Math.min(H * 0.2, w * 0.3), '900', JP);
    ctx.fillStyle = contrast(accent);
    fitText(ctx, p.name, ox + w / 2, H * 0.78, w * 0.84, Math.min(H * 0.13, w * 0.16), '700', JP);
    ctx.fillStyle = text;
    fitText(ctx, p.age ? 'お酒 20歳未満の飲酒は法律で禁止されています' : '内容量 1個 / 保存方法 直射日光を避けて', ox + w / 2, H * 0.46, w * 0.8, H * 0.05, '400', JP);
    ctx.restore();
  }
  if (!opts.small) barcode(ctx, W * 0.02, H * 0.55, W * 0.1, H * 0.12);
  return c;
}

function contrast(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const l = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
  return l > 150 ? '#111' : '#fff';
}

function drawRice(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#f7f5ee';
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < (w * h) / 18; i++) {
    ctx.fillStyle = rand() < 0.5 ? '#e6e2d5' : '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + rand() * w, y + rand() * h, 3, 1.6, rand() * 3, 0, 7);
    ctx.fill();
  }
}

function blobs(ctx: CanvasRenderingContext2D, cx: number, cy: number, n: number, r: number, cols: string[]) {
  for (let i = 0; i < n; i++) {
    const x = cx + (rand() - 0.5) * r * 2;
    const y = cy + (rand() - 0.5) * r * 1.4;
    const rr = r * (0.35 + rand() * 0.3);
    const g = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.3, rr * 0.1, x, y, rr);
    g.addColorStop(0, cols[0]);
    g.addColorStop(1, cols[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * 0.8, rand() * 3, 0, 7);
    ctx.fill();
  }
}

function drawBentoTop(p: ProductDef): HTMLCanvasElement {
  const W = 512;
  const H = 400;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#151515';
  ctx.fillRect(0, 0, W, H);
  drawRice(ctx, 20, 20, 250, H - 40);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(145, H / 2, 16, 0, 7); // umeboshi
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(285, 20, 207, H - 40);
  if (p.id === 'bento_karaage') {
    blobs(ctx, 390, 150, 6, 55, ['#d99a45', '#7a4210']);
    ctx.fillStyle = '#6fbf4a';
    ctx.fillRect(300, 280, 180, 80);
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.ellipse(460, 330, 22, 14, 0, 0, 7);
    ctx.fill();
  } else {
    blobs(ctx, 350, 100, 2, 40, ['#f28b5b', '#b8502a']); // salmon
    blobs(ctx, 440, 110, 2, 30, ['#f5d76e', '#c9a227']); // tamagoyaki
    blobs(ctx, 350, 230, 3, 35, ['#c58a4a', '#6b3a12']); // nimono
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(420, 200, 60, 40);
    ctx.fillStyle = '#7bc043';
    ctx.fillRect(300, 300, 180, 60);
  }
  // clear lid glare + sticker
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(255,255,255,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = p.colors[1];
  ctx.fillRect(W - 210, H - 90, 200, 70);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, p.name, W - 110, H - 55, 185, 34, '900', JP);
  return c;
}

function drawOnigiri(p: ProductDef): HTMLCanvasElement {
  const W = 256;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  drawRice(ctx, 0, 0, W, H);
  // nori through the film
  ctx.fillStyle = '#1b2418';
  ctx.fillRect(W * 0.28, H * 0.0, W * 0.44, H * 0.6);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = 'rgba(60,80,50,0.4)';
    ctx.fillRect(W * 0.28 + rand() * W * 0.44, rand() * H * 0.6, 2, 2);
  }
  // film print + label
  ctx.fillStyle = p.colors[0];
  ctx.fillRect(W * 0.18, H * 0.58, W * 0.64, H * 0.3);
  ctx.fillStyle = p.colors[2];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, p.name.replace('手巻 ', ''), W / 2, H * 0.73, W * 0.6, 40, '900', JP);
  ctx.fillStyle = '#d32f2f';
  ctx.font = `700 18px ${JP}`;
  ctx.fillText('①②③ あけかた', W / 2, H * 0.94);
  return c;
}

function drawSandwichFront(): HTMLCanvasElement {
  const W = 256;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f4e3c1';
  ctx.fillRect(0, 0, W, H);
  const layers = ['#f7e7c6', '#f3d36b', '#ffffff', '#f7e7c6', '#6ab04c', '#e8a0a0', '#f7e7c6'];
  let y = 20;
  for (const col of layers) {
    const h = col === '#f7e7c6' ? 36 : 22;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.1) * 3);
    ctx.lineTo(W, y + h);
    ctx.lineTo(0, y + h);
    ctx.fill();
    y += h;
  }
  ctx.fillStyle = '#3aa35b';
  ctx.fillRect(0, H - 40, W, 40);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `900 26px ${JP}`;
  ctx.fillText('ミックスサンド', W / 2, H - 13);
  return c;
}

function drawCupTop(p: ProductDef): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = p.colors[0];
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = p.colors[1];
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.42, 0, 7);
  ctx.fill();
  ctx.fillStyle = contrast(p.colors[1]);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, p.brand, S / 2, S / 2 - 18, S * 0.7, 46, '900', JP);
  fitText(ctx, p.name, S / 2, S / 2 + 30, S * 0.7, 18, '700', JP);
  return c;
}

function drawFoodTop(kind: 'pudding' | 'salad' | 'icecup' | 'bread', p: ProductDef): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = canvas(S);
  if (kind === 'pudding') {
    ctx.fillStyle = '#f5d47a';
    ctx.fillRect(0, 0, S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#f7dc8b');
    g.addColorStop(1, '#d8a441');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(S * 0.15, S * 0.62, S * 0.7, S * 0.22);
    ctx.fillStyle = '#6b3e12';
    ctx.textAlign = 'center';
    fitText(ctx, p.name, S / 2, S * 0.75, S * 0.66, 28, '900', JP);
  } else if (kind === 'salad') {
    ctx.fillStyle = '#e8f5e0';
    ctx.fillRect(0, 0, S, S);
    blobs(ctx, S / 2, S / 2, 30, 70, ['#9ad16a', '#3f7d20']);
    blobs(ctx, S / 2, S / 2, 6, 40, ['#e74c3c', '#9b1d10']);
    blobs(ctx, S / 2, S / 2, 8, 50, ['#f7e6b5', '#d6b56a']);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(S * 0.1, S * 0.78, S * 0.8, S * 0.16);
    ctx.fillStyle = '#2d5016';
    ctx.textAlign = 'center';
    fitText(ctx, p.name, S / 2, S * 0.87, S * 0.75, 28, '900', JP);
  } else if (kind === 'icecup') {
    ctx.fillStyle = p.colors[0];
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = p.colors[1];
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.4, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, 'VANILLA', S / 2, S / 2 - 10, S * 0.6, 40, '900', JP);
    fitText(ctx, p.name, S / 2, S / 2 + 30, S * 0.6, 22, '700', JP);
  } else {
    // bread bag seen from above: printed band + the bun through a window
    ctx.fillStyle = '#f7f1e3';
    ctx.fillRect(0, 0, S, S);
    const isMelon = p.id === 'melonpan';
    const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.45);
    g.addColorStop(0, isMelon ? '#f6e3a0' : '#c47a3a');
    g.addColorStop(1, isMelon ? '#d9b35c' : '#8a4a1a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.42, 0, 7);
    ctx.fill();
    if (isMelon) {
      ctx.strokeStyle = 'rgba(150,110,40,0.5)';
      ctx.lineWidth = 3;
      for (let i = -S; i < S * 2; i += 30) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + S, S);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i + S, 0);
        ctx.lineTo(i, S);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#2b1606';
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, 12, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = p.colors[0];
    ctx.fillRect(0, S * 0.72, S, S * 0.28);
    ctx.fillStyle = p.colors[2];
    ctx.textAlign = 'center';
    fitText(ctx, p.name, S / 2, S * 0.9, S * 0.9, 30, '900', JP);
  }
  return c;
}

function drawMagazine(p: ProductDef): HTMLCanvasElement {
  const W = 256;
  const H = 340;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = p.id === 'manga' ? '#fff8d6' : '#f3f3f3';
  ctx.fillRect(0, 0, W, H);
  // abstract cover "photo"
  const g = ctx.createLinearGradient(0, 60, W, H);
  g.addColorStop(0, p.id === 'manga' ? '#ffcf33' : '#8ec5fc');
  g.addColorStop(1, p.id === 'manga' ? '#ff7043' : '#e0c3fc');
  ctx.fillStyle = g;
  ctx.fillRect(10, 70, W - 20, H - 90);
  if (p.id === 'manga') {
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 4;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2, H * 0.55);
      const a = (i / 18) * Math.PI * 2;
      ctx.lineTo(W / 2 + Math.cos(a) * 200, H * 0.55 + Math.sin(a) * 200);
      ctx.stroke();
    }
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.52, 46, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(W / 2 - 16, H * 0.5, 9, 0, 7);
    ctx.arc(W / 2 + 16, H * 0.5, 9, 0, 7);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(40,40,60,0.8)';
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.6, 60, 90, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.36, 34, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = p.colors[0];
  ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = p.colors[1];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, p.name, W / 2, 34, W - 16, 40, '900', JP);
  ctx.fillStyle = '#d50000';
  ctx.textAlign = 'left';
  for (let i = 0; i < 4; i++) fitText(ctx, ['独占スクープ!', '最新号', '特大付録', '夏の新作'][i], 16, 110 + i * 46, 110, 22, '900', JP);
  barcode(ctx, W - 70, H - 50, 56, 36);
  return c;
}

function drawCanWrap(p: ProductDef): HTMLCanvasElement {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const [bg, accent, text] = p.colors;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (let r = 0; r < 2; r++) {
    const ox = r * (W / 2);
    ctx.fillStyle = accent;
    ctx.fillRect(ox + 20, H * 0.18, W / 2 - 40, H * 0.08);
    ctx.fillRect(ox + 20, H * 0.76, W / 2 - 40, H * 0.05);
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, p.brand, ox + W / 4, H * 0.45, W / 2 - 40, 70, '900', JP);
    fitText(ctx, p.name, ox + W / 4, H * 0.64, W / 2 - 40, 26, '700', JP);
  }
  if (p.age) {
    ctx.fillStyle = '#fff';
    ctx.font = `700 14px ${JP}`;
    ctx.fillText('お酒', W * 0.95, H * 0.1);
  }
  return c;
}

function drawBagFront(p: ProductDef, W = 256, H = 360): HTMLCanvasElement {
  const [c, ctx] = canvas(W, H);
  const [bg, accent, text] = p.colors;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, bg);
  g.addColorStop(1, shade(bg, -30));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  stripes(ctx, W, H, '#ffffff');
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.12);
  ctx.lineTo(W, H * 0.06);
  ctx.lineTo(W, H * 0.34);
  ctx.lineTo(0, H * 0.4);
  ctx.fill();
  ctx.fillStyle = contrast(accent);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, p.brand, W / 2, H * 0.23, W * 0.86, H * 0.12, '900', JP);
  // product photo-ish blob
  if (p.shape === 'bag') {
    blobs(ctx, W / 2, H * 0.62, 12, W * 0.25, p.id === 'senbei' ? ['#a0612b', '#5c2e0c'] : ['#f9df8c', '#d9a53c']);
  } else {
    blobs(ctx, W / 2, H * 0.6, 10, W * 0.22, ['#ff9ec4', '#e0457b']);
    blobs(ctx, W / 2, H * 0.6, 6, W * 0.2, ['#fff59d', '#fbc02d']);
  }
  ctx.fillStyle = text;
  ctx.fillStyle = contrast(bg);
  fitText(ctx, p.name.replace(p.brand, '').trim() || p.name, W / 2, H * 0.9, W * 0.88, H * 0.07, '900', JP);
  return c;
}

function drawBoxFront(p: ProductDef, W = 384, H = 256): HTMLCanvasElement {
  const [c, ctx] = canvas(W, H);
  const [bg, accent] = p.colors;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  ctx.fillStyle = contrast(bg);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, p.brand, W / 2, H * 0.3, W * 0.85, H * 0.34, '900', JP);
  ctx.fillStyle = contrast(accent);
  fitText(ctx, p.name, W / 2, H * 0.8, W * 0.88, H * 0.16, '700', JP);
  return c;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

// ------------------------------------------------------------------ geometry helpers

function boxGeo(w: number, h: number, d: number, segs = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, segs, segs, 1);
  g.translate(0, h / 2, 0);
  return g;
}

/** Pillow-bag deformation of a subdivided box (chips bags etc.). */
function bagGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 8, 10, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    const y = p.getY(i) / (h / 2);
    const z = p.getZ(i);
    const bulge = (1 - x * x) * (1 - Math.pow(Math.abs(y), 3));
    p.setZ(i, Math.sign(z || 1) * (d * 0.12 + (d * 0.5 - d * 0.12) * Math.max(0, bulge)));
    // crimped ends: flatten near top/bottom
    if (Math.abs(y) > 0.9) p.setZ(i, z * 0.15);
  }
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  return g;
}

/** PET bottle: lathe profile with groups [body, label, cap]. */
function petGeo(): THREE.BufferGeometry {
  const [w] = SHAPE_SIZE.pet;
  const r = w / 2;
  const prof: [number, number][] = [
    [0, 0], [r * 0.82, 0], [r * 0.95, 0.006], [r, 0.02], [r, 0.07], [r * 0.93, 0.08], [r, 0.09], [r, 0.155],
    [r * 0.9, 0.172], [r * 0.55, 0.19], [r * 0.4, 0.198], [r * 0.4, 0.2],
  ];
  const body = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const label = new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.062, 14, 1, true);
  label.translate(0, 0.123, 0);
  const cap = new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.018, 10);
  cap.translate(0, 0.207, 0);
  const merged = mergeGeometries([body, label, cap], true)!;
  return merged;
}

function canGeo(slim: boolean): THREE.BufferGeometry {
  const [w, h] = slim ? SHAPE_SIZE.slimcan : SHAPE_SIZE.can;
  const r = w / 2;
  const side = new THREE.CylinderGeometry(r, r, h * 0.86, 16, 1, true);
  side.translate(0, h * 0.5, 0);
  const prof: [number, number][] = [[0, h * 0.965], [r * 0.82, h * 0.965], [r * 0.86, h], [r * 0.9, h * 0.975], [r, h * 0.93], [r, h * 0.93]];
  const top = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 16);
  const botProf: [number, number][] = [[r, h * 0.07], [r * 0.85, h * 0.01], [r * 0.7, 0], [0, 0.006]];
  const bottom = new THREE.LatheGeometry(botProf.map(([x, y]) => new THREE.Vector2(x, y)), 16);
  return mergeGeometries([side, mergeGeometries([top, bottom])!], true)!;
}

function cartonGeo(): THREE.BufferGeometry {
  const [w, h, d] = SHAPE_SIZE.carton;
  const bh = h * 0.8;
  const body = boxGeo(w, bh, d);
  // gable roof
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h - bh - 0.012);
  shape.lineTo(-w / 2, 0);
  const roof = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  roof.translate(0, bh, -d / 2);
  roof.rotateY(Math.PI / 2);
  const fin = new THREE.BoxGeometry(0.004, 0.012, d);
  fin.translate(0, h - 0.006, 0);
  fin.rotateY(Math.PI / 2);
  const rest = mergeGeometries([stripGroups(roof), stripGroups(fin)])!;
  // body has 6 groups; append roof as group 6 (material index 6)
  return mergeWithGroups([body], rest);
}

/** Onigiri: extruded rounded triangle, UVs projected from the front. */
function onigiriGeo(): THREE.BufferGeometry {
  const [w, h, d] = SHAPE_SIZE.onigiri;
  const s = new THREE.Shape();
  const rr = 0.018;
  const pts = [new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)];
  s.moveTo(pts[0].x + rr, pts[0].y);
  for (let i = 0; i < 3; i++) {
    const a = pts[(i + 1) % 3];
    const b = pts[(i + 2) % 3];
    const dirIn = a.clone().sub(pts[i]).normalize();
    const dirOut = b.clone().sub(a).normalize();
    s.lineTo(a.x - dirIn.x * rr, a.y - dirIn.y * rr);
    s.quadraticCurveTo(a.x, a.y, a.x + dirOut.x * rr, a.y + dirOut.y * rr);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(d - 0.012) / 2);
  projectUV(g, w, h);
  return stripGroups(g);
}

function sandwichGeo(): THREE.BufferGeometry {
  const [w, h, d] = SHAPE_SIZE.sandwich;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, h);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 });
  g.translate(0, 0, -d / 2);
  projectUV(g, w, h);
  return stripGroups(g);
}

function projectUV(g: THREE.BufferGeometry, w: number, h: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / w + 0.5;
    uv[i * 2 + 1] = p.getY(i) / h;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function stripGroups(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.clearGroups();
  return g.index ? g.toNonIndexed() : g;
}

function mergeWithGroups(first: THREE.BufferGeometry[], extra: THREE.BufferGeometry): THREE.BufferGeometry {
  const base = first[0].index ? first[0].toNonIndexed() : first[0];
  const groups = first[0].groups.map((gr) => ({ ...gr }));
  const ex = extra.index ? extra.toNonIndexed() : extra;
  const merged = mergeGeometries([stripGroups(base.clone()), ex])!;
  merged.clearGroups();
  for (const gr of groups) merged.addGroup(gr.start, gr.count, gr.materialIndex);
  merged.addGroup(base.attributes.position.count, ex.attributes.position.count, groups.length);
  return merged;
}

function cylGeo(rTop: number, rBot: number, h: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 18, 1, false);
  g.translate(0, h / 2, 0);
  return g;
}

// ------------------------------------------------------------------ hot snacks

function hotGeo(shape: ProductDef['shape']): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stick = () => {
    const s = new THREE.CylinderGeometry(0.003, 0.003, 0.07, 6);
    s.translate(0, 0.035, 0);
    return s;
  };
  if (shape === 'karaage') {
    parts.push(stick());
    for (let i = 0; i < 3; i++) {
      const b = new THREE.IcosahedronGeometry(0.02, 2);
      jitter(b, 0.004);
      b.translate(0, 0.06 + i * 0.034, 0);
      parts.push(b);
    }
  } else if (shape === 'americandog') {
    parts.push(stick());
    const c = new THREE.CapsuleGeometry(0.02, 0.09, 6, 12);
    jitter(c, 0.002);
    c.translate(0, 0.12, 0);
    parts.push(c);
  } else if (shape === 'chicken') {
    const b = new THREE.SphereGeometry(0.045, 16, 10);
    b.scale(1.1, 0.35, 0.85);
    jitter(b, 0.006);
    b.translate(0, 0.014, 0);
    parts.push(b);
  } else {
    const b = new THREE.SphereGeometry(0.04, 16, 10);
    b.scale(1, 0.33, 0.78);
    jitter(b, 0.003);
    b.translate(0, 0.012, 0);
    parts.push(b);
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { p.deleteAttribute('uv'); return p; }))!;
}

function jitter(g: THREE.BufferGeometry, amt: number) {
  const m = mergeVertices(g);
  const p = m.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rand() - 0.5) * amt, p.getY(i) + (rand() - 0.5) * amt, p.getZ(i) + (rand() - 0.5) * amt);
  m.computeVertexNormals();
  g.copy(m);
}

// ------------------------------------------------------------------ builder


function build(p: ProductDef): ProductVisual {
  const [w, h, d] = SHAPE_SIZE[p.shape];
  const size = new THREE.Vector3(w, h, d);
  const label = (W = 512, H = 256, o: { wrap?: boolean; small?: boolean } = {}) =>
    mat({ map: ctex(drawLabel(p, W, H, o)), roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const plain = (col: string, rough = 0.5) => mat({ color: col, roughness: rough });

  switch (p.shape) {
    case 'pet': {
      const liquid = LIQUID[p.id] ?? '#ddd';
      const body = mat({ color: liquid, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, transmission: 0, sheen: 0.2 });
      const cap = plain(p.colors[1], 0.35);
      return { geometry: petGeo(), materials: [body, label(512, 160, { wrap: true, small: true }), cap], size };
    }
    case 'can':
    case 'slimcan': {
      const side = mat({ map: ctex(drawCanWrap(p)), metalness: 0.55, roughness: 0.28, clearcoat: 0.8 });
      const metal = mat({ color: '#d7d9dc', metalness: 1, roughness: 0.25 });
      return { geometry: canGeo(p.shape === 'slimcan'), materials: [side, metal], size };
    }
    case 'carton': {
      const front = mat({ map: ctex(drawLabel(p, 256, 512)), roughness: 0.6 });
      const white = plain('#f4f4f4', 0.7);
      return { geometry: cartonGeo(), materials: [front, front, white, white, front, front, white], size };
    }
    case 'onigiri':
      return { geometry: onigiriGeo(), materials: [mat({ map: ctex(drawOnigiri(p)), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 })], size };
    case 'sandwich':
      return { geometry: sandwichGeo(), materials: [mat({ map: ctex(drawSandwichFront()), roughness: 0.2, clearcoat: 1 })], size };
    case 'bento': {
      const top = mat({ map: ctex(drawBentoTop(p)), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
      const side = plain('#141414', 0.4);
      return { geometry: boxGeo(w, h, d), materials: [side, side, top, side, side, side], size };
    }
    case 'salad':
    case 'pudding':
    case 'icecup': {
      const top = mat({ map: ctex(drawFoodTop(p.shape === 'salad' ? 'salad' : p.shape === 'pudding' ? 'pudding' : 'icecup', p)), roughness: 0.2, clearcoat: 0.8 });
      const side = p.shape === 'salad' ? mat({ color: '#dff0d0', roughness: 0.1, clearcoat: 1 }) : mat({ map: ctex(drawLabel(p, 512, 128, { wrap: true, small: true })), roughness: 0.4 });
      const r = w / 2;
      return { geometry: cylGeo(r, r * 0.86, h), materials: [side, top, plain('#ddd')], size };
    }
    case 'cup': {
      const side = mat({ map: ctex(drawCanWrap(p)), roughness: 0.5 });
      const top = mat({ map: ctex(drawCupTop(p)), roughness: 0.3, metalness: 0.2 });
      return { geometry: cylGeo(w / 2, w * 0.36, h), materials: [side, top, plain('#eee')], size };
    }
    case 'bag':
    case 'smallbag': {
      const front = mat({ map: ctex(drawBagFront(p)), roughness: 0.22, metalness: 0.35, clearcoat: 0.5 });
      const sideM = mat({ color: p.colors[0], roughness: 0.25, metalness: 0.4 });
      return { geometry: bagGeo(w, h, d), materials: [sideM, sideM, sideM, sideM, front, front], size };
    }
    case 'flatbox': {
      const top = mat({ map: ctex(drawBoxFront(p, 384, 288)), roughness: 0.35 });
      const front = mat({ map: ctex(drawBoxFront(p, 384, 108)), roughness: 0.35 });
      const side = plain(p.colors[1]);
      return { geometry: boxGeo(w, h, d), materials: [side, side, top, side, front, front], size };
    }
    case 'box':
    case 'tissue':
    case 'pack': {
      const front = mat({ map: ctex(p.shape === 'pack' ? drawBagFront(p, 220, 340) : drawBoxFront(p)), roughness: 0.35, clearcoat: p.shape === 'pack' ? 0.8 : 0 });
      const side = plain(p.colors[0]);
      return { geometry: boxGeo(w, h, d), materials: [side, side, side, side, front, side], size };
    }
    case 'bread': {
      const top = mat({ map: ctex(drawFoodTop('bread', p)), roughness: 0.2, clearcoat: 1 });
      const side = mat({ color: '#f1e8d5', roughness: 0.2, clearcoat: 1 });
      const g = bagGeo(w, d, h); // lying pillow: rotate so the printed face is up
      g.translate(0, -d / 2, 0);
      g.rotateX(-Math.PI / 2);
      g.translate(0, h / 2, 0);
      return { geometry: g, materials: [side, side, side, side, top, top], size };
    }
    case 'magazine': {
      const cover = mat({ map: ctex(drawMagazine(p)), roughness: 0.3, clearcoat: 0.4 });
      const pages = plain('#eeeae0', 0.9);
      return { geometry: boxGeo(w, h, d), materials: [pages, pages, cover, pages, pages, pages], size };
    }
    case 'icebar': {
      const top = mat({ map: ctex(drawBoxFront(p, 128, 320)), roughness: 0.2, clearcoat: 1 });
      const side = mat({ color: p.colors[0], roughness: 0.2 });
      const g = boxGeo(w, h, d);
      return { geometry: g, materials: [side, side, top, side, side, side], size };
    }
    case 'karaage':
    case 'chicken':
    case 'croquette':
    case 'americandog': {
      const crust = friedCrust(p.colors[0]);
      const m = mat({ map: crust.map, normalMap: crust.normalMap, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5 });
      m.map!.repeat.set(0.3, 0.3);
      const geo = hotGeo(p.shape);
      // spherical-ish UVs for the crust
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2) + 0.5;
        uv[i * 2 + 1] = pos.getY(i) * 6;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      return { geometry: geo, materials: [m], size };
    }
  }
}

export function productVisual(p: ProductDef): ProductVisual {
  let v = cache.get(p.id);
  if (!v) {
    v = build(p);
    v.geometry.computeBoundingBox();
    v.geometry.computeBoundingSphere();
    cache.set(p.id, v);
  }
  return v;
}

export function productMesh(p: ProductDef): THREE.Mesh {
  const v = productVisual(p);
  const m = new THREE.Mesh(v.geometry, v.materials.length === 1 ? v.materials[0] : v.materials);
  m.castShadow = true;
  return m;
}

/** Make sure fonts used by the canvases are ready before drawing any art. */
export async function prepareProductArt(): Promise<void> {
  const text = PRODUCTS.map((p) => p.name + p.brand).join('') + '内容量個保存方法直射日光避けてお酒歳未満飲酒法律禁止独占スクープ最新号特大付録夏新作あけかた天地無用取扱注意ミックスサンド';
  try {
    await Promise.all([
      document.fonts.load(`900 40px "Noto Sans JP"`, text),
      document.fonts.load(`700 40px "Noto Sans JP"`, text),
      document.fonts.load(`400 40px "Noto Sans JP"`, text),
      document.fonts.load(`400 40px "Dela Gothic One"`, 'まいにちマートMAINICHIMART'),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  for (const p of PRODUCTS) productVisual(p);
}
