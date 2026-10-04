import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assets } from './assets';

let probe: { model: THREE.Object3D; mixer: THREE.AnimationMixer } | null = null;
/** Shared off-screen skeleton used to measure clip poses. */
function sample(name: string, t: number) {
  if (!probe) {
    const model = clone(assets.models.female.scene);
    probe = { model, mixer: new THREE.AnimationMixer(model) };
  }
  const { model, mixer } = probe;
  mixer.stopAllAction();
  const a = mixer.clipAction(assets.clips[name]);
  a.reset().play();
  mixer.setTime(t);
  model.updateMatrixWorld(true);
  const p = (n: string) => model.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
  return { handL: p('hand_l'), handR: p('hand_r'), pelvis: p('pelvis') };
}

const contactCache = new Map<string, number>();
/** Finds the moment of maximum hand reach in a clip (the "contact" frame). */
export function contactTime(name: string) {
  const hit = contactCache.get(name);
  if (hit !== undefined) return hit;
  const clip = assets.clips[name];
  let best = 0;
  let bestT = clip.duration * 0.4;
  for (let i = 0; i <= 60; i++) {
    const t = (clip.duration * i) / 60;
    const s = sample(name, t);
    for (const h of [s.handL, s.handR]) {
      const reach = h.z - s.pelvis.z;
      if (reach > best) {
        best = reach;
        bestT = t;
      }
    }
  }
  contactCache.set(name, bestT);
  return bestT;
}


const leadCache = new Map<string, 'l' | 'r'>();
/** Which hand is further forward at time t (e.g. the bow arm in a casting pose). */
export function leadHand(name: string, t = 0): 'l' | 'r' {
  const k = `${name}@${t}`;
  let h = leadCache.get(k);
  if (!h) {
    const s = sample(name, t);
    h = s.handL.z >= s.handR.z ? 'l' : 'r';
    leadCache.set(k, h);
  }
  return h;
}
