/**
 * Tiny position-based circle physics, tuned for a pile of soft pieces.
 * Much cheaper than a general engine (≈0.05ms/step for 60 circles) and
 * settles without jitter, which matters for a board you trace with a finger.
 */
export interface PBody {
  position: { x: number; y: number };
  /** Velocity in px/s. */
  velocity: { x: number; y: number };
  r: number;
  invMass: number;
  /** previous position (internal) */
  px: number;
  py: number;
}

export interface WorldOpts {
  gravity: number;
  /** Walls: inner bounds; top is open. */
  left: number;
  right: number;
  bottom: number;
  iterations?: number;
  /** Per-second velocity damping (air drag). */
  drag?: number;
  /** 0..1 tangential friction at contacts. */
  friction?: number;
  /** Optional circular container (gacha dome). */
  circle?: { x: number; y: number; r: number };
}

export class World {
  bodies: PBody[] = [];
  o: WorldOpts;
  constructor(o: WorldOpts) {
    this.o = o;
  }

  add(x: number, y: number, r: number, mass = 1): PBody {
    const b: PBody = { position: { x, y }, velocity: { x: 0, y: 0 }, r, invMass: 1 / mass, px: x, py: y };
    this.bodies.push(b);
    return b;
  }

  remove(b: PBody): void {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  clear(): void {
    this.bodies = [];
  }

  step(dt: number): void {
    const o = this.o;
    const bs = this.bodies;
    const n = bs.length;
    const drag = Math.max(0, 1 - (o.drag ?? 0.4) * dt);
    // integrate
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      b.velocity.y += o.gravity * dt;
      b.velocity.x *= drag;
      b.velocity.y *= drag;
      b.px = b.position.x;
      b.py = b.position.y;
      b.position.x += b.velocity.x * dt;
      b.position.y += b.velocity.y * dt;
    }
    const iters = o.iterations ?? 6;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n; i++) {
        const a = bs[i];
        const ax = a.position.x;
        const ay = a.position.y;
        for (let j = i + 1; j < n; j++) {
          const b = bs[j];
          const rr = a.r + b.r;
          const dx = b.position.x - ax;
          if (dx > rr || dx < -rr) continue;
          const dy = b.position.y - ay;
          if (dy > rr || dy < -rr) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const pen = (rr - d) / d;
          const w = a.invMass + b.invMass;
          const ka = (a.invMass / w) * pen * 0.9;
          const kb = (b.invMass / w) * pen * 0.9;
          a.position.x -= dx * ka;
          a.position.y -= dy * ka;
          b.position.x += dx * kb;
          b.position.y += dy * kb;
        }
      }
      for (let i = 0; i < n; i++) this.walls(bs[i]);
    }
    // derive velocities + contact friction
    const fr = o.friction ?? 0.15;
    const inv = 1 / dt;
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      let vx = (b.position.x - b.px) * inv;
      let vy = (b.position.y - b.py) * inv;
      // resting on the floor: kill sideways sliding a bit
      if (b.position.y >= o.bottom - b.r - 0.5) vx *= 1 - fr;
      // resting pieces lose tiny jitter
      if (vx * vx + vy * vy < 25) {
        vx *= 0.6;
        vy *= 0.6;
      }
      b.velocity.x = vx;
      b.velocity.y = vy;
    }
  }

  private walls(b: PBody): void {
    const o = this.o;
    if (o.circle) {
      const c = o.circle;
      const dx = b.position.x - c.x;
      const dy = b.position.y - c.y;
      const d = Math.hypot(dx, dy);
      const max = c.r - b.r;
      if (d > max && d > 0) {
        b.position.x = c.x + (dx / d) * max;
        b.position.y = c.y + (dy / d) * max;
      }
      return;
    }
    if (b.position.x < o.left + b.r) b.position.x = o.left + b.r;
    else if (b.position.x > o.right - b.r) b.position.x = o.right - b.r;
    if (b.position.y > o.bottom - b.r) b.position.y = o.bottom - b.r;
  }
}
