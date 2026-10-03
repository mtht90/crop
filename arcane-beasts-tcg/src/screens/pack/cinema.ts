// ============================================================================
// 流星降臨 — the pack-opening cinematic, rendered live with three.js.
//
//   0.0s  a still night: snow mountains and pines mirrored in a lake, a drifting
//         sky of clouds and Milky Way; the camera rises slowly from the water
//   3.5s  a meteor shower: one meteor per card    ← omen: each meteor's colour
//   5.45s the main meteor turns and dives toward the viewer
//   6.05s impact on the lake: flash, shock ring, sparks, camera shake
//   6.15s a ball of light rises and hovers where the pack will be
//   7.05s the light stretches into the silhouette of a booster pack
//   7.95s done → the real (DOM) pack materialises in the same place
//
// Afterwards the scene keeps running quietly behind the pack and draws the
// pack's aura (the omen colour, which can climb — 昇格 — before opening).
//
// A god pack (every card ☆ or better) gets its own ending: every meteor is
// gold, a golden rain follows the shower, and after the impact the night
// gives way to dawn — the sun rises behind the pack.
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
import { liteFx, reportFrameTime } from '../../lib/fx';

/** 0 = nothing special, 1 = ◇◇◇◇, 2 = ☆, 3 = ♛ */
export type OmenTier = 0 | 1 | 2 | 3;

export const OMEN_COLORS: Record<OmenTier, string> = { 0: '#cfe0ff', 1: '#4fa8ff', 2: '#ffc245', 3: '#ff79d6' };

/** the quiet opening before the meteors; the rest of the timeline is written relative to it */
const T0 = 3.5;
/** impact and end of the sequence, relative to the first meteor */
const L_IMPACT = 2.55;
const L_DONE = 4.45;
export const T_IMPACT = T0 + L_IMPACT;
export const T_DONE = T0 + L_DONE;
const MOON_DIR = new THREE.Vector3(0.5, 0.3, -0.81).normalize();

type Beat = 'twinkle' | 'enter' | 'dive' | 'impact' | 'orb' | 'morph';

export interface CinemaOptions {
  tier: OmenTier;
  /** god pack: golden meteors and a dawn ending */
  god?: boolean;
  /** one entry per card: the colour (omen tier) its meteor shows; the first one is the main meteor */
  meteors: OmenTier[];
  /** element whose rect the light should settle on (the pack) */
  target: () => DOMRect | null;
  onBeat?: (beat: Beat) => void;
  onDone: () => void;
  /** wait at this point of the opening until `release()` (the pack is swiped up) */
  holdAt?: number;
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
uniform float uDim; uniform float uTime; uniform vec3 uTint; uniform float uTintAmt; uniform float uGlowAmt; uniform vec3 uGlowDir; uniform vec3 uMoonDir; uniform float uDawn; uniform vec3 uSunDir; uniform float uLite;
varying vec3 vDir;
${NOISE}

// drifting clouds on a plane overhead; the edge facing the moon catches its light
vec4 clouds(vec3 d, float scale, float speed, float seed, float detail){
  float y = max(d.y, 0.0);
  vec2 p = d.xz / (y + 0.14) * scale + vec2(uTime * speed, seed);
  vec2 q = vec2(0.0);
  if (detail > 0.5) q = vec2(fbm(vec3(p * 0.7, 1.7)), fbm(vec3(p * 0.7 + 5.2, 3.1))) - 0.5;
  vec2 pp = p + q * 1.6;
  float n = fbm(vec3(pp, uTime * 0.015 + seed));
  float dens = mix(smoothstep(0.5, 0.82, n), smoothstep(0.58, 0.615, n), 0.3);
  vec2 md = normalize(uMoonDir.xz + vec2(0.0001)) * 0.16;
  float n2 = fbm(vec3(pp + md, uTime * 0.015 + seed));
  float rim = clamp((n - n2) * 6.0, 0.0, 1.0) * dens;
  float mdot = max(dot(d, uMoonDir), 0.0);
  vec3 body = mix(vec3(0.015, 0.03, 0.11), vec3(0.07, 0.10, 0.26), n) + vec3(0.07, 0.09, 0.2) * pow(mdot, 4.0);
  vec3 lit = vec3(0.55, 0.70, 1.0) * (0.12 + 0.75 * pow(mdot, 3.0));
  float fade = smoothstep(0.02, 0.2, d.y) * (1.0 - smoothstep(0.75, 1.0, d.y) * 0.5);
  return vec4(body + lit * rim, dens * fade);
}

vec3 skyCol(vec3 d, float detail){
  float h = d.y;
  vec3 zenith = vec3(0.004, 0.010, 0.070);
  vec3 mid = vec3(0.014, 0.050, 0.210);
  vec3 low = vec3(0.050, 0.130, 0.380);
  vec3 horizon = vec3(0.230, 0.230, 0.470);
  vec3 col = mix(horizon, low, smoothstep(0.0, 0.07, h));
  col = mix(col, mid, smoothstep(0.05, 0.3, h));
  col = mix(col, zenith, smoothstep(0.25, 0.95, h));
  // a warm glow low in the distance
  col += vec3(0.50, 0.20, 0.30) * exp(-max(h, 0.0) * 22.0) * smoothstep(0.1, -0.9, d.z) * 0.14;
  // the milky way: a wide band with a bright core and dark dust lanes
  vec3 bandN = normalize(vec3(0.7, 0.8, 0.6));
  float bd = dot(d, bandN);
  float band = exp(-bd * bd * 12.0);
  float core = exp(-bd * bd * 60.0);
  float dust = fbm(d * 6.5 + 1.3);
  float cl = fbm(d * 2.6 + vec3(0.0, uTime * 0.003, 0.0));
  float lane = smoothstep(0.40, 0.64, dust);
  float up = smoothstep(0.02, 0.3, h);
  float moonMask = 1.0 - 0.8 * smoothstep(0.6, 0.97, dot(d, uMoonDir));
  vec3 mw = mix(vec3(0.18, 0.28, 0.66), vec3(0.72, 0.48, 0.80), smoothstep(0.3, 0.85, cl));
  col += mw * band * (0.3 + 0.8 * cl) * (1.0 - 0.7 * lane) * 0.8 * up * moonMask;
  col += vec3(0.65, 0.75, 1.0) * core * (0.3 + cl) * (1.0 - lane) * 0.2 * up * moonMask;
  // faint nebula tints
  col += vec3(0.08, 0.03, 0.16) * smoothstep(0.52, 0.86, fbm(d * 2.1 + vec3(3.1, 0.0, 1.7))) * 0.7;
  col += vec3(0.01, 0.05, 0.09) * smoothstep(0.55, 0.9, fbm(d * 2.7 + 7.0)) * 0.7;
  // the omen colour washes over the sky while the meteors are out
  col += uTint * uTintAmt * (0.3 + 0.7 * smoothstep(0.0, 0.5, h)) * 0.12;
  // light of the falling star / the orb near the horizon
  col += uTint * uGlowAmt * pow(max(dot(d, uGlowDir), 0.0), 18.0) * 0.6;
  // dawn (god pack): warm horizon, lavender band, the sun behind the pack
  if (uDawn > 0.0) {
    vec3 dawn = mix(vec3(0.34, 0.13, 0.05), vec3(0.11, 0.06, 0.13), smoothstep(0.0, 0.14, h));
    dawn = mix(dawn, vec3(0.012, 0.025, 0.08), smoothstep(0.14, 0.6, h));
    float sd = max(dot(d, uSunDir), 0.0);
    dawn += vec3(1.0, 0.7, 0.35) * (pow(sd, 120.0) * 0.7 + pow(sd, 16.0) * 0.12 + pow(sd, 4.0) * 0.03);
    dawn += vec3(0.6, 0.3, 0.16) * exp(-max(h, 0.0) * 30.0) * 0.15;
    col = mix(col, dawn, uDawn);
  }
  // the moon: a bright disc with a few seas, a halo and a thin ring
  float mdot = dot(d, uMoonDir);
  float ang = acos(clamp(mdot, -1.0, 1.0));
  if (ang < 0.05 && uDawn < 0.99) {
    vec3 lp = (d - uMoonDir * mdot) / 0.036;
    float sea = smoothstep(0.45, 0.7, fbm(lp * 2.2 + 3.0));
    vec3 disc = mix(vec3(1.0, 0.98, 0.9), vec3(0.74, 0.8, 0.92), sea * 0.55) * (0.82 + 0.18 * smoothstep(-1.0, 1.0, lp.x));
    col = mix(col, disc * 1.05, smoothstep(0.038, 0.034, ang) * (1.0 - uDawn));
  }
  float md = max(mdot, 0.0);
  col += vec3(0.55, 0.64, 0.95) * (pow(md, 140.0) * 0.4 + pow(md, 22.0) * 0.05 + pow(md, 3.0) * 0.008) * (1.0 - uDawn);
  col += vec3(0.5, 0.6, 1.0) * exp(-pow((ang - 0.1) * 42.0, 2.0)) * 0.07 * (1.0 - uDawn);
  // clouds drift in front of the moon
  if (uDawn < 0.99) {
    vec4 c1 = clouds(d, 2.4, 0.010, 0.0, detail);
    col = mix(col, c1.rgb, c1.a * 0.72 * (1.0 - uDawn));
    if (detail > 0.5 && uLite < 0.5) {
      vec4 c2 = clouds(d, 4.2, 0.018, 9.0, 1.0);
      col = mix(col, c2.rgb * 0.8, c2.a * 0.5 * (1.0 - uDawn));
    }
  }
  return col;
}
void main(){
  vec3 d = normalize(vDir);
  if (d.y >= 0.0) { gl_FragColor = vec4(skyCol(d, 1.0) * (1.0 - uDim), 1.0); return; }
  // still lake: the sky mirrored and broken up by slow ripples, darker toward the viewer
  float depth = -d.y;
  float k = 1.0 / max(depth, 0.015);
  float rip = noise(vec3(d.x * k * 0.9, d.z * k * 0.12, uTime * 0.45)) - 0.5;
  float rip2 = noise(vec3(d.x * k * 4.0, d.z * k * 0.5, uTime * 0.8)) - 0.5;
  // horizontal slices drift sideways, so reflections (the moon above all) break up like real water
  float slice = (noise(vec3(depth * 130.0, 0.0, uTime * 0.7)) - 0.5) * 0.026 * smoothstep(0.02, 0.25, depth);
  vec3 r = normalize(vec3(d.x + rip * 0.035 + rip2 * 0.012 + slice, max(0.0, depth + rip * 0.01), d.z));
  vec3 col = skyCol(r, 0.0) * mix(1.0, 0.62, smoothstep(0.0, 0.05, depth));
  col = mix(col, mix(vec3(0.006, 0.02, 0.06), vec3(0.02, 0.012, 0.018), uDawn), smoothstep(0.03, 0.45, depth) * 0.9);
  // the sun's path on the water
  float saz = d.x / -d.z - uSunDir.x / -uSunDir.z;
  col += vec3(1.0, 0.62, 0.3) * exp(-abs(saz + rip * 0.1) * 16.0) * smoothstep(0.5, 0.0, depth) * (0.4 + 0.9 * max(rip, 0.0)) * 0.22 * uDawn;
  // moon path on the water: broken into little glints
  float az = d.x / -d.z - uMoonDir.x / -uMoonDir.z;
  float moonPath = exp(-abs(az + rip * 0.08) * 24.0) * smoothstep(0.5, 0.0, depth);
  float glint = smoothstep(0.62, 0.9, noise(vec3(d.x * k * 13.0, d.z * k * 1.6, uTime * 1.2)));
  col += vec3(0.55, 0.65, 0.95) * moonPath * (0.28 + 1.1 * glint) * 0.5 * (1.0 - uDawn);
  // shimmering reflection of the glow on the water
  float streak = exp(-abs(d.x - uGlowDir.x * 0.9) * 22.0) * smoothstep(0.35, 0.0, depth) * (0.6 + 0.4 * rip);
  col += uTint * uGlowAmt * streak * 0.5;
  gl_FragColor = vec4(col * (1.0 - uDim), 1.0);
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

// terrain wraps the viewer in a cylinder; the azimuth (0 = straight ahead) drives every profile
const TERRAIN_VERT = /* glsl */ `
varying vec2 vUv; varying float vAz;
void main(){ vUv = uv; vAz = atan(position.x, -position.z); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// snow mountains: sharp ridged peaks, snow caps, moonlit faces and a soft haze at the foot
const RIDGE_FRAG = /* glsl */ `
uniform float uDim; uniform float uSeed; uniform float uScale; uniform vec3 uColor; uniform vec3 uHazeCol; uniform float uHeight; uniform float uHaze; uniform float uSnow; uniform float uMirror; uniform float uTime; uniform float uDawn;
varying vec2 vUv; varying float vAz;
${NOISE}
float ridgeAt(float a){
  float x = a * uScale + uSeed;
  float r = 0.0; float amp = 0.55; float f = 1.0;
  for (int i = 0; i < 4; i++){
    float n = noise(vec3(x * f, uSeed * 1.7, 0.0));
    n = 1.0 - abs(2.0 * n - 1.0);
    r += n * n * amp; amp *= 0.5; f *= 2.1;
  }
  return uHeight * (0.10 + r * 0.95);
}
void main(){
  float y = vUv.y;
  float a = vAz;
  if (uMirror > 0.5) a += (noise(vec3(y * 150.0, uTime * 0.7, uSeed)) - 0.5) * 0.005 * (0.4 + y * 8.0);
  float ridge = ridgeAt(a);
  if (y > ridge) discard;
  float dh = (ridge - y) / uHeight;
  float e = 0.012;
  float slope = (ridgeAt(a + e) - ridgeAt(a - e)) / (2.0 * e) / uHeight;
  float s = clamp((0.55 - a) * 2.0, -1.0, 1.0);
  float lit = 0.5 + 0.5 * clamp(-slope * s * 0.05, -1.0, 1.0);
  // gullies run down from the crests; a finer grain sits on top
  float gully = noise(vec3(a * 110.0 + y * 6.0, y * 7.0, uSeed * 3.0));
  float crag2 = noise(vec3(a * 190.0, y * 150.0, uSeed));
  float shade = 0.55 + 0.55 * gully;
  vec3 rock = uColor * shade + vec3(0.02, 0.035, 0.085) * lit * (0.4 + crag2) * (0.5 + gully);
  float tall = smoothstep(0.35, 0.8, ridge / uHeight);
  float sn = noise(vec3(a * 160.0, y * 150.0, uSeed)) * 0.6 + gully * 0.4;
  float snow = smoothstep(0.40, 0.2, dh + (sn - 0.5) * 0.22 + (0.5 - gully) * 0.12) * uSnow * (0.3 + 0.7 * tall);
  vec3 snowCol = mix(vec3(0.18, 0.24, 0.48), vec3(0.62, 0.74, 0.96), clamp(lit * (0.7 + 0.5 * gully) + (crag2 - 0.5) * 0.15, 0.0, 1.0));
  vec3 col = mix(rock, snowCol, snow);
  col += vec3(0.45, 0.60, 1.0) * smoothstep(ridge - 0.008, ridge, y) * 0.22 * (0.3 + lit);
  float fog = clamp(uHaze * (0.25 + smoothstep(0.3, 0.0, y) * 0.9), 0.0, 1.0);
  col = mix(col, uHazeCol, fog);
  col = mix(col, col * vec3(1.5, 1.0, 0.7) + vec3(0.1, 0.03, 0.0), uDawn * 0.4);
  float alpha = 1.0;
  if (uMirror > 0.5) { col = mix(col, vec3(0.01, 0.03, 0.08), 0.25) * 0.8; alpha = 0.8 * (1.0 - smoothstep(0.0, 0.2, y)); }
  gl_FragColor = vec4(col * (1.0 - uDim), alpha);
}
`;

// a line of pines along the shore, taller toward both sides so they frame the view
const FOREST_FRAG = /* glsl */ `
uniform float uDim; uniform float uSeed; uniform float uHeight; uniform vec3 uColor; uniform float uMirror; uniform float uTime; uniform float uDawn;
varying vec2 vUv; varying float vAz;
${NOISE}
float h1(float n){ return fract(sin(n * 91.3458) * 47453.5453); }
void main(){
  float y = vUv.y;
  float a = vAz;
  if (uMirror > 0.5) a += (noise(vec3(y * 150.0, uTime * 0.7, uSeed)) - 0.5) * 0.003 * (0.4 + y * 8.0);
  float edge = smoothstep(0.34, 0.8, abs(a));
  float cell = a * 64.0;
  float id0 = floor(cell);
  float hit = 0.0; float rim = 0.0;
  for (int i = -1; i <= 1; i++){
    float id = id0 + float(i);
    float hh = (0.35 + 0.9 * h1(id + uSeed)) * uHeight * edge;
    float cx = id + 0.5 + (h1(id * 1.7 + uSeed) - 0.5) * 0.5;
    float u = cell - cx;
    float yr = y / max(hh, 0.0001);
    if (yr < 1.0) {
      float tiers = 1.0 - fract(yr * (7.0 + 3.0 * h1(id)));
      float hw = (1.0 - yr) * (0.62 + 0.2 * tiers) * (0.9 + 0.5 * h1(id + 3.0));
      if (abs(u) < hw) { hit = 1.0; rim = max(rim, smoothstep(0.0, 0.6, u / hw) * (1.0 - yr)); }
    }
  }
  if (hit < 0.5) discard;
  vec3 col = uColor + vec3(0.03, 0.06, 0.12) * rim * 0.6 * (1.0 - uDawn);
  float alpha = 1.0;
  if (uMirror > 0.5) { col *= 0.9; alpha = 0.85 * (1.0 - smoothstep(0.0, 0.25, y)); }
  gl_FragColor = vec4(col * (1.0 - uDim), alpha);
}
`;

// low mist lying on the water between the ranges
const MIST_FRAG = /* glsl */ `
uniform float uDim; uniform float uTime; uniform vec3 uCol; uniform float uAmt; uniform float uSeed;
varying vec2 vUv; varying float vAz;
${NOISE}
void main(){
  float y = vUv.y;
  float n = fbm(vec3(vAz * 7.0 + uTime * 0.02, y * 5.0, uSeed + uTime * 0.015));
  float n2 = fbm(vec3(vAz * 17.0 - uTime * 0.035, y * 9.0, uSeed + 4.0));
  float band = smoothstep(0.0, 0.012, y) * exp(-y * 20.0);
  float a = uAmt * band * smoothstep(0.25, 0.75, n) * (0.5 + 0.9 * n2);
  gl_FragColor = vec4(uCol * (1.0 - uDim), clamp(a, 0.0, 1.0));
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
      float vig = smoothstep(0.9, 0.2, length(q * vec2(1.0, 1.25)));
      c.rgb *= mix(0.62, 1.0, vig);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.16);
      c.rgb += vec3(0.0, 0.006, 0.02) * (1.0 - l);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 1.0, 0.95), smoothstep(0.5, 1.0, l));
      c.rgb += (h(vUv * 800.0 + uTime) - 0.5) * 0.02;
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
  private terrain: THREE.ShaderMaterial[] = [];
  /** how far the scenery is darkened while the light gathers into the pack (shared by every scenery shader) */
  private dimU = { value: 0 };
  private dim = 0;
  private mists: THREE.Mesh[] = [];
  private bokeh: THREE.Points;
  private flies: THREE.Points;
  private grade: ShaderPass;
  private reflection: THREE.Mesh;
  private raf = 0;
  private last = 0;
  private clock = -1;
  private slow = 0;
  private frameSum = 0;
  private frames = 0;
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
  /** timeline position the cinema waits at until the pack is launched (null = running) */
  private hold: number | null = null;
  /** the launched pack, climbing as a star */
  private rise: { from: THREE.Vector3; t0: number } | null = null;
  private riseCore!: THREE.Sprite;
  private riseHalo!: THREE.Sprite;
  private riseExtra: { to: THREE.Vector3; delay: number; core: THREE.Sprite; halo: THREE.Sprite }[] = [];
  private headTex!: THREE.Texture;
  private glowTex!: THREE.Texture;
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
    this.color = new THREE.Color(opts.god ? OMEN_COLORS[2] : OMEN_COLORS[opts.tier]);
    this.auraTier = opts.tier;
    this.auraColor.copy(this.color);
    const rainbow = opts.tier === 3;

    const lite = liteFx();
    this.renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: false, powerPreference: 'high-performance' });
    // the scene is soft and bloomed, so 1x is plenty; drops further if frames get slow
    this.renderer.setPixelRatio(lite ? 0.65 : 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.65, 0.5);
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
          uDim: this.dimU,
          uMoonDir: { value: MOON_DIR.clone() },
          uLite: { value: lite ? 1 : 0 },
          uDawn: { value: 0 },
          uSunDir: { value: new THREE.Vector3(-0.04, 0.035, -1).normalize() },
        },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.scene.add(this.sky);

    // stars (and their reflection)
    const N = lite ? 1800 : 4800;
    const sp = new Float32Array(N * 3);
    const ss = new Float32Array(N);
    const sph = new Float32Array(N);
    const sc = new Float32Array(N * 3);
    const warm = new THREE.Color('#ffe8c4');
    const cool = new THREE.Color('#c8dcff');
    const bandN = new THREE.Vector3(0.7, 0.8, 0.6).normalize();
    for (let i = 0; i < N; i++) {
      let dir = new THREE.Vector3();
      for (let tries = 0; tries < 40; tries++) {
        const yy = Math.pow(Math.random(), 0.8) * 0.97 + 0.03;
        const th0 = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(1 - yy * yy);
        dir.set(Math.cos(th0) * rr, yy, Math.sin(th0) * rr);
        // two in five stars are drawn toward the milky way band
        if (i % 5 > 1 || Math.random() < Math.exp(-Math.pow(dir.dot(bandN), 2) * 12)) break;
      }
      sp.set([dir.x * 800, dir.y * 800, dir.z * 800], i * 3);
      ss[i] = Math.random() < 0.035 ? 6 + Math.random() * 6 : 1.2 + Math.pow(Math.random(), 3) * 3;
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
    this.starsMirror.renderOrder = -30;
    this.scene.add(this.starsMirror);

    // terrain wraps the lake: snow ranges far → near, then a shore of pines. Each layer is
    // mirrored below the horizon so the water reflects it. (They write depth, so stars,
    // meteors and the moon pass behind them.)
    const cyl = (r: number) => new THREE.CylinderGeometry(r, r, r * 0.9, 256, 1, true);
    const mats: THREE.ShaderMaterial[] = [];
    const layer = (r: number, frag: string, uniforms: Record<string, THREE.IUniform>, order: number) => {
      const make = (mirror: boolean) => {
        const mat = new THREE.ShaderMaterial({
          vertexShader: TERRAIN_VERT,
          fragmentShader: frag,
          uniforms: { ...Object.fromEntries(Object.entries(uniforms).map(([k, v]) => [k, { value: (v.value as { clone?: () => unknown }).clone ? (v.value as { clone: () => unknown }).clone() : v.value }])), uMirror: { value: mirror ? 1 : 0 }, uTime: { value: 0 }, uDawn: { value: 0 }, uDim: this.dimU },
          side: mirror ? THREE.DoubleSide : THREE.BackSide,
          transparent: mirror,
          depthWrite: !mirror,
        });
        mats.push(mat);
        const m = new THREE.Mesh(cyl(r), mat);
        m.position.y = mirror ? -r * 0.45 : r * 0.45;
        if (mirror) m.scale.y = -1;
        // scenery is drawn first: the mirrored layers, then the mist; light effects (default order) always land on top
        m.renderOrder = mirror ? order - 20 : order;
        this.scene.add(m);
      };
      make(false);
      make(true);
    };
    const C = (hex: string) => new THREE.Color(hex);
    const ridge = (r: number, seed: number, scale: number, height: number, rock: string, haze: number, hazeCol: string, snow: number, order: number) =>
      layer(r, RIDGE_FRAG, { uSeed: { value: seed }, uScale: { value: scale }, uHeight: { value: height }, uColor: { value: C(rock) }, uHazeCol: { value: C(hazeCol) }, uHaze: { value: haze }, uSnow: { value: snow } }, order);
    ridge(520, 1, 2.3, 0.3, '#2c3b85', 0.5, '#3a3f86', 1.0, 1);
    ridge(380, 7, 3.1, 0.2, '#131d52', 0.32, '#202768', 0.8, 2);
    ridge(260, 13, 4.2, 0.12, '#040a20', 0.16, '#0b1230', 0.3, 3);
    layer(170, FOREST_FRAG, { uSeed: { value: 3 }, uHeight: { value: 0.2 }, uColor: { value: C('#02070f') } }, 4);
    this.terrain = mats;
    // mist between the ranges
    for (const [r, amt, col, seed] of [[450, 0.62, '#6a75bd', 1], [320, 0.5, '#434e96', 5], [215, 0.38, '#1f2a5a', 9]] as [number, number, string, number][]) {
      const mist = new THREE.Mesh(
        cyl(r),
        new THREE.ShaderMaterial({
          vertexShader: TERRAIN_VERT,
          fragmentShader: MIST_FRAG,
          uniforms: { uTime: { value: 0 }, uCol: { value: C(col) }, uAmt: { value: amt }, uSeed: { value: seed }, uDim: this.dimU },
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
        }),
      );
      mist.position.y = r * 0.45;
      mist.renderOrder = -5;
      this.scene.add(mist);
      this.mists.push(mist);
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
    this.headTex = headTex;
    this.glowTex = glowTex;
    this.hold = opts.holdAt ?? null;

    // meteors: one per card. The main one (best card) dives; the rest fall
    // away from a shared radiant like a real meteor shower.
    const god = !!opts.god;
    let tiers = opts.meteors.length ? opts.meteors : [opts.tier];
    // god pack: every meteor gold, and a golden rain on top
    if (god) tiers = [...tiers.map((t): OmenTier => (t === 3 ? 3 : 2)), ...Array.from({ length: lite ? 10 : 26 }, (): OmenTier => 2)];
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
      L_IMPACT,
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
    this.color = new THREE.Color(god ? OMEN_COLORS[2] : OMEN_COLORS[tiers[0]]);

    // the launched pack as a climbing star (and, for a bundle, its companions)
    this.riseCore = this.riseSprite(1, false);
    this.riseHalo = this.riseSprite(0.8, true);

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
        uniforms: { uTime: { value: 0 }, uAmt: { value: 0.4 } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.aurora.position.y = 200;
    this.aurora.rotation.y = 1.2;
    this.scene.add(this.aurora);

    // moon: the disc and its halo are painted in the sky shader (so clouds drift across it);
    // these sprites only add the soft bloom around it
    this.moon = new THREE.Group();
    const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fb4ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4 }));
    moonHalo.scale.setScalar(210);
    const ringTexM = radialTexture([
      [0, 'rgba(0,0,0,0)'],
      [0.6, 'rgba(150,175,255,0)'],
      [0.68, 'rgba(175,195,255,0.22)'],
      [0.76, 'rgba(150,175,255,0)'],
      [1, 'rgba(0,0,0,0)'],
    ], 256);
    this.textures.push(ringTexM);
    const moonRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexM, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    moonRing.scale.setScalar(160);
    this.moon.add(moonHalo, moonRing);
    this.moon.position.copy(MOON_DIR.clone().multiplyScalar(700));
    this.scene.add(this.moon);

    // fireflies over the water, and a few big soft out-of-focus lights close to the lens
    const flyPoints = (count: number, area: { x: number; y: [number, number]; z: [number, number] }, size: number, max: number, hue: [number, number], light: number, alpha: number) => {
      const fp = new Float32Array(count * 3);
      const fa = new Float32Array(count);
      const fc = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        fp.set([rnd(-area.x, area.x), rnd(area.y[0], area.y[1]), rnd(area.z[0], area.z[1])], k * 3);
        fa[k] = Math.random();
        const c = new THREE.Color().setHSL(rnd(hue[0], hue[1]), 0.9, light);
        fc.set([c.r, c.g, c.b], k * 3);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
      fg.setAttribute('aAlpha', new THREE.BufferAttribute(fa, 1));
      fg.setAttribute('aColor', new THREE.BufferAttribute(fc, 3));
      const pts = new THREE.Points(
        fg,
        new THREE.ShaderMaterial({
          vertexShader: /* glsl */ `
          attribute float aAlpha; attribute vec3 aColor; uniform float uTime; uniform float uPx; uniform float uSize; uniform float uMax; uniform float uBase;
          varying float vA; varying vec3 vC;
          void main(){
            vec3 p = position;
            p.x += sin(uTime * 0.4 + aAlpha * 30.0) * 0.8;
            p.y += sin(uTime * 0.6 + aAlpha * 17.0) * 0.4 + mod(uTime * 0.05 * (0.3 + aAlpha), 1.0) * 0.6;
            vA = pow(0.5 + 0.5 * sin(uTime * (1.0 + aAlpha) + aAlpha * 50.0), 3.0) * uBase + (1.0 - uBase) * 0.55;
            vC = aColor;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = uPx * clamp(uSize / -mv.z, 1.5, uMax);
            gl_Position = projectionMatrix * mv;
          }`,
          fragmentShader: /* glsl */ `
          varying float vA; varying vec3 vC;
          void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); float a = (exp(-r * 20.0) + smoothstep(0.25, 0.2, r) * 0.0) * vA * ${alpha.toFixed(2)}; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }`,
          uniforms: { uTime: { value: 0 }, uPx: { value: this.renderer.getPixelRatio() }, uSize: { value: size }, uMax: { value: max }, uBase: { value: alpha > 0.5 ? 1 : 0 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      pts.frustumCulled = false;
      this.scene.add(pts);
      return pts;
    };
    this.flies = flyPoints(lite ? 90 : 300, { x: 40, y: [-0.8, 5], z: [-70, -7] }, 190, 16, [0.13, 0.2], 0.72, 1);
    this.bokeh = flyPoints(lite ? 8 : 22, { x: 16, y: [0, 9], z: [-34, -7] }, 380, 70, [0.5, 0.62], 0.62, 0.3);

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
    // development only: jump the timeline (for screenshots)
    if (import.meta.env.DEV) (window as unknown as { __cine?: unknown }).__cine = { seek: (x: number) => void (this.offset += x - this.time()) };
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
    if (this.done || this.hold !== null) return;
    this.offset += T_DONE - this.time();
  }

  /**
   * the pack has been swiped up from (x, y): the timeline runs on, and the pack
   * becomes a star that climbs into the sky — and comes back as the meteor.
   * `count` > 1 (a bundle) sends extra lights up toward the shower's radiant.
   */
  release(x: number, y: number, count = 1) {
    if (this.hold === null) return;
    this.camera.updateMatrixWorld();
    const from = this.camera.localToWorld(this.screenToCamera(x, y, 9));
    this.rise = { from, t0: this.hold };
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    for (let k = 1; k < Math.min(count, 10); k++) {
      const to = new THREE.Vector3(240, 300, -420).add(new THREE.Vector3(rnd(-200, 40), rnd(-120, 20), rnd(-30, 50)));
      this.riseExtra.push({ to, delay: k * 0.06 + rnd(0, 0.05), core: this.riseSprite(0.55, false), halo: this.riseSprite(0.3, true) });
    }
    this.offset += this.hold - this.time();
    this.hold = null;
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

  private riseSprite(opacity: number, halo: boolean) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: halo ? this.glowTex : this.headTex, color: halo ? this.color : 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }),
    );
    sp.userData.max = opacity;
    sp.visible = false;
    this.scene.add(sp);
    return sp;
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
    if (!this.done && raw < 0.5) {
      this.frameSum += raw;
      this.frames++;
    }
    // while held, the timeline stands still but the night keeps moving
    if (this.hold !== null) this.offset -= dt;
    const t = this.time();
    /** ambient clock: clouds, stars, fireflies — never held, never skipped */
    const amb = this.clock;
    (window as unknown as { __cineT?: number }).__cineT = t;
    const Tr = Math.min(t, T_DONE);
    /** time relative to the first meteor (negative during the quiet opening) */
    const T = Tr - T0;

    const skyU = (this.sky.material as THREE.ShaderMaterial).uniforms;
    skyU.uTime.value = amb;
    (this.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = amb;
    (this.starsMirror.material as THREE.ShaderMaterial).uniforms.uTime.value = amb;
    (this.aurora.material as THREE.ShaderMaterial).uniforms.uTime.value = amb;
    (this.flies.material as THREE.ShaderMaterial).uniforms.uTime.value = amb;
    (this.bokeh.material as THREE.ShaderMaterial).uniforms.uTime.value = amb;
    for (const m of this.terrain) m.uniforms.uTime.value = amb;
    for (const m of this.mists) (m.material as THREE.ShaderMaterial).uniforms.uTime.value = amb;
    this.grade.uniforms.uTime.value = amb;
    const camPos = this.camera.position;

    // ---------------- camera ----------------
    const look = new THREE.Vector3();
    const up1 = easeInOut(smooth(0, 1.6, T));
    // the opening: begin just above the water and lift the gaze to the horizon
    const intro = 1 - easeInOut(smooth(0, T0, Tr));
    look.set(-30 * up1 + intro * 14, 4 + 150 * up1 - intro * 20, -300);
    const main = this.meteors[0];
    const follow = smooth(1.7, 2.35, T);
    if (follow > 0) look.lerp(main.path.getPointAt(this.meteorS(main, Math.min(T, main.t1))), follow * 0.8);
    const settle = smooth(L_IMPACT - 0.05, L_IMPACT + 0.9, T);
    if (settle > 0) look.lerp(new THREE.Vector3(0, 1.2, -60), easeInOut(settle));
    camPos.set(Math.sin(amb * 0.37) * 0.08 - intro * 0.5, 1.4 + Math.sin(amb * 0.53) * 0.05 - intro * 0.35, 7.8 - 3.0 * smooth(0, T_DONE, Tr));
    const sinceImpact = T - L_IMPACT;
    const shake = sinceImpact >= 0 ? Math.max(0, 1 - sinceImpact / 0.5) : 0;
    if (shake > 0) {
      const s = this.shakeSeed + t * 55;
      camPos.x += Math.sin(s * 1.7) * 0.12 * shake;
      camPos.y += Math.sin(s * 2.3) * 0.09 * shake;
    }
    // ---------------- the launched pack climbs as a star ----------------
    const sky = this.meteors[0].path.getPointAt(0);
    if (this.rise) {
      const { from, t0 } = this.rise;
      const climb = easeOutCubic(smooth(t0, t0 + 1.7, t));
      // an arc: up first, then out toward its place in the sky
      const ctl = new THREE.Vector3(from.x * 0.5 + sky.x * 0.15, sky.y * 0.55, from.z * 0.4 + sky.z * 0.6);
      const a = from.clone().lerp(ctl, climb);
      const pos = a.lerp(ctl.clone().lerp(sky, climb), climb);
      const d = pos.distanceTo(camPos);
      const arrived = smooth(t0 + 1.5, t0 + 1.8, t);
      // "kira": the star flares once in place before it falls
      const flareAt = Math.max(t0 + 2.0, T0 + 0.45);
      if (t >= flareAt) this.beat('twinkle');
      const flare = Math.exp(-Math.pow((t - flareAt - 0.12) * 5.5, 2));
      const vis = smooth(t0 + 0.12, t0 + 0.4, t) * (1 - smooth(T0 + 0.95, T0 + 1.05, t));
      const tw = 1 + Math.sin(amb * 9) * 0.12 * arrived;
      this.riseCore.visible = this.riseHalo.visible = vis > 0.001;
      this.riseCore.position.copy(pos);
      this.riseHalo.position.copy(pos);
      this.riseCore.scale.setScalar(d * (0.05 - 0.026 * climb) * tw * (1 + flare * 1.6));
      this.riseHalo.scale.setScalar(d * (0.22 - 0.11 * climb) * tw * (1 + flare * 2.2));
      (this.riseCore.material as THREE.SpriteMaterial).opacity = vis;
      (this.riseHalo.material as THREE.SpriteMaterial).opacity = vis * 0.85;
      if (vis > 0 && climb < 0.98 && Math.random() < 0.8) this.emit(pos, 1, d * 0.012, -0.6);
      // the camera lifts its gaze after it
      const seek = smooth(t0, t0 + 0.6, t) * (1 - smooth(T0 + 1.6, T0 + 2.2, t));
      look.lerp(pos.clone().lerp(new THREE.Vector3(-30, 60, -300), 0.35), seek * 0.75);
      for (const e of this.riseExtra) {
        const k = easeOutCubic(smooth(t0 + e.delay, t0 + e.delay + 1.5, t));
        const p = from.clone().lerp(new THREE.Vector3(from.x, e.to.y * 0.5, (from.z + e.to.z) / 2), k).lerp(e.to, k * k);
        const ev = smooth(t0 + e.delay + 0.1, t0 + e.delay + 0.35, t) * (1 - smooth(T0 + 0.7, T0 + 1.0, t));
        const dd = p.distanceTo(camPos);
        e.core.visible = e.halo.visible = ev > 0.001;
        e.core.position.copy(p);
        e.halo.position.copy(p);
        e.core.scale.setScalar(dd * (0.03 - 0.02 * k));
        e.halo.scale.setScalar(dd * (0.11 - 0.07 * k));
        (e.core.material as THREE.SpriteMaterial).opacity = ev * (e.core.userData.max as number);
        (e.halo.material as THREE.SpriteMaterial).opacity = ev * (e.halo.userData.max as number);
      }
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
      const dive = m.main ? smooth(1.9, L_IMPACT, T) : 0;
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
    skyU.uTintAmt.value = smooth(1.0, 1.8, T) * (1 - smooth(L_IMPACT, L_IMPACT + 1.4, T)) * (0.5 + this.opts.tier * 0.35);
    const toImpact = this.IMPACT.clone().sub(camPos).normalize();
    skyU.uGlowDir.value.copy(toImpact);
    skyU.uGlowAmt.value = smooth(2.2, L_IMPACT, T) * (1 - smooth(L_IMPACT + 0.3, L_IMPACT + 1.4, T)) * 1.2;
    // god pack: night turns to dawn after the impact (and stays while the pack waits)
    if (this.opts.god) {
      const dawn = easeInOut(smooth(T_IMPACT + 0.15, T_IMPACT + 2.1, t));
      skyU.uDawn.value = dawn;
      for (const m of this.terrain) m.uniforms.uDawn.value = dawn;
    }

    // ---------------- impact ----------------
    if (T >= L_IMPACT && !this.beats.has('impact')) {
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
      const rise = easeInOut(smooth(L_IMPACT + 0.08, L_IMPACT + 1.0, T));
      const pos = this.IMPACT.clone().lerp(this.camera.localToWorld(orbCam.clone()), rise);
      const d = pos.distanceTo(camPos);
      const pulse = 1 + Math.sin(t * 7) * 0.05;
      this.orbCore.position.copy(pos);
      this.orbHalo.position.copy(pos);
      const vanish = smooth(3.7, 4.0, T);
      coreMat.opacity = smooth(L_IMPACT + 0.05, L_IMPACT + 0.3, T) * (1 - vanish);
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

    {
      // the scenery darkens as the light gathers, so the pack's light stays clean against it
      const target = this.done && this.idle ? (this.opts.god ? 0.25 : 0.5) : 0.72 * smooth(L_IMPACT + 0.5, L_IMPACT + 1.6, T);
      this.dim += (target - this.dim) * Math.min(1, dt * 4);
      this.dimU.value = this.dim;
      const k = 1 - this.dim * 0.85;
      const dawnV = this.opts.god ? easeInOut(smooth(T_IMPACT + 0.15, T_IMPACT + 2.1, t)) : 0;
      const dawnK = 1 - dawnV * 0.9;
      (this.aurora.material as THREE.ShaderMaterial).uniforms.uAmt.value = 0.4 * (1 - dawnV) * (1 - this.dim);
      this.moon.children.forEach((c, i) => (((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = (i === 0 ? 0.4 : 0.8) * (1 - dawnV * 0.85) * (1 - this.dim * 0.85)));
      (this.stars.material as THREE.ShaderMaterial).uniforms.uDim.value = dawnK * k;
      (this.starsMirror.material as THREE.ShaderMaterial).uniforms.uDim.value = 0.22 * dawnK * k;
    }
    this.bloom.strength = 0.8 + (sinceImpact >= 0 ? Math.max(0, 0.9 * (1 - sinceImpact / 0.6)) : 0) + smooth(3.85, 4.3, T) * (1 - smooth(T_DONE, T_DONE + 0.5, t)) * 0.15;

    if (Tr >= T_DONE && !this.done) {
      this.done = true;
      // remember slow devices so the next opening starts light (auto mode)
      if (this.frames > 20) reportFrameTime((this.frameSum / this.frames) * 1000);
      this.opts.onDone();
    }
    this.composer.render();
  };
}
