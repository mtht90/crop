import * as THREE from 'three';
import { SPECIES } from '../data/species';
import { buildFishObject } from '../render/fishMesh';

// 開発用：全魚種（＋色違い・模様違い）を並べて確認するページ。 /lab.html?variants=1
const params = new URLSearchParams(location.search);
const showVariants = params.has('variants');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a46);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x404030, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 4, 3);
scene.add(sun);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new (class extends THREE.Scene {
  constructor() {
    super();
    this.background = new THREE.Color(0x8fb4d0);
  }
})()).texture;

const items: { species: (typeof SPECIES)[number]; color: string | null; pattern: string | null }[] = [];
for (const s of SPECIES) {
  items.push({ species: s, color: null, pattern: null });
  if (showVariants) {
    for (const c of s.colors) items.push({ species: s, color: c.id, pattern: null });
    for (const p of s.patterns) items.push({ species: s, color: null, pattern: p.id });
  }
}
const cols = showVariants ? 8 : 5;
const swims: { uTime: { value: number } }[] = [];
items.forEach((it, i) => {
  const f = buildFishObject(it.species, it.color, it.pattern);
  f.group.position.set((i % cols) * 1.2 - (cols - 1) * 0.6, -Math.floor(i / cols) * 0.75 + 1.5, 0);
  f.group.rotation.y = -0.35;
  f.group.rotation.x = 0.15;
  scene.add(f.group);
  swims.push(f.swim);
});
const rows = Math.ceil(items.length / cols);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5 - (rows - 1) * 0.375 + 0.3, Math.max(rows, cols * 0.75) * 1.15 + 1.5);
camera.lookAt(0, 1.5 - (rows - 1) * 0.375, 0);
renderer.setAnimationLoop((t) => {
  for (const s of swims) s.uTime.value = t / 1000;
  renderer.render(scene, camera);
});
