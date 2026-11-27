// 素材テスト用のシーン。KayKit の六角タイルで30マスの輪を作り、建物・駒・サイコロを並べて見た目を確認する。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.92;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25;

// 空のグラデーション
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 2;
skyCanvas.height = 256;
const g = skyCanvas.getContext('2d')!;
const grad = g.createLinearGradient(0, 0, 0, 256);
grad.addColorStop(0, '#4f9be8');
grad.addColorStop(1, '#d9f1ff');
g.fillStyle = grad;
g.fillRect(0, 0, 2, 256);
const sky = new THREE.CanvasTexture(skyCanvas);
sky.colorSpace = THREE.SRGBColorSpace;
scene.background = sky;
scene.fog = new THREE.Fog('#cfe8fb', 60, 140);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 400);
const view = new URLSearchParams(location.search).get('view') ?? 'wide';
if (view === 'close') {
  camera.position.set(14, 12, 24);
  camera.lookAt(6, 0, 8);
} else {
  camera.position.set(0, 34, 38);
  camera.lookAt(0, -1, 2);
}

scene.add(new THREE.HemisphereLight('#e4f2ff', '#5d7a45', 0.75));
const sun = new THREE.DirectionalLight('#fff1d8', 1.7);
sun.position.set(-18, 30, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();
function load(path: string): Promise<THREE.Group> {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(`./models/${path}`).then((g) => g.scene));
  return cache.get(path)!;
}
async function place(path: string, x: number, y: number, z: number, rotY = 0, scale = 1) {
  const src = await load(path);
  const o = src.clone(true);
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  o.scale.setScalar(scale);
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  scene.add(o);
  return o;
}

// 六角タイルの寸法を実物から測る
const probe = await load('hex/hex_grass.gltf');
const box = new THREE.Box3().setFromObject(probe);
const size = box.getSize(new THREE.Vector3());
const flat = size.x > size.z; // 平らな辺が上下にある向きか
const s = (flat ? size.x : size.z) / 2;
const TOP = box.max.y;
function axial(q: number, r: number): THREE.Vector3 {
  return flat
    ? new THREE.Vector3(s * 1.5 * q, 0, s * Math.sqrt(3) * (r + q / 2))
    : new THREE.Vector3(s * Math.sqrt(3) * (q + r / 2), 0, s * 1.5 * r);
}
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function ring(radius: number): [number, number][] {
  const out: [number, number][] = [];
  let q = DIRS[4][0] * radius;
  let r = DIRS[4][1] * radius;
  for (let side = 0; side < 6; side++) {
    for (let i = 0; i < radius; i++) {
      out.push([q, r]);
      q += DIRS[side][0];
      r += DIRS[side][1];
    }
  }
  return out;
}
const dist = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2;

// 島：半径7まで。半径5が盤面の道、外側は自然、内側は湖と山
const PATH_R = 5;
const path = ring(PATH_R);
const pathSet = new Set(path.map(([q, r]) => `${q},${r}`));
// 各マスの外側に隣接する六角形を「土地」にする
const plots: [number, number][] = path.map(([q, r]) => {
  const here = axial(q, r);
  let best: [number, number] = [q, r];
  let bestDot = -Infinity;
  for (const [dq, dr] of DIRS) {
    const n: [number, number] = [q + dq, r + dr];
    if (dist(...n) !== PATH_R + 1) continue;
    const v = axial(...n).sub(here).normalize();
    const dot = v.dot(here.clone().normalize());
    if (dot > bestDot + 1e-6) { bestDot = dot; best = n; }
  }
  return best;
});
const plotSet = new Set(plots.map(([q, r]) => `${q},${r}`));
console.log('plots unique', plotSet.size, 'of', plots.length);
const rnd = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
const jobs: Promise<unknown>[] = [];
for (let q = -8; q <= 8; q++) {
  for (let r = -8; r <= 8; r++) {
    const d = dist(q, r);
    if (d > 7) continue;
    const p = axial(q, r);
    if (pathSet.has(`${q},${r}`)) continue;
    const isPlot = plotSet.has(`${q},${r}`);
    let tile = 'hex/hex_grass.gltf';
    if (d <= 1) tile = 'hex/hex_water.gltf';
    jobs.push(place(tile, p.x, 0, p.z));
    // 飾り
    const roll = rnd();
    if (isPlot) continue;
    if (d === 2 || d === 3) {
      if (roll < 0.15) jobs.push(place('hex/trees_A_medium.gltf', p.x, TOP, p.z, rnd() * 6));
      else if (roll < 0.4) jobs.push(place('hex/hills_B_trees.gltf', p.x, TOP, p.z, rnd() * 6));
      else if (roll < 0.5) jobs.push(place('hex/mountain_A_grass_trees.gltf', p.x, TOP, p.z, rnd() * 6));
    } else if (d >= 6) {
      if (roll < 0.3) jobs.push(place('hex/trees_B_large.gltf', p.x, TOP, p.z, rnd() * 6));
      else if (roll < 0.42) jobs.push(place('hex/mountain_B_grass_trees.gltf', p.x, TOP, p.z, rnd() * 6));
      else if (roll < 0.5) jobs.push(place('hex/rock_single_C.gltf', p.x, TOP, p.z, rnd() * 6));
    } else if (d === 4 && roll < 0.12) {
      jobs.push(place('hex/tree_single_A.gltf', p.x, TOP, p.z, rnd() * 6));
    }
    // 島の下側（浮島の岩肌）
    if (d === 7) jobs.push(place('hex/hex_grass_bottom.gltf', p.x, -size.y * 0.98, p.z));
  }
}
jobs.push(place('hex/mountain_C_grass_trees.gltf', 0, TOP, 0, 0.3, 1));
// 雲
for (let k = 0; k < 10; k++) {
  const a = (k / 10) * Math.PI * 2 + rnd();
  const R = 26 + rnd() * 8;
  jobs.push(place(rnd() < 0.5 ? 'hex/cloud_big.gltf' : 'hex/cloud_small.gltf', Math.cos(a) * R, -3 + rnd() * 6, Math.sin(a) * R, rnd() * 6, 2 + rnd() * 2));
}

// 盤面の道（30マス）：少し持ち上げ、角マスは石畳風に
const PLAYERS = ['red', 'blue', 'green', 'yellow'];
const LEVEL_MODEL = ['', 'building_home_A', 'building_home_B', 'building_tower_A', 'building_castle'];
const demoOwned: Record<number, [number, number]> = {
  1: [0, 1], 2: [0, 2], 3: [0, 1], 6: [1, 3], 7: [1, 1], 9: [2, 2], 12: [3, 4], 13: [3, 1], 17: [2, 3], 18: [2, 1], 22: [1, 2], 27: [0, 4],
};
const deg = (from: THREE.Vector3, to: THREE.Vector3) => (Math.round((Math.atan2(-(to.z - from.z), to.x - from.x) * 180) / Math.PI / 60) * 60 + 360) % 360;
path.forEach(([q, r], i) => {
  const p = axial(q, r);
  const prev = axial(...path[(i + path.length - 1) % path.length]);
  const next = axial(...path[(i + 1) % path.length]);
  const a1 = deg(p, prev);
  const a2 = deg(p, next);
  const diff = (a2 - a1 + 360) % 360;
  let model = 'hex/hex_road_A.gltf';
  let rot = a1;
  if (diff !== 180) {
    model = 'hex/hex_road_B.gltf';
    rot = (a1 - 180 + 360) % 360;
    if ((60 + rot) % 360 !== a2) rot = (a2 - 180 + 360) % 360;
  }
  jobs.push(place(model, p.x, 0.15, p.z, (rot * Math.PI) / 180));
  const owned = demoOwned[i];
  const [pq, pr] = plots[i];
  const pp = axial(pq, pr);
  const face = Math.atan2(p.x - pp.x, p.z - pp.z); // 道の方を向く
  if (i % 5 === 0) return;
  if (owned) {
    const [pl, lv] = owned;
    jobs.push(place(`hex/${LEVEL_MODEL[lv]}_${PLAYERS[pl]}.gltf`, pp.x, TOP, pp.z, face, 0.95));
  } else {
    jobs.push(place('hex/building_dirt.gltf', pp.x, TOP, pp.z, face, 0.9));
  }
});
// 角マスの飾り
const cornerProps = ['hex/building_castle_blue.gltf', 'hex/building_barracks_red.gltf', 'bits/coin_10_gold.gltf', 'hex/building_tower_catapult_green.gltf', 'hex/building_church_yellow.gltf', 'hex/building_tavern_blue.gltf'];
cornerProps.forEach((m, k) => {
  const [q, r] = plots[k * 5];
  const p = axial(q, r);
  if (k === 2) {
    for (let n = 0; n < 6; n++) jobs.push(place('bits/coin_10_gold.gltf', p.x + (rnd() - 0.5) * 1.1, TOP, p.z + (rnd() - 0.5) * 1.1, rnd() * 6, 0.7));
  } else jobs.push(place(m, p.x, TOP, p.z, 0, 1));
});

// 駒：台座つきのキャラ（待機アニメーション）
const mixers: THREE.AnimationMixer[] = [];
const animSrc = await loader.loadAsync('./models/adv/Rig_Medium_General.glb');
const idle = animSrc.animations.find((a) => a.name === 'Idle_A')!;
const heroes = ['Knight', 'Mage', 'Rogue_Hooded', 'Barbarian'];
const heroTiles = [4, 10, 16, 24];
for (let k = 0; k < 4; k++) {
  const [q, r] = path[heroTiles[k]];
  const p = axial(q, r);
  const lookIn = Math.atan2(-p.x, -p.z);
  jobs.push(place(`bits/playerstand_${PLAYERS[k]}.gltf`, p.x, TOP + 0.15, p.z, 0, 1.6));
  const gltf = await loader.loadAsync(`./models/adv/${heroes[k]}.glb`);
  const hero = skeletonClone(gltf.scene) as THREE.Object3D;
  hero.scale.setScalar(0.85);
  hero.position.set(p.x, TOP + 0.3, p.z);
  hero.rotation.y = lookIn + Math.PI * 0.85;
  hero.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  scene.add(hero);
  const mixer = new THREE.AnimationMixer(hero);
  mixer.clipAction(idle).play();
  mixer.setTime(k * 0.4);
  mixers.push(mixer);
}

// サイコロ（中央の湖の手前に2つ）
jobs.push(place('bits/D6_A.gltf', -0.9, TOP + 0.3, 3.4, 0.4, 1.6));
jobs.push(place('bits/D6_A.gltf', 0.5, TOP + 0.3, 3.7, 1.1, 1.6));

await Promise.all(jobs);
const clock = new THREE.Clock();
function frame() {
  const dt = clock.getDelta();
  mixers.forEach((m) => m.update(dt));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
(window as unknown as { ready: boolean }).ready = true;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
