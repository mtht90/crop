import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assets, loadAssets } from '../render/assets';

/** Temporary calibration view: model scale/orientation and clip info. */
export async function calib(root: HTMLElement) {
  await loadAssets();
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setSize(900, 600);
  root.appendChild(r.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88bbff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2));
  const cam = new THREE.PerspectiveCamera(40, 1.5, 0.1, 100);
  cam.position.set(2.5, 1.4, 4);
  cam.lookAt(0, 0.9, 0);
  const clipName = location.hash.split(':')[1] ?? 'Idle_Loop';
  const t = Number(location.hash.split(':')[2] ?? 0);
  const out: Record<string, unknown> = {};
  ['female', 'male'].forEach((k, i) => {
    const m = clone(assets.models[k as 'female'].scene);
    m.position.x = i * 1.2 - 0.6;
    scene.add(m);
    const box = new THREE.Box3().setFromObject(m);
    out[k + 'Box'] = [box.min.toArray(), box.max.toArray()];
    const mixer = new THREE.AnimationMixer(m);
    const a = mixer.clipAction(assets.clips[clipName]);
    a.play();
    mixer.setTime(t);
    m.updateMatrixWorld(true);
    const bone = (n: string) => m.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
    out[k + 'Bones'] = { head: bone('Head'), handL: bone('hand_l'), handR: bone('hand_r'), footL: bone('foot_l'), pelvis: bone('pelvis') };
  });
  out.clips = Object.fromEntries(Object.entries(assets.clips).map(([k, c]) => [k, +c.duration.toFixed(2)]));
  r.render(scene, cam);
  (window as unknown as { __calib: unknown }).__calib = out;
}
