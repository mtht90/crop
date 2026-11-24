import * as THREE from 'three';
import { FENCE_H, fenceDist, sprayAngle } from './geom';

export const GRAVITY = 9.8;
const DRAG = 0.0065;
export const CAP_R = 0.05;

export type BallEvent = 'bounce' | 'fence' | 'homerun' | 'groundRuleDouble' | 'stop' | 'outOfPlay';

/** 打球（キャップ）の物理。軽くて回転で揺れる */
export class BallSim {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  time = 0;
  bounced = false;
  stopped = false;
  dead = false;
  rolling = false;
  firstLand: THREE.Vector3 | null = null;
  flutter: number;
  flutterPhase: number;
  hitFence = false;

  constructor(pos: THREE.Vector3, vel: THREE.Vector3, flutter = 1, phase = 0) {
    this.pos.copy(pos);
    this.vel.copy(vel);
    this.flutter = flutter;
    this.flutterPhase = phase;
  }

  clone() {
    const b = new BallSim(this.pos, this.vel, this.flutter, this.flutterPhase);
    Object.assign(b, { time: this.time, bounced: this.bounced, stopped: this.stopped, dead: this.dead, rolling: this.rolling, hitFence: this.hitFence });
    b.firstLand = this.firstLand?.clone() ?? null;
    return b;
  }

  get inAir() {
    return !this.rolling && this.pos.y > CAP_R + 0.02;
  }

  step(dt: number): BallEvent | null {
    if (this.stopped || this.dead) return null;
    this.time += dt;
    let ev: BallEvent | null = null;
    if (!this.rolling) {
      const sp = this.vel.length();
      this.vel.y -= GRAVITY * dt;
      this.vel.addScaledVector(this.vel, -DRAG * sp * dt);
      // キャップ特有の横揺れ（空中のみ・徐々に収まる）
      if (!this.bounced && this.flutter > 0) {
        const side = new THREE.Vector3(-this.vel.z, 0, this.vel.x).normalize();
        const a = Math.sin(this.time * 9 + this.flutterPhase) * 2.2 * this.flutter * Math.exp(-this.time * 0.6);
        this.vel.addScaledVector(side, a * dt);
      }
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y <= CAP_R) {
        this.pos.y = CAP_R;
        if (!this.firstLand) this.firstLand = this.pos.clone();
        this.bounced = true;
        ev = 'bounce';
        if (Math.abs(this.vel.y) < 1.4) {
          this.rolling = true;
          this.vel.y = 0;
        } else {
          this.vel.y = -this.vel.y * 0.36;
          this.vel.x *= 0.62;
          this.vel.z *= 0.62;
        }
      }
    } else {
      const h = Math.hypot(this.vel.x, this.vel.z);
      const dec = 7.5 * dt; // キャップは転がらず地面を滑ってすぐ止まる
      if (h <= dec) {
        this.vel.set(0, 0, 0);
        this.stopped = true;
        ev = 'stop';
      } else {
        this.vel.multiplyScalar((h - dec) / h);
        this.pos.addScaledVector(this.vel, dt);
      }
    }
    // フェンス
    const th = sprayAngle(this.pos.x, this.pos.z);
    const r = Math.hypot(this.pos.x, this.pos.z);
    const fair = Math.abs(th) <= Math.PI / 4 + 0.12;
    if (fair && this.pos.z < 0 && r >= fenceDist(th)) {
      if (this.pos.y > FENCE_H && !this.hitFence) {
        this.dead = true;
        return this.bounced ? 'groundRuleDouble' : 'homerun';
      }
      // 跳ね返り
      const n = new THREE.Vector3(this.pos.x, 0, this.pos.z).normalize();
      const vn = this.vel.dot(n);
      if (vn > 0) {
        this.vel.addScaledVector(n, -vn * 1.35);
        this.vel.x *= 0.6;
        this.vel.z *= 0.6;
        this.hitFence = true;
        this.pos.addScaledVector(n, -0.1);
        ev = 'fence';
      }
    }
    // ファウルゾーン後方・場外
    if (this.pos.z > 14 && this.pos.y < 6) {
      this.vel.z = -Math.abs(this.vel.z) * 0.3;
      this.vel.x *= 0.3;
      this.pos.z = 14;
    }
    if (Math.abs(this.pos.x) > 50 || this.pos.z < -60) {
      this.dead = true;
      return 'outOfPlay';
    }
    return ev;
  }

  /** 先の軌道を予測（守備の判断用） */
  predict(seconds: number, dt = 1 / 60) {
    const b = this.clone();
    const pts: { t: number; p: THREE.Vector3; air: boolean }[] = [];
    for (let t = 0; t < seconds; t += dt) {
      b.step(dt);
      pts.push({ t: t + dt, p: b.pos.clone(), air: !b.bounced });
      if (b.stopped || b.dead) break;
    }
    return { pts, end: b };
  }
}
