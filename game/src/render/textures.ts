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
  sky: (id: string, stops: [number, string][]) =>
    once(`sky-${id}`, () =>
      canvasTex(512, (g, s) => {
        const gr = g.createLinearGradient(0, 0, 0, s);
        for (const [k, c] of stops) gr.addColorStop(k, c);
        g.fillStyle = gr;
        g.fillRect(0, 0, 4, s);
      }, 4),
    ),
  /** Dojo-style ring: lacquered rim, wooden planks, raked sand and a cherry-blossom crest. */
  floorSakura: () =>
    once('floorSakura', () => {
      const t = canvasTex(2048, (g, s) => {
        const c = s / 2;
        const disc = (r: number, fill: string | CanvasGradient) => {
          g.fillStyle = fill;
          g.beginPath();
          g.arc(c, c, r * c, 0, Math.PI * 2);
          g.fill();
        };
        disc(1, '#8e2a32');
        disc(0.95, '#e8c46a');
        disc(0.93, '#d6ad80');
        // Planks.
        g.save();
        g.beginPath();
        g.arc(c, c, 0.93 * c, 0, Math.PI * 2);
        g.clip();
        const plank = s / 22;
        for (let i = 0; i < 22; i++) {
          g.fillStyle = i % 2 ? '#d2a87c' : '#dcb68c';
          g.fillRect(0, i * plank, s, plank);
          g.fillStyle = 'rgba(90,50,30,0.35)';
          g.fillRect(0, i * plank, s, 4);
          // Butt joints, staggered.
          for (let x = (i % 3) * 230; x < s; x += 690) g.fillRect(x, i * plank, 4, plank);
          g.strokeStyle = 'rgba(120,70,40,0.12)';
          g.lineWidth = 2;
          for (let k = 0; k < 4; k++) {
            const y = i * plank + plank * (0.2 + k * 0.2);
            g.beginPath();
            g.moveTo(0, y);
            g.bezierCurveTo(s * 0.3, y + 6, s * 0.6, y - 6, s, y + 3);
            g.stroke();
          }
        }
        g.restore();
        // Raked sand circle with concentric lines.
        disc(0.5, '#8e2a32');
        disc(0.48, '#efe6d6');
        g.strokeStyle = 'rgba(150,130,110,0.35)';
        g.lineWidth = 5;
        for (let r = 0.44; r > 0.2; r -= 0.04) {
          g.beginPath();
          g.arc(c, c, r * c, 0, Math.PI * 2);
          g.stroke();
        }
        // Sakura crest.
        const petal = (a: number) => {
          g.save();
          g.translate(c, c);
          g.rotate(a);
          g.beginPath();
          g.moveTo(0, 0);
          g.bezierCurveTo(-c * 0.13, -c * 0.06, -c * 0.11, -c * 0.2, -c * 0.03, -c * 0.21);
          g.lineTo(0, -c * 0.18);
          g.lineTo(c * 0.03, -c * 0.21);
          g.bezierCurveTo(c * 0.11, -c * 0.2, c * 0.13, -c * 0.06, 0, 0);
          g.closePath();
          g.restore();
        };
        for (let i = 0; i < 5; i++) {
          petal((i / 5) * Math.PI * 2);
          g.fillStyle = '#ffb7c5';
          g.fill();
          g.strokeStyle = '#b8323a';
          g.lineWidth = 8;
          g.stroke();
        }
        disc(0.035, '#ffe08a');
      });
      t.anisotropy = 8;
      return t;
    }),
  /** Ship deck: planks, a rope ring, and a compass rose in the middle. */
  floorDeck: () =>
    once('floorDeck', () => {
      const t = canvasTex(2048, (g, s) => {
        const c = s / 2;
        const disc = (r: number, fill: string) => {
          g.fillStyle = fill;
          g.beginPath();
          g.arc(c, c, r * c, 0, Math.PI * 2);
          g.fill();
        };
        disc(1, '#5a3a22');
        g.save();
        g.beginPath();
        g.arc(c, c, 0.95 * c, 0, Math.PI * 2);
        g.clip();
        const plank = s / 26;
        for (let i = 0; i < 26; i++) {
          g.fillStyle = ['#b07a4a', '#a8723f', '#b98552'][i % 3];
          g.fillRect(0, i * plank, s, plank);
          g.fillStyle = 'rgba(50,28,14,0.55)';
          g.fillRect(0, i * plank, s, 5);
          for (let x = (i % 4) * 170; x < s; x += 520) {
            g.fillRect(x, i * plank, 5, plank);
            // Nail heads at the joints.
            g.fillStyle = 'rgba(40,30,25,0.7)';
            g.beginPath();
            g.arc(x + 14, i * plank + plank * 0.3, 5, 0, Math.PI * 2);
            g.arc(x + 14, i * plank + plank * 0.7, 5, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(50,28,14,0.55)';
          }
          g.strokeStyle = 'rgba(80,45,20,0.18)';
          g.lineWidth = 2;
          for (let k = 0; k < 3; k++) {
            const y = i * plank + plank * (0.25 + k * 0.25);
            g.beginPath();
            g.moveTo(0, y);
            g.bezierCurveTo(s * 0.3, y + 5, s * 0.6, y - 5, s, y + 2);
            g.stroke();
          }
        }
        g.restore();
        // Rope ring.
        for (const [r, w, col] of [[0.93, 26, '#d9b77a'], [0.93, 26, 'rgba(120,80,40,0.6)']] as const) {
          g.strokeStyle = col;
          g.lineWidth = w;
          if (col.startsWith('rgba')) g.setLineDash([18, 22]);
          g.beginPath();
          g.arc(c, c, r * c, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
        }
        // Compass rose.
        disc(0.42, 'rgba(240,225,190,0.85)');
        g.strokeStyle = '#5a3a22';
        g.lineWidth = 8;
        g.beginPath();
        g.arc(c, c, 0.42 * c, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(c, c, 0.36 * c, 0, Math.PI * 2);
        g.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const len = (i % 2 ? 0.24 : 0.38) * c;
          const w = (i % 2 ? 0.05 : 0.07) * c;
          for (const side of [-1, 1]) {
            g.fillStyle = side < 0 ? (i === 0 ? '#c0392b' : '#2d3e50') : '#f2e6c9';
            g.beginPath();
            g.moveTo(c, c);
            g.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
            g.lineTo(c + Math.cos(a + side * Math.PI / 2) * w, c + Math.sin(a + side * Math.PI / 2) * w);
            g.closePath();
            g.fill();
            g.strokeStyle = '#2d3e50';
            g.lineWidth = 3;
            g.stroke();
          }
        }
        disc(0.035, '#d9a441');
      });
      t.anisotropy = 8;
      return t;
    }),
};
