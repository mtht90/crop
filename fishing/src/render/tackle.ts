import * as THREE from 'three';
import type { Lure } from '../data/tackle';
import { SPECIES_BY_ID } from '../data/species';
import { buildFishObject } from './fishMesh';

/**
 * 仕掛け・ルアー・エサの3Dモデル（実物の寸法、単位 m）。
 * どれも +X が先端（糸を結ぶ側）。update() で動き（ミミズのくねり・ブレードの回転など）を付ける。
 */
export interface TackleObject {
  group: THREE.Group;
  /** speed = 水中を引かれる速さ (m/s) */
  update(dt: number, speed: number): void;
  dispose(): void;
}

const steel = () => new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 0.95, roughness: 0.25 });
const darkSteel = () => new THREE.MeshStandardMaterial({ color: 0x3a3d40, metalness: 0.9, roughness: 0.35 });

/** 針（軸・曲がり・先端・カエシ）。全長 len、+X に結び目 */
function hookGeometry(len: number, gap: number, wire: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  // 結び目のアイ → 軸 → 曲がり → 先端（軸と平行に戻る）
  pts.push(new THREE.Vector3(len * 0.5, 0, 0));
  pts.push(new THREE.Vector3(-len * 0.3, 0, 0));
  const r = gap / 2;
  const cx = -len * 0.3;
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    pts.push(new THREE.Vector3(cx - Math.sin(a) * r * 1.1, -r + Math.cos(a) * r, 0));
  }
  pts.push(new THREE.Vector3(cx + len * 0.35, -gap * 0.85, 0));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, wire, 5, false);
}

function addHook(g: THREE.Group, len: number, at: THREE.Vector3, rotX = 0, mat = darkSteel()): THREE.Mesh {
  const m = new THREE.Mesh(hookGeometry(len, len * 0.42, len * 0.035), mat);
  m.position.copy(at);
  m.rotation.x = rotX;
  g.add(m);
  return m;
}

/** トレブルフック（3本針）。下向きにぶら下がる */
function addTreble(g: THREE.Group, size: number, at: THREE.Vector3): void {
  const t = new THREE.Group();
  const mat = darkSteel();
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Mesh(hookGeometry(size, size * 0.45, size * 0.04), mat);
    // 軸を縦にして 120° ずつ回す
    h.rotation.z = -Math.PI / 2;
    const w = new THREE.Group();
    w.add(h);
    w.rotation.y = (i / 3) * Math.PI * 2;
    t.add(w);
  }
  // スプリットリング
  const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.14, size * 0.03, 6, 14), steel());
  ring.position.y = size * 0.55;
  t.add(ring);
  t.position.copy(at);
  t.position.y -= size * 0.6;
  g.add(t);
}

/** 縦長の体（lathe）を +X 方向へ寝かせる。profile は [x(先端からの距離), 半径] */
function bodyGeometry(profile: [number, number][], squash = 1): THREE.BufferGeometry {
  const pts = profile.map(([x, r]) => new THREE.Vector2(Math.max(0.0001, r), -x));
  const g = new THREE.LatheGeometry(pts, 24);
  // Lathe は Y 軸まわり → 先端を +X に
  g.rotateZ(-Math.PI / 2);
  g.scale(1, 1, squash);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  g.translate(-bb.max.x, 0, 0);
  return g;
}

/** 背→側面→腹のグラデーション（頂点カラー） */
function paintBody(g: THREE.BufferGeometry, back: THREE.Color, side: THREE.Color, belly: THREE.Color): void {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const h = Math.max(1e-6, bb.max.y - bb.min.y);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / h;
    if (t > 0.55) c.copy(side).lerp(back, Math.min(1, (t - 0.55) / 0.3));
    else c.copy(belly).lerp(side, Math.min(1, t / 0.45));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function addEyes(g: THREE.Group, x: number, y: number, z: number, r: number): void {
  const iris = new THREE.MeshStandardMaterial({ color: 0xd8b13a, metalness: 0.6, roughness: 0.3 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.2 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), iris);
    e.position.set(x, y, z * s);
    e.scale.set(1, 1, 0.4);
    g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 6), pupil);
    p.position.set(x, y, (z + r * 0.3) * s);
    p.scale.set(1, 1, 0.4);
    g.add(p);
  }
}

/** プラスチックの透明リップ */
function addLip(g: THREE.Group, w: number, len: number, angle: number, x: number, y: number): void {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(len, len * 0.04, w),
    new THREE.MeshPhysicalMaterial({ color: 0xe8eef0, transparent: true, opacity: 0.55, roughness: 0.05, transmission: 0.6, thickness: 0.002 }),
  );
  m.geometry.translate(len / 2, 0, 0);
  m.position.set(x, y, 0);
  m.rotation.z = -angle;
  g.add(m);
}

function hardBody(lure: Lure, profile: [number, number][], squash: number, metallic: number): THREE.Mesh {
  const g = bodyGeometry(profile, squash);
  const base = new THREE.Color(lure.color);
  paintBody(g, base.clone().multiplyScalar(0.55), base.clone().lerp(new THREE.Color(0xdde3e6), 0.35), new THREE.Color(0xf2f0e8));
  return new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: metallic, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }));
}

// ---------------- ルアー ----------------

function minnow(lure: Lure): TackleObject {
  const g = new THREE.Group();
  const L = 0.09;
  g.add(hardBody(lure, [[0, 0.002], [0.006, 0.006], [0.02, 0.0095], [0.045, 0.009], [0.07, 0.0055], [0.085, 0.003], [0.09, 0.0015]], 0.62, 0.55));
  addEyes(g, -0.011, 0.002, 0.0048, 0.0022);
  addLip(g, 0.012, 0.016, 0.55, -0.004, -0.003);
  addTreble(g, 0.012, new THREE.Vector3(-L * 0.4, -0.009, 0));
  addTreble(g, 0.011, new THREE.Vector3(-L * 0.92, -0.004, 0));
  let t = 0;
  return {
    group: g,
    update(dt, speed) {
      t += dt;
      // 引くと左右に体を振る（ウォブリング）
      g.rotation.x = Math.sin(t * 22) * Math.min(0.35, speed * 0.5);
    },
    dispose() {},
  };
}

function crank(lure: Lure): TackleObject {
  const g = new THREE.Group();
  g.add(hardBody(lure, [[0, 0.003], [0.006, 0.011], [0.018, 0.015], [0.034, 0.013], [0.052, 0.006], [0.058, 0.002]], 0.72, 0.3));
  addEyes(g, -0.01, 0.004, 0.0085, 0.0028);
  addLip(g, 0.016, 0.026, 0.95, -0.002, -0.006);
  addTreble(g, 0.012, new THREE.Vector3(-0.022, -0.014, 0));
  addTreble(g, 0.012, new THREE.Vector3(-0.056, -0.004, 0));
  let t = 0;
  return {
    group: g,
    update(dt, speed) {
      t += dt;
      g.rotation.x = Math.sin(t * 16) * Math.min(0.45, speed * 0.6);
    },
    dispose() {},
  };
}

function spinner(lure: Lure): TackleObject {
  const g = new THREE.Group();
  // 軸（ワイヤー）
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0005, 0.07, 6).rotateZ(Math.PI / 2), steel());
  wire.position.x = -0.035;
  g.add(wire);
  // ビーズとボディ（真鍮）
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.9, roughness: 0.25 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 10, 8), brass);
    b.position.x = -0.022 - i * 0.0045;
    g.add(b);
  }
  const body = new THREE.Mesh(bodyGeometry([[0, 0.0015], [0.004, 0.0035], [0.016, 0.0035], [0.02, 0.0015]]), new THREE.MeshStandardMaterial({ color: lure.color, metalness: 0.4, roughness: 0.35 }));
  body.position.x = -0.036;
  g.add(body);
  // ブレード：軸から少し離れて回る、反った楕円の金属板
  const bladeGeo = new THREE.CircleGeometry(0.009, 20);
  bladeGeo.scale(1.6, 1, 1);
  const p = bladeGeo.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setZ(i, (p.getY(i) * p.getY(i)) * 18);
  bladeGeo.computeVertexNormals();
  const blade = new THREE.Mesh(bladeGeo, new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }));
  blade.position.set(-0.016, 0.006, 0);
  blade.rotation.y = 0.5;
  const spin = new THREE.Group();
  spin.position.x = -0.005;
  spin.add(blade);
  g.add(spin);
  addTreble(g, 0.01, new THREE.Vector3(-0.07, -0.001, 0));
  // 赤いティンセル
  const tag = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.012, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8302a, roughness: 0.6 }));
  tag.position.x = -0.078;
  g.add(tag);
  return {
    group: g,
    update(dt, speed) {
      spin.rotation.x += dt * (speed > 0.05 ? 25 + speed * 30 : 0.5);
    },
    dispose() {},
  };
}

function softWorm(lure: Lure): TackleObject {
  const g = new THREE.Group();
  // テキサスリグ：バレットシンカー → オフセットフック → ワーム（カーリーテール）
  const sinker = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.013, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55585a, metalness: 0.6, roughness: 0.5 }));
  sinker.position.x = 0.004;
  g.add(sinker);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(-i * 0.0065, 0, 0));
  const tailPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 1.6;
    tailPts.push(new THREE.Vector3(-0.078 - Math.sin(a) * 0.012, Math.cos(a) * 0.012 - 0.012, 0));
  }
  const mat = new THREE.MeshPhysicalMaterial({ color: lure.color, roughness: 0.45, transmission: 0.25, thickness: 0.004, sheen: 0.5 });
  const bodyGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.0035, 10, false);
  const body = new THREE.Mesh(bodyGeo, mat);
  g.add(body);
  const tailGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tailPts), 24, 0.0018, 6, false);
  tailGeo.scale(1, 1, 0.5);
  const tail = new THREE.Mesh(tailGeo, mat);
  g.add(tail);
  // リング状の凹凸（体節）
  for (let i = 1; i < 10; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.0036, 0.0006, 4, 14).rotateY(Math.PI / 2), mat);
    r.position.x = -0.01 - i * 0.005;
    g.add(r);
  }
  addHook(g, 0.025, new THREE.Vector3(-0.012, 0.0035, 0), Math.PI, steel());
  let t = 0;
  return {
    group: g,
    update(dt, speed) {
      t += dt;
      // カーリーテールが水を受けてはためく
      tail.rotation.x = Math.sin(t * 18) * Math.min(0.7, 0.1 + speed);
    },
    dispose() {},
  };
}

function metalJig(lure: Lure): TackleObject {
  const g = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(0.5, 1);
  geo.scale(0.075, 0.016, 0.007);
  geo.translate(-0.0375, 0, 0);
  const base = new THREE.Color(lure.color);
  paintBody(geo, base.clone().multiplyScalar(0.6), new THREE.Color(0xd9dde0), new THREE.Color(0xf4f4f0));
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.95, roughness: 0.15 })));
  addEyes(g, -0.008, 0.002, 0.003, 0.0018);
  // フロントのアシストフック
  addHook(g, 0.018, new THREE.Vector3(-0.006, -0.002, 0.002), 0.4);
  addTreble(g, 0.011, new THREE.Vector3(-0.075, -0.002, 0));
  return { group: g, update() {}, dispose() {} };
}

function popper(lure: Lure): TackleObject {
  const g = new THREE.Group();
  // 口の部分がカップ状にへこんでいる
  g.add(hardBody(lure, [[0, 0.0075], [0.002, 0.0055], [0.004, 0.0085], [0.02, 0.0095], [0.045, 0.007], [0.062, 0.003], [0.066, 0.0015]], 1, 0.15));
  addEyes(g, -0.009, 0.004, 0.0078, 0.0026);
  addTreble(g, 0.012, new THREE.Vector3(-0.026, -0.009, 0));
  addTreble(g, 0.011, new THREE.Vector3(-0.066, -0.002, 0));
  // 後ろのフェザー
  const fm = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.0012, 0.02, 4).rotateZ(Math.PI / 2), fm);
    f.position.set(-0.078, Math.sin(i) * 0.002, Math.cos(i * 2) * 0.002);
    f.rotation.y = (i - 2.5) * 0.08;
    g.add(f);
  }
  return { group: g, update() {}, dispose() {} };
}

function frog(lure: Lure): TackleObject {
  const g = new THREE.Group();
  const soft = new THREE.MeshPhysicalMaterial({ color: lure.color, roughness: 0.6, sheen: 0.6 });
  const bodyGeo = new THREE.SphereGeometry(0.5, 20, 14);
  bodyGeo.scale(0.05, 0.016, 0.03);
  bodyGeo.translate(-0.025, 0, 0);
  paintBody(bodyGeo, new THREE.Color(lure.color).multiplyScalar(0.7), new THREE.Color(lure.color), new THREE.Color(0xe9e4cf));
  soft.vertexColors = true;
  g.add(new THREE.Mesh(bodyGeo, soft));
  addEyes(g, -0.01, 0.006, 0.008, 0.0028);
  // ゴムの脚
  const legs: THREE.Mesh[] = [];
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(lure.color).multiplyScalar(0.8), roughness: 0.7 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0006, 0.035, 5).rotateZ(Math.PI / 2).translate(-0.0175, 0, 0), legMat);
    leg.position.set(-0.048, 0, 0.008 * s);
    leg.rotation.y = 0.25 * s;
    g.add(leg);
    legs.push(leg);
  }
  // 上向きのダブルフック
  for (const s of [-1, 1]) {
    const h = addHook(g, 0.026, new THREE.Vector3(-0.022, 0.007, 0.006 * s), Math.PI);
    h.rotation.y = 0.1 * s;
  }
  let t = 0;
  return {
    group: g,
    update(dt, speed) {
      t += dt;
      legs.forEach((l, i) => (l.rotation.y = (i ? 1 : -1) * (0.25 + Math.sin(t * 14 + i) * Math.min(0.4, speed))));
    },
    dispose() {},
  };
}

// ---------------- エサ ----------------

/** ミミズ：針に通して房掛け。体節の縞と環帯があり、ゆっくりくねる */
function worm(): TackleObject {
  const g = new THREE.Group();
  addHook(g, 0.016, new THREE.Vector3(-0.004, 0, 0), 0, steel());
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x5e2a2c, roughness: 0.3, sheen: 0.5, sheenColor: new THREE.Color(0xb07070), clearcoat: 0.6, clearcoatRoughness: 0.3 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vS;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // 針に刺さった所（中央）から両端へ向かって大きく、ゆっくり波打つ
        vS = uv.x;
        float e = abs(uv.x - 0.45) * 2.0;
        transformed.y += sin(uTime * 2.3 + uv.x * 9.0) * 0.006 * e;
        transformed.z += sin(uTime * 1.7 + uv.x * 7.0 + 1.0) * 0.008 * e;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vS;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // 細かな体節と、明るい環帯
        diffuseColor.rgb *= 0.82 + 0.18 * smoothstep(-0.3, 0.6, sin(vS * 520.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.28, 0.24), smoothstep(0.04, 0.0, abs(vS - 0.25)));`,
      );
  };
  // 二つ折りで針に掛けたミミズ
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const s = i / 20;
    const a = s * Math.PI * 1.2;
    pts.push(new THREE.Vector3(-0.004 - Math.sin(a) * 0.016 - s * 0.03, -0.004 - Math.cos(a) * 0.011 + 0.011, Math.sin(s * 6) * 0.004));
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 70, 0.0027, 8, false);
  g.add(new THREE.Mesh(geo, mat));
  let t = 0;
  return {
    group: g,
    update(dt) {
      t += dt;
      uniforms.uTime.value = t;
    },
    dispose() {},
  };
}

/** 練りエサ：針を包んだ不揃いな団子 */
function dough(): TackleObject {
  const g = new THREE.Group();
  addHook(g, 0.014, new THREE.Vector3(0.002, 0, 0), 0, steel());
  const geo = new THREE.IcosahedronGeometry(0.0085, 3);
  const p = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.12 * Math.sin(v.x * 900) * Math.sin(v.y * 700) + 0.08 * Math.sin(v.z * 1300 + v.x * 400);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y * 0.9, v.z);
  }
  geo.computeVertexNormals();
  const ball = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 0.95 }));
  ball.position.x = -0.006;
  g.add(ball);
  return { group: g, update() {}, dispose() {} };
}

/** 活き餌：背掛けにした小魚が泳ぐ */
function liveBait(): TackleObject {
  const g = new THREE.Group();
  const s = SPECIES_BY_ID['oikawa'] ?? SPECIES_BY_ID[Object.keys(SPECIES_BY_ID)[0]];
  const fish = buildFishObject(s, null, null, false, true);
  fish.group.scale.setScalar(0.065);
  fish.group.position.x = -0.03;
  g.add(fish.group);
  addHook(g, 0.016, new THREE.Vector3(-0.026, 0.006, 0), Math.PI);
  let t = 0;
  return {
    group: g,
    update(dt, speed) {
      t += dt;
      fish.swim.uTime.value = t;
      fish.swim.uAmp.value = 0.06 + Math.min(0.06, speed * 0.1);
      fish.swim.uFreq.value = 12;
      fish.group.rotation.y = Math.sin(t * 1.3) * 0.3;
    },
    dispose() {
      fish.dispose();
    },
  };
}

export function buildTackle(lure: Lure): TackleObject {
  switch (lure.category) {
    case 'minnow':
      return minnow(lure);
    case 'crank':
      return crank(lure);
    case 'spinner':
      return spinner(lure);
    case 'worm':
      return softWorm(lure);
    case 'jig':
      return metalJig(lure);
    case 'topwater':
      return popper(lure);
    case 'frog':
      return frog(lure);
    case 'baitWorm':
      return worm();
    case 'baitDough':
      return dough();
    case 'baitLive':
      return liveBait();
  }
}

/** 棒ウキ：トップは蛍光の目盛り、胴は赤と白。下にガン玉 */
export function buildBobber(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(
      [[0.0008, -0.06], [0.0025, -0.05], [0.006, -0.03], [0.0075, -0.012], [0.006, 0.0], [0.002, 0.012], [0.0008, 0.015]].map(([r, y]) => new THREE.Vector2(r, y)),
      20,
    ),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
  );
  // 上半分は赤、下は白
  const pos = body.geometry.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const red = pos.getY(i) > -0.022;
    col.set(red ? [0.75, 0.08, 0.05] : [0.92, 0.92, 0.9], i * 3);
  }
  body.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.add(body);
  // トップ（蛍光オレンジと黒の目盛り）
  const top = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0011, 0.0011, 0.009, 8),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x111111 : 0xff5a10, emissive: i % 2 ? 0x000000 : 0x6a1800, roughness: 0.4 }),
    );
    seg.position.y = 0.0195 + i * 0.009;
    top.add(seg);
  }
  g.add(top);
  // 足（ゴム管で糸に付く）
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.02, 6), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }));
  foot.position.y = -0.068;
  g.add(foot);
  return g;
}

/** ガン玉（割りおもり） */
export function buildSinker(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 12, 8), new THREE.MeshStandardMaterial({ color: 0x4a4d50, metalness: 0.5, roughness: 0.55 }));
  return m;
}
