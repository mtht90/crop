import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BrightnessContrastEffect,
  HueSaturationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export type Quality = 'low' | 'medium' | 'high';

export type UpdateFn = (dt: number, time: number) => void;

/**
 * Owns the renderer, the post-processing chain and the main loop.
 * Game systems register update callbacks with an explicit priority so that
 * e.g. input is sampled before the player moves, and the camera is final
 * before rendering.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  private ao: N8AOPostPass;
  private bloom: BloomEffect;
  private effects: EffectPass;
  private smaa: SMAAEffect;
  private updates: { fn: UpdateFn; prio: number }[] = [];
  private last = 0;
  private running = false;
  quality: Quality = 'high';
  /** Multiplier applied to dt for game systems (pause = 0). */
  timeScale = 1;
  elapsed = 0;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // done in post
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 220);
    this.scene.add(this.camera);

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new N8AOPostPass(this.scene, this.camera, 1, 1);
    this.ao.configuration.aoRadius = 0.9;
    this.ao.configuration.distanceFalloff = 0.6;
    this.ao.configuration.intensity = 2.2;
    this.ao.configuration.gammaCorrection = false;
    this.ao.setQualityMode('Medium');
    this.composer.addPass(this.ao);

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.92,
      luminanceSmoothing: 0.2,
      intensity: 0.55,
      radius: 0.7,
    });
    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    const grade = new BrightnessContrastEffect({ brightness: -0.02, contrast: 0.1 });
    const sat = new HueSaturationEffect({ saturation: 0.08 });
    const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.45 });
    this.effects = new EffectPass(this.camera, this.bloom, tone, grade, sat, vignette, this.smaa);
    this.composer.addPass(this.effects);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const dpr = window.devicePixelRatio;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 1.5) : q === 'medium' ? 1 : 0.75);
    this.ao.enabled = q !== 'low';
    this.ao.setQualityMode(q === 'high' ? 'High' : 'Low');
    this.ao.configuration.halfRes = q !== 'high';
    this.renderer.shadowMap.enabled = q !== 'low';
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
  }

  onUpdate(fn: UpdateFn, prio = 0): () => void {
    const entry = { fn, prio };
    this.updates.push(entry);
    this.updates.sort((a, b) => a.prio - b.prio);
    return () => {
      const i = this.updates.indexOf(entry);
      if (i >= 0) this.updates.splice(i, 1);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const raw = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.step(raw);
    };
    requestAnimationFrame(loop);
  }

  /** Advance one frame; exposed so automated tests can drive the loop. */
  step(raw: number): void {
    const dt = raw * this.timeScale;
    this.elapsed += dt;
    for (const u of this.updates) u.fn(dt, this.elapsed);
    this.composer.render(raw);
    this.fpsAcc += raw;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  }

  /** Run game logic without rendering (automated tests). */
  simulate(raw: number): void {
    const dt = raw * this.timeScale;
    this.elapsed += dt;
    this.scene.updateMatrixWorld();
    for (const u of this.updates) u.fn(dt, this.elapsed);
  }

  stop(): void {
    this.running = false;
  }
}
