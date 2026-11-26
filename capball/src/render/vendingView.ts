import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadExtraModel } from '../core/assets';
import { makeCapBall } from './cap';
import type { CapBrand } from '../game/caps';

/**
 * 自販機の画面の 3D 表示（自販機のモデルは CC0 の「Vending Machines (Low Poly Style)」）。
 * 買うと自販機がガタッと揺れ、取り出し口からキャップが飛び出してくる。
 */
export class VendingView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  private machine = new THREE.Group();
  private raf = 0;
  private t = 0;
  private last = performance.now();
  private shakeT = -1;
  private cap: THREE.Group | null = null;
  private capT = -1;
  private capDone: (() => void) | null = null;
  private glow = new THREE.PointLight('#fff4c0', 0, 3);
  /** 取り出し口（自販機の座標） */
  private slot = new THREE.Vector3(0, 0.35, 0.45);

  constructor(w = 300, h = 330) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vend3d';
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    try {
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      r.setSize(w, h, false);
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.outputColorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(r);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      this.renderer = r;
    } catch {
      this.canvas.style.display = 'none';
    }
    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(2, 4, 3);
    this.scene.add(key, new THREE.AmbientLight('#ffffff', 0.35), this.machine, this.glow);
    // 床の影
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 0.6, 1);
    this.scene.add(shadow);
    this.camera.position.set(1.4, 1.5, 4.2);
    this.camera.lookAt(0, 0.98, 0);
    loadExtraModel('vending').then((g) => this.setModel(g.scene)).catch((e) => console.warn(e));
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.renderer?.render(this.scene, this.camera);
    };
    loop();
  }

  private setModel(root: THREE.Object3D) {
    // 2台入っているうち、飲み物の自販機だけを使う
    const drink = root.getObjectByName('Drink_Vending_Machine') ?? root;
    drink.removeFromParent();
    drink.position.set(0, 0, 0);
    drink.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(drink);
    const size = box.getSize(new THREE.Vector3());
    const s = 2 / size.y;
    const pivot = new THREE.Group();
    drink.position.sub(box.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, size.y / 2, 0));
    pivot.add(drink);
    pivot.scale.setScalar(s);
    drink.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) {
        const st = mt as THREE.MeshStandardMaterial;
        if (st.roughness !== undefined) st.roughness = Math.min(st.roughness, 0.55);
        // 側面の真っ黒（アスファルト色）は重く見えるので、濃い灰色にする
        if (st.name?.startsWith('Asphalt')) st.color?.set('#3a3e4a');
      }
    });
    this.machine.add(pivot);
    // このモデルは前面が -x を向いているので、カメラ（+z）側へ回す
    pivot.rotation.y = Math.PI / 2;
    // 取り出し口：前面の下のほう
    const depth = (size.x / size.y) * 2;
    this.slot.set(0, 0.42, depth / 2 + 0.04);
  }

  /** 買った演出：揺れて、キャップが取り出し口から飛び出す。終わると resolve */
  dispense(brand: CapBrand): Promise<void> {
    return new Promise((resolve) => {
      this.shakeT = 0;
      if (this.cap) this.scene.remove(this.cap);
      this.cap = makeCapBall(brand, false);
      this.cap.scale.setScalar(2.6);
      this.cap.visible = false;
      this.scene.add(this.cap);
      this.capT = -0.45;
      this.capDone = resolve;
    });
  }

  private update(dt: number) {
    this.t += dt;
    // ふだんはゆっくり左右に向きを変える
    this.machine.rotation.y = Math.sin(this.t * 0.5) * 0.12;
    this.machine.position.x = 0;
    if (this.shakeT >= 0) {
      this.shakeT += dt;
      const k = Math.max(0, 1 - this.shakeT / 0.5);
      this.machine.position.x = Math.sin(this.shakeT * 60) * 0.04 * k;
      this.machine.rotation.z = Math.sin(this.shakeT * 45) * 0.025 * k;
      this.glow.intensity = 3 * k;
      this.glow.position.set(0, 1.4, 0.8);
      if (this.shakeT > 0.5) this.shakeT = -1;
    }
    if (this.cap && this.capT > -1) {
      this.capT += dt;
      const c = this.cap;
      if (this.capT < 0) return;
      c.visible = true;
      // 取り出し口から手前へ放物線で飛び出し、カメラの前で止まる
      const u = Math.min(1, this.capT / 0.7);
      const from = this.slot.clone().applyMatrix4(this.machine.matrixWorld);
      const to = this.camera.position.clone().lerp(new THREE.Vector3(0, 1.0, 0), 0.62);
      c.position.lerpVectors(from, to, 1 - Math.pow(1 - u, 2));
      c.position.y += Math.sin(u * Math.PI) * 0.5;
      c.rotation.set(1.1 - u * 0.5, this.capT * 9, 0.3);
      if (u >= 1 && this.capDone) {
        const d = this.capDone;
        this.capDone = null;
        setTimeout(d, 250);
      }
    }
  }

  /** キャップを消してもとの状態に戻す */
  reset() {
    if (this.cap) this.scene.remove(this.cap);
    this.cap = null;
    this.capT = -1;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
