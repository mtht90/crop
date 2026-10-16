import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { analyzeHDR } from './assets.js';

export const QUALITY = {
  low: { pr: 0.85, shadow: 1024, bloom: false, aa: false, water: 'simple', clouds: 70 },
  medium: { pr: 1.25, shadow: 2048, bloom: true, aa: true, water: 'reflect', clouds: 120 },
  high: { pr: 2, shadow: 2048, bloom: true, aa: true, water: 'reflect', clouds: 170 },
};

// 速度ブラー＋色収差＋カラーグレーディング＋ビネット（自作ポストエフェクト）
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uSpeed: { value: 0 }, uVignette: { value: 0.9 },
    uSat: { value: 1.08 }, uContrast: { value: 1.04 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: 0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSpeed, uVignette, uSat, uContrast, uFlash; uniform vec3 uTint;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      vec3 col = vec3(0.0);
      float s = uSpeed * 0.045;
      for (int i = 0; i < 8; i++) {
        float k = 1.0 - s * float(i) / 7.0;
        col += texture2D(tDiffuse, 0.5 + c * k).rgb;
      }
      col /= 8.0;
      float ca = 0.0015 + uSpeed * 0.004;
      col.r = mix(col.r, texture2D(tDiffuse, 0.5 + c * (1.0 + ca)).r, 0.5);
      col.b = mix(col.b, texture2D(tDiffuse, 0.5 + c * (1.0 - ca)).b, 0.5);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col *= uTint;
      float v = smoothstep(0.85, 0.2, length(c) * (1.0 + uSpeed * 0.6));
      col *= mix(1.0, v, uVignette * 0.55 + uSpeed * 0.35);
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class FX {
  constructor(renderer, scene, camera, assets, quality) {
    Object.assign(this, { renderer, scene, camera, assets });
    this.q = QUALITY[quality] || QUALITY.medium;
    this.qualityName = quality;
    this.time = 0;
    this.dynamicRes = true;
    this.resScale = 1;
    this.frameTimes = [];

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupSky();
    this.setupSun();
    this.setupWater();
    this.setupClouds();
    this.setupDust();
    this.setupComposer();
  }

  setupSky() {
    const hdr = this.assets.hdr;
    const { sunDir, horizon } = analyzeHDR(hdr);
    this.sunDir = sunDir;
    // Float32 の線形補間はモバイルGPUで未対応なことが多いので HalfFloat に変換
    const { data, width, height } = hdr.image;
    const half = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(Math.min(data[i], 65000));
    const tex = new THREE.DataTexture(half, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.flipY = hdr.flipY;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    hdr.dispose();

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.85;
    this.scene.background = tex;
    this.scene.backgroundIntensity = 0.95;

    const fogCol = horizon.clone();
    const m = Math.max(fogCol.r, fogCol.g, fogCol.b) || 1;
    fogCol.multiplyScalar(0.82 / m);
    this.fogColor = fogCol;
    this.scene.fog = new THREE.FogExp2(fogCol, 0.0018);
  }

  setupSun() {
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.8);
    sun.castShadow = true;
    const s = sun.shadow;
    s.mapSize.set(this.q.shadow, this.q.shadow);
    s.camera.left = -24; s.camera.right = 24; s.camera.top = 24; s.camera.bottom = -24;
    s.camera.near = 1; s.camera.far = 220;
    s.bias = -0.0004; s.normalBias = 0.035;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    // レンズフレア（太陽方向へ）
    const lf = new Lensflare();
    lf.addElement(new LensflareElement(this.assets.misc.flare0, 520, 0, new THREE.Color(1, 0.95, 0.85)));
    lf.addElement(new LensflareElement(this.assets.misc.flare3, 60, 0.6));
    lf.addElement(new LensflareElement(this.assets.misc.flare3, 80, 0.75));
    lf.addElement(new LensflareElement(this.assets.misc.flare3, 120, 0.9));
    lf.addElement(new LensflareElement(this.assets.misc.flare3, 70, 1.0));
    lf.layers.set(1); // 水面の反射カメラ(layer0のみ)には映さない
    this.camera.layers.enable(1);
    this.flareHolder = new THREE.Object3D();
    this.flareHolder.add(lf);
    this.scene.add(this.flareHolder);
  }

  setupWater() {
    const geo = new THREE.PlaneGeometry(6000, 6000);
    if (this.water) { this.scene.remove(this.water); this.water.material.dispose(); }
    const normals = this.assets.misc.waterNormals;
    if (this.q.water === 'reflect') {
      const w = new Water(geo, {
        textureWidth: 512, textureHeight: 512, waterNormals: normals,
        sunDirection: this.sunDir.clone(), sunColor: 0xfff3dd, waterColor: 0x0b3a4f,
        distortionScale: 3.4, fog: true, alpha: 1,
      });
      w.material.uniforms.size.value = 2.2;
      this.water = w;
    } else {
      const n = normals.clone();
      n.repeat.set(220, 220); n.needsUpdate = true;
      this.water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x0d4258, roughness: 0.08, metalness: 0.4, normalMap: n, normalScale: new THREE.Vector2(0.6, 0.6),
      }));
      this.simpleWaterNormal = n;
    }
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0;
    this.scene.add(this.water);
  }

  setupClouds() {
    if (this.clouds) this.scene.remove(this.clouds);
    const g = new THREE.Group();
    const smoke = this.assets.misc.smoke;
    const bands = [[55, 85], [135, 160], [215, 250]];
    const n = this.q.clouds;
    for (let i = 0; i < n; i++) {
      const band = bands[i % bands.length];
      const mat = new THREE.SpriteMaterial({ map: smoke, color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, rotation: Math.random() * 6.28, fog: true });
      const sp = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2;
      const d = 45 + Math.random() * 190;
      sp.position.set(Math.cos(a) * d, band[0] + Math.random() * (band[1] - band[0]), Math.sin(a) * d);
      const s = 30 + Math.random() * 60;
      sp.scale.set(s, s * 0.6, 1);
      sp.userData.baseOpacity = 0.25 + Math.random() * 0.3;
      g.add(sp);
    }
    this.clouds = g;
    this.scene.add(g);
  }

  setupDust() {
    this.dust = [];
    const tex = this.assets.misc.smoke;
    for (let i = 0; i < 28; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xd8c8b0, transparent: true, opacity: 0, depthWrite: false }));
      sp.visible = false;
      this.scene.add(sp);
      this.dust.push({ sp, life: 0, max: 1, vel: new THREE.Vector3() });
    }
    this.sparks = [];
    const spark = this.assets.misc.spark;
    for (let i = 0; i < 60; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: spark, color: 0xffd27d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.visible = false;
      this.scene.add(sp);
      this.sparks.push({ sp, life: 0, max: 1, vel: new THREE.Vector3() });
    }
  }

  puff(pos, count = 8, power = 1, color = 0xd8c8b0) {
    let n = 0;
    for (const d of this.dust) {
      if (d.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      d.sp.position.set(pos.x + Math.cos(a) * 0.3, pos.y + 0.1, pos.z + Math.sin(a) * 0.3);
      d.vel.set(Math.cos(a) * (1.5 + Math.random() * 2) * power, 0.4 + Math.random() * 0.8, Math.sin(a) * (1.5 + Math.random() * 2) * power);
      d.life = d.max = 0.6 + Math.random() * 0.5;
      d.sp.material.color.set(color);
      d.sp.visible = true;
      if (++n >= count) break;
    }
  }

  burst(pos, count = 40, color = 0xffd27d, speed = 8) {
    let n = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.sp.position.copy(pos);
      s.vel.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      s.life = s.max = 0.8 + Math.random() * 0.8;
      s.sp.material.color.set(color);
      s.sp.visible = true;
      if (++n >= count) break;
    }
  }

  setupComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.composer?.dispose();
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 1.1);
    this.bloom.enabled = this.q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass(size.x, size.y);
    this.smaa.enabled = this.q.aa;
    this.composer.addPass(this.smaa);
    this.resize();
  }

  setQuality(name) {
    const prevWater = this.q.water, prevClouds = this.q.clouds;
    this.q = QUALITY[name] || QUALITY.medium;
    this.qualityName = name;
    this.resScale = 1;
    const s = this.sun.shadow;
    if (s.mapSize.x !== this.q.shadow) { s.mapSize.set(this.q.shadow, this.q.shadow); s.map?.dispose(); s.map = null; }
    if (prevWater !== this.q.water) this.setupWater();
    if (prevClouds !== this.q.clouds) this.setupClouds();
    this.smaa.enabled = this.q.aa;
    this.bloom.enabled = this.q.bloom && this.bloomOn !== false;
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, this.q.pr) * this.resScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** フレーム時間を見て解像度を自動調整 */
  adaptResolution(dt) {
    if (!this.dynamicRes) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    let next = this.resScale;
    if (avg > 1 / 45) next = Math.max(0.55, this.resScale - 0.12);
    else if (avg < 1 / 58 && this.resScale < 1) next = Math.min(1, this.resScale + 0.06);
    if (next !== this.resScale) { this.resScale = next; this.resize(); }
  }

  update(dt, focus, { speed = 0, flash = 0, tint } = {}) {
    this.time += dt;
    // 影カメラをプレイヤーに追従
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 90);
    this.sun.target.position.copy(focus);
    this.flareHolder.position.copy(this.camera.position).addScaledVector(this.sunDir, 1500);

    if (this.water.material.uniforms?.time) {
      this.water.material.uniforms.time.value += dt * 0.6;
      this.water.material.uniforms.sunDirection.value.copy(this.sunDir);
    }
    if (this.simpleWaterNormal) this.simpleWaterNormal.offset.set(this.time * 0.004, this.time * 0.006);

    // 雲：ゆっくり回転し、カメラの近くでは薄く
    this.clouds.rotation.y += dt * 0.004;
    for (const sp of this.clouds.children) {
      const d = sp.getWorldPosition(_v).distanceTo(this.camera.position);
      sp.material.opacity = sp.userData.baseOpacity * THREE.MathUtils.smoothstep(d, 12, 45);
    }

    for (const d of this.dust) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.sp.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(1 - dt * 3);
      const k = 1 - d.life / d.max;
      d.sp.scale.setScalar(0.4 + k * 1.6);
      d.sp.material.opacity = 0.55 * (1 - k);
      if (d.life <= 0) d.sp.visible = false;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 9 * dt;
      s.sp.position.addScaledVector(s.vel, dt);
      const k = s.life / s.max;
      s.sp.scale.setScalar(0.5 * k + 0.1);
      s.sp.material.opacity = k;
      if (s.life <= 0) s.sp.visible = false;
    }

    const u = this.grade.uniforms;
    u.uSpeed.value += (speed - u.uSpeed.value) * Math.min(1, dt * 6);
    u.uFlash.value = flash;
    if (tint) u.uTint.value.lerp(tint, Math.min(1, dt * 1.5));
  }

  render() { this.composer.render(); }
}
const _v = new THREE.Vector3();
