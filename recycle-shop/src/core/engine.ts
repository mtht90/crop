import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export type Quality = 'low' | 'medium' | 'high';

type Updatable = (dt: number, time: number) => void;

/** レンダラー・ポストエフェクト・メインループ */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
  readonly labels: CSS2DRenderer;
  private composer!: EffectComposer;
  private outline!: OutlinePass;
  private bloom!: UnrealBloomPass;
  private gtao: GTAOPass | null = null;
  private smaa: SMAAPass | null = null;
  private updaters: Updatable[] = [];
  private clock = new THREE.Timer();
  quality: Quality = 'high';
  paused = false;
  /** ゲーム内時間の倍率 (UI 表示中に 0 にするなど) */
  timeScale = 1;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'game-canvas';

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    this.scene.add(this.camera);
    this.buildComposer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer?.dispose();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = null;
    if (this.quality === 'high') {
      this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.gtao);
    }
    this.outline = new OutlinePass(size, this.scene, this.camera);
    this.outline.edgeStrength = 4;
    this.outline.edgeGlow = 0.3;
    this.outline.edgeThickness = 1.5;
    this.outline.pulsePeriod = 2.2;
    this.outline.visibleEdgeColor.set('#ffd34d');
    this.outline.hiddenEdgeColor.set('#7a5a10');
    this.composer.addPass(this.outline);
    this.bloom = new UnrealBloomPass(size, 0.18, 0.35, 2.2);
    this.bloom.enabled = this.quality !== 'low';
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.smaa = null;
    if (this.quality !== 'low') {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }
    this.resize();
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.setPixelRatio(q === 'low' ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.5));
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.buildComposer();
  }

  setOutline(objs: THREE.Object3D[], color = '#ffd34d') {
    this.outline.selectedObjects = objs;
    this.outline.visibleEdgeColor.set(color);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.labels.setSize(w, h);
  }

  onUpdate(fn: Updatable) {
    this.updaters.push(fn);
    return () => { this.updaters = this.updaters.filter((f) => f !== fn); };
  }

  start() {
    const loop = (t: number) => {
      requestAnimationFrame(loop);
      this.clock.update(t);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  /** 1 フレーム進める (自動テストからも呼べる) */
  frame(dt: number) {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 1) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    const time = this.clock.getElapsed();
    if (!this.paused) for (const u of this.updaters) u(dt, time);
    this.composer.render(dt);
    this.labels.render(this.scene, this.camera);
  }
}
