import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Post processing: radial speed blur + chromatic aberration + vignette
// ---------------------------------------------------------------------------
const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
    aberration: { value: 0 },
    vignette: { value: 0.35 },
    center: { value: new THREE.Vector2(0.5, 0.5) },
    tint: { value: new THREE.Color(1, 1, 1) },
    tintAmt: { value: 0 },
    flash: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float strength; uniform float aberration; uniform float vignette;
    uniform vec2 center; uniform vec3 tint; uniform float tintAmt; uniform float flash;
    varying vec2 vUv;
    void main(){
      vec2 dir = vUv - center;
      float d = length(dir * vec2(1.6, 1.0));
      float amt = strength * smoothstep(0.12, 0.75, d);
      vec3 col = vec3(0.0);
      const int N = 12;
      for (int i = 0; i < N; i++) {
        float t = float(i) / float(N - 1);
        vec2 uv = vUv - dir * amt * t * 0.16;
        vec2 ca = dir * aberration * 0.012 * (0.3 + d);
        col.r += texture2D(tDiffuse, uv + ca).r;
        col.g += texture2D(tDiffuse, uv).g;
        col.b += texture2D(tDiffuse, uv - ca).b;
      }
      col /= float(N);
      col = mix(col, col * tint * 1.25, tintAmt * smoothstep(0.25, 0.9, d));
      col *= 1.0 - vignette * smoothstep(0.35, 1.05, d);
      col += flash;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  speed: ShaderPass;
  render: RenderPass;
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: new URLSearchParams(location.search).has('lowq') ? 0 : 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.speed = new ShaderPass(SpeedShader);
    this.composer.addPass(this.speed);
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number) { this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
}

// ---------------------------------------------------------------------------
// Speed streaks + ambient motes (world-space, wrap around the camera)
// ---------------------------------------------------------------------------
export class SpeedLines {
  group = new THREE.Group();
  private lines: THREE.InstancedMesh;
  private data: { x: number; y: number; z: number; len: number }[] = [];
  private mat: THREE.MeshBasicMaterial;
  private motes: THREE.Points;
  private moteMat: THREE.PointsMaterial;
  private dummy = new THREE.Object3D();
  private readonly N = 220;
  private readonly ZR = 70;

  constructor() {
    const geo = new THREE.BoxGeometry(0.025, 0.025, 1);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.lines = new THREE.InstancedMesh(geo, this.mat, this.N);
    this.lines.frustumCulled = false;
    for (let i = 0; i < this.N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.pow(Math.random(), 0.7) * 9;
      this.data.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.75, z: -Math.random() * this.ZR, len: 2 + Math.random() * 6 });
    }
    this.group.add(this.lines);
    const mg = new THREE.BufferGeometry();
    const pos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = (Math.random() - 0.5) * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 80; }
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.moteMat = new THREE.PointsMaterial({ size: 0.05, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true });
    this.motes = new THREE.Points(mg, this.moteMat);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
  }

  update(dt: number, cam: THREE.Vector3, speed: number, intensity: number, tint: THREE.Color) {
    this.group.position.copy(cam);
    const vis = THREE.MathUtils.clamp(intensity, 0, 1);
    this.mat.opacity = vis * 0.55;
    this.mat.color.copy(tint);
    this.lines.visible = vis > 0.01;
    for (let i = 0; i < this.N; i++) {
      const d = this.data[i];
      d.z += speed * dt * 1.6;
      if (d.z > 6) { d.z -= this.ZR; const a = Math.random() * Math.PI * 2; const r = 1.6 + Math.pow(Math.random(), 0.7) * 9; d.x = Math.cos(a) * r; d.y = Math.sin(a) * r * 0.75; }
      const len = d.len * (0.4 + vis * 1.8);
      this.dummy.position.set(d.x, d.y, d.z);
      this.dummy.scale.set(1, 1, len);
      this.dummy.updateMatrix();
      this.lines.setMatrixAt(i, this.dummy.matrix);
    }
    this.lines.instanceMatrix.needsUpdate = true;
    // motes are world-fixed: move them opposite to the camera motion and wrap
    if (this.hasLast) this.shiftMotes(cam.x - this.last.x, cam.y - this.last.y, cam.z - this.last.z);
    this.last.copy(cam); this.hasLast = true;
    this.moteMat.opacity = 0.25 + vis * 0.3;
  }
  /** called when the group moves: motes should stay world-fixed */
  private last = new THREE.Vector3();
  private hasLast = false;
  resetMotes() { this.hasLast = false; }
  shiftMotes(dx: number, dy: number, dz: number) {
    if (Math.abs(dz) > 50) return;
    const arr = (this.motes.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) { arr[i] -= dx; arr[i + 1] -= dy; arr[i + 2] -= dz; if (arr[i] > 30) arr[i] -= 60; if (arr[i] < -30) arr[i] += 60; if (arr[i + 1] > 15) arr[i + 1] -= 30; if (arr[i + 1] < -15) arr[i + 1] += 30; if (arr[i + 2] > 20) arr[i + 2] -= 80; if (arr[i + 2] < -60) arr[i + 2] += 80; }
    (this.motes.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Sky dome that cross-fades between two equirect panoramas
// ---------------------------------------------------------------------------
export class Sky {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        texA: { value: null }, texB: { value: null }, mixAB: { value: 0 },
        intA: { value: 1 }, intB: { value: 1 }, fogColor: { value: new THREE.Color() }, horizon: { value: 0.6 }, yaw: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D texA; uniform sampler2D texB; uniform float mixAB; uniform float intA; uniform float intB;
        uniform vec3 fogColor; uniform float horizon; uniform float yaw;
        varying vec3 vDir;
        vec2 eq(vec3 d){ float u = atan(d.z, d.x) / 6.2831853 + 0.5 + yaw; float v = asin(clamp(d.y,-1.0,1.0)) / 3.14159265 + 0.5; return vec2(u, v); }
        void main(){
          vec3 d = normalize(vDir);
          vec2 uv = eq(d);
          vec3 a = texture2D(texA, uv).rgb * intA;
          vec3 b = texture2D(texB, uv).rgb * intB;
          vec3 c = mix(a, b, mixAB);
          float h = smoothstep(-0.12, 0.28, d.y);
          c = mix(fogColor, c, mix(1.0, h, horizon));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
}
