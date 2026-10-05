import * as THREE from 'three';

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, w = size) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, points: number, outer: number, inner: number, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

const cache: Record<string, THREE.Texture> = {};

/** Kenney Particle Pack sprites (CC0), packed by tools/build-fx.mjs into public/assets/fx. */
const FX_NAMES = ['flash', 'burst', 'ring', 'spark', 'glint', 'soft', 'puff', 'dirt', 'slash', 'twirl', 'magic', 'halo', 'smokeRing', 'bolt', 'slashArc', 'slashWide', 'slashStreak', 'impactBurst', 'impactRing', 'impactDebris'] as const;
/** Flipbook strips (CC0, Cethiel): frame count per horizontal strip. */
export const FX_FRAMES: Partial<Record<FxName, number>> = { slashArc: 6, slashWide: 6, slashStreak: 6, impactBurst: 5, impactRing: 5, impactDebris: 5 };
export type FxName = (typeof FX_NAMES)[number];
const fxTex: Partial<Record<FxName, THREE.Texture>> = {};

/** Loads the sprite set via fetch + blob URL (CSP-friendly). Missing files fall back to procedural textures. */
export async function loadFx() {
  const base = `${import.meta.env.BASE_URL}assets/fx/`;
  await Promise.all(
    FX_NAMES.map(async (n) => {
      try {
        const res = await fetch(`${base}${n}.png`);
        if (!res.ok) return;
        const url = URL.createObjectURL(await res.blob());
        const img = new Image();
        img.src = url;
        await img.decode();
        const t = new THREE.Texture(img);
        t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        fxTex[n] = t;
      } catch {
        /* keep the procedural fallback */
      }
    }),
  );
}

/** True when the real sprite (not the fallback) is available. */
export function hasFx(n: FxName) {
  return !!fxTex[n];
}

/** Sprite from the particle pack, or a procedural stand-in until/unless it loads. */
export function fx(n: FxName): THREE.Texture {
  const t = fxTex[n];
  if (t) return t;
  switch (n) {
    case 'flash':
    case 'burst':
      return tex.burst();
    case 'ring':
    case 'twirl':
    case 'smokeRing':
      return tex.ring();
    case 'soft':
    case 'halo':
      return tex.soft();
    case 'puff':
    case 'dirt':
      return tex.puff();
    case 'slash':
      return tex.lines();
    default:
      return tex.spark();
  }
}
const once = (k: string, f: () => THREE.Texture) => (cache[k] ??= f());

export const tex = {
  /** White comic-style burst; tinted per element via material color. */
  burst: () =>
    once('burst', () =>
      canvasTex(256, (g, s) => {
        starPath(g, s / 2, s / 2, 9, s * 0.48, s * 0.2, 0.2);
        g.fillStyle = '#fff';
        g.fill();
      }),
    ),
  star: () =>
    once('star', () =>
      canvasTex(128, (g, s) => {
        starPath(g, s / 2, s / 2, 5, s * 0.46, s * 0.2);
        g.fillStyle = '#fff';
        g.fill();
      }),
    ),
  spark: () =>
    once('spark', () =>
      canvasTex(128, (g, s) => {
        starPath(g, s / 2, s / 2, 4, s * 0.5, s * 0.07, 0);
        g.fillStyle = '#fff';
        g.fill();
      }),
    ),
  soft: () =>
    once('soft', () =>
      canvasTex(128, (g, s) => {
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, s, s);
      }),
    ),
  ring: () =>
    once('ring', () =>
      canvasTex(256, (g, s) => {
        g.strokeStyle = '#fff';
        g.lineWidth = s * 0.07;
        g.beginPath();
        g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
        g.stroke();
      }),
    ),
  lines: () =>
    once('lines', () =>
      canvasTex(256, (g, s) => {
        g.translate(s / 2, s / 2);
        g.fillStyle = '#fff';
        for (let i = 0; i < 14; i++) {
          g.rotate((Math.PI * 2) / 14 + (Math.random() - 0.5) * 0.2);
          const inner = s * (0.18 + Math.random() * 0.08);
          const outer = s * (0.4 + Math.random() * 0.1);
          g.beginPath();
          g.moveTo(inner, -2);
          g.lineTo(outer, -s * 0.025);
          g.lineTo(outer, s * 0.025);
          g.lineTo(inner, 2);
          g.closePath();
          g.fill();
        }
      }),
    ),
  puff: () =>
    once('puff', () =>
      canvasTex(128, (g, s) => {
        g.fillStyle = '#fff';
        for (const [x, y, r] of [
          [0.5, 0.55, 0.3],
          [0.32, 0.5, 0.2],
          [0.68, 0.5, 0.22],
          [0.5, 0.36, 0.2],
        ]) {
          g.beginPath();
          g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
          g.fill();
        }
      }),
    ),
  hex: () =>
    once('hex', () =>
      canvasTex(256, (g, s) => {
        const R = s * 0.46;
        g.translate(s / 2, s / 2);
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + Math.PI / 6;
          g.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        }
        g.closePath();
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = s * 0.05;
        g.stroke();
        // Inner honeycomb.
        g.lineWidth = s * 0.012;
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        const r = R / 3.2;
        for (let q = -2; q <= 2; q++)
          for (let p = -2; p <= 2; p++) {
            const x = (q + p * 0.5) * r * 1.75;
            const y = p * r * 1.5;
            if (Math.hypot(x, y) > R * 0.8) continue;
            g.beginPath();
            for (let i = 0; i < 6; i++) {
              const a = (i * Math.PI) / 3 + Math.PI / 6;
              g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
            }
            g.closePath();
            g.stroke();
          }
      }),
    ),
  floor: () =>
    once('floor', () => {
      const t = canvasTex(2048, (g, s) => {
        const c = s / 2;
        const ringColors = ['#f4e3c1', '#ffcf3d', '#f4e3c1', '#3f7fe8', '#f4e3c1', '#3f7fe8', '#e9ecf5'];
        const radii = [1, 0.93, 0.88, 0.62, 0.58, 0.42, 0.0];
        for (let i = 0; i < radii.length - 1; i++) {
          g.fillStyle = ringColors[i];
          g.beginPath();
          g.arc(c, c, radii[i] * c, 0, Math.PI * 2);
          g.fill();
        }
        // Tile segments on the outer ring.
        g.strokeStyle = 'rgba(80,70,120,0.35)';
        g.lineWidth = 4;
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          g.beginPath();
          g.moveTo(c + Math.cos(a) * c * 0.62, c + Math.sin(a) * c * 0.62);
          g.lineTo(c + Math.cos(a) * c * 0.88, c + Math.sin(a) * c * 0.88);
          g.stroke();
        }
        for (const r of [0.7, 0.79]) {
          g.beginPath();
          g.arc(c, c, r * c, 0, Math.PI * 2);
          g.stroke();
        }
        // Colored accent tiles.
        const accents = ['#ff5f6d', '#ffcf3d', '#7fd4ff', '#b48cff'];
        for (let i = 0; i < 48; i += 3) {
          const a0 = (i / 48) * Math.PI * 2;
          const a1 = ((i + 1) / 48) * Math.PI * 2;
          g.fillStyle = accents[(i / 3) % accents.length];
          g.globalAlpha = 0.55;
          g.beginPath();
          g.arc(c, c, c * 0.79, a0, a1);
          g.arc(c, c, c * 0.7, a1, a0, true);
          g.closePath();
          g.fill();
          g.globalAlpha = 1;
        }
        // Center star.
        g.fillStyle = '#ffcf3d';
        starPath(g, c, c, 5, c * 0.4, c * 0.17);
        g.fill();
        g.strokeStyle = '#e8a10a';
        g.lineWidth = 10;
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        starPath(g, c, c - 6, 5, c * 0.3, c * 0.12);
        g.fill();
      });
      t.anisotropy = 8;
      return t;
    }),
  banner: (color: string) =>
    once(`banner-${color}`, () =>
      canvasTex(
        256,
        (g, s) => {
          g.fillStyle = color;
          g.fillRect(0, 0, 128, s);
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.fillRect(8, 0, 6, s);
          g.fillRect(114, 0, 6, s);
          starPath(g, 64, s * 0.42, 5, 34, 15);
          g.fill();
        },
        128,
      ),
    ),
  sky: () =>
    once('sky', () =>
      canvasTex(512, (g, s) => {
        const gr = g.createLinearGradient(0, 0, 0, s);
        gr.addColorStop(0, '#2f7ff0');
        gr.addColorStop(0.45, '#69b4ff');
        gr.addColorStop(0.62, '#bfe3ff');
        gr.addColorStop(1, '#e8f6ff');
        g.fillStyle = gr;
        g.fillRect(0, 0, 4, s);
      }, 4),
    ),
};
