import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { lerp } from '../core/util.js';

// 敵などのインスタンス描画用マテリアル。インスタンスごとの「白フラッシュ」を足す。
export function makeFlashMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlash;\nvarying float vFlash;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlash = aFlash;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.4), clamp(vFlash,0.0,1.0)) + vec3(0.6,0.2,1.0)*max(vFlash-1.0,0.0);');
  };
  return mat;
}

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.skyDay = new THREE.Color('#9fd3ff');
    this.skyNight = new THREE.Color('#141a38');
    this.scene.background = this.skyDay.clone();
    this.scene.fog = new THREE.Fog(this.skyDay.clone(), 38, 78);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    this.camOffset = new THREE.Vector3(0, 24, 15.5);
    this.zoom = 0.86;

    this.hemi = new THREE.HemisphereLight('#dff1ff', '#5b6b3a', 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff2d6', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);

    this.playerLight = new THREE.PointLight('#ffd9a0', 0, 14, 1.6);
    this.scene.add(this.playerLight);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 0.96);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.shake = 0;
    this.shakeT = 0;
    this.punch = 0;
    this.night = 0;
    this.setQuality(quality);
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  setQuality(q) {
    this.quality = q;
    const dpr = Math.min(devicePixelRatio || 1, q === 'high' ? 2 : q === 'mid' ? 1.25 : 0.85);
    this.renderer.setPixelRatio(dpr);
    this.useBloom = q !== 'low';
    this.sun.castShadow = q !== 'low';
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.setSize(w * 0.5, h * 0.5);
    this.camera.aspect = w / h;
    // 縦長画面では少し引いて見やすくする
    this.camera.fov = w < h ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }
  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }
  follow(x, z, vx, vz, dt, shakeEnabled = true) {
    const lead = 1.4;
    const tx = x + vx * 0.18 * lead, tz = z + vz * 0.18 * lead;
    if (!this._cx) { this._cx = tx; this._cz = tz; }
    this._cx = lerp(this._cx, tx, 1 - Math.exp(-6 * dt));
    this._cz = lerp(this._cz, tz, 1 - Math.exp(-6 * dt));
    this.punch = lerp(this.punch, 0, 1 - Math.exp(-5 * dt));
    const z0 = this.zoom * (1 - this.punch * 0.12);
    this.shakeT += dt * 60;
    const s = shakeEnabled ? this.shake * this.shake * 0.9 : 0;
    const sx = (Math.sin(this.shakeT * 1.7) + Math.sin(this.shakeT * 3.1)) * 0.5 * s;
    const sz = (Math.cos(this.shakeT * 2.3) + Math.sin(this.shakeT * 1.3)) * 0.5 * s;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.camera.position.set(this._cx + this.camOffset.x * z0 + sx, this.camOffset.y * z0, this._cz + this.camOffset.z * z0 + sz);
    this.camera.lookAt(this._cx + sx, 0, this._cz + sz);
    this.sun.position.set(x + 14, 30, z + 10);
    this.sun.target.position.set(x, 0, z);
    this.playerLight.position.set(x, 3, z);
  }
  setNight(n, tint) {
    this.night = n;
    const c = this.skyDay.clone().lerp(this.skyNight, n);
    if (tint) c.lerp(tint, 0.35);
    this.scene.background.copy(c);
    this.scene.fog.color.copy(c);
    this.hemi.intensity = lerp(1.35, 0.55, n);
    this.hemi.color.set('#dff1ff').lerp(new THREE.Color('#7f8cff'), n);
    this.sun.intensity = lerp(2.1, 0.35, n);
    this.sun.color.set('#fff2d6').lerp(new THREE.Color('#9fb0ff'), n);
    this.playerLight.intensity = n * 30;
    this.bloom.strength = lerp(0.5, 0.85, n);
  }
  render() {
    if (this.useBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
