// 投球フォームと打撃フォーム（キャラ座標: 前 +Z、左 +X、上 +Y。CHAR_SCALE 適用後のメートル）
import * as THREE from 'three';
import { BAT_SWEET, samplePose, type PoseKey, type ProcPose } from './character';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const FOOT_Y = 0.105;

// ---------------- 投球 ----------------
export const PITCH_RELEASE_T = 0.9;
export const PITCH_TOTAL_T = 1.55;

const pitchKeys: PoseKey[] = [
  { t: 0, p: { torso: V(0, 0, 0), hips: V(0, 0, 0), handR: V(-0.04, 0.6, 0.17), handL: V(0.04, 0.6, 0.17), footR: V(-0.12, FOOT_Y, 0), footL: V(0.12, FOOT_Y, 0), head: new THREE.Vector2(0, 0) } },
  { t: 0.32, p: { torso: V(-72, -4, 0), hips: V(0, 0.03, -0.03), handR: V(-0.02, 0.66, 0.06), handL: V(0.02, 0.66, 0.06), footR: V(-0.1, FOOT_Y, -0.02), footL: V(0.02, 0.33, 0.06), kneeL: V(0.6, 0.2, 1), head: new THREE.Vector2(70, 0) } },
  { t: 0.6, p: { torso: V(-62, 4, -6), hips: V(0, -0.05, 0.14), handR: V(-0.36, 0.72, -0.16), handL: V(0.18, 0.72, 0.36), footR: V(-0.1, FOOT_Y, -0.02), footL: V(0.13, FOOT_Y, 0.46), kneeL: V(0.3, 0, 1), head: new THREE.Vector2(62, -4) } },
  { t: 0.78, p: { torso: V(-26, 10, -8), hips: V(0, -0.07, 0.2), handR: V(-0.3, 1.02, -0.06), handL: V(0.24, 0.66, 0.24), elbowR: V(-1, -0.2, -0.3), footR: V(-0.1, FOOT_Y, 0.0), footL: V(0.13, FOOT_Y, 0.46), head: new THREE.Vector2(26, -8) } },
  { t: PITCH_RELEASE_T, p: { torso: V(12, 24, 0), hips: V(0, -0.08, 0.26), handR: V(-0.16, 0.96, 0.4), handL: V(0.2, 0.55, 0.12), elbowR: V(-1, -0.4, 0), footR: V(-0.08, FOOT_Y + 0.02, 0.04), footL: V(0.13, FOOT_Y, 0.46), head: new THREE.Vector2(-10, -14) } },
  { t: 1.08, p: { torso: V(30, 38, 4), hips: V(0, -0.1, 0.3), handR: V(0.16, 0.42, 0.34), handL: V(0.24, 0.52, 0.0), footR: V(-0.12, 0.24, -0.16), footL: V(0.13, FOOT_Y, 0.46), kneeR: V(0, -0.2, 1), head: new THREE.Vector2(-28, -22) } },
  { t: PITCH_TOTAL_T, p: { torso: V(0, 8, 0), hips: V(0, -0.04, 0.24), handR: V(-0.08, 0.56, 0.2), handL: V(0.08, 0.56, 0.2), footR: V(-0.1, FOOT_Y, 0.3), footL: V(0.13, FOOT_Y, 0.46), head: new THREE.Vector2(0, -6) } },
];

export function pitchPose(t: number): ProcPose {
  return samplePose(pitchKeys, t);
}

// ---------------- 打撃（右打者。左打者は X を反転して使う） ----------------
export const SWING_CONTACT_T = 0.13;
export const SWING_TOTAL_T = 0.5;

export function stancePose(wiggle = 0): ProcPose {
  const w = Math.sin(wiggle * 3) * 0.015;
  const dir = V(-0.42, 0.86, -0.22 + w * 4).normalize();
  const grip = V(-0.13, 0.9 + w, 0.07);
  return {
    torso: V(-18, 4, 0),
    hips: V(0, -0.04, 0),
    handR: grip.clone().addScaledVector(dir, 0.06),
    handL: grip.clone().addScaledVector(dir, -0.01),
    elbowR: V(-1, -0.6, 0.2),
    elbowL: V(0.2, -1, 0.4),
    footR: V(-0.2, FOOT_Y, -0.02),
    footL: V(0.22, FOOT_Y, 0.02),
    kneeR: V(0, 0, 1),
    kneeL: V(0, 0, 1),
    head: new THREE.Vector2(62, 4),
    bat: { grip, dir },
  };
}

function withHands(p: ProcPose): ProcPose {
  if (!p.bat) return p;
  return { ...p, handR: p.bat.grip.clone().addScaledVector(p.bat.dir, 0.06), handL: p.bat.grip.clone().addScaledVector(p.bat.dir, -0.01) };
}

/** contact: キャラ座標でのミート点（カーソル位置） */
export function swingKeys(contact: THREE.Vector3, bunt = false): PoseKey[] {
  const st = stancePose();
  if (bunt) {
    const dir = V(0.05, 0.08, 1).normalize();
    const grip = contact.clone().addScaledVector(dir, -BAT_SWEET * 0.9);
    grip.y = Math.max(0.35, grip.y);
    const p: ProcPose = withHands({ ...st, torso: V(40, 14, 0), hips: V(0, -0.1, 0.05), bat: { grip, dir }, head: new THREE.Vector2(10, 8) });
    return [{ t: 0, p: st }, { t: 0.18, p }, { t: 3, p }];
  }
  const pivot = V(0.02, 0.62, 0.05);
  const cdir = contact.clone().sub(pivot);
  cdir.y *= 0.6;
  cdir.normalize();
  const cgrip = contact.clone().addScaledVector(cdir, -BAT_SWEET);
  const k1 = withHands({ ...st, torso: V(10, 8, 0), hips: V(0, -0.07, 0.03), footL: V(0.27, FOOT_Y, 0.03), bat: { grip: V(-0.06, 0.78, 0.18), dir: V(-0.75, 0.25, 0.6).normalize() }, head: new THREE.Vector2(50, 6) });
  const k2 = withHands({ ...st, torso: V(52, 10, 0), hips: V(0, -0.08, 0.04), footL: V(0.27, FOOT_Y, 0.03), footR: V(-0.18, FOOT_Y + 0.03, -0.01), bat: { grip: cgrip, dir: cdir }, head: new THREE.Vector2(20, 10) });
  const k3 = withHands({ ...st, torso: V(88, 6, 0), hips: V(0, -0.06, 0.03), footL: V(0.27, FOOT_Y, 0.03), footR: V(-0.16, FOOT_Y + 0.05, 0.02), bat: { grip: V(0.16, 0.74, 0.12), dir: V(0.9, 0.2, -0.3).normalize() }, head: new THREE.Vector2(10, 4) });
  const k4 = withHands({ ...st, torso: V(96, 2, 0), hips: V(0, -0.04, 0.02), footL: V(0.27, FOOT_Y, 0.03), footR: V(-0.14, FOOT_Y + 0.05, 0.04), bat: { grip: V(0.12, 0.9, -0.02), dir: V(0.2, 0.55, -0.8).normalize() }, head: new THREE.Vector2(8, 0) });
  return [
    { t: 0, p: st },
    { t: 0.07, p: k1 },
    { t: SWING_CONTACT_T, p: k2 },
    { t: 0.24, p: k3 },
    { t: SWING_TOTAL_T, p: k4 },
  ];
}

/** 左打者・左投手用にポーズを左右反転 */
export function mirrorPose(p: ProcPose): ProcPose {
  const m = (v?: THREE.Vector3) => (v ? V(-v.x, v.y, v.z) : undefined);
  const out: ProcPose = {
    torso: p.torso ? V(-p.torso.x, p.torso.y, -p.torso.z) : undefined,
    hips: m(p.hips),
    handR: m(p.handL), handL: m(p.handR),
    elbowR: m(p.elbowL), elbowL: m(p.elbowR),
    footR: m(p.footL), footL: m(p.footR),
    kneeR: m(p.kneeL), kneeL: m(p.kneeR),
    head: p.head ? new THREE.Vector2(-p.head.x, p.head.y) : undefined,
    bat: p.bat ? { grip: m(p.bat.grip)!, dir: m(p.bat.dir)! } : p.bat,
  };
  for (const k of Object.keys(out) as (keyof ProcPose)[]) if (out[k] === undefined) delete out[k];
  return out;
}

export { samplePose };
