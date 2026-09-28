// Lightweight canvas particle system for impacts, sparkles and dust
type Shape = 'circle' | 'spark' | 'square' | 'leaf' | 'star' | 'ring' | 'z';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: Shape;
  g: number;
  drag: number;
  rot: number;
  vr: number;
  glow: boolean;
}

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
}

const PRESETS: Record<string, Preset> = {
  fire: { colors: ['#fff3b0', '#ffc94a', '#ff7a1a', '#ff3d1a'], shape: ['circle', 'spark'], speed: [2, 9], size: [2, 6], life: [30, 60], g: -0.08, drag: 0.95, glow: true },
  water: { colors: ['#e6f7ff', '#8fd3ff', '#3fa0ff', '#1d5fd6'], shape: ['circle'], speed: [3, 9], size: [2, 5], life: [30, 55], g: 0.25, drag: 0.97, glow: false },
  grass: { colors: ['#e9ffc2', '#9be15d', '#4caf50', '#2e7d32'], shape: ['leaf'], speed: [2, 7], size: [4, 8], life: [45, 80], g: 0.06, drag: 0.96, glow: false },
  lightning: { colors: ['#ffffff', '#fff7a8', '#ffe04a', '#7fd3ff'], shape: ['spark'], speed: [5, 14], size: [2, 4], life: [12, 26], g: 0, drag: 0.88, glow: true },
  psychic: { colors: ['#ffffff', '#f1d4ff', '#c77dff', '#ff7ad9'], shape: ['star', 'circle'], speed: [1.5, 6], size: [2, 6], life: [40, 70], g: -0.03, drag: 0.95, glow: true },
  fighting: { colors: ['#f5d1a8', '#c98a55', '#8f4a1f', '#5a3a22'], shape: ['square'], speed: [3, 10], size: [3, 7], life: [30, 55], g: 0.35, drag: 0.97, glow: false },
  dark: { colors: ['#a7abd8', '#5b5f8a', '#2a2c50', '#b04dff'], shape: ['circle', 'spark'], speed: [2, 8], size: [3, 7], life: [35, 65], g: -0.02, drag: 0.94, glow: true },
  colorless: { colors: ['#ffffff', '#f3efe6', '#d8d2c4'], shape: ['spark', 'circle'], speed: [3, 10], size: [2, 5], life: [20, 40], g: 0.05, drag: 0.93, glow: true },
  dust: { colors: ['rgba(255,245,220,0.8)', 'rgba(220,210,190,0.7)', 'rgba(180,170,150,0.6)'], shape: ['circle'], speed: [1, 4], size: [3, 8], life: [25, 45], g: -0.02, drag: 0.92, glow: false, spread: Math.PI, dir: -Math.PI / 2 },
  sparkle: { colors: ['#ffffff', '#fff6c9', '#ffd86b', '#aee8ff'], shape: ['star'], speed: [1, 7], size: [3, 7], life: [40, 80], g: -0.02, drag: 0.96, glow: true },
  heal: { colors: ['#eaffea', '#a6f3a6', '#4ade80', '#ffffff'], shape: ['circle', 'star'], speed: [0.5, 3], size: [2, 5], life: [40, 70], g: -0.12, drag: 0.97, glow: true },
  poison: { colors: ['#e2b6ff', '#b04dff', '#7b2cbf', '#9be15d'], shape: ['ring', 'circle'], speed: [0.5, 3], size: [3, 7], life: [40, 70], g: -0.08, drag: 0.97, glow: false },
  sleep: { colors: ['#ffffff', '#cfe3ff'], shape: ['z'], speed: [0.5, 2], size: [8, 14], life: [50, 80], g: -0.08, drag: 0.98, glow: false },
  ko: { colors: ['#ffffff', '#cccccc', '#888888', '#444444'], shape: ['square', 'circle'], speed: [2, 11], size: [2, 6], life: [40, 70], g: 0.18, drag: 0.96, glow: false },
  gold: { colors: ['#fff6c9', '#ffd86b', '#f2c75c', '#ffffff'], shape: ['star', 'spark'], speed: [2, 12], size: [3, 8], life: [50, 100], g: 0.08, drag: 0.97, glow: true },
  mote: { colors: ['#ffffff', '#fff6dc', '#ffe7a8'], shape: ['circle'], speed: [0.4, 2.6], size: [0.8, 2.2], life: [70, 140], g: -0.025, drag: 0.985, glow: true },
  sparkw: { colors: ['#ffffff', '#fffaf0', '#fff1c9'], shape: ['spark'], speed: [3, 9], size: [0.8, 1.6], life: [14, 28], g: 0.05, drag: 0.9, glow: true },
  glint: { colors: ['#ffffff', '#fff3c4', '#ffd98a'], shape: ['star'], speed: [0.6, 4], size: [1.5, 3.5], life: [50, 110], g: -0.01, drag: 0.975, glow: true },
  aura0: { colors: ['#ffffff', '#e3eeff', '#cfe3ff'], shape: ['circle'], speed: [0.3, 1.4], size: [0.8, 2], life: [50, 90], g: -0.05, drag: 0.98, glow: true },
  aura1: { colors: ['#ffffff', '#9fd6ff', '#4fb0ff', '#2f7dff'], shape: ['circle', 'spark'], speed: [0.4, 1.8], size: [1, 2.4], life: [50, 90], g: -0.07, drag: 0.98, glow: true },
  aura2: { colors: ['#ffffff', '#fff1b3', '#ffc94a', '#ffa928'], shape: ['circle', 'star'], speed: [0.4, 2], size: [1, 2.8], life: [50, 100], g: -0.08, drag: 0.98, glow: true },
  aura3: { colors: ['#ff7ad9', '#ffd84a', '#6ee3a8', '#4fb3ff', '#b77ae6', '#ffffff'], shape: ['star', 'circle'], speed: [0.5, 2.2], size: [1.2, 3], life: [55, 110], g: -0.08, drag: 0.98, glow: true },
  rainbow: { colors: ['#ff5f5f', '#ffd84a', '#6ee36e', '#4fb3ff', '#b77ae6', '#ff5fa2', '#ffffff'], shape: ['star', 'spark'], speed: [3, 14], size: [3, 8], life: [60, 110], g: 0.06, drag: 0.97, glow: true },
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

class Particles {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private ps: P[] = [];
  private raf = 0;
  private dpr = 1;

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

  burst(x: number, y: number, preset: string, count: number, scale = 1) {
    const p = PRESETS[preset] ?? PRESETS.colorless;
    const s = Math.max(0.5, scale);
    for (let i = 0; i < count; i++) {
      const a = p.spread !== undefined ? (p.dir ?? 0) + rnd(-p.spread / 2, p.spread / 2) : rnd(0, Math.PI * 2);
      const v = rnd(p.speed[0], p.speed[1]) * s;
      const max = rnd(p.life[0], p.life[1]);
      this.ps.push({
        x: x + rnd(-6, 6) * s,
        y: y + rnd(-6, 6) * s,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: max,
        max,
        size: rnd(p.size[0], p.size[1]) * s,
        color: pick(p.colors),
        shape: pick(p.shape),
        g: p.g * s,
        drag: p.drag,
        rot: rnd(0, Math.PI * 2),
        vr: rnd(-0.2, 0.2),
        glow: p.glow,
      });
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  /** Confetti-like shower from the top of the canvas */
  shower(preset: string, count: number) {
    const c = this.canvas;
    if (!c) return;
    const w = c.width / this.dpr;
    for (let i = 0; i < count; i++) this.burst(rnd(0, w), rnd(-40, 0), preset, 1, 1.4);
  }

  private tick = () => {
    const ctx = this.ctx;
    const c = this.canvas;
    if (!ctx || !c) {
      this.raf = 0;
      return;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const next: P[] = [];
    for (const p of this.ps) {
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life--;
      if (p.life <= 0) continue;
      next.push(p);
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.size * 2.5;
      } else ctx.shadowBlur = 0;
      const sz = p.size * (0.4 + 0.6 * t);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      switch (p.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, sz, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'square':
          ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
          break;
        case 'spark': {
          ctx.rotate(Math.atan2(p.vy, p.vx) - p.rot);
          const len = Math.max(sz * 2, Math.hypot(p.vx, p.vy) * 3);
          ctx.lineWidth = sz * 0.7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-len, 0);
          ctx.lineTo(0, 0);
          ctx.stroke();
          break;
        }
        case 'leaf':
          ctx.beginPath();
          ctx.ellipse(0, 0, sz, sz * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'star': {
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const r = i % 2 ? sz * 0.35 : sz;
            const a = (i * Math.PI) / 4;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'ring':
          ctx.lineWidth = sz * 0.3;
          ctx.beginPath();
          ctx.arc(0, 0, sz, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'z':
          ctx.rotate(-p.rot);
          ctx.font = `900 ${sz * 1.6}px sans-serif`;
          ctx.fillText('Z', 0, 0);
          break;
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    this.ps = next;
    this.raf = next.length ? requestAnimationFrame(this.tick) : 0;
    if (!next.length) ctx.clearRect(0, 0, c.width, c.height);
  };
}

export const particles = new Particles();
