// 画面シェイク / 端末振動 / メダル物理 / 火花パーティクル / 画面フラッシュ
import * as THREE from 'three';

export class Haptics {
  constructor(cfg) { this.cfg = cfg; }
  vibrate(name) {
    if (!this.cfg.effects.haptics) return;
    const pat = this.cfg.effects.vibrate[name] || name;
    try { navigator.vibrate?.(pat); } catch { /* unsupported */ }
  }
}

export class Shaker {
  constructor(cfg) { this.cfg = cfg; this.trauma = 0; this.t = 0; this.kick = new THREE.Vector3(); }
  add(amount) { this.trauma = Math.min(1.2, this.trauma + amount); }
  // 物理的な“ドン”: 一方向へのキック
  punch(x, y, z) { this.kick.add(new THREE.Vector3(x, y, z)); }
  apply(camera, base, dt) {
    this.t += dt;
    const s = this.cfg.effects.shake;
    this.trauma = Math.max(0, this.trauma - s.decay * dt);
    this.kick.multiplyScalar(Math.exp(-dt * 14));
    const k = this.trauma * this.trauma;
    const n = (f, o) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.3 + o * 1.7) * 0.4;
    camera.position.copy(base.pos).add(new THREE.Vector3(n(37, 1) * s.maxOffset * k, n(41, 2) * s.maxOffset * k, 0)).add(this.kick);
    camera.lookAt(base.target);
    camera.rotation.z += n(29, 3) * s.maxRoll * k;
  }
}

// メダル (Kenney coin-gold.glb) の簡易物理
export class Coins {
  constructor(scene, coinScene, tray, max = 260) {
    this.tray = tray;
    let geo = null, mat = null;
    coinScene?.traverse((o) => { if (o.isMesh && !geo) { geo = o.geometry.clone(); mat = o.material; } });
    if (!geo) { geo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 24); mat = new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 1, roughness: 0.25 }); }
    geo.computeBoundingBox();
    const bb = geo.boundingBox, size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    const c = new THREE.Vector3(); bb.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    geo.scale(0.026 / size, 0.026 / size, 0.026 / size);
    mat = mat.clone();
    mat.metalness = 1; mat.roughness = 0.22; mat.envMapIntensity = 1.6;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.max = max;
    this.items = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.sc = new THREE.Vector3(1, 1, 1);
    scene.add(this.mesh);
    this.mesh.count = 0;
  }

  spawn(n, origin, spread = 1) {
    for (let i = 0; i < n; i++) {
      if (this.items.length >= this.max) this.items.shift();
      this.items.push({
        p: origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, 0)),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.6 * spread, (Math.random() * 0.8 + 0.2) * spread, 0.5 + Math.random() * 0.6 * spread),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
        life: 6 + Math.random() * 3,
      });
    }
  }

  // ボーナス時の噴水 (画面手前へ飛び散る)
  burst(n, origin) {
    for (let i = 0; i < n; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const a = Math.random() * Math.PI * 2;
      this.items.push({
        p: origin.clone(),
        v: new THREE.Vector3(Math.cos(a) * (0.5 + Math.random()), 1.6 + Math.random() * 1.6, 0.8 + Math.random() * 1.4),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0),
        w: new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0),
        life: 2.5 + Math.random(), free: true,
      });
    }
  }

  update(dt) {
    const T = this.tray;
    let i = 0;
    for (const c of this.items) {
      c.life -= dt;
      c.v.y -= 9.8 * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.addScaledVector(c.w, dt);
      const inTray = !c.free && c.p.x > T.x0 && c.p.x < T.x1 && c.p.z > T.z0 - 0.05;
      if (inTray) {
        if (c.p.z > T.z1 - 0.012) { c.p.z = T.z1 - 0.012; c.v.z *= -0.4; }
        if (c.p.y < T.y) {
          c.p.y = T.y; c.v.y *= -0.32; c.v.x *= 0.6; c.v.z *= 0.6; c.w.multiplyScalar(0.5);
          if (Math.abs(c.v.y) < 0.15) { c.v.y = 0; c.r.x += (Math.round(c.r.x / Math.PI) * Math.PI - c.r.x) * 0.3; c.r.z += (Math.round(c.r.z / Math.PI) * Math.PI - c.r.z) * 0.3; c.w.set(0, c.w.y * 0.9, 0); }
        }
      } else if (c.p.y < 0.02) { c.p.y = 0.02; c.v.y *= -0.3; c.v.x *= 0.7; c.v.z *= 0.7; }
    }
    this.items = this.items.filter((c) => c.life > 0);
    for (const c of this.items) {
      const s = Math.min(1, c.life * 2);
      this.sc.setScalar(s);
      this.q.setFromEuler(this.e.set(c.r.x, c.r.y, c.r.z));
      this.m4.compose(c.p, this.q, this.sc);
      this.mesh.setMatrixAt(i++, this.m4);
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// 加算合成の火花
export class Sparks {
  constructor(scene, max = 600) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.mat = new THREE.PointsMaterial({ size: 0.03, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.max = max; this.items = [];
  }

  emit(origin, n, { color = null, speed = 1.2, life = 1.0, spread = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() * 0.8).normalize().multiplyScalar(speed * (0.4 + Math.random()) * spread);
      const c = color ? new THREE.Color(color) : new THREE.Color().setHSL(Math.random(), 1, 0.6);
      this.items.push({ p: origin.clone(), v: d, c: c.multiplyScalar(3), life, max: life });
    }
  }

  update(dt) {
    let i = 0;
    for (const s of this.items) {
      s.life -= dt; s.v.y -= 1.8 * dt; s.v.multiplyScalar(Math.exp(-dt * 1.5)); s.p.addScaledVector(s.v, dt);
    }
    this.items = this.items.filter((s) => s.life > 0);
    for (const s of this.items) {
      const k = s.life / s.max;
      this.pos[i * 3] = s.p.x; this.pos[i * 3 + 1] = s.p.y; this.pos[i * 3 + 2] = s.p.z;
      this.col[i * 3] = s.c.r * k; this.col[i * 3 + 1] = s.c.g * k; this.col[i * 3 + 2] = s.c.b * k;
      i++;
    }
    this.points.geometry.setDrawRange(0, i);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// DOM の全画面フラッシュ
export function screenFlash(color = '#fff', ms = 220, alpha = 0.8) {
  const el = document.getElementById('flash');
  if (!el) return;
  el.style.transition = 'none';
  el.style.background = color;
  el.style.opacity = alpha;
  requestAnimationFrame(() => {
    el.style.transition = `opacity ${ms}ms ease-out`;
    el.style.opacity = 0;
  });
}
