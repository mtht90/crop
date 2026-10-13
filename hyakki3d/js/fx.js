// 3D エフェクト。2D 版と同じ API（particle / burst / ring / bolt / seal / text / anim）で呼べる。
// ワールド座標はゲームロジックの (x, y) を 3D の (X, Z) に S 倍して置く。
import * as THREE from 'three';

export const S = 1 / 40;            // ゲーム単位 → m
export const PALETTE = ['#ffd35a', '#ff5a3d', '#7fd7ff', '#ffffff', '#c77dff', '#7dffb0', '#ff3d6e', '#ffe9b0', '#6fa8ff'];
const COLS = PALETTE.map((c) => new THREE.Color(c));

let scene = null, camera = null, layer = null;
let MAXP = 6000;

// ---------------- パーティクル（加算合成の光点） ----------------
let pts, pPos, pCol, pSize, pAlpha, pVel, pLife, pMax, pDrag, pGrav, pBase, pn = 0;

const PARTICLE_VS = `
attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
varying vec3 vColor; varying float vAlpha;
uniform float uScale;
void main() {
  vColor = aColor; vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = `
varying vec3 vColor; varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  float core = smoothstep(0.35, 0.0, d);
  gl_FragColor = vec4(vColor * (a * 0.5 + core * 0.8), a * vAlpha) * vAlpha;
}`;

// ---------------- 地面に描くもの（衝撃波・魔法陣） ----------------
const RING_FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uWidth;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float band = smoothstep(1.0, 1.0 - uWidth, d) * smoothstep(1.0 - uWidth * 2.2, 1.0 - uWidth, d);
  float inner = smoothstep(1.0, 0.0, d) * 0.12;
  gl_FragColor = vec4(uColor * (band * 1.8 + inner), (band + inner) * uAlpha);
}`;
const SEAL_FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uRot; uniform float uTime;
varying vec2 vUv;
float line(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return smoothstep(w, w * 0.3, length(pa - ba * h));
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float c = cos(uRot), s = sin(uRot);
  p = mat2(c, -s, s, c) * p;
  float r = length(p);
  float a = 0.0;
  a += smoothstep(0.035, 0.0, abs(r - 0.96));
  a += smoothstep(0.02, 0.0, abs(r - 0.86));
  a += smoothstep(0.015, 0.0, abs(r - 0.36)) * 0.8;
  // 外周の梵字っぽい刻み
  float ang = atan(p.y, p.x);
  float tick = step(0.5, fract(ang * 6.0 / 3.14159 + uTime * 0.2)) * smoothstep(0.03, 0.0, abs(r - 0.91));
  a += tick * 0.9;
  // 五芒星（晴明桔梗）
  for (int i = 0; i < 5; i++) {
    float a0 = 1.5708 + float(i) * 2.51327;
    float a1 = 1.5708 + float(i + 2) * 2.51327;
    a += line(p, vec2(cos(a0), sin(a0)) * 0.84, vec2(cos(a1), sin(a1)) * 0.84, 0.028);
  }
  float fill = smoothstep(0.98, 0.2, r) * 0.10;
  a = clamp(a, 0.0, 1.0);
  gl_FragColor = vec4(uColor * (a * 0.9 + fill * 0.6), (a + fill) * uAlpha);
}`;
const PLANE_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// 光の柱（レベルアップ）
const PILLAR_FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
varying vec2 vUv;
void main() {
  float v = vUv.y;
  float streak = 0.6 + 0.4 * sin(vUv.x * 40.0 + uTime * 8.0);
  float a = (1.0 - v) * smoothstep(0.0, 0.08, v) * streak;
  gl_FragColor = vec4(uColor * a * 2.0, a * uAlpha);
}`;
// 斬撃の弧
const SLASH_FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uProg;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x) / 3.14159;  // -1..1
  float arc = smoothstep(0.0, 0.25, ang + 0.2) * smoothstep(1.0, 0.6, ang + 0.2);
  float band = smoothstep(0.18, 0.0, abs(r - 0.78)) * arc;
  float head = smoothstep(0.35, 0.0, abs(ang - (uProg * 1.4 - 0.4)));
  float a = band * (0.4 + head);
  gl_FragColor = vec4(uColor * a * 2.2, a * uAlpha);
}`;

function shaderMat(fs, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: PLANE_VS, fragmentShader: fs, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...extra,
  });
}

const rings = [], seals = [], pillars = [], slashes = [], bolts = [], lights = [];
const ringFree = [], sealFree = [], pillarFree = [], slashFree = [];
let ringGeo, sealGeo, pillarGeo, slashGeo;
const texts = [];
const textFree = [];
let MAXT = 100;

export const FX = {
  init(maxParticles, maxTexts) {
    MAXP = Math.max(2000, maxParticles * 2);
    MAXT = Math.min(32, maxTexts);
  },
  attach(sc, cam, domLayer, mobile) {
    scene = sc; camera = cam; layer = domLayer;
    const g = new THREE.BufferGeometry();
    pPos = new Float32Array(MAXP * 3); pCol = new Float32Array(MAXP * 3);
    pSize = new Float32Array(MAXP); pAlpha = new Float32Array(MAXP);
    pVel = new Float32Array(MAXP * 3); pLife = new Float32Array(MAXP); pMax = new Float32Array(MAXP);
    pDrag = new Float32Array(MAXP); pGrav = new Float32Array(MAXP); pBase = new Float32Array(MAXP);
    g.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    pts = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, uniforms: { uScale: { value: 300 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    pts.frustumCulled = false;
    pts.renderOrder = 10;
    scene.add(pts);
    ringGeo = new THREE.PlaneGeometry(2, 2); ringGeo.rotateX(-Math.PI / 2);
    sealGeo = ringGeo;
    pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true); pillarGeo.translate(0, 0.5, 0);
    slashGeo = new THREE.PlaneGeometry(2, 2); slashGeo.rotateX(-Math.PI / 2);
    // 閃光用の点光源（数を固定してシェーダの再コンパイルを避ける）
    for (let i = 0; i < (mobile ? 2 : 5); i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(l);
      lights.push({ l, t: 0, life: 1, peak: 0 });
    }
    this.uScaleFor(innerHeight);
  },
  uScaleFor(h) { if (pts) pts.material.uniforms.uScale.value = h * 0.9; },
  clear() {
    pn = 0;
    for (const arr of [rings, seals, pillars, slashes]) for (const o of arr) o.mesh.visible = false;
    ringFree.push(...rings.splice(0)); sealFree.push(...seals.splice(0));
    pillarFree.push(...pillars.splice(0)); slashFree.push(...slashes.splice(0));
    for (const b of bolts) { scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    bolts.length = 0;
    for (const t of texts) { t.el.style.display = 'none'; textFree.push(t); }
    texts.length = 0;
    for (const L of lights) L.l.intensity = 0;
  },
  count() { return pn; },

  // ---- パーティクル ----
  p3(x, y, z, vx, vy, vz, life, size, col, drag = 2, grav = 0) {
    if (pn >= MAXP) return;
    const i = pn++, j = i * 3;
    pPos[j] = x; pPos[j + 1] = y; pPos[j + 2] = z;
    pVel[j] = vx; pVel[j + 1] = vy; pVel[j + 2] = vz;
    const c = typeof col === 'number' ? COLS[col] : col;
    pCol[j] = c.r; pCol[j + 1] = c.g; pCol[j + 2] = c.b;
    pLife[i] = life; pMax[i] = life; pBase[i] = size; pDrag[i] = drag; pGrav[i] = grav;
  },
  // 2D 互換：地面上の (x, y) から水平方向に飛ばす
  particle(x, y, vx, vy, life, size, col, drag = 3) {
    this.p3(x * S, 0.6 + Math.random() * 0.4, y * S, vx * S, 1 + Math.random() * 1.5, vy * S, life, size * 0.06, col, drag, -2);
  },
  burst(x, y, n, col, speed = 160, size = 6, life = 0.45, h = 0.8) {
    if (pn > MAXP * 0.7) n = Math.ceil(n * 0.35);
    const sp = speed * S;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 0.9 + 0.1;
      const s = sp * (0.4 + Math.random() * 0.9);
      this.p3(x * S, h, y * S, Math.cos(a) * s * Math.sqrt(1 - u * u), s * u * 1.2 + 0.5, Math.sin(a) * s * Math.sqrt(1 - u * u),
        life * (0.6 + Math.random() * 0.6), size * 0.07 * (0.7 + Math.random() * 0.6), col, 2.5, -5);
    }
  },

  // ---- 地面の衝撃波 ----
  ring(x, y, r0, r1, life, color, width = 4) {
    if (rings.length > 40) return;
    const o = ringFree.pop() || { mesh: new THREE.Mesh(ringGeo, shaderMat(RING_FS, { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uWidth: { value: 0.1 } })) };
    if (!o.mesh.parent) scene.add(o.mesh);
    o.mesh.visible = true;
    o.mesh.material.uniforms.uColor.value.set(color);
    o.mesh.material.uniforms.uWidth.value = Math.min(0.3, 0.04 + width * 0.012);
    o.mesh.position.set(x * S, 0.05, y * S);
    Object.assign(o, { r0: r0 * S, r1: r1 * S, t: 0, life });
    rings.push(o);
  },
  // ---- 魔法陣（晴明桔梗） ----
  seal(x, y, r, life, follow = null, spark = false, color = null) {
    const o = sealFree.pop() || { mesh: new THREE.Mesh(sealGeo, shaderMat(SEAL_FS, { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uRot: { value: 0 }, uTime: { value: 0 } })) };
    if (!o.mesh.parent) scene.add(o.mesh);
    o.mesh.visible = true;
    o.mesh.material.uniforms.uColor.value.set(color || (spark ? '#8fe3ff' : '#ffcf6a'));
    o.mesh.position.set(x * S, 0.06 + seals.length * 0.002, y * S);
    Object.assign(o, { alpha: undefined, r: r * S, t: 0, life, follow, spin: (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random()) });
    seals.push(o);
    const ret = o;
    if (spark) for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.p3(x * S + Math.cos(a) * r * S, 0.1, y * S + Math.sin(a) * r * S, 0, 2 + Math.random() * 3, 0, 0.6, 0.35, 2, 1, 0);
    }
    return ret;
  },
  pillar(x, y, r, life, color = '#ffe9b0', follow = null) {
    const o = pillarFree.pop() || { mesh: new THREE.Mesh(pillarGeo, shaderMat(PILLAR_FS, { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uTime: { value: 0 } })) };
    if (!o.mesh.parent) scene.add(o.mesh);
    o.mesh.visible = true;
    o.mesh.material.uniforms.uColor.value.set(color);
    o.mesh.position.set(x * S, 0, y * S);
    Object.assign(o, { r: r * S, t: 0, life, follow });
    pillars.push(o);
  },
  slash(x, y, r, rot, color = '#ffffff', life = 0.22) {
    if (slashes.length > 40) return;
    const o = slashFree.pop() || { mesh: new THREE.Mesh(slashGeo, shaderMat(SLASH_FS, { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uProg: { value: 0 } })) };
    if (!o.mesh.parent) scene.add(o.mesh);
    o.mesh.visible = true;
    o.mesh.material.uniforms.uColor.value.set(color);
    o.mesh.position.set(x * S, 0.9, y * S);
    o.mesh.rotation.set(0, -rot, (Math.random() - 0.5) * 0.6);
    o.mesh.scale.setScalar(r * S);
    Object.assign(o, { t: 0, life });
    slashes.push(o);
  },
  flash(x, y, color, peak, life = 0.25, h = 1.5) {
    let best = lights[0];
    for (const L of lights) if (L.l.intensity < best.l.intensity) best = L;
    if (!best) return;
    best.l.color.set(color);
    best.l.position.set(x * S, h, y * S);
    best.l.distance = 6 + peak * 0.4;
    Object.assign(best, { t: 0, life, peak });
    best.l.intensity = peak;
  },

  // ---- 落雷：空から地面へのギザギザの帯（カメラに向けた板）＋閃光 ----
  bolt(x, y) {
    const gx = x * S, gz = y * S;
    const pts3 = [];
    const top = 14;
    let cx = gx + (Math.random() - 0.5) * 3, cz = gz + (Math.random() - 0.5) * 3;
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const j = i && i < steps ? 0.9 * (1 - k * 0.5) : 0;
      pts3.push(new THREE.Vector3(cx + (gx - cx) * k + (Math.random() - 0.5) * j, top * (1 - k), cz + (gz - cz) * k + (Math.random() - 0.5) * j));
    }
    const mk = (w, col, a) => {
      const pos = [];
      const camPos = camera.position;
      for (let i = 0; i < pts3.length; i++) {
        const p = pts3[i], q = pts3[Math.min(i + 1, pts3.length - 1)], o = pts3[Math.max(i - 1, 0)];
        const dir = q.clone().sub(o).normalize();
        const side = dir.clone().cross(camPos.clone().sub(p)).normalize().multiplyScalar(w * (1 - i / pts3.length * 0.4));
        pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
      }
      const idx = [];
      for (let i = 0; i < pts3.length - 1; i++) { const a0 = i * 2; idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.frustumCulled = false;
      scene.add(m);
      bolts.push({ mesh: m, t: 0, life: 0.28, a });
    };
    mk(0.55, 0x8a6bff, 0.55);
    mk(0.12, 0xffffff, 1);
    this.flash(x, y, '#b9a2ff', 16, 0.3, 3);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 6;
      this.p3(gx, 0.2, gz, Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s, 0.4 + Math.random() * 0.3, 0.22, i % 3 ? 4 : 3, 2, -14);
    }
  },

  // ---- ダメージ数字（DOM を 3D 位置に投影） ----
  text(x, y, str, color = '#fff', size = 14, jp = false, h = 1.6) {
    if (!layer) return;
    if (!jp && texts.length > 14 && Math.random() < (size <= 14 ? 0.8 : 0.5)) return;
    if (texts.length >= MAXT) {
      if (size <= 14 && !jp) return;
      const old = texts.shift();
      old.el.style.display = 'none';
      textFree.push(old);
    }
    let t = textFree.pop();
    if (!t) {
      const el = document.createElement('div');
      el.className = 'dmg';
      layer.appendChild(el);
      t = { el, v: new THREE.Vector3() };
    }
    t.el.textContent = str;
    t.el.className = jp ? 'dmg jp' : size >= 20 ? 'dmg crit' : 'dmg';
    t.el.style.color = color;
    t.el.style.display = '';
    t.v.set(x * S + (Math.random() - 0.5) * 0.4, h + Math.random() * 0.3, y * S);
    t.t = 0; t.life = jp ? 1.1 : 0.75; t.size = size;
    texts.push(t);
  },

  // ---- 2D 版の素材アニメ名を 3D 演出に読み替える ----
  anim(key, x, y, o = {}) {
    const k = o.scale || 1;
    if (key === 'smoke') {
      // 撃破：魂が抜けて昇っていく
      for (let i = 0; i < 4; i++) this.p3(x * S + (Math.random() - 0.5) * 0.4, 0.6, y * S + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6, 0.7 + Math.random() * 0.4, 0.28 * k, 2, 0.5, 0.5);
      this.p3(x * S, 0.7, y * S, 0, 0.5, 0, 0.18, 0.9 * k, 3, 4, 0);
    } else if (key === 'explosion') {
      const r = k * 40;
      this.burst(x, y, Math.round(14 + k * 6), 0, r * 3, 9 + k * 2, 0.55, 0.4);
      this.burst(x, y, Math.round(8 + k * 4), 1, r * 2, 12 + k * 3, 0.7, 0.4);
      this.p3(x * S, 0.8, y * S, 0, 0.5, 0, 0.18, 1.0 * k, 7, 3, 0);
      this.ring(x, y, 4, r * 1.3, 0.45, '#ffb35a', 8);
      this.flash(x, y, '#ffae5a', 6 + k * 3, 0.35);
    } else if (key === 'cut') {
      this.slash(x, y, 18 * k + 12, o.rot || 0, o.color || '#e8f6ff', o.dur || 0.2);
    } else if (key === 'boost') {
      this.pillar(x, y, 34 * k, o.dur || 0.9, o.color || '#ffe9b0', o.follow || null);
    } else if (key === 'thunder') {
      // 落雷本体は bolt() 側
    } else if (key === 'circle' || key === 'circleSpark') {
      this.seal(x, y, 16 * k, o.dur || 0.8, o.follow || null, key === 'circleSpark');
    }
  },

  update(dt) {
    // パーティクル
    let i = 0;
    while (i < pn) {
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pn--;
        const a = i * 3, b = pn * 3;
        pPos[a] = pPos[b]; pPos[a + 1] = pPos[b + 1]; pPos[a + 2] = pPos[b + 2];
        pVel[a] = pVel[b]; pVel[a + 1] = pVel[b + 1]; pVel[a + 2] = pVel[b + 2];
        pCol[a] = pCol[b]; pCol[a + 1] = pCol[b + 1]; pCol[a + 2] = pCol[b + 2];
        pLife[i] = pLife[pn]; pMax[i] = pMax[pn]; pBase[i] = pBase[pn]; pDrag[i] = pDrag[pn]; pGrav[i] = pGrav[pn];
        continue;
      }
      const j = i * 3;
      const k = Math.max(0, 1 - pDrag[i] * dt);
      pVel[j] *= k; pVel[j + 2] *= k; pVel[j + 1] = pVel[j + 1] * k + pGrav[i] * dt;
      pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
      if (pPos[j + 1] < 0.02) { pPos[j + 1] = 0.02; pVel[j + 1] *= -0.3; }
      const l = pLife[i] / pMax[i];
      pAlpha[i] = Math.min(1, l * 2.5);
      pSize[i] = pBase[i] * (0.4 + l * 0.6);
      i++;
    }
    if (pts) {
      const g = pts.geometry;
      g.setDrawRange(0, pn);
      for (const n of ['position', 'aColor', 'aSize', 'aAlpha']) { g.attributes[n].needsUpdate = true; g.attributes[n].addUpdateRange?.(0, pn * (n === 'position' || n === 'aColor' ? 3 : 1)); }
    }
    const step = (arr, free, fn) => {
      for (let j = arr.length - 1; j >= 0; j--) {
        const o = arr[j];
        o.t += dt;
        if (o.t >= o.life) { o.mesh.visible = false; free.push(o); arr.splice(j, 1); continue; }
        fn(o, o.t / o.life);
      }
    };
    step(rings, ringFree, (o, p) => {
      const r = o.r0 + (o.r1 - o.r0) * (1 - (1 - p) ** 3);
      o.mesh.scale.setScalar(Math.max(0.01, r));
      o.mesh.material.uniforms.uAlpha.value = 1 - p;
    });
    step(seals, sealFree, (o, p) => {
      if (o.follow) o.mesh.position.set(o.follow.x * S, o.mesh.position.y, o.follow.y * S);
      const grow = Math.min(1, o.t / 0.2);
      o.mesh.scale.setScalar(o.r * (0.3 + 0.7 * (1 - (1 - grow) ** 3)));
      const u = o.mesh.material.uniforms;
      u.uRot.value += dt * o.spin;
      u.uTime.value += dt;
      u.uAlpha.value = o.alpha ?? (p < 0.7 ? 1 : (1 - p) / 0.3);
    });
    step(pillars, pillarFree, (o, p) => {
      if (o.follow) o.mesh.position.set(o.follow.x * S, 0, o.follow.y * S);
      o.mesh.scale.set(o.r * (1 - p * 0.5), 9 * Math.min(1, p * 5), o.r * (1 - p * 0.5));
      const u = o.mesh.material.uniforms;
      u.uAlpha.value = (1 - p) * 0.9;
      u.uTime.value += dt;
    });
    step(slashes, slashFree, (o, p) => {
      o.mesh.material.uniforms.uProg.value = p;
      o.mesh.material.uniforms.uAlpha.value = 1 - p * p;
      o.mesh.scale.multiplyScalar(1 + dt * 1.5);
    });
    for (let j = bolts.length - 1; j >= 0; j--) {
      const b = bolts[j];
      b.t += dt;
      if (b.t >= b.life) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bolts.splice(j, 1); continue; }
      b.mesh.material.opacity = b.a * (1 - b.t / b.life) * (Math.random() < 0.3 ? 0.4 : 1);
    }
    for (const L of lights) {
      if (L.l.intensity <= 0) continue;
      L.t += dt;
      const p = L.t / L.life;
      L.l.intensity = p >= 1 ? 0 : L.peak * (1 - p) * (1 - p);
    }
  },

  // ダメージ数字の位置更新（描画直前に呼ぶ）
  drawTexts(dt, w, h) {
    for (let j = texts.length - 1; j >= 0; j--) {
      const t = texts[j];
      t.t += dt;
      if (t.t >= t.life) { t.el.style.display = 'none'; textFree.push(t); texts.splice(j, 1); continue; }
      t.v.y += dt * (1.6 - t.t * 2);
      const p = t.v.clone().project(camera);
      if (p.z > 1) { t.el.style.opacity = 0; continue; }
      const sx = (p.x * 0.5 + 0.5) * w, sy = (-p.y * 0.5 + 0.5) * h;
      const pop = t.t < 0.08 ? 1 + (0.08 - t.t) * 7 : 1;
      t.el.style.opacity = t.t > t.life * 0.6 ? (t.life - t.t) / (t.life * 0.4) : 1;
      t.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${(pop * t.size / 14).toFixed(2)})`;
    }
  },
};
