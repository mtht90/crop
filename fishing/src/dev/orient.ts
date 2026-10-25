import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 開発用：変換済みの魚の向き確認（赤 = +X 頭、緑 = +Y 背）
const ids = ['bass', 'trout', 'salmon', 'koi', 'catfish', 'arowana'];
const r = new THREE.WebGLRenderer({ antialias: true });
r.setSize(innerWidth, innerHeight);
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x334455);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
cam.position.set(0, 0, 6.5);
const loader = new GLTFLoader();
Promise.all(ids.map((id, i) => loader.loadAsync(`/assets/fish/${id}.json`).then((g) => {
  const o = g.scene;
  o.position.set((i % 3) * 1.4 - 1.4, 1.1 - Math.floor(i / 3) * 1.1, 0);
  o.add(new THREE.AxesHelper(0.6));
  scene.add(o);
}))).then(() => r.render(scene, cam));
