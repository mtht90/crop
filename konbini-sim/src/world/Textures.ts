import * as THREE from 'three';

/**
 * Procedural PBR texture generation for architectural surfaces that have no
 * suitable free external asset (Japanese convenience-store vinyl tiles, system
 * ceilings, painted steel …). Every generator returns sRGB colour + linear
 * roughness / normal maps so they plug straight into MeshStandardMaterial.
 */

let seed = 1337;
export function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

export function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/** Sobel filter over a greyscale height canvas -> tangent-space normal map. */
export function heightToNormal(src: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [c, ctx] = canvas(w, h);
  const out = ctx.createImageData(w, h);
  const H = (x: number, y: number) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const n = new THREE.Vector3(-dx, dy, 1).normalize();
      const i = (y * w + x) * 4;
      out.data[i] = (n.x * 0.5 + 0.5) * 255;
      out.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      out.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], rmin: number, rmax: number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const r = rmin + rand() * (rmax - rmin);
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, r, r * (0.5 + rand() * 0.6), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface PBRSet {
  map: THREE.Texture;
  roughnessMap?: THREE.Texture;
  normalMap?: THREE.Texture;
}

/** 2x2 tiles of glossy 300mm speckled vinyl (texture covers 0.6 m). */
export function floorTiles(): PBRSet {
  const S = 1024;
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  const [rc, rctx] = canvas(S);
  const tiles = 2;
  const ts = S / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const shade = 232 + Math.floor(rand() * 10);
      ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 6})`;
      ctx.fillRect(tx * ts, ty * ts, ts, ts);
    }
  }
  speckle(ctx, S, S, 5000, ['#c9c4bb', '#b6b0a6', '#d8d2c8', '#a8a39a', '#e6e1d8'], 0.6, 2.4);
  speckle(ctx, S, S, 300, ['#8c877f', '#9b968d'], 0.8, 1.6);
  // subtle scuffs
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = '#6a655d';
    ctx.lineWidth = 1 + rand() * 3;
    ctx.beginPath();
    const x = rand() * S;
    const y = rand() * S;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rand() * 80 - 40, y + rand() * 30, x + rand() * 120 - 60, y + rand() * 20 - 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  hctx.fillStyle = '#fff';
  hctx.fillRect(0, 0, S, S);
  rctx.fillStyle = 'rgb(60,60,60)';
  rctx.fillRect(0, 0, S, S);
  for (let r = 0; r < 800; r++) {
    const g = 45 + Math.floor(rand() * 40);
    rctx.fillStyle = `rgba(${g},${g},${g},0.35)`;
    rctx.fillRect(rand() * S, rand() * S, 20 + rand() * 90, 20 + rand() * 90);
  }
  // grout lines
  for (let i = 0; i <= tiles; i++) {
    const p = i * ts;
    for (const [cx, col] of [[ctx, '#a39e95'], [hctx, '#000'], [rctx, '#b4b4b4']] as const) {
      cx.fillStyle = col;
      cx.fillRect(p - 2, 0, 4, S);
      cx.fillRect(0, p - 2, S, 4);
    }
  }
  return { map: tex(c, true), roughnessMap: tex(rc, false), normalMap: tex(heightToNormal(hc, 3), false) };
}

/** 600mm mineral-fibre ceiling panels with pinholes. */
export function ceilingTiles(): PBRSet {
  const S = 512;
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  ctx.fillStyle = '#f1f0ec';
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#bbb';
  hctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.fillStyle = `rgba(120,118,110,${0.1 + rand() * 0.25})`;
    ctx.fillRect(x, y, 1.4, 1.4);
    hctx.fillStyle = '#000';
    hctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.fillStyle = '#d9d8d2';
  ctx.fillRect(0, 0, S, 6);
  ctx.fillRect(0, 0, 6, S);
  hctx.fillStyle = '#fff';
  hctx.fillRect(0, 0, S, 6);
  hctx.fillRect(0, 0, 6, S);
  return { map: tex(c, true), normalMap: tex(heightToNormal(hc, 1.2), false) };
}

/** Slightly uneven white emulsion wall. */
export function paintedWall(base = '#efede8'): PBRSet {
  const S = 512;
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) {
    const v = Math.floor(rand() * 255);
    hctx.fillStyle = `rgba(${v},${v},${v},0.25)`;
    hctx.beginPath();
    hctx.arc(rand() * S, rand() * S, 1 + rand() * 3, 0, 7);
    hctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.02})`;
    ctx.fillRect(rand() * S, rand() * S, 8, 8);
  }
  return { map: tex(c, true), normalMap: tex(heightToNormal(hc, 0.6), false) };
}

/** Brushed stainless steel (for counter kick plates, fryer, fridge trims). */
export function brushedMetal(): PBRSet {
  const S = 512;
  const [c, ctx] = canvas(S);
  const [rc, rctx] = canvas(S);
  ctx.fillStyle = '#b9bcc0';
  ctx.fillRect(0, 0, S, S);
  rctx.fillStyle = 'rgb(90,90,90)';
  rctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2500; i++) {
    const y = rand() * S;
    const v = 150 + Math.floor(rand() * 80);
    ctx.strokeStyle = `rgba(${v},${v},${v + 4},0.25)`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y + rand() * 2 - 1);
    ctx.stroke();
    const r = 60 + Math.floor(rand() * 70);
    rctx.strokeStyle = `rgba(${r},${r},${r},0.3)`;
    rctx.beginPath();
    rctx.moveTo(0, y);
    rctx.lineTo(S, y);
    rctx.stroke();
  }
  return { map: tex(c, true), roughnessMap: tex(rc, false) };
}

/** Light oak laminate for the counter top & backroom desk. */
export function woodLaminate(): PBRSet {
  const W = 1024;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const [hc, hctx] = canvas(W, H);
  ctx.fillStyle = '#c8a276';
  ctx.fillRect(0, 0, W, H);
  hctx.fillStyle = '#888';
  hctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const y = rand() * H;
    const amp = 2 + rand() * 6;
    const f = 0.004 + rand() * 0.01;
    const ph = rand() * 10;
    const col = rand() < 0.5 ? 'rgba(120,80,40,0.18)' : 'rgba(230,200,160,0.15)';
    ctx.strokeStyle = col;
    hctx.strokeStyle = rand() < 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = hctx.lineWidth = 0.5 + rand() * 2;
    ctx.beginPath();
    hctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const yy = y + Math.sin(x * f + ph) * amp;
      if (x === 0) {
        ctx.moveTo(x, yy);
        hctx.moveTo(x, yy);
      } else {
        ctx.lineTo(x, yy);
        hctx.lineTo(x, yy);
      }
    }
    ctx.stroke();
    hctx.stroke();
  }
  const t = tex(c, true);
  const n = tex(heightToNormal(hc, 0.8), false);
  return { map: t, normalMap: n };
}

/** Dark rubber mat / generic dark plastic grain. */
export function plasticGrain(base: string): PBRSet {
  const S = 256;
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    const v = Math.floor(rand() * 255);
    hctx.fillStyle = `rgba(${v},${v},${v},0.4)`;
    hctx.fillRect(rand() * S, rand() * S, 1.5, 1.5);
  }
  return { map: tex(c, true), normalMap: tex(heightToNormal(hc, 0.5), false) };
}

/** Kraft cardboard for shipping boxes. */
export function cardboard(label: string, sub: string, accent: string): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#b98d5a';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(${90 + rand() * 60},${60 + rand() * 40},${30 + rand() * 20},0.15)`;
    ctx.fillRect(rand() * S, rand() * S, 2 + rand() * 6, 1);
  }
  // corrugation hint
  ctx.globalAlpha = 0.05;
  for (let x = 0; x < S; x += 6) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, 0, 2, S);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent;
  ctx.fillRect(30, 40, S - 60, 110);
  ctx.fillStyle = '#fff';
  ctx.font = '900 64px "Noto Sans JP", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, label, S / 2, 96, S - 90, 64, '900');
  ctx.fillStyle = '#3b2a16';
  ctx.font = '700 38px "Noto Sans JP", sans-serif';
  fitText(ctx, sub, S / 2, 220, S - 60, 38, '700');
  ctx.font = '700 28px "Noto Sans JP", sans-serif';
  ctx.fillText('↑ 天地無用  取扱注意', S / 2, 300);
  // barcode
  ctx.fillStyle = '#1b1208';
  for (let x = 140; x < 372; x += 3) if (rand() > 0.45) ctx.fillRect(x, 360, rand() < 0.3 ? 3 : 1.5, 80);
  // tape
  ctx.fillStyle = 'rgba(220,190,140,0.55)';
  ctx.fillRect(S / 2 - 40, 0, 80, 30);
  return tex(c, true);
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, weight: string, family = '"Noto Sans JP", sans-serif') {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 8) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  ctx.fillText(text, x, y);
}

/** Golden fried batter used by the hot snacks. */
export function friedCrust(base: string): PBRSet {
  const S = 256;
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = '#777';
  hctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1600; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 1 + rand() * 5;
    const d = rand();
    ctx.fillStyle = d < 0.5 ? 'rgba(120,60,10,0.35)' : 'rgba(255,215,140,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
    const v = Math.floor(d * 255);
    hctx.fillStyle = `rgba(${v},${v},${v},0.7)`;
    hctx.beginPath();
    hctx.arc(x, y, r, 0, 7);
    hctx.fill();
  }
  return { map: tex(c, true), normalMap: tex(heightToNormal(hc, 3), false) };
}

/** Dirty puddle / spill decal (alpha). */
export function dirtDecal(kind: 'mud' | 'spill' | 'vomit'): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const col = kind === 'mud' ? [70, 52, 34] : kind === 'spill' ? [150, 110, 40] : [170, 160, 70];
  for (let i = 0; i < (kind === 'mud' ? 26 : 14); i++) {
    const x = S / 2 + (rand() - 0.5) * S * 0.55;
    const y = S / 2 + (rand() - 0.5) * S * 0.55;
    const r = 12 + rand() * 38;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.55)`);
    g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  }
  if (kind === 'mud') {
    // shoe prints
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(50,35,20,0.35)';
      ctx.beginPath();
      ctx.ellipse(40 + i * 40, 120 + (i % 2) * 30, 10, 24, 0.1, 0, 7);
      ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Radial blob used as a cheap contact shadow under characters. */
export function blobShadow(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
