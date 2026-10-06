import * as THREE from 'three';
import type { Fighter } from '../combat/fighter';
import { phaseOf } from '../combat/phase';
import type { ActionDef } from '../combat/types';
import { clamp, damp, ease, Spring, wrapAngle } from '../core/math';
import { assets } from './assets';
import { contactTime } from './clipInfo';
import type { BoneName, ModelRig } from './charModel';
import { yoyoPose, yoyoScale } from './yoyo';
import { EYE_HEIGHT } from '../config';

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
  risingUpper: { clip: 'Melee_Hook' },
  dashStraight: { clip: 'Shield_Dash' },
  drawShot: { clip: 'Spell_Simple_Shoot', upper: true },
  triShot: { clip: 'Spell_Simple_Shoot', upper: true },
  rollShot: { clip: 'Roll', contact: 0.85, end: 1.3 },
  swingA: { clip: 'Sword_Regular_A' },
  swingB: { clip: 'Sword_Regular_B' },
  smash: { clip: 'Sword_Attack' },
  airSmash: { clip: 'OverhandThrow' },
  pikoDash: { clip: 'Sword_Dash' },
  groundPound: { clip: 'OverhandThrow' },
  gigaPiko: { clip: 'Sword_Attack' },
  burst: { clip: 'Pistol_Shoot', upper: true, contact: 0.04, end: 0.6 },
  // Katana
  slashA: { clip: 'Sword_Regular_A' },
  slashB: { clip: 'Sword_Regular_B' },
  slashC: { clip: 'Sword_Regular_C' },
  airSlash: { clip: 'Sword_Attack' },
  tsubame: { clip: 'Sword_Regular_C' },
  passSlash: { clip: 'Sword_Dash' },
  iaiStrike: { clip: 'Sword_Regular_C' },
  // Yo-yo
  yoyoShot: { clip: 'Punch_Cross', upper: true },
  yoyoShot2: { clip: 'OverhandThrow', upper: true },
  airYoyo: { clip: 'Punch_Cross' },
  snare: { clip: 'OverhandThrow' },
  walkDog: { clip: 'Sword_Dash' },
  // Grappler
  kneeStrike: { clip: 'NinjaJump_Idle_Loop', hold: true },
  tetherShot: { clip: 'Pistol_Shoot', upper: true, contact: 0.04, end: 0.6 },
  flingThrow: { clip: 'OverhandThrow' },
  hookShot: { clip: 'Pistol_Shoot', upper: true, contact: 0.04, end: 0.6 },
  reelIn: { clip: 'Pistol_Shoot', upper: true, contact: 0.04, end: 0.6 },
  // Umbrella
  pokeA: { clip: 'Punch_Cross' },
  pokeB: { clip: 'Punch_Cross' },
  sweep: { clip: 'Sword_Regular_B' },
  umbrellaRush: { clip: 'Shield_Dash' },
  umbrellaToss: { clip: 'OverhandThrow' },
};

/** Moves where the umbrella is held point-first (thrusts). */
const UMBRELLA_THRUST = new Set(['pokeA', 'pokeB', 'umbrellaRush']);

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

  /** Base stance per weapon: boxer guard, two-handed aim, bow arm out, sword-style ready. */
  private stance(): Layer {
    switch (this.fighter.def.weapon) {
      case 'guns':
        return { clip: 'Pistol_Aim_Neutral', time: 0.05, weight: 1 };
      case 'bow':
        return { clip: 'Spell_Simple_Idle_Loop', time: this.time % assets.clips.Spell_Simple_Idle_Loop.duration, weight: 1 };
      case 'hammer':
      case 'katana':
      case 'umbrella':
        return { clip: 'Sword_Idle', time: this.time % assets.clips.Sword_Idle.duration, weight: 1 };
      case 'yoyo':
        return { clip: 'Spell_Simple_Idle_Loop', time: this.time % assets.clips.Spell_Simple_Idle_Loop.duration, weight: 1 };
      default:
        return { clip: 'Punch_Jab', time: 0, weight: 1 };
    }
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
      const clip = { fists: 'Dance_Loop', guns: 'Yes', bow: 'Idle_FoldArms_Loop', hammer: 'Dance_Loop', katana: 'Sword_Idle', yoyo: 'Dance_Loop', grapple: 'Yes', umbrella: 'Idle_FoldArms_Loop' }[this.fighter.def.weapon];
      return { layers: [{ clip, time: this.time % assets.clips[clip].duration, weight: 1 }], key: 'win', fade: 0.3 };
    }
    if (this.outcome === 'lose' && f.grounded && f.state !== 'ko' && f.state !== 'knockdown') {
      return { layers: [{ clip: 'Idle_No_Loop', time: this.time % 2.5, weight: 1 }], key: 'lose', fade: 0.4 };
    }
    if (f.gliding && f.state === 'free' && f.def.weapon === 'umbrella') {
      // Floating down: umbrella held overhead, legs dangling.
      return {
        layers: [
          { clip: 'Jump_Loop', time: 0.5, weight: 1 },
          { clip: 'Spell_Simple_Shoot', time: 0.35, weight: 3, upper: true },
        ],
        key: 'float',
        fade: 0.1,
      };
    }
    if (f.grapple && !f.grapple.forced && f.state === 'free') {
      // Reeling in: launcher arm locked forward, legs tucked like a zip-line ride.
      return {
        layers: [
          { clip: 'Jump_Loop', time: 0.3, weight: 1 },
          { clip: 'Pistol_Aim_Neutral', time: 0.05, weight: 3, upper: true },
        ],
        key: 'grapple',
        fade: 0.05,
      };
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
      case 'slideShot': {
        const d = assets.clips.Slide_Loop.duration;
        const layers: Layer[] = fr < 6 ? [{ clip: 'Slide_Start', time: (fr / 6) * assets.clips.Slide_Start.duration * 0.9, weight: 1 }] : fr < 22 ? [{ clip: 'Slide_Loop', time: ((fr - 6) / 60) % d, weight: 1 }] : [{ clip: 'Slide_Exit', time: Math.min(0.49, ((fr - 22) / 10) * 0.5), weight: 1 }];
        layers.push({ clip: 'Pistol_Aim_Neutral', time: 0.05, weight: 4, upper: true });
        return { layers, key, fade: 0.04 };
      }
      case 'iai': {
        // Hold a low ready stance (blade sheathed-ish) while the counter window is open.
        const d = assets.clips.Sword_Block.duration;
        return { layers: [{ clip: 'Sword_Block', time: Math.min(d * 0.5, (fr / 8) * d * 0.5), weight: 1 }], key, fade: 0.05 };
      }
      case 'getsuei': {
        if (fr < 26) {
          const d = assets.clips.Sword_Dash.duration;
          return { layers: [{ clip: 'Sword_Dash', time: Math.min(d * 0.6, (fr / 26) * d * 0.6), weight: 1 }], key, fade: 0.05 };
        }
        if (fr < 62) {
          // Rapid alternating cuts.
          const idx = Math.floor((fr - 26) / 5);
          const clip = idx % 2 ? 'Sword_Regular_B' : 'Sword_Regular_A';
          const c = contactTime(clip);
          const p = ((fr - 26) % 5) / 5;
          return { layers: [{ clip, time: c * (0.6 + 0.5 * p), weight: 1 }], key: `${key}-${idx}`, fade: 0.02 };
        }
        const d = assets.clips.Sword_Regular_C.duration;
        const c = contactTime('Sword_Regular_C');
        const t = fr < 66 ? c * 0.5 * ((fr - 62) / 4) : fr < 71 ? c * 0.5 + c * 0.5 * ease.outExpo((fr - 66) / 5) : Math.min(d, c + ((fr - 71) / 60) * 0.8);
        return { layers: [{ clip: 'Sword_Regular_C', time: t, weight: 1 }], key: `${key}-fin`, fade: 0.03 };
      }
      case 'aroundWorld': {
        const d = assets.clips.Sword_Regular_A.duration;
        return { layers: [{ clip: 'Sword_Regular_A', time: d * 0.45, weight: 1 }], key, fade: 0.06 };
      }
      case 'loopUp':
      case 'hopFloat':
      case 'updraft': {
        const d = assets.clips.NinjaJump_Start.duration;
        return { layers: [{ clip: 'NinjaJump_Start', time: Math.min(d * 0.6, (fr / 60) * 1.4), weight: 1 }, { clip: 'Spell_Simple_Shoot', time: 0.35, weight: 2, upper: true }], key, fade: 0.05 };
      }
      case 'giantYoyo': {
        const d = assets.clips.OverhandThrow.duration;
        const c = contactTime('OverhandThrow');
        const t = fr < 20 ? c * 0.6 * (fr / 20) : fr < 26 ? c * 0.6 + c * 0.4 * ease.outExpo((fr - 20) / 6) : fr < 50 ? c : Math.min(d, c + ((fr - 50) / 60) * 0.9);
        return { layers: [{ clip: 'OverhandThrow', time: t, weight: 1 }], key, fade: 0.05 };
      }
      case 'dropKick': {
        const d = assets.clips.NinjaJump_Idle_Loop.duration;
        return { layers: [{ clip: 'NinjaJump_Idle_Loop', time: (fr / 60) % d, weight: 1 }], key, fade: 0.04 };
      }
      case 'reelFinisher': {
        // Wait in a crouched windup until the target arrives, then launch the uppercut.
        const hc = contactTime('Melee_Hook');
        const hitAt = a.connected ? (a.hitT ??= fr) : -1;
        const t = hitAt < 0 ? hc * 0.45 : Math.min(assets.clips.Melee_Hook.duration, hc + ((fr - hitAt) / 60) * 0.7);
        return { layers: [{ clip: 'Melee_Hook', time: t, weight: 1 }], key, fade: 0.05 };
      }
      case 'umbrellaOpen':
      case 'shieldFire': {
        const d = assets.clips.Idle_Shield_Loop.duration;
        return { layers: [{ clip: 'Idle_Shield_Loop', time: (fr / 60) % d, weight: 1, upper: true }], key, fade: 0.04 };
      }
      case 'heliSpin': {
        const d = assets.clips.NinjaJump_Start.duration;
        return { layers: [{ clip: 'NinjaJump_Start', time: Math.min(d * 0.6, (fr / 60) * 1.4), weight: 1 }], key, fade: 0.05 };
      }
      case 'arrowRain': {
        const shoot = assets.clips.Spell_Simple_Shoot.duration;
        const t = fr < 20 ? (fr / 20) * shoot * 0.3 : fr < 84 ? shoot * 0.3 + ((fr % 5) / 5) * 0.1 : fr < 92 ? shoot * 0.3 : Math.min(shoot, shoot * 0.3 + ((fr - 92) / 30) * shoot);
        return { layers: [{ ...this.stance(), weight: 1 }, { clip: 'Spell_Simple_Shoot', time: t, weight: 3, upper: true }], key, fade: 0.06 };
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
    const anim = f.action?.def.anim;
    if (anim === 'risingUpper') {
      this.rot('pelvis', AX, -0.25);
      this.rot('spine_03', AX, -0.3);
    }
    if (anim === 'arrowRain' && f.action!.frame >= 12 && f.action!.frame < 86) this.rot('spine_03', AX, -0.7);
    if (anim === 'airPunch') {
      for (const s of ['l', 'r'] as const) this.rot(`thigh_${s}`, AX, -0.9);
    }

    // Bow string follows the drawing hand; giant hammer for the ult.
    if (f.def.weapon === 'bow') {
      rig.root.updateMatrixWorld(true);
      rig.alignBow();
      rig.root.updateMatrixWorld(true);
      const act = f.action;
      let draw = 0;
      if (act && (act.def.anim === 'drawShot' || act.def.anim === 'triShot' || act.def.anim === 'arrowRain')) {
        const ph = phaseOf(act.def, act.frame);
        draw = ph.stage === 'windup' ? ph.t : 0;
        if (act.def.anim === 'arrowRain') draw = (act.frame % 5) / 5;
      }
      rig.setBowDraw(draw);
    }
    if (f.def.weapon === 'hammer') {
      const act = f.action;
      let k = 1;
      if (act?.def.anim === 'gigaPiko') {
        const fr = act.frame;
        k = fr < 10 ? 1 : fr < 32 ? 1 + 2.2 * ease.outBack((fr - 10) / 22) : fr < 70 ? 3.2 : 3.2 - 2.2 * ease.inOutQuad(Math.min(1, (fr - 70) / 15));
      }
      rig.weaponRoot.scale.setScalar(k);
    }

    if (anim === 'tsubame') {
      this.rot('pelvis', AX, -0.3);
      this.rot('spine_03', AX, -0.35);
    }
    if (anim === 'kneeStrike') {
      // Flying knee: right knee driven up and forward, left leg trailing.
      this.rot('thigh_r', AX, -1.7);
      this.rot('calf_r', AX, 2.0);
      this.rot('thigh_l', AX, 0.35);
      this.rot('spine_03', AX, 0.25);
    }
    if (anim === 'dropKick') {
      for (const s of ['l', 'r'] as const) this.rot(`thigh_${s}`, AX, -1.3);
      this.rot('pelvis', AX, -0.5);
    }
    if (f.def.weapon === 'umbrella') this.updateUmbrella(dt);
    if (f.def.weapon === 'yoyo') this.updateYoyo();
    if (f.def.weapon === 'grapple' && rig.hookClaw) rig.hookClaw.visible = !this.hookOut;

    // Spin when launched hard (ARMS-style), flip for the backflip skill, helicopter for the hammer.
    this.spin = 0;
    let spinY = 0;
    if (anim === 'heliSpin') spinY = (f.action!.frame / 60) * Math.PI * 2 * 2.5;
    if (anim === 'aroundWorld' && f.action!.frame >= 5 && f.action!.frame < 24) spinY = ((f.action!.frame - 5) / 19) * Math.PI * 2;
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
    body.rotation.set(-this.spin, spinY, 0);
    rig.model.position.y = this.spin ? -0.9 : 0;

    this.updateSecondary(dt, la);
  }

  /** Set by the view while Zip's hook is flying or reeling. */
  hookOut = false;
  private umbrellaOpen = 0;
  private umbrellaTilt = 0;
  private umbrellaMode: 'forward' | 'up' = 'forward';
  private yoyoSpin = 0;

  private updateUmbrella(dt: number) {
    const f = this.fighter;
    const anim = f.state === 'action' ? f.action?.def.anim : undefined;
    const open = f.canopyBroken === 0 && (f.gliding || anim === 'umbrellaOpen' || anim === 'umbrellaRush' || anim === 'updraft' || anim === 'shieldFire');
    this.umbrellaOpen = damp(this.umbrellaOpen, open ? 1 : 0, open ? 30 : 12, dt);
    this.rig.setUmbrellaOpen?.(this.umbrellaOpen);
    // Thrown away: nothing in hand until it flies back.
    this.rig.weaponRoot.visible = !f.umbrellaOut;
    // Thrusts and the shield hold it point-first; floating holds it straight overhead.
    const thrust = !!anim && (UMBRELLA_THRUST.has(anim) || anim === 'umbrellaOpen' || anim === 'shieldFire');
    const overhead = !thrust && this.umbrellaOpen > 0.05 && (f.gliding || anim === 'updraft' || anim === 'hopFloat');
    if (thrust) this.umbrellaMode = 'forward';
    else if (overhead) this.umbrellaMode = 'up';
    this.umbrellaTilt = damp(this.umbrellaTilt, thrust || overhead ? 1 : 0, 25, dt);
    // Orient the shaft in model space regardless of the wrist pose.
    const wr = this.rig.weaponRoot;
    wr.quaternion.identity();
    if (this.umbrellaTilt > 0.001 && wr.parent) {
      this.rig.root.updateMatrixWorld(true);
      const parentQ = wr.parent.getWorldQuaternion(new THREE.Quaternion());
      const want = this.rig.model.getWorldQuaternion(new THREE.Quaternion());
      if (this.umbrellaMode === 'forward') {
        want.multiply(new THREE.Quaternion().setFromAxisAngle(AX, -f.pitch)).multiply(new THREE.Quaternion().setFromAxisAngle(AX, Math.PI / 2));
      } else want.multiply(new THREE.Quaternion().setFromAxisAngle(AX, 0.12));
      const local = parentQ.invert().multiply(want);
      wr.quaternion.slerp(local, this.umbrellaTilt);
    }
  }

  private updateYoyo() {
    const rig = this.rig;
    const f = this.fighter;
    const yo = rig.yoyo;
    const str = rig.yoyoString;
    if (!yo || !str) return;
    rig.root.updateMatrixWorld(true);
    const hand = rig.tipR.getWorldPosition(new THREE.Vector3());
    const pose = yoyoPose(f);
    const world = new THREE.Vector3();
    const base = rig.root.position;
    if (pose.mode === 'line') {
      const eye = new THREE.Vector3(base.x, base.y + EYE_HEIGHT, base.z);
      world.copy(eye).addScaledVector(f.aimDir(), pose.dist);
      world.y = Math.max(base.y + 0.15, Math.min(world.y, eye.y));
      if (f.def.actions.walkDog && f.action?.def.anim === 'walkDog') world.y = base.y + 0.12;
    } else if (pose.mode === 'orbit') {
      const a = f.yaw + pose.angle;
      world.set(base.x + Math.sin(a) * pose.radius, base.y + pose.height, base.z + Math.cos(a) * pose.radius);
    } else {
      world.copy(hand).add(new THREE.Vector3(0, -0.32 + Math.sin(this.time * 4) * 0.03, 0));
    }
    this.yoyoSpin += pose.mode === 'hand' ? 0.1 : 0.6;
    yo.position.copy(rig.root.worldToLocal(world.clone()));
    yo.rotation.set(this.yoyoSpin, 0, 0);
    yo.scale.setScalar(yoyoScale(f));
    const pos = str.geometry.attributes.position as THREE.BufferAttribute;
    const h = rig.root.worldToLocal(hand.clone());
    pos.setXYZ(0, h.x, h.y, h.z);
    pos.setXYZ(1, yo.position.x, yo.position.y, yo.position.z);
    pos.needsUpdate = true;
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
    // Twin tails and headband ends swing with movement.
    rig.swayers.forEach((sw, i) => {
      const k = sw.amp;
      sw.obj.rotation.x = sw.base.x + this.hairX[0].value * k * 2 + Math.sin(this.time * 3 + i) * k * 0.15;
      sw.obj.rotation.z = sw.base.z + this.hairZ[0].value * k * 2;
    });
    rig.coatTails.forEach((t, i) => (t.rotation.x = -this.tailSpring.value + Math.sin(this.time * 9 + i) * 0.04 * speed * 0.1));
    void damp;
  }
}
