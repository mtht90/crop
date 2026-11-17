import * as THREE from 'three';
import { Input } from './input';
import { GRAVITY, JUMP_V, SPEED_FLOOR, Track } from './world/track';
import { Collider, Ramp } from './world/types';

export type PState = 'run' | 'air' | 'slide' | 'wallrun' | 'dead';

const R = 0.32;            // half-width of the player box
const STAND_H = 1.8;
const SLIDE_H = 0.95;
const LAT_MAX = 9.5;
const WALL_G = 3.2;
const WALL_MAX = 2.6;

export interface PlayerEvents {
  style(name: string, pts: number, opts?: { big?: boolean; warn?: boolean }): void;
  jump(kind: 'normal' | 'wall' | 'slidehop'): void;
  land(impact: number, kind: 'soft' | 'hard' | 'roll'): void;
  vault(): void;
  slideStart(): void;
  wallStart(): void;
  boost(): void;
  orb(): void;
  ring(): void;
  smash(): void;
  die(reason: 'crash' | 'fall'): void;
}

export class Player {
  pos = new THREE.Vector3();
  vx = 0;
  vy = 0;
  speed = 0;           // forward speed (towards -Z)
  state: PState = 'run';
  height = STAND_H;
  grounded = true;
  coyote = 0;
  jumpBuf = 0;
  slideBuf = 0;
  slideTime = 0;
  slideHopCd = 0;
  airTime = 0;
  wall: Collider | null = null;
  wallSide = 0;
  wallTime = 0;
  lastWall: Collider | null = null;
  wallCd = 0;
  boost = 0;
  overdrive = 0;
  flow = 0;
  lastGroundY = 0;
  ramp: Ramp | null = null;
  rampSlope = 0;
  vaultTimer = 0;
  maxFallV = 0;
  topSpeed = 0;
  deathReason: 'crash' | 'fall' | '' = '';
  /** how long a landing roll is allowed after pressing slide */
  constructor(public ev: PlayerEvents) {}

  reset(z: number, y: number, speed: number) {
    this.pos.set(0, y, z);
    this.vx = 0; this.vy = 0; this.speed = speed; this.state = 'run'; this.height = STAND_H;
    this.grounded = true; this.coyote = 0; this.jumpBuf = 0; this.slideBuf = 0; this.slideTime = 0; this.airTime = 0;
    this.wall = null; this.wallSide = 0; this.wallTime = 0; this.lastWall = null; this.wallCd = 0;
    this.boost = 0; this.overdrive = 0; this.flow = 0; this.lastGroundY = y; this.ramp = null; this.vaultTimer = 0; this.topSpeed = 0;
    this.deathReason = '';
  }

  get alive() { return this.state !== 'dead'; }

  // ---------------------------------------------------------------------------
  update(dt: number, input: Input, track: Track, vb: number) {
    if (this.state === 'dead') {
      // keep falling / tumbling
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      this.pos.z -= this.speed * dt;
      this.speed = Math.max(0, this.speed - 30 * dt);
      if (this.deathReason === 'crash') { this.pos.y = Math.max(this.pos.y, this.lastGroundY); }
      return;
    }
    // ---- timers / inputs
    if (input.hit('Space', 'KeyW', 'ArrowUp')) this.jumpBuf = 0.14;
    if (input.hit('ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft', 'KeyS', 'ArrowDown')) this.slideBuf = 0.3;
    this.jumpBuf -= dt; this.slideBuf -= dt; this.coyote -= dt; this.slideHopCd -= dt; this.wallCd -= dt; this.vaultTimer -= dt;
    this.boost = Math.max(0, this.boost - dt * (2 + this.boost * 0.35));
    if (this.overdrive > 0) { this.overdrive -= dt; this.flow = Math.max(0, this.overdrive / 6); }
    else if ((input.hit('KeyE', 'Mouse2', 'KeyQ')) && this.flow >= 1) { this.overdrive = 6; this.ev.style('OVERDRIVE', 500, { big: true }); this.ev.boost(); }

    // ---- lateral
    const strafe = input.strafe;
    const latAcc = this.state === 'run' ? 70 : this.state === 'slide' ? 28 : this.state === 'wallrun' ? 0 : 34;
    if (this.state !== 'wallrun') this.vx = approach(this.vx, strafe * LAT_MAX, latAcc * dt);

    // ---- forward speed
    let target = vb + this.boost;
    if (this.overdrive > 0) target *= 1.32;
    switch (this.state) {
      case 'run': this.speed = this.speed < target ? approach(this.speed, target, 9 * dt) : approach(this.speed, target, 3.5 * dt); break;
      case 'air': this.speed = this.speed < target ? approach(this.speed, target, 1.2 * dt) : approach(this.speed, target, 0.6 * dt); break;
      case 'slide': {
        const downhill = this.ramp ? -this.rampSlope : 0;
        this.speed += (downhill > 0 ? downhill * GRAVITY * 0.9 : -2.2) * dt;
        if (this.speed > target + 12) this.speed = approach(this.speed, target + 12, 4 * dt);
        break;
      }
      case 'wallrun': this.speed = approach(this.speed, target + 3, 5 * dt); break;
    }
    this.speed = Math.max(this.speed, vb * SPEED_FLOOR);
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    // ---- jumping
    if (this.jumpBuf > 0) {
      if (this.state === 'wallrun') {
        this.jumpBuf = 0;
        this.vy = JUMP_V * 0.95;
        this.vx = -this.wallSide * 8.5;
        this.speed += 1.5;
        this.lastWall = this.wall; this.wallCd = 0.3;
        this.leaveWall();
        this.ev.jump('wall');
        this.ev.style('WALL KICK', 150);
      } else if (this.grounded || this.coyote > 0) {
        this.jumpBuf = 0;
        const fromSlide = this.state === 'slide' && this.slideTime > 0.12 && this.slideHopCd <= 0;
        // jumping off a ramp keeps the ramp's launch
        const launch = this.ramp && this.rampSlope > 0 ? this.speed * this.rampSlope : 0;
        this.vy = JUMP_V + launch * 0.6;
        if (fromSlide) { this.speed += 2.5; this.slideHopCd = 1.2; this.ev.style('SLIDE HOP', 80); }
        this.setState('air');
        this.grounded = false; this.coyote = 0;
        this.ev.jump(fromSlide ? 'slidehop' : 'normal');
      }
    }

    // ---- slide start / end
    if (this.grounded && this.state === 'run' && input.slide && this.speed > 6 && this.vaultTimer <= 0) {
      this.setState('slide');
    }
    if (this.state === 'slide') {
      this.slideTime += dt;
      if (!input.slide && this.headroom(track, STAND_H)) this.setState('run');
    }

    // ---- tuck (crouch) in the air so low barriers right after a landing are fair
    if (this.state === 'air') {
      const want = input.slide ? SLIDE_H : STAND_H;
      if (want < this.height || this.headroom(track, STAND_H)) this.height = want;
    }

    // ---- gravity
    const g = this.state === 'wallrun' ? (this.wallTime < 1.5 ? WALL_G : WALL_G + (this.wallTime - 1.5) * 25) : GRAVITY;
    if (!this.grounded) this.vy -= g * dt;
    if (this.state === 'wallrun') {
      this.wallTime += dt;
      if (this.wallTime > WALL_MAX) { this.lastWall = this.wall; this.wallCd = 0.5; this.leaveWall(); }
      else if (strafe === -this.wallSide) { this.lastWall = this.wall; this.wallCd = 0.35; this.vx = -this.wallSide * 3; this.leaveWall(); }
      else this.vx = this.wallSide * 2;
    }

    // ---- integrate with sub-steps (anti-tunneling)
    const moveLen = Math.max(Math.abs(this.speed), Math.abs(this.vy), Math.abs(this.vx)) * dt;
    const steps = Math.max(1, Math.ceil(moveLen / 0.22));
    const h = dt / steps;
    const wasGrounded = this.grounded;
    let landedV = 0;
    for (let i = 0; i < steps && (this.state as PState) !== 'dead'; i++) {
      const lv = this.stepY(this.vy * h, track);
      if (lv) landedV = Math.max(landedV, lv);
      this.stepX(this.vx * h, track);
      this.stepZ(-this.speed * h, track);
    }
    if ((this.state as PState) === 'dead') return;

    // ---- ground probe (walk off edges)
    if (this.grounded && !this.probeGround(track)) {
      this.grounded = false; this.coyote = 0.11; this.ramp = null;
      if (this.state === 'run' || this.state === 'slide') this.setState('air');
    }
    if (!wasGrounded && this.grounded) this.onLand(landedV, input);
    if (!this.grounded) { this.airTime += dt; this.maxFallV = Math.min(this.maxFallV, this.vy); }

    // ---- wall-run detection
    if (this.state === 'air' && this.speed > 10) this.tryWall(track, strafe);
    if (this.state === 'wallrun' && this.wall) {
      const w = this.wall;
      if (this.pos.z < w.min.z + 0.2 || this.pos.y + 0.6 < w.min.y || this.pos.y > w.max.y - 0.2) { this.lastWall = w; this.wallCd = 0.3; this.leaveWall(); }
    }

    // ---- pickups / pass-through checks
    this.triggers(track);

    // ---- fall death
    if (!this.grounded && this.pos.y < this.lastGroundY - 22) {
      const ch = track.chunkAt(this.pos.z);
      (this as any).lastHit = { fall: true, exit: (ch as any)?.exit, x: this.pos.x, z: this.pos.z, lastGroundY: this.lastGroundY };
      this.die('fall');
    }
  }

  // ---------------------------------------------------------------------------
  private setState(s: PState) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    if (s !== 'air') this.height = s === 'slide' ? SLIDE_H : STAND_H;
    if (s === 'slide') { this.slideTime = 0; this.ev.slideStart(); }
    if (prev === 'wallrun') this.wall = null;
  }

  private leaveWall() {
    this.wall = null; this.wallSide = 0; this.wallTime = 0;
    this.setState('air');
  }

  die(reason: 'crash' | 'fall') {
    if (this.state === 'dead') return;
    this.deathReason = reason;
    this.state = 'dead';
    if (reason === 'crash') { this.vy = 2; }
    this.ev.die(reason);
  }

  private onLand(v: number, input: Input) {
    const impact = -v;
    this.airTime = 0;
    this.maxFallV = 0;
    if (impact > 18) {
      if (input.slide || this.slideBuf > 0) {
        this.ev.land(impact, 'roll');
        this.ev.style('PERFECT ROLL', 200);
        this.speed += 2;
        this.setState(input.slide ? 'slide' : 'run');
        return;
      }
      this.speed *= 0.82;
      this.ev.land(impact, 'hard');
      this.ev.style('HARD LANDING', 0, { warn: true });
    } else this.ev.land(impact, 'soft');
    if (input.slide && this.speed > 6) this.setState('slide');
    else this.setState('run');
  }

  private headroom(track: Track, h: number) {
    let free = true;
    const p = this.pos;
    track.forEachCollider(p.z - R, p.z + R, (c) => {
      if (c.kind !== 'solid' || !free) return;
      if (p.x + R > c.min.x && p.x - R < c.max.x && p.y + h > c.min.y && p.y + 0.3 < c.max.y && p.z + R > c.min.z && p.z - R < c.max.z) free = false;
    });
    return free;
  }

  private overlaps(c: Collider, x = this.pos.x, y = this.pos.y, z = this.pos.z, h = this.height) {
    return x + R > c.min.x && x - R < c.max.x && y + h > c.min.y && y < c.max.y && z + R > c.min.z && z - R < c.max.z;
  }

  private rampY(r: Ramp, z: number) {
    const t = (r.zNear - z) / (r.zNear - r.zFar);
    return THREE.MathUtils.lerp(r.yNear, r.yFar, t);
  }

  /** returns landing velocity if landed */
  private stepY(dy: number, track: Track): number {
    const p = this.pos;
    const prevY = p.y;
    p.y += dy;
    let landed = 0;
    track.forEachCollider(p.z - R, p.z + R, (c) => {
      if (c.kind !== 'solid' || !this.overlaps(c)) return;
      if (dy <= 0 && prevY >= c.max.y - 0.05) {
        p.y = c.max.y;
        if (!this.grounded) landed = this.vy || -0.01;
        this.vy = 0; this.grounded = true; this.ramp = null; this.lastGroundY = p.y;
      } else if (dy > 0 && prevY + this.height <= c.min.y + 0.05) {
        p.y = c.min.y - this.height; this.vy = Math.min(this.vy, 0);
      }
    });
    // ramps
    track.forEachRamp(p.z, (r) => {
      if (p.x < r.x0 - R || p.x > r.x1 + R || p.z > r.zNear || p.z < r.zFar) return;
      const sy = this.rampY(r, p.z);
      const snap = this.grounded ? 0.5 : 0.05;
      if (p.y <= sy + snap && p.y > sy - 1.2 && this.vy <= 1) {
        p.y = sy;
        if (!this.grounded) landed = this.vy || -0.01;
        this.vy = 0; this.grounded = true; this.ramp = r; this.lastGroundY = p.y;
        this.rampSlope = (r.yFar - r.yNear) / (r.zNear - r.zFar);
      }
    });
    return landed;
  }

  private stepX(dx: number, track: Track) {
    if (dx === 0) return;
    const p = this.pos;
    p.x += dx;
    track.forEachCollider(p.z - R, p.z + R, (c) => {
      if (c.kind !== 'solid' || !this.overlaps(c)) return;
      // tiny ledges: step up
      if (c.max.y - p.y <= 0.45 && this.grounded) { p.y = c.max.y; return; }
      p.x = dx > 0 ? c.min.x - R - 0.001 : c.max.x + R + 0.001;
      if (Math.abs(this.vx) > 4 && this.state !== 'wallrun') this.speed *= 0.985;
      this.vx = 0;
      if (c.wallrun && this.state === 'air' && (c !== this.lastWall || this.wallCd <= 0)) this.startWall(c, dx > 0 ? 1 : -1);
    });
  }

  private stepZ(dz: number, track: Track) {
    const p = this.pos;
    p.z += dz;
    track.forEachCollider(p.z - R, p.z + R, (c) => {
      if (c.kind !== 'solid' || c.dead || !this.overlaps(c)) return;
      const top = c.max.y - p.y;
      if (top <= 0.5 && c.tag !== 'slide') { p.y = c.max.y; this.lastGroundY = p.y; return; }
      if (this.overdrive > 0 && c.breakable) { this.smash(c); return; }
      if ((c.tag === 'vault' || top <= 1.3) && c.tag !== 'slide' && c.tag !== 'wall') {
        // auto vault
        c.touched = true;
        p.y = c.max.y + 0.02;
        this.vy = Math.max(this.vy, 5.5);
        this.grounded = false;
        this.speed *= 0.93;
        this.vaultTimer = 0.4;
        this.setState('air');
        this.ev.vault();
        this.ev.style('VAULT', 40);
        return;
      }
      // wall-run walls hit from the front edge: glance off
      if (c.tag === 'wall' && (p.z - c.max.z) > -0.6) {
        p.x = p.x < (c.min.x + c.max.x) / 2 ? c.min.x - R - 0.01 : c.max.x + R + 0.01;
        return;
      }
      p.z = c.max.z + R + 0.01;
      (this as any).lastHit = { tag: c.tag, min: c.min.toArray(), max: c.max.toArray(), py: p.y, px: p.x, state: this.state };
      this.die('crash');
    });
  }

  private smash(c: Collider) {
    c.dead = true;
    if (c.obj) c.obj.visible = false;
    this.ev.smash();
    this.ev.style('SMASH', 100);
  }

  private startWall(c: Collider, side: number) {
    if (this.state === 'wallrun') return;
    this.wall = c; this.wallSide = side; this.wallTime = 0;
    this.setState('wallrun');
    this.vy = Math.max(this.vy, 2.6);
    if (this.vy > 5) this.vy = 5;
    this.ev.wallStart();
    this.ev.style('WALL RUN', 100);
  }

  /** auto-attach to walls when airborne and close */
  private tryWall(track: Track, strafe: number) {
    const p = this.pos;
    let best: Collider | null = null, bestD = 1.6, side = 0;
    track.forEachCollider(p.z - 1, p.z + 1, (c) => {
      if (!c.wallrun || c.dead) return;
      if (c === this.lastWall && this.wallCd > 0) return;
      if (p.z > c.max.z || p.z < c.min.z + 1) return;
      if (p.y + 1.2 < c.min.y || p.y > c.max.y - 0.5) return;
      const dl = p.x - R - c.max.x; // wall on left
      const dr = c.min.x - (p.x + R); // wall on right
      if (dl >= -0.05 && dl < bestD) { best = c; bestD = dl; side = -1; }
      if (dr >= -0.05 && dr < bestD) { best = c; bestD = dr; side = 1; }
    });
    if (best && (bestD < 0.9 || strafe === side)) {
      const c = best as Collider;
      p.x = side < 0 ? c.max.x + R + 0.02 : c.min.x - R - 0.02;
      this.startWall(c, side);
    }
  }

  private probeGround(track: Track) {
    const p = this.pos;
    let ok = false;
    track.forEachCollider(p.z - R, p.z + R, (c) => {
      if (ok || c.kind !== 'solid') return;
      if (p.x + R > c.min.x && p.x - R < c.max.x && p.z + R > c.min.z && p.z - R < c.max.z && Math.abs(c.max.y - p.y) < 0.08) ok = true;
    });
    if (!ok) track.forEachRamp(p.z, (r) => {
      if (p.x < r.x0 - R || p.x > r.x1 + R || p.z > r.zNear || p.z < r.zFar) return;
      if (Math.abs(this.rampY(r, p.z) - p.y) < 0.5) { ok = true; }
    });
    if (!ok && this.ramp) {
      // left the ramp at its top edge: launch
      const r = this.ramp;
      if (p.z < r.zFar + 0.5) {
        this.vy = Math.max(this.vy, this.speed * this.rampSlope);
        this.ev.style('LAUNCH', 120);
      }
    }
    return ok;
  }

  private triggers(track: Track) {
    const p = this.pos;
    track.forEachCollider(p.z - 6, p.z + 6, (c) => {
      if (c.dead) return;
      if (c.kind === 'orb' || c.kind === 'ring') {
        if (this.overlapsLoose(c, 0.2)) {
          c.dead = true; if (c.obj) c.obj.visible = false;
          if (c.kind === 'orb') { this.flow = Math.min(1, this.flow + 0.025); this.ev.orb(); }
          else { this.boost = Math.max(this.boost, 9); this.flow = Math.min(1, this.flow + 0.12); this.ev.ring(); this.ev.style('RING', 300); }
        }
        return;
      }
      if (c.kind === 'boost') {
        if (!c.passed && this.grounded && this.overlapsLoose(c, 0.2)) {
          c.passed = true; this.boost = Math.max(this.boost, 12); this.ev.boost(); this.ev.style('BOOST', 50);
        }
        return;
      }
      // passed obstacles → style
      if (c.passed || c.min.z <= p.z + R) return;
      c.passed = true;
      const inX = p.x + R > c.min.x && p.x - R < c.max.x;
      if (c.tag === 'slide' && inX && this.state === 'slide') this.ev.style('SLIDE UNDER', 120);
      else if (c.tag === 'vault' && inX && !c.touched && p.y > c.max.y - 0.1) this.ev.style('CLEAN JUMP', 80);
      else if (c.tag === 'blocker' && !inX) {
        const d = Math.min(Math.abs(p.x - R - c.max.x), Math.abs(c.min.x - p.x - R));
        if (d < 0.75 && p.y < c.max.y) this.ev.style('NEAR MISS', 120);
      }
    });
  }

  private overlapsLoose(c: Collider, m: number) {
    const p = this.pos;
    return p.x + R + m > c.min.x && p.x - R - m < c.max.x && p.y + this.height + m > c.min.y && p.y - m < c.max.y && p.z + R + m > c.min.z && p.z - R - m < c.max.z;
  }
}

function approach(v: number, t: number, d: number) {
  return v < t ? Math.min(t, v + d) : Math.max(t, v - d);
}
