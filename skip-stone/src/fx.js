// 水しぶき・波紋・軌跡・ターゲットリング・光の輪などの演出。
import * as THREE from 'three';

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const rippleTex = canvasTex(256, (g, s) => {
  const r = s / 2;
  const grd = g.createRadialGradient(r, r, r * 0.55, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.0)');
  grd.addColorStop(0.78, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.86, 'rgba(255,255,255,0.35)');
  grd.addColorStop(0.92, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
});

const dropTex = canvasTex(64, (g, s) => {
  const r = s / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,250,235,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
});

const ringTex = canvasTex(512, (g, s) => {
  const r = s / 2;
  g.strokeStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 18;
  g.lineWidth = 16;
  g.beginPath();
  g.arc(r, r, r - 30, 0, Math.PI * 2);
  g.stroke();
});

const glowTex = canvasTex(128, (g, s) => {
  const r = s / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
});

const sparkleTex = canvasTex(128, (g, s) => {
  const r = s / 2;
  g.translate(r, r);
  for (const [len, w] of [
    [r * 0.95, 5],
    [r * 0.55, 3],
  ]) {
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 4 + (i ? Math.PI / 4 : 0));
      const grd = g.createLinearGradient(0, -len, 0, len);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(-w / 2, -len, w, len * 2);
    }
  }
});

export const COLORS = {
  nice: new THREE.Color('#fff3dc'),
  great: new THREE.Color('#ffc15e'),
  excellent: new THREE.Color('#7ff0dc'),
  gold: new THREE.Color('#ffd27a'),
};

export function createFx(scene) {
  // ---------- 波紋 ----------
  const ripples = [];
  const rippleGeo = new THREE.PlaneGeometry(1, 1);
  rippleGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 64; i++) {
    const m = new THREE.Mesh(
      rippleGeo,
      new THREE.MeshBasicMaterial({
        map: rippleTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        color: 0xfff6e6,
      }),
    );
    m.visible = false;
    m.renderOrder = 2;
    scene.add(m);
    ripples.push({ m, life: 0, max: 1, size: 1, delay: 0 });
  }
  let rippleIdx = 0;
  function ripple(at, size = 1, delay = 0, life = 2.6) {
    const r = ripples[rippleIdx++ % ripples.length];
    r.m.position.set(at.x, 0.025, at.z);
    r.life = 0;
    r.max = life;
    r.size = size;
    r.delay = delay;
    r.m.visible = false;
  }

  // ---------- 水滴(加算合成のパーティクル) ----------
  const N = 900;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const maxLife = new Float32Array(N);
  const base = new Float32Array(N * 3);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dropGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const drops = new THREE.Points(
    dropGeo,
    new THREE.PointsMaterial({
      size: 0.09,
      map: dropTex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
  drops.frustumCulled = false;
  drops.renderOrder = 3;
  scene.add(drops);
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -100;
  let dropIdx = 0;
  function spawnDrop(x, y, z, vx, vy, vz, l, c) {
    const i = dropIdx++ % N;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    vel[i * 3] = vx;
    vel[i * 3 + 1] = vy;
    vel[i * 3 + 2] = vz;
    life[i] = l;
    maxLife[i] = l;
    base[i * 3] = c.r;
    base[i * 3 + 1] = c.g;
    base[i * 3 + 2] = c.b;
  }
  const splashColor = new THREE.Color(1.0, 0.93, 0.8);

  /** 石が水面を跳ねたときのしぶき */
  function skipSplash(at, dir, strength) {
    const k = Math.min(1.4, 0.35 + strength);
    const n = Math.round(14 + 30 * k);
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const spread = 0.6 + Math.random() * 1.4;
      // 進行方向に対して V 字に広がるしぶき
      const px = -dir.z * side;
      const pz = dir.x * side;
      const fwd = 0.6 + Math.random() * 2.2;
      spawnDrop(
        at.x + (Math.random() - 0.5) * 0.15,
        0.03,
        at.z + (Math.random() - 0.5) * 0.15,
        (dir.x * fwd + px * spread) * k,
        (1.2 + Math.random() * 2.6) * k,
        (dir.z * fwd + pz * spread) * k,
        0.5 + Math.random() * 0.5,
        splashColor,
      );
    }
    ripple(at, 0.9 + strength * 0.6, 0, 2.4);
    ripple({ x: at.x + dir.x * 0.3, z: at.z + dir.z * 0.3 }, 0.5 + strength * 0.3, 0.18, 2.0);
  }

  /** 沈むときのしぶき */
  function sinkSplash(at, big = 1) {
    for (let i = 0; i < 70 * big; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 1.1;
      spawnDrop(
        at.x,
        0.05,
        at.z,
        Math.cos(a) * s,
        2 + Math.random() * 3.2 * big,
        Math.sin(a) * s,
        0.6 + Math.random() * 0.6,
        splashColor,
      );
    }
    ripple(at, 1.6 * big, 0, 3.2);
    ripple(at, 1.0 * big, 0.35, 3.0);
    ripple(at, 0.6 * big, 0.7, 2.6);
  }

  /** キラキラ(光の輪に当たったとき・Excellent) */
  function sparkle(at, color, n = 50, up = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.8;
      spawnDrop(at.x, (at.y || 0) + 0.2, at.z, Math.cos(a) * s, 0.5 + Math.random() * up, Math.sin(a) * s, 0.8 + Math.random() * 0.6, color);
    }
  }

  // ---------- 軌跡のリボン ----------
  const TRAIL = 40;
  const trailPts = [];
  const trailPos = new Float32Array(TRAIL * 2 * 3);
  const trailAlpha = new Float32Array(TRAIL * 2);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('alpha', new THREE.BufferAttribute(trailAlpha, 1));
  const idx = [];
  for (let i = 0; i < TRAIL - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  trailGeo.setIndex(idx);
  const trailMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(1, 0.95, 0.85) } },
    vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color * vA, vA); }`,
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.renderOrder = 4;
  scene.add(trail);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  function updateTrail(camera, point) {
    if (point) {
      trailPts.unshift(point.clone());
      if (trailPts.length > TRAIL) trailPts.pop();
    } else if (trailPts.length) {
      trailPts.pop();
    }
    trailAlpha.fill(0);
    for (let i = 0; i < trailPts.length; i++) {
      const p = trailPts[i];
      const q = trailPts[Math.min(i + 1, trailPts.length - 1)];
      const prev = trailPts[Math.max(i - 1, 0)];
      tmpA.subVectors(prev, q);
      if (tmpA.lengthSq() < 1e-8) tmpA.set(0, 0, -1);
      tmpB.subVectors(camera.position, p);
      tmpA.cross(tmpB).normalize();
      const f = 1 - i / TRAIL;
      const w = 0.045 * f;
      trailPos.set([p.x + tmpA.x * w, p.y + tmpA.y * w, p.z + tmpA.z * w], i * 6);
      trailPos.set([p.x - tmpA.x * w, p.y - tmpA.y * w, p.z - tmpA.z * w], i * 6 + 3);
      trailAlpha[i * 2] = trailAlpha[i * 2 + 1] = 0.55 * f * f;
    }
    for (let i = trailPts.length; i < TRAIL; i++) {
      const p = trailPts[trailPts.length - 1] || tmpB.set(0, -50, 0);
      trailPos.set([p.x, p.y, p.z, p.x, p.y, p.z], i * 6);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.alpha.needsUpdate = true;
  }
  function clearTrail() {
    trailPts.length = 0;
  }

  // ---------- ターゲットリング(水面に浮かぶ判定の輪) ----------
  const ringGeo = new THREE.PlaneGeometry(1, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const mkRing = (color, opacity) =>
    new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        map: ringTex,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
  const target = new THREE.Group();
  const outer = mkRing(0xffffff, 0.75);
  const inner = mkRing(0xffffff, 1);
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }),
  );
  outer.renderOrder = inner.renderOrder = fill.renderOrder = 5;
  target.add(fill, outer, inner);
  target.position.y = 0.04;
  target.visible = false;
  scene.add(target);
  const targetState = { radius: 2.4, k: 1, frozen: false, flash: 0, fade: 0 };

  function setTarget(x, z, radius) {
    target.position.set(x, 0.04, z);
    targetState.radius = radius;
    targetState.frozen = false;
    targetState.flash = 0;
    targetState.fade = 0;
    target.visible = true;
    target.scale.setScalar(1);
    outer.scale.setScalar(radius * 2);
    fill.scale.setScalar(radius * 2);
    outer.material.opacity = 0.75;
    fill.material.opacity = 0.07;
  }

  // ---------- 光の輪のコース(立てたアーチのゲートを道のりに沿って並べる) ----------
  const MAX_GATES = 8;
  const GATE_COLOR = new THREE.Color('#f39a1e');
  const archGeo = new THREE.TorusGeometry(1, 0.065, 10, 72, Math.PI);
  const archGlowGeo = new THREE.TorusGeometry(1, 0.16, 10, 72, Math.PI);
  const gates = [];
  for (let i = 0; i < MAX_GATES; i++) {
    const g = new THREE.Group();
    // 明るい水面でも見えるよう、本体は濃い金色を普通に重ね、外側の光だけ加算にする
    const arch = new THREE.Mesh(
      archGeo,
      new THREE.MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }),
    );
    const halo = new THREE.Mesh(
      archGlowGeo,
      new THREE.MeshBasicMaterial({
        color: COLORS.gold,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    g.add(arch, halo);
    g.visible = false;
    scene.add(g);
    gates.push({ g, arch, halo, r: 1.7, state: 'pending', t: 0, phase: i * 0.7, next: false });
  }
  // ゲートをつなぐ水面の点線
  const DOTS = 160;
  const dotPos = new Float32Array(DOTS * 3);
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
  const dotMat = new THREE.PointsMaterial({
    size: 0.32,
    map: dropTex,
    color: GATE_COLOR,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const dots = new THREE.Points(dotGeo, dotMat);
  dots.frustumCulled = false;
  dots.renderOrder = 3;
  scene.add(dots);

  /** list: [{x, z, yaw}] 順番どおりのゲート。path: 点線の点 [{x, z}] */
  function setCourse(list, path, r = 1.7) {
    gates.forEach((b, i) => {
      const d = list[i];
      b.g.visible = !!d;
      if (!d) return;
      b.g.position.set(d.x, 0, d.z);
      b.g.rotation.set(0, d.yaw, 0);
      b.r = r;
      b.g.scale.setScalar(r);
      b.state = 'pending';
      b.t = 0;
      b.arch.material.opacity = 1;
      b.halo.material.opacity = 0.22;
      b.arch.material.color.copy(GATE_COLOR);
    });
    for (let i = 0; i < DOTS; i++) {
      const p = path[Math.min(i, path.length - 1)];
      dotPos[i * 3] = p ? p.x : 0;
      dotPos[i * 3 + 1] = p && i < path.length ? 0.04 : -50;
      dotPos[i * 3 + 2] = p ? p.z : 0;
    }
    dotGeo.attributes.position.needsUpdate = true;
    dotMat.opacity = 0.8;
  }
  const missColor = new THREE.Color('#8fa3a8');
  /** ゲートの結果を見せる。hit: くぐった / それ以外: 外した */
  function markGate(i, hit) {
    const b = gates[i];
    if (!b) return;
    b.state = hit ? 'hit' : 'miss';
    b.t = 0;
    if (hit) {
      const p = b.g.position;
      sparkle({ x: p.x, y: b.r * 0.8, z: p.z }, COLORS.gold, 90, 3);
      ripple(p, b.r * 1.2, 0, 1.8);
    } else {
      b.arch.material.color.copy(missColor);
    }
  }
  function setNextGate(i) {
    gates.forEach((b, j) => (b.next = j === i));
  }

  // ---------- 手元の石の回転オーラ ----------
  const aura = new THREE.Group();
  const auraGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color: COLORS.excellent, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
  );
  auraGlow.scale.setScalar(0.42);
  aura.add(auraGlow);
  const auraSparks = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sparkleTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
    );
    s.scale.setScalar(0.07);
    aura.add(s);
    auraSparks.push(s);
  }
  aura.renderOrder = 20;
  scene.add(aura);
  const auraState = { level: 0, t: 0 };

  return {
    ripple,
    skipSplash,
    sinkSplash,
    sparkle,
    updateTrail,
    clearTrail,
    setTarget,
    targetState,
    target,
    setCourse,
    markGate,
    setNextGate,
    gates,
    fadeCourseLine() {
      dotMat.opacity = 0.3;
    },
    hideTarget() {
      target.visible = false;
    },
    /** 判定リングの内側の輪の大きさ(0..1)と色を設定する */
    setInner(k, color) {
      targetState.k = k;
      inner.scale.setScalar(targetState.radius * 2 * Math.max(0.04, k));
      inner.material.color.copy(color);
    },
    flashTarget(color) {
      targetState.flash = 1;
      inner.material.color.copy(color);
    },
    setAura(level, pos, dir) {
      auraState.level = level;
      aura.position.copy(pos);
      auraState.dir = dir;
    },
    update(dt, camera) {
      // 波紋
      for (const r of ripples) {
        if (r.life >= r.max && !r.m.visible) continue;
        r.life += dt;
        const t = (r.life - r.delay) / r.max;
        if (t < 0) continue;
        if (t >= 1) {
          r.m.visible = false;
          r.life = r.max;
          continue;
        }
        r.m.visible = true;
        const s = r.size * (0.35 + 3.2 * (1 - Math.pow(1 - t, 2.2)));
        r.m.scale.set(s, 1, s);
        r.m.material.opacity = 0.55 * Math.pow(1 - t, 1.6);
      }
      // 水滴
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        const j = i * 3;
        vel[j + 1] -= 9.8 * dt;
        pos[j] += vel[j] * dt;
        pos[j + 1] += vel[j + 1] * dt;
        pos[j + 2] += vel[j + 2] * dt;
        const a = Math.max(0, life[i] / maxLife[i]);
        if (pos[j + 1] < 0 || life[i] <= 0) {
          life[i] = 0;
          pos[j + 1] = -100;
        }
        col[j] = base[j] * a;
        col[j + 1] = base[j + 1] * a;
        col[j + 2] = base[j + 2] * a;
      }
      dropGeo.attributes.position.needsUpdate = true;
      dropGeo.attributes.color.needsUpdate = true;

      // ターゲット
      if (target.visible) {
        if (targetState.flash > 0) {
          targetState.flash = Math.max(0, targetState.flash - dt * 1.2);
          const f = targetState.flash;
          target.scale.setScalar(1 + (1 - f) * 0.5);
          outer.material.opacity = 0.75 * f;
          inner.material.opacity = f;
          fill.material.opacity = 0.2 * f;
          if (f <= 0) target.visible = false;
        } else {
          inner.material.opacity = 1;
          // 外側の輪をゆっくり脈打たせる
          outer.material.opacity = 0.55 + Math.sin(performance.now() / 300) * 0.15;
        }
      }
      // コースのゲート
      const now = performance.now() / 1000;
      for (const b of gates) {
        if (!b.g.visible) continue;
        if (b.state === 'pending') {
          // 次にくぐるゲートほど明るく脈打つ
          const pulse = b.next ? 0.85 + Math.sin(now * 6 + b.phase) * 0.15 : 0.8 + Math.sin(now * 2 + b.phase) * 0.08;
          b.arch.material.opacity = pulse;
          b.halo.material.opacity = pulse * (b.next ? 0.4 : 0.2);
          b.g.position.y = Math.sin(now * 1.6 + b.phase) * 0.03;
        } else if (b.state === 'hit') {
          b.t += dt;
          const f = Math.max(0, 1 - b.t / 0.7);
          b.g.scale.setScalar(b.r * (1 + b.t * 0.9));
          b.arch.material.opacity = f;
          b.halo.material.opacity = f * 0.6;
          if (f <= 0) b.g.visible = false;
        } else {
          b.arch.material.opacity += (0.18 - b.arch.material.opacity) * Math.min(1, dt * 5);
          b.halo.material.opacity += (0 - b.halo.material.opacity) * Math.min(1, dt * 5);
        }
      }
      // オーラ
      auraState.t += dt;
      const lv = auraState.level;
      auraGlow.material.opacity += ((lv > 0 ? 0.55 : 0) - auraGlow.material.opacity) * Math.min(1, dt * 8);
      auraSparks.forEach((s, i) => {
        const a = auraState.t * 5 * (auraState.dir || 1) + (i / auraSparks.length) * Math.PI * 2;
        const rad = 0.17 + Math.sin(auraState.t * 7 + i) * 0.02;
        s.position.set(Math.cos(a) * rad, Math.sin(a) * rad * 0.55, 0);
        s.material.opacity += ((lv > 0 ? 0.9 : 0) - s.material.opacity) * Math.min(1, dt * 8);
        s.material.rotation = auraState.t * 3 + i;
      });
      aura.quaternion.copy(camera.quaternion);
    },
  };
}
