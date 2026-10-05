import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterDef } from '../combat/types';
import { assets, type ModelKey } from './assets';
import { skinnedOutline } from './charModel';
import { toon } from './toon';

const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

/**
 * First-person hand cut out of the character's own skinned body model: only
 * the triangles of the forearm, hand and fingers are kept, the fingers are
 * curled by `grip` (0 = open, 1 = fist), and the model is placed so the wrist
 * sits at the origin with the fingers pointing along -Z and the thumb up.
 */
export function buildFpHand(def: CharacterDef, side: 'L' | 'R', grip: number) {
  const s = side === 'L' ? 'l' : 'r';
  const outer = new THREE.Group();
  const model = clone(assets.models[def.look.body as ModelKey].scene);
  model.matrixAutoUpdate = true;
  const bones: Record<string, THREE.Bone> = {};
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
  });
  const keep = new Set([`lowerarm_${s}`, `hand_${s}`]);
  for (const f of [...FINGERS, 'thumb']) for (let i = 1; i <= 4; i++) keep.add(i === 4 ? `${f}_04_leaf_${s}` : `${f}_0${i}_${s}`);

  const skinned: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  for (const m of skinned) {
    if (/face|eye|brow/i.test(m.name)) {
      m.visible = false;
      continue;
    }
    // Keep only triangles whose vertices are driven mostly by the forearm / hand / finger bones.
    const g = m.geometry;
    const idx = g.index!;
    const si = g.attributes.skinIndex as THREE.BufferAttribute;
    const sw = g.attributes.skinWeight as THREE.BufferAttribute;
    const names = m.skeleton.bones.map((b) => b.name);
    const ok = (v: number) => {
      let best = 0;
      let bi = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(v, k);
        if (w > best) {
          best = w;
          bi = si.getComponent(v, k);
        }
      }
      return keep.has(names[bi]);
    };
    const out: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t);
      const b = idx.getX(t + 1);
      const c = idx.getX(t + 2);
      if (ok(a) && ok(b) && ok(c)) out.push(a, b, c);
    }
    const ng = new THREE.BufferGeometry();
    for (const [k, v] of Object.entries(g.attributes)) ng.setAttribute(k, v);
    ng.setIndex(out);
    m.geometry = ng;
    const src = m.material as THREE.MeshStandardMaterial;
    const mat = toon(0xffffff, { map: src.map ?? undefined, rim: 0.3, soft: true }).clone();
    mat.color.setRGB(1.35, 1.22, 1.15);
    m.material = mat;
    m.frustumCulled = false;
    m.renderOrder = 1;
  }

  outer.add(model);
  model.updateMatrixWorld(true);
  const P = (n: string) => bones[n].getWorldPosition(new THREE.Vector3());
  const ha = P(`hand_${s}`);
  const fwd = P(`middle_01_${s}`).sub(ha).normalize();
  // Across the knuckles (index -> pinky) and the palm normal (the thumb sits on the palm side).
  const across = P(`pinky_01_${s}`).sub(P(`index_01_${s}`));
  across.sub(fwd.clone().multiplyScalar(across.dot(fwd))).normalize();
  const palm = new THREE.Vector3().crossVectors(fwd, across);
  if (palm.dot(P(`thumb_02_${s}`).sub(ha)) < 0) palm.negate();

  // Curl: rotate each finger joint so it swings from `fwd` toward the palm.
  const rot = (bone: THREE.Bone, axisWorld: THREE.Vector3, angle: number) => {
    const parentQ = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
    const axis = axisWorld.clone().applyQuaternion(parentQ.invert());
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    bone.updateMatrixWorld(true);
  };
  const curlAxis = new THREE.Vector3().crossVectors(fwd, palm).normalize();
  for (const f of FINGERS) {
    for (let i = 1; i <= 3; i++) rot(bones[`${f}_0${i}_${s}`], curlAxis, grip * (i === 1 ? 1.2 : 1.35));
  }
  // Thumb folds across toward the palm.
  const tdir = P(`thumb_03_${s}`).sub(P(`thumb_01_${s}`)).normalize();
  const thumbAxis = new THREE.Vector3().crossVectors(tdir, palm).normalize();
  rot(bones[`thumb_02_${s}`], thumbAxis, grip * 0.55);
  rot(bones[`thumb_03_${s}`], thumbAxis, grip * 0.7);

  // Grip frame: knuckle line pointing down so the thumb ends up on top (pistol / sword grip).
  const up = across.clone().negate();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  // Wrist at the origin, fingers along -Z, thumb up.
  const handFrame = new THREE.Matrix4().makeBasis(right, up, fwd).setPosition(ha);
  const want = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
  want.multiply(handFrame.invert());
  want.decompose(model.position, model.quaternion, model.scale);
  model.updateMatrixWorld(true);
  for (const m of skinned) if (m.visible) skinnedOutline(m, 0.004);
  return outer;
}
