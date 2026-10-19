import { Container, Sprite, Texture } from 'pixi.js';

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
  drag: number;
  spin: number;
  s0: number;
  s1: number;
  a0: number;
  active: boolean;
}

export interface BurstOpts {
  count?: number;
  speed?: [number, number];
  size?: [number, number];
  /** End scale multiplier. */
  grow?: number;
  life?: [number, number];
  gravity?: number;
  drag?: number;
  tex?: string;
  tint?: number | number[];
  add?: boolean;
  spin?: number;
  alpha?: number;
  /** Emission spread around `dir` (radians). Full circle by default. */
  dir?: number;
  spread?: number;
}

const fxCache = new Map<string, Texture>();

/** Particle textures are drawn procedurally (white, tinted at runtime). */
export function fx(name: string): Texture {
  let t = fxCache.get(name);
  if (t) return t;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const m = size / 2;
  const radial = (stops: [number, number][]) => {
    const gr = g.createRadialGradient(m, m, 0, m, m, m);
    for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  };
  const sparkle = (arms: number, inner: number) => {
    g.translate(m, m);
    g.beginPath();
    for (let i = 0; i < arms * 2; i++) {
      const a = (i / (arms * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? m * 0.95 : m * inner;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 10;
    g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
  };
  switch (name) {
    case 'star_06':
    case 'star_04':
      sparkle(4, 0.16);
      break;
    case 'light_03':
      g.lineWidth = 9;
      g.strokeStyle = '#fff';
      g.shadowColor = '#fff';
      g.shadowBlur = 14;
      g.beginPath();
      g.arc(m, m, m * 0.72, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'light_01':
      radial([[0, 1], [0.25, 0.8], [1, 0]]);
      break;
    case 'smoke_04':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const gr = g.createRadialGradient(m + Math.cos(a) * 22, m + Math.sin(a) * 22, 0, m + Math.cos(a) * 22, m + Math.sin(a) * 22, 34);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, size, size);
      }
      break;
    case 'flame_04':
    case 'muzzle_02':
      sparkle(8, 0.45);
      break;
    default:
      radial([[0, 1], [0.45, 0.7], [1, 0]]);
  }
  t = Texture.from(c);
  fxCache.set(name, t);
  return t;
}

/** Lightweight pooled sprite particle system. Coordinates are local to `view`. */
export class Effects {
  readonly view = new Container();
  private pool: Particle[] = [];

  private get(): Particle {
    for (const p of this.pool) if (!p.active) return p;
    const s = new Sprite();
    s.anchor.set(0.5);
    this.view.addChild(s);
    const p: Particle = { s, vx: 0, vy: 0, life: 0, max: 1, g: 0, drag: 0, spin: 0, s0: 1, s1: 1, a0: 1, active: false };
    this.pool.push(p);
    return p;
  }

  burst(x: number, y: number, o: BurstOpts = {}): void {
    const n = o.count ?? 10;
    const tints = Array.isArray(o.tint) ? o.tint : [o.tint ?? 0xffffff];
    const tex = fx(o.tex ?? 'circle_05');
    for (let i = 0; i < n; i++) {
      const p = this.get();
      p.active = true;
      p.s.visible = true;
      p.s.texture = tex;
      p.s.tint = tints[i % tints.length];
      p.s.blendMode = o.add ? 'add' : 'normal';
      const dir = o.dir ?? 0;
      const spread = o.spread ?? Math.PI * 2;
      const a = dir + (Math.random() - 0.5) * spread;
      const [sp0, sp1] = o.speed ?? [150, 420];
      const sp = sp0 + Math.random() * (sp1 - sp0);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      const [l0, l1] = o.life ?? [0.35, 0.7];
      p.max = p.life = l0 + Math.random() * (l1 - l0);
      p.g = o.gravity ?? 600;
      p.drag = o.drag ?? 2.5;
      p.spin = (Math.random() - 0.5) * (o.spin ?? 6);
      const [z0, z1] = o.size ?? [0.08, 0.18];
      // sizes were tuned for 256px sprites; the procedural textures are 128px
      p.s0 = (z0 + Math.random() * (z1 - z0)) * 2;
      p.s1 = p.s0 * (o.grow ?? 0.2);
      p.a0 = o.alpha ?? 1;
      p.s.position.set(x, y);
      p.s.rotation = Math.random() * Math.PI * 2;
      p.s.scale.set(p.s0);
      p.s.alpha = p.a0;
    }
  }

  /** One expanding ring/flash. */
  ring(x: number, y: number, tint: number, size = 0.5, life = 0.35, tex = 'light_03'): void {
    this.burst(x, y, { count: 1, speed: [0, 0], size: [size * 0.3, size * 0.3], grow: 3.3, life: [life, life], gravity: 0, tex, tint, add: true, spin: 0 });
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.s.visible = false;
        continue;
      }
      const k = 1 - p.life / p.max;
      p.vx *= 1 - Math.min(1, p.drag * dt);
      p.vy *= 1 - Math.min(1, p.drag * dt);
      p.vy += p.g * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
      p.s.alpha = p.a0 * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.s.visible = false;
    }
  }
}
