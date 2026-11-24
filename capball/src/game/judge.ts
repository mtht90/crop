// 打球の判定（公式キャップ野球の考え方）
// - ノーバウンドで捕る・止める → アウト（フライアウト）
// - アウトゾーンの中で止まる、または守備に止められる → アウト
// - ヒットゾーンに届く → 一塁打 / 1バウンド以上でフェンスに届く → 二塁打
// - ノーバウンドでフェンス直撃 → 三塁打 / ノーバウンドでフェンス越え → 本塁打
// 走塁はなく、走者は仮想で進む。
import * as THREE from 'three';
import type { Character } from '../render/character';
import type { Player, Pos } from './data';
import { BallSim } from './flight';
import { inOutZone, isFairAngle, sprayAngle } from './geom';

export interface Fielder {
  pos: Pos;
  player: Player;
  char: Character;
  home: THREE.Vector3;
  target: THREE.Vector3 | null;
  busy: number;
  speed: number;
}

export type JudgeKind = 'foul' | 'flyOut' | 'zoneOut' | 'single' | 'double' | 'triple' | 'homerun';
export const HIT_BASES: Partial<Record<JudgeKind, number>> = { single: 1, double: 2, triple: 3, homerun: 4 };

export type JudgeEvent =
  | { type: 'bounce'; strong: boolean }
  | { type: 'fence' }
  | { type: 'hitZone' }
  | { type: 'catch'; fielder: Fielder; fly: boolean }
  | { type: 'decided'; kind: JudgeKind };

/** 守備の走る速さ（m/s） */
export const FIELDER_SPEED = (speedStat: number) => 3.6 + (speedStat / 100) * 2.2;

export class Judge {
  time = 0;
  done = false;
  kind: JudgeKind | null = null;
  holder: Fielder | null = null;
  private crossedHit = false;
  private chaser: Fielder | null = null;
  private reassignT = 0;
  private endAt = Infinity;

  constructor(public ball: BallSim, public fielders: Fielder[], public emit: (e: JudgeEvent) => void) {
    const air = ball.vel.y > 2.5;
    for (const f of fielders) {
      f.target = null;
      f.busy = 0.3 - f.player.field / 1000 + (air ? 0.15 : 0) + (f.pos === 'P' ? 0.35 : 0) + (f.pos === 'C' ? 0.15 : 0);
    }
    this.assignChaser(true);
  }

  private decide(kind: JudgeKind, linger = 0.9) {
    if (this.kind) return;
    this.kind = kind;
    this.endAt = this.time + linger;
    this.emit({ type: 'decided', kind });
  }

  private assignChaser(initial = false) {
    const pred = this.ball.predict(5);
    let best: Fielder | null = null, bestT = Infinity, bestP: THREE.Vector3 | null = null;
    for (const f of this.fielders) {
      const fp = f.char.root.position;
      const react = initial ? f.busy : 0;
      for (const pt of pred.pts) {
        if (pt.p.y > (pt.air ? 2.1 : 1.0)) continue;
        if (f.pos === 'P' && Math.hypot(pt.p.x - f.home.x, pt.p.z - f.home.z) > 2.6) continue;
        if (f.pos === 'C' && pt.p.z < -4) continue;
        const dist = Math.max(0, Math.hypot(pt.p.x - fp.x, pt.p.z - fp.z) - 0.4);
        if (react + dist / f.speed <= pt.t) {
          if (pt.t < bestT) { bestT = pt.t; best = f; bestP = pt.p.clone().setY(0); }
          break;
        }
      }
    }
    if (!best) {
      const end = pred.end.pos.clone().setY(0);
      for (const f of this.fielders) {
        if (f.pos === 'P' || f.pos === 'C') continue;
        const t = f.char.root.position.distanceTo(end) / f.speed;
        if (t < bestT) { bestT = t; best = f; bestP = end; }
      }
    }
    for (const f of this.fielders) if (f !== best && !this.kind) f.target = null;
    if (best && bestP) {
      this.chaser = best;
      best.target = bestP;
    }
  }

  update(dt: number) {
    if (this.done) return;
    this.time += dt;
    const b = this.ball;

    if (!this.holder) {
      const ev = b.step(dt);
      if (ev === 'bounce') {
        this.emit({ type: 'bounce', strong: Math.abs(b.vel.y) > 1.5 });
        // 最初の落下点でフェア・ファウルを決める
        if (!this.kind && b.firstLand && b.firstLand.equals(b.pos) && !isFairAngle(sprayAngle(b.pos.x, b.pos.z))) this.decide('foul', 0.5);
      }
      if (ev === 'homerun') this.decide('homerun', 2.4);
      if (ev === 'groundRuleDouble') this.decide('double', 1.0);
      if (ev === 'fence') {
        this.emit({ type: 'fence' });
        this.decide(b.bounced ? 'double' : 'triple', 1.1);
      }
      if (ev === 'outOfPlay') this.decide(this.crossedHit ? 'single' : 'foul', 0.4);
      // ヒットゾーンへの到達
      if (!this.kind && b.bounced && !this.crossedHit && !inOutZone(b.pos.x, b.pos.z) && b.pos.z < 0.5) {
        this.crossedHit = true;
        this.emit({ type: 'hitZone' });
      }
      if (b.stopped && !this.kind) this.decide(this.crossedHit ? 'single' : 'zoneOut', 0.6);
      this.reassignT -= dt;
      if (this.reassignT <= 0 && !this.kind) {
        this.reassignT = 0.25;
        this.assignChaser();
      }
    } else {
      this.holder.char.handWorld('r', b.pos);
    }

    // 守備の動き
    for (const f of this.fielders) {
      f.busy = Math.max(0, f.busy - dt);
      const c = f.char;
      const p = c.root.position;
      let tgt = f.target;
      if (f === this.chaser && !this.holder) {
        const bp = b.pos;
        if (Math.hypot(bp.x - p.x, bp.z - p.z) < 2.5 && bp.y < 2.3) tgt = bp.clone().setY(0);
      }
      let moving = false;
      if (tgt && f.busy <= 0) {
        const dx = tgt.x - p.x, dz = tgt.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.1) {
          const step = Math.min(dist, f.speed * dt);
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          c.faceTowards(tgt.x, tgt.z, 0.3);
          moving = dist > 0.3;
        }
      }
      if (f.busy <= 0 && f !== this.holder) {
        c.play(moving ? 'Running_A' : 'Idle', { speed: moving ? f.speed / 5.5 : 1, fade: 0.2 });
        if (!moving) c.faceTowards(b.pos.x, b.pos.z, 0.15);
      }
      // 捕球・キャップを止める
      if (!this.holder && f.busy <= 0) {
        const bp = b.pos;
        const hd = Math.hypot(bp.x - p.x, bp.z - p.z);
        const airborne = !b.bounced;
        if (hd < 2 && bp.y < 2.6 && !b.stopped) {
          const local = c.root.worldToLocal(bp.clone());
          c.setPose({ handR: local.clone().add(new THREE.Vector3(-0.06, 0, 0)), handL: local.clone().add(new THREE.Vector3(0.06, 0, 0)) }, 0.9);
        }
        if (hd < 0.55 && bp.y < (airborne ? 1.9 : 0.8)) {
          c.setPose(null);
          // まれに弾く（エラー）
          if (Math.random() < 0.035 * (1.4 - f.player.field / 100)) {
            b.vel.set((Math.random() - 0.5) * 3, 1.2, (Math.random() - 0.5) * 3);
            b.rolling = false;
            b.bounced = true;
            f.busy = 0.6;
            continue;
          }
          this.holder = f;
          b.stopped = true;
          this.emit({ type: 'catch', fielder: f, fly: airborne });
          if (airborne) {
            this.decide('flyOut', 0.9); // ファウルフライも捕ればアウト
          } else if (!this.kind) {
            this.decide(this.crossedHit ? 'single' : inOutZone(bp.x, bp.z) ? 'zoneOut' : 'single', 0.7);
          }
          c.play(airborne ? 'Idle' : 'PickUp', { loop: false, fade: 0.08, speed: 2.2 });
        }
      }
    }
    if (this.time >= this.endAt || this.time > 12) {
      if (!this.kind) this.kind = this.crossedHit ? 'single' : 'zoneOut';
      this.done = true;
    }
  }
}
