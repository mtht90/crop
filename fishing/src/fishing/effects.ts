import * as THREE from 'three';

interface Drop {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
}

interface Ripple {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  life: number;
  max: number;
  size: number;
}

/**
 * 波紋：輪を描くのではなく、広がっていく小さな波の列（山は空を映して明るく、谷は暗い）を
 * 薄く重ねる。時間とともに広がり、波長が伸び、弱まって消える。
 */
const RIPPLE_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RIPPLE_FRAG = `
uniform float uT;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float front = 0.12 + 0.88 * sqrt(uT);
  // 先頭の少し内側に数本の波が続く
  float d = front - r;
  float env = smoothstep(0.0, 0.05, d) * exp(-d * d * 18.0) * smoothstep(1.0, 0.85, r);
  float wave = sin(d * (60.0 - 30.0 * uT));
  float fade = (1.0 - uT) * (1.0 - uT);
  float a = abs(wave) * env * fade * uStrength;
  vec3 col = wave > 0.0 ? vec3(0.86, 0.92, 0.95) : vec3(0.05, 0.09, 0.1);
  gl_FragColor = vec4(col, a * (wave > 0.0 ? 0.35 : 0.22));
}`;

function dropTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(235,245,250,0.7)');
  grad.addColorStop(1, 'rgba(235,245,250,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 水しぶきと波紋 */
export class WaterEffects {
  private drops: Drop[] = [];
  private points: THREE.Points;
  private posArr: Float32Array;
  private ripples: Ripple[] = [];
  private rippleGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  private readonly MAX = 600;

  constructor(private scene: THREE.Scene) {
    this.posArr = new Float32Array(this.MAX * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0xdfeaee,
        size: 0.045,
        map: typeof document !== 'undefined' ? dropTexture() : null,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  splash(x: number, z: number, size: number): void {
    const n = Math.min(120, Math.floor(8 + size * 45));
    for (let i = 0; i < n && this.drops.length < this.MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      // 細かい飛沫ほど高く速く、大粒は低い
      const fine = Math.random();
      const sp = (0.4 + fine * 1.6) * (0.5 + size * 0.7);
      const life = 0.4 + Math.random() * 0.5;
      this.drops.push({
        p: new THREE.Vector3(x + Math.cos(a) * 0.08 * size, 0.03, z + Math.sin(a) * 0.08 * size),
        v: new THREE.Vector3(Math.cos(a) * sp * 0.4, (1.2 + fine * 2.5) * (0.4 + size * 0.6), Math.sin(a) * sp * 0.4),
        life,
        max: life,
      });
    }
    this.ripple(x, z, size);
    if (size > 0.25) this.ripple(x, z, size * 0.6, 0.25);
  }

  /** 空中の物（釣り上げた魚など）から滴る水 */
  drip(p: THREE.Vector3, n: number, spread: number): void {
    for (let i = 0; i < n && this.drops.length < this.MAX; i++) {
      const life = 0.4 + Math.random() * 0.5;
      this.drops.push({
        p: new THREE.Vector3(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread * 0.5, p.z + (Math.random() - 0.5) * spread),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8),
        life,
        max: life,
      });
    }
  }

  /** delay 秒後から広がり始める */
  ripple(x: number, z: number, size: number, delay = 0): void {
    if (this.ripples.length > 40) return;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uStrength: { value: Math.min(1, 0.45 + size) } },
      vertexShader: RIPPLE_VERT,
      fragmentShader: RIPPLE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.rippleGeo, mat);
    mesh.position.set(x, 0.02, z);
    mesh.renderOrder = 2;
    mesh.visible = false;
    this.scene.add(mesh);
    this.ripples.push({ mesh, mat, life: -delay, max: 1.8 + size * 1.5, size: 0.5 + size * 2.2 });
  }

  update(dt: number): void {
    let k = 0;
    for (const d of this.drops) {
      d.life -= dt;
      if (d.life <= 0 || d.p.y < -0.05) continue;
      d.v.y -= 9.8 * dt;
      d.p.addScaledVector(d.v, dt);
      this.posArr[k * 3] = d.p.x;
      this.posArr[k * 3 + 1] = d.p.y;
      this.posArr[k * 3 + 2] = d.p.z;
      this.drops[k++] = d;
    }
    this.drops.length = k;
    this.points.geometry.setDrawRange(0, k);
    this.points.geometry.getAttribute('position').needsUpdate = true;

    this.ripples = this.ripples.filter((r) => {
      r.life += dt;
      const t = r.life / r.max;
      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.mat.dispose();
        return false;
      }
      r.mesh.visible = t > 0;
      r.mesh.scale.setScalar(r.size);
      r.mat.uniforms.uT.value = Math.max(0, t);
      return true;
    });
  }
}
