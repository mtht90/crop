// ============================================================================
// 流星降臨 — the pack-opening cinematic, rendered live with three.js.
//
//   0.0s  night sky over a mountain lake; the camera slowly tilts up
//   1.0s  a meteor shower: one meteor per card    ← omen: each meteor's colour
//   1.95s the main meteor turns and dives toward the viewer
//   2.55s impact on the lake: flash, shock ring, sparks, camera shake
//   2.65s a ball of light rises and hovers where the pack will be
//   3.55s the light stretches into the silhouette of a booster pack
//   4.45s done → the real (DOM) pack materialises in the same place
//
// Afterwards the scene keeps running quietly behind the pack and draws the
// pack's aura (the omen colour, which can climb — 昇格 — before opening).
//
// Everything is a pure function of the timeline clock, so the sequence plays
// the same everywhere and can be skipped to any point.
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** 0 = nothing special, 1 = ◇◇◇◇, 2 = ☆, 3 = ♛ */
export type OmenTier = 0 | 1 | 2 | 3;

export const OMEN_COLORS: Record<OmenTier, string> = { 0: '#cfe0ff', 1: '#4fa8ff', 2: '#ffc245', 3: '#ff79d6' };

export const T_IMPACT = 2.55;
export const T_DONE = 4.45;

type Beat = 'enter' | 'dive' | 'impact' | 'orb' | 'morph';

export interface CinemaOptions {
  tier: OmenTier;
  /** one entry per card: the colour (omen tier) its meteor shows; the first one is the main meteor */
  meteors: OmenTier[];
  /** element whose rect the light should settle on (the pack) */
  target: () => DOMRect | null;
  onBeat?: (beat: Beat) => void;
  onDone: () => void;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeInCubic = (x: number) => x * x * x;
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const NOISE = /* glsl */ `
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;

const PASS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SKY_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uTint; uniform float uTintAmt; uniform float uGlowAmt; uniform vec3 uGlowDir; uniform vec3 uMoonDir;
varying vec3 vDir;
${NOISE}
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 zenith = vec3(0.004, 0.007, 0.028);
  vec3 mid = vec3(0.016, 0.026, 0.08);
  vec3 horizon = vec3(0.07, 0.06, 0.12);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.2, h));
  col = mix(col, zenith, smoothstep(0.2, 0.85, h));
  // milky way: a soft band along a tilted great circle
  vec3 bandN = normalize(vec3(0.42, 0.18, 1.0));
  float band = exp(-pow(dot(d, bandN) * 4.2, 2.0));
  float n = fbm(d * 3.2 + vec3(0.0, uTime * 0.004, 0.0));
  float n2 = fbm(d * 11.0);
  col += band * (vec3(0.12, 0.09, 0.2) * n + vec3(0.05, 0.1, 0.15) * n2 * 0.7) * smoothstep(0.0, 0.35, h);
  col += band * vec3(0.015, 0.015, 0.025) * smoothstep(0.55, 0.8, n2) * 4.0;
  // drifting nebulae
  col += vec3(0.07, 0.03, 0.12) * smoothstep(0.52, 0.86, fbm(d * 2.1 + vec3(3.1, 0.0, 1.7))) * 0.8;
  col += vec3(0.015, 0.045, 0.07) * smoothstep(0.55, 0.9, fbm(d * 2.7 + 7.0)) * 0.7;
  // cold glow above the ridges
  col += vec3(0.10, 0.10, 0.18) * exp(-max(h, 0.0) * 14.0) * 0.35;
  // the omen colour washes over the sky while the meteors are out
  col += uTint * uTintAmt * (0.3 + 0.7 * smoothstep(0.0, 0.5, h)) * 0.12;
  // light of the falling star / the orb near the horizon
  col += uTint * uGlowAmt * pow(max(dot(d, uGlowDir), 0.0), 18.0) * 0.6;
  // moonlight halo
  float mdot = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.55, 0.62, 0.85) * (pow(mdot, 60.0) * 0.35 + pow(mdot, 8.0) * 0.05);
  return col;
}
void main(){
  vec3 d = normalize(vDir);
  if (d.y >= 0.0) { gl_FragColor = vec4(skyCol(d), 1.0); return; }
  // still lake: the sky mirrored and broken up by slow ripples, darker toward the viewer
  float depth = -d.y;
  float k = 1.0 / max(depth, 0.015);
  float rip = noise(vec3(d.x * k * 0.9, d.z * k * 0.12, uTime * 0.45)) - 0.5;
  vec3 r = normalize(vec3(d.x + rip * 0.035, max(0.0, depth + rip * 0.01), d.z));
  vec3 col = skyCol(r) * 0.55;
  col = mix(col, vec3(0.003, 0.005, 0.013), smoothstep(0.03, 0.4, depth));
  // moon path on the water
  float az = d.x / -d.z - uMoonDir.x / -uMoonDir.z;
  float moonPath = exp(-abs(az + rip * 0.08) * 28.0) * smoothstep(0.45, 0.0, depth) * (0.45 + 0.9 * max(rip, 0.0));
  col += vec3(0.5, 0.58, 0.8) * moonPath * 0.35;
  // shimmering reflection of the glow on the water
  float streak = exp(-abs(d.x - uGlowDir.x * 0.9) * 22.0) * smoothstep(0.35, 0.0, depth) * (0.6 + 0.4 * rip);
  col += uTint * uGlowAmt * streak * 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize; attribute float aPhase; attribute vec3 aColor;
uniform float uTime; uniform float uPx; uniform float uDim;
varying float vAlpha; varying vec3 vColor;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.65 + 0.35 * sin(uTime * (1.2 + aPhase * 2.3) + aPhase * 40.0);
  vAlpha = tw * uDim; vColor = aColor;
  gl_PointSize = aSize * uPx * (0.85 + 0.3 * tw);
  gl_Position = projectionMatrix * mv;
}
`;
const STAR_FRAG = /* glsl */ `
varying float vAlpha; varying vec3 vColor;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c);
  float core = exp(-r * r * 70.0); float halo = exp(-r * r * 12.0) * 0.25;
  float cross = (exp(-abs(c.x) * 70.0) * exp(-abs(c.y) * 8.0) + exp(-abs(c.y) * 70.0) * exp(-abs(c.x) * 8.0)) * 0.25;
  float a = (core + halo + cross) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`;

const RIDGE_FRAG = /* glsl */ `
uniform float uSeed; uniform vec3 uColor; uniform float uHeight; uniform float uHaze;
varying vec2 vUv;
${NOISE}
void main(){
  float x = vUv.x * 18.0;
  float ridge = uHeight * (0.3 + 0.7 * fbm(vec3(x, uSeed, 0.0))) + 0.035 * noise(vec3(x * 9.0, uSeed, 1.0));
  float y = vUv.y;
  if (y > ridge) discard;
  // faint moonlit edge, and haze that lifts toward the base
  float edge = smoothstep(ridge - 0.02, ridge, y) * 0.06;
  vec3 col = uColor + vec3(0.2, 0.22, 0.34) * edge + vec3(0.04, 0.045, 0.08) * uHaze * smoothstep(0.35, 0.0, y);
  gl_FragColor = vec4(col, 1.0);
}
`;

const TRAIL_VERT = /* glsl */ `
attribute float aAlpha; attribute float aHue; attribute float aSide;
varying float vAlpha; varying float vHue; varying float vSide;
void main(){ vAlpha = aAlpha; vHue = aHue; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const TRAIL_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uRainbow; uniform float uTime; uniform float uFade;
varying float vAlpha; varying float vHue; varying float vSide;
${NOISE}
void main(){
  float across = 1.0 - pow(abs(vSide), 1.4);
  vec3 col = mix(uColor, hsv2rgb(vec3(fract(vHue * 1.5 - uTime * 0.4), 0.7, 1.0)), uRainbow);
  // hot white core near the head
  col = mix(col, vec3(1.0), pow(across, 5.0) * smoothstep(0.35, 1.0, vAlpha) * 0.85);
  float a = vAlpha * across * uFade;
  gl_FragColor = vec4(col * a, a);
}
`;

const MORPH_FRAG = /* glsl */ `
uniform vec2 uHalf; uniform float uRadius; uniform vec3 uColor; uniform float uFill; uniform float uGlow; uniform float uTime; uniform float uRainbow;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float d = sdBox(p, uHalf, uRadius);
  float inside = smoothstep(0.01, -0.01, d);
  float glow = exp(-max(d, 0.0) * 16.0) * uGlow;
  float rim = exp(-abs(d) * 90.0) * 0.8;
  vec3 tint = mix(uColor, hsv2rgb(vec3(fract(atan(p.y, p.x) / 6.2832 + uTime * 0.2), 0.6, 1.0)), uRainbow);
  vec3 col = tint * glow * 0.8 + mix(tint, vec3(1.0), 0.7) * rim + mix(tint, vec3(1.0), 0.55) * inside * uFill * 0.85;
  float a = clamp(glow + rim + inside * uFill, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;

// flames licking up around the pack; colour = omen, uHot = trembling before a promotion
const AURA_FRAG = /* glsl */ `
uniform vec2 uHalf; uniform vec3 uColor; uniform float uTime; uniform float uAmt; uniform float uHot; uniform float uRainbow;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float d = sdBox(p, uHalf, 0.03);
  if (d < -0.01) discard;
  float speed = 1.4 + uHot * 2.6;
  // tongues of flame: noise stretched vertically and scrolling upward
  float n = fbm(vec3(p.x * 7.0, p.y * 2.2 - uTime * speed, uTime * 0.4));
  float n2 = fbm(vec3(p.x * 13.0 + 3.0, p.y * 3.5 - uTime * speed * 1.5, uTime * 0.6));
  float up = smoothstep(-0.2, 0.9, p.y);
  float reach = 0.05 + 0.07 * n + up * 0.12 * n2 + uHot * 0.06;
  float x = max(d, 0.0);
  float body = exp(-x / reach * 1.4);
  float tongues = smoothstep(0.42, 0.75, n2 * (0.7 + 0.6 * n)) * exp(-x / (reach * 2.6));
  float edge = exp(-x * 55.0);
  vec3 tint = mix(uColor, hsv2rgb(vec3(fract(p.y * 0.25 + p.x * 0.2 - uTime * 0.18), 0.75, 1.0)), uRainbow);
  float flick = 1.0 + 0.25 * sin(uTime * 31.0) * uHot;
  vec3 col = tint * (body * 0.7 + tongues * 1.1) + mix(tint, vec3(1.0), 0.65) * edge * 0.8;
  float a = clamp((body * 0.5 + tongues * 0.9 + edge * 0.6) * uAmt * flick, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

// aurora curtains hanging over the mountains
const AURORA_FRAG = /* glsl */ `
uniform float uTime; uniform float uAmt;
varying vec2 vUv;
${NOISE}
void main(){
  float x = vUv.x * 6.2832;
  float y = vUv.y;
  float fold = sin(x * 3.0 + uTime * 0.15) * 0.08 + sin(x * 7.0 - uTime * 0.23) * 0.04;
  float base = 0.18 + fold;
  float band = smoothstep(base - 0.02, base + 0.03, y) * exp(-(y - base) * 3.2);
  float rays = fbm(vec3(vUv.x * 60.0, y * 1.5 - uTime * 0.12, uTime * 0.05));
  float curtain = band * (0.35 + 0.9 * smoothstep(0.35, 0.8, rays));
  float patchy = smoothstep(0.3, 0.7, fbm(vec3(vUv.x * 5.0, 0.0, uTime * 0.03)));
  vec3 col = mix(vec3(0.15, 0.95, 0.6), vec3(0.55, 0.3, 1.0), smoothstep(0.15, 0.6, y - base + 0.1));
  float a = curtain * patchy * uAmt;
  gl_FragColor = vec4(col * a, a);
}
`;

// final grade: vignette and a whisper of film grain
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: PASS_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float vig = smoothstep(0.85, 0.2, length(q * vec2(1.0, 1.25)));
      c.rgb *= mix(0.55, 1.0, vig);
      c.rgb += (h(vUv * 800.0 + uTime) - 0.5) * 0.025;
      gl_FragColor = c;
    }`,
};

// ---------------------------------------------------------------------------
function radialTexture(stops: [number, string][], size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A camera-facing ribbon through a list of points (head first) */
class Ribbon {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private readonly geo: THREE.BufferGeometry;
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  constructor(
    readonly n: number,
    color: THREE.Color,
    rainbow: boolean,
  ) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.alpha = new Float32Array(n * 2);
    const side = new Float32Array(n * 2);
    const hue = new Float32Array(n * 2);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      hue[i * 2] = hue[i * 2 + 1] = i / n;
      if (i < n - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.geo.setAttribute('aHue', new THREE.BufferAttribute(hue, 1));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      uniforms: { uColor: { value: color }, uRainbow: { value: rainbow ? 1 : 0 }, uTime: { value: 0 }, uFade: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  /** pts: head first. widths in world units; fade 0..1 */
  set(pts: THREE.Vector3[], widthAt: (k: number, p: THREE.Vector3) => number, fade: number, cam: THREE.Vector3) {
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      const q = pts[Math.min(i + 1, pts.length - 1)];
      const o = pts[Math.max(i - 1, 0)];
      tan.subVectors(o, q);
      if (tan.lengthSq() < 1e-10) tan.set(1, 0, 0);
      side.subVectors(cam, p).cross(tan).normalize();
      const k = i / (this.n - 1);
      const w = widthAt(k, p);
      this.pos.set([p.x - side.x * w, p.y - side.y * w, p.z - side.z * w, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w], i * 6);
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = Math.pow(1 - k, 1.5) * fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

interface Spark {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
}

interface Meteor {
  ribbon: Ribbon;
  head: THREE.Sprite;
  glow: THREE.Sprite;
  path: THREE.CatmullRomCurve3;
  t0: number;
  t1: number;
  main: boolean;
  /** seconds of path the trail covers */
  span: number;
}

// ---------------------------------------------------------------------------
export class MeteorCinema {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sky: THREE.Mesh;
  private stars: THREE.Points;
  private starsMirror: THREE.Points;
  private meteors: Meteor[] = [];
  private sparks: Spark[] = [];
  private sparkPts: THREE.Points;
  private sparkPos: Float32Array;
  private sparkAlpha: Float32Array;
  private orbCore: THREE.Sprite;
  private orbHalo: THREE.Sprite;
  private ring: THREE.Mesh;
  private morph: THREE.Mesh;
  private aura: THREE.Mesh;
  private flash: THREE.Mesh;
  private aurora: THREE.Mesh;
  private moon: THREE.Group;
  private flies: THREE.Points;
  private grade: ShaderPass;
  private reflection: THREE.Mesh;
  private raf = 0;
  private last = 0;
  private clock = -1;
  private slow = 0;
  private offset = 0;
  private done = false;
  private idle = false;
  private beats = new Set<string>();
  private color: THREE.Color;
  private readonly IMPACT = new THREE.Vector3(0.4, -1.6, -26);
  private textures: THREE.Texture[] = [];
  private shakeSeed = Math.random() * 100;
  // aura state (driven by the tear stage)
  private auraTier: OmenTier;
  private auraAmt = 0;
  private auraTarget = 0;
  private auraHot = 0;
  private auraHotTarget = 0;
  private auraColor = new THREE.Color();
  private pulse = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: CinemaOptions,
  ) {
    this.color = new THREE.Color(OMEN_COLORS[opts.tier]);
    this.auraTier = opts.tier;
    this.auraColor.copy(this.color);
    const rainbow = opts.tier === 3;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    // the scene is soft and bloomed, so 1x is plenty; drops further if frames get slow
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.55, 0.32);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);

    // sky dome with the lake
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uTint: { value: this.color.clone() },
          uTintAmt: { value: 0 },
          uGlowAmt: { value: 0 },
          uGlowDir: { value: new THREE.Vector3(0, 0, -1) },
          uMoonDir: { value: new THREE.Vector3(0.5, 0.36, -0.79).normalize() },
        },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.scene.add(this.sky);

    // stars (and their reflection)
    const N = 3200;
    const sp = new Float32Array(N * 3);
    const ss = new Float32Array(N);
    const sph = new Float32Array(N);
    const sc = new Float32Array(N * 3);
    const warm = new THREE.Color('#ffe8c4');
    const cool = new THREE.Color('#c8dcff');
    for (let i = 0; i < N; i++) {
      const y = Math.pow(Math.random(), 0.8) * 0.97 + 0.03;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      sp.set([Math.cos(th) * r * 800, y * 800, Math.sin(th) * r * 800], i * 3);
      ss[i] = Math.random() < 0.03 ? 5 + Math.random() * 5 : 1.2 + Math.pow(Math.random(), 3) * 3;
      sph[i] = Math.random();
      const c = cool.clone().lerp(warm, Math.random());
      sc.set([c.r, c.g, c.b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
    sg.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
    sg.setAttribute('aColor', new THREE.BufferAttribute(sc, 3));
    const starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uTime: { value: 0 }, uPx: { value: this.renderer.getPixelRatio() }, uDim: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(sg, starMat);
    this.scene.add(this.stars);
    this.starsMirror = new THREE.Points(sg, starMat.clone());
    (this.starsMirror.material as THREE.ShaderMaterial).uniforms.uDim.value = 0.22;
    this.starsMirror.scale.y = -1;
    this.scene.add(this.starsMirror);

    // mountain ridges (far → near); their base sits on the lake's horizon
    const ridges: [number, string, number, number, number][] = [
      [520, '#0a0f26', 0.26, 1, 1],
      [360, '#060918', 0.19, 7, 0.6],
      [230, '#03040a', 0.12, 13, 0.3],
    ];
    for (const [r, col, hgt, seed, haze] of ridges) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, r * 0.9, 256, 1, true),
        new THREE.ShaderMaterial({
          vertexShader: PASS_VERT,
          fragmentShader: RIDGE_FRAG,
          uniforms: { uSeed: { value: seed }, uColor: { value: new THREE.Color(col) }, uHeight: { value: hgt }, uHaze: { value: haze } },
          side: THREE.BackSide,
          depthWrite: false,
        }),
      );
      m.position.y = r * 0.45;
      this.scene.add(m);
    }

    // textures
    const headTex = radialTexture([
      [0, 'rgba(255,255,255,1)'],
      [0.15, 'rgba(255,255,255,0.85)'],
      [0.35, 'rgba(255,255,255,0.2)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    const glowTex = radialTexture([
      [0, 'rgba(255,255,255,0.5)'],
      [0.25, 'rgba(255,255,255,0.14)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    const ringTex = radialTexture([
      [0, 'rgba(255,255,255,0)'],
      [0.8, 'rgba(255,255,255,0)'],
      [0.93, 'rgba(255,255,255,0.9)'],
      [1, 'rgba(255,255,255,0)'],
    ], 256);
    this.textures.push(headTex, glowTex, ringTex);

    // meteors: one per card. The main one (best card) dives; the rest fall
    // away from a shared radiant like a real meteor shower.
    const tiers = opts.meteors.length ? opts.meteors : [opts.tier];
    const many = tiers.length > 12;
    const mk = (path: THREE.Vector3[], t0: number, t1: number, main: boolean, tier: OmenTier) => {
      const col = new THREE.Color(OMEN_COLORS[tier]);
      const ribbon = new Ribbon(main ? 64 : many ? 22 : 36, col, tier === 3);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      head.visible = glow.visible = false;
      this.scene.add(ribbon.mesh, glow, head);
      this.meteors.push({ ribbon, head, glow, path: new THREE.CatmullRomCurve3(path), t0, t1, main, span: main ? 0.55 : many ? 0.22 : 0.35 });
    };
    mk(
      [new THREE.Vector3(-230, 190, -330), new THREE.Vector3(-120, 130, -260), new THREE.Vector3(-40, 60, -170), new THREE.Vector3(-6, 14, -75), this.IMPACT.clone()],
      1.0,
      T_IMPACT,
      true,
      tiers[0],
    );
    const radiant = new THREE.Vector3(240, 300, -420);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const rest = tiers.slice(1);
    rest.forEach((tier, k) => {
      const f = rest.length > 1 ? k / (rest.length - 1) : 0.5;
      const t0 = 0.85 + f * 1.45 + rnd(-0.08, 0.08);
      const start = radiant.clone().add(new THREE.Vector3(rnd(-160, 60), rnd(-90, 30), rnd(-40, 60)));
      const dir = start.clone().sub(radiant).add(new THREE.Vector3(-120, -70, 0)).normalize();
      const len = rnd(90, 190);
      const end = start.clone().addScaledVector(dir, len);
      const mid = start.clone().lerp(end, 0.5);
      mk([start, mid, end], t0, t0 + rnd(0.45, 0.8) * (many ? 0.8 : 1), false, tier);
    });
    this.color = new THREE.Color(OMEN_COLORS[tiers[0]]);

    // the main meteor mirrored in the lake
    this.reflection = new THREE.Mesh(this.meteors[0].ribbon.mesh.geometry, this.meteors[0].ribbon.mat.clone());
    (this.reflection.material as THREE.ShaderMaterial).uniforms.uFade.value = 0.3;
    this.reflection.scale.y = -1;
    this.reflection.position.y = -3.0;
    this.reflection.frustumCulled = false;
    this.scene.add(this.reflection);

    // aurora
    this.aurora = new THREE.Mesh(
      new THREE.CylinderGeometry(640, 640, 520, 128, 1, true),
      new THREE.ShaderMaterial({
        vertexShader: PASS_VERT,
        fragmentShader: AURORA_FRAG,
        uniforms: { uTime: { value: 0 }, uAmt: { value: 0.55 } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.aurora.position.y = 200;
    this.aurora.rotation.y = 1.2;
    this.scene.add(this.aurora);

    // moon
    this.moon = new THREE.Group();
    const moonTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(110, 100, 10, 128, 128, 120);
      grad.addColorStop(0, '#fffdf4');
      grad.addColorStop(0.7, '#e9e6dc');
      grad.addColorStop(1, '#c9c5bb');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(128, 128, 118, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 26; k++) {
        g.fillStyle = `rgba(150,150,160,${0.08 + Math.random() * 0.12})`;
        g.beginPath();
        g.arc(60 + Math.random() * 140, 60 + Math.random() * 140, 6 + Math.random() * 20, 0, Math.PI * 2);
        g.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.textures.push(moonTex);
    const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false, color: 0xeef2ff }));
    moonDisc.scale.setScalar(26);
    const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fb4ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    moonHalo.scale.setScalar(150);
    this.moon.add(moonHalo, moonDisc);
    this.moon.position.copy(new THREE.Vector3(0.5, 0.36, -0.79).normalize().multiplyScalar(700));
    this.scene.add(this.moon);

    // fireflies over the water
    const FN = 140;
    const fp = new Float32Array(FN * 3);
    const fa = new Float32Array(FN);
    const fc = new Float32Array(FN * 3);
    for (let k = 0; k < FN; k++) {
      fp.set([rnd(-40, 40), rnd(-1.2, 4), rnd(-70, -9)], k * 3);
      fa[k] = Math.random();
      const c = new THREE.Color().setHSL(rnd(0.14, 0.2), 0.9, 0.7);
      fc.set([c.r, c.g, c.b], k * 3);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('aAlpha', new THREE.BufferAttribute(fa, 1));
    fg.setAttribute('aColor', new THREE.BufferAttribute(fc, 3));
    this.flies = new THREE.Points(
      fg,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float aAlpha; attribute vec3 aColor; uniform float uTime; uniform float uPx;
          varying float vA; varying vec3 vC;
          void main(){
            vec3 p = position;
            p.x += sin(uTime * 0.4 + aAlpha * 30.0) * 0.8;
            p.y += sin(uTime * 0.6 + aAlpha * 17.0) * 0.4;
            vA = pow(0.5 + 0.5 * sin(uTime * (1.0 + aAlpha) + aAlpha * 50.0), 3.0);
            vC = aColor;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = uPx * clamp(70.0 / -mv.z, 1.5, 7.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA; varying vec3 vC;
          void main(){ vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 20.0) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }`,
        uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.flies.frustumCulled = false;
    this.scene.add(this.flies);

    // sparks
    const MAXS = 600;
    this.sparkPos = new Float32Array(MAXS * 3);
    this.sparkAlpha = new Float32Array(MAXS);
    const spg = new THREE.BufferGeometry();
    spg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    spg.setAttribute('aAlpha', new THREE.BufferAttribute(this.sparkAlpha, 1));
    const spc = new Float32Array(MAXS * 3);
    for (let i = 0; i < MAXS; i++) {
      const c = rainbow ? new THREE.Color().setHSL(Math.random(), 0.8, 0.7) : this.color.clone().lerp(new THREE.Color('#ffffff'), Math.random() * 0.6);
      spc.set([c.r, c.g, c.b], i * 3);
    }
    spg.setAttribute('aColor', new THREE.BufferAttribute(spc, 3));
    this.sparkPts = new THREE.Points(
      spg,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float aAlpha; attribute vec3 aColor; uniform float uPx;
          varying float vA; varying vec3 vC;
          void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = uPx * clamp(60.0 / -mv.z, 1.5, 9.0) * (0.4 + 0.6 * aAlpha); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          varying float vA; varying vec3 vC;
          void main(){ vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 18.0) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a * 1.4, a); }`,
        uniforms: { uPx: { value: this.renderer.getPixelRatio() } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.sparkPts.frustumCulled = false;
    this.scene.add(this.sparkPts);

    // shock ring on the lake
    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: ringTex, color: this.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(this.IMPACT.x, -1.5, this.IMPACT.z);
    this.scene.add(this.ring);

    // orb
    this.orbCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.orbHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: this.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.scene.add(this.orbHalo, this.orbCore);

    // morph plane (orb → pack silhouette) and the aura, both camera-attached
    const planeMat = (frag: string, extra: Record<string, THREE.IUniform> = {}) =>
      new THREE.ShaderMaterial({
        vertexShader: PASS_VERT,
        fragmentShader: frag,
        uniforms: {
          uHalf: { value: new THREE.Vector2(0.3, 0.3) },
          uColor: { value: this.color.clone() },
          uTime: { value: 0 },
          uRainbow: { value: rainbow ? 1 : 0 },
          ...extra,
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
    this.morph = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), planeMat(MORPH_FRAG, { uRadius: { value: 0.3 }, uFill: { value: 0 }, uGlow: { value: 0 } }));
    this.morph.visible = false;
    this.morph.renderOrder = 10;
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), planeMat(AURA_FRAG, { uAmt: { value: 0 }, uHot: { value: 0 } }));
    this.aura.visible = false;
    this.aura.renderOrder = 9;
    this.camera.add(this.morph, this.aura);

    // full-screen flash
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
    );
    this.flash.position.z = -1;
    this.flash.scale.set(4, 4, 1);
    this.flash.renderOrder = 20;
    this.camera.add(this.flash);
    this.scene.add(this.camera);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  // -------------------------------------------------------------------------
  play() {
    // compile every shader up front so the first frames don't stall the intro
    this.renderer.compile(this.scene, this.camera);
    this.composer.render();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** jump straight to the end of the cinematic */
  skip() {
    if (this.done) return;
    this.offset += T_DONE - this.time();
  }

  /** keep the starry sky running quietly behind the tear stage */
  setIdle(v: boolean) {
    this.idle = v;
  }

  /** aura around the pack: tier colour, visibility, and "hot" (trembling before 昇格) */
  setAura(tier: OmenTier, visible: boolean, hot: boolean) {
    if (tier !== this.auraTier) {
      this.auraTier = tier;
      this.pulse = 1;
      (this.aura.material as THREE.ShaderMaterial).uniforms.uRainbow.value = tier === 3 ? 1 : 0;
    }
    this.auraTarget = visible ? 1 : 0;
    this.auraHotTarget = hot ? 1 : 0;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.meteors.forEach((m) => m.ribbon.dispose());
    this.textures.forEach((t) => t.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** timeline clock: starts on the first frame and never jumps more than 1/15 s per frame */
  private time() {
    return Math.max(0, this.clock) + this.offset;
  }

  private resize = () => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private beat(b: Beat) {
    if (this.beats.has(b)) return;
    this.beats.add(b);
    this.opts.onBeat?.(b);
  }

  /** camera-space point at distance d under a screen position */
  private screenToCamera(cx: number, cy: number, d: number) {
    const r = this.host.getBoundingClientRect();
    const nx = ((cx - r.left) / r.width) * 2 - 1;
    const ny = -(((cy - r.top) / r.height) * 2 - 1);
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * d;
    return new THREE.Vector3(nx * halfH * this.camera.aspect, ny * halfH, -d);
  }

  /** world size of the target rect at distance d */
  private targetSize(target: DOMRect | null, d: number) {
    const r = this.host.getBoundingClientRect();
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * d;
    return target ? { w: (target.width / r.width) * 2 * halfH * this.camera.aspect, h: (target.height / r.height) * 2 * halfH } : { w: 1.8, h: 3 };
  }

  private emit(p: THREE.Vector3, n: number, speed: number, up = 0) {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= 600) this.sparks.shift();
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5 + up, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      const max = 0.5 + Math.random() * 1.0;
      this.sparks.push({ p: p.clone(), v, life: max, max });
    }
  }

  /** normalised position along the path; the main meteor cruises, then plunges */
  private meteorS(m: Meteor, T: number) {
    const x = clamp01((T - m.t0) / (m.t1 - m.t0));
    if (!m.main) return x;
    return x < 0.6 ? (x / 0.6) * 0.5 : 0.5 + easeInCubic((x - 0.6) / 0.4) * 0.5;
  }

  // -------------------------------------------------------------------------
  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now();
    if (this.clock < 0) {
      this.clock = 0;
      this.last = now;
    }
    const raw = (now - this.last) / 1000;
    const dt = Math.min(1 / 15, raw);
    // adaptive resolution: sustained slow frames → render at 75%, then 55%
    this.slow = this.slow * 0.95 + (raw > 0.034 ? 1 : 0) * 0.05;
    if (this.slow > 0.6 && this.renderer.getPixelRatio() > 0.56) {
      this.renderer.setPixelRatio(this.renderer.getPixelRatio() > 0.8 ? 0.75 : 0.55);
      this.resize();
      this.slow = 0;
    }
    this.clock += dt;
    this.last = now;
    const t = this.time();
    (window as unknown as { __cineT?: number }).__cineT = t;
    const T = Math.min(t, T_DONE);

    const skyU = (this.sky.material as THREE.ShaderMaterial).uniforms;
    skyU.uTime.value = t;
    (this.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.starsMirror.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.aurora.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.flies.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    this.grade.uniforms.uTime.value = t;
    const camPos = this.camera.position;

    // ---------------- camera ----------------
    const look = new THREE.Vector3();
    const up1 = easeInOut(smooth(0, 1.6, T));
    look.set(-30 * up1, 4 + 150 * up1, -300);
    const main = this.meteors[0];
    const follow = smooth(1.7, 2.35, T);
    if (follow > 0) look.lerp(main.path.getPointAt(this.meteorS(main, Math.min(T, main.t1))), follow * 0.8);
    const settle = smooth(T_IMPACT - 0.05, T_IMPACT + 0.9, T);
    if (settle > 0) look.lerp(new THREE.Vector3(0, 1.2, -60), easeInOut(settle));
    camPos.set(Math.sin(t * 0.37) * 0.08, 1.4 + Math.sin(t * 0.53) * 0.05, 6 - 1.2 * smooth(0, 4.4, T));
    const sinceImpact = T - T_IMPACT;
    const shake = sinceImpact >= 0 ? Math.max(0, 1 - sinceImpact / 0.5) : 0;
    if (shake > 0) {
      const s = this.shakeSeed + t * 55;
      camPos.x += Math.sin(s * 1.7) * 0.12 * shake;
      camPos.y += Math.sin(s * 2.3) * 0.09 * shake;
    }
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();

    // ---------------- meteors ----------------
    if (T >= 1.0) this.beat('enter');
    if (T >= 1.9) this.beat('dive');
    for (const m of this.meteors) {
      const alive = T >= m.t0 && T <= m.t1 + m.span;
      m.ribbon.mesh.visible = alive;
      m.ribbon.mat.uniforms.uTime.value = t;
      const within = T >= m.t0 && T <= m.t1;
      m.head.visible = m.glow.visible = within;
      if (!alive) continue;
      // trail = the path over the last `span` seconds (frame-rate independent)
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < m.ribbon.n; i++) {
        const tt = Math.max(m.t0, Math.min(m.t1, T - (i / (m.ribbon.n - 1)) * m.span));
        pts.push(m.path.getPointAt(this.meteorS(m, tt)));
      }
      const head = pts[0];
      const dist = head.distanceTo(camPos);
      const dive = m.main ? smooth(1.9, T_IMPACT, T) : 0;
      // angular sizes, so nothing balloons when it comes close
      const ang = (m.main ? 0.0045 : 0.0032) * (1 + dive * 1.6);
      const fade = (m.main ? 1 - smooth(m.t1, m.t1 + 0.12, T) : 1 - smooth(m.t1 - 0.1, m.t1 + m.span, T)) * smooth(m.t0, m.t0 + 0.1, T);
      m.ribbon.set(pts, (k, p) => p.distanceTo(camPos) * ang * (1 - k * 0.85), fade, camPos);
      if (within) {
        m.head.position.copy(head);
        m.glow.position.copy(head);
        m.head.scale.setScalar(dist * (m.main ? 0.018 : 0.012) * (1 + dive * 0.8));
        m.glow.scale.setScalar(dist * (m.main ? 0.07 : 0.045) * (1 + dive * 0.6));
        if (m.main) this.emit(head, 1, dist * 0.02);
      }
    }
    this.reflection.visible = main.ribbon.mesh.visible;
    (this.reflection.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    // sky tint while the meteors are out; glow on the horizon where it lands
    skyU.uTintAmt.value = smooth(1.0, 1.8, T) * (1 - smooth(T_IMPACT, T_IMPACT + 1.4, T)) * (0.5 + this.opts.tier * 0.35);
    const toImpact = this.IMPACT.clone().sub(camPos).normalize();
    skyU.uGlowDir.value.copy(toImpact);
    skyU.uGlowAmt.value = smooth(2.2, T_IMPACT, T) * (1 - smooth(T_IMPACT + 0.3, T_IMPACT + 1.4, T)) * 1.2;

    // ---------------- impact ----------------
    if (T >= T_IMPACT && !this.beats.has('impact')) {
      this.beat('impact');
      this.emit(this.IMPACT, 220, 12, 0.7);
    }
    const flashMat = this.flash.material as THREE.MeshBasicMaterial;
    flashMat.opacity = sinceImpact >= 0 ? 0.38 * Math.max(0, 1 - sinceImpact / 0.35) * Math.min(1, sinceImpact / 0.03) : 0;
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    if (sinceImpact >= 0 && sinceImpact < 1.6) {
      const k = easeOutCubic(sinceImpact / 1.6);
      this.ring.scale.setScalar(1 + k * 38);
      ringMat.opacity = (1 - k) * 0.85;
    } else ringMat.opacity = 0;

    // ---------------- orb → pack ----------------
    const target = this.opts.target();
    const D = 10;
    let orbCam = new THREE.Vector3(0, 0, -D);
    if (target) orbCam = this.screenToCamera(target.left + target.width / 2, target.top + target.height / 2, D);
    const coreMat = this.orbCore.material as THREE.SpriteMaterial;
    const haloMat = this.orbHalo.material as THREE.SpriteMaterial;
    if (sinceImpact >= 0.08) {
      this.beat('orb');
      const rise = easeInOut(smooth(T_IMPACT + 0.08, T_IMPACT + 1.0, T));
      const pos = this.IMPACT.clone().lerp(this.camera.localToWorld(orbCam.clone()), rise);
      const d = pos.distanceTo(camPos);
      const pulse = 1 + Math.sin(t * 7) * 0.05;
      this.orbCore.position.copy(pos);
      this.orbHalo.position.copy(pos);
      const vanish = smooth(3.7, 4.0, T);
      coreMat.opacity = smooth(T_IMPACT + 0.05, T_IMPACT + 0.3, T) * (1 - vanish);
      haloMat.opacity = coreMat.opacity * 0.8;
      this.orbCore.scale.setScalar(d * 0.05 * pulse);
      this.orbHalo.scale.setScalar(d * 0.22 * pulse);
      if (vanish < 1 && Math.random() < 0.6) this.emit(pos, 1, d * 0.04, 0.9);
    } else coreMat.opacity = haloMat.opacity = 0;

    const mk = smooth(3.55, 4.25, T);
    const mu = (this.morph.material as THREE.ShaderMaterial).uniforms;
    this.morph.visible = mk > 0 && !(this.done && this.idle && smooth(T_DONE, T_DONE + 0.4, t) >= 1);
    if (this.morph.visible) {
      this.beat('morph');
      const { w: tw, h: th } = this.targetSize(target, D);
      const size = Math.max(tw, th) * 1.9;
      this.morph.position.copy(orbCam);
      this.morph.scale.set(size, size, 1);
      const e = easeInOut(mk);
      mu.uHalf.value.set(THREE.MathUtils.lerp(0.1, tw / size, e), THREE.MathUtils.lerp(0.1, th / size, e));
      mu.uRadius.value = THREE.MathUtils.lerp(0.1, 0.02, e);
      const out = smooth(T_DONE, T_DONE + 0.45, t);
      mu.uGlow.value = 0.55 * (1 - smooth(3.9, 4.3, T) * 0.5) * (1 - out);
      mu.uFill.value = smooth(3.85, 4.3, T) * 0.8 * (1 - out);
      mu.uTime.value = t;
    }

    // ---------------- aura around the real pack ----------------
    this.auraAmt += (this.auraTarget - this.auraAmt) * Math.min(1, dt * 4);
    this.auraHot += (this.auraHotTarget - this.auraHot) * Math.min(1, dt * 6);
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.auraColor.lerp(new THREE.Color(OMEN_COLORS[this.auraTier]), Math.min(1, dt * 6));
    this.aura.visible = this.auraAmt > 0.01;
    if (this.aura.visible) {
      const { w: tw, h: th } = this.targetSize(target, D);
      const size = Math.max(tw, th) * 1.5;
      const au = (this.aura.material as THREE.ShaderMaterial).uniforms;
      this.aura.position.copy(orbCam);
      this.aura.scale.set(size, size, 1);
      au.uHalf.value.set(tw / size, th / size);
      au.uColor.value.copy(this.auraColor);
      au.uTime.value = t;
      au.uHot.value = this.auraHot + this.pulse;
      const base = [0.35, 0.7, 0.95, 1.1][this.auraTier];
      au.uAmt.value = this.auraAmt * (base + this.pulse * 0.8);
    }

    // ---------------- sparks ----------------
    let i = 0;
    for (const s of this.sparks) {
      s.life -= dt;
      s.v.multiplyScalar(0.965);
      s.v.y -= dt * 2.5;
      s.p.addScaledVector(s.v, dt);
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const s of this.sparks) {
      this.sparkPos.set([s.p.x, s.p.y, s.p.z], i * 3);
      this.sparkAlpha[i] = Math.max(0, s.life / s.max);
      i++;
    }
    for (let k = i; k < 600; k++) this.sparkAlpha[k] = 0;
    this.sparkPts.geometry.attributes.position.needsUpdate = true;
    this.sparkPts.geometry.attributes.aAlpha.needsUpdate = true;

    this.bloom.strength = 0.8 + (sinceImpact >= 0 ? Math.max(0, 0.9 * (1 - sinceImpact / 0.6)) : 0) + smooth(3.85, 4.3, T) * (1 - smooth(T_DONE, T_DONE + 0.5, t)) * 0.15;

    if (T >= T_DONE && !this.done) {
      this.done = true;
      this.opts.onDone();
    }
    this.composer.render();
  };
}
