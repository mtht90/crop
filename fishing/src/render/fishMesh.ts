import * as THREE from 'three';
import type { BodyType, ColorVariant, Palette, PatternDef, PatternVariant, Species } from '../data/types';
import { Rng } from '../sim/rng';

/**
 * 魚のモデルは「体型ベース（パラメータで生成）＋色・模様テクスチャ」で作る。
 * 体型ごとに外部モデルへ差し替える場合は buildFishObject の戻り値を置き換えればよい。
 * 座標系：+X が頭、全長 1（x: +0.5 頭 〜 -0.5 尾）。
 */
export interface BodyParams {
  height: number;
  width: number;
  /** 最も体高が高い位置（頭から 0..1） */
  hump: number;
  /** 尾の付け根の太さ（最大体高比） */
  peduncle: number;
  /** 吻の尖り（小さいほど丸い） */
  snout: number;
  tailFork: number;
  tailSize: number;
  dorsal: 'spiny' | 'single' | 'long' | 'tiny' | 'full';
  anal: 'short' | 'long' | 'full';
  barbels: number;
  barbelLen: number;
  adipose: boolean;
  flatHead: boolean;
  heterocercal: boolean;
  scaled: boolean;
}

const BASE: BodyParams = {
  height: 0.26,
  width: 0.13,
  hump: 0.38,
  peduncle: 0.3,
  snout: 0.8,
  tailFork: 0.25,
  tailSize: 0.2,
  dorsal: 'single',
  anal: 'short',
  barbels: 0,
  barbelLen: 0,
  adipose: false,
  flatHead: false,
  heterocercal: false,
  scaled: true,
};

export const BODY_PRESETS: Record<BodyType, BodyParams> = {
  fusiform: { ...BASE, height: 0.27, width: 0.14, dorsal: 'spiny', tailFork: 0.2 },
  deep: { ...BASE, height: 0.46, width: 0.11, hump: 0.42, peduncle: 0.22, snout: 0.7, dorsal: 'long', anal: 'long', tailFork: 0.3, tailSize: 0.18 },
  slender: { ...BASE, height: 0.2, width: 0.1, hump: 0.42, peduncle: 0.32, snout: 0.9, tailFork: 0.55, tailSize: 0.21 },
  elongated: { ...BASE, height: 0.17, width: 0.13, hump: 0.32, peduncle: 0.75, snout: 0.75, tailFork: 0, tailSize: 0.14, dorsal: 'full', anal: 'full' },
  catfish: { ...BASE, height: 0.17, width: 0.19, hump: 0.25, peduncle: 0.45, snout: 0.45, tailFork: 0.05, tailSize: 0.13, dorsal: 'tiny', anal: 'full', barbels: 2, barbelLen: 0.32, flatHead: true, scaled: false },
  carp: { ...BASE, height: 0.31, width: 0.15, hump: 0.4, peduncle: 0.34, snout: 0.7, dorsal: 'long', tailFork: 0.35, barbels: 2, barbelLen: 0.06 },
  trout: { ...BASE, height: 0.23, width: 0.12, hump: 0.42, peduncle: 0.36, snout: 0.85, tailFork: 0.1, adipose: true },
  ancient: { ...BASE, height: 0.17, width: 0.17, hump: 0.33, peduncle: 0.28, snout: 1.7, tailFork: 0.5, tailSize: 0.24, dorsal: 'tiny', barbels: 2, barbelLen: 0.05, heterocercal: true, scaled: false },
};

const BODY_FRONT = 0.5;
const BODY_BACK = -0.3;
const BODY_LEN = BODY_FRONT - BODY_BACK;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 頭からの位置 t (0..1) における体高・体幅（半分） */
export function profile(p: BodyParams, t: number): { h: number; w: number } {
  let h: number;
  let w: number;
  if (t < p.hump) {
    const k = Math.sin((t / p.hump) * Math.PI * 0.5);
    h = p.height * 0.5 * Math.pow(k, p.snout);
    w = p.width * 0.5 * Math.pow(k, p.flatHead ? 0.35 : p.snout * 0.9);
    if (p.flatHead) {
      h *= 0.82;
      w *= 1 + 0.25 * (1 - t / p.hump);
    }
  } else {
    const k = smooth((t - p.hump) / (1 - p.hump));
    h = p.height * 0.5 * (1 + (p.peduncle - 1) * k);
    w = p.width * 0.5 * (1 + (Math.max(p.peduncle, 0.3) * 0.6 - 1) * k);
  }
  return { h: Math.max(h, 0.002), w: Math.max(w, 0.002) };
}

function xOf(t: number): number {
  return BODY_FRONT - t * BODY_LEN;
}

function buildBody(p: BodyParams): THREE.BufferGeometry {
  const N = 48;
  const M = 28;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const { h, w } = profile(p, t);
    const x = xOf(t);
    for (let j = 0; j <= M; j++) {
      const th = (j / M) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      // 下半分（腹）は少しふくらませ、断面はやや角ばらせる
      const hy = c < 0 ? h * 1.05 : h;
      const se = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.85);
      pos.push(x, se(c) * hy, se(s) * w);
      uv.push(t, j / M);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + M + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function shapeGeo(points: [number, number][], uvScale = 1): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(shape, 8);
  // フィンのUV：外形のバウンディングボックス基準
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, ((pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x || 1)) * uvScale, (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1));
  }
  return g;
}

function topAt(p: BodyParams, x: number): number {
  const t = (BODY_FRONT - x) / BODY_LEN;
  return profile(p, Math.max(0, Math.min(1, t))).h;
}

function finAlongBack(p: BodyParams, t0: number, t1: number, height: number, sign: 1 | -1, shapeKind: 'tri' | 'rect' | 'spiny'): THREE.BufferGeometry {
  const pts: [number, number][] = [];
  const n = 10;
  const x0 = xOf(t0);
  const x1 = xOf(t1);
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push([x, sign * (topAt(p, x) * 0.92)]);
  }
  for (let i = n; i >= 0; i--) {
    const k = i / n;
    const x = x0 + (x1 - x0) * k;
    let fh: number;
    if (shapeKind === 'tri') fh = height * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k * 0.55);
    else if (shapeKind === 'spiny') fh = height * (k < 0.45 ? 0.75 + 0.25 * Math.sin((k / 0.45) * Math.PI) - (k > 0.35 ? 0.35 : 0) : 0.85 - 0.45 * ((k - 0.45) / 0.55));
    else fh = height * (0.6 + 0.4 * Math.sin(k * Math.PI));
    pts.push([x - height * 0.25 * k, sign * (topAt(p, x) * 0.92 + Math.max(fh, 0.003))]);
  }
  return shapeGeo(pts);
}

function tailFin(p: BodyParams): THREE.BufferGeometry {
  const x0 = BODY_BACK + 0.02;
  const ped = profile(p, 1).h;
  const len = p.tailSize;
  const span = Math.max(p.height * 0.42, 0.09);
  const xt = x0 - len;
  const notch = x0 - len * (1 - p.tailFork * 0.85);
  const pts: [number, number][] = [];
  if (p.heterocercal) {
    pts.push([x0, ped], [xt - len * 0.4, span * 1.1], [xt + len * 0.1, span * 0.7], [notch, 0], [xt + len * 0.3, -span * 0.55], [x0, -ped]);
  } else if (p.tailFork < 0.08) {
    // 丸い尾：付け根から扇形に広がる
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI;
      pts.push([x0 - len * 0.15 - Math.cos(a) * len * 0.85, Math.sin(a) * span * 0.75]);
    }
    pts.unshift([x0, -ped]);
    pts.push([x0, ped]);
  } else {
    pts.push([x0, ped], [xt, span], [xt + len * 0.12, span * 0.85], [notch, 0], [xt + len * 0.12, -span * 0.85], [xt, -span], [x0, -ped]);
  }
  return shapeGeo(pts);
}

function sideFin(len: number, wid: number): THREE.BufferGeometry {
  return shapeGeo([
    [0, 0],
    [-len * 0.7, wid * 0.5],
    [-len, wid * 0.1],
    [-len * 0.8, -wid * 0.3],
    [-len * 0.1, -wid * 0.15],
  ]);
}

function buildFins(p: BodyParams): THREE.BufferGeometry[] {
  const fins: THREE.BufferGeometry[] = [tailFin(p)];
  const H = p.height;
  switch (p.dorsal) {
    case 'spiny':
      fins.push(finAlongBack(p, 0.3, 0.75, H * 0.38, 1, 'spiny'));
      break;
    case 'single':
      fins.push(finAlongBack(p, 0.36, 0.56, H * 0.45, 1, 'tri'));
      break;
    case 'long':
      fins.push(finAlongBack(p, 0.34, 0.78, H * 0.3, 1, 'rect'));
      break;
    case 'tiny':
      fins.push(finAlongBack(p, 0.3, 0.38, H * 0.35, 1, 'tri'));
      break;
    case 'full':
      fins.push(finAlongBack(p, 0.25, 0.97, H * 0.28, 1, 'rect'));
      break;
  }
  if (p.adipose) fins.push(finAlongBack(p, 0.82, 0.88, H * 0.14, 1, 'tri'));
  if (p.anal === 'short') fins.push(finAlongBack(p, 0.66, 0.8, H * 0.32, -1, 'tri'));
  else if (p.anal === 'long') fins.push(finAlongBack(p, 0.52, 0.82, H * 0.26, -1, 'rect'));
  else fins.push(finAlongBack(p, 0.45, 0.97, H * 0.24, -1, 'rect'));

  // 胸ビレ・腹ビレ（左右）
  const tPec = 0.24;
  const pr = profile(p, tPec);
  const tPel = 0.46;
  const pl = profile(p, tPel);
  for (const side of [-1, 1]) {
    const pec = sideFin(H * 0.55, H * 0.28);
    pec.applyMatrix4(new THREE.Matrix4().makeRotationX(side * 1.25).premultiply(new THREE.Matrix4().makeRotationY(side * 0.5)));
    pec.translate(xOf(tPec), -pr.h * 0.35, side * pr.w * 0.85);
    fins.push(pec);
    const pel = sideFin(H * 0.4, H * 0.2);
    pel.applyMatrix4(new THREE.Matrix4().makeRotationX(side * 0.5 + Math.PI));
    pel.translate(xOf(tPel), -pl.h * 0.85, side * pl.w * 0.45);
    fins.push(pel);
  }
  return fins;
}

function buildBarbels(p: BodyParams): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  if (!p.barbels) return out;
  const head = profile(p, 0.04);
  for (let i = 0; i < p.barbels; i++) {
    for (const side of [-1, 1]) {
      const L = p.barbelLen * (i === 0 ? 1 : 0.5);
      const start = new THREE.Vector3(xOf(0.03 + i * 0.02), -head.h * 0.3 - i * 0.01, side * head.w * 0.9);
      const curve = new THREE.CatmullRomCurve3([
        start,
        start.clone().add(new THREE.Vector3(-L * 0.25, -L * 0.15, side * L * 0.35)),
        start.clone().add(new THREE.Vector3(-L * 0.7, -L * 0.3, side * L * 0.55)),
      ]);
      out.push(new THREE.TubeGeometry(curve, 8, 0.004 + p.barbelLen * 0.01, 5));
    }
  }
  return out;
}

// ---------------- テクスチャ ----------------

export interface FishLook {
  palette: Palette;
  pattern: PatternDef;
  metallic: number;
  albino: boolean;
}

export function lookOf(s: Species, colorId: string | null, patternId: string | null): FishLook {
  const color: ColorVariant | undefined = s.colors.find((c) => c.id === colorId);
  const pat: PatternVariant | undefined = s.patterns.find((c) => c.id === patternId);
  const palette = { ...s.palette, ...(pat?.palette ?? {}), ...(color?.palette ?? {}) };
  return {
    palette,
    pattern: pat?.pattern ?? s.pattern,
    metallic: color?.metallic ?? 0,
    albino: !!colorId && /albino|white/.test(colorId),
  };
}

const TEX_W = 512;
const TEX_H = 256;

function paintBody(look: FishLook, body: BodyParams, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const g = cv.getContext('2d')!;
  const { palette: pal, pattern } = look;
  const grad = g.createLinearGradient(0, 0, 0, TEX_H);
  grad.addColorStop(0, pal.back);
  grad.addColorStop(0.16, pal.back);
  grad.addColorStop(0.3, pal.flank);
  grad.addColorStop(0.4, pal.flank);
  grad.addColorStop(0.5, pal.belly);
  grad.addColorStop(0.6, pal.flank);
  grad.addColorStop(0.7, pal.flank);
  grad.addColorStop(0.84, pal.back);
  grad.addColorStop(1, pal.back);
  g.fillStyle = grad;
  g.fillRect(0, 0, TEX_W, TEX_H);

  const rng = new Rng(seed);
  const intensity = pattern.intensity ?? 0.6;
  const scale = pattern.scale ?? 1;
  // 上半身の v（0..0.5 の片側）を左右両側に描く
  const both = (fn: (vTop: number, mirror: (v: number) => number) => void) => {
    fn(0, (v) => v);
    fn(1, (v) => 1 - v);
  };
  const Y = (v: number) => v * TEX_H;
  const X = (u: number) => u * TEX_W;

  g.globalAlpha = intensity;
  g.fillStyle = pal.pattern;
  switch (pattern.kind) {
    case 'lateralBand':
      both((_, m) => {
        for (let u = 0.12; u < 0.98; u += 0.012) {
          const r = 6 + rng.range(0, 6);
          g.beginPath();
          g.ellipse(X(u), Y(m(0.26 + rng.range(-0.02, 0.02))), r * 1.3, r, 0, 0, Math.PI * 2);
          g.fill();
        }
      });
      break;
    case 'bars': {
      const n = Math.round(scale);
      both((_, m) => {
        for (let i = 0; i < n; i++) {
          const u = 0.2 + (i + 0.5) * (0.72 / n);
          const grd = g.createLinearGradient(0, Y(m(0)), 0, Y(m(0.36)));
          grd.addColorStop(0, pal.pattern);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grd;
          g.fillRect(X(u) - 9, Math.min(Y(m(0)), Y(m(0.36))), 18, Math.abs(Y(m(0.36)) - Y(m(0))));
        }
      });
      if (pattern.accent) {
        g.fillStyle = pattern.accent;
        g.globalAlpha = 0.7;
        g.fillRect(X(0.05), Y(0.42), X(0.6), Y(0.16));
      }
      break;
    }
    case 'spots':
      for (let i = 0; i < scale * 18; i++) {
        const u = rng.range(0.08, 1);
        const top = rng.next() < 0.5;
        const v = Math.pow(rng.next(), 1.6) * 0.38;
        const r = rng.range(2, 5);
        const accent = pattern.accent && rng.chance(0.18);
        if (accent) {
          g.fillStyle = '#f2ece0';
          g.beginPath();
          g.arc(X(u), Y(top ? v : 1 - v), r + 2.5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = accent ? pattern.accent! : pal.pattern;
        g.beginPath();
        g.arc(X(u), Y(top ? v : 1 - v), r, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'blotches':
      for (let i = 0; i < scale * 4; i++) {
        const u = rng.range(0.12, 0.98);
        const v = rng.range(0, 0.36);
        for (const vv of [v, 1 - v]) {
          for (let k = 0; k < 5; k++) {
            g.beginPath();
            g.ellipse(X(u + rng.range(-0.02, 0.02)), Y(vv + rng.range(-0.03, 0.03)), rng.range(5, 14), rng.range(4, 10), rng.range(0, 3), 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      break;
    case 'stripes':
      both((_, m) => {
        for (const v of [0.16, 0.24, 0.32]) g.fillRect(X(0.1), Math.min(Y(m(v - 0.018)), Y(m(v + 0.018))), X(0.88), Y(0.036));
      });
      break;
    case 'nishiki':
      g.fillStyle = pattern.accent ?? pal.pattern;
      g.globalAlpha = 0.95;
      for (let i = 0; i < 5; i++) {
        const u = rng.range(0.15, 0.85);
        const w = rng.range(0.08, 0.18);
        for (let k = 0; k < 8; k++) {
          const v = rng.range(0, 0.3);
          for (const vv of [v, 1 - v]) {
            g.beginPath();
            g.ellipse(X(u + rng.range(-w, w) * 0.5), Y(vv), X(w) * 0.35, rng.range(10, 24), 0, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      break;
    case 'mirror':
      if (scale <= 4) {
        // 鏡ゴイ：背と側線に大きな鱗が並ぶ
        g.globalAlpha = intensity * 0.7;
        both((_, m) => {
          for (const [v, n] of [
            [0.04, 9],
            [0.26, 7],
          ] as const) {
            for (let i = 0; i < n; i++) {
              const u = 0.22 + (i / n) * 0.68 + rng.range(-0.01, 0.01);
              const r = rng.range(10, 17);
              g.fillStyle = '#e8c870';
              g.beginPath();
              g.ellipse(X(u), Y(m(v)), r, r * 0.9, 0, 0, Math.PI * 2);
              g.fill();
              g.strokeStyle = pal.pattern;
              g.lineWidth = 1.5;
              g.stroke();
            }
          }
        });
      }
      break;
    case 'scutes':
      g.globalAlpha = intensity;
      for (const v of [0.0, 0.24, 0.42, 0.58, 0.76, 1.0]) {
        for (let i = 0; i < 14; i++) {
          const u = 0.12 + (i / 14) * 0.84;
          const r = v === 0 || v === 1 ? 11 : 8;
          g.fillStyle = pal.pattern;
          g.beginPath();
          g.moveTo(X(u) - r, Y(v));
          g.lineTo(X(u), Y(v) - r * 0.7);
          g.lineTo(X(u) + r, Y(v));
          g.lineTo(X(u), Y(v) + r * 0.7);
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.5)';
          g.stroke();
        }
      }
      break;
    case 'none':
      break;
  }
  g.globalAlpha = 1;

  // 鱗
  if (body.scaled) {
    const sz = 9;
    g.strokeStyle = 'rgba(0,0,0,0.13)';
    g.lineWidth = 1;
    for (let y = 0; y < TEX_H + sz; y += sz * 0.75) {
      for (let x = (Math.round(y / (sz * 0.75)) % 2) * sz * 0.5 + X(0.18); x < TEX_W; x += sz) {
        g.beginPath();
        g.arc(x, y, sz * 0.55, Math.PI * 0.6, Math.PI * 1.4);
        g.stroke();
      }
    }
  }
  // 側線
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1.5;
  for (const v of [0.27, 0.73]) {
    g.beginPath();
    g.moveTo(X(0.2), Y(v + (v < 0.5 ? -0.06 : 0.06)));
    g.quadraticCurveTo(X(0.5), Y(v), X(1), Y(v));
    g.stroke();
  }
  // エラぶた
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 3;
  for (const v of [0.25, 0.75]) {
    g.beginPath();
    g.arc(X(0.12), Y(v), 34, -Math.PI * 0.45, Math.PI * 0.45);
    g.stroke();
  }
  // 口
  g.fillStyle = 'rgba(20,10,8,0.6)';
  g.fillRect(0, Y(0.2), X(0.03), 3);
  g.fillRect(0, Y(0.8), X(0.03), 3);
  return cv;
}

let finRayTex: THREE.Texture | null = null;
function finTexture(): THREE.Texture {
  if (finRayTex) return finRayTex;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x < 128; x += 7) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x - 6, 0);
    g.stroke();
  }
  finRayTex = new THREE.CanvasTexture(cv);
  finRayTex.colorSpace = THREE.SRGBColorSpace;
  return finRayTex;
}

// ---------------- 泳ぎのアニメーション（頂点シェーダで体をくねらせる） ----------------

export interface SwimUniforms {
  uTime: { value: number };
  uAmp: { value: number };
  uFreq: { value: number };
}

function addSwim(mat: THREE.Material, u: SwimUniforms): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;\nuniform float uFreq;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float tailK = clamp(0.62 - position.x, 0.0, 1.2);
        transformed.z += sin(uTime * uFreq - position.x * 7.0) * uAmp * tailK * tailK;`,
      );
  };
}

export interface FishObject {
  group: THREE.Group;
  swim: SwimUniforms;
  materials: THREE.Material[];
  dispose(): void;
}

const geoCache = new Map<BodyType, { body: THREE.BufferGeometry; fins: THREE.BufferGeometry; barbels: THREE.BufferGeometry | null; params: BodyParams }>();

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // 位置・法線・UVだけを持つ非インデックスジオメトリに揃えて結合
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of parts) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of parts) {
    const p = g.getAttribute('position');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos[(o + i) * 3] = p.getX(i);
      pos[(o + i) * 3 + 1] = p.getY(i);
      pos[(o + i) * 3 + 2] = p.getZ(i);
      uv[(o + i) * 2] = u ? u.getX(i) : 0;
      uv[(o + i) * 2 + 1] = u ? u.getY(i) : 0;
    }
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeVertexNormals();
  return out;
}

function geometryFor(type: BodyType) {
  let g = geoCache.get(type);
  if (!g) {
    const params = BODY_PRESETS[type];
    const barbels = buildBarbels(params);
    g = {
      params,
      body: buildBody(params),
      fins: mergeGeos(buildFins(params)),
      barbels: barbels.length ? mergeGeos(barbels) : null,
    };
    geoCache.set(type, g);
  }
  return g;
}

const texCache = new Map<string, THREE.Texture>();

export function bodyTexture(s: Species, colorId: string | null, patternId: string | null): THREE.Texture {
  const key = `${s.id}|${colorId}|${patternId}`;
  let t = texCache.get(key);
  if (!t) {
    const look = lookOf(s, colorId, patternId);
    t = new THREE.CanvasTexture(paintBody(look, BODY_PRESETS[s.body], s.no * 7919));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}

/** 魚の3Dオブジェクトを作る（全長1、+Xが頭）。silhouette = 図鑑の未発見表示 */
export function buildFishObject(s: Species, colorId: string | null, patternId: string | null, silhouette = false): FishObject {
  const geo = geometryFor(s.body);
  const look = lookOf(s, colorId, patternId);
  const swim: SwimUniforms = { uTime: { value: 0 }, uAmp: { value: 0.03 }, uFreq: { value: 6 } };
  const bodyMat = silhouette
    ? new THREE.MeshBasicMaterial({ color: 0x1a2430 })
    : new THREE.MeshStandardMaterial({
        map: bodyTexture(s, colorId, patternId),
        roughness: 0.38 - look.metallic * 0.2,
        metalness: 0.1 + look.metallic * 0.7,
        envMapIntensity: 1.2,
      });
  const finMat = silhouette
    ? new THREE.MeshBasicMaterial({ color: 0x1a2430, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({
        map: finTexture(),
        color: new THREE.Color(look.palette.fin),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
        roughness: 0.5,
        metalness: look.metallic * 0.6,
      });
  const eyeMat = silhouette
    ? new THREE.MeshBasicMaterial({ color: 0x1a2430 })
    : new THREE.MeshStandardMaterial({ color: look.albino ? 0xc0303a : 0x0c0c0c, roughness: 0.05, metalness: 0.2 });
  const ringMat = silhouette ? eyeMat : new THREE.MeshStandardMaterial({ color: look.albino ? 0xf0b0b0 : 0xc8a040, roughness: 0.3 });
  const mats = [bodyMat, finMat, eyeMat, ringMat];
  for (const m of mats) addSwim(m, swim);

  const group = new THREE.Group();
  const body = new THREE.Mesh(geo.body, bodyMat);
  const fins = new THREE.Mesh(geo.fins, finMat);
  group.add(body, fins);
  if (geo.barbels) group.add(new THREE.Mesh(geo.barbels, finMat));
  const pe = profile(geo.params, 0.09);
  const eyeR = Math.max(0.018, geo.params.height * 0.07);
  // 泳ぎのシェーダは頂点のローカル座標で曲げるので、目の位置はジオメトリに焼き込む
  const eyeGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const ringGeo = new THREE.SphereGeometry(eyeR, 12, 8).scale(1, 1, 0.5).translate(xOf(0.09), pe.h * 0.3, side * pe.w * 0.78);
    const pupilGeo = new THREE.SphereGeometry(eyeR * 0.62, 10, 8).translate(xOf(0.09), pe.h * 0.3, side * (pe.w * 0.78 + eyeR * 0.42));
    eyeGeos.push(ringGeo, pupilGeo);
    group.add(new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(pupilGeo, eyeMat));
  }
  for (const c of group.children) {
    c.castShadow = true;
  }
  return {
    group,
    swim,
    materials: mats,
    dispose() {
      for (const g of eyeGeos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
