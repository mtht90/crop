import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { applyCapBrand, makeCapBall } from './cap';
import type { CapBrand } from '../game/caps';

/** 選択画面で、選んだキャップをくるくる回して見せる小さな 3D 表示 */
export class CapPreview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  private cap: THREE.Group;
  private raf = 0;
  private t = 0;
  private last = performance.now();

  constructor(brand: CapBrand, size = 132) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cap3d';
    this.canvas.style.width = this.canvas.style.height = `${size}px`;
    this.cap = makeCapBall(brand, false);
    try {
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      r.setSize(size, size, false);
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.outputColorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(r);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      this.renderer = r;
    } catch {
      // WebGL が使えないときは何も描かない
      this.canvas.style.display = 'none';
    }
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(1, 2, 1.5);
    this.scene.add(key, new THREE.AmbientLight('#ffffff', 0.25));
    this.scene.add(this.cap);
    this.camera.position.set(0, 0.16, 0.26);
    this.camera.lookAt(0, 0, 0);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      // 天面のラベルが見えるように傾け、ゆっくり回す
      this.cap.rotation.set(0.55 + Math.sin(this.t * 0.9) * 0.18, this.t * 0.9, Math.sin(this.t * 0.6) * 0.12);
      this.renderer?.render(this.scene, this.camera);
    };
    loop();
  }

  set(brand: CapBrand) {
    applyCapBrand(this.cap, brand);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
