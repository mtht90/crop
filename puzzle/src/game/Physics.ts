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
  /** Strongest approach speed (px/s) against a neighbor/wall during the last step, and its normal. */
  impact: number;
  nx: number;
  ny: number;
  /** Pinned bodies don't move (sticky obstructions) but still push others. */
  pinned?: boolean;
}

export interface WorldOpts {
  gravity: number;
  /** Sideways gravity (wind). */
  gravityX?: number;
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
  /**
   * Optional bowl: a circle whose upper half narrows into an open chute of
   * half-width `hole`, so pieces can drop in from above (puzzle board).
   */
  bowl?: { x: number; y: number; r: number; hole: number; ext?: number };
}

export class World {
  bodies: PBody[] = [];
  o: WorldOpts;
  constructor(o: WorldOpts) {
    this.o = o;
  }

  add(x: number, y: number, r: number, mass = 1): PBody {
    const b: PBody = { position: { x, y }, velocity: { x: 0, y: 0 }, r, invMass: 1 / mass, px: x, py: y, impact: 0, nx: 0, ny: 0 };
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
    // record contact impacts from pre-step velocities (drives the jelly squash)
    for (let i = 0; i < n; i++) bs[i].impact = 0;
    for (let i = 0; i < n; i++) {
      const a = bs[i];
      if (a.position.y >= o.bottom - a.r - 1 && a.velocity.y > a.impact) this.hit(a, a.velocity.y, 0, 1);
      if (o.bowl) {
        // lower rim of the bowl
        const c = o.bowl;
        const dx = a.position.x - c.x;
        const dy = a.position.y - c.y - (c.ext ?? 0);
        const d = Math.hypot(dx, dy);
        if (dy > 0 && d >= c.r - a.r - 1 && d > 0) {
          const vn = (a.velocity.x * dx + a.velocity.y * dy) / d;
          if (vn > 0) this.hit(a, vn, dx / d, dy / d);
        }
      }
      for (let j = i + 1; j < n; j++) {
        const b = bs[j];
        const rr = (a.r + b.r) * 1.02;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        const d = Math.hypot(dx, dy);
        if (d >= rr || d === 0) continue;
        const ux = dx / d;
        const uy = dy / d;
        const vn = (a.velocity.x - b.velocity.x) * ux + (a.velocity.y - b.velocity.y) * uy;
        if (vn > 0) {
          this.hit(a, vn, ux, uy);
          this.hit(b, vn, -ux, -uy);
        }
      }
    }
    // integrate
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (b.pinned) {
        b.velocity.x = b.velocity.y = 0;
        b.px = b.position.x;
        b.py = b.position.y;
        continue;
      }
      b.velocity.y += o.gravity * dt;
      b.velocity.x += (o.gravityX ?? 0) * dt;
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
          if (w === 0) continue;
          const ka = (a.invMass / w) * pen * 0.9;
          const kb = (b.invMass / w) * pen * 0.9;
          a.position.x -= dx * ka;
          a.position.y -= dy * ka;
          b.position.x += dx * kb;
          b.position.y += dy * kb;
        }
      }
      for (let i = 0; i < n; i++) if (!bs[i].pinned) this.walls(bs[i]);
    }
    // derive velocities + contact friction
    const fr = o.friction ?? 0.15;
    const inv = 1 / dt;
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (b.pinned) continue;
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

  private hit(b: PBody, v: number, nx: number, ny: number): void {
    if (v <= b.impact) return;
    b.impact = v;
    b.nx = nx;
    b.ny = ny;
  }

  private walls(b: PBody): void {
    const o = this.o;
    if (o.bowl) {
      const c = o.bowl;
      const ext = c.ext ?? 0;
      const dx = b.position.x - c.x;
      let dy = b.position.y - c.y;
      const max = c.r - b.r;
      if (dy >= ext) {
        // lower half-circle
        dy -= ext;
        const d = Math.hypot(dx, dy);
        if (d > max && d > 0) {
          b.position.x = c.x + (dx / d) * max;
          b.position.y = c.y + ext + (dy / d) * max;
        }
      } else if (dy >= 0) {
        // straight sides of a tall (stadium) bowl
        if (dx > max) b.position.x = c.x + max;
        else if (dx < -max) b.position.x = c.x - max;
      } else {
        // upper half: side walls follow the circle until it narrows to the chute
        const hw = dy > -max ? Math.max(c.hole, Math.sqrt(max * max - dy * dy)) : c.hole;
        if (dx > hw) b.position.x = c.x + hw;
        else if (dx < -hw) b.position.x = c.x - hw;
      }
      return;
    }
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
