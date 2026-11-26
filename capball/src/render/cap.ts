import * as THREE from 'three';
import { DEFAULT_CAP, type CapBrand } from '../game/caps';

/** ペットボトルのキャップ（ギザギザの側面・天面のラベル）。実物より大きめにして見やすくする */
export const CAP_VIS_R = 0.062;

/** 種を固定した乱数（柄の配置を銘柄ごとに決めるため） */
function seeded(id: string) {
  let a = 2166136261;
  for (let i = 0; i < id.length; i++) a = Math.imul(a ^ id.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATIN = /^[\x20-\x7e₂%★!]+$/;

/** 色の明るさ（0〜1） */
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** 背景に対して読みやすい方の色 */
const readable = (bg: string, ...cands: string[]) => cands.reduce((best, c) => (contrast(bg, c) > contrast(bg, best) ? c : best), cands[0]);

/** 天面の柄（地の上に、accent の色で描く） */
function drawPattern(c: CanvasRenderingContext2D, S: number, b: CapBrand, r: () => number) {
  const h = S / 2, u = S / 256;
  const circle = (x: number, y: number, rad: number, fill = true) => { c.beginPath(); c.arc(x * u, y * u, rad * u, 0, Math.PI * 2); fill ? c.fill() : c.stroke(); };
  c.fillStyle = b.accent;
  c.strokeStyle = b.accent;
  switch (b.pattern) {
    case 'band':
      c.fillRect(0, h - 46 * u, S, 92 * u);
      break;
    case 'dots':
      c.globalAlpha = 0.55;
      for (let y = 18; y < 256; y += 40) for (let x = (y / 40) % 2 ? 38 : 18; x < 256; x += 40) circle(x, y, 8);
      break;
    case 'bubbles':
      for (let k = 0; k < 26; k++) {
        const rad = 4 + r() * 16;
        c.globalAlpha = 0.25 + r() * 0.4;
        c.lineWidth = (2 + r() * 3) * u;
        circle(20 + r() * 216, 20 + r() * 216, rad, r() < 0.4);
      }
      break;
    case 'stripe':
      c.globalAlpha = 0.45;
      c.lineWidth = 16 * u;
      for (let k = -256; k < 512; k += 46) { c.beginPath(); c.moveTo(k * u, 0); c.lineTo((k + 256) * u, S); c.stroke(); }
      break;
    case 'chevron':
      c.globalAlpha = 0.4;
      c.lineWidth = 12 * u;
      for (let y = -20; y < 280; y += 38) { c.beginPath(); for (let x = 0; x <= 256; x += 32) c.lineTo(x * u, (y + ((x / 32) % 2 ? 16 : 0)) * u); c.stroke(); }
      break;
    case 'wave':
      c.globalAlpha = 0.6;
      c.lineWidth = 10 * u;
      for (let k = 0; k < 4; k++) { c.beginPath(); for (let x = 0; x <= 256; x += 4) c.lineTo(x * u, (176 + k * 22 + Math.sin(x / 20 + k) * 7) * u); c.stroke(); }
      break;
    case 'seigaiha':
      c.globalAlpha = 0.35;
      c.lineWidth = 3 * u;
      for (let row = 0; row < 12; row++) for (let col = -1; col < 10; col++) {
        const x = col * 32 + (row % 2) * 16, y = row * 14 + 12;
        for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x * u, y * u, (16 - k * 5) * u, Math.PI, 0); c.stroke(); }
      }
      break;
    case 'asanoha':
      c.globalAlpha = 0.3;
      c.lineWidth = 2.5 * u;
      for (let y = 0; y < 300; y += 44) for (let x = 0; x < 300; x += 50) {
        const ox = x + ((y / 44) % 2) * 25;
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; c.beginPath(); c.moveTo(ox * u, y * u); c.lineTo((ox + Math.cos(a) * 28) * u, (y + Math.sin(a) * 28) * u); c.stroke(); }
      }
      break;
    case 'check':
      c.globalAlpha = 0.2;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) c.fillRect(x * 32 * u, y * 32 * u, 32 * u, 32 * u);
      break;
    case 'radial':
    case 'sun': {
      const n = 18;
      c.globalAlpha = 0.3;
      c.beginPath();
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = a0 + Math.PI / n;
        c.moveTo(h, h);
        c.arc(h, h, 200 * u, a0, a1);
      }
      c.fill();
      break;
    }
    case 'ripple':
      c.globalAlpha = 0.35;
      c.lineWidth = 5 * u;
      for (let k = 1; k < 7; k++) circle(128, 128, k * 17, false);
      break;
    case 'mountain':
      c.globalAlpha = 0.55;
      c.beginPath();
      c.moveTo(0, S);
      [[0, 200], [60, 140], [100, 175], [150, 110], [205, 170], [256, 150], [256, 256]].forEach(([x, y]) => c.lineTo(x * u, y * u));
      c.fill();
      c.globalAlpha = 0.9;
      c.fillStyle = b.label;
      c.beginPath();
      [[150, 110], [134, 128], [150, 124], [166, 130]].forEach(([x, y]) => c.lineTo(x * u, y * u));
      c.fill();
      break;
    case 'leaf':
      c.globalAlpha = 0.5;
      for (let k = 0; k < 7; k++) {
        c.save();
        c.translate((30 + r() * 196) * u, (30 + r() * 196) * u);
        c.rotate(r() * Math.PI * 2);
        c.beginPath();
        c.ellipse(0, 0, 26 * u, 11 * u, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      break;
    case 'flower':
      for (let k = 0; k < 7; k++) {
        const x = 24 + r() * 208, y = 24 + r() * 208, rr = 10 + r() * 10;
        c.globalAlpha = 0.45;
        for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2 + k; circle(x + Math.cos(a) * rr * 0.8, y + Math.sin(a) * rr * 0.8, rr * 0.55); }
        c.globalAlpha = 0.8;
        c.fillStyle = b.label;
        circle(x, y, rr * 0.3);
        c.fillStyle = b.accent;
      }
      break;
    case 'star':
      for (let k = 0; k < 9; k++) {
        const x = 20 + r() * 216, y = 20 + r() * 216, rr = 7 + r() * 12;
        c.globalAlpha = 0.35 + r() * 0.35;
        c.beginPath();
        for (let p = 0; p < 10; p++) { const a = (p / 10) * Math.PI * 2 - Math.PI / 2; const q = p % 2 ? rr * 0.45 : rr; c.lineTo((x + Math.cos(a) * q) * u, (y + Math.sin(a) * q) * u); }
        c.fill();
      }
      break;
    case 'snow':
      c.globalAlpha = 0.45;
      c.lineWidth = 2.5 * u;
      for (let k = 0; k < 9; k++) {
        const x = 20 + r() * 216, y = 20 + r() * 216, rr = 7 + r() * 9;
        for (let p = 0; p < 3; p++) { const a = (p / 3) * Math.PI; c.beginPath(); c.moveTo((x - Math.cos(a) * rr) * u, (y - Math.sin(a) * rr) * u); c.lineTo((x + Math.cos(a) * rr) * u, (y + Math.sin(a) * rr) * u); c.stroke(); }
      }
      break;
    case 'bolt':
      c.globalAlpha = 0.45;
      c.beginPath();
      [[150, 10], [70, 140], [126, 140], [96, 250], [190, 104], [134, 104], [176, 10]].forEach(([x, y]) => c.lineTo(x * u, y * u));
      c.closePath();
      c.fill();
      break;
    case 'drop':
      c.globalAlpha = 0.28;
      c.beginPath();
      c.moveTo(h, 22 * u);
      c.bezierCurveTo(h + 90 * u, 130 * u, h + 70 * u, 236 * u, h, 236 * u);
      c.bezierCurveTo(h - 70 * u, 236 * u, h - 90 * u, 130 * u, h, 22 * u);
      c.fill();
      break;
    case 'heart':
      c.globalAlpha = 0.5;
      for (let k = 0; k < 6; k++) {
        const x = 26 + r() * 204, y = 26 + r() * 204, q = 9 + r() * 9;
        c.beginPath();
        c.moveTo(x * u, (y + q) * u);
        c.bezierCurveTo((x - q * 1.6) * u, (y - q * 0.2) * u, (x - q * 0.5) * u, (y - q * 1.3) * u, x * u, (y - q * 0.4) * u);
        c.bezierCurveTo((x + q * 0.5) * u, (y - q * 1.3) * u, (x + q * 1.6) * u, (y - q * 0.2) * u, x * u, (y + q) * u);
        c.fill();
      }
      break;
    case 'beans':
      c.globalAlpha = 0.45;
      for (let k = 0; k < 9; k++) {
        c.save();
        c.translate((24 + r() * 208) * u, (24 + r() * 208) * u);
        c.rotate(r() * Math.PI);
        c.beginPath();
        c.ellipse(0, 0, 14 * u, 10 * u, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = b.label;
        c.lineWidth = 2 * u;
        c.beginPath();
        c.moveTo(-10 * u, 0);
        c.quadraticCurveTo(0, 4 * u, 10 * u, 0);
        c.stroke();
        c.restore();
      }
      break;
    case 'spots':
      c.globalAlpha = 0.55;
      for (let k = 0; k < 7; k++) {
        const x = 20 + r() * 216, y = 20 + r() * 216;
        c.beginPath();
        for (let p = 0; p < 9; p++) { const a = (p / 9) * Math.PI * 2; const q = (14 + r() * 12) * u; c.lineTo(x * u + Math.cos(a) * q, y * u + Math.sin(a) * q); }
        c.fill();
      }
      break;
    case 'fruit':
      for (let k = 0; k < 4; k++) {
        const x = 30 + r() * 196, y = 30 + r() * 196, rr = 20 + r() * 14;
        c.globalAlpha = 0.5;
        circle(x, y, rr);
        c.globalAlpha = 0.8;
        c.strokeStyle = b.label;
        c.lineWidth = 2.5 * u;
        circle(x, y, rr * 0.78, false);
        for (let p = 0; p < 8; p++) { const a = (p / 8) * Math.PI * 2; c.beginPath(); c.moveTo(x * u, y * u); c.lineTo((x + Math.cos(a) * rr * 0.78) * u, (y + Math.sin(a) * rr * 0.78) * u); c.stroke(); }
        c.strokeStyle = b.accent;
      }
      break;
    default:
      break;
  }
  c.globalAlpha = 1;
}

/** 円に沿って文字を並べる（top=true で上の弧、false で下の弧） */
function arcText(c: CanvasRenderingContext2D, S: number, text: string, radius: number, top: boolean, size: number, color: string, font: string) {
  const h = S / 2;
  const chars = [...text];
  c.font = `${size}px ${font}`;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const widths = chars.map((ch) => c.measureText(ch).width + size * 0.06);
  const total = widths.reduce((a, b) => a + b, 0);
  const span = Math.min(Math.PI * 1.1, total / radius);
  let a = (top ? -Math.PI / 2 : Math.PI / 2) + (top ? -span / 2 : span / 2);
  for (let k = 0; k < chars.length; k++) {
    const da = (widths[k] / total) * span;
    const mid = a + (top ? da / 2 : -da / 2);
    c.save();
    c.translate(h + Math.cos(mid) * radius, h + Math.sin(mid) * radius);
    c.rotate(mid + (top ? Math.PI / 2 : -Math.PI / 2));
    c.fillText(chars[k], 0, 0);
    c.restore();
    a += top ? da : -da;
  }
}

const fontStack = (f?: string) => (f ? `"${f}", ` : '') + '"Dela Gothic One", "M PLUS Rounded 1c", sans-serif';

/** 天面のラベルを描く（ゲーム内のキャップと、選択画面の見本で共通） */
export function drawCapTop(c: CanvasRenderingContext2D, S: number, b: CapBrand) {
  const h = S / 2, u = S / 256;
  const r = seeded(b.id);
  const big = S >= 200;
  const layout = b.layout ?? (b.pattern === 'band' ? 'band' : 'center');
  c.save();
  c.clearRect(0, 0, S, S);
  c.beginPath();
  c.arc(h, h, h, 0, Math.PI * 2);
  c.clip();
  // 地
  c.fillStyle = b.label;
  c.fillRect(0, 0, S, S);
  drawPattern(c, S, b, r);
  // 組み方ごとの下地
  if (layout === 'band') {
    c.fillStyle = b.accent;
    c.fillRect(0, h - 40 * u, S, 80 * u);
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.fillRect(0, h - 40 * u, S, 5 * u);
    c.fillStyle = 'rgba(0,0,0,.12)';
    c.fillRect(0, h + 35 * u, S, 5 * u);
  } else if (layout === 'badge' || layout === 'stamp') {
    c.fillStyle = layout === 'stamp' ? b.accent : b.label;
    c.beginPath();
    c.arc(h, h, 70 * u, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 4 * u;
    c.strokeStyle = layout === 'stamp' ? b.label : b.accent;
    c.beginPath();
    c.arc(h, h, 62 * u, 0, Math.PI * 2);
    c.stroke();
    if (layout === 'badge') {
      // 紋章のぎざぎざの縁
      c.fillStyle = b.accent;
      for (let k = 0; k < 36; k++) {
        const a = (k / 36) * Math.PI * 2;
        c.beginPath();
        c.arc(h + Math.cos(a) * 72 * u, h + Math.sin(a) * 72 * u, 5 * u, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  // 光沢（上が明るく、縁がわずかに暗い）
  const g = c.createRadialGradient(h * 0.75, h * 0.6, S * 0.04, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,0.32)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0.16)');
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  // 縁：太い輪と、内側の細い線
  c.lineWidth = 14 * u;
  c.strokeStyle = b.accent;
  c.beginPath();
  c.arc(h, h, 117 * u, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 2 * u;
  c.strokeStyle = layout === 'stamp' || b.ink === '#ffffff' ? b.ink : b.accent;
  c.globalAlpha = 0.6;
  c.beginPath();
  c.arc(h, h, 104 * u, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha = 1;
  // 縁の細かい印字（大きく描くときだけ）
  if (big) {
    const small = `"M PLUS Rounded 1c", sans-serif`;
    if (layout === 'arc') {
      arcText(c, S, b.name, 88 * u, true, 17 * u, b.ink, `900 ${small}`);
      arcText(c, S, b.sub ?? b.genre, 90 * u, false, 12 * u, b.ink, `800 ${small}`);
    } else {
      const txt = `${b.name}・${b.sub ?? b.genre}・`;
      c.globalAlpha = 0.7;
      arcText(c, S, txt.repeat(Math.max(1, Math.floor(44 / [...txt].length))), 92 * u, true, 11 * u, b.ink, `800 ${small}`);
      c.globalAlpha = 1;
    }
  }
  // 銘柄の文字
  const mark = b.mark;
  const len = [...mark].length;
  const latin = LATIN.test(mark);
  const fam = latin ? b.font : b.font === 'Lobster' || b.font === 'Bungee' ? 'Dela Gothic One' : b.font;
  const base = layout === 'badge' || layout === 'stamp' ? 0.78 : layout === 'band' ? 0.86 : 1;
  const fs = (len <= 1 ? 118 : len <= 2 ? 88 : len <= 3 ? 68 : len <= 4 ? (latin ? 60 : 54) : len <= 5 ? 48 : 40) * base * u;
  c.font = `${fam === 'M PLUS Rounded 1c' ? '900 ' : ''}${fs}px ${fontStack(fam)}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const my = h + (layout === 'arc' ? 2 : 4) * u - (b.badge && big ? 6 * u : 0);
  // 文字の下の色に対して読みやすい色を選ぶ（縁取りは下の色そのもの）
  const under = layout === 'stamp' || layout === 'band' ? b.accent : b.label;
  const ink = readable(under, b.ink, b.label, '#ffffff', '#1d2433');
  const outline = readable(ink, under, '#ffffff', '#1d2433');
  // 影 → 縁取り → 本体
  c.lineJoin = 'round';
  c.fillStyle = 'rgba(0,0,0,.18)';
  c.fillText(mark, h + 3 * u, my + 4 * u, 190 * u);
  c.lineWidth = 9 * u;
  c.strokeStyle = outline;
  c.strokeText(mark, h, my, 190 * u);
  c.fillStyle = ink;
  c.fillText(mark, h, my, 190 * u);
  // バッジ（ZERO・限定など）
  if (b.badge && S >= 96) {
    const bf = 15 * u;
    c.font = `${bf}px ${fontStack('RocknRoll One')}`;
    const tw = c.measureText(b.badge).width + 16 * u;
    const bx = h - tw / 2, by = h + 44 * u;
    c.fillStyle = b.ink === '#ffffff' ? '#1d2433' : b.accent;
    c.beginPath();
    c.roundRect(bx, by, tw, 22 * u, 11 * u);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillText(b.badge, h, by + 12 * u);
  }
  c.restore();
}

function labelTexture(b: CapBrand) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  drawCapTop(cv.getContext('2d')!, 512, b);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function haloTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,250,220,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** 表面の仕上げごとの材質 */
function bodyMaterial(b: CapBrand) {
  const base = { color: new THREE.Color(b.body), envMapIntensity: 1.2 };
  switch (b.finish ?? 'gloss') {
    case 'matte':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.62, clearcoat: 0.12, clearcoatRoughness: 0.5 });
    case 'metal':
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.88, roughness: 0.26, envMapIntensity: 1.6 });
    case 'pearl':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2, iridescence: 0.75, iridescenceIOR: 1.45, iridescenceThicknessRange: [180, 520] });
    default:
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.12 });
  }
}

/**
 * キャップ本体：細かいみぞのある側面、丸みのある天面の縁、印刷されたラベル、
 * 裾の返し、内側のねじ山と中ぶた。
 */
function buildCapBody(b: CapBrand) {
  const body = new THREE.Group();
  body.name = 'body';
  // 形ごとの大きさ（広口は大きく低め、ホット用は背が高い）
  const shp = { std: [1, 1], wide: [1.22, 0.85], tall: [0.96, 1.35], slim: [0.9, 1.05], flat: [1.04, 0.72] }[b.shape ?? 'std'];
  const R = CAP_VIS_R * shp[0], H = CAP_VIS_R * 0.7 * shp[1];
  const f = R * (b.shape === 'flat' ? 0.08 : 0.12); // 天面の縁の丸み
  const yTop = H / 2, yBot = -H / 2;
  const mat = bodyMaterial(b);
  const lighter = new THREE.Color(b.body).lerp(new THREE.Color('#ffffff'), 0.55);
  const innerMat = new THREE.MeshStandardMaterial({ color: lighter, roughness: 0.55, side: THREE.BackSide });

  // 側面：みぞ（なめらかな山型）を刻む。上の縁の手前でみぞを消す
  const n = b.ridges ?? 96;
  const sideH = H - f;
  const rows = 6;
  const side = new THREE.CylinderGeometry(R, R, sideH, n * 4, rows, true);
  const pos = side.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const v = (y + sideH / 2) / sideH; // 0=下、1=上
    const fade = THREE.MathUtils.smoothstep(1 - v, 0.0, 0.22) * THREE.MathUtils.smoothstep(v, 0.0, 0.08);
    const ridge = Math.pow(0.5 + 0.5 * Math.cos(a * n), 1.6);
    const k = 1 + 0.03 * ridge * fade - 0.01 * (1 - fade);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  side.translate(0, yBot + sideH / 2, 0);
  side.computeVertexNormals();
  const sideMesh = new THREE.Mesh(side, mat);
  sideMesh.name = 'side';

  // 天面の縁の丸み
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = (k / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - f + Math.cos(t) * f * 0.99, yTop - f + Math.sin(t) * f));
  }
  const fillet = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 96), mat);

  // 天面のラベル（印刷フィルムっぽく少しつやを足す）
  const labelMat = new THREE.MeshPhysicalMaterial({ map: labelTexture(b), roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18, metalness: b.finish === 'metal' ? 0.35 : 0, envMapIntensity: 1.1 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(R - f + 0.0004, 96), labelMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = yTop;
  top.name = 'top';

  // 裾の返し
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 1.008, R * 0.045, 8, 96), mat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = yBot + R * 0.03;

  // 内側：内壁・底の縁・ねじ山・中ぶた
  const ri = R * 0.88;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, H * 0.92, 48, 1, true), innerMat);
  wall.position.y = yBot + H * 0.46;
  const rim = new THREE.Mesh(new THREE.RingGeometry(ri, R * 1.0, 64), new THREE.MeshStandardMaterial({ color: lighter, roughness: 0.5, side: THREE.DoubleSide }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = yBot + 0.0005;
  const threadMat = new THREE.MeshStandardMaterial({ color: lighter, roughness: 0.5 });
  const threads = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const th = new THREE.Mesh(new THREE.TorusGeometry(ri * 0.985, R * 0.028, 6, 64), threadMat);
    th.rotation.x = Math.PI / 2 + 0.06;
    th.position.y = yBot + H * (0.3 + k * 0.28);
    threads.add(th);
  }
  const liner = new THREE.Mesh(new THREE.CircleGeometry(ri, 48), new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.7 }));
  liner.rotation.x = Math.PI / 2;
  liner.position.y = yTop - H * 0.1;
  const seal = new THREE.Mesh(new THREE.TorusGeometry(ri * 0.72, R * 0.03, 6, 48), threadMat);
  seal.rotation.x = Math.PI / 2;
  seal.position.y = yTop - H * 0.12;

  body.add(sideMesh, fillet, top, lip, wall, rim, threads, liner, seal);
  for (const m of [sideMesh, fillet, top, lip]) m.castShadow = true;
  return body;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) {
      (mt as THREE.MeshStandardMaterial).map?.dispose();
      mt.dispose();
    }
  });
}

export function makeCapBall(brand: CapBrand = DEFAULT_CAP, withHalo = true) {
  const g = new THREE.Group();
  g.userData.capRoot = true;
  g.userData.brand = brand.id;
  g.add(buildCapBody(brand));
  if (withHalo) {
    // スマホの小さな画面でも見失わないよう、うっすら光る輪を添える
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(CAP_VIS_R * 5.5);
    halo.name = 'halo';
    g.add(halo);
  }
  return g;
}

/** 作ってあるキャップの見た目を別の銘柄に替える */
export function applyCapBrand(root: THREE.Object3D, brand: CapBrand) {
  let cap: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!cap && o.userData.capRoot) cap = o;
  });
  const g = cap as THREE.Object3D | null;
  if (!g || g.userData.brand === brand.id) return;
  const old = g.getObjectByName('body');
  if (old) {
    g.remove(old);
    disposeTree(old);
  }
  g.add(buildCapBody(brand));
  g.userData.brand = brand.id;
}

/** キャップの軌跡（フェードする帯） */
export class Trail {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private ages: number[] = [];
  life = 0.28;
  private geo: THREE.BufferGeometry;
  private max: number;
  constructor(max = 22, color = '#ffffff') {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    const n = max * 2;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    const idx: number[] = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor=vec4(color, vA*0.55); }',
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }
  clear() {
    this.pts = [];
    this.ages = [];
    this.update(new THREE.Vector3(0, 0, 1), 0.05, 0);
  }
  push(p: THREE.Vector3) {
    this.pts.unshift(p.clone());
    this.ages.unshift(0);
    if (this.pts.length > this.max) {
      this.pts.pop();
      this.ages.pop();
    }
  }
  update(camDir: THREE.Vector3, width = 0.05, dt = 0) {
    for (let i = 0; i < this.ages.length; i++) this.ages[i] += dt;
    while (this.ages.length && this.ages[this.ages.length - 1] > this.life) {
      this.ages.pop();
      this.pts.pop();
    }
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const al = this.geo.getAttribute('alpha') as THREE.BufferAttribute;
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const p = this.pts[Math.min(i, n - 1)] ?? new THREE.Vector3();
      const q = this.pts[Math.min(i + 1, n - 1)] ?? p;
      const d = p.clone().sub(q);
      const side = d.cross(camDir).normalize().multiplyScalar(width * (1 - i / this.max));
      if (!isFinite(side.x)) side.set(0, 0, 0);
      pos.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z);
      pos.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
      const a = i < n ? Math.max(0, 1 - this.ages[i] / this.life) : 0;
      al.setX(i * 2, a);
      al.setX(i * 2 + 1, a);
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
  }
}
