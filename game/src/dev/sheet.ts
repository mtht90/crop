import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assets, loadAssets } from '../render/assets';

/** Contact sheet of clips: #sheet:Clip@frac,Clip@frac,... */
export async function sheet(root: HTMLElement) {
  await loadAssets();
  const list = decodeURIComponent(location.hash.split(':')[1] ?? '').split(',').filter(Boolean);
  const cols = 4;
  const rows = Math.ceil(list.length / cols);
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setSize(cols * 260, rows * 300);
  root.appendChild(r.domElement);
  r.setScissorTest(true);
  list.forEach((item, i) => {
    const [name, frac] = item.split('@');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdde8ff);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.5));
    const m = clone(assets.models.female.scene);
    scene.add(m);
    const mixer = new THREE.AnimationMixer(m);
    const clip = assets.clips[name];
    mixer.clipAction(clip).play();
    mixer.setTime(clip.duration * Number(frac ?? 0));
    const cam = new THREE.PerspectiveCamera(35, 260 / 300, 0.1, 50);
    const side = location.hash.includes('side') ? 1 : 0;
    cam.position.set(side ? 4.2 : 2.2, 1.3, side ? 0.4 : 3.6);
    cam.lookAt(0, 0.85, 0);
    const x = (i % cols) * 260;
    const y = (rows - 1 - Math.floor(i / cols)) * 300;
    r.setViewport(x, y, 260, 300);
    r.setScissor(x, y, 260, 300);
    r.render(scene, cam);
    const label = document.createElement('div');
    label.textContent = `${name} ${frac ?? 0}`;
    Object.assign(label.style, { position: 'absolute', left: `${x + 4}px`, top: `${Math.floor(i / cols) * 300 + 4}px`, font: '12px monospace', background: '#fff' });
    root.appendChild(label);
  });
  (window as unknown as { __done: boolean }).__done = true;
}
