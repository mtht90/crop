// 軽量なパーティクル (火花・血しぶき・砂ぼこり・焚き火・地表の霧)。
// CPU で位置を更新し、1 つの Points でまとめて描く。
import * as THREE from 'three';

export function softDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `
uniform sampler2D map;
uniform sampler2D uVisTex;
uniform vec2 uMapSize;
uniform float uVisOn;
uniform float uUseVis;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  float a = texture2D(map, gl_PointCoord).a * vAlpha;
  // 視界の外では薄くする (霧の中の演出が見えすぎないように)
  if (uUseVis > 0.5 && uVisOn > 0.5) a *= mix(0.1, 1.0, texture2D(uVisTex, vWorld.xz / uMapSize).r);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <fog_fragment>
}`;

export class Particles {
  constructor(max, { additive = false, texture, fog = false, vis = null } = {}) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);
    this.grow = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        map: { value: texture },
        uScale: { value: 800 },
        // 視界マスクは world3d と同じ uniform オブジェクトを共有する
        uVisTex: vis ? vis.uVisTex : { value: null },
        uMapSize: vis ? vis.uMapSize : { value: new THREE.Vector2(1, 1) },
        uVisOn: vis ? vis.uVisOn : { value: 0 },
        uUseVis: { value: vis ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 7 : 6;
    const v = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(v);
      mat.uniforms.uScale.value = v.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
    };
  }

  emit(p) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = p.vx || 0;
    this.vel[i * 3 + 1] = p.vy || 0;
    this.vel[i * 3 + 2] = p.vz || 0;
    const c = p.color || [1, 1, 1];
    this.col[i * 3] = c[0];
    this.col[i * 3 + 1] = c[1];
    this.col[i * 3 + 2] = c[2];
    this.life[i] = p.life || 1;
    this.age[i] = 0;
    this.gravity[i] = p.gravity || 0;
    this.drag[i] = p.drag || 0;
    this.baseSize[i] = p.size || 0.1;
    this.baseAlpha[i] = p.alpha ?? 1;
    this.grow[i] = p.grow || 0;
    this.size[i] = this.baseSize[i];
    this.alpha[i] = this.baseAlpha[i];
  }

  // 末尾と入れ替えて詰める
  kill(i) {
    const j = --this.count;
    if (i === j) return;
    for (const [arr, n] of [
      [this.pos, 3],
      [this.vel, 3],
      [this.col, 3],
    ]) {
      for (let k = 0; k < n; k++) arr[i * n + k] = arr[j * n + k];
    }
    for (const arr of [this.life, this.age, this.gravity, this.drag, this.baseSize, this.baseAlpha, this.grow, this.size, this.alpha])
      arr[i] = arr[j];
  }

  update(dt) {
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      const t = this.age[i] / this.life[i];
      const drag = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3 + 1] += this.gravity[i] * dt;
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= drag;
        this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      }
      if (this.pos[i * 3 + 1] < 0.02 && this.gravity[i] < 0) {
        // 地面に落ちたら止まる
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0;
      }
      this.size[i] = this.baseSize[i] * Math.max(0.05, 1 + this.grow[i] * t);
      // 長寿命 (霧) は一定、短命なものは消えていく
      this.alpha[i] = this.life[i] > 1e6 ? this.baseAlpha[i] : this.baseAlpha[i] * (1 - t * t);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.count);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}
