import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { Weather } from '../data/types';
import { Rng } from '../sim/rng';

interface WeatherLook {
  cloud: number;
  turbidity: number;
  fog: number;
  sun: number;
  rain: number;
  wave: number;
  tint: THREE.Color;
}

const LOOKS: Record<Weather, WeatherLook> = {
  sunny: { cloud: 0.18, turbidity: 3, fog: 0.0016, sun: 1, rain: 0, wave: 0.15, tint: new THREE.Color(1, 1, 1) },
  cloudy: { cloud: 0.62, turbidity: 9, fog: 0.0028, sun: 0.4, rain: 0, wave: 0.3, tint: new THREE.Color(0.86, 0.9, 0.95) },
  rain: { cloud: 0.85, turbidity: 14, fog: 0.006, sun: 0.18, rain: 0.55, wave: 0.5, tint: new THREE.Color(0.7, 0.76, 0.82) },
  storm: { cloud: 0.97, turbidity: 18, fog: 0.008, sun: 0.07, rain: 1, wave: 1, tint: new THREE.Color(0.45, 0.5, 0.58) },
  fog: { cloud: 0.55, turbidity: 8, fog: 0.032, sun: 0.35, rain: 0, wave: 0.08, tint: new THREE.Color(0.85, 0.88, 0.9) },
};

const CLOUD_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;

const CLOUD_FRAG = `
uniform float uTime; uniform float uCover; uniform vec3 uLight; uniform vec3 uShadow; uniform float uAlpha;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.02; a*=0.5; } return s; }
void main() {
  if (vDir.y < 0.0) discard;
  vec2 uv = vDir.xz / (vDir.y + 0.12) * 1.6 + vec2(uTime * 0.01, uTime * 0.004);
  float d = fbm(uv);
  float c = smoothstep(1.0 - uCover - 0.05, 1.0 - uCover + 0.35, d);
  float shade = fbm(uv * 1.7 + 4.0);
  vec3 col = mix(uLight, uShadow, clamp(shade * 0.8 + c * 0.4, 0.0, 1.0));
  float horizon = smoothstep(0.0, 0.18, vDir.y);
  gl_FragColor = vec4(col, c * uAlpha * horizon);
}`;

/** 空・太陽/月・霧・雲・星・雨・雷 */
export class Atmosphere {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a4028, 1);
  readonly fog = new THREE.FogExp2(0xa8c4d8, 0.002);
  readonly sunDir = new THREE.Vector3();
  /** 夜の度合い 0..1 */
  night = 0;
  /** 波の強さ 0..1 */
  wave = 0.15;
  rainAmount = 0;

  private look: WeatherLook = { ...LOOKS.sunny, tint: LOOKS.sunny.tint.clone() };
  private target: Weather = 'sunny';
  private clouds: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  /** 夜や悪天候で空全体を霧の色に寄せるドーム */
  private overcast: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private stars: THREE.Points;
  private moon: THREE.Mesh;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private flash = 0;
  private nextFlash = 5;
  private rng = new Rng(42);
  private envScene = new THREE.Scene();
  private envSky = new Sky();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envTimer = 0;
  onThunder: ((delay: number, power: number) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
  ) {
    this.sky.scale.setScalar(4500);
    scene.add(this.sky);
    scene.fog = this.fog;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sc.near = 1;
    sc.far = 300;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target, this.hemi);

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uCover: { value: 0.2 },
          uLight: { value: new THREE.Color(1, 1, 1) },
          uShadow: { value: new THREE.Color(0.6, 0.65, 0.7) },
          uAlpha: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        fog: false,
      }),
    );
    this.clouds.renderOrder = -1;
    scene.add(this.clouds);

    this.overcast = new THREE.Mesh(
      new THREE.SphereGeometry(4200, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: CLOUD_VERT,
        fragmentShader: `
          uniform vec3 uTop; uniform vec3 uHorizon; uniform float uAlpha;
          varying vec3 vDir;
          void main() {
            float k = smoothstep(-0.05, 0.5, vDir.y);
            gl_FragColor = vec4(mix(uHorizon, uTop, k), uAlpha);
          }`,
        uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uAlpha: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        fog: false,
      }),
    );
    this.overcast.renderOrder = -4;
    scene.add(this.overcast);

    // 星
    const starGeo = new THREE.BufferGeometry();
    const sp: number[] = [];
    for (let i = 0; i < 2500; i++) {
      const u = this.rng.next() * 2 - 1;
      const t = this.rng.next() * Math.PI * 2;
      const y = Math.abs(u);
      const r = Math.sqrt(1 - y * y);
      sp.push(Math.cos(t) * r * 3800, y * 3800, Math.sin(t) * r * 3800);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -3;
    scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf2f0e0, fog: false, transparent: true }));
    this.moon.renderOrder = -2;
    scene.add(this.moon);

    // 雨
    const N = 5000;
    this.rainPos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) this.respawnDrop(i, new THREE.Vector3(), true);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45, fog: true }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
  }

  setWeather(w: Weather, instant = false): void {
    this.target = w;
    if (instant) {
      const t = LOOKS[w];
      this.look = { ...t, tint: t.tint.clone() };
    }
  }

  private respawnDrop(i: number, center: THREE.Vector3, randomY: boolean): void {
    const x = center.x + (this.rng.next() - 0.5) * 70;
    const z = center.z + (this.rng.next() - 0.5) * 70;
    const y = center.y + (randomY ? this.rng.next() * 30 - 5 : 25);
    const p = this.rainPos;
    p.set([x, y, z, x + 0.03, y - 0.38, z], i * 6);
  }

  /** hour: 0..24 */
  update(dt: number, hour: number, camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    // 天候の見た目をなめらかに遷移
    const t = LOOKS[this.target];
    const k = 1 - Math.exp(-dt * 0.25);
    const L = this.look;
    L.cloud += (t.cloud - L.cloud) * k;
    L.turbidity += (t.turbidity - L.turbidity) * k;
    L.fog += (t.fog - L.fog) * k;
    L.sun += (t.sun - L.sun) * k;
    L.rain += (t.rain - L.rain) * k;
    L.wave += (t.wave - L.wave) * k;
    L.tint.lerp(t.tint, k);
    this.wave = L.wave;
    this.rainAmount = L.rain;

    // 太陽の位置：6時に東から昇り18時に西に沈む
    const dayAngle = ((hour - 6) / 24) * Math.PI * 2;
    const elev = Math.sin(dayAngle);
    this.sunDir.set(Math.cos(dayAngle) * 0.9, elev, 0.35).normalize();
    const dayK = THREE.MathUtils.smoothstep(elev, -0.12, 0.18);
    this.night = 1 - dayK;
    const golden = Math.max(0, 1 - Math.abs(elev) * 4) * dayK;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.turbidity.value = L.turbidity;
    u.rayleigh.value = 1.2 + golden * 1.5 - L.cloud * 0.8;
    u.mieCoefficient.value = 0.005 + L.cloud * 0.01;
    u.mieDirectionalG.value = 0.8;

    // ライティング
    const cam = camera.position;
    const lightDir = elev > -0.05 ? this.sunDir : this.sunDir.clone().negate();
    this.sun.position.copy(cam).addScaledVector(lightDir, 120);
    this.sun.target.position.copy(cam);
    const sunColor = new THREE.Color().setHSL(0.09 + dayK * 0.04, 0.6 * golden + 0.1, 0.5 + 0.45 * (1 - golden));
    if (this.night > 0.5) sunColor.setRGB(0.55, 0.65, 0.9);
    this.sun.color.copy(sunColor);
    this.sun.intensity = (dayK * 3.2 * L.sun + this.night * 0.25 * (1 - L.cloud * 0.7)) * (0.4 + 0.6 * dayK + 0.6 * this.night);
    this.hemi.intensity = (0.4 + dayK * 0.95) * (0.85 + L.cloud * 0.3) + this.flash * 4;
    this.hemi.color.setRGB(0.75, 0.85, 1).multiply(L.tint);
    if (this.night > 0.5) this.hemi.color.setRGB(0.32, 0.38, 0.55);
    renderer.toneMappingExposure = 0.55 + dayK * 0.25 + this.night * 0.25;

    // 霧の色は空の地平線付近の色に合わせる
    const day = new THREE.Color(0.66, 0.77, 0.86).multiply(L.tint);
    const dusk = new THREE.Color(0.85, 0.6, 0.45).lerp(day, 1 - golden);
    const nightC = new THREE.Color(0.03, 0.045, 0.07);
    this.fog.color.copy(dusk).lerp(nightC, this.night);
    if (this.target === 'fog') this.fog.color.lerp(new THREE.Color(0.75, 0.78, 0.8).multiplyScalar(0.25 + 0.75 * dayK), 0.6);
    this.fog.density = L.fog;

    // 夜・悪天候の空
    const ou = this.overcast.material.uniforms;
    ou.uHorizon.value.copy(this.fog.color);
    ou.uTop.value.copy(this.fog.color).multiplyScalar(0.55 + 0.25 * dayK);
    if (this.night > 0.5) ou.uTop.value.setRGB(0.01, 0.015, 0.035);
    ou.uAlpha.value = Math.min(0.97, Math.max(this.night * 0.95, (L.cloud - 0.5) * 1.6, L.fog * 25));
    this.overcast.position.copy(cam);

    // 雲
    const cu = this.clouds.material.uniforms;
    cu.uTime.value += dt;
    cu.uCover.value = L.cloud;
    const lit = new THREE.Color(1, 0.98, 0.95).lerp(new THREE.Color(1, 0.7, 0.5), golden).multiplyScalar(0.25 + 0.75 * dayK).multiply(L.tint);
    cu.uLight.value.copy(lit).lerp(new THREE.Color(0.08, 0.1, 0.14), this.night);
    cu.uShadow.value.copy(lit).multiplyScalar(0.55 - L.cloud * 0.2);
    cu.uAlpha.value = 0.95;
    this.clouds.position.copy(cam);
    this.sky.position.copy(cam);

    // 星と月
    const starMat = this.stars.material as THREE.PointsMaterial;
    starMat.opacity = this.night * (1 - L.cloud) * (1 - L.fog * 20);
    this.stars.position.copy(cam);
    this.moon.position.copy(cam).addScaledVector(this.sunDir.clone().negate().setZ(-0.3).normalize(), 3600);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = this.night * (1 - L.cloud * 0.9);

    // 雨
    this.rain.visible = L.rain > 0.02;
    if (this.rain.visible) {
      const p = this.rainPos;
      const n = Math.floor((p.length / 6) * L.rain);
      for (let i = 0; i < p.length / 6; i++) {
        if (i >= n) {
          p[i * 6 + 1] = p[i * 6 + 4] = -999;
          continue;
        }
        const fall = 22 * dt;
        p[i * 6 + 1] -= fall;
        p[i * 6 + 4] -= fall;
        p[i * 6] += 2 * dt * L.wave;
        p[i * 6 + 3] += 2 * dt * L.wave;
        if (p[i * 6 + 1] < Math.max(0, cam.y - 8) || Math.abs(p[i * 6] - cam.x) > 40 || Math.abs(p[i * 6 + 2] - cam.z) > 40) this.respawnDrop(i, cam, p[i * 6 + 1] < -900);
      }
      this.rain.geometry.getAttribute('position').needsUpdate = true;
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.18 + 0.22 * L.rain;
    }

    // 雷
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.target === 'storm') {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.nextFlash = this.rng.range(6, 18);
        this.flash = 1;
        const power = this.rng.range(0.5, 1);
        this.onThunder?.(this.rng.range(0.4, 2.5), power);
      }
    }

    // 環境マップ（反射用）を時々更新
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 4;
      const eu = this.envSky.material.uniforms;
      for (const key of ['sunPosition', 'turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) {
        const v = u[key].value;
        if (v instanceof THREE.Vector3) eu[key].value.copy(v);
        else eu[key].value = v;
      }
      this.envRT?.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.15 + dayK * 0.55;
    }
  }

  get flashLevel(): number {
    return this.flash;
  }
}
