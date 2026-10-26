import * as THREE from 'three';
import type { Species } from '../data/types';
import { buildFishObject, type FishObject } from './fishMesh';

/** 図鑑・釣果画面の3Dプレビュー（専用の小さなレンダラーを1つだけ使い回す） */
export class FishPreview {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 2, 0.01, 20);
  private fish: FishObject | null = null;
  private spin = 0;
  private running = false;
  private host: HTMLElement | null = null;
  private thumbs = new Map<string, string>();
  private sparkle = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'preview-canvas';
    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x40382c, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.5, 2.5, 3);
    const rim = new THREE.DirectionalLight(0x9fd0ff, 1.6);
    rim.position.set(-2, 1, -2);
    this.scene.add(key, rim);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x9cb8cc);
    this.scene.environment = pm.fromScene(env).texture;
    this.camera.position.set(0, 0.05, 1.6);
    this.camera.lookAt(0, 0, 0);
  }

  private setFish(s: Species, colorId: string | null, patternId: string | null, silhouette = false): void {
    if (this.fish) {
      this.scene.remove(this.fish.group);
      this.fish.dispose();
    }
    this.fish = buildFishObject(s, colorId, patternId, silhouette);
    this.scene.add(this.fish.group);
  }

  /** 要素の中にプレビューを表示して回転させる */
  mount(host: HTMLElement, s: Species, colorId: string | null, patternId: string | null, opts: { sparkle?: boolean } = {}): void {
    this.host = host;
    host.appendChild(this.renderer.domElement);
    const w = host.clientWidth || 360;
    const h = host.clientHeight || 200;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.setFish(s, colorId, patternId);
    this.spin = -0.5;
    this.sparkle = opts.sparkle ? 1 : 0;
    if (!this.running) {
      this.running = true;
      const loop = (t: number) => {
        if (!this.running) return;
        this.spin += 0.006;
        if (this.fish) {
          this.fish.group.rotation.y = Math.sin(this.spin) * 0.6 - 0.15;
          this.fish.group.rotation.x = 0.1;
          this.fish.swim.uTime.value = t / 1000;
          this.fish.swim.uAmp.value = 0.025;
          for (const m of this.fish.materials) {
            if (m instanceof THREE.MeshStandardMaterial && m.map && this.sparkle) {
              m.emissive.setScalar(0.12 + 0.1 * Math.sin(t / 150));
            }
          }
        }
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  unmount(): void {
    this.running = false;
    if (this.host && this.renderer.domElement.parentElement === this.host) this.host.removeChild(this.renderer.domElement);
    this.host = null;
  }

  /** 図鑑の一覧用サムネイル（dataURL） */
  thumbnail(s: Species, colorId: string | null, patternId: string | null, silhouette: boolean): string {
    const key = `${s.id}|${colorId}|${patternId}|${silhouette}`;
    const hit = this.thumbs.get(key);
    if (hit) return hit;
    const wasRunning = this.running;
    this.running = false;
    this.renderer.setSize(360, 180);
    this.camera.aspect = 2;
    this.camera.updateProjectionMatrix();
    this.setFish(s, colorId, patternId, silhouette);
    this.fish!.group.rotation.set(0.12, -0.25, 0);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.thumbs.set(key, url);
    this.running = wasRunning;
    return url;
  }
}
