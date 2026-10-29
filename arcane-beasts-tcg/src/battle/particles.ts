// Canvas particle system for impacts, sparkles, embers and smoke.
// Light is drawn additively from cached soft sprites (a white-hot core fading
// into the colour), so glows stack into bright cores instead of muddy blobs;
// smoke and debris are drawn normally. Everything runs on real time (seconds),
// so the speed is the same at 30, 60 or 120 fps.
import { fxScale } from '../lib/fx';

type Shape = 'circle' | 'spark' | 'square' | 'leaf' | 'star' | 'ring' | 'z' | 'ember' | 'smoke' | 'shard' | 'drop';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  shape: Shape;
  g: number;
  drag: number;
  rot: number;
  vr: number;
  glow: boolean;
  grow: number;
  seed: number;
}

/** speeds are px per 60 fps frame, lives in 60 fps frames, gravity px/frame² — the old units, converted on spawn */
interface Preset {
  colors: string[];
  shape: Shape[];
  speed: [number, number];
  size: [number, number];
  life: [number, number];
  g: number;
  drag: number;
  glow: boolean;
  spread?: number; // radians, default full circle
  dir?: number; // base angle
  /** size multiplier reached at the end of life (smoke billows, sparks shrink) */
  grow?: number;
  /** spawn jitter radius in px (× scale) */
  jitter?: number;
}

const PRESETS: Record<string, Preset> = {
  fire: { colors: ['#fff3b0', '#ffc94a', '#ff8a1a', '#ff4a1a'], shape: ['ember', 'spark', 'ember'], speed: [2, 9], size: [2, 5], life: [30, 60], g: -0.1, drag: 0.95, glow: true, grow: 0.3 },
  water: { colors: ['#f2fbff', '#9ad8ff', '#4aa8ff', '#2a6fe0'], shape: ['drop', 'drop', 'circle'], speed: [3, 10], size: [2, 4.5], life: [30, 55], g: 0.3, drag: 0.97, glow: true },
  grass: { colors: ['#eaffc4', '#a8e866', '#5cc04f', '#2e8a3a'], shape: ['leaf'], speed: [2, 7], size: [4, 8], life: [50, 90], g: 0.05, drag: 0.95, glow: false },
  lightning: { colors: ['#ffffff', '#fff9c0', '#ffe44a', '#8fdcff'], shape: ['spark'], speed: [6, 16], size: [1.4, 3], life: [10, 22], g: 0, drag: 0.86, glow: true },
  psychic: { colors: ['#ffffff', '#f3d9ff', '#cf86ff', '#ff7ad9'], shape: ['star', 'circle'], speed: [1.5, 6], size: [2, 5.5], life: [40, 70], g: -0.03, drag: 0.95, glow: true },
  fighting: { colors: ['#ffe9c9', '#e0a066', '#a8602c', '#6b4226'], shape: ['shard', 'square'], speed: [4, 12], size: [2.5, 6], life: [30, 55], g: 0.4, drag: 0.97, glow: false },
  dark: { colors: ['#d6c4ff', '#8f6bff', '#6a3fd6', '#c04dff'], shape: ['ember', 'spark'], speed: [2, 8], size: [2, 5], life: [35, 65], g: -0.04, drag: 0.94, glow: true },
  colorless: { colors: ['#ffffff', '#f6f1e6', '#e2dccf'], shape: ['spark', 'circle'], speed: [4, 11], size: [1.4, 3.5], life: [18, 36], g: 0.05, drag: 0.92, glow: true },
  dust: { colors: ['rgba(255,245,225,0.55)', 'rgba(225,212,190,0.5)', 'rgba(190,178,158,0.45)'], shape: ['smoke'], speed: [1, 4], size: [5, 10], life: [28, 48], g: -0.02, drag: 0.92, glow: false, spread: Math.PI, dir: -Math.PI / 2, grow: 2.2 },
  smoke: { colors: ['rgba(40,40,52,0.55)', 'rgba(70,70,84,0.5)', 'rgba(110,108,120,0.4)'], shape: ['smoke'], speed: [0.6, 2.4], size: [8, 16], life: [40, 75], g: -0.05, drag: 0.95, glow: false, grow: 2.6, jitter: 14 },
  darksmoke: { colors: ['rgba(28,10,48,0.6)', 'rgba(60,24,96,0.5)', 'rgba(20,10,30,0.55)'], shape: ['smoke'], speed: [0.8, 3], size: [9, 18], life: [40, 70], g: -0.03, drag: 0.95, glow: false, grow: 2.4, jitter: 16 },
  steam: { colors: ['rgba(235,245,255,0.35)', 'rgba(200,225,255,0.3)'], shape: ['smoke'], speed: [0.6, 2.2], size: [8, 14], life: [35, 60], g: -0.06, drag: 0.95, glow: false, grow: 2.4, jitter: 14 },
  ember: { colors: ['#fff1b0', '#ffb84a', '#ff7a1a'], shape: ['ember'], speed: [0.6, 3], size: [1.2, 2.6], life: [60, 110], g: -0.06, drag: 0.98, glow: true, jitter: 20 },
  sparkle: { colors: ['#ffffff', '#fff6c9', '#ffd86b', '#aee8ff'], shape: ['star'], speed: [1, 7], size: [3, 7], life: [40, 80], g: -0.02, drag: 0.96, glow: true },
  heal: { colors: ['#f2fff2', '#b6f7b6', '#5ae68f', '#ffffff'], shape: ['circle', 'star'], speed: [0.5, 3], size: [2, 4.5], life: [45, 80], g: -0.14, drag: 0.97, glow: true, jitter: 18 },
  poison: { colors: ['#ecc8ff', '#c06bff', '#8a3ad6', '#a8e866'], shape: ['ring', 'circle'], speed: [0.5, 3], size: [3, 7], life: [40, 70], g: -0.08, drag: 0.97, glow: true, jitter: 14 },
  sleep: { colors: ['#ffffff', '#cfe3ff'], shape: ['z'], speed: [0.5, 2], size: [8, 14], life: [50, 80], g: -0.08, drag: 0.98, glow: false },
  ko: { colors: ['#ffffff', '#d8d8e0', '#9a9aa8', '#5a5a66'], shape: ['shard', 'ember'], speed: [2, 9], size: [2, 5], life: [45, 80], g: -0.04, drag: 0.96, glow: true },
  gold: { colors: ['#fff6c9', '#ffd86b', '#f2c75c', '#ffffff'], shape: ['star', 'spark'], speed: [2, 12], size: [3, 8], life: [50, 100], g: 0.08, drag: 0.97, glow: true },
  mote: { colors: ['#ffffff', '#fff6dc', '#ffe7a8'], shape: ['circle'], speed: [0.4, 2.6], size: [0.8, 2.2], life: [70, 140], g: -0.025, drag: 0.985, glow: true },
  sparkw: { colors: ['#ffffff', '#fffaf0', '#fff1c9'], shape: ['spark'], speed: [3, 9], size: [0.8, 1.6], life: [14, 28], g: 0.05, drag: 0.9, glow: true },
  glint: { colors: ['#ffffff', '#fff3c4', '#ffd98a'], shape: ['star'], speed: [0.6, 4], size: [1.5, 3.5], life: [50, 110], g: -0.01, drag: 0.975, glow: true },
  // pack auras by ★: grey, blue, gold, rainbow, rainbow-gold
  aura1: { colors: ['#ffffff', '#e3e8f0', '#c4cad6'], shape: ['circle'], speed: [0.3, 1.4], size: [0.8, 2], life: [50, 90], g: -0.05, drag: 0.98, glow: true },
  aura2: { colors: ['#ffffff', '#9fd6ff', '#4fb0ff', '#2f7dff'], shape: ['circle', 'spark'], speed: [0.4, 1.8], size: [1, 2.4], life: [50, 90], g: -0.07, drag: 0.98, glow: true },
  aura3: { colors: ['#ffffff', '#fff1b3', '#ffc94a', '#ffa928'], shape: ['ember', 'star'], speed: [0.4, 2], size: [1, 2.8], life: [50, 100], g: -0.08, drag: 0.98, glow: true },
  aura4: { colors: ['#ff7ad9', '#ffd84a', '#6ee3a8', '#4fb3ff', '#b77ae6', '#ffffff'], shape: ['star', 'circle'], speed: [0.5, 2.2], size: [1.2, 3], life: [55, 110], g: -0.08, drag: 0.98, glow: true },
  aura5: { colors: ['#fff6c9', '#ffd84a', '#ffb52e', '#ff7ad9', '#6ee3a8', '#4fb3ff', '#ffffff'], shape: ['star', 'star', 'circle'], speed: [0.6, 2.6], size: [1.4, 3.6], life: [60, 120], g: -0.09, drag: 0.98, glow: true },
  rainbow: { colors: ['#ff5f5f', '#ffd84a', '#6ee36e', '#4fb3ff', '#b77ae6', '#ff5fa2', '#ffffff'], shape: ['star', 'spark'], speed: [3, 14], size: [3, 8], life: [60, 110], g: 0.06, drag: 0.97, glow: true },
};

/** big soft light that swells and fades: hit flashes, glows behind a card */
interface Flash {
  x: number;
  y: number;
  r: number;
  color: string;
  age: number;
  life: number;
}
/** expanding shockwave ring */
interface Ring {
  x: number;
  y: number;
  r: number;
  w: number;
  color: string;
  age: number;
  life: number;
}
/** a jagged bolt or a straight slash, drawn as glowing polylines that fade */
interface Line {
  pts: [number, number][];
  w: number;
  color: string;
  age: number;
  life: number;
  /** slashes wipe in from the start to the end */
  wipe: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ------------------------------------------------------------- sprite cache
const spriteCache = new Map<string, HTMLCanvasElement>();
/** a soft round light: white-hot centre, the colour around it, fading out */
function glowSprite(color: string): HTMLCanvasElement {
  let c = spriteCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.12, color);
  gr.addColorStop(0.38, withAlpha(color, 0.45));
  gr.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  spriteCache.set(color, c);
  return c;
}
/** a soft puff (no hot centre) for smoke and dust */
function puffSprite(color: string): HTMLCanvasElement {
  const key = `puff:${color}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color);
  gr.addColorStop(0.5, withAlpha(color, 0.55));
  gr.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  spriteCache.set(key, c);
  return c;
}

/** '#rrggbb' or 'rgba(…)' with its alpha scaled */
function withAlpha(color: string, a: number): string {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color;
  const [r, g, b, a0 = '1'] = m[1].split(',').map((s) => s.trim());
  return `rgba(${r},${g},${b},${Number(a0) * a})`;
}

class Particles {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private ps: P[] = [];
  private flashes: Flash[] = [];
  private rings: Ring[] = [];
  private lines: Line[] = [];
  private raf = 0;
  private dpr = 1;
  private last = 0;

  attach(c: HTMLCanvasElement | null) {
    this.canvas = c;
    this.ctx = c?.getContext('2d') ?? null;
    this.resize();
  }

  resize() {
    const c = this.canvas;
    if (!c) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, Math.floor(r.width * this.dpr));
    c.height = Math.max(1, Math.floor(r.height * this.dpr));
  }

  private start() {
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  burst(x: number, y: number, preset: string, count: number, scale = 1) {
    const q = fxScale();
    if (q < 1) count = count > 1 ? Math.max(1, Math.round(count * q)) : Math.random() < q ? count : 0;
    const p = PRESETS[preset] ?? PRESETS.colorless;
    const s = Math.max(0.5, scale);
    const j = (p.jitter ?? 6) * s;
    for (let i = 0; i < count; i++) {
      const a = p.spread !== undefined ? (p.dir ?? 0) + rnd(-p.spread / 2, p.spread / 2) : rnd(0, Math.PI * 2);
      const v = rnd(p.speed[0], p.speed[1]) * s * 60;
      this.ps.push({
        x: x + rnd(-j, j),
        y: y + rnd(-j, j),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        age: 0,
        life: rnd(p.life[0], p.life[1]) / 60,
        size: rnd(p.size[0], p.size[1]) * s,
        color: pick(p.colors),
        shape: pick(p.shape),
        g: p.g * s * 3600,
        drag: p.drag,
        rot: rnd(0, Math.PI * 2),
        vr: rnd(-12, 12),
        glow: p.glow,
        grow: p.grow ?? 0.4,
        seed: Math.random() * 100,
      });
    }
    if (count) this.start();
  }

  /** Confetti-like shower from the top of the canvas */
  shower(preset: string, count: number) {
    const c = this.canvas;
    if (!c) return;
    const w = c.width / this.dpr;
    for (let i = 0; i < count; i++) this.burst(rnd(0, w), rnd(-40, 0), preset, 1, 1.4);
  }

  /** a soft light swelling at (x, y): r is its radius in px */
  flash(x: number, y: number, color: string, r: number, life = 0.35) {
    if (fxScale() < 0.3) return;
    this.flashes.push({ x, y, r, color, age: 0, life });
    this.start();
  }

  /** a shockwave ring growing to radius r */
  ring(x: number, y: number, color: string, r: number, life = 0.5, w = 6) {
    this.rings.push({ x, y, r, w, color, age: 0, life });
    this.start();
  }

  /** a forked lightning bolt from (x1, y1) to (x2, y2) */
  bolt(x1: number, y1: number, x2: number, y2: number, color = '#bfe8ff', w = 3, life = 0.3) {
    const make = (ax: number, ay: number, bx: number, by: number, rough: number) => {
      const pts: [number, number][] = [[ax, ay]];
      const n = 9;
      const nx = -(by - ay);
      const ny = bx - ax;
      const len = Math.hypot(nx, ny) || 1;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const off = rnd(-1, 1) * rough * Math.sin(t * Math.PI);
        pts.push([ax + (bx - ax) * t + (nx / len) * off, ay + (by - ay) * t + (ny / len) * off]);
      }
      pts.push([bx, by]);
      return pts;
    };
    const span = Math.hypot(x2 - x1, y2 - y1);
    const main = make(x1, y1, x2, y2, span * 0.12);
    this.lines.push({ pts: main, w, color, age: 0, life, wipe: false });
    // a branch or two off the main stroke
    for (let k = 0; k < 2; k++) {
      const at = main[2 + Math.floor(Math.random() * 5)];
      const ang = Math.atan2(y2 - y1, x2 - x1) + rnd(-0.9, 0.9);
      const l = span * rnd(0.2, 0.35);
      this.lines.push({ pts: make(at[0], at[1], at[0] + Math.cos(ang) * l, at[1] + Math.sin(ang) * l, l * 0.2), w: w * 0.55, color, age: 0, life: life * 0.8, wipe: false });
    }
    this.start();
  }

  /** a quick blade streak through (x, y) at angle a, len px long */
  slash(x: number, y: number, a: number, len: number, color = '#ffffff', w = 5, life = 0.28) {
    const dx = (Math.cos(a) * len) / 2;
    const dy = (Math.sin(a) * len) / 2;
    // a slight curve so it reads as a sweep, not a ruler line
    const bend = len * 0.08;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const c = Math.sin(t * Math.PI) * bend;
      pts.push([x - dx + dx * 2 * t - Math.sin(a) * c, y - dy + dy * 2 * t + Math.cos(a) * c]);
    }
    this.lines.push({ pts, w, color, age: 0, life, wipe: true });
    this.start();
  }

  private tick = (now: number) => {
    const ctx = this.ctx;
    const c = this.canvas;
    if (!ctx || !c) {
      this.raf = 0;
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);

    // flashes and rings under the particles
    ctx.globalCompositeOperation = 'lighter';
    this.flashes = this.flashes.filter((f) => {
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) return false;
      const r = f.r * (0.55 + 0.6 * Math.pow(t, 0.5));
      ctx.globalAlpha = t < 0.15 ? t / 0.15 : Math.pow(1 - (t - 0.15) / 0.85, 1.6);
      ctx.drawImage(glowSprite(f.color), f.x - r, f.y - r, r * 2, r * 2);
      return true;
    });
    this.rings = this.rings.filter((r) => {
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) return false;
      const e = 1 - Math.pow(1 - t, 3);
      const rad = r.r * (0.15 + 0.85 * e);
      ctx.globalAlpha = Math.pow(1 - t, 1.4);
      ctx.strokeStyle = r.color;
      // a soft wide pass and a crisp core
      ctx.lineWidth = r.w * (1 - t) * 2.6 + 1;
      ctx.globalAlpha *= 0.35;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = Math.pow(1 - t, 1.4);
      ctx.lineWidth = Math.max(1, r.w * (1 - t));
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });
    this.lines = this.lines.filter((l) => {
      l.age += dt;
      const t = l.age / l.life;
      if (t >= 1) return false;
      let pts = l.pts;
      if (l.wipe) {
        // the head runs out in the first third, then the tail follows it off
        const head = Math.min(1, t * 3);
        const tail = Math.max(0, (t - 0.3) / 0.7);
        const a = Math.floor(tail * (pts.length - 1));
        const b = Math.max(a + 1, Math.ceil(head * (pts.length - 1)));
        pts = pts.slice(a, b + 1);
      }
      if (pts.length < 2) return true;
      const flick = l.wipe ? 1 : 0.6 + 0.4 * Math.random();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pass = (w: number, color: string, a: number) => {
        ctx.globalAlpha = a * flick * (1 - t);
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      };
      pass(l.w * 5, l.color, 0.18);
      pass(l.w * 2.2, l.color, 0.5);
      pass(l.w * 0.8, '#ffffff', 1);
      return true;
    });

    const next: P[] = [];
    for (const p of this.ps) {
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.age += dt;
      if (p.age >= p.life) continue;
      next.push(p);
      const t = p.age / p.life; // 0 → 1
      const fadeIn = Math.min(1, t * 8);
      const fadeOut = 1 - Math.pow(t, 1.8);
      let alpha = fadeIn * fadeOut;
      const sz = p.size * (1 + (p.grow - 1) * t);
      ctx.save();
      ctx.translate(p.x, p.y);
      switch (p.shape) {
        case 'smoke': {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = alpha * 0.9;
          const s = sz * 2;
          ctx.rotate(p.rot * 0.2);
          ctx.drawImage(puffSprite(p.color), -s, -s, s * 2, s * 2);
          break;
        }
        case 'ember': {
          ctx.globalCompositeOperation = 'lighter';
          alpha *= 0.65 + 0.35 * Math.sin(p.age * 24 + p.seed);
          ctx.globalAlpha = alpha;
          const s = sz * 3.2;
          ctx.drawImage(glowSprite(p.color), -s, -s, s * 2, s * 2);
          break;
        }
        case 'circle': {
          ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
          ctx.globalAlpha = alpha;
          if (p.glow) {
            const s = sz * 3;
            ctx.drawImage(glowSprite(p.color), -s, -s, s * 2, s * 2);
          } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(0, 0, sz, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'drop': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha * 0.9;
          ctx.rotate(Math.atan2(p.vy, p.vx));
          const sp = Math.hypot(p.vx, p.vy) / 60;
          const len = sz * (1.6 + Math.min(3, sp * 0.4));
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, len, sz * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = alpha * 0.5;
          const s = sz * 2.6;
          ctx.drawImage(glowSprite(p.color), -s, -s, s * 2, s * 2);
          break;
        }
        case 'spark': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha;
          ctx.rotate(Math.atan2(p.vy, p.vx));
          const sp = Math.hypot(p.vx, p.vy) / 60;
          const len = Math.max(sz * 3, sp * 3.2);
          const gr = ctx.createLinearGradient(-len, 0, 0, 0);
          gr.addColorStop(0, withAlpha(p.color, 0));
          gr.addColorStop(0.7, p.color);
          gr.addColorStop(1, '#ffffff');
          ctx.strokeStyle = gr;
          ctx.lineWidth = sz * 0.9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-len, 0);
          ctx.lineTo(0, 0);
          ctx.stroke();
          if (p.glow) {
            const s = sz * 2.4;
            ctx.globalAlpha = alpha * 0.6;
            ctx.drawImage(glowSprite(p.color), -s, -s, s * 2, s * 2);
          }
          break;
        }
        case 'star': {
          // a four-point flare that twinkles
          ctx.globalCompositeOperation = 'lighter';
          const tw = 0.6 + 0.4 * Math.sin(p.age * 18 + p.seed);
          ctx.globalAlpha = alpha;
          const s = sz * 2.2;
          ctx.drawImage(glowSprite(p.color), -s, -s, s * 2, s * 2);
          ctx.rotate(p.rot * 0.15);
          const L = sz * 3.4 * tw;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(-L, 0);
          ctx.lineTo(0, -sz * 0.18);
          ctx.lineTo(L, 0);
          ctx.lineTo(0, sz * 0.18);
          ctx.closePath();
          ctx.moveTo(0, -L);
          ctx.lineTo(sz * 0.18, 0);
          ctx.lineTo(0, L);
          ctx.lineTo(-sz * 0.18, 0);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'shard': {
          ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
          ctx.globalAlpha = alpha;
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(-sz * 1.3, -sz * 0.35);
          ctx.lineTo(sz * 1.4, 0);
          ctx.lineTo(-sz * 0.9, sz * 0.5);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'square': {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = alpha;
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
          break;
        }
        case 'leaf': {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = alpha;
          // leaves flutter: the width flips as they turn
          ctx.rotate(p.rot);
          const flip = Math.abs(Math.sin(p.age * 7 + p.seed));
          const gr = ctx.createLinearGradient(-sz, 0, sz, 0);
          gr.addColorStop(0, p.color);
          gr.addColorStop(1, withAlpha('#ffffff', 0.85));
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.ellipse(0, 0, sz, sz * 0.45 * (0.25 + 0.75 * flip), 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'ring': {
          ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, sz * 0.3);
          ctx.beginPath();
          ctx.arc(0, 0, sz, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'z': {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.font = `900 ${sz * 1.6}px sans-serif`;
          ctx.fillText('Z', 0, 0);
          break;
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.ps = next;
    const alive = next.length || this.flashes.length || this.rings.length || this.lines.length;
    this.raf = alive ? requestAnimationFrame(this.tick) : 0;
    if (!alive) ctx.clearRect(0, 0, c.width, c.height);
  };
}

export const particles = new Particles();
