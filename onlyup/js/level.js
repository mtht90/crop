import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { boxProjectUV, makeFlagMaterial, makeBeamMaterial, makePadMaterial } from './materials.js';

// ---- プレイヤー物理と同じ定数で「届く距離」を計算し、必ずクリア可能な配置を作る ----
export const PHYS = { G: 26, JUMP_V: 10, RUN: 7.0, SPRINT: 9.2 };
function reach(dy, speed = PHYS.RUN) {
  const d = PHYS.JUMP_V ** 2 - 2 * PHYS.G * dy;
  if (d < 0) return 0;
  return speed * (PHYS.JUMP_V + Math.sqrt(d)) / PHYS.G;
}

export const ZONES = [
  { key: 'shore', name: '潮騒の岩礁', en: 'TIDE ROCKS', count: 22, gap: [1.1, 2.3], rise: [0.4, 1.1], safety: 0.6,
    shapes: { rock: 5, rockSmall: 2, sandrock: 2 }, behaviors: { static: 10 }, mat: 'rock', cp: 'sandrock', tint: [1.0, 1.0] },
  { key: 'scaffold', name: '朽ちた足場', en: 'ROTTEN SCAFFOLD', count: 28, gap: [1.3, 2.6], rise: [0.5, 1.25], safety: 0.63,
    shapes: { plank: 4, crate: 3, beam: 2 }, behaviors: { static: 7, mover: 2, elevator: 1 }, mat: 'wood', cp: 'wood', tint: [1.0, 1.02] },
  { key: 'works', name: '錆びた工業区', en: 'RUST WORKS', count: 30, gap: [1.4, 2.8], rise: [0.6, 1.35], safety: 0.66,
    shapes: { pipe: 4, container: 2, plate: 3 }, behaviors: { static: 6, rotator: 2, sweeper: 1.5, mover: 1.5 }, mat: 'rust', cp: 'iron', tint: [1.04, 0.96] },
  { key: 'ruins', name: '崩れゆく都市', en: 'CRUMBLING CITY', count: 30, gap: [1.5, 2.9], rise: [0.6, 1.4], safety: 0.68,
    shapes: { slab: 4, brickPillar: 3 }, behaviors: { static: 5, crumble: 3.5, mover: 1.5, elevator: 1 }, mat: 'concrete', cp: 'brick', tint: [1.0, 0.92] },
  { key: 'frost', name: '凍てつく雲海', en: 'FROZEN SKIES', count: 30, gap: [1.5, 3.0], rise: [0.6, 1.4], safety: 0.7, wind: 0.4,
    shapes: { snowRock: 3, iceSlab: 4 }, behaviors: { static: 6, mover: 1.5, crumble: 1.5, rotator: 1 }, mat: 'snow', cp: 'snow', tint: [0.95, 1.1] },
  { key: 'temple', name: '天空の神殿', en: 'SKY TEMPLE', count: 28, gap: [1.6, 3.1], rise: [0.7, 1.5], safety: 0.72,
    shapes: { column: 4, marbleSlab: 3 }, behaviors: { static: 5, bounce: 2, rotator: 1.2, sweeper: 1, crumble: 1.5, mover: 1 }, mat: 'marble', cp: 'marble', tint: [1.05, 1.15] },
];

const R_MAX = 34; // 塔の中心軸からの最大半径

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Level {
  constructor({ RAPIER, world, scene, mats, misc, seed = 20261016 }) {
    Object.assign(this, { RAPIER, world, scene, mats, misc });
    this.rng = mulberry32(seed);
    this.noise = createNoise3D(mulberry32(seed + 7));
    this.platforms = [];
    this.byCollider = new Map();
    this.checkpoints = [];
    this.hazards = [];
    this.winds = [];
    this.animated = []; // シェーダー時間更新対象
    this.zoneStarts = [];
    this.root = new THREE.Group();
    scene.add(this.root);
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
  }

  rnd(a, b) { return a + (b - a) * this.rng(); }
  pick(weights) {
    const entries = Object.entries(weights);
    let sum = 0; for (const [, w] of entries) sum += w;
    let r = this.rng() * sum;
    for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
    return entries[0][0];
  }

  // ------------------------------------------------------------------ geometry
  rockGeometry(rTop, rBottom, h, seg = 16, jag = 0.18) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 6, false);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const n = this.noise, s = this.rnd(0, 100);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const top01 = (v.y + h / 2) / h;
      if (v.y < h / 2 - 1e-4) {
        const k = 1 + n(v.x * 0.45 + s, v.y * 0.45, v.z * 0.45) * jag + n(v.x * 1.3, v.y * 1.3 + s, v.z * 1.3) * jag * 0.35;
        v.x *= k; v.z *= k;
        v.y += n(v.x * 0.8 + s, v.y * 0.3, v.z * 0.8) * h * 0.05 * (1 - top01);
      } else if (Math.hypot(v.x, v.z) > rTop * 0.95) {
        const k = 1 + n(v.x * 0.45 + s, v.y * 0.45, v.z * 0.45) * jag * 0.35;
        v.x *= k; v.z *= k;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  /** shape spec → { geo, colliderDescs, footprint, h } （原点＝上面中心） */
  buildShape(spec) {
    const R = this.RAPIER;
    const descs = [];
    let geo, footprint, h;
    switch (spec.shape) {
      case 'box': {
        const { w, d } = spec; h = spec.h;
        geo = new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0);
        descs.push(R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(0, -h / 2, 0));
        footprint = { type: 'rect', hw: w / 2, hd: d / 2 };
        break;
      }
      case 'cyl': {
        const { r } = spec; h = spec.h;
        geo = new THREE.CylinderGeometry(r, r * (spec.taper ?? 1), h, 28, 1).translate(0, -h / 2, 0);
        descs.push(R.ColliderDesc.cylinder(h / 2, r).setTranslation(0, -h / 2, 0));
        footprint = { type: 'circle', r };
        break;
      }
      case 'rock': {
        const { r } = spec; h = spec.h;
        geo = this.rockGeometry(r, r * this.rnd(0.18, 0.4), h).translate(0, -h / 2, 0);
        const hull = R.ColliderDesc.convexHull(new Float32Array(geo.attributes.position.array));
        descs.push(hull || R.ColliderDesc.cylinder(h / 2, r).setTranslation(0, -h / 2, 0));
        footprint = { type: 'circle', r: r * 0.93 };
        break;
      }
      case 'pipe': {
        const { r, len } = spec; h = r * 2;
        geo = new THREE.CylinderGeometry(r, r, len, 24, 1).rotateX(Math.PI / 2).translate(0, -r, 0);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        descs.push(R.ColliderDesc.cylinder(len / 2, r).setTranslation(0, -r, 0).setRotation(q));
        // 立てる幅は上面付近のみ
        footprint = { type: 'rect', hw: r * 0.55, hd: len / 2 };
        break;
      }
    }
    return { geo, descs, footprint, h };
  }

  // ------------------------------------------------------------------ platform
  addPlatform(spec) {
    const R = this.RAPIER;
    const { geo, descs, footprint, h } = this.buildShape(spec);
    const tile = this.mats.tile(spec.mat);
    const g2 = boxProjectUV(geo, tile, new THREE.Vector3(this.rnd(0, 9), this.rnd(0, 9), this.rnd(0, 9)));
    let material = this.mats.get(spec.mat, spec.matOpts);
    if (spec.behavior?.type === 'crumble') {
      material = material.clone();
      material.emissive = new THREE.Color(0x000000);
    }
    const mesh = new THREE.Mesh(g2, material);
    mesh.castShadow = true; mesh.receiveShadow = true;

    const group = new THREE.Group();
    const visual = new THREE.Group(); // 揺れ演出用（物理とは独立）
    visual.add(mesh);
    group.add(visual);

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(spec.tiltX || 0, spec.yaw || 0, spec.tiltZ || 0, 'YXZ'));
    group.position.copy(spec.pos);
    group.quaternion.copy(q);

    const type = spec.behavior?.type || 'static';
    const kinematic = ['mover', 'elevator', 'rotator', 'crumble'].includes(type);
    const bodyDesc = (kinematic ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.fixed())
      .setTranslation(spec.pos.x, spec.pos.y, spec.pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    const body = this.world.createRigidBody(bodyDesc);

    const p = {
      id: this.platforms.length, spec, type, kinematic, body, colliders: [], group, visual, mesh, material,
      surface: spec.surface || 'normal', top: spec.pos.y, h: h + (spec.extraDepth || 0), footprint,
      base: spec.pos.clone(), baseQ: q.clone(), yaw: spec.yaw || 0,
      prevM: new THREE.Matrix4().compose(spec.pos, q, new THREE.Vector3(1, 1, 1)),
      currM: new THREE.Matrix4().compose(spec.pos, q, new THREE.Vector3(1, 1, 1)),
      zone: spec.zone ?? 0, behavior: spec.behavior || { type: 'static' },
    };
    for (const d of descs) {
      d.setFriction(0.0);
      const c = this.world.createCollider(d, body);
      p.colliders.push(c);
      this.byCollider.set(c.handle, p);
    }

    // 木組み・鉄板の下に支柱（装飾＋当たり）
    if (spec.supports) this.addSupports(p, spec);

    this.root.add(group);
    this.platforms.push(p);
    return p;
  }

  addSupports(p, spec) {
    const R = this.RAPIER;
    const len = this.rnd(3, 7);
    const mat = this.mats.get(spec.mat === 'wood' ? 'wood' : 'rust');
    const { hw, hd } = p.footprint;
    const r = 0.11;
    const geo = boxProjectUV(new THREE.CylinderGeometry(r, r, len, 8).translate(0, -len / 2 - p.h, 0), 1.2);
    for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]].slice(0, this.rng() < 0.5 ? 2 : 4)) {
      const x = sx * (hw - 0.15), z = sz * (hd - 0.2);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 0, z); m.castShadow = true;
      p.visual.add(m);
      const c = this.world.createCollider(R.ColliderDesc.cylinder(len / 2, r).setTranslation(x, -len / 2 - p.h, z), p.body);
      p.colliders.push(c); this.byCollider.set(c.handle, p);
    }
    p.h += len;
  }

  // ------------------------------------------------------------------ specs
  shapeSpec(kind) {
    const r = (a, b) => this.rnd(a, b);
    switch (kind) {
      case 'rock': return { shape: 'rock', r: r(1.5, 2.4), h: r(2.5, 4.5), mat: 'rock' };
      case 'rockSmall': return { shape: 'rock', r: r(0.95, 1.25), h: r(2, 3), mat: 'rock' };
      case 'sandrock': return { shape: 'rock', r: r(1.8, 2.8), h: r(3, 5), mat: 'sandrock' };
      case 'plank': return { shape: 'box', w: r(1.0, 1.4), h: 0.22, d: r(3, 4.5), mat: 'wood', supports: true, align: true };
      case 'crate': { const s = r(1.3, 1.9); return { shape: 'box', w: s, h: s, d: s, mat: 'wood', randomYaw: true }; }
      case 'beam': return { shape: 'box', w: 0.6, h: 0.45, d: r(3.5, 5.5), mat: 'wood', align: true };
      case 'pipe': return { shape: 'pipe', r: r(0.55, 0.8), len: r(3.5, 6), mat: 'rust', align: true };
      case 'container': return { shape: 'box', w: 2.4, h: 2.6, d: r(4, 6), mat: 'iron', align: true };
      case 'plate': return { shape: 'box', w: r(1.8, 2.6), h: 0.25, d: r(1.8, 2.6), mat: 'rust', supports: true, randomYaw: true };
      case 'slab': return { shape: 'box', w: r(2, 3.2), h: r(0.4, 0.7), d: r(2.4, 3.6), mat: 'concrete', tilt: 0.12, randomYaw: true };
      case 'brickPillar': return { shape: 'box', w: r(1.3, 1.8), h: r(3, 6), d: r(1.3, 1.8), mat: 'brick', randomYaw: true };
      case 'snowRock': return { shape: 'rock', r: r(1.4, 2.2), h: r(2.5, 4), mat: 'snow' };
      case 'iceSlab': return { shape: 'box', w: r(1.6, 2.2), h: 0.5, d: r(2.6, 3.6), mat: 'ice', surface: 'ice', align: true };
      case 'column': return { shape: 'cyl', r: r(0.85, 1.2), h: r(5, 12), mat: 'marble' };
      case 'marbleSlab': return { shape: 'box', w: r(2, 2.8), h: 0.5, d: r(2, 3), mat: 'marble', randomYaw: true };
    }
  }

  behaviorSpec(type, zone) {
    const m = zone.mat;
    const r = (a, b) => this.rnd(a, b);
    switch (type) {
      case 'mover': return { spec: { shape: 'box', w: r(2.0, 2.6), h: 0.45, d: r(2.0, 2.6), mat: m === 'snow' ? 'ice' : m, surface: m === 'snow' ? 'ice' : 'normal', align: true },
        behavior: { type, amp: r(2.5, 4), period: r(4.5, 7), phase: r(0, 6.28) } };
      case 'elevator': return { spec: { shape: 'box', w: 2.6, h: 0.45, d: 2.6, mat: m, align: true },
        behavior: { type, amp: r(2.0, 2.8), period: r(5, 7), phase: r(0, 6.28) } };
      case 'rotator': { const L = r(8, 10); return { spec: { shape: 'box', w: 1.25, h: 0.5, d: L, mat: m === 'snow' ? 'snow' : m, align: true },
        behavior: { type, speed: r(0.45, 0.8) * (this.rng() < 0.5 ? -1 : 1), L } }; }
      case 'sweeper': return { spec: { shape: 'cyl', r: 4, h: 0.8, mat: zone.cp },
        behavior: { type, speed: r(1.3, 1.9) * (this.rng() < 0.5 ? -1 : 1) } };
      case 'bounce': return { spec: { shape: 'cyl', r: 1.3, h: 0.5, mat: zone.cp, surface: 'bounce' }, behavior: { type } };
      case 'crumble': return { spec: { shape: 'box', w: r(1.8, 2.4), h: 0.5, d: r(1.8, 2.4), mat: m === 'snow' ? 'ice' : m === 'marble' ? 'marble' : 'concrete', surface: m === 'snow' ? 'ice' : 'normal', randomYaw: true },
        behavior: { type, state: 'idle', timer: 0 } };
    }
    return null;
  }

  /** 中心から方向 dir への縁までの距離（レイ×足場形状） */
  rayExtent(fp, yaw, dir) {
    if (fp.type === 'circle') return fp.r;
    const ax = Math.cos(yaw), az = -Math.sin(yaw);       // local +X in world
    const zx = Math.sin(yaw), zz = Math.cos(yaw);        // local +Z in world
    const cx = Math.abs(dir.x * ax + dir.z * az), cz = Math.abs(dir.x * zx + dir.z * zz);
    return Math.min(cx > 1e-4 ? fp.hw / cx : 1e9, cz > 1e-4 ? fp.hd / cz : 1e9);
  }
  outerRadius(fp) { return fp.type === 'circle' ? fp.r : Math.hypot(fp.hw, fp.hd); }

  // ------------------------------------------------------------------ build
  build() {
    // スタート島
    const start = this.addPlatform({ shape: 'rock', r: 9, h: 7, mat: 'sandrock', pos: new THREE.Vector3(0, 3, 0), zone: 0 });
    start.isStart = true;
    this.startTop = 3;
    this.addCheckpoint(start, 0, true);
    // 周囲の岩
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this.rnd(-0.3, 0.3), d = this.rnd(12, 18);
      this.addPlatform({ shape: 'rock', r: this.rnd(1.5, 3), h: this.rnd(3, 5), mat: 'rock', pos: new THREE.Vector3(Math.cos(a) * d, this.rnd(0.6, 1.8), Math.sin(a) * d), zone: 0 });
    }

    let cur = start;
    let heading = this.rnd(0, Math.PI * 2);
    let curTopForNext = cur.top;

    ZONES.forEach((zone, zi) => {
      if (zi > 0) {
        // ゾーン入口のチェックポイント
        const cp = this.placeNext(cur, curTopForNext, heading, zone, zi, { shape: 'cyl', r: 3.2, h: 1.4, mat: zone.cp }, null, { gap: 1.6, rise: 0.8 });
        this.addCheckpoint(cp.p, zi);
        cur = cp.p; heading = cp.heading; curTopForNext = cur.top;
      }
      this.zoneStarts[zi] = zi === 0 ? 0 : cur.top - this.startTop;

      const bag = this.behaviorBag(zone);
      for (let i = 0; i < zone.count; i++) {
        const t = i / (zone.count - 1);
        const bType = bag[i];
        let spec, behavior = null;
        if (bType === 'static') {
          spec = this.shapeSpec(this.pick(zone.shapes));
        } else {
          const b = this.behaviorSpec(bType, zone);
          spec = b.spec; behavior = b.behavior;
        }
        const res = this.placeNext(cur, curTopForNext, heading, zone, zi, spec, behavior, { t });
        cur = res.p; heading = res.heading;
        curTopForNext = cur.top + (behavior?.type === 'elevator' ? behavior.amp : 0);
      }
    });

    // ゴール：天空神殿
    const goalRes = this.placeNext(cur, curTopForNext, heading, ZONES[5], 5, { shape: 'cyl', r: 6, h: 2.2, mat: 'marble' }, null, { gap: 1.8, rise: 1.0 });
    this.buildGoal(goalRes.p);
    this.totalHeight = goalRes.p.top - this.startTop;
    this.buildDecor();
  }

  /** ゾーン内のギミック順：全種類を最低1回ずつ入れ、特殊足場が連続しすぎないようシャッフル */
  behaviorBag(zone) {
    const n = zone.count - 3;
    const entries = Object.entries(zone.behaviors);
    const sum = entries.reduce((a, [, w]) => a + w, 0);
    const bag = [];
    for (const [k, w] of entries) if (k !== 'static') for (let i = 0; i < Math.max(1, Math.round((w / sum) * n)); i++) bag.push(k);
    while (bag.length < n) bag.push('static');
    bag.length = n;
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    for (let i = 1; i < bag.length; i++) {
      if (bag[i] !== 'static' && bag[i - 1] !== 'static') {
        const j = bag.findIndex((b, k) => k > i + 1 && b === 'static' && bag[k - 1] === 'static' && (bag[k + 1] ?? 'static') === 'static');
        if (j > 0) [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return ['static', 'static', 'static', ...bag];
  }

  placeNext(cur, curTop, heading, zone, zi, spec, behavior, opt = {}) {
    const t = opt.t ?? 0;
    const bType = behavior?.type;
    const isBounceFrom = cur.surface === 'bounce';
    let rise = opt.rise ?? this.rnd(zone.rise[0], zone.rise[1]) * THREE.MathUtils.lerp(0.85, 1.1, t);
    let gap = opt.gap ?? this.rnd(zone.gap[0], zone.gap[1]) * THREE.MathUtils.lerp(0.85, 1.05, t) * this.rnd(0.9, 1.05);
    if (isBounceFrom) { rise = this.rnd(5, 7); gap = this.rnd(0.6, 1.6); }
    else gap = Math.min(gap, reach(rise, cur.surface === 'ice' ? 5.5 : PHYS.RUN) * zone.safety);
    if (bType === 'rotator') rise = Math.min(rise, 0.6);

    const dims = { w: spec.w, d: spec.d, r: spec.r, h: spec.h };
    const tmpFoot = bType === 'rotator' ? { type: 'circle', r: behavior.L / 2 } : this.buildFootprintOnly(spec);
    const outR = this.outerRadius(tmpFoot) + (bType === 'mover' ? behavior.amp : 0);
    const depth = (spec.h || 1) + (spec.supports ? 7 : 0);
    const up = bType === 'elevator' ? behavior.amp : 0;

    const dir = new THREE.Vector3();
    let best = null;
    for (let attempt = 0; attempt < 60 && !best; attempt++) {
      const spread = Math.min(Math.PI, 0.7 + attempt * 0.12);
      const ang = heading + this.rnd(-spread, spread);
      dir.set(Math.sin(ang), 0, Math.cos(ang));
      let yaw = spec.align ? ang + this.rnd(-0.25, 0.25) : spec.randomYaw ? this.rnd(0, Math.PI * 2) : 0;
      const fromExt = this.rayExtent(cur.footprint, cur.yaw, dir);
      const negDir = dir.clone().negate();
      const toExt = bType === 'rotator' ? behavior.L / 2 : this.rayExtent(tmpFoot, yaw, negDir);
      const g2 = attempt > 40 ? gap * 0.75 : gap; // 置き場所が無いときは少し近づける
      const top = curTop + rise;
      const center = cur.base.clone().addScaledVector(dir, fromExt + g2 + toExt);
      center.y = top;
      if (Math.hypot(center.x, center.z) > R_MAX && attempt < 50) continue;
      if (this.collides(center, outR, top - depth - up, top + 2.8 + up, cur)) continue;
      best = { center, yaw, ang };
    }
    if (!best) {
      // 最終手段：衝突判定を無視して進行方向へ置く（届く距離は守る）
      this.fallbacks = (this.fallbacks || 0) + 1;
      dir.set(Math.sin(heading), 0, Math.cos(heading));
      const center = cur.base.clone().addScaledVector(dir, this.rayExtent(cur.footprint, cur.yaw, dir) + gap + this.outerRadius(tmpFoot));
      center.y = curTop + rise;
      best = { center, yaw: heading, ang: heading };
    }

    if (isBounceFrom) cur.bounceV = Math.sqrt(2 * PHYS.G * (best.center.y - cur.top + 2.2));
    const finalSpec = { ...spec, pos: best.center, yaw: best.yaw, zone: zi, behavior };
    if (spec.tilt) { finalSpec.tiltX = this.rnd(-spec.tilt, spec.tilt); finalSpec.tiltZ = this.rnd(-spec.tilt, spec.tilt); }
    if (spec.supports) finalSpec.extraDepth = 0;
    const p = this.addPlatform(finalSpec);
    if (bType === 'rotator') p.footprint = { type: 'circle', r: behavior.L / 2 };
    p.outR = outR; p.minY = best.center.y - depth - up; p.maxY = best.center.y + 2.8 + up;
    this.attachBehavior(p);

    // 突風
    if (zone.wind && !isBounceFrom && bType !== 'rotator' && this.rng() < zone.wind && t > 0.1) {
      this.addWind(cur.base, best.center, curTop);
    }
    return { p, heading: best.ang };
  }

  buildFootprintOnly(spec) {
    switch (spec.shape) {
      case 'box': return { type: 'rect', hw: spec.w / 2, hd: spec.d / 2 };
      case 'pipe': return { type: 'rect', hw: spec.r * 0.55, hd: spec.len / 2 };
      case 'rock': return { type: 'circle', r: spec.r * 0.93 };
      default: return { type: 'circle', r: spec.r };
    }
  }

  collides(center, outR, minY, maxY, ignore) {
    for (const p of this.platforms) {
      if (p === ignore) continue;
      const pMin = p.minY ?? p.top - p.h, pMax = p.maxY ?? p.top + 2.8;
      if (maxY < pMin || minY > pMax) continue;
      const pr = p.outR ?? this.outerRadius(p.footprint);
      if (Math.hypot(center.x - p.base.x, center.z - p.base.z) < outR + pr + 1.0) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ behaviors
  attachBehavior(p) {
    const b = p.behavior;
    if (b.type === 'mover') {
      const side = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      p.update = (time) => {
        const s = Math.sin((time / b.period) * Math.PI * 2 + b.phase);
        this._v.copy(p.base).addScaledVector(side, s * b.amp);
        this.setPose(p, this._v, p.baseQ);
      };
    } else if (b.type === 'elevator') {
      p.update = (time) => {
        const s = Math.sin((time / b.period) * Math.PI * 2 + b.phase);
        this._v.copy(p.base); this._v.y += s * b.amp;
        this.setPose(p, this._v, p.baseQ);
      };
    } else if (b.type === 'rotator') {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.9, 16), this.mats.get('rust'));
      hub.position.y = -0.7; hub.castShadow = true;
      p.visual.add(hub);
      p.update = (time) => {
        this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw + time * b.speed);
        this.setPose(p, p.base, this._q);
      };
    } else if (b.type === 'sweeper') {
      const len = 7.6;
      const pivot = new THREE.Group();
      pivot.position.copy(p.base);
      const barGeo = boxProjectUV(new THREE.CylinderGeometry(0.22, 0.22, len, 14).rotateZ(Math.PI / 2), 1.5);
      const barMat = this.mats.get('rust', { emissive: 0x661100, emissiveIntensity: 0.6 });
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.position.y = 0.5; bar.castShadow = true;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12), barMat);
      post.position.y = 0.3;
      pivot.add(bar, post);
      this.root.add(pivot);
      const hz = { p, len, speed: b.speed, angle: 0, pivot, top: p.top };
      this.hazards.push(hz);
      p.update = (time) => { hz.angle = time * b.speed; pivot.rotation.y = hz.angle; };
    } else if (b.type === 'bounce') {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40).rotateX(-Math.PI / 2), makePadMaterial());
      pad.position.y = 0.02;
      p.visual.add(pad);
      p.pad = pad;
      this.animated.push(pad.material);
    } else if (b.type === 'crumble') {
      // ひび割れ風に少し暗く
      p.material.color.setScalar(0.82);
      p.update = (time, dt) => this.updateCrumble(p, dt);
    }
  }

  setPose(p, pos, q) {
    p.prevM.copy(p.currM);
    p.currM.compose(pos, q, new THREE.Vector3(1, 1, 1));
    p.body.setNextKinematicTranslation(pos);
    p.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    p.group.position.copy(pos);
    p.group.quaternion.copy(q);
  }

  triggerCrumble(p) {
    if (p.behavior.state === 'idle') { p.behavior.state = 'shake'; p.behavior.timer = 0; this.onCrumble?.(p); }
  }

  updateCrumble(p, dt) {
    const b = p.behavior;
    b.timer += dt;
    if (b.state === 'shake') {
      p.visual.position.set((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08);
      p.material.emissive.setRGB(0.5 * b.timer, 0.12 * b.timer, 0);
      if (b.timer > 0.85) { b.state = 'fall'; b.timer = 0; b.vy = 0; b.y = p.base.y; p.colliders.forEach((c) => c.setEnabled(false)); }
      this.setPose(p, p.base, p.baseQ);
    } else if (b.state === 'fall') {
      b.vy += 20 * dt; b.y -= b.vy * dt;
      this._v.copy(p.base); this._v.y = b.y;
      this.setPose(p, this._v, p.baseQ);
      p.material.transparent = true;
      p.material.opacity = Math.max(0, 1 - b.timer / 1.4);
      if (b.timer > 1.4) { b.state = 'gone'; b.timer = 0; p.group.visible = false; }
    } else if (b.state === 'gone') {
      if (b.timer > 4.5) {
        b.state = 'respawn'; b.timer = 0; p.group.visible = true;
        this.setPose(p, p.base, p.baseQ);
        p.colliders.forEach((c) => c.setEnabled(true));
        p.material.emissive.setRGB(0, 0, 0);
      }
    } else if (b.state === 'respawn') {
      p.material.opacity = Math.min(1, b.timer / 0.6);
      if (b.timer > 0.6) { b.state = 'idle'; p.material.transparent = false; p.material.opacity = 1; }
      this.setPose(p, p.base, p.baseQ);
    } else {
      p.visual.position.set(0, 0, 0);
      this.setPose(p, p.base, p.baseQ);
    }
  }

  addWind(a, b, y0) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const along = new THREE.Vector3().subVectors(b, a); along.y = 0;
    const len = along.length(); along.normalize();
    const side = new THREE.Vector3(along.z, 0, -along.x).multiplyScalar(this.rng() < 0.5 ? 1 : -1);
    const yTop = Math.max(a.y, b.y);
    const w = {
      center: new THREE.Vector3(mid.x, (y0 + yTop) / 2 + 2, mid.z), along, side, halfLen: len / 2 + 1.5, halfW: 4.5, halfH: (yTop - y0) / 2 + 3.5,
      strength: this.rnd(7, 11), phase: this.rnd(0, 6.28),
    };
    // 風の筋（加算合成のインスタンス描画）
    const count = 46;
    const geo = new THREE.PlaneGeometry(1.6, 0.035);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.frustumCulled = false;
    w.inst = inst; w.seeds = Array.from({ length: count }, () => [Math.random(), Math.random() * 2 - 1, Math.random() * 2 - 1]);
    this.root.add(inst);
    this.winds.push(w);
  }

  gust(w, time) { return 0.55 + 0.45 * Math.sin(time * 1.3 + w.phase) * Math.sin(time * 0.37 + w.phase * 2); }

  windAt(pos, time, out) {
    out.set(0, 0, 0);
    for (const w of this.winds) {
      const dx = pos.x - w.center.x, dy = pos.y - w.center.y, dz = pos.z - w.center.z;
      const la = dx * w.along.x + dz * w.along.z;
      const ls = dx * w.side.x + dz * w.side.z;
      if (Math.abs(la) < w.halfLen && Math.abs(ls) < w.halfW && Math.abs(dy) < w.halfH) {
        out.addScaledVector(w.side, w.strength * this.gust(w, time));
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ checkpoints & goal
  addCheckpoint(p, zi, isStart = false) {
    const g = new THREE.Group();
    g.position.copy(p.base);
    const r = p.footprint.r ?? 2;
    const poleOff = new THREE.Vector3(r * 0.55, 0, 0);
    const poleMat = this.mats.get('rust');
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 10), poleMat);
    pole.position.copy(poleOff).setY(1.6); pole.castShadow = true;
    const flagMat = makeFlagMaterial(isStart ? 0x4fd1ff : 0xd9483b);
    this.animated.push(flagMat.userData);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.85, 20, 8).translate(0.7, 0, 0), flagMat);
    flag.position.copy(poleOff).setY(2.7); flag.castShadow = true;
    const beamMat = makeBeamMaterial(isStart ? 0x4fd1ff : 0xff7a3a);
    beamMat.uniforms.uOpacity.value = isStart ? 0.25 : 0.4;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 60, 16, 1, true).translate(0, 30, 0), beamMat);
    beam.position.copy(poleOff);
    this.animated.push(beamMat);
    g.add(pole, flag, beam);
    this.root.add(g);
    const cp = {
      index: zi, platform: p, top: p.top, r: Math.max(r, 2.5),
      spawn: new THREE.Vector3(p.base.x - r * 0.2, p.top + 1.0, p.base.z), flagMat, beamMat, active: isStart,
      activate: () => {
        cp.active = true;
        flagMat.color.set(0x5be37d);
        beamMat.uniforms.uColor.value.set(0x5be37d);
        beamMat.uniforms.uOpacity.value = 0.22;
      },
    };
    this.checkpoints[zi] = cp;
  }

  buildGoal(p) {
    const g = new THREE.Group();
    g.position.copy(p.base);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.18, emissive: 0x442200, envMapIntensity: 1.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.28, 24, 96), gold);
    ring.position.y = 4.5; ring.castShadow = true;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.08, 12, 96), gold);
    inner.position.y = 4.5;
    // 周囲の柱
    const colMat = this.mats.get('marble');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const col = new THREE.Mesh(boxProjectUV(new THREE.CylinderGeometry(0.35, 0.42, 5, 16).translate(0, 2.5, 0), 3), colMat);
      col.position.set(Math.cos(a) * 5.2, 0, Math.sin(a) * 5.2); col.castShadow = true;
      g.add(col);
      const c = this.world.createCollider(this.RAPIER.ColliderDesc.cylinder(2.5, 0.4).setTranslation(col.position.x, 2.5, col.position.z), p.body);
      this.byCollider.set(c.handle, p);
    }
    const beamMat = makeBeamMaterial(0xffd27d);
    beamMat.uniforms.uOpacity.value = 0.5;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 400, 24, 1, true).translate(0, 208, 0), beamMat);
    this.animated.push(beamMat);
    const light = new THREE.PointLight(0xffc35a, 30, 30, 1.6);
    light.position.y = 4.5;
    g.add(ring, inner, beam, light);
    this.root.add(g);
    this.goal = { pos: p.base.clone(), top: p.top, r: 5, ring, inner };
  }

  // ------------------------------------------------------------------ decor
  buildDecor() {
    const rockMat = this.mats.get('rock');
    const sandMat = this.mats.get('sandrock');
    // 海から突き出す巨岩（遠景）
    for (let i = 0; i < 14; i++) {
      const a = this.rnd(0, Math.PI * 2), d = this.rnd(110, 260);
      const h = this.rnd(30, 110), rb = this.rnd(8, 18);
      const geo = boxProjectUV(this.rockGeometry(rb * this.rnd(0.25, 0.5), rb, h, 18, 0.25).translate(0, h / 2 - 2, 0), 7);
      const m = new THREE.Mesh(geo, i % 2 ? rockMat : sandMat);
      m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      m.receiveShadow = true;
      this.root.add(m);
    }
    // 浮遊島
    const top = this.totalHeight + this.startTop;
    for (let i = 0; i < 22; i++) {
      const a = this.rnd(0, Math.PI * 2), d = this.rnd(80, 190);
      const r = this.rnd(4, 12), h = r * this.rnd(1.2, 2);
      const geo = boxProjectUV(this.rockGeometry(r, r * 0.15, h, 18, 0.25), 6);
      const zoneMat = this.mats.get(['rock', 'sandrock', 'rock', 'concrete', 'snow', 'marble'][Math.min(5, Math.floor((i / 22) * 6))]);
      const m = new THREE.Mesh(geo, zoneMat);
      m.position.set(Math.cos(a) * d, this.rnd(30, top + 40) * (0.3 + 0.7 * i / 22), Math.sin(a) * d);
      m.rotation.y = this.rnd(0, 6);
      this.root.add(m);
    }
  }

  // ------------------------------------------------------------------ runtime
  update(time, dt) {
    for (const p of this.platforms) if (p.update) p.update(time, dt);
  }

  updateVisuals(time, camera) {
    for (const m of this.animated) if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
    if (this.goal) { this.goal.ring.rotation.y = time * 0.6; this.goal.inner.rotation.x = time * 0.9; }
    const dummy = this._dummy || (this._dummy = new THREE.Object3D());
    for (const w of this.winds) {
      if (camera.position.distanceTo(w.center) > 90) { w.inst.visible = false; continue; }
      w.inst.visible = true;
      const g = this.gust(w, time);
      w.inst.material.opacity = 0.12 + 0.3 * g;
      w.seeds.forEach(([s, a, h], i) => {
        const k = ((s + time * 0.35 * (0.6 + g)) % 1) * 2 - 1;
        dummy.position.copy(w.center)
          .addScaledVector(w.side, k * w.halfW * 1.4)
          .addScaledVector(w.along, a * w.halfLen);
        dummy.position.y += h * w.halfH;
        dummy.lookAt(dummy.position.x + w.side.x, dummy.position.y, dummy.position.z + w.side.z);
        dummy.rotateY(Math.PI / 2);
        dummy.scale.setScalar(0.6 + g);
        dummy.updateMatrix();
        w.inst.setMatrixAt(i, dummy.matrix);
      });
      w.inst.instanceMatrix.needsUpdate = true;
    }
  }

  zoneAt(height) {
    let z = 0;
    for (let i = 0; i < this.zoneStarts.length; i++) if (height >= this.zoneStarts[i] - 0.5) z = i;
    return z;
  }

  reset() {
    for (const p of this.platforms) {
      if (p.behavior.type === 'crumble') {
        const b = p.behavior; b.state = 'idle'; b.timer = 0;
        p.group.visible = true; p.material.transparent = false; p.material.opacity = 1; p.material.emissive.setRGB(0, 0, 0);
        p.colliders.forEach((c) => c.setEnabled(true));
      }
    }
  }
}
