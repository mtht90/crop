/** 開発用：?models=url1,url2,... のモデルを格子状に並べて表示する（素材選び用） */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const params = new URLSearchParams(location.search);
const urls = (params.get('models') ?? '').split(',').filter(Boolean);
const cols = Number(params.get('cols') ?? Math.ceil(Math.sqrt(urls.length)));
const cell = Number(params.get('cell') ?? 220);
const rows = Math.ceil(urls.length / cols);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
renderer.setPixelRatio(1);
renderer.setSize(cols * cell, rows * cell);
await renderer.init();
renderer.setScissorTest(true);
renderer.autoClear = false;
const loader = new GLTFLoader();
const labels = document.getElementById('labels')!;

for (let i = 0; i < urls.length; i++) {
  const url = urls[i];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3a4660');
  scene.add(new THREE.HemisphereLight('#ffffff', '#445', 2.2));
  const sun = new THREE.DirectionalLight('#fff', 2.5);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const gltf = await loader.loadAsync(url);
  scene.add(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
  const d = Math.max(size.x, size.y, size.z) * 2.2;
  cam.position.set(center.x + d * 0.5, center.y + d * 0.35, center.z + d * 0.9);
  cam.lookAt(center);
  const x = (i % cols) * cell;
  const y = (rows - 1 - Math.floor(i / cols)) * cell;
  renderer.setViewport(x, y, cell, cell);
  renderer.setScissor(x, y, cell, cell);
  renderer.clear();
  renderer.render(scene, cam);
  const label = document.createElement('div');
  label.style.left = `${x}px`;
  label.style.top = `${Math.floor(i / cols) * cell + cell - 16}px`;
  label.style.width = `${cell}px`;
  label.textContent = decodeURIComponent(url.split('/').pop()!);
  labels.appendChild(label);
}
document.body.dataset.ready = '1';
