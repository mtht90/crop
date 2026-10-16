import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { analyzeHDR } from './assets.js';

export const QUALITY = {
  low: { pr: 0.85, shadow: 1024, bloom: false, aa: false, ao: false, water: 'simple', clouds: 70 },
  medium: { pr: 1.25, shadow: 2048, bloom: true, aa: true, ao: false, water: 'reflect', clouds: 120 },
  high: { pr: 2, shadow: 2048, bloom: true, aa: true, ao: true, water: 'reflect', clouds: 170 },
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
    s.camera.layers.enable(1); // ガラクタ(layer1)も影を落とす
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
    const bands = [[55, 85], [170, 210], [360, 400], [520, 560]];
    const n = this.q.clouds;
    for (let i = 0; i < n; i++) {
      const band = bands[i % bands.length];
      const mat = new THREE.SpriteMaterial({ map: smoke, color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, rotation: Math.random() * 6.28, fog: true });
      const sp = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2;
      const d = 75 + Math.random() * 200;
      sp.position.set(Math.cos(a) * d, band[0] + Math.random() * (band[1] - band[0]), Math.sin(a) * d);
      const s = 30 + Math.random() * 60;
      sp.scale.set(s, s * 0.6, 1);
      sp.userData.baseOpacity = 0.16 + Math.random() * 0.24;
      g.add(sp);
    }
    this.clouds = g;
    this.scene.add(g);
  }

  /** 雲海（下界を隠す巨大な雲の層） */
  setupCloudSea(y) {
    const tex = this.assets.misc.noise;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSun: { value: new THREE.Color(1, 0.97, 0.92) } },
      vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform float uTime; uniform vec3 uCam; uniform vec3 uSun; varying vec3 vW;
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * texture2D(uMap, p).r; p = p * 2.03 + 0.17; a *= 0.5; } return v; }
        void main(){
          vec2 p = vW.xz * 0.0016 + vec2(uTime * 0.0015, uTime * 0.0009);
          float n = fbm(p);
          float cover = smoothstep(0.42, 0.72, n);
          float dy = abs(uCam.y - vW.y);
          float near = smoothstep(4.0, 40.0, dy + length(uCam.xz - vW.xz) * 0.15);
          float far = uCam.y < vW.y ? 1.0 - smoothstep(120.0, 420.0, dy) : 1.0 - 0.85 * smoothstep(90.0, 260.0, dy);  // 遠くから見ると薄い
          float edge = 1.0 - smoothstep(1400.0, 2000.0, length(vW.xz));
          float alpha = cover * 0.95 * near * far * edge;
          vec3 col = mix(vec3(0.72, 0.78, 0.86), uSun * 1.05, smoothstep(0.5, 0.9, n));
          gl_FragColor = vec4(col, alpha);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200).rotateX(-Math.PI / 2), mat);
    plane.position.y = y;
    plane.renderOrder = 2;
    this.scene.add(plane);
    this.cloudSea = plane;
  }

  /** 宇宙：星空（キューブマップ）と地球 */
  setupSpace(stars, earthMap, earthClouds) {
    const starMat = new THREE.ShaderMaterial({
      uniforms: { uCube: { value: stars }, uOpacity: { value: 0 } },
      vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`uniform samplerCube uCube; uniform float uOpacity; varying vec3 vDir;
        void main(){ vec3 c = textureCube(uCube, vDir).rgb; gl_FragColor = vec4(pow(c, vec3(2.2)) * 2.2, uOpacity); }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    });
    this.stars = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), starMat);
    this.stars.renderOrder = -1;
    this.stars.visible = false;
    this.scene.add(this.stars);

    const earth = new THREE.Group();
    const R = 1500;
    earthMap.colorSpace = THREE.SRGBColorSpace;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({ map: earthMap, roughness: 0.8, metalness: 0, envMapIntensity: 0.3 }));
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.008, 96, 64), new THREE.MeshStandardMaterial({ map: earthClouds, transparent: true, depthWrite: false, opacity: 0.9, envMapIntensity: 0.3 }));
    // 大気のリム発光（フレネル）
    const atm = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 64, 48), new THREE.ShaderMaterial({
      vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(vec3(0.35, 0.65, 1.0) * f * 2.0, f); }`,
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, fog: false,
    }));
    earth.add(globe, clouds, atm);
    earth.position.set(0, -R - 260, 0);
    earth.rotation.z = 0.4;
    earth.visible = false;
    globe.material.fog = false; clouds.material.fog = false;
    this.earth = earth; this.earthClouds = clouds;
    this.scene.add(earth);
  }

  /** 宇宙の彼方のブラックホール（降着円盤＋重力レンズ風のリング、ビルボード） */
  setupBlackHole(pos, size = 900) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform float uTime, uOpacity; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        vec3 disk(vec2 q){
          float r = length(q); if (r < 0.26 || r > 1.0) return vec3(0.0);
          float a = atan(q.y, q.x);
          float swirl = a + uTime * 0.25 / (r * r) + r * 6.0;
          float n = noise(vec2(swirl * 3.0, r * 14.0)) * 0.6 + noise(vec2(swirl * 9.0, r * 40.0)) * 0.4;
          float fall = smoothstep(0.26, 0.32, r) * smoothstep(1.0, 0.45, r);
          float dop = 1.0 + 0.6 * cos(a);                    // 片側が明るい（ドップラー）
          vec3 hot = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.92, 0.75), smoothstep(0.6, 0.3, r));
          return hot * n * fall * dop * 2.2;
        }
        void main(){
          vec2 p = vUv; float r = length(p);
          // 傾いた降着円盤（手前側）
          vec2 q = vec2(p.x, p.y / 0.22);
          vec3 col = disk(q) * step(0.0, -p.y + 0.0) ;
          // 重力レンズで上下に回り込んだ円盤の裏側
          float ring = smoothstep(0.03, 0.0, abs(r - 0.3)) * 1.5 + smoothstep(0.12, 0.0, abs(r - 0.33)) * 0.6;
          vec2 lq = vec2(p.x, (r - 0.28) * 3.0 * sign(p.y + 0.0001));
          vec3 lens = disk(normalize(p) * (0.3 + abs(r - 0.28) * 2.2)) * smoothstep(0.62, 0.3, r) * 0.8;
          col += lens + vec3(1.0, 0.8, 0.55) * ring;
          col += disk(q) * step(0.0, p.y) * smoothstep(0.24, 0.3, r) ;
          // 事象の地平面
          float hole = smoothstep(0.255, 0.24, r);
          col *= 1.0 - hole;
          float a = max(max(col.r, col.g), col.b);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uOpacity + hole * uOpacity);
        }`,
      transparent: true, depthWrite: false, fog: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    m.scale.setScalar(size);
    m.position.copy(pos);
    m.frustumCulled = false;
    m.renderOrder = -0.5;
    m.visible = false;
    this.scene.add(m);
    this.blackHole = m;
  }

  /** 高度で 空→雲海→宇宙 を切り替える */
  updateAltitude(h, spaceStart) {
    if (this.lastAlt !== undefined && Math.abs(this.lastAlt - h) < 0.2) return;
    this.lastAlt = h;
    const above = this.cloudSea && this.cameraY > this.cloudSea.position.y + 5;
    this.water.visible = !above;
    if (this.earth) this.earth.visible = above;
    const k = spaceStart ? THREE.MathUtils.smoothstep(h, spaceStart - 140, spaceStart + 20) : 0;
    if (this.stars) { this.stars.visible = k > 0.01; this.stars.material.uniforms.uOpacity.value = k; }
    if (this.blackHole) { this.blackHole.visible = k > 0.01; this.blackHole.material.uniforms.uOpacity.value = k; }
    this.scene.backgroundIntensity = 0.95 * (1 - k * 0.85);
    this.scene.fog.density = 0.0018 * (1 - k) * (above ? 0.6 : 1);
    this.sun.intensity = 2.8 + k * 0.8;
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
    // 接地感・奥行きのためのスクリーンスペースAO（高画質のみ）
    this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.ao.output = GTAOPass.OUTPUT.Default;
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.4, thickness: 2.5, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.ao.enabled = this.q.ao;
    this.composer.addPass(this.ao);
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
    if (this.ao) this.ao.enabled = this.q.ao && !this.aoSuspended;
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
    if (avg > 1 / 45 && this.ao?.enabled) { this.ao.enabled = false; this.aoSuspended = true; return; }
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
    this.cameraY = this.camera.position.y;
    if (this.cloudSea) { this.cloudSea.material.uniforms.uTime.value = this.time; this.cloudSea.material.uniforms.uCam.value.copy(this.camera.position); }
    if (this.stars?.visible) this.stars.position.copy(this.camera.position);
    if (this.blackHole?.visible) this.blackHole.material.uniforms.uTime.value = this.time;
    if (this.earthClouds && this.earth.visible) this.earthClouds.rotation.y += dt * 0.004;

    if (this.water.material.uniforms?.time) {
      this.water.material.uniforms.time.value += dt * 0.6;
      this.water.material.uniforms.sunDirection.value.copy(this.sunDir);
    }
    if (this.simpleWaterNormal) this.simpleWaterNormal.offset.set(this.time * 0.004, this.time * 0.006);

    // 雲：ゆっくり回転し、カメラの近くでは薄く
    this.clouds.rotation.y += dt * 0.004;
    for (const sp of this.clouds.children) {
      const d = sp.getWorldPosition(_v).distanceTo(this.camera.position);
      sp.material.opacity = sp.userData.baseOpacity * THREE.MathUtils.smoothstep(d, 30, 90);
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
