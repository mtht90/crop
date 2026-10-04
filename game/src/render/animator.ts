import * as THREE from 'three';
import type { Fighter } from '../combat/fighter';
import { clipTime } from '../combat/phase';
import { clamp, damp, ease, Spring, wrapAngle } from '../core/math';
import { addRot, clips, clonePose, lerpPose, poses, sampleClip, stance, upperMask } from './clips';
import type { Pose, Rig } from './rig';

/**
 * Layers the procedural animation for a fighter rig:
 *  base locomotion -> state/action pose (with cross-fade) -> additive layers
 *  (lean, flinch, aim, breathing) -> squash & stretch -> secondary springs.
 */
export class Animator {
  private time = 0;
  private sourceKey = '';
  private snapshot: Pose | null = null;
  private blendT = 1;
  private blendDur = 0.1;
  private lastPose: Pose;

  private leanX = new Spring(120, 16);
  private leanZ = new Spring(120, 16);
  private flinchX = new Spring(260, 12);
  private flinchZ = new Spring(260, 12);
  private squash = new Spring(320, 11);
  private hairX: Spring[];
  private hairZ: Spring[];
  private tuftSpring = new Spring(300, 9);
  private tailSpring = new Spring(140, 7);

  private prevVel = new THREE.Vector3();
  private lastHit = 0;
  private lastLand = 0;
  private lastDash = 0;
  private lastJump = 0;
  private hitShake = 0;
  private expressionT = 0;
  private runBlend = 0;
  private airBlend = 0;
  /** Set by the match on round end. */
  outcome: 'none' | 'win' | 'lose' = 'none';

  constructor(
    readonly rig: Rig,
    readonly fighter: Fighter,
  ) {
    this.lastPose = this.stancePose();
    const n = Math.max(1, rig.ponytail.length);
    this.hairX = Array.from({ length: n }, (_, i) => new Spring(90 - i * 15, 6 + i));
    this.hairZ = Array.from({ length: n }, (_, i) => new Spring(90 - i * 15, 6 + i));
    this.lastHit = fighter.hitCounter;
    this.lastLand = fighter.landCounter;
    this.lastDash = fighter.dashCounter;
    this.lastJump = fighter.jumpCounter;
  }

  private stancePose() {
    return this.fighter.def.weapon === 'fists' ? stance.fists() : stance.guns();
  }

  update(dt: number, alpha: number, opponent: Fighter, frozen: boolean) {
    const f = this.fighter;
    const rig = this.rig;
    this.time += dt;

    // --- Root transform ---------------------------------------------------
    rig.root.position.lerpVectors(f.prevPos, f.pos, alpha);
    rig.root.rotation.y = f.yaw + Math.PI;

    // --- Event reactions ---------------------------------------------------
    if (f.hitCounter !== this.lastHit) {
      this.lastHit = f.hitCounter;
      const local = this.toLocal(f.lastHitDir);
      const s = 4 + f.lastHitStrength * 10;
      this.flinchX.impulse(local.z * s);
      this.flinchZ.impulse(-local.x * s);
      this.squash.impulse(-2 - f.lastHitStrength * 4);
      this.hitShake = 0.12 + f.lastHitStrength * 0.15;
      this.expressionT = 0.5;
    }
    if (f.landCounter !== this.lastLand) {
      this.lastLand = f.landCounter;
      this.squash.impulse(-3 - f.landStrength * 5);
      this.tuftSpring.impulse(-6);
    }
    if (f.dashCounter !== this.lastDash) {
      this.lastDash = f.dashCounter;
      this.squash.impulse(4);
    }
    if (f.jumpCounter !== this.lastJump) {
      this.lastJump = f.jumpCounter;
      this.squash.impulse(5);
    }

    // --- Base + state pose --------------------------------------------------
    const { pose: target, key, fade } = this.statePose(opponent);
    if (key !== this.sourceKey) {
      this.sourceKey = key;
      this.snapshot = clonePose(this.lastPose);
      const b = this.snapshot.rot.body;
      if (b) this.snapshot.rot.body = [wrapAngle(b[0]), wrapAngle(b[1]), wrapAngle(b[2])];
      this.blendT = 0;
      this.blendDur = fade;
    }
    let pose = target;
    if (this.snapshot && this.blendT < this.blendDur) {
      this.blendT += dt;
      pose = lerpPose(this.snapshot, target, ease.outQuad(clamp(this.blendT / this.blendDur, 0, 1)));
    }
    pose = clonePose(pose);

    // --- Additive layers -----------------------------------------------------
    const accel = f.vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
    this.prevVel.copy(f.vel);
    const la = this.toLocal(accel);
    if (f.grounded && (f.state === 'free' || f.state === 'action')) {
      this.leanX.target = clamp(la.z * 0.006, -0.25, 0.25);
      this.leanZ.target = clamp(-la.x * 0.006, -0.3, 0.3);
    } else {
      this.leanX.target = 0;
      this.leanZ.target = 0;
    }
    this.leanX.update(dt);
    this.leanZ.update(dt);
    addRot(pose, 'hips', this.leanX.value, 0, this.leanZ.value);

    this.flinchX.update(dt);
    this.flinchZ.update(dt);
    addRot(pose, 'chest', -this.flinchX.value * 0.06, 0, this.flinchZ.value * 0.05);
    addRot(pose, 'head', -this.flinchX.value * 0.08, 0, this.flinchZ.value * 0.06);

    const alive = f.state !== 'ko' && f.state !== 'knockdown' && f.state !== 'tumble' && f.state !== 'ringout' && this.outcome === 'none';
    if (alive) {
      // Aim: chest and head follow pitch; head tracks the opponent.
      addRot(pose, 'chest', -f.pitch * 0.35, 0, 0);
      addRot(pose, 'head', -f.pitch * 0.4, 0, 0);
      const to = opponent.pos.clone().sub(f.pos);
      const yawTo = Math.atan2(-to.x, -to.z);
      const dy = clamp(wrapAngle(yawTo - f.yaw), -0.9, 0.9);
      addRot(pose, 'head', 0, dy * 0.7, 0);
      // Breathing.
      addRot(pose, 'chest', Math.sin(this.time * 2.4) * 0.025, 0, 0);
    }

    // Hit-stop shake (both the target and the frozen world).
    if (this.hitShake > 0) {
      this.hitShake -= dt;
      const k = frozen ? 0.05 : 0.02;
      pose.body = [(pose.body?.[0] ?? 0) + (Math.random() - 0.5) * k, pose.body?.[1] ?? 0, (pose.body?.[2] ?? 0) + (Math.random() - 0.5) * k];
    }

    rig.applyPose(pose);
    this.lastPose = pose;

    // --- Squash & stretch ----------------------------------------------------
    this.squash.update(dt);
    const sq = clamp(this.squash.value * 0.04, -0.22, 0.22);
    rig.joints.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);

    // --- Secondary motion ------------------------------------------------------
    this.updateSecondary(dt, la);

    // --- Expression ------------------------------------------------------------
    this.expressionT -= dt;
    const a = f.action?.def.kind;
    rig.setExpression(this.expressionT > 0 || f.state === 'tumble' || f.state === 'ko' ? 1 : a === 'ult' || a === 'skill' ? 2 : 0);
  }

  private toLocal(v: THREE.Vector3) {
    const f = this.fighter;
    const fw = f.forward();
    const r = f.right();
    return { x: v.x * r.x + v.z * r.z, z: v.x * fw.x + v.z * fw.z, y: v.y };
  }

  private updateSecondary(dt: number, la: { x: number; y: number; z: number }) {
    const rig = this.rig;
    const f = this.fighter;
    const spin = f.state === 'tumble' ? 1 : 0;
    this.hairX.forEach((s, i) => {
      s.target = clamp(la.z * 0.012 + -la.y * 0.004 + spin * 0.8, -1.2, 1.2) * (1 + i * 0.3);
      s.update(dt);
    });
    this.hairZ.forEach((s, i) => {
      s.target = clamp(-la.x * 0.012, -1, 1) * (1 + i * 0.3);
      s.update(dt);
    });
    rig.ponytail.forEach((seg, i) => {
      const sway = Math.sin(this.time * 3 + i * 0.8) * 0.06;
      seg.rotation.set((i === 0 ? -0.5 : 0.15) + this.hairX[i].value, 0, this.hairZ[i].value + sway);
    });
    this.tuftSpring.target = clamp(-la.y * 0.002, -0.3, 0.3);
    this.tuftSpring.update(dt);
    for (const t of rig.hairTufts) t.scale.y = 1 + this.tuftSpring.value * 0.4;
    const speed = Math.hypot(f.vel.x, f.vel.z);
    this.tailSpring.target = clamp(speed * 0.07, 0, 1.1) + (f.grounded ? 0 : 0.4);
    this.tailSpring.update(dt);
    rig.coatTails.forEach((t, i) => (t.rotation.x = -this.tailSpring.value + Math.sin(this.time * 9 + i) * 0.04 * speed * 0.1));
  }

  /** Picks the target pose for the fighter's current state. */
  private statePose(opponent: Fighter): { pose: Pose; key: string; fade: number } {
    const f = this.fighter;
    const weapon = f.def.weapon;
    void opponent;

    if (this.outcome === 'win' && f.grounded) return { pose: poses.victory(this.time, weapon), key: 'victory', fade: 0.25 };
    if (this.outcome === 'lose' && f.state !== 'ko' && f.state !== 'ringout' && f.grounded) return { pose: poses.defeat(), key: 'defeat', fade: 0.4 };

    switch (f.state) {
      case 'action': {
        const a = f.action!;
        const clip = clips[a.def.anim];
        if (!clip) break;
        const raw = clip.fn ? clip.fn(a.frame, a.def.total) : sampleClip(clip, clipTime(a.def, a.frame, clip.windup, clip.strike));
        const pose = clip.upperBody ? lerpPose(this.locomotion(), raw, 1, upperMask) : raw;
        // Combo chains cancel into each other quickly; other entries fade slightly.
        return { pose, key: `act-${f.actionSerial}`, fade: a.def.kind === 'attack' ? 0.05 : 0.07 };
      }
      case 'dash':
        return { pose: this.dashPose(), key: 'dash', fade: 0.05 };
      case 'hitstun': {
        const u = f.stateT / Math.max(1, f.stateDur);
        const hurt = poses.hurt(weapon, f.lastHitStrength);
        const pose = u < 0.6 ? hurt : lerpPose(hurt, this.locomotion(), ease.inOutQuad((u - 0.6) / 0.4));
        return { pose, key: `hurt-${f.hitCounter}`, fade: 0.03 };
      }
      case 'tumble':
        return { pose: poses.tumble(f.stateT / 60), key: 'tumble', fade: 0.06 };
      case 'knockdown':
      case 'ko':
        return { pose: poses.lying(), key: 'lying', fade: 0.12 };
      case 'getup':
        return { pose: poses.getup(f.stateT / Math.max(1, f.stateDur), weapon), key: 'getup', fade: 0.05 };
      case 'guardbreak':
        return { pose: poses.dizzy(this.time, weapon), key: 'dizzy', fade: 0.1 };
      case 'ringout':
        return { pose: poses.flail(this.time), key: 'flail', fade: 0.2 };
      default:
        break;
    }
    if (f.guarding) return { pose: poses.guard(weapon), key: 'guard', fade: 0.06 };
    if (!f.grounded && f.pos.y < -0.5) return { pose: poses.flail(this.time), key: 'flail', fade: 0.2 };
    return { pose: this.locomotion(), key: 'loco', fade: 0.12 };
  }

  private dashPose(): Pose {
    const f = this.fighter;
    const d = this.toLocal(f.dashDir);
    const p = clonePose(this.stancePose());
    const t = clamp(f.stateT / 14, 0, 1);
    // Lean hard into the dash direction, legs stretched behind.
    addRot(p, 'body', d.z * 0.45, 0, -d.x * 0.5);
    addRot(p, 'chest', 0.1, 0, 0);
    addRot(p, 'thL', 0.5 * d.z - 0.4, 0, -0.3 * d.x);
    addRot(p, 'knL', 0.6, 0, 0);
    addRot(p, 'thR', 0.7 * d.z + 0.2, 0, -0.3 * d.x);
    addRot(p, 'knR', 0.9, 0, 0);
    addRot(p, 'shL', 0.5 * d.z, 0, 0.3);
    addRot(p, 'shR', 0.5 * d.z, 0, -0.3);
    p.hips = [0, -0.18 + Math.sin(t * Math.PI) * 0.08, 0];
    return p;
  }

  private locomotion(): Pose {
    const f = this.fighter;
    const dt = 1 / 60;
    const base = this.stancePose();
    const speed = Math.hypot(f.vel.x, f.vel.z);
    const runTarget = f.grounded ? clamp(speed / f.def.walkSpeed, 0, 1) : 0;
    this.runBlend = damp(this.runBlend, runTarget, 12, dt);
    this.airBlend = damp(this.airBlend, f.grounded ? 0 : 1, 18, dt);

    const p = clonePose(base);
    // Idle: bouncy boxer rhythm (ARMS-like), more subtle for shooters.
    const bounceAmp = f.def.weapon === 'fists' ? 0.03 : 0.015;
    const bounce = Math.abs(Math.sin(this.time * 4.2)) * bounceAmp * (1 - this.runBlend);
    p.hips = [0, (base.hips?.[1] ?? 0) + bounce, 0];
    addRot(p, 'knL', -bounce * 3, 0, 0);
    addRot(p, 'knR', -bounce * 3, 0, 0);

    if (this.runBlend > 0.01) {
      const lv = this.toLocal(f.vel);
      const len = Math.max(0.001, Math.hypot(lv.x, lv.z));
      const fz = lv.z / len;
      const fx = lv.x / len;
      const phase = (f.stride / 2.0) * Math.PI * 2;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const k = this.runBlend;
      const run = clonePose(base);
      // Square the hips toward the movement direction, legs swing along it.
      run.rot.hips = [0.25 * fz - 0.05, -0.15 + fx * 0.2, -fx * 0.15];
      run.rot.chest = [0.1, 0.2 * s * fz, 0];
      const swing = 0.85;
      run.rot.thL = [-s * swing * fz, 0, 0.1 + s * swing * 0.6 * fx];
      run.rot.thR = [s * swing * fz, 0, -0.1 - s * swing * 0.6 * fx];
      run.rot.knL = [0.3 + Math.max(0, c) * 1.3, 0, 0];
      run.rot.knR = [0.3 + Math.max(0, -c) * 1.3, 0, 0];
      run.rot.anL = [-0.2 * s, 0, 0];
      run.rot.anR = [0.2 * s, 0, 0];
      if (f.def.weapon === 'fists') {
        run.rot.shL = [-0.9 + s * 0.45 * fz, 0, 0.3];
        run.rot.shR = [-0.9 - s * 0.45 * fz, 0, -0.3];
        run.rot.elL = [-1.9, 0, 0];
        run.rot.elR = [-1.9, 0, 0];
      }
      run.hips = [0, -0.04 + Math.abs(c) * 0.07, 0];
      const blended = lerpPose(p, run, k);
      Object.assign(p, blended);
    }

    if (this.airBlend > 0.01) {
      const rising = f.vel.y > 0;
      const air = clonePose(base);
      if (rising) {
        air.rot.thL = [-1.2, 0, 0.1];
        air.rot.knL = [1.6, 0, 0];
        air.rot.thR = [0.2, 0, -0.1];
        air.rot.knR = [0.5, 0, 0];
        air.rot.chest = [0.1, 0.2, 0];
      } else {
        air.rot.thL = [-0.5, 0, 0.2];
        air.rot.knL = [0.6, 0, 0];
        air.rot.thR = [-0.2, 0, -0.2];
        air.rot.knR = [0.9, 0, 0];
        if (f.def.weapon === 'fists') {
          air.rot.shL = [-0.6, 0, 0.7];
          air.rot.shR = [-0.6, 0, -0.7];
        }
      }
      const blended = lerpPose(p, air, this.airBlend);
      Object.assign(p, blended);
    }
    return p;
  }
}
