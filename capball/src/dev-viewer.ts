import * as THREE from 'three';
import { loadAssets } from './core/assets';
import { buildField } from './render/field';
import { Character, type Uniform } from './render/character';
import { POSITIONS } from './game/geom';

export async function devViewer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const a = await loadAssets(() => {});
  buildField(scene, a, renderer);
  const q = new URLSearchParams(location.search);
  const U: Uniform = { key: 'home', primary: '#f4f4f0', accent: '#1d3f8f', pants: '#f2f2ee', shoes: '#1b2440', cap: '#1d3f8f', brim: '#1d3f8f' };
  const V: Uniform = { key: 'away', primary: '#e8663a', accent: '#3a2a20', pants: '#ece7dc', shoes: '#2a2a2a', cap: '#e8663a', brim: '#2a2a2a' };
  const chars: Character[] = [];
  const names = ['knight', 'barbarian', 'mage', 'rogue'] as const;
  const mode = q.get('mode') || 'field';
  if (mode === 'pitch' || mode === 'swing') {
    const { pitchPose, swingKeys, samplePose, PITCH_TOTAL_T, SWING_TOTAL_T } = await import('./render/motions');
    const N = 7;
    const keys = swingKeys(new THREE.Vector3(0.05, 0.6, 0.8));
    for (let k = 0; k < N; k++) {
      const n = names[k % 4];
      const c = new Character(a.models[n], n, U, a.anims);
      c.attachBat(a.bat.scene);
      c.root.position.set((k - (N - 1) / 2) * 1.3, 0, -3);
      c.root.rotation.y = +(q.get('ry') || 90) * Math.PI / 180;
      c.play('Idle');
      const t = (k / (N - 1)) * (mode === 'pitch' ? PITCH_TOTAL_T : SWING_TOTAL_T);
      c.setPose(mode === 'pitch' ? pitchPose(t) : samplePose(keys, t), 1);
      c.poseWeight = 1;
      scene.add(c.root);
      chars.push(c);
    }
  } else if (mode === 'line') {
    names.forEach((n, i) => {
      for (const [j, u] of [U, V].entries()) {
        const c = new Character(a.models[n], n, u, a.anims);
        c.root.position.set((i - 1.5) * 1.6 + j * 0.0, 0, j * -2.5 - 3);
        c.play(q.get('clip') || 'Idle');
        scene.add(c.root);
        chars.push(c);
      }
    });
    const head = chars[0].bones.head;
    const box = new THREE.Box3();
    chars[0].model.updateMatrixWorld(true);
    chars[0].model.traverse((o) => { if ((o as THREE.Mesh).isMesh && /Head/.test(o.name) && !/outline/.test(o.name)) box.expandByObject(o); });
    const hp = head.getWorldPosition(new THREE.Vector3());
    const ws = head.getWorldScale(new THREE.Vector3());
    console.log('headbone', hp.toArray(), 'scale', ws.toArray(), 'headbox', box.min.toArray(), box.max.toArray());
  } else {
    let i = 0;
    for (const [pos, p] of Object.entries(POSITIONS)) {
      const n = names[i++ % 4];
      const c = new Character(a.models[n], n, i % 2 ? U : V, a.anims);
      c.root.position.copy(p);
      c.faceTowards(0, pos === 'C' ? -10 : 0);
      c.play(pos === 'C' ? 'Crouching' : 'Idle');
      scene.add(c.root);
      chars.push(c);
    }
  }
  const cam = new THREE.PerspectiveCamera(+(q.get('fov') || 42), innerWidth / innerHeight, 0.1, 400);
  const cp = (q.get('cam') || '0,2.1,4.6,0,0.9,-10').split(',').map(Number);
  cam.position.set(cp[0], cp[1], cp[2]);
  cam.lookAt(cp[3], cp[4], cp[5]);
  const clock = new THREE.Clock();
  let frames = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    for (const c of chars) c.update(dt);
    renderer.render(scene, cam);
    if (++frames === 20) (window as unknown as { done: boolean }).done = true;
  });
}
