import { Container, Sprite, Texture, Assets } from 'pixi.js';

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

export function fx(name: string): Texture {
  return Assets.get<Texture>(`fx:${name}`) ?? Texture.WHITE;
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
      p.s0 = z0 + Math.random() * (z1 - z0);
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
