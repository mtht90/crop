import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxProjectUV, bakeColor } from './materials.js';

/**
 * 大型セットピースの組み立て器。
 * ローカル座標（+Z = 進行方向、最初の足場の手前の縁が z=0、その上面が y=0）で部品を集め、
 * 衝突チェックに通ったら commit() でワールドに配置する（それまで副作用なし）。
 */
export class Kit {
  constructor(level, zi) {
    this.L = level; this.zi = zi; this.rng = level.rng;
    this.parts = []; this.colls = []; this.props = []; this.wps = []; this.afters = []; this.lights = [];
  }
  r(a, b) { return a + (b - a) * this.rng(); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  _part(geo, mat, pos, quat, o) {
    this.parts.push({ geo, mat, pos, quat, tint: o.tint ?? 1, ao: o.ao ?? true, tile: o.tile, matOpts: o.matOpts });
  }

  /** 箱：x,z = 中心、y = 上面。round で面取り */
  box(w, h, d, mat, o = {}) {
    const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, round = 0.05, collide = true } = o;
    const r = Math.min(round, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const geo = r > 0.005 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    const pos = new THREE.Vector3(x, y - h / 2, z);
    this._part(geo, mat, pos, q, o);
    if (collide) this.colls.push({ t: 'cuboid', a: [w / 2, h / 2, d / 2], pos, q });
    return this;
  }
  /** 縦の円柱：y = 上面 */
  cyl(r, h, mat, o = {}) {
    const { x = 0, y = 0, z = 0, rTop = r, seg = 28, collide = true } = o;
    const geo = new THREE.CylinderGeometry(rTop, r, h, seg, 1);
    const pos = new THREE.Vector3(x, y - h / 2, z), q = new THREE.Quaternion();
    this._part(geo, mat, pos, q, o);
    if (collide) this.colls.push({ t: 'cylinder', a: [h / 2, Math.max(r, rTop)], pos, q });
    return this;
  }
  /** 2点を結ぶ円柱（配管・手すり・トラス）。collide でカプセルの当たり */
  tube(a, b, r, mat, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const geo = new THREE.CylinderGeometry(r, r, len, o.seg ?? 12, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    const pos = A.clone().add(B).multiplyScalar(0.5);
    this._part(geo, mat, pos, q, { ao: false, ...o });
    if (o.collide) this.colls.push({ t: o.cyl ? 'cylinder' : 'capsule', a: o.cyl ? [len / 2, r] : [len / 2, r], pos, q });
    return this;
  }
  /** 任意のジオメトリ（ローカル原点基準に配置済み） */
  geom(geo, mat, o = {}) { this._part(geo, mat, new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), o); return this; }
  /** ガラクタのモデル（上面中心が x,y,z） */
  prop(id, x, y, z, yaw = 0, o = {}) { this.props.push({ id, pos: new THREE.Vector3(x, y, z), yaw, collide: o.collide !== false }); return this; }
  /** 経路の目印（ボットのテストと塵の配置避けに使う上面中心） */
  wp(x, y, z) { this.wps.push(new THREE.Vector3(x, y, z)); return this; }
  after(fn) { this.afters.push(fn); return this; }

  // ------------------------------------------------------------ 複合部品
  /** 階段：(x,y,z) から +Z へ。n段・各段 rise/run。手すり付き */
  stairs(n, rise, run, width, mat, o = {}) {
    const { x = 0, y = 0, z = 0, rail = true, railMat = 'rust', dir = 1 } = o;
    for (let i = 0; i < n; i++) {
      const zz = z + dir * (i * run + run / 2);
      this.box(width, 0.16, run + 0.02, mat, { x, y: y + (i + 1) * rise, z: zz, round: 0.02 });
    }
    // 側板（ストリンガー）
    const len = Math.hypot(n * rise, n * run);
    const ang = Math.atan2(n * rise, n * run);
    for (const s of [-1, 1]) {
      this.box(0.08, 0.32, len, railMat, { x: x + s * (width / 2 + 0.04), y: y + n * rise / 2 + 0.16, z: z + dir * n * run / 2, rx: -ang * dir, collide: false, round: 0.01 });
      if (rail) {
        this.tube([x + s * (width / 2 + 0.04), y + 1.0, z], [x + s * (width / 2 + 0.04), y + n * rise + 1.0, z + dir * n * run], 0.035, railMat, {});
        for (let i = 0; i <= n; i += 3) this.tube([x + s * (width / 2 + 0.04), y + i * rise, z + dir * i * run], [x + s * (width / 2 + 0.04), y + i * rise + 1.0, z + dir * i * run], 0.03, railMat, {});
      }
    }
    return { x, y: y + n * rise, z: z + dir * n * run };
  }
  /** 手すり（z0→z1、x 固定） */
  railing(x, y, z0, z1, mat = 'rust', h = 1.0, collide = true) {
    this.tube([x, y + h, z0], [x, y + h, z1], 0.04, mat, { collide });
    this.tube([x, y + h * 0.5, z0], [x, y + h * 0.5, z1], 0.03, mat, {});
    const n = Math.max(1, Math.round(Math.abs(z1 - z0) / 1.4));
    for (let i = 0; i <= n; i++) { const zz = z0 + (z1 - z0) * i / n; this.tube([x, y, zz], [x, y + h, zz], 0.035, mat, {}); }
  }
  /** 横向きの手すり（x0→x1、z 固定） */
  railingX(z, y, x0, x1, mat = 'rust', h = 1.0) {
    this.tube([x0, y + h, z], [x1, y + h, z], 0.04, mat, { collide: true });
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 1.4));
    for (let i = 0; i <= n; i++) { const xx = x0 + (x1 - x0) * i / n; this.tube([xx, y, z], [xx, y + h, z], 0.035, mat, {}); }
  }
  /** 窓（壁面に埋め込むガラスと枠）。face: 'z-' 'x+' など */
  window(x, y, z, w, h, axis, o = {}) {
    const glass = { glass: true };
    if (axis === 'z') {
      this.box(w, h, 0.06, 'glass', { x, y, z, collide: false, round: 0, matOpts: glass });
      this.box(w + 0.16, 0.1, 0.18, o.frame || 'rust', { x, y: y + 0.05, z, collide: false, round: 0.01 });
      this.box(w + 0.16, 0.1, 0.18, o.frame || 'rust', { x, y: y - h + 0.05, z, collide: false, round: 0.01 });
    } else {
      this.box(0.06, h, w, 'glass', { x, y, z, collide: false, round: 0, matOpts: glass });
      this.box(0.18, 0.1, w + 0.16, o.frame || 'rust', { x, y: y + 0.05, z, collide: false, round: 0.01 });
      this.box(0.18, 0.1, w + 0.16, o.frame || 'rust', { x, y: y - h + 0.05, z, collide: false, round: 0.01 });
    }
  }

  // ------------------------------------------------------------ 配置
  bounds(origin, yaw) {
    const m = new THREE.Matrix4().compose(origin, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const out = [];
    const v = new THREE.Vector3();
    for (const p of this.parts) {
      if (p.noBounds) continue;
      if (!p.geo.boundingBox) p.geo.computeBoundingBox();
      // 細長い部材は、長手方向に並べた複数の円で近似する（大きな外接円で周りを塞がない）
      const bb = p.geo.boundingBox;
      const ext = new THREE.Vector3().subVectors(bb.max, bb.min);
      const ctr = new THREE.Vector3().addVectors(bb.min, bb.max).multiplyScalar(0.5);
      const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quat), az = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quat);
      const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quat);
      // 回転後の高さ（おおよそ）
      const hh = (Math.abs(ax.y) * ext.x + Math.abs(ay.y) * ext.y + Math.abs(az.y) * ext.z) / 2;
      const longX = ext.x >= ext.z;
      const L = longX ? ext.x : ext.z, W = longX ? ext.z : ext.x;
      const axis = longX ? ax : az;
      const rr = Math.max(0.6, W / 2);
      const n = Math.max(1, Math.ceil(L / Math.max(2, W)));
      const c0 = ctr.clone().applyQuaternion(p.quat).add(p.pos);
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * (L - W);
        v.copy(c0).addScaledVector(axis, off).applyMatrix4(m);
        out.push({ c: v.clone(), r: n === 1 ? Math.hypot(ext.x, ext.z) / 2 : rr * 1.15, y0: v.y - hh, y1: v.y + hh });
      }
    }
    for (const pr of this.props) {
      const d = this.L.props.dims(pr.id);
      v.copy(pr.pos).applyMatrix4(m);
      out.push({ c: v.clone(), r: Math.hypot(d.hw, d.hd), y0: v.y - d.h, y1: v.y });
    }
    return out;
  }

  /** 既存の構造物とぶつからないか（大きな部品は分割して判定） */
  fits(origin, yaw, ignore) {
    for (const b of this.bounds(origin, yaw)) {
      if (b.r > 0.2 && this.L.collides(b.c, b.r * 0.85, b.y0 - 0.3, b.y1 + 2.4, ignore)) return false;
    }
    return true;
  }

  commit(origin, yaw) {
    const L = this.L, R = L.RAPIER;
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const M = new THREE.Matrix4().compose(origin, qy, new THREE.Vector3(1, 1, 1));
    const body = L.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(origin.x, origin.y, origin.z).setRotation({ x: qy.x, y: qy.y, z: qy.z, w: qy.w }));
    const group = new THREE.Group(); group.position.copy(origin); group.quaternion.copy(qy);
    const rec = L.record({ shape: 'kit', pos: origin.clone(), yaw, zone: this.zi }, body, group, { type: 'circle', r: 2 }, 2);
    rec.kit = this;
    const pm = new THREE.Matrix4();
    for (const p of this.parts) {
      pm.compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1)).premultiply(M);
      const mat = p.matOverride || L.mats.get(p.mat, p.matOpts || {});
      let geo = boxProjectUV(p.geo, p.tile || L.mats.tile(p.mat), new THREE.Vector3(this.r(0, 9), this.r(0, 9), this.r(0, 9)));
      const tint = typeof p.tint === 'number' ? p.tint * this.r(0.9, 1.06) : p.tint;
      bakeColor(geo, tint, { ao: p.ao });
      geo.applyMatrix4(pm);
      L.addToBatch(geo, mat, geo.boundingBox ? (pm.elements[13]) : origin.y);
    }
    for (const c of this.colls) {
      let d;
      if (c.t === 'cuboid') d = R.ColliderDesc.cuboid(...c.a);
      else if (c.t === 'cylinder') d = R.ColliderDesc.cylinder(...c.a);
      else d = R.ColliderDesc.capsule(...c.a);
      d.setTranslation(c.pos.x, c.pos.y, c.pos.z).setRotation({ x: c.q.x, y: c.q.y, z: c.q.z, w: c.q.w }).setFriction(0);
      const col = L.world.createCollider(d, body);
      rec.colliders.push(col); L.byCollider.set(col.handle, rec);
    }
    const v = new THREE.Vector3();
    for (const pr of this.props) {
      v.copy(pr.pos).applyMatrix4(M);
      const pyaw = yaw + pr.yaw;
      L.props.addStatic(pr.id, v.clone(), pyaw, null);
      if (pr.collide) {
        const pq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pr.yaw);
        for (const d of L.props.colliderDescs(pr.id)) {
          const t = d.translation; // ローカル（上面中心基準）→ キット基準へ
          const off = new THREE.Vector3(t.x, t.y, t.z).applyQuaternion(pq).add(pr.pos);
          d.setTranslation(off.x, off.y, off.z).setRotation({ x: pq.x, y: pq.y, z: pq.z, w: pq.w }).setFriction(0);
          const col = L.world.createCollider(d, body);
          rec.colliders.push(col); L.byCollider.set(col.handle, rec);
        }
      }
    }
    // 占有範囲の登録
    for (const b of this.bounds(origin, yaw)) L.occupy(b.c, b.r, b.y0, b.y1 + 2.8, rec);
    rec.wps = this.wps.map((w) => w.clone().applyMatrix4(M));
    const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M);
    for (const fn of this.afters) fn({ toWorld, yaw, origin, rec, M });
    return rec;
  }
}

// =================================================================== セットピース
// 各関数は Kit に部品を積み、出口 { x, y, z, fp, yaw }（ローカル）を返す。
// 入口：最初の足場の手前の縁 z=0、上面 y=0。

const COLORS = { red: 0x9c3a2a, blue: 0x2f5a8a, green: 0x3f6e44, orange: 0xc06a2a, grey: 0x8a8c8e, white: 0xd8d8d0, yellow: 0xc9a23a, teal: 0x3a7a78 };
const tintOf = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export const PIECES = {
  // ------------------------------------------------ スラム
  /** トタン屋根の小屋が連なる。屋根の上を渡り、ときどき壁をよじ登る */
  shackRow(k) {
    const n = 3 + Math.floor(k.r(0, 2.99));
    let z = 0, y = 0, x = 0, last;
    for (let i = 0; i < n; i++) {
      const w = k.r(3, 4.4), d = k.r(3, 4.2), h = k.r(2.8, 3.8) + (i ? 0 : 0);
      const wallMat = k.pick(['plaster', 'bluewood', 'brick', 'shutter']);
      const zc = z + d / 2;
      k.box(w, h, d, wallMat, { x, y: y - 0.22, z: zc, round: 0.06, tint: k.r(0.8, 1.05) });
      k.box(w + 0.7, 0.22, d + 0.7, 'roofiron', { x, y, z: zc, rz: k.r(-0.05, 0.05), round: 0.03 });
      // 前面のシャッター・壁の室外機・窓
      k.prop('rollershutter_door', x + k.r(-0.6, 0.6), y - h - 0.22 + 2.9, z - 0.02, Math.PI, { collide: false });
      if (k.rng() < 0.7) k.prop('exterior_aircon_unit', x + w / 2 + 0.3, y - k.r(0.8, 1.4), zc + k.r(-0.8, 0.8), -Math.PI / 2);
      if (k.rng() < 0.6) k.window(x - w / 2 - 0.01, y - 0.9, zc, 1.0, 0.9, 'x', { frame: 'wood' });
      k.wp(x, y, zc);
      last = { x, y, z: zc, fp: { type: 'rect', hw: w / 2, hd: d / 2 } };
      // 次の小屋：段差は跳べる高さか、よじ登れる高さ
      const climb = k.rng() < 0.3;
      z += d + k.r(0.7, 1.6);
      y += climb ? k.r(1.7, 2.6) : k.r(-0.3, 1.0);
      x += k.r(-1.2, 1.2);
    }
    return { ...last, yaw: 0 };
  },

  /** ガラクタの山：大物を階段状に積み上げる */
  junkPile(k) {
    const ids = ['wooden_crate_01', 'Television_01', 'Barrel_01', 'utility_box_02', 'cardboard_box_01', 'old_tyre', 'vintage_day_bed'];
    const n = 5 + Math.floor(k.r(0, 3));
    let z = 0, y = 0, x = 0, last;
    const L = k.L;
    for (let i = 0; i < n; i++) {
      const id = i === 0 ? 'wooden_crate_01' : k.pick(ids.slice(0, 6));
      const d = L.props.dims(id);
      const zc = z + d.hd;
      k.prop(id, x, y, zc, k.r(-0.3, 0.3));
      // 下に土台（板・トタン・段ボールの山）
      const base = y - d.h;
      const below = base + 6;
      if (below > 0.5) k.box(d.hw * 2 + 0.6, below, d.hd * 2 + 0.6, k.pick(['plywood', 'roofiron', 'bluewood']), { x, y: base, z: zc, round: 0.08, tint: 0.7, rz: k.r(-0.08, 0.08), rx: k.r(-0.06, 0.06) });
      if (k.rng() < 0.6) k.prop('trashbag', x + d.hw + 0.6, base + 0.2, zc + k.r(-1, 1), k.r(0, 6), { collide: false });
      k.wp(x, y, zc);
      last = { x, y, z: zc, fp: L.props.footprint(id) };
      z += d.hd * 2 + k.r(0.5, 1.3);
      y += k.r(0.3, 1.1);
      x += k.r(-1, 1);
    }
    return { ...last, yaw: 0 };
  },

  /** 煉瓦のアパートの非常階段をジグザグに登る */
  fireEscape(k, o = {}) {
    const wallMat = o.wall || 'brick';
    const flights = 2 + Math.floor(k.r(0, 2.99));
    const rise = 0.25, run = 0.32, steps = 9, W = 1.25;
    const H = flights * steps * rise + 4;
    const wallD = 6, wallW = 9;
    // 建物（左側）
    k.box(wallD, H + 6, wallW, wallMat, { x: -W - 0.2 - wallD / 2, y: H + 1, z: wallW / 2 - 1, round: 0.1, tint: k.r(0.85, 1.05) });
    for (let f = 0; f < flights + 1; f++) {
      for (const wz of [0.6, 3.4, 6.2]) k.window(-W - 0.21, f * steps * rise + 2.4, wz, 1.2, 1.4, 'x', { frame: 'rust' });
    }
    let y = 0, zA = 0;
    const land = (zz, yy, rail = true) => {
      k.box(W * 2 + 0.3, 0.12, 1.5, 'grate', { x: 0, y: yy, z: zz, round: 0.01 });
      if (rail) k.railingX(zz + (zz > 1 ? 0.75 : -0.75), yy, -W - 0.15, W + 0.15, 'rust', 1.0);
      k.wp(0, yy, zz);
    };
    land(0.75, 0, false);
    for (let f = 0; f < flights; f++) {
      const dir = f % 2 === 0 ? 1 : -1;
      const sx = f % 2 === 0 ? W / 2 : -W / 2;
      const zs = f % 2 === 0 ? 1.5 : 1.5 + steps * run;
      k.stairs(steps, rise, run, W - 0.1, 'grate', { x: sx, y, z: zs, dir, railMat: 'rust' });
      y += steps * rise;
      zA = f % 2 === 0 ? 1.5 + steps * run + 0.75 : 0.75;
      land(zA, y, f < flights - 1);
    }
    // 最上段から外へ伸びる踊り場
    k.box(W * 2 + 0.3, 0.12, 2.4, 'grate', { x: 0, y, z: zA + 1.9, round: 0.01 });
    k.wp(0, y, zA + 2.2);
    return { x: 0, y, z: zA + 2.2, fp: { type: 'rect', hw: W, hd: 1.2 }, yaw: 0 };
  },

  // ------------------------------------------------ 線路
  /** 高架の線路：バラスト・枕木・レール・橋脚 */
  trackBridge(k, o = {}) {
    const L = o.len ?? k.r(16, 26);
    const deckMat = o.deck || 'concrete';
    k.box(4.4, 0.9, L, deckMat, { x: 0, y: -0.26, z: L / 2, round: 0.08 });
    k.box(3.3, 0.26, L, 'gravel', { x: 0, y: 0, z: L / 2, round: 0.06 });
    for (let s = 0.4; s < L; s += 0.68) k.box(2.6, 0.12, 0.24, 'wood', { x: 0, y: 0.1, z: s, collide: false, round: 0.02, tint: 0.8 });
    for (const sx of [-0.72, 0.72]) k.box(0.1, 0.16, L, 'rust', { x: sx, y: 0.26, z: L / 2, collide: false, round: 0.02 });
    for (let s = 3; s < L; s += 8) k.box(1.5, 10, 1.5, 'concrete', { x: 0, y: -1.15, z: s, round: 0.1, tint: 0.85 });
    // 架線柱
    for (let s = 4; s < L; s += 12) {
      k.tube([2.4, -0.7, s], [2.4, 5.2, s], 0.12, 'rust', { collide: true, cyl: true });
      k.tube([2.4, 5.0, s], [-1.2, 5.0, s], 0.08, 'rust', {});
    }
    for (let s = 2; s < L; s += 6) k.wp(0, 0.13, s);
    return { x: 0, y: 0.13, z: L - 1.2, fp: { type: 'rect', hw: 1.6, hd: 1.2 }, yaw: 0, len: L };
  },

  /** 線路に止まった貨車の列：屋根の上を渡る（最初の車両はよじ登る） */
  train(k) {
    const cars = 2 + Math.floor(k.r(0, 2.99));
    const lens = Array.from({ length: cars }, () => k.r(9, 13));
    const total = lens.reduce((a, b) => a + b, 0) + (cars - 1) * 1.3 + 6;
    PIECES.trackBridge(k, { len: total });
    let z = 3, last;
    for (let i = 0; i < cars; i++) {
      const Lc = lens[i];
      const kind = k.pick(['box', 'box', 'tank']);
      const col = tintOf(k.pick([COLORS.red, COLORS.blue, COLORS.green, COLORS.orange, COLORS.grey, COLORS.teal]), k.r(0.85, 1.1));
      const zc = z + Lc / 2;
      // 台車と車輪
      for (const bz of [z + 1.6, z + Lc - 1.6]) {
        k.box(2.2, 0.5, 2.4, 'rust', { x: 0, y: 1.0, z: bz, round: 0.05, collide: false, tint: 0.6 });
        for (const wz of [-0.7, 0.7]) for (const wx of [-0.75, 0.75]) k.tube([wx - 0.08, 0.6, bz + wz], [wx + 0.08, 0.6, bz + wz], 0.45, 'rust', { seg: 16, tint: 0.5 });
      }
      k.box(2.7, 0.3, Lc, 'rust', { x: 0, y: 1.4, z: zc, round: 0.04, tint: 0.55 });
      if (kind === 'box') {
        k.box(2.9, 2.0, Lc - 0.2, 'freight', { x: 0, y: 3.4, z: zc, round: 0.08, tint: col });
        // 側面のリブと扉
        for (let s = z + 0.6; s < z + Lc - 0.4; s += 0.9) for (const sx of [-1.47, 1.47]) k.box(0.06, 1.9, 0.08, 'freight', { x: sx, y: 3.35, z: s, collide: false, round: 0.01, tint: col.clone().multiplyScalar(0.8) });
        for (const sx of [-1.49, 1.49]) k.box(0.05, 1.7, 2.2, 'rust', { x: sx, y: 3.25, z: zc, collide: false, round: 0.01, tint: 0.7 });
        k.box(2.5, 0.08, Lc - 0.6, 'metalplate', { x: 0, y: 3.48, z: zc, collide: false, round: 0.02, tint: 0.7 });
      } else {
        // タンク車：上に歩廊
        k.tube([0, 2.8, z + 0.4], [0, 2.8, z + Lc - 0.4], 1.35, 'greenmetal', { seg: 28, collide: true, cyl: true, tint: col.clone().lerp(new THREE.Color(1, 1, 1), 0.3) });
        k.box(0.8, 0.1, Lc - 1.2, 'grate', { x: 0, y: 4.25, z: zc, round: 0.01 });
        k.railing(0.5, 4.25, z + 1, z + Lc - 1, 'rust', 0.9, false);
      }
      const top = kind === 'box' ? 3.4 : 4.25;
      k.wp(0, top, zc);
      last = { x: 0, y: top, z: z + Lc - 1.5, fp: { type: 'rect', hw: kind === 'box' ? 1.4 : 0.4, hd: 1.5 } };
      z += Lc + 1.3;
    }
    return { ...last, yaw: 0 };
  },

  // ------------------------------------------------ 工場
  /** 太い配管の上を歩く（フランジと支持架付き） */
  pipeRun(k) {
    const segs = 2 + Math.floor(k.r(0, 1.99));
    let z = 0, y = 0, x = 0, last;
    const r = k.r(0.6, 0.8);
    for (let s = 0; s < segs; s++) {
      const len = k.r(7, 12);
      const c = new THREE.Vector3(x, y - r, z + len / 2);
      k.tube([x, y - r, z], [x, y - r, z + len], r, 'rust', { seg: 24, collide: true, cyl: true, tint: k.r(0.85, 1.05) });
      for (let f = z + 1; f < z + len; f += 3) k.tube([x, y - r, f - 0.09], [x, y - r, f + 0.09], r + 0.12, 'metalplate', { seg: 24, tint: 0.7 });
      // 並走する細い管と支持架
      k.tube([x + r + 0.6, y - r - 0.4, z], [x + r + 0.6, y - r - 0.4, z + len], 0.28, 'greenmetal', { seg: 14 });
      for (let f = z + 2; f < z + len; f += 5) {
        k.box(3.2, 0.3, 0.3, 'rust', { x: x + 0.4, y: y - 2 * r - 0.05, z: f, collide: true, round: 0.03, tint: 0.6 });
        k.box(0.3, 6, 0.3, 'rust', { x: x + 1.9, y: y - 2 * r - 0.05, z: f, round: 0.03, tint: 0.6 });
      }
      k.wp(x, y, c.z);
      last = { x, y, z: z + len - 0.6, fp: { type: 'rect', hw: r * 0.5, hd: 0.6 } };
      // 継ぎ目：少し上がる
      if (s < segs - 1) {
        const ny = y + k.r(0.4, 1.0);
        k.cyl(r + 0.25, (ny - y) + 2 * r + 0.4, 'metalplate', { x, y: ny, z: z + len + 0.45, tint: 0.8 });
        y = ny; z += len + 0.9; x += k.r(-0.6, 0.6);
      }
    }
    return { ...last, yaw: 0 };
  },

  /** 鉄格子の足場と階段（手すり付き） */
  catwalk(k) {
    const L1 = k.r(8, 13);
    k.box(1.6, 0.14, L1, 'grate', { x: 0, y: 0, z: L1 / 2, round: 0.01 });
    k.railing(-0.8, 0, 0.2, L1, 'paintedmetal', 1.0);
    for (let s = 1; s < L1; s += 3.5) {
      k.box(2.2, 0.2, 0.2, 'rust', { x: 0, y: -0.15, z: s, collide: false, round: 0.02 });
      k.tube([1.0, -0.3, s], [1.6, -6, s], 0.09, 'rust', {});
    }
    k.wp(0, 0, L1 / 2);
    const top = k.stairs(10, 0.27, 0.34, 1.3, 'grate', { x: 0, y: 0, z: L1, railMat: 'paintedmetal' });
    const L2 = k.r(5, 9);
    k.box(1.6, 0.14, L2, 'grate', { x: 0, y: top.y, z: top.z + L2 / 2, round: 0.01 });
    k.railing(0.8, top.y, top.z, top.z + L2, 'paintedmetal', 1.0);
    k.wp(0, top.y, top.z + L2 / 2);
    return { x: 0, y: top.y, z: top.z + L2 - 0.8, fp: { type: 'rect', hw: 0.8, hd: 0.8 }, yaw: 0 };
  },

  /** 貯蔵タンクの屋根を跳び移る */
  tankFarm(k) {
    const n = 3 + Math.floor(k.r(0, 1.99));
    let z = 0, y = 0, x = 0, last;
    for (let i = 0; i < n; i++) {
      const r = k.r(2.4, 3.4), h = k.r(7, 12);
      const zc = z + r;
      const col = tintOf(k.pick([COLORS.white, COLORS.grey, COLORS.teal, 0xb8b0a0]), k.r(0.85, 1.05));
      k.cyl(r, h, 'metalplate', { x, y: y - 0.3, z: zc, seg: 36, tint: col });
      k.cyl(r * 0.96, 0.3, 'rust', { x, y, z: zc, rTop: r * 0.6, seg: 36, tint: 0.8 });
      k.cyl(r * 0.6, 0.12, 'grate', { x, y: y + 0.12, z: zc, seg: 24 });
      // 帯と配管
      for (let b = 1; b < h; b += 2.5) k.cyl(r + 0.05, 0.12, 'rust', { x, y: y - 0.3 - b, z: zc, seg: 36, collide: false, tint: 0.6 });
      if (i > 0) k.tube([x - r * 0.7, y - 2, zc - r], [x - r * 0.7, y - 2.5, zc - r - 1.5], 0.3, 'greenmetal', {});
      k.wp(x, y + 0.12, zc);
      last = { x, y: y + 0.12, z: zc, fp: { type: 'circle', r: r * 0.6 } };
      const climb = k.rng() < 0.35;
      z += 2 * r + k.r(0.9, 1.8);
      y += climb ? k.r(1.6, 2.4) : k.r(0.2, 1.0);
      x += k.r(-1.5, 1.5);
    }
    return { ...last, yaw: 0 };
  },

  // ------------------------------------------------ 地下鉄
  /** 地下鉄の車両（屋根の上を歩く）＋タイル張りのホーム */
  subway(k) {
    const Lp = k.r(14, 20);
    // ホーム
    k.box(3.6, 1.2, Lp, 'terrazzo', { x: 0, y: 0, z: Lp / 2, round: 0.06 });
    k.box(0.3, 0.02, Lp, 'paintedmetal', { x: 1.6, y: 0.01, z: Lp / 2, collide: false, round: 0, tint: tintOf(0xd8b030) });
    k.box(0.6, 5.5, Lp + 2, 'tilewall', { x: -2.1, y: 5.5, z: Lp / 2, round: 0.04 });
    for (let s = 2; s < Lp; s += 5) {
      k.box(0.7, 4.2, 0.7, 'tilewall', { x: 1.3, y: 4.2, z: s, round: 0.05, tint: 0.95 });
      k.box(1.6, 0.45, 0.5, 'wood', { x: -1.2, y: 0.45, z: s + 2.2, round: 0.05 });
    }
    k.box(0.12, 0.9, 3, 'bluemetal', { x: -1.75, y: 3.8, z: Lp / 2, collide: false, round: 0.02, tint: tintOf(0x2a4a8a) });
    k.wp(0, 0, Lp / 3); k.wp(0, 0, Lp * 0.75);
    // 車両（ホームの横、屋根に登る）
    const Lc = Lp - 2;
    const cx = 3.9;
    k.box(3.0, 3.1, Lc, 'metalplate', { x: cx, y: 3.0, z: Lp / 2, round: 0.18, tint: tintOf(0xc8ccd0) });
    for (let s = 1.2; s < Lc; s += 2.4) for (const sx of [cx - 1.51, cx + 1.51]) k.window(sx, 2.4, s + 1, 1.3, 1.0, 'x', { frame: 'metalplate' });
    k.box(3.02, 0.25, Lc, 'paintedmetal', { x: cx, y: 1.4, z: Lp / 2, collide: false, round: 0.04, tint: tintOf(0x3a6ab0) });
    for (let s = 2; s < Lc; s += 4.5) k.box(1.4, 0.4, 1.6, 'metalplate', { x: cx, y: 3.4, z: s + 1, round: 0.1, tint: 0.75 });
    k.wp(cx, 3.0, Lp - 2);
    return { x: cx, y: 3.0, z: Lp - 1.6, fp: { type: 'rect', hw: 1.4, hd: 1.4 }, yaw: 0 };
  },

  // ------------------------------------------------ 工事現場
  /** 積み上げたコンテナを、よじ登りながら上がる */
  containers(k) {
    const n = 3 + Math.floor(k.r(0, 2.99));
    let z = 0, y = 0, x = 0, last;
    const one = (cx, top, cz, rot) => {
      const col = tintOf(k.pick([COLORS.red, COLORS.blue, COLORS.green, COLORS.orange, COLORS.grey, COLORS.white, COLORS.teal, COLORS.yellow]), k.r(0.8, 1.05));
      const W = 2.44, H = 2.59, D = 6.06;
      k.box(W, H, D, 'freight', { x: cx, y: top, z: cz, ry: rot, round: 0.04, tint: col });
      // 枠
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.14, H, 0.14, 'rust', { x: cx + sx * (W / 2 - 0.05), y: top + 0.01, z: cz + sz * (D / 2 - 0.05), collide: false, round: 0.01, tint: col.clone().multiplyScalar(0.7) });
      for (const dx of [-0.5, -0.15, 0.15, 0.5]) k.box(0.05, H - 0.3, 0.05, 'rust', { x: cx + dx, y: top - 0.15, z: cz - D / 2 - 0.03, collide: false, round: 0 });
    };
    for (let i = 0; i < n; i++) {
      const zc = z + 3.03;
      one(x, y, zc, 0);
      // ときどき横にもう一段（背景の山）
      if (k.rng() < 0.5) one(x + 2.6, y - 2.59 * (k.rng() < 0.5 ? 0 : 1), zc + k.r(-1, 1), 0);
      if (y > 2.6) one(x, y - 2.59, zc, 0);
      k.wp(x, y, zc);
      last = { x, y, z: zc + 2, fp: { type: 'rect', hw: 1.2, hd: 1.5 } };
      const up = k.rng() < 0.55; // よじ登る段
      z += 6.06 + (up ? k.r(-1.5, -0.5) : k.r(0.6, 1.6));
      if (up) { y += 2.59; z += 1.5; }
      else y += k.r(-0.2, 0.6);
      x += k.r(-0.8, 0.8);
    }
    return { ...last, yaw: 0 };
  },

  /** 足場（パイプと板）：互い違いの板の縁につかまって登る */
  scaffold(k) {
    const levels = 3 + Math.floor(k.r(0, 1.99));
    const W = 2.4, D = 4.2, LH = 2.4, step = D - 1.2;
    let z0 = 0, last;
    for (let l = 0; l < levels; l++) {
      const y = l * LH;
      k.box(W, 0.22, D, 'plywood', { x: 0, y, z: z0 + D / 2, round: 0.02 });
      for (const sx of [-W / 2, W / 2]) for (const sz of [z0, z0 + D]) k.tube([sx, y - LH * 2, sz], [sx, y + 1.1, sz], 0.05, 'rust', { collide: true });
      for (const sz of [z0, z0 + D]) k.tube([-W / 2, y + 1.0, sz], [W / 2, y + 1.0, sz], 0.04, 'rust', {});
      k.tube([-W / 2, y + 1.0, z0], [-W / 2, y + 1.0, z0 + D], 0.04, 'rust', {});
      k.tube([-W / 2, y - LH, z0], [-W / 2, y, z0 + D], 0.04, 'rust', {});
      k.wp(0, y, z0 + D / 2);
      last = { x: 0, y, z: z0 + D - 0.6, fp: { type: 'rect', hw: W / 2, hd: 0.6 } };
      z0 += step;
    }
    return { ...last, yaw: 0 };
  },

  // ------------------------------------------------ 道路
  /** 高架の道路：アスファルト・車線・ガードレール・街灯・放置車両 */
  highway(k) {
    const L = k.r(20, 30), W = 7.2;
    k.box(W, 1.0, L, 'asphalt', { x: 0, y: 0, z: L / 2, round: 0.06 });
    k.box(W + 0.6, 0.6, L, 'concrete', { x: 0, y: -1.0, z: L / 2, round: 0.08, tint: 0.8 });
    for (let s = 1; s < L; s += 4) k.box(0.15, 0.015, 2, 'whiteplaster', { x: 0, y: 0.012, z: s + 1, collide: false, round: 0, tint: 1.2 });
    for (const sx of [-W / 2 + 0.25, W / 2 - 0.25]) {
      k.box(0.06, 0.32, L, 'metalplate', { x: sx, y: 0.85, z: L / 2, round: 0.02, tint: 0.9 });
      for (let s = 0.5; s < L; s += 2) k.box(0.12, 0.85, 0.12, 'metalplate', { x: sx, y: 0.85, z: s, collide: false, round: 0.01, tint: 0.7 });
    }
    for (let s = 6; s < L; s += 12) k.box(2.2, 14, 2.2, 'concrete', { x: 0, y: -1.6, z: s, round: 0.15, tint: 0.85 });
    for (let s = 4; s < L; s += 10) k.prop('street_lamp_01', W / 2 - 0.4, 0, s, -Math.PI / 2, { collide: false });
    if (k.rng() < 0.5) busOn(k, k.r(-1.4, 1.4), k.r(3, L - 13));
    const cars = 1 + Math.floor(k.r(0, 2.99));
    for (let c = 0; c < cars; c++) k.prop('covered_car', k.r(-1.6, 1.6), 0, k.r(4, L - 4), k.r(-0.3, 0.3) + (k.rng() < 0.5 ? Math.PI : 0));
    for (let s = 3; s < L; s += 7) k.wp(0, 0, s);
    return { x: 0, y: 0, z: L - 1.2, fp: { type: 'rect', hw: W / 2 - 0.5, hd: 1.2 }, yaw: 0 };
  },

  // ------------------------------------------------ モール
  /** 店の床：棚やレジを足場に、奥の上の階へ */
  storeFloor(k, o = {}) {
    const lux = o.lux ?? k.rng() < 0.5;
    const W = 9, D = k.r(10, 13);
    k.box(W, 0.6, D, lux ? 'marbletile' : 'terrazzo', { x: 0, y: 0, z: D / 2, round: 0.04 });
    k.box(W + 0.2, 0.3, D + 0.2, 'whiteplaster', { x: 0, y: -0.6, z: D / 2, round: 0.05, collide: false, tint: 0.9 });
    // 背面の壁と店先のガラス
    k.box(0.4, 4.5, D, 'whiteplaster', { x: -W / 2 + 0.2, y: 4.5, z: D / 2, round: 0.04 });
    for (let s = 1.5; s < D - 1; s += 3.2) k.window(-W / 2 + 0.42, 3.5, s + 1.2, 2.6, 2.8, 'x', { frame: 'metalplate' });
    // ガラスの手すり（落下防止にはならない低さ）
    k.box(0.05, 0.95, D, 'glass', { x: W / 2 - 0.1, y: 0.95, z: D / 2, collide: false, round: 0, matOpts: { glass: true, opacity: 0.35, color: 0x9ab0b8 } });
    // 棚やレジで上へ
    const decor = lux ? ['modern_arm_chair_01', 'CoffeeCart_01', 'modern_arm_chair_01'] : ['wooden_display_shelves_01', 'wooden_display_shelves_01', 'CoffeeCart_01'];
    for (let i = 0; i < 5; i++) { const id = k.pick(decor); k.prop(id, k.r(-3.2, -1.6), k.L.props.dims(id).h, 1 + i * (D - 2) / 4, Math.PI / 2 + k.r(-0.2, 0.2)); }
    // 中二階
    const midH = k.r(1.8, 2.5);
    k.box(3.2, 0.3, 3.2, lux ? 'marbletile' : 'terrazzo', { x: 2, y: midH, z: D - 2, round: 0.05 });
    k.cyl(0.25, midH, 'metalplate', { x: 2, y: midH - 0.3, z: D - 2 });
    k.prop('CashRegister_01', 2.2, 0, D * 0.45, Math.PI / 2);
    k.wp(0, 0, D * 0.3); k.wp(2, midH, D - 2);
    if (lux) k.after(({ toWorld }) => k.L.addHanging('Chandelier_01', toWorld(0, 6.5, D / 2)));
    return { x: 2, y: midH, z: D - 1.2, fp: { type: 'rect', hw: 1.6, hd: 1.2 }, yaw: 0 };
  },

  /** エスカレーター */
  escalator(k) {
    const steps = 16, rise = 0.24, run = 0.42, W = 1.4;
    k.box(2.4, 0.3, 2, 'metalplate', { x: 0, y: 0, z: 1, round: 0.03 });
    const top = k.stairs(steps, rise, run, W, 'metalplate', { x: 0, y: 0, z: 2, rail: false });
    const len = Math.hypot(steps * rise, steps * run), ang = Math.atan2(steps * rise, steps * run);
    for (const sx of [-W / 2 - 0.12, W / 2 + 0.12]) {
      k.box(0.08, 1.0, len, 'glass', { x: sx, y: steps * rise / 2 + 1.0, z: 2 + steps * run / 2, rx: -ang, collide: false, round: 0, matOpts: { glass: true, opacity: 0.4, color: 0x9ab0b8 } });
      k.box(0.12, 0.08, len, 'rust', { x: sx, y: steps * rise / 2 + 1.05, z: 2 + steps * run / 2, rx: -ang, collide: false, round: 0.02, tint: 0.3 });
    }
    k.box(W + 0.6, 0.6, len, 'metalplate', { x: 0, y: steps * rise / 2 - 0.25, z: 2 + steps * run / 2, rx: -ang, collide: false, round: 0.04, tint: 0.6 });
    k.box(2.4, 0.3, 2, 'metalplate', { x: 0, y: top.y, z: top.z + 1, round: 0.03 });
    k.wp(0, 0, 1); k.wp(0, top.y, top.z + 1);
    return { x: 0, y: top.y, z: top.z + 1, fp: { type: 'rect', hw: 1.2, hd: 1 }, yaw: 0 };
  },

  // ------------------------------------------------ 社長室
  officeFloor(k, o = {}) {
    const gold = o.gold;
    const W = 10, D = k.r(10, 13);
    k.box(W, 0.5, D, gold ? 'metalplate' : k.pick(['carpet', 'woodfloor']), { x: 0, y: 0, z: D / 2, round: 0.04, matOpts: gold ? { gold: true } : undefined });
    k.box(W, 0.6, D, 'facade', { x: 0, y: -0.5, z: D / 2, round: 0.05, collide: false, tint: 0.8 });
    k.box(0.4, 4.2, D, gold ? 'whiteplaster' : 'facade', { x: -W / 2 + 0.2, y: 4.2, z: D / 2, round: 0.04 });
    for (let s = 1; s < D - 1; s += 2.6) k.window(-W / 2 + 0.42, 3.6, s + 1, 2.0, 2.6, 'x', { frame: 'metalplate' });
    // 机とキャビネットを足場に
    let y = 0, z = 1.5, x = 1.5;
    for (let i = 0; i < 4; i++) {
      const id = i % 2 ? 'drawer_cabinet' : 'metal_office_desk';
      const d = k.L.props.dims(id);
      k.prop(id, x, y + d.h, z + d.hd, 0);
      if (id === 'metal_office_desk') k.prop('classic_laptop', x - 0.8, y + d.h + k.L.props.dims('classic_laptop').h, z + d.hd, Math.PI, { collide: false });
      k.wp(x, y + d.h, z + d.hd);
      z += d.hd * 2 + 0.7; x = -x * 0.6;
      if (z > D - 2) break;
    }
    if (gold) {
      // 金塊と札束
      for (let i = 0; i < 10; i++) {
        const gx = k.r(-3, 3.5), gz = k.r(1, D - 1), gh = k.r(0.4, 1.2);
        k.geom(new THREE.CylinderGeometry(0.5, 0.8, gh, 4).rotateY(Math.PI / 4).translate(0, gh / 2, 0).scale(1.6, 1, 0.8), 'metalplate', { x: gx, z: gz, ry: k.r(0, 3), matOpts: { gold: true } });
      }
      for (let i = 0; i < 8; i++) k.box(1.2, k.r(0.3, 0.9), 0.6, 'fabric', { x: k.r(-3, 3.5), y: k.r(0.3, 0.9), z: k.r(1, D - 1), ry: k.r(0, 3), collide: false, tint: tintOf(0x5a8a52), round: 0.02 });
      k.prop('marble_bust_01', 3.4, k.L.props.dims('marble_bust_01').h, D - 1.6, Math.PI);
      k.after(({ toWorld }) => { k.L.addHanging('Chandelier_01', toWorld(0, 5.5, D * 0.3)); k.L.addHanging('Chandelier_01', toWorld(0, 5.5, D * 0.75)); });
    }
    k.wp(0, 0, D - 1);
    return { x: 0, y: 0, z: D - 1, fp: { type: 'rect', hw: W / 2 - 0.5, hd: 1 }, yaw: 0 };
  },

  // ------------------------------------------------ ビル
  /** ビルの壁：窓の庇と室外機を足場に、よじ登って屋上へ */
  facadeClimb(k) {
    const W = 9, D = 7, floors = 3 + Math.floor(k.r(0, 2.99)), FH = 3.0;
    const H = floors * FH + 1;
    // 窓台（よじ登りの足場）を左右交互に
    const sillZ = 0.32;
    let x = 0;
    for (let f = 0; f < floors; f++) {
      const y = f * FH;
      x = f === 0 ? 0 : (k.rng() < 0.5 ? -1 : 1) * k.r(0.8, 2.4);
      k.box(2.0, 0.22, 0.65, 'concrete', { x, y, z: sillZ, round: 0.04, tint: 0.95 });
      k.window(x, y + 2.2, 0.66, 1.6, 1.8, 'z', { frame: 'metalplate' });
      if (k.rng() < 0.5) k.prop('exterior_aircon_unit', x + (x > 0 ? -2.4 : 2.4), y + 0.6, 0.35, Math.PI);
      k.wp(x, y, sillZ);
    }
    const roofY = floors * FH - 0.2;
    k.box(W, H, D, 'facade', { x: 0, y: roofY, z: 0.65 + D / 2, round: 0.12, tint: k.r(0.85, 1.05) });
    // 雨どい・屋上の手すり壁・給水塔
    k.tube([W / 2 - 0.4, -8, 0.6], [W / 2 - 0.4, roofY, 0.6], 0.12, 'rust', {});
    k.box(W, 0.6, 0.3, 'facade', { x: 0, y: roofY + 0.6, z: 0.8, round: 0.05, tint: 0.85 });
    k.cyl(1.2, 2.2, 'wood', { x: -2.6, y: roofY + 3.6, z: D - 1.6, tint: 0.8 });
    for (const sx of [-3.4, -1.8]) k.tube([sx, roofY, D - 1.6], [sx, roofY + 1.4, D - 1.6], 0.08, 'rust', { collide: true });
    k.box(1.6, 1.0, 1.4, 'metalplate', { x: 2.5, y: roofY + 1.0, z: D / 2 + 0.6, round: 0.08, tint: 0.7 });
    k.wp(0, roofY, 0.65 + D / 2);
    return { x: 0, y: roofY, z: 0.65 + D - 0.8, fp: { type: 'rect', hw: W / 2 - 0.5, hd: 0.8 }, yaw: 0 };
  },

  // ------------------------------------------------ 天国の階段
  stairway(k) {
    const flights = 2 + Math.floor(k.r(0, 1.99));
    let y = 0, z = 0, x = 0, last;
    for (let f = 0; f < flights; f++) {
      const n = 10 + Math.floor(k.r(0, 8));
      k.box(3, 0.4, 2.4, 'marble', { x, y, z: z + 1.2, round: 0.06 });
      const top = k.stairs(n, 0.24, 0.48, 2.6, 'marble', { x, y, z: z + 2.4, rail: false });
      for (let i = 0; i <= n; i += 3) for (const sx of [-1.45, 1.45]) k.cyl(0.13, 0.9, 'marble', { x: x + sx, y: y + i * 0.24 + 0.9, z: z + 2.4 + i * 0.48, seg: 12, collide: false });
      k.wp(x, y, z + 1.2);
      y = top.y; z = top.z;
      x += k.r(-1.5, 1.5);
    }
    k.box(3.4, 0.4, 3, 'marble', { x: 0, y, z: z + 1.5, round: 0.06 });
    k.wp(0, y, z + 1.5);
    last = { x: 0, y, z: z + 1.8, fp: { type: 'rect', hw: 1.6, hd: 1.4 } };
    return { ...last, yaw: 0 };
  },

  /** 列柱の神殿 */
  temple(k) {
    const W = 10, D = 12;
    k.box(W, 1.2, D, 'marble', { x: 0, y: 0, z: D / 2, round: 0.1 });
    for (let s = 0; s < 3; s++) k.box(W + 1.2 + s * 1.2, 0.4, D + 1.2 + s * 1.2, 'marble', { x: 0, y: -1.2 - s * 0.4, z: D / 2, round: 0.05, collide: false, tint: 0.92 });
    for (let i = 0; i < 4; i++) for (const sx of [-W / 2 + 0.8, W / 2 - 0.8]) {
      const zz = 1 + i * (D - 2) / 3;
      k.cyl(0.42, 5, 'marble', { x: sx, y: 5, z: zz, seg: 20, rTop: 0.36 });
      k.box(1.1, 0.3, 1.1, 'marble', { x: sx, y: 5.3, z: zz, round: 0.03, collide: false });
    }
    k.box(W + 0.8, 0.6, D + 0.6, 'marble', { x: 0, y: 5.9, z: D / 2, round: 0.06, collide: false });
    for (const s2 of [-1, 1]) k.box(W / 2 + 1.2, 0.25, D + 1.4, 'rooftile', { x: s2 * (W / 4 + 0.3), y: 7.3, z: D / 2, rz: -s2 * 0.38, collide: false, round: 0.03 });
    k.prop('gothic_statue', 0, k.L.props.dims('gothic_statue').h, D / 2, k.r(0, 6), { collide: true });
    k.wp(-2, 0, D * 0.25); k.wp(2, 0, D * 0.8);
    return { x: 0, y: 0, z: D - 1, fp: { type: 'rect', hw: W / 2 - 1, hd: 1 }, yaw: 0 };
  },
};

/** 道路に止まったバス（屋根に登れる） */
function busOn(k, x, z) {
  const L = 11;
  const col = tintOf(k.pick([0xd8b030, 0x3a7ab0, 0xc04a3a, 0x4a9a5a]), k.r(0.9, 1.05));
  for (const wz of [2, L - 2]) for (const sx of [-1.1, 1.1]) k.tube([x + sx - 0.15, 0.55, z + wz], [x + sx + 0.15, 0.55, z + wz], 0.55, 'rust', { seg: 18, tint: 0.3 });
  k.box(2.55, 2.6, L, 'metalplate', { x, y: 3.1, z: z + L / 2, round: 0.2, tint: col });
  for (let s = 1.5; s < L - 0.8; s += 1.6) for (const sx of [-1.28, 1.28]) k.window(x + sx, 2.7, z + s, 1.3, 1.0, 'x', { frame: 'metalplate' });
  k.window(x, 2.8, z - 0.01, 2.0, 1.2, 'z', { frame: 'metalplate' });
  k.box(2.5, 0.5, 0.6, 'rust', { x, y: 1.0, z: z - 0.2, round: 0.08, tint: 0.4 });
}

/** 観覧車：ゴンドラに乗って一気に上へ（ゴンドラは Level 側で動かす） */
export function buildFerris(k, R) {
  const cy = R + 2.2;
  // 乗り場
  k.box(4, 0.4, 3, 'bluemetal', { x: 0, y: 0, z: 1.5, round: 0.04 });
  k.wp(0, 0, 1.5);
  // 脚（A字）とハブ
  const C = new THREE.Vector3(0, cy, 3.5);
  for (const sx of [-2.8, 2.8]) for (const dz of [-R * 0.5, R * 0.5]) {
    k.tube([sx, -6, C.z + dz], [sx * 0.6, cy, C.z], 0.38, 'bluemetal', { tint: 0.85, collide: false });
  }
  // リム（2重）とスポーク：yz 平面
  const rimSeg = 40;
  for (const sx of [-1.4, 1.4]) {
    for (let i = 0; i < rimSeg; i++) {
      const a0 = (i / rimSeg) * Math.PI * 2, a1 = ((i + 1) / rimSeg) * Math.PI * 2;
      k.tube([sx, C.y + Math.sin(a0) * R, C.z + Math.cos(a0) * R], [sx, C.y + Math.sin(a1) * R, C.z + Math.cos(a1) * R], 0.16, 'bluemetal', { seg: 8 });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.tube([sx, C.y, C.z], [sx, C.y + Math.sin(a) * R, C.z + Math.cos(a) * R], 0.07, 'rust', { seg: 6 });
    }
  }
  k.tube([-1.8, C.y, C.z], [1.8, C.y, C.z], 0.6, 'metalplate', { seg: 20 });
  k.parts.forEach((p) => { if (p.mat === 'bluemetal' || p.mat === 'rust') p.noBounds = p.geo.type === 'CylinderGeometry'; });
  return { center: C, R };
}
