import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

/** 描画の品質。スマホ（指で操作する端末）は軽め、PC は高め。?quality=low|high で指定もできる */
export interface Quality {
  name: 'low' | 'high';
  pixelRatio: number;
  shadows: boolean;
  bloom: boolean;
}

export function detectQuality(): Quality {
  const q = new URLSearchParams(location.search).get('quality');
  const mobile = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const low = q === 'low' || (q !== 'high' && mobile);
  return low
    ? { name: 'low', pixelRatio: Math.min(window.devicePixelRatio, 1.5), shadows: true, bloom: false }
    : { name: 'high', pixelRatio: Math.min(window.devicePixelRatio, 2), shadows: true, bloom: true };
}
import { arena } from './coords';

/**
 * レンダラー・カメラ・ライト。WebGPU が使える環境では WebGPU、使えなければ自動で WebGL2 に切り替わる。
 * 縦長の画面に合わせて、アリーナ全体が手札エリアより上に収まるようにカメラを自動で合わせる。
 */
export class Stage {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 9 / 16, 1, 300);
  /** 画面下の手札エリアと上のバーが占める割合（0..1） */
  bottomInset = 0.25;
  topInset = 0.075;
  /** 相手視点（プレイヤー1）で遊ぶときは true（オンライン対戦用） */
  flipped = false;

  private readonly basePos = new THREE.Vector3();
  private readonly baseTarget = new THREE.Vector3();
  private shake = 0;
  private shakeTime = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** WebGPU のアダプターが取れない環境（埋め込み表示・古い端末）では最初から WebGL2 で作る */
  static async create(canvas: HTMLCanvasElement): Promise<Stage> {
    let forceWebGL = new URLSearchParams(location.search).get('renderer') === 'webgl';
    if (!forceWebGL) {
      try {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
        forceWebGL = !gpu || !(await gpu.requestAdapter());
      } catch {
        forceWebGL = true;
      }
    }
    const stage = new Stage(canvas, forceWebGL);
    await stage.init();
    return stage;
  }

  private constructor(
    readonly canvas: HTMLCanvasElement,
    forceWebGL: boolean,
  ) {
    // ?renderer=webgl で WebGL2 を強制できる（古い端末・不具合の切り分け用）
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false, forceWebGL });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color('#1d2a3a');
    this.scene.fog = new THREE.Fog('#1d2a3a', 60, 140);

    const hemi = new THREE.HemisphereLight('#dfefff', '#4a5a3a', 1.4);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff3dd', 2.6);
    sun.position.set(-10, 26, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  readonly quality = detectQuality();
  private pipeline: THREE.RenderPipeline | null = null;

  async init(): Promise<void> {
    await this.renderer.init();
    if (this.quality.bloom) {
      // 光るもの（炎・雷・閃光）だけがにじむように、しきい値を高めにしたブルーム
      try {
        const scenePass = pass(this.scene, this.camera);
        const color = scenePass.getTextureNode('output');
        this.pipeline = new THREE.RenderPipeline(this.renderer, color.add(bloom(color, 0.55, 0.35, 0.82)));
      } catch (e) {
        console.warn('bloom disabled', e);
        this.pipeline = null;
      }
    }
  }

  get backendName(): string {
    const backend = (this.renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
    return backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.fitCamera();
  }

  /** アリーナの四隅が、手札エリアと上バーを除いた範囲にちょうど収まる距離・注視点を探す */
  fitCamera(): void {
    const cam = this.camera;
    const elevation = THREE.MathUtils.degToRad(57);
    const hw = arena.width / 2 + 0.6;
    const hh = arena.height / 2 + 0.6;
    const corners = [
      new THREE.Vector3(-hw, 0, hh),
      new THREE.Vector3(hw, 0, hh),
      new THREE.Vector3(-hw, 0, -hh),
      new THREE.Vector3(hw, 0, -hh),
      new THREE.Vector3(0, 4, -hh + 2.5), // 奥のキングタワーの頭
    ];
    const bottom = -1 + 2 * this.bottomInset;
    const top = 1 - 2 * this.topInset;
    const desiredSpan = top - bottom;
    const desiredMid = (top + bottom) / 2;
    const flip = this.flipped ? -1 : 1;
    let d = 60;
    let tz = 0;
    const p = new THREE.Vector3();
    for (let i = 0; i < 60; i++) {
      cam.position.set(0, d * Math.sin(elevation), (tz + d * Math.cos(elevation)) * flip);
      cam.lookAt(0, 0, tz * flip);
      cam.updateMatrixWorld();
      let minY = Infinity;
      let maxY = -Infinity;
      let maxX = 0;
      for (const c of corners) {
        p.set(c.x * flip, c.y, c.z * flip).project(cam);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        maxX = Math.max(maxX, Math.abs(p.x));
      }
      const factor = Math.max((maxY - minY) / desiredSpan, maxX / 0.98);
      d *= Math.pow(factor, 0.8);
      tz -= ((maxY + minY) / 2 - desiredMid) * 6;
    }
    this.basePos.copy(cam.position);
    this.baseTarget.set(0, 0, tz * flip);
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  update(dt: number): void {
    this.shakeTime += dt;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.6;
    const t = this.shakeTime * 45;
    this.camera.position.set(
      this.basePos.x + Math.sin(t * 1.3) * s,
      this.basePos.y + Math.sin(t * 1.7 + 1) * s * 0.6,
      this.basePos.z + Math.cos(t * 1.1) * s,
    );
    this.camera.lookAt(this.baseTarget);
  }

  render(): void {
    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** 画面座標（canvas 基準のピクセル）から地面上の点を求める */
  pickGround(clientX: number, clientY: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, out);
  }

  /** ワールド座標 → canvas 内の CSS ピクセル */
  projectToScreen(v: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void {
    const p = v.clone().project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * this.canvas.clientWidth;
    out.y = (-p.y * 0.5 + 0.5) * this.canvas.clientHeight;
    out.visible = p.z < 1;
  }
}
