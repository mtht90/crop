// 演出:パーティクル・衝撃波リング・ダメージ数字・地面の予兆表示
import * as THREE from 'three';
import { rand, TAU } from '../core/util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color();

export class Particles {
  constructor(scene, cap = 3000) {
    this.cap = cap;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = [];
    for (let i = 0; i < cap; i++) this.p.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.2, r: 1, g: 1, b: 1, rot: 0, grav: 1, drag: 0 });
    this.n = 0;
  }
  emit(x, y, z, count, color, { speed = 6, up = 4, size = 0.22, life = 0.6, grav = 14, spread = 1, glow = 1, drag = 1.5 } = {}) {
    _c.set(color);
    for (let i = 0; i < count; i++) {
      if (this.n >= this.cap) return;
      const p = this.p[this.n++];
      const a = Math.random() * TAU, sp = speed * (0.35 + Math.random() * 0.65) * spread;
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = up * (0.4 + Math.random() * 0.8);
      p.life = p.max = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.7);
      p.r = _c.r * glow; p.g = _c.g * glow; p.b = _c.b * glow;
      p.rot = Math.random() * 6; p.grav = grav; p.drag = drag;
    }
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      const p = this.p[i];
      p.life -= dt;
      if (p.life <= 0) { const last = this.p[--this.n]; this.p[this.n] = p; this.p[i] = last; continue; }
      p.vy -= p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.4; p.vx *= 0.7; p.vz *= 0.7; }
      p.rot += dt * 8;
      i++;
    }
    for (let k = 0; k < this.n; k++) {
      const p = this.p[k];
      const s = p.size * Math.min(1, (p.life / p.max) * 2);
      _e.set(p.rot, p.rot * 0.7, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(k, _m);
      this.mesh.instanceColor.setXYZ(k, p.r, p.g, p.b);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}

// 広がる輪/球/柱(加算合成)
export class Rings {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.geos = {
      ring: new THREE.RingGeometry(0.85, 1, 40),
      disc: new THREE.CircleGeometry(1, 32),
      sphere: new THREE.IcosahedronGeometry(1, 2),
      pillar: new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
      line: new THREE.PlaneGeometry(1, 1),
    };
  }
  get(kind) {
    let m = this.pool.find((o) => o.userData.kind === kind);
    if (m) this.pool.splice(this.pool.indexOf(m), 1);
    else {
      m = new THREE.Mesh(this.geos[kind], new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.userData.kind = kind;
    }
    this.scene.add(m);
    return m;
  }
  // kind: ring/disc/sphere/pillar/line
  spawn(kind, x, z, { color = '#fff', r0 = 0.5, r1 = 4, life = 0.4, opacity = 0.9, y = 0.08, height = 6, follow = null, rotY = 0, len = 1, ease = 'out', fadeIn = 0, w = 1 } = {}) {
    const m = this.get(kind);
    m.material.color.set(color);
    m.material.opacity = opacity;
    m.position.set(x, y, z);
    m.rotation.set(kind === 'ring' || kind === 'disc' || kind === 'line' ? -Math.PI / 2 : 0, 0, 0);
    if (kind === 'line') { m.rotation.set(-Math.PI / 2, 0, rotY); }
    const fx = { m, kind, r0, r1, life, max: life, opacity, height, follow, len, ease, fadeIn, w };
    this.active.push(fx);
    this.apply(fx, 0);
    return fx;
  }
  apply(fx, t) {
    const k = fx.ease === 'out' ? 1 - Math.pow(1 - t, 3) : fx.ease === 'lin' ? t : t * t;
    const r = fx.r0 + (fx.r1 - fx.r0) * k;
    const m = fx.m;
    if (fx.kind === 'pillar') { m.scale.set(r, fx.height, r); m.position.y = fx.height / 2; }
    else if (fx.kind === 'line') m.scale.set(fx.w, fx.len, 1);
    else m.scale.set(r, r, r);
    const fade = fx.fadeIn ? Math.min(1, t / fx.fadeIn) * (t > 0.85 ? (1 - t) / 0.15 : 1) : 1 - t;
    m.material.opacity = fx.opacity * fade;
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life -= dt;
      if (fx.follow) { fx.m.position.x = fx.follow.x; fx.m.position.z = fx.follow.z; }
      if (fx.life <= 0) { this.scene.remove(fx.m); this.pool.push(fx.m); this.active.splice(i, 1); continue; }
      this.apply(fx, 1 - fx.life / fx.max);
    }
  }
  clear() { for (const fx of this.active) { this.scene.remove(fx.m); this.pool.push(fx.m); } this.active.length = 0; }
}

// ダメージ数字(2Dキャンバスに描画)
export class Numbers {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.list = [];
    this.v = new THREE.Vector3();
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cv.width = innerWidth * dpr; this.cv.height = innerHeight * dpr;
  }
  add(x, y, z, text, { color = '#fff', size = 18, crit = false, life = 0.7 } = {}) {
    if (this.list.length > 140) this.list.shift();
    this.list.push({ x: x + rand(-0.3, 0.3), y, z: z + rand(-0.3, 0.3), text, color, size, crit, life, max: life, vy: crit ? 5 : 3.5 });
  }
  update(dt, camera, enabled = true) {
    const c = this.ctx, dpr = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      n.life -= dt;
      if (n.life <= 0) { this.list.splice(i, 1); continue; }
      n.y += n.vy * dt; n.vy *= Math.exp(-4 * dt);
      if (!enabled && !n.always) continue;
      this.v.set(n.x, n.y, n.z).project(camera);
      if (this.v.z > 1) continue;
      const sx = (this.v.x * 0.5 + 0.5) * innerWidth, sy = (-this.v.y * 0.5 + 0.5) * innerHeight;
      const t = 1 - n.life / n.max;
      const pop = t < 0.15 ? 1 + (0.15 - t) * (n.crit ? 6 : 3) : 1;
      const a = n.life < 0.2 ? n.life / 0.2 : 1;
      c.globalAlpha = a;
      c.font = `900 ${Math.round(n.size * pop)}px "EW Rounded", sans-serif`;
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(20,10,30,0.85)';
      c.strokeText(n.text, sx, sy);
      c.fillStyle = n.color;
      c.fillText(n.text, sx, sy);
    }
    c.globalAlpha = 1;
  }
  clear() { this.list.length = 0; }
}
