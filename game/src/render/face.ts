import * as THREE from 'three';
import type { CharacterDef } from '../combat/types';

/**
 * The free base-character kit ships one head per body, so faces are told apart
 * by repainting a copy of the body texture per character: skin tone, iris
 * colour, and painted details (freckles, blush, lip colour, liner, scars,
 * plasters, face paint). Coordinates are in texture space (0..1, v down) of the
 * kit's UV layout, where the face sits in the top-left block.
 */
interface FaceUV {
  eyes: [number, number][];
  eyeY: number;
  mouth: [number, number];
  cheeks: [number, number][];
  nose: [number, number];
  /** Unit of size: the distance between the eyes. */
  span: number;
}

const UV: Record<'male' | 'female', FaceUV> = {
  male: { eyes: [[0.137, 0.18], [0.234, 0.18]], eyeY: 0.18, mouth: [0.186, 0.263], cheeks: [[0.105, 0.232], [0.267, 0.232]], nose: [0.186, 0.215], span: 0.097 },
  female: { eyes: [[0.133, 0.176], [0.234, 0.176]], eyeY: 0.176, mouth: [0.182, 0.253], cheeks: [[0.1, 0.225], [0.268, 0.225]], nose: [0.183, 0.21], span: 0.101 },
};

const cache = new Map<string, THREE.Texture>();
const eyeCache = new Map<string, THREE.Texture>();

const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function canvasFrom(img: CanvasImageSource & { width: number; height: number }) {
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext('2d')!;
  g.drawImage(img, 0, 0);
  return { cv, g };
}

function toTexture(cv: HTMLCanvasElement, like: THREE.Texture) {
  const t = new THREE.CanvasTexture(cv);
  t.flipY = like.flipY;
  t.colorSpace = like.colorSpace;
  t.wrapS = like.wrapS;
  t.wrapT = like.wrapT;
  t.anisotropy = 4;
  return t;
}

/** Skin multiplier for the toon material: the kit texture is a light tone, scaled toward `look.skin`. */
export function skinTint(skin: number) {
  const ref = new THREE.Color(0xffdcc4);
  const c = new THREE.Color(skin);
  return new THREE.Color(1.35 * (c.r / ref.r), 1.22 * (c.g / ref.g), 1.15 * (c.b / ref.b));
}

/** Per-character copy of the body texture with the face details painted in. */
export function faceTexture(def: CharacterDef, base: THREE.Texture) {
  const face = def.look.face;
  const img = base.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!face || !img?.width || typeof document === 'undefined') return base;
  const hit = cache.get(def.id);
  if (hit) return hit;
  const { cv, g } = canvasFrom(img);
  const S = cv.width;
  const uv = UV[def.look.body === 'female' ? 'female' : 'male'];
  const P = (u: number, v: number): [number, number] => [u * S, v * S];
  const R = (k: number) => k * uv.span * S;
  const sample = (u: number, v: number) => {
    const d = g.getImageData(Math.round(u * S), Math.round(v * S), 1, 1).data;
    return (d[0] << 16) | (d[1] << 8) | d[2];
  };
  const blob = (u: number, v: number, rx: number, ry: number, color: string, soft = 1) => {
    const [x, y] = P(u, v);
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, color);
    gr.addColorStop(Math.max(0, 1 - soft), color);
    gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  if (face.shave) {
    // Cover the baked stubble (chin, jaw and upper lip) with the cheek tone.
    const tone = sample(uv.cheeks[0][0] + 0.01, uv.eyeY + 0.03);
    const [mx, my] = uv.mouth;
    blob(mx, my + R(0.42) / S, R(0.95), R(0.55), css(tone, 0.95), 0.6);
    for (const s of [-1, 1]) blob(mx + s * R(0.62) / S, my - R(0.05) / S, R(0.42), R(0.6), css(tone, 0.9), 0.6);
    blob(mx, my - R(0.2) / S, R(0.38), R(0.12), css(tone, 0.85), 0.7);
  }
  if (face.blush) for (const [u, v] of uv.cheeks) blob(u, v, R(0.3), R(0.2), css(0xff6f7d, 0.55 * face.blush), 1);
  if (face.freckles) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = css(0x8a4a2c, 0.55);
    for (const [u, v] of uv.cheeks)
      for (let i = 0; i < 14; i++) {
        const [x, y] = P(u + (rnd() - 0.5) * uv.span * 0.6 + (uv.nose[0] - u) * 0.25, v - uv.span * 0.12 + (rnd() - 0.5) * uv.span * 0.3);
        g.beginPath();
        g.arc(x, y, R(0.012 + rnd() * 0.01), 0, Math.PI * 2);
        g.fill();
      }
  }
  if (face.lips !== undefined) {
    const [mx, my] = uv.mouth;
    g.save();
    g.globalCompositeOperation = 'multiply';
    blob(mx, my, R(0.22), R(0.08), css(face.lips, 0.9), 0.5);
    g.restore();
  }
  if (face.liner) {
    g.strokeStyle = css(0x1d1b2e, 0.9);
    g.lineWidth = R(0.035);
    g.lineCap = 'round';
    for (const [u, v] of uv.eyes) {
      const [x, y] = P(u, v);
      const dir = u < uv.nose[0] ? -1 : 1;
      g.beginPath();
      g.moveTo(x - dir * R(0.13), y - R(0.02));
      g.quadraticCurveTo(x, y - R(0.11), x + dir * R(0.17), y - R(0.07));
      g.lineTo(x + dir * R(0.22), y - R(0.11));
      g.stroke();
    }
  }
  if (face.mole) {
    const [mx, my] = uv.mouth;
    g.fillStyle = css(0x3b2018, 0.85);
    g.beginPath();
    g.arc(mx + R(0.3), my - R(0.1), R(0.025), 0, Math.PI * 2);
    g.fill();
  }
  for (const m of face.marks ?? []) {
    const side = m.side ?? 1;
    const cheek = uv.cheeks[side > 0 ? 1 : 0];
    const eye = uv.eyes[side > 0 ? 1 : 0];
    g.save();
    g.lineCap = 'round';
    switch (m.kind) {
      case 'scar': {
        // A pale slash straight down across one eye.
        const [x, y] = P(eye[0], eye[1]);
        g.strokeStyle = css(m.color, 0.95);
        g.lineWidth = R(0.07);
        g.beginPath();
        g.moveTo(x - R(0.08), y - R(0.32));
        g.lineTo(x + R(0.06), y + R(0.36));
        g.stroke();
        g.strokeStyle = css(m.color, 0.8);
        g.lineWidth = R(0.025);
        for (let k = -2; k <= 2; k++) {
          const t = 0.5 + k * 0.17;
          const cx = x - R(0.08) + R(0.14) * t;
          const cy = y - R(0.32) + R(0.68) * t;
          if (Math.abs(cy - y) < R(0.08)) continue;
          g.beginPath();
          g.moveTo(cx - R(0.05), cy);
          g.lineTo(cx + R(0.05), cy);
          g.stroke();
        }
        break;
      }
      case 'plaster': {
        // Sticking plaster on the cheek.
        const [x, y] = P(cheek[0], cheek[1] - uv.span * 0.05);
        g.translate(x, y);
        g.rotate(side * 0.5);
        g.fillStyle = css(m.color);
        g.fillRect(-R(0.18), -R(0.055), R(0.36), R(0.11));
        g.fillStyle = css(0xe8c9a0);
        g.fillRect(-R(0.06), -R(0.055), R(0.12), R(0.11));
        g.fillStyle = css(0x000000, 0.25);
        for (const dx of [-0.13, -0.1, 0.1, 0.13]) {
          g.beginPath();
          g.arc(R(dx), 0, R(0.008), 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'noseBand': {
        const [x, y] = P(uv.nose[0], uv.nose[1] - uv.span * 0.08);
        g.translate(x, y);
        g.fillStyle = css(m.color);
        g.fillRect(-R(0.2), -R(0.05), R(0.4), R(0.1));
        break;
      }
      case 'stripes': {
        // Two war-paint stripes under each eye.
        g.strokeStyle = css(m.color, 0.95);
        g.lineWidth = R(0.06);
        for (const [u, v] of uv.eyes) {
          const [x, y] = P(u, v);
          const dir = u < uv.nose[0] ? -1 : 1;
          for (const k of [0, 1]) {
            g.beginPath();
            g.moveTo(x - dir * R(0.05), y + R(0.17 + k * 0.12));
            g.lineTo(x + dir * R(0.2), y + R(0.13 + k * 0.12));
            g.stroke();
          }
        }
        break;
      }
      case 'star':
      case 'heart': {
        const [x, y] = P(eye[0] + side * uv.span * 0.12, eye[1] + uv.span * 0.38);
        g.translate(x, y);
        g.fillStyle = css(m.color);
        g.strokeStyle = css(0x1d1b2e, 0.8);
        g.lineWidth = R(0.015);
        g.beginPath();
        const r = R(0.1);
        if (m.kind === 'star') {
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const rr = i % 2 ? r * 0.45 : r;
            g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
        } else {
          g.moveTo(0, r * 0.8);
          g.bezierCurveTo(-r * 1.4, -r * 0.2, -r * 0.6, -r * 1.2, 0, -r * 0.45);
          g.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.4, -r * 0.2, 0, r * 0.8);
        }
        g.closePath();
        g.fill();
        g.stroke();
        break;
      }
    }
    g.restore();
  }
  const t = toTexture(cv, base);
  cache.set(def.id, t);
  return t;
}

/** Eye texture with the brown iris recoloured to `look.eyes` (keeps shading and the white). */
export function eyeTexture(def: CharacterDef, base: THREE.Texture) {
  const img = base.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img?.width || typeof document === 'undefined') return base;
  const key = `${def.look.eyes}`;
  const hit = eyeCache.get(key);
  if (hit) return hit;
  const { cv, g } = canvasFrom(img);
  const data = g.getImageData(0, 0, cv.width, cv.height);
  const d = data.data;
  const target = new THREE.Color(def.look.eyes);
  const hsl = { h: 0, s: 0, l: 0 };
  target.getHSL(hsl, THREE.SRGBColorSpace);
  const c = new THREE.Color();
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const gg = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    const max = Math.max(r, gg, b);
    const min = Math.min(r, gg, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.18) continue; // sclera, highlights, pupil
    const l = (max + min) / 2;
    c.setHSL(hsl.h, Math.min(1, hsl.s * 0.9 + 0.1), Math.min(0.85, l * (0.6 + hsl.l)), THREE.SRGBColorSpace);
    const rgb = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    const k = Math.min(1, (sat - 0.18) / 0.15);
    d[i] = d[i] * (1 - k) + rgb.r * 255 * k;
    d[i + 1] = d[i + 1] * (1 - k) + rgb.g * 255 * k;
    d[i + 2] = d[i + 2] * (1 - k) + rgb.b * 255 * k;
  }
  g.putImageData(data, 0, 0);
  const t = toTexture(cv, base);
  eyeCache.set(key, t);
  return t;
}
