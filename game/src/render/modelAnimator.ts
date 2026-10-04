import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Fighter } from '../combat/fighter';
import { phaseOf } from '../combat/phase';
import type { ActionDef } from '../combat/types';
import { clamp, damp, ease, Spring, wrapAngle } from '../core/math';
import { assets } from './assets';
import type { BoneName, ModelRig } from './charModel';

// ---------------------------------------------------------------------------
// Clip helpers
// ---------------------------------------------------------------------------

const UPPER_BONES = /^(spine_0[23]|neck_01|Head|clavicle_|upperarm_|lowerarm_|hand_|index_|middle_|pinky_|ring_|thumb_)/;

const upperCache = new Map<string, THREE.AnimationClip>();
/** Copy of a clip restricted to upper-body tracks (used as an override layer). */
function upperClip(name: string) {
  let c = upperCache.get(name);
  if (!c) {
    const src = assets.clips[name];
    c = new THREE.AnimationClip(`${name}|upper`, src.duration, src.tracks.filter((t) => UPPER_BONES.test(t.name.split('.')[0])));
    upperCache.set(name, c);
  }
  return c;
}

const contactCache = new Map<string, number>();
/** Finds the moment of maximum hand reach in a clip (the "contact" frame). */
export function contactTime(name: string) {
  const hit = contactCache.get(name);
  if (hit !== undefined) return hit;
  const m = clone(assets.models.female.scene);
  const mixer = new THREE.AnimationMixer(m);
  const clip = assets.clips[name];
  mixer.clipAction(clip).play();
  const hl = m.getObjectByName('hand_l')!;
  const hr = m.getObjectByName('hand_r')!;
  const pv = m.getObjectByName('pelvis')!;
  let best = 0;
  let bestT = clip.duration * 0.4;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i <= 60; i++) {
    const t = (clip.duration * i) / 60;
    mixer.setTime(t);
    m.updateMatrixWorld(true);
    pv.getWorldPosition(b);
    for (const h of [hl, hr]) {
      h.getWorldPosition(a);
      const reach = a.z - b.z;
      if (reach > best) {
        best = reach;
        bestT = t;
      }
    }
  }
  contactCache.set(name, bestT);
  return bestT;
}

interface AttackSpec {
  clip: string;
  upper?: boolean;
  /** Clip-time window to use [start, end] (seconds); defaults to the whole clip. */
  start?: number;
  end?: number;
  /** Contact time override (seconds). */
  contact?: number;
  /** Freeze on the contact pose for the whole strike (lunges). */
  hold?: boolean;
  speed?: number;
}

const ATTACKS: Record<string, AttackSpec> = {
  jabL: { clip: 'Punch_Jab' },
  jabR: { clip: 'Punch_Cross' },
  hook: { clip: 'Melee_Hook', end: 0.38 },
  airPunch: { clip: 'Punch_Cross' },
  rocketStraight: { clip: 'Punch_Cross', hold: true },
  shotL: { clip: 'Pistol_Shoot', upper: true, contact: 0.03, end: 0.4 },
  shotR: { clip: 'Pistol_Shoot', upper: true, contact: 0.03, end: 0.4 },
};

/** Maps an action frame to clip time with the anticipation/strike/recovery curve. */
function attackTime(spec: AttackSpec, def: ActionDef, frame: number) {
  const clip = assets.clips[spec.clip];
  const start = spec.start ?? 0;
  const end = spec.end ?? clip.duration;
  const c = spec.contact ?? contactTime(spec.clip);
  const lead = Math.min(0.1, (c - start) * 0.5);
  const lag = Math.min(0.06, (end - c) * 0.3);
  const ph = phaseOf(def, frame);
  if (ph.stage === 'windup') return start + (c - lead - start) * ease.outCubic(ph.t);
  if (ph.stage === 'strike') return spec.hold ? c : c - lead + (lead + lag) * ease.outQuad(Math.min(1, ph.t * 2));
  return c + lag + (end - c - lag) * ease.inOutQuad(ph.t);
}

// ---------------------------------------------------------------------------
// Animator
// ---------------------------------------------------------------------------

interface Layer {
  clip: string;
  time: number;
  weight: number;
  upper?: boolean;
}

const AX = new THREE.Vector3(1, 0, 0); // model-space pitch axis (+ = bend forward)
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

/**
 * Drives a ModelRig: blends CC0 animation clips by fighter state, retimes
 * attack clips onto the combat timeline, then layers procedural motion
 * (aim, look, lean, flinch, squash & stretch, springs) on top.
 */
export class ModelAnimator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private time = 0;
  private locoPhase = 0;
  private overlayKey = '';
  private overlayWeight = 0;
  private overlay: Layer[] = [];
  private prevOverlay: Layer[] = [];
  private prevOverlayWeight = 0;
  private fade = 0.1;
  private airT = 0;
  private landT = 1;

  private leanX = new Spring(120, 16);
  private leanZ = new Spring(120, 16);
  private flinchX = new Spring(260, 12);
  private flinchZ = new Spring(260, 12);
  private squash = new Spring(320, 11);
  private hairX: Spring[];
  private hairZ: Spring[];
  private tailSpring = new Spring(140, 7);
  private prevVel = new THREE.Vector3();
  private last = { hit: 0, land: 0, dash: 0, jump: 0 };
  private hitShake = 0;
  private spin = 0;
  outcome: 'none' | 'win' | 'lose' = 'none';

  constructor(
    readonly rig: ModelRig,
    readonly fighter: Fighter,
  ) {
    this.mixer = new THREE.AnimationMixer(rig.model);
    const n = Math.max(1, rig.ponytail.length);
    this.hairX = Array.from({ length: n }, (_, i) => new Spring(80 - i * 12, 6 + i));
    this.hairZ = Array.from({ length: n }, (_, i) => new Spring(80 - i * 12, 6 + i));
    this.last = { hit: fighter.hitCounter, land: fighter.landCounter, dash: fighter.dashCounter, jump: fighter.jumpCounter };
  }

  private action(key: string) {
    let a = this.actions.get(key);
    if (!a) {
      const [name, mask] = key.split('|');
      const clip = mask ? upperClip(name) : assets.clips[name];
      a = this.mixer.clipAction(clip);
      a.play();
      a.paused = true;
      a.setEffectiveWeight(0);
      this.actions.set(key, a);
    }
    return a;
  }

  private get guns() {
    return this.fighter.def.weapon === 'guns';
  }

  /** Base stance: boxer guard (first frame of the jab) or two-handed aim. */
  private stance(): Layer {
    return this.guns ? { clip: 'Pistol_Aim_Neutral', time: 0.05, weight: 1 } : { clip: 'Punch_Jab', time: 0, weight: 1 };
  }

  private locomotion(dt: number): Layer[] {
    const f = this.fighter;
    const speed = Math.hypot(f.vel.x, f.vel.z);
    const local = this.toLocal(f.vel);
    const layers: Layer[] = [];
    const st = this.stance();
    if (!f.grounded) {
      this.airT += dt;
      layers.push({ clip: 'Jump_Loop', time: (this.airT * 0.8) % assets.clips.Jump_Loop.duration, weight: 1 });
      layers.push({ ...st, upper: true, weight: 0.6 });
      return layers;
    }
    this.airT = 0;
    const run = clamp(speed / f.def.walkSpeed, 0, 1);
    const backwards = local.z < -0.3 * speed;
    const jog = assets.clips.Jog_Fwd_Loop.duration;
    this.locoPhase += dt * (speed / 6.5) * (backwards ? -1 : 1);
    const jt = ((this.locoPhase % jog) + jog) % jog;
    layers.push({ ...st, weight: 1 - run });
    if (run > 0.01) layers.push({ clip: 'Jog_Fwd_Loop', time: jt, weight: run });
    // Keep the guard up while moving (upper-body override).
    if (run > 0.01) layers.push({ ...st, upper: true, weight: run * 3 });
    if (this.landT < 0.25) layers.push({ clip: 'Jump_Land', time: 0.12 + this.landT, weight: (1 - this.landT / 0.25) * 0.8 });
    return layers;
  }

  /** Full-body or upper-body overlay for the current state. Returns null for plain locomotion. */
  private overlayFor(): { layers: Layer[]; key: string; fade: number } | null {
    const f = this.fighter;
    if (this.outcome === 'win' && f.grounded) {
      const clip = this.guns ? 'Yes' : 'Dance_Loop';
      return { layers: [{ clip, time: this.time % assets.clips[clip].duration, weight: 1 }], key: 'win', fade: 0.3 };
    }
    if (this.outcome === 'lose' && f.grounded && f.state !== 'ko' && f.state !== 'knockdown') {
      return { layers: [{ clip: 'Idle_No_Loop', time: this.time % 2.5, weight: 1 }], key: 'lose', fade: 0.4 };
    }
    switch (f.state) {
      case 'action':
        return this.actionOverlay();
      case 'hitstun': {
        const clip = f.lastHitStrength > 0.45 ? 'Hit_Head' : 'Hit_Chest';
        const d = assets.clips[clip].duration;
        const u = f.stateT / Math.max(1, f.stateDur);
        const w = u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
        return { layers: [{ clip, time: Math.min(d, (u / 0.65) * d * 0.9), weight: w }], key: `hurt-${f.hitCounter}`, fade: 0.03 };
      }
      case 'tumble': {
        const d = assets.clips.Hit_Knockback.duration;
        return { layers: [{ clip: 'Hit_Knockback', time: Math.min(d * 0.55, (f.stateT / 60) * 0.9), weight: 1 }], key: 'tumble', fade: 0.05 };
      }
      case 'knockdown':
      case 'ko': {
        const d = assets.clips.Hit_Knockback.duration;
        return { layers: [{ clip: 'Hit_Knockback', time: Math.min(d - 0.01, d * 0.55 + (f.stateT / 60) * 1.2), weight: 1 }], key: 'down', fade: 0.12 };
      }
      case 'getup': {
        const d = assets.clips.LayToIdle.duration;
        const u = f.stateT / Math.max(1, f.stateDur);
        return { layers: [{ clip: 'LayToIdle', time: d * (0.12 + 0.88 * ease.inOutQuad(u)), weight: 1 }], key: 'getup', fade: 0.06 };
      }
      case 'guardbreak':
        return { layers: [{ clip: 'Idle_Shield_Break', time: Math.min(1.06, f.stateT / 60), weight: 1 }], key: 'gbreak', fade: 0.08 };
      case 'ringout':
        return { layers: [{ clip: 'Jump_Loop', time: this.time % 2.5, weight: 1 }], key: 'ringout', fade: 0.2 };
      case 'dash': {
        const d = assets.clips.Sprint_Loop.duration;
        return { layers: [{ clip: 'Sprint_Loop', time: ((f.stateT / 60) * 2) % d, weight: 1 }, { ...this.stance(), upper: true, weight: 2 }], key: 'dash', fade: 0.04 };
      }
      default:
        return null;
    }
  }

  private actionOverlay(): { layers: Layer[]; key: string; fade: number } | null {
    const f = this.fighter;
    const a = f.action!;
    const def = a.def;
    const key = `act-${f.actionSerial}`;
    const fr = a.frame;
    const spec = ATTACKS[def.anim];
    if (spec) {
      return { layers: [{ clip: spec.clip, time: attackTime(spec, def, fr), weight: 1, upper: spec.upper }], key, fade: def.kind === 'attack' ? 0.04 : 0.06 };
    }
    switch (def.anim) {
      case 'burstRush': {
        if (fr < 12) return { layers: [{ clip: 'Punch_Jab', time: 0, weight: 1 }], key, fade: 0.06 };
        if (fr < 64) {
          // Alternate jab / cross snapping between guard and contact.
          const idx = Math.floor((fr - 12) / 5);
          const clip = idx % 2 === 0 ? 'Punch_Jab' : 'Punch_Cross';
          const c = contactTime(clip);
          const p = ((fr - 12) % 5) / 5;
          const t = p < 0.4 ? c * ease.outExpo(p / 0.4) : c * (1 - ease.inOutQuad((p - 0.4) / 0.6) * 0.7);
          return { layers: [{ clip, time: t, weight: 1 }], key: `${key}-${idx}`, fade: 0.02 };
        }
        const hc = contactTime('Melee_Hook');
        const t = fr < 70 ? hc * 0.5 * ((fr - 64) / 6) : fr < 75 ? hc * 0.5 + hc * 0.5 * ease.outExpo((fr - 70) / 5) : Math.min(assets.clips.Melee_Hook.duration, hc + ((fr - 75) / 60) * 0.6);
        return { layers: [{ clip: 'Melee_Hook', time: t, weight: 1 }], key: `${key}-upper`, fade: 0.04 };
      }
      case 'backflipShot': {
        const d = assets.clips.NinjaJump_Start.duration;
        const shootW = fr >= 9 && fr < 20 ? 1 : 0;
        return {
          layers: [
            { clip: 'NinjaJump_Start', time: Math.min(d, (fr / def.total) * d * 1.3), weight: 1 },
            { clip: 'Pistol_Aim_Neutral', time: 0.05, weight: shootW * 4, upper: true },
          ],
          key,
          fade: 0.05,
        };
      }
      case 'starStorm': {
        const shoot = assets.clips.Pistol_Shoot.duration;
        if (fr < 84) return { layers: [{ ...this.stance(), weight: 1 }, { clip: 'Pistol_Shoot', time: ((fr % 3) / 3) * 0.12, weight: 3, upper: true }], key, fade: 0.06 };
        const t = fr < 94 ? 0 : Math.min(shoot, ((fr - 94) / 60) * 1.0);
        return { layers: [{ ...this.stance(), weight: 1 }, { clip: 'Pistol_Shoot', time: t, weight: 3, upper: true }], key: `${key}-fin`, fade: 0.05 };
      }
    }
    return null;
  }

  update(dt: number, alpha: number, opponent: Fighter, frozen: boolean) {
    const f = this.fighter;
    const rig = this.rig;
    this.time += dt;

    rig.root.position.lerpVectors(f.prevPos, f.pos, alpha);
    rig.root.rotation.y = f.yaw + Math.PI;

    // --- Event reactions ---------------------------------------------------
    if (f.hitCounter !== this.last.hit) {
      this.last.hit = f.hitCounter;
      const local = this.toLocal(f.lastHitDir);
      const s = 4 + f.lastHitStrength * 10;
      this.flinchX.impulse(local.z * s);
      this.flinchZ.impulse(-local.x * s);
      this.squash.impulse(-2 - f.lastHitStrength * 4);
      this.hitShake = 0.12 + f.lastHitStrength * 0.15;
    }
    if (f.landCounter !== this.last.land) {
      this.last.land = f.landCounter;
      this.squash.impulse(-3 - f.landStrength * 5);
      this.landT = 0;
    }
    if (f.dashCounter !== this.last.dash) {
      this.last.dash = f.dashCounter;
      this.squash.impulse(4);
    }
    if (f.jumpCounter !== this.last.jump) {
      this.last.jump = f.jumpCounter;
      this.squash.impulse(5);
    }
    this.landT += dt;

    // --- Clip layers -----------------------------------------------------------
    const base = this.locomotion(dt);
    const ov = this.overlayFor();
    const key = ov?.key ?? '';
    if (key !== this.overlayKey) {
      // Cross-fade: the previous overlay keeps its last pose while fading out.
      this.prevOverlay = this.overlay;
      this.prevOverlayWeight = this.overlayWeight;
      this.overlayKey = key;
      this.overlayWeight = 0;
      this.fade = ov?.fade ?? 0.12;
    }
    if (ov) this.overlay = ov.layers;
    const fadeRate = 1 / Math.max(0.016, this.fade);
    this.overlayWeight = ov ? Math.min(1, this.overlayWeight + dt * fadeRate) : 0;
    this.prevOverlayWeight = Math.max(0, this.prevOverlayWeight - dt * fadeRate);

    const targets = new Map<string, { w: number; t: number }>();
    const add = (l: Layer, k: number) => {
      if (l.weight * k <= 0.0001) return;
      const id = l.upper ? `${l.clip}|upper` : l.clip;
      const prev = targets.get(id);
      targets.set(id, { w: (prev?.w ?? 0) + l.weight * k, t: l.time });
    };
    const ovFull = ov && !ov.layers.every((l) => l.upper);
    const baseK = ov ? (ovFull ? 1 - this.overlayWeight : 1) : 1;
    const prevK = this.prevOverlayWeight;
    for (const l of base) add(l, baseK * (1 - prevK) + 0.0001);
    if (ov) for (const l of ov.layers) add(l, this.overlayWeight);
    for (const l of this.prevOverlay) add(l, prevK);

    for (const [id, a] of this.actions) if (!targets.has(id)) a.setEffectiveWeight(0);
    for (const [id, { w, t }] of targets) {
      const a = this.action(id);
      a.setEffectiveWeight(w);
      a.time = Math.min(Math.max(0, t), a.getClip().duration - 1e-3);
    }
    this.mixer.update(0);

    // --- Procedural layers -----------------------------------------------------
    rig.root.updateMatrixWorld(true);
    const accel = f.vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
    this.prevVel.copy(f.vel);
    const la = this.toLocal(accel);
    const active = f.state === 'free' || f.state === 'action' || f.state === 'dash';
    this.leanX.target = f.grounded && active ? clamp(la.z * 0.006, -0.25, 0.25) : 0;
    this.leanZ.target = f.grounded && active ? clamp(-la.x * 0.006, -0.3, 0.3) : 0;
    this.leanX.update(dt);
    this.leanZ.update(dt);
    this.flinchX.update(dt);
    this.flinchZ.update(dt);
    this.rot('pelvis', AX, this.leanX.value);
    this.rot('pelvis', AZ, this.leanZ.value);
    this.rot('spine_03', AX, -this.flinchX.value * 0.06);
    this.rot('spine_03', AZ, this.flinchZ.value * 0.05);
    this.rot('Head', AX, -this.flinchX.value * 0.06);

    const alive = active && this.outcome === 'none';
    if (alive) {
      // Upper body follows aim pitch; head tracks the opponent.
      this.rot('spine_02', AX, -f.pitch * 0.25);
      this.rot('spine_03', AX, -f.pitch * 0.25);
      const to = opponent.pos.clone().sub(f.pos);
      const dyaw = clamp(wrapAngle(Math.atan2(-to.x, -to.z) - f.yaw), -0.9, 0.9);
      this.rot('Head', AY, dyaw * 0.6);
      // Strafing: twist the hips toward the movement direction, shoulders stay on target.
      const lv = this.toLocal(f.vel);
      const sp = Math.hypot(lv.x, lv.z);
      if (f.grounded && sp > 1 && f.state !== 'dash') {
        const back = lv.z < 0 ? -1 : 1;
        const twist = clamp(Math.atan2(-lv.x * back, Math.abs(lv.z)) * 0.8, -0.9, 0.9) * clamp(sp / 4, 0, 1);
        this.rot('pelvis', AY, twist);
        this.rot('spine_02', AY, -twist * 0.5);
        this.rot('spine_03', AY, -twist * 0.5);
      }
    }
    if (f.guarding) {
      this.rot('spine_03', AX, 0.25);
      this.rot('Head', AX, 0.2);
      for (const s of ['l', 'r'] as const) this.rot(`upperarm_${s}`, AX, -0.35);
    }
    if (f.state === 'dash') {
      const d = this.toLocal(f.dashDir);
      this.rot('pelvis', AX, d.z * 0.35);
      this.rot('pelvis', AZ, -d.x * 0.4);
    }
    if (f.action?.def.id === 'rocketStraight' && phaseOf(f.action.def, f.action.frame).stage === 'strike') this.rot('pelvis', AX, 0.45);
    if (f.action?.def.anim === 'airPunch') {
      for (const s of ['l', 'r'] as const) this.rot(`thigh_${s}`, AX, -0.9);
    }

    // Spin when launched hard (ARMS-style), flip for the backflip skill.
    this.spin = 0;
    if (f.state === 'tumble' && f.lastHitStrength > 0.6) this.spin = (f.stateT / 60) * 10;
    if (f.action?.def.anim === 'backflipShot') {
      const u = clamp((f.action.frame - 4) / 26, 0, 1);
      this.spin = ease.inOutQuad(u) * Math.PI * 2;
    }

    // Hit-stop shake.
    let shakeX = 0;
    let shakeZ = 0;
    if (this.hitShake > 0) {
      this.hitShake -= dt;
      const k = frozen ? 0.05 : 0.02;
      shakeX = (Math.random() - 0.5) * k;
      shakeZ = (Math.random() - 0.5) * k;
    }
    this.squash.update(dt);
    const sq = clamp(this.squash.value * 0.04, -0.22, 0.22);
    const body = rig.body;
    body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    body.position.set(shakeX, this.spin ? 0.9 : 0, shakeZ);
    body.rotation.set(-this.spin, 0, 0);
    rig.model.position.y = this.spin ? -0.9 : 0;

    this.updateSecondary(dt, la);
  }

  /** Rotates a bone about a model-space axis (independent of bone-local axes). */
  private rot(name: BoneName, axisModel: THREE.Vector3, angle: number) {
    if (Math.abs(angle) < 1e-5) return;
    const bone = this.rig.bones[name];
    if (!bone?.parent) return;
    const modelQ = this.rig.model.getWorldQuaternion(new THREE.Quaternion());
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const axis = axisModel.clone().applyQuaternion(modelQ).applyQuaternion(parentQ.invert());
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
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
      seg.rotation.set((i === 0 ? -0.6 : 0.15) + this.hairX[i].value, 0, this.hairZ[i].value + sway);
    });
    const speed = Math.hypot(f.vel.x, f.vel.z);
    this.tailSpring.target = clamp(speed * 0.07, 0, 1.1) + (f.grounded ? 0 : 0.4);
    this.tailSpring.update(dt);
    rig.coatTails.forEach((t, i) => (t.rotation.x = -this.tailSpring.value + Math.sin(this.time * 9 + i) * 0.04 * speed * 0.1));
    void damp;
  }
}
