import { ease, type EaseName } from '../core/math';
import { JOINTS, isUpper, type Joint, type Pose, type Vec3 } from './rig';

/*
 * Pose conventions (model faces +Z):
 *  - sh / el: negative X raises the arm forward / bends the elbow up.
 *  - shL: +Z swings outward; shR: -Z swings outward.
 *  - th*: negative X swings the leg forward; kn*: positive X bends the knee.
 *  - hips/spine/chest: positive X leans forward; chest +Y brings the right shoulder forward.
 */

export const zeroPose = (): Pose => ({ rot: {} });

export function clonePose(p: Pose): Pose {
  const rot: Pose['rot'] = {};
  for (const k of Object.keys(p.rot) as Joint[]) rot[k] = [...p.rot[k]!] as Vec3;
  return { rot, hips: p.hips ? ([...p.hips] as Vec3) : undefined, body: p.body ? ([...p.body] as Vec3) : undefined };
}

const z3: Vec3 = [0, 0, 0];

export function lerpPose(a: Pose, b: Pose, t: number, mask?: (j: Joint) => boolean): Pose {
  const out: Pose = { rot: {} };
  for (const j of JOINTS) {
    const ra = a.rot[j] ?? z3;
    const rb = mask && !mask(j) ? ra : (b.rot[j] ?? z3);
    if (ra === z3 && rb === z3) continue;
    out.rot[j] = [ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t];
  }
  const ha = a.hips ?? z3;
  const hb = mask ? ha : (b.hips ?? z3);
  out.hips = [ha[0] + (hb[0] - ha[0]) * t, ha[1] + (hb[1] - ha[1]) * t, ha[2] + (hb[2] - ha[2]) * t];
  const ba = a.body ?? z3;
  const bb = mask ? ba : (b.body ?? z3);
  out.body = [ba[0] + (bb[0] - ba[0]) * t, ba[1] + (bb[1] - ba[1]) * t, ba[2] + (bb[2] - ba[2]) * t];
  return out;
}

/** Adds rotation offsets onto a pose in place. */
export function addRot(p: Pose, j: Joint, x: number, y: number, z: number) {
  const r = p.rot[j] ?? [0, 0, 0];
  p.rot[j] = [r[0] + x, r[1] + y, r[2] + z];
}

export const upperMask = (j: Joint) => isUpper(j);

// ---------------------------------------------------------------------------
// Stances
// ---------------------------------------------------------------------------

export const stance = {
  fists: (): Pose => ({
    rot: {
      hips: [0.08, -0.3, 0],
      spine: [0.05, 0.1, 0],
      chest: [0.1, 0.2, 0],
      head: [-0.05, 0.0, 0],
      shL: [-1.05, 0, 0.3],
      elL: [-2.05, 0, 0],
      haL: [0.2, 0, 0],
      shR: [-0.85, 0, -0.35],
      elR: [-2.2, 0, 0],
      haR: [0.2, 0, 0],
      thL: [-0.45, 0.15, 0.12],
      knL: [0.55, 0, 0],
      anL: [-0.1, 0, 0],
      thR: [0.2, -0.1, -0.12],
      knR: [0.5, 0, 0],
      anR: [-0.25, 0, 0],
    },
    hips: [0, -0.09, 0],
  }),
  guns: (): Pose => ({
    rot: {
      hips: [0.05, -0.15, 0],
      chest: [0.05, 0.12, 0],
      head: [0, 0.03, 0],
      shL: [-1.35, 0, 0.12],
      elL: [-0.35, 0, 0],
      haL: [0.15, 0, 0],
      shR: [-1.35, 0, -0.12],
      elR: [-0.35, 0, 0],
      haR: [0.15, 0, 0],
      thL: [-0.3, 0.1, 0.1],
      knL: [0.35, 0, 0],
      anL: [-0.05, 0, 0],
      thR: [0.15, -0.1, -0.1],
      knR: [0.35, 0, 0],
      anR: [-0.2, 0, 0],
    },
    hips: [0, -0.05, 0],
  }),
};

// ---------------------------------------------------------------------------
// Keyframe clips
// ---------------------------------------------------------------------------

export interface Key {
  t: number;
  pose: Pose;
  /** Easing used when moving from the previous key into this key. */
  ease?: EaseName;
}

export interface Clip {
  keys: Key[];
  /** Normalized times for the anticipation end and the strike end. */
  windup?: number;
  strike?: number;
  upperBody?: boolean;
  /** Fully procedural clips receive the action frame instead. */
  fn?: (frame: number, total: number) => Pose;
}

export function sampleClip(clip: Clip, u: number): Pose {
  const k = clip.keys;
  if (u <= k[0].t) return k[0].pose;
  for (let i = 1; i < k.length; i++) {
    if (u <= k[i].t) {
      const a = k[i - 1];
      const b = k[i];
      const t = (u - a.t) / Math.max(1e-6, b.t - a.t);
      return lerpPose(a.pose, b.pose, ease[b.ease ?? 'inOutQuad'](t));
    }
  }
  return k[k.length - 1].pose;
}

/** Builds a pose by applying overrides on top of a base stance. */
function P(base: Pose, rot: Pose['rot'], hips?: Vec3, body?: Vec3): Pose {
  const p = clonePose(base);
  Object.assign(p.rot, rot);
  if (hips) p.hips = hips;
  if (body) p.body = body;
  return p;
}

const F = stance.fists();
const G = stance.guns();

const jab = (side: 'L' | 'R'): Clip => {
  const s = side === 'L' ? 1 : -1;
  const sh = `sh${side}` as Joint;
  const el = `el${side}` as Joint;
  const oSh = `sh${side === 'L' ? 'R' : 'L'}` as Joint;
  const oEl = `el${side === 'L' ? 'R' : 'L'}` as Joint;
  return {
    windup: 0.28,
    strike: 0.45,
    keys: [
      { t: 0, pose: F },
      {
        t: 0.28,
        ease: 'outCubic',
        pose: P(F, { chest: [0.05, 0.45 * s + 0.2, 0], [sh]: [-0.75, 0, 0.35 * s], [el]: [-2.35, 0, 0], hips: [0.0, -0.3 + 0.15 * s, 0] }, [0, -0.13, -0.04]),
      },
      {
        t: 0.45,
        ease: 'outExpo',
        pose: P(
          F,
          {
            chest: [0.2, -0.6 * s + 0.2, 0],
            spine: [0.1, -0.2 * s, 0],
            [sh]: [-1.62, 0, -0.08 * s],
            [el]: [-0.05, 0, 0],
            [oSh]: [-0.6, 0, -0.35 * s],
            [oEl]: [-2.35, 0, 0],
            hips: [0.22, -0.3 - 0.2 * s, 0],
          },
          [0, -0.1, 0.12],
        ),
      },
      { t: 0.62, ease: 'linear', pose: P(F, { chest: [0.18, -0.5 * s + 0.2, 0], [sh]: [-1.55, 0, -0.05 * s], [el]: [-0.15, 0, 0] }, [0, -0.1, 0.1]) },
      { t: 1, ease: 'inOutQuad', pose: F },
    ],
  };
};

const hook: Clip = {
  windup: 0.32,
  strike: 0.45,
  keys: [
    { t: 0, pose: F },
    {
      t: 0.32,
      ease: 'outCubic',
      pose: P(
        F,
        { hips: [-0.05, 0.35, 0], chest: [0.0, 0.75, 0.1], shL: [-0.5, 0, 1.25], elL: [-1.7, 0, 0], shR: [-1.0, 0, -0.3], elR: [-2.3, 0, 0], thL: [-0.2, 0.2, 0.2], knL: [0.9, 0, 0] },
        [0, -0.24, -0.05],
      ),
    },
    {
      t: 0.45,
      ease: 'outExpo',
      pose: P(
        F,
        { hips: [0.25, -0.75, 0], chest: [0.15, -0.95, -0.1], spine: [0.1, -0.3, 0], shL: [-1.45, -0.2, -0.45], elL: [-1.25, 0, 0], shR: [-0.45, 0, -0.5], elR: [-2.3, 0, 0], thR: [0.5, 0, -0.2], knR: [0.4, 0, 0] },
        [0, -0.16, 0.14],
      ),
    },
    { t: 0.68, ease: 'linear', pose: P(F, { hips: [0.2, -0.65, 0], chest: [0.12, -0.85, -0.08], shL: [-1.4, -0.2, -0.4], elL: [-1.3, 0, 0] }, [0, -0.15, 0.1]) },
    { t: 1, pose: F },
  ],
};

const airPunch: Clip = {
  windup: 0.25,
  strike: 0.42,
  keys: [
    { t: 0, pose: P(F, { thL: [-1.1, 0, 0.1], knL: [1.8, 0, 0], thR: [-0.6, 0, -0.1], knR: [1.6, 0, 0] }) },
    {
      t: 0.25,
      ease: 'outCubic',
      pose: P(F, { chest: [-0.15, -0.5, 0], shR: [-0.2, 0, -0.5], elR: [-2.4, 0, 0], thL: [-1.3, 0, 0.1], knL: [2.0, 0, 0], thR: [-1.0, 0, -0.1], knR: [1.9, 0, 0] }, [0, 0, -0.05]),
    },
    {
      t: 0.42,
      ease: 'outExpo',
      pose: P(F, { hips: [0.35, 0.4, 0], chest: [0.3, 0.7, 0], shR: [-1.85, 0, 0], elR: [0, 0, 0], shL: [-0.3, 0, 0.6], elL: [-1.8, 0, 0], thL: [-0.2, 0, 0.1], knL: [0.4, 0, 0], thR: [0.5, 0, -0.1], knR: [0.9, 0, 0] }),
    },
    { t: 1, pose: P(F, { thL: [-0.8, 0, 0.1], knL: [1.2, 0, 0], thR: [-0.4, 0, -0.1], knR: [1.2, 0, 0] }) },
  ],
};

const rocketStraight: Clip = {
  windup: 0.22,
  strike: 0.55,
  keys: [
    { t: 0, pose: F },
    {
      t: 0.22,
      ease: 'outCubic',
      pose: P(
        F,
        { hips: [0.2, 0.5, 0], chest: [0.15, -0.8, 0], shR: [0.7, 0, -0.5], elR: [-1.9, 0, 0], shL: [-1.4, 0, 0.1], elL: [-0.6, 0, 0], thL: [-0.9, 0.2, 0.2], knL: [1.3, 0, 0], thR: [0.6, 0, -0.1], knR: [1.1, 0, 0] },
        [0, -0.32, -0.1],
      ),
    },
    {
      t: 0.3,
      ease: 'outExpo',
      pose: P(
        F,
        { hips: [0.65, -0.4, 0], chest: [0.15, 0.6, 0], head: [-0.4, 0, 0], shR: [-1.62, 0, 0], elR: [0, 0, 0], shL: [0.7, 0, 0.4], elL: [-0.5, 0, 0], thL: [0.3, 0, 0.1], knL: [0.6, 0, 0], thR: [0.9, 0, -0.1], knR: [0.9, 0, 0] },
        [0, -0.25, 0.25],
      ),
    },
    {
      t: 0.55,
      ease: 'linear',
      pose: P(
        F,
        { hips: [0.6, -0.4, 0], chest: [0.15, 0.6, 0], head: [-0.4, 0, 0], shR: [-1.62, 0, 0], elR: [0, 0, 0], shL: [0.75, 0, 0.45], elL: [-0.4, 0, 0], thL: [0.35, 0, 0.1], knL: [0.7, 0, 0], thR: [1.0, 0, -0.1], knR: [1.0, 0, 0] },
        [0, -0.25, 0.25],
      ),
    },
    { t: 0.75, ease: 'outCubic', pose: P(F, { hips: [0.35, -0.2, 0], shR: [-1.4, 0, -0.1], elR: [-0.6, 0, 0], thL: [-0.6, 0, 0.2], knL: [0.9, 0, 0] }, [0, -0.2, 0.05]) },
    { t: 1, pose: F },
  ],
};

/** Ult: rapid alternating barrage, then a launching uppercut. */
const burstRush: Clip = {
  windup: 0.13,
  strike: 0.78,
  keys: [{ t: 0, pose: F }],
  fn: (frame) => {
    if (frame < 12) {
      const t = ease.outCubic(frame / 12);
      return lerpPose(F, P(F, { chest: [0.1, -0.2, 0], shL: [-0.6, 0, 0.6], elL: [-2.4, 0, 0], shR: [-0.6, 0, -0.6], elR: [-2.4, 0, 0] }, [0, -0.2, 0]), t);
    }
    if (frame < 64) {
      const cycle = (frame - 12) % 10;
      const left = Math.floor((frame - 12) / 5) % 2 === 0;
      const ph = (cycle % 5) / 5;
      const ext = ph < 0.4 ? ease.outExpo(ph / 0.4) : 1 - ease.inOutQuad((ph - 0.4) / 0.6);
      const s = left ? 1 : -1;
      const sh = left ? 'shL' : 'shR';
      const el = left ? 'elL' : 'elR';
      const p = P(F, { hips: [0.2, -0.3 * s, 0], chest: [0.15, -0.5 * s * ext, 0], shL: [-0.7, 0, 0.35], elL: [-2.3, 0, 0], shR: [-0.7, 0, -0.35], elR: [-2.3, 0, 0] }, [0, -0.15, 0.08]);
      p.rot[sh as Joint] = [-0.7 - 0.95 * ext, (Math.random() - 0.5) * 0.3, 0.35 * s - 0.4 * s * ext];
      p.rot[el as Joint] = [-2.3 + 2.25 * ext, 0, 0];
      return p;
    }
    const upper = P(
      F,
      { hips: [-0.1, 0.4, 0], chest: [-0.35, 0.6, 0], head: [-0.4, 0, 0], shR: [-2.9, 0, -0.1], elR: [-0.3, 0, 0], shL: [0.4, 0, 0.5], elL: [-1.2, 0, 0], thL: [-0.4, 0, 0.1], knL: [0.2, 0, 0], thR: [0.3, 0, -0.1], knR: [0.3, 0, 0], anR: [0.6, 0, 0] },
      [0, 0.08, 0.1],
    );
    const wind = P(F, { hips: [0.3, -0.3, 0], chest: [0.4, -0.5, 0], shR: [0.2, 0, -0.6], elR: [-2.2, 0, 0], thL: [-0.8, 0, 0.2], knL: [1.5, 0, 0], thR: [0.4, 0, -0.1], knR: [1.4, 0, 0] }, [0, -0.38, 0]);
    if (frame < 70) return lerpPose(F, wind, ease.outCubic((frame - 64) / 6));
    if (frame < 75) return lerpPose(wind, upper, ease.outExpo((frame - 70) / 5));
    if (frame < 86) return upper;
    return lerpPose(upper, F, ease.inOutQuad((frame - 86) / 10));
  },
};

const shot = (side: 'L' | 'R'): Clip => {
  const sh = `sh${side}` as Joint;
  const el = `el${side}` as Joint;
  const s = side === 'L' ? 1 : -1;
  return {
    windup: 0.05,
    strike: 0.2,
    upperBody: true,
    keys: [
      { t: 0, pose: G },
      { t: 0.15, ease: 'outExpo', pose: P(G, { chest: [-0.08, -0.12 * s + 0.12, 0], [sh]: [-1.85, 0, 0.1 * s], [el]: [-0.65, 0, 0] }) },
      { t: 1, ease: 'outCubic', pose: G },
    ],
  };
};

const backflipShot: Clip = {
  windup: 0.2,
  strike: 0.36,
  keys: [
    { t: 0, pose: G },
    { t: 0.06, ease: 'outCubic', pose: P(G, { thL: [-0.8, 0, 0.1], knL: [1.4, 0, 0], thR: [-0.6, 0, -0.1], knR: [1.3, 0, 0], chest: [0.3, 0, 0] }, [0, -0.35, 0]) },
    {
      t: 0.28,
      ease: 'linear',
      pose: P(G, { thL: [-1.4, 0, 0.2], knL: [2.0, 0, 0], thR: [-1.3, 0, -0.2], knR: [2.0, 0, 0], chest: [0.2, 0, 0], shL: [-1.8, 0, 0.2], shR: [-1.8, 0, -0.2], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0], body: [-Math.PI * 0.85, 0, 0] }, [0, 0, 0], [0, 0.85, 0]),
    },
    {
      t: 0.55,
      ease: 'outQuad',
      pose: P(G, { thL: [-0.6, 0, 0.1], knL: [1.0, 0, 0], thR: [-0.4, 0, -0.1], knR: [1.0, 0, 0], body: [-Math.PI * 2, 0, 0] }, [0, -0.1, 0], [0, 0.2, 0]),
    },
    { t: 0.7, ease: 'outCubic', pose: P(G, { thL: [-0.6, 0.1, 0.1], knL: [1.2, 0, 0], thR: [0.1, 0, -0.1], knR: [1.1, 0, 0], body: [-Math.PI * 2, 0, 0], chest: [0.3, 0, 0] }, [0, -0.3, 0]) },
    { t: 1, pose: P(G, { body: [-Math.PI * 2, 0, 0] }) },
  ],
};

const starStorm: Clip = {
  windup: 0.09,
  strike: 0.85,
  keys: [{ t: 0, pose: G }],
  fn: (frame) => {
    if (frame < 10) {
      return lerpPose(G, P(G, { shL: [-2.4, 0, 0.6], shR: [-2.4, 0, -0.6], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], chest: [-0.3, 0, 0] }, [0, -0.2, 0]), ease.outCubic(frame / 10));
    }
    if (frame < 84) {
      const sway = Math.sin(frame * 0.35);
      const left = Math.floor((frame - 10) / 3) % 2 === 0;
      const kick = ((frame - 10) % 3) / 3;
      const p = P(G, { hips: [0.05, sway * 0.5, 0], chest: [-0.05, sway * 0.5, 0], shL: [-1.4, 0.0, 0.25 + sway * 0.2], shR: [-1.4, 0, -0.25 + sway * 0.2], elL: [-0.25, 0, 0], elR: [-0.25, 0, 0] }, [0, -0.12, 0]);
      addRot(p, left ? 'shL' : 'shR', -0.35 * (1 - kick), 0, 0);
      return p;
    }
    const aim = P(G, { chest: [0.0, 0.0, 0], shL: [-1.55, 0, -0.2], shR: [-1.55, 0, 0.2], elL: [0, 0, 0], elR: [0, 0, 0], thL: [-0.6, 0.2, 0.2], knL: [0.8, 0, 0], thR: [0.5, 0, -0.1], knR: [0.6, 0, 0] }, [0, -0.25, 0]);
    const recoil = P(aim, { chest: [-0.35, 0, 0], shL: [-2.3, 0, -0.2], shR: [-2.3, 0, 0.2], head: [-0.25, 0, 0] }, [0, -0.15, -0.25]);
    if (frame < 94) return lerpPose(G, aim, ease.outCubic((frame - 84) / 10));
    if (frame < 98) return lerpPose(aim, recoil, ease.outExpo((frame - 94) / 4));
    return lerpPose(recoil, G, ease.inOutQuad((frame - 98) / 14));
  },
};

export const clips: Record<string, Clip> = {
  jabL: jab('L'),
  jabR: jab('R'),
  hook,
  airPunch,
  rocketStraight,
  burstRush,
  shotL: shot('L'),
  shotR: shot('R'),
  backflipShot,
  starStorm,
};

// ---------------------------------------------------------------------------
// State poses (non-attack)
// ---------------------------------------------------------------------------

export const poses = {
  guard: (weapon: 'fists' | 'guns'): Pose => {
    const base = weapon === 'fists' ? F : G;
    return P(
      base,
      { hips: [0.15, -0.1, 0], chest: [0.25, 0, 0], head: [0.2, 0, 0], shL: [-1.45, 0, -0.45], elL: [-1.75, 0, 0], shR: [-1.45, 0, 0.45], elR: [-1.75, 0, 0], thL: [-0.4, 0.1, 0.15], knL: [0.75, 0, 0], thR: [0.3, 0, -0.15], knR: [0.75, 0, 0] },
      [0, -0.18, -0.03],
    );
  },
  hurt: (weapon: 'fists' | 'guns', strength: number): Pose => {
    const base = weapon === 'fists' ? F : G;
    const k = 0.5 + strength * 0.8;
    return P(
      base,
      { hips: [-0.25 * k, 0, 0], spine: [-0.25 * k, 0, 0], chest: [-0.35 * k, 0, 0.1], head: [-0.45 * k, 0, 0], shL: [-0.2, 0, 0.9 * k], elL: [-0.9, 0, 0], shR: [-0.3, 0, -0.9 * k], elR: [-0.9, 0, 0], thL: [-0.2, 0, 0.1], knL: [0.3, 0, 0], thR: [0.3, 0, -0.1], knR: [0.4, 0, 0] },
      [0, -0.05, -0.1 * k],
    );
  },
  tumble: (t: number): Pose => ({
    rot: {
      body: [-t * 9, 0, Math.sin(t * 4) * 0.3],
      spine: [0.5, 0, 0],
      chest: [0.4, 0, 0],
      head: [0.3, 0, 0],
      shL: [-0.5 + Math.sin(t * 20) * 0.6, 0, 1.4],
      elL: [-1.0, 0, 0],
      shR: [-0.5 - Math.sin(t * 20) * 0.6, 0, -1.4],
      elR: [-1.0, 0, 0],
      thL: [-1.4, 0, 0.3],
      knL: [1.9, 0, 0],
      thR: [-1.1, 0, -0.3],
      knR: [1.6, 0, 0],
    },
    body: [0, 0.9, 0],
  }),
  lying: (): Pose => ({
    rot: {
      body: [-Math.PI / 2, 0, 0],
      head: [0.25, 0.4, 0],
      shL: [-0.3, 0, 1.2],
      elL: [-0.5, 0, 0],
      shR: [-0.2, 0, -1.3],
      elR: [-0.4, 0, 0],
      thL: [-0.2, 0, 0.25],
      knL: [0.3, 0, 0],
      thR: [-0.6, 0, -0.15],
      knR: [1.2, 0, 0],
    },
    body: [0, 0.2, 0],
  }),
  getup: (u: number, weapon: 'fists' | 'guns'): Pose => {
    const base = weapon === 'fists' ? F : G;
    const sit = P(base, { body: [-0.5, 0, 0], chest: [0.6, 0, 0], thL: [-1.7, 0, 0.2], knL: [2.1, 0, 0], thR: [-1.5, 0, -0.2], knR: [2.2, 0, 0], shL: [0.4, 0, 0.4], elL: [-0.3, 0, 0], shR: [0.4, 0, -0.4], elR: [-0.3, 0, 0] }, [0, -0.6, 0], [0, 0.1, 0]);
    const crouch = P(base, { hips: [0.4, 0, 0], chest: [0.3, 0, 0], thL: [-1.3, 0.2, 0.3], knL: [2.0, 0, 0], thR: [-0.6, -0.2, -0.3], knR: [2.1, 0, 0], anL: [0.4, 0, 0] }, [0, -0.5, 0]);
    if (u < 0.35) return lerpPose(poses.lying(), sit, ease.outCubic(u / 0.35));
    if (u < 0.7) return lerpPose(sit, crouch, ease.inOutQuad((u - 0.35) / 0.35));
    return lerpPose(crouch, base, ease.outBack((u - 0.7) / 0.3));
  },
  dizzy: (t: number, weapon: 'fists' | 'guns'): Pose => {
    const base = weapon === 'fists' ? F : G;
    const w = Math.sin(t * 5);
    return P(
      base,
      { hips: [-0.1, w * 0.2, w * 0.1], chest: [0.4, 0, -w * 0.15], head: [0.5, w * 0.4, w * 0.3], shL: [0.1, 0, 0.3], elL: [-0.3, 0, 0], shR: [0.1, 0, -0.3], elR: [-0.3, 0, 0], thL: [0, 0, 0.15], knL: [0.5, 0, 0], thR: [0, 0, -0.15], knR: [0.5, 0, 0] },
      [0, -0.12, 0],
    );
  },
  victory: (t: number, weapon: 'fists' | 'guns'): Pose => {
    const base = weapon === 'fists' ? F : G;
    const pump = Math.abs(Math.sin(t * 4));
    return P(
      base,
      { hips: [-0.1, 0, 0], chest: [-0.2, 0.2, 0], head: [-0.25, 0, 0], shR: [-2.8 - pump * 0.2, 0, -0.2], elR: [-0.4 - pump * 0.4, 0, 0], shL: [-0.3, 0, 0.5], elL: [-1.5, 0, 0], thL: [-0.1, 0, 0.1], knL: [0.1, 0, 0], thR: [0.1, 0, -0.15], knR: [0.1, 0, 0] },
      [0, pump * 0.06, 0],
    );
  },
  defeat: (): Pose => ({
    rot: { hips: [0.6, 0, 0], spine: [0.3, 0, 0], chest: [0.3, 0, 0], head: [0.5, 0, 0], shL: [0.2, 0, 0.15], shR: [0.2, 0, -0.15], thL: [-1.6, 0, 0.2], knL: [2.4, 0, 0], thR: [-1.5, 0, -0.2], knR: [2.4, 0, 0], anL: [0.8, 0, 0], anR: [0.8, 0, 0] },
    hips: [0, -0.55, 0],
  }),
  flail: (t: number): Pose => ({
    rot: {
      chest: [-0.4, 0, 0],
      head: [-0.5, 0, 0],
      shL: [-2.6 + Math.sin(t * 18) * 0.5, 0, 0.6],
      elL: [-0.4, 0, 0],
      shR: [-2.6 - Math.sin(t * 18) * 0.5, 0, -0.6],
      elR: [-0.4, 0, 0],
      thL: [-0.5 + Math.sin(t * 14) * 0.6, 0, 0.1],
      knL: [0.9, 0, 0],
      thR: [-0.5 - Math.sin(t * 14) * 0.6, 0, -0.1],
      knR: [0.9, 0, 0],
    },
  }),
};
