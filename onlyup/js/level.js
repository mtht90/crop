import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxProjectUV, makeBeamMaterial, makePadMaterial } from './materials.js';
import { PROPS } from './assets.js';
import { CHUNK } from './props.js';

// ---- プレイヤー物理と同じ定数で「届く距離」を計算し、必ず登れる配置にする ----
export const PHYS = { G: 26, JUMP_V: 10, RUN: 7.0, SPRINT: 9.2 };
function reach(dy, g = PHYS.G, speed = PHYS.RUN) {
  const d = PHYS.JUMP_V ** 2 - 2 * g * dy;
  if (d < 0) return 0;
  return speed * (PHYS.JUMP_V + Math.sqrt(d)) / g;
}

// 7 ゾーン・標高 約1km。shapes の 'p:' は Poly Haven のガラクタ
export const ZONES = [
  { key: 'shore', name: '潮騒の岩礁', en: 'TIDE ROCKS', count: 24, gap: [1.1, 2.2], rise: [0.4, 1.0], safety: 0.62,
    shapes: { rock: 5, rockSmall: 2, sandrock: 2 }, behaviors: { static: 10, rope: 1 }, mat: 'rock', filler: ['ocean_buoy'], fillers: 10 },
  { key: 'alley', name: '路地裏のガラクタ街', en: 'JUNK ALLEY', count: 110, gap: [1.2, 2.5], rise: [0.5, 1.2], safety: 0.64,
    shapes: { 'p:wooden_crate_01': 3, 'p:Barrel_01': 2, 'p:cardboard_box_01': 2, 'p:utility_box_02': 1.2, 'p:Television_01': 2, plank: 3, shack: 2, beam: 1.5 },
    behaviors: { static: 10, rope: 2.5, fan: 1, bounce: 1.2, mover: 1, elevator: 0.8, crumble: 0.5 }, mat: 'bluewood',
    filler: ['wooden_crate_01', 'Barrel_01', 'Television_01', 'Sofa_01', 'ArmChair_01', 'utility_box_02'], fillers: 90 },
  { key: 'works', name: '錆びた工業区', en: 'RUST WORKS', count: 120, gap: [1.3, 2.7], rise: [0.6, 1.3], safety: 0.66,
    shapes: { pipe: 4, container: 2, plate: 2, grate: 2, 'p:barrel_03': 2, 'p:steel_frame_shelves_01': 1.5, 'p:old_tyre': 1.5 },
    behaviors: { static: 9, rotator: 2, sweeper: 1.2, carrier: 1.5, mover: 1, fan: 1, rope: 1.5, elevator: 1 }, mat: 'rust',
    filler: ['barrel_03', 'metal_tool_chest', 'propane_tank', 'old_tyre', 'steel_frame_shelves_01'], fillers: 90 },
  { key: 'city', name: '崩れゆく都市', en: 'CRUMBLING CITY', count: 120, gap: [1.4, 2.8], rise: [0.6, 1.35], safety: 0.68,
    shapes: { slab: 3, brickPillar: 2, 'p:metal_office_desk': 2, 'p:Television_01': 1, road: 2, 'p:cardboard_box_01': 1 },
    behaviors: { static: 8, crumble: 3, carrier: 2, mover: 1.2, elevator: 1, rope: 1.5, bounce: 0.8 }, mat: 'concrete',
    filler: ['metal_office_desk', 'Sofa_01', 'ArmChair_01', 'Television_01'], fillers: 80 },
  { key: 'frost', name: '凍てつく雲海', en: 'FROZEN SKIES', count: 110, gap: [1.4, 2.9], rise: [0.6, 1.35], safety: 0.7, wind: 0.3,
    shapes: { snowRock: 3, iceSlab: 4, 'p:Barrel_01': 0.6 }, behaviors: { static: 7, fan: 1.5, bounce: 1.5, mover: 1.2, crumble: 1.2, rotator: 0.8, rope: 1.2 }, mat: 'snow',
    filler: ['Barrel_01', 'wooden_crate_01'], fillers: 30 },
  { key: 'temple', name: '天空の神殿', en: 'SKY TEMPLE', count: 110, gap: [1.5, 3.0], rise: [0.6, 1.4], safety: 0.72,
    shapes: { column: 4, marbleSlab: 3 }, behaviors: { static: 6, bounce: 1.5, rotator: 1.2, sweeper: 1, crumble: 1.5, mover: 1, fan: 0.8, rope: 1 }, mat: 'marble',
    filler: ['marble_bust_01', 'horse_statue_01'], fillers: 24 },
  { key: 'orbit', name: '静かの軌道', en: 'LOW ORBIT', count: 90, gap: [2.0, 4.2], rise: [1.0, 2.6], safety: 0.62, gravity: 0.45,
    shapes: { 'p:moon_rock_01': 3, 'p:moon_rock_03': 2, 'p:moon_rock_05': 1.5, satellite: 2, 'p:Television_01': 0.4, 'p:Barrel_01': 0.4 },
    behaviors: { static: 7, mover: 1.5, rotator: 1.5, crumble: 1, rope: 1 }, mat: 'iron',
    filler: ['moon_rock_01', 'moon_rock_03', 'Television_01', 'Barrel_01', 'covered_car'], fillers: 40 },
];

const R_MIN = 7, R_MAX = 21; // 塔の中心軸からの半径（細く高い一本の塔）

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINEMATIC = ['mover', 'elevator', 'rotator', 'crumble', 'carrier'];

export class Level {
  constructor({ RAPIER, world, scene, mats, props, seed = 20261016 }) {
    Object.assign(this, { RAPIER, world, scene, mats, props });
    this.rng = mulberry32(seed);
    this.noise = createNoise3D(mulberry32(seed + 7));
    this.platforms = [];
    this.path = [];
    this.byCollider = new Map();
    this.hazards = [];
    this.winds = [];
    this.fans = [];
    this.animated = [];
    this.zoneStarts = [];
    this.batches = new Map();
    this.batchMeshes = [];
    this.root = new THREE.Group();
    scene.add(this.root);
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this.spin = 1;
    props.onCollider = (c, body) => {
      const p = this.platforms.find((pp) => pp.body === body);
      if (p) { p.colliders.push(c); this.byCollider.set(c.handle, p); }
    };
  }

  rnd(a, b) { return a + (b - a) * this.rng(); }
  pick(weights) {
    const entries = Object.entries(weights);
    let sum = 0; for (const [, w] of entries) sum += w;
    let r = this.rng() * sum;
    for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
    return entries[0][0];
  }
  zoneGravity(zi) { return ZONES[zi]?.gravity ?? 1; }

  /** 足元の高さ(m)での重力倍率（宇宙へ近づくと徐々に弱まる） */
  gravityAt(height) {
    const s = this.zoneStarts[6];
    if (s === undefined) return 1;
    return THREE.MathUtils.lerp(1, ZONES[6].gravity, THREE.MathUtils.smoothstep(height, s - 25, s + 5));
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

  /** shape spec → { parts: [{geo, mat}], descs, footprint, h }（原点＝上面中心） */
  buildShape(spec) {
    const R = this.RAPIER;
    const descs = [], parts = [];
    let footprint, h;
    const box = (w, hh, d, mat, x = 0, y = 0, z = 0) => {
      parts.push({ geo: new THREE.BoxGeometry(w, hh, d).translate(x, y - hh / 2, z), mat });
      descs.push(R.ColliderDesc.cuboid(w / 2, hh / 2, d / 2).setTranslation(x, y - hh / 2, z));
    };
    switch (spec.shape) {
      case 'box':
        h = spec.h; box(spec.w, h, spec.d, spec.mat);
        footprint = { type: 'rect', hw: spec.w / 2, hd: spec.d / 2 };
        break;
      case 'shack': // トタン屋根の掘っ立て小屋
        h = spec.h;
        box(spec.w, h - 0.25, spec.d, spec.mat, 0, -0.25);
        box(spec.w + 0.5, 0.25, spec.d + 0.5, 'iron');
        footprint = { type: 'rect', hw: spec.w / 2 + 0.25, hd: spec.d / 2 + 0.25 };
        break;
      case 'satellite': {
        h = 1.6;
        box(1.8, 1.6, 1.8, 'iron');
        const span = spec.span;
        box(span, 0.12, 1.6, 'shutter', -(0.9 + span / 2), -0.55);
        box(span, 0.12, 1.6, 'shutter', 0.9 + span / 2, -0.55);
        footprint = { type: 'rect', hw: 0.9, hd: 0.9 };
        break;
      }
      case 'cyl': {
        const { r } = spec; h = spec.h;
        parts.push({ geo: new THREE.CylinderGeometry(r, r * (spec.taper ?? 1), h, 28, 1).translate(0, -h / 2, 0), mat: spec.mat });
        descs.push(R.ColliderDesc.cylinder(h / 2, r).setTranslation(0, -h / 2, 0));
        footprint = { type: 'circle', r };
        break;
      }
      case 'rock': {
        const { r } = spec; h = spec.h;
        const geo = this.rockGeometry(r, r * this.rnd(0.18, 0.4), h).translate(0, -h / 2, 0);
        parts.push({ geo, mat: spec.mat });
        const hull = R.ColliderDesc.convexHull(new Float32Array(geo.attributes.position.array));
        descs.push(hull || R.ColliderDesc.cylinder(h / 2, r).setTranslation(0, -h / 2, 0));
        footprint = { type: 'circle', r: r * 0.93 };
        break;
      }
      case 'pipe': {
        const { r, len } = spec; h = r * 2;
        parts.push({ geo: new THREE.CylinderGeometry(r, r, len, 24, 1).rotateX(Math.PI / 2).translate(0, -r, 0), mat: spec.mat });
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        descs.push(R.ColliderDesc.cylinder(len / 2, r).setTranslation(0, -r, 0).setRotation(q));
        footprint = { type: 'rect', hw: r * 0.55, hd: len / 2 };
        break;
      }
    }
    return { parts, descs, footprint, h };
  }

  // ------------------------------------------------------------------ platform
  makeBody(pos, q, kinematic) {
    const R = this.RAPIER;
    return this.world.createRigidBody((kinematic ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.fixed())
      .setTranslation(pos.x, pos.y, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  }

  record(spec, body, group, footprint, h) {
    const q = group.quaternion.clone();
    const type = spec.behavior?.type || 'static';
    const p = {
      id: this.platforms.length, spec, type, kinematic: KINEMATIC.includes(type), body, colliders: [], group,
      visual: group.userData.visual || group, surface: spec.surface || 'normal', top: spec.pos.y, h, footprint,
      base: spec.pos.clone(), baseQ: q, yaw: spec.yaw || 0,
      prevM: new THREE.Matrix4().compose(spec.pos, q, new THREE.Vector3(1, 1, 1)),
      currM: new THREE.Matrix4().compose(spec.pos, q, new THREE.Vector3(1, 1, 1)),
      zone: spec.zone ?? 0, behavior: spec.behavior || { type: 'static' },
    };
    this.platforms.push(p);
    return p;
  }

  addPlatform(spec) {
    const isProp = spec.shape === 'prop';
    const type = spec.behavior?.type || 'static';
    const kinematic = KINEMATIC.includes(type);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(spec.tiltX || 0, spec.yaw || 0, spec.tiltZ || 0, 'YXZ'));
    const group = new THREE.Group();
    const visual = new THREE.Group();
    group.add(visual);
    group.userData.visual = visual;
    group.position.copy(spec.pos);
    group.quaternion.copy(q);
    group.updateMatrixWorld(true);
    const body = this.makeBody(spec.pos, q, kinematic);

    let footprint, h, descs, crumbleMat = null;
    if (isProp) {
      footprint = this.props.footprint(spec.id); h = this.props.dims(spec.id).h;
      descs = this.props.colliderDescs(spec.id);
      if (kinematic) visual.add(this.props.addDynamic(spec.id));
      else this.props.addStatic(spec.id, spec.pos, spec.yaw || 0, body);
    } else {
      const built = this.buildShape(spec);
      footprint = built.footprint; h = built.h; descs = built.descs;
      for (const part of built.parts) {
        const geo = boxProjectUV(part.geo, this.mats.tile(part.mat), new THREE.Vector3(this.rnd(0, 9), this.rnd(0, 9), this.rnd(0, 9)));
        if (!kinematic && !spec.noBatch) {
          this.addToBatch(geo.applyMatrix4(group.matrixWorld), part.mat, spec.pos.y);
          continue;
        }
        let mat = this.mats.get(part.mat, spec.matOpts);
        if (type === 'crumble') {
          // 崩れる足場は個別に色を変えるので複製（テクスチャは元マテリアルから共有）
          const src = mat;
          mat = src.clone(); mat.emissive = new THREE.Color(0); mat.color.setScalar(0.8);
          this.mats.load(part.mat).then(() => {
            Object.assign(mat, { map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, aoMap: src.aoMap, metalnessMap: src.metalnessMap, metalness: src.metalness, roughness: src.roughness });
            mat.needsUpdate = true;
          }).catch(() => {});
          crumbleMat = mat;
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        visual.add(mesh);
      }
    }
    const p = this.record(spec, body, group, footprint, h);
    p.material = crumbleMat;
    for (const d of descs) {
      d.setFriction(0.0);
      const c = this.world.createCollider(d, body);
      p.colliders.push(c);
      this.byCollider.set(c.handle, p);
      if (isProp && PROPS[spec.id].collider === 'hull') this.props.registerHullPlaceholder(spec.id, body, c);
    }
    if (spec.supports) this.addSupports(p, spec);
    if (kinematic || visual.children.length) this.root.add(group);
    return p;
  }

  addToBatch(geo, matKey, y) {
    const key = `${Math.floor(y / CHUNK)}|${matKey}`;
    if (!this.batches.has(key)) this.batches.set(key, []);
    this.batches.get(key).push(geo);
  }

  /** 静的な足場はチャンク×マテリアル単位で1つのメッシュに結合（ドローコール削減） */
  flushBatches() {
    for (const [key, geos] of this.batches) {
      const [chunk, matKey] = key.split('|');
      const merged = mergeGeometries(geos.map((g) => {
        const k = g.index ? g.toNonIndexed() : g;
        for (const a of Object.keys(k.attributes)) if (!['position', 'normal', 'uv'].includes(a)) k.deleteAttribute(a);
        return k;
      }), false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.mats.get(matKey));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.chunk = +chunk;
      this.root.add(mesh);
      this.batchMeshes.push(mesh);
    }
    this.batches.clear();
  }

  addSupports(p, spec) {
    const R = this.RAPIER;
    const len = this.rnd(3, 7);
    const matKey = spec.mat === 'grate' || spec.mat === 'rust' ? 'rust' : 'wood';
    const { hw, hd } = p.footprint;
    const r = 0.11;
    const corners = [[-1, -1], [1, 1], [-1, 1], [1, -1]].slice(0, this.rng() < 0.5 ? 2 : 4);
    for (const [sx, sz] of corners) {
      const x = sx * (hw - 0.15), z = sz * (hd - 0.2);
      const geo = boxProjectUV(new THREE.CylinderGeometry(r, r, len, 8).translate(x, -len / 2 - p.h, z), 1.2);
      if (!p.kinematic) this.addToBatch(geo.applyMatrix4(p.group.matrixWorld), matKey, p.top);
      else { const m = new THREE.Mesh(geo, this.mats.get(matKey)); m.castShadow = true; p.visual.add(m); }
      const c = this.world.createCollider(R.ColliderDesc.cylinder(len / 2, r).setTranslation(x, -len / 2 - p.h, z), p.body);
      p.colliders.push(c); this.byCollider.set(c.handle, p);
    }
    p.h += len;
  }

  // ------------------------------------------------------------------ specs
  shapeSpec(kind, zone) {
    const r = (a, b) => this.rnd(a, b);
    if (kind.startsWith('p:')) return { shape: 'prop', id: kind.slice(2), randomYaw: true };
    switch (kind) {
      case 'rock': return { shape: 'rock', r: r(1.5, 2.4), h: r(2.5, 4.5), mat: 'rock' };
      case 'rockSmall': return { shape: 'rock', r: r(0.95, 1.25), h: r(2, 3), mat: 'rock' };
      case 'sandrock': return { shape: 'rock', r: r(1.8, 2.8), h: r(3, 5), mat: 'sandrock' };
      case 'plank': return { shape: 'box', w: r(0.9, 1.3), h: 0.22, d: r(3, 4.5), mat: 'wood', supports: true, align: true };
      case 'beam': return { shape: 'box', w: 0.55, h: 0.45, d: r(3.5, 5.5), mat: 'wood', align: true };
      case 'shack': return { shape: 'shack', w: r(2.4, 3.4), h: r(2.4, 3.2), d: r(2.4, 3.4), mat: this.rng() < 0.5 ? 'bluewood' : 'shutter', randomYaw: true };
      case 'pipe': return { shape: 'pipe', r: r(0.55, 0.8), len: r(3.5, 6), mat: 'rust', align: true };
      case 'container': return { shape: 'box', w: 2.4, h: 2.6, d: r(4, 6), mat: 'iron', align: true };
      case 'plate': return { shape: 'box', w: r(1.8, 2.6), h: 0.25, d: r(1.8, 2.6), mat: 'rust', supports: true, randomYaw: true };
      case 'grate': return { shape: 'box', w: r(1.0, 1.4), h: 0.15, d: r(4, 6), mat: 'grate', supports: true, align: true };
      case 'slab': return { shape: 'box', w: r(2, 3.2), h: r(0.4, 0.7), d: r(2.4, 3.6), mat: 'concrete', tilt: 0.12, randomYaw: true };
      case 'road': return { shape: 'box', w: r(2.6, 3.4), h: 0.5, d: r(6, 9), mat: 'concrete', align: true, tilt: 0.05 };
      case 'brickPillar': return { shape: 'box', w: r(1.3, 1.8), h: r(3, 6), d: r(1.3, 1.8), mat: 'brick', randomYaw: true };
      case 'snowRock': return { shape: 'rock', r: r(1.4, 2.2), h: r(2.5, 4), mat: 'snow' };
      case 'iceSlab': return { shape: 'box', w: r(1.6, 2.2), h: 0.5, d: r(2.6, 3.6), mat: 'ice', surface: 'ice', align: true };
      case 'column': return { shape: 'cyl', r: r(0.85, 1.2), h: r(5, 12), mat: 'marble' };
      case 'marbleSlab': return { shape: 'box', w: r(2, 2.8), h: 0.5, d: r(2, 3), mat: 'marble', randomYaw: true };
      case 'satellite': return { shape: 'satellite', span: r(2.2, 3.2), randomYaw: true };
    }
    return { shape: 'box', w: 2, h: 0.5, d: 2, mat: zone.mat };
  }

  behaviorSpec(type, zone) {
    const m = zone.mat;
    const r = (a, b) => this.rnd(a, b);
    const slabMat = m === 'snow' ? 'ice' : m === 'bluewood' ? 'wood' : m;
    switch (type) {
      case 'mover': return { spec: { shape: 'box', w: r(2.0, 2.6), h: 0.45, d: r(2.0, 2.6), mat: slabMat, surface: m === 'snow' ? 'ice' : 'normal', align: true },
        behavior: { type, amp: r(2.5, 4), period: r(4.5, 7), phase: r(0, 6.28) } };
      case 'elevator': return { spec: { shape: 'box', w: 2.6, h: 0.45, d: 2.6, mat: m === 'bluewood' ? 'grate' : slabMat, align: true },
        behavior: { type, amp: r(2.0, 2.8), period: r(5, 7), phase: r(0, 6.28) } };
      case 'rotator': { const L = r(8, 10); return { spec: { shape: 'box', w: 1.25, h: 0.5, d: L, mat: m === 'rust' ? 'iron' : slabMat, align: true },
        behavior: { type, speed: r(0.45, 0.8) * (this.rng() < 0.5 ? -1 : 1), L } }; }
      case 'sweeper': return { spec: { shape: 'cyl', r: 4, h: 0.8, mat: m === 'rust' ? 'iron' : m },
        behavior: { type, speed: r(1.3, 1.9) * (this.rng() < 0.5 ? -1 : 1) } };
      case 'bounce': return { spec: { shape: 'box', w: 2.4, h: 0.7, d: 3.0, mat: 'fabric', surface: 'bounce', align: true }, behavior: { type } };
      case 'fan': return { spec: { shape: 'cyl', r: 2.3, h: 0.9, mat: 'rust', taper: 1.1 }, behavior: { type } };
      case 'crumble': return { spec: { shape: 'box', w: r(1.8, 2.4), h: 0.5, d: r(1.8, 2.4), mat: m === 'snow' ? 'ice' : m === 'marble' ? 'marble' : m === 'iron' ? 'iron' : 'concrete', surface: m === 'snow' ? 'ice' : 'normal', randomYaw: true },
        behavior: { type, state: 'idle', timer: 0 } };
      case 'rope': return { spec: { shape: 'rope' }, behavior: { type, len: r(6, 11), slope: r(0.02, 0.16) } };
      case 'carrier': return { spec: { shape: 'prop', id: 'covered_car' }, behavior: { type, dist: r(9, 14), speed: r(2.6, 3.4), phase: r(0, 1) } };
    }
    return null;
  }

  rayExtent(fp, yaw, dir) {
    if (fp.type === 'circle') return fp.r;
    const ax = Math.cos(yaw), az = -Math.sin(yaw);
    const zx = Math.sin(yaw), zz = Math.cos(yaw);
    const cx = Math.abs(dir.x * ax + dir.z * az), cz = Math.abs(dir.x * zx + dir.z * zz);
    return Math.min(cx > 1e-4 ? fp.hw / cx : 1e9, cz > 1e-4 ? fp.hd / cz : 1e9);
  }
  outerRadius(fp) { return fp.type === 'circle' ? fp.r : Math.hypot(fp.hw, fp.hd); }

  footprintOf(spec) {
    switch (spec.shape) {
      case 'box': return { type: 'rect', hw: spec.w / 2, hd: spec.d / 2 };
      case 'shack': return { type: 'rect', hw: spec.w / 2 + 0.25, hd: spec.d / 2 + 0.25 };
      case 'satellite': return { type: 'rect', hw: 0.9, hd: 0.9 };
      case 'pipe': return { type: 'rect', hw: spec.r * 0.55, hd: spec.len / 2 };
      case 'rock': return { type: 'circle', r: spec.r * 0.93 };
      case 'prop': return this.props.footprint(spec.id);
      default: return { type: 'circle', r: spec.r };
    }
  }
  heightOf(spec) {
    if (spec.shape === 'prop') return this.props.dims(spec.id).h;
    if (spec.shape === 'pipe') return spec.r * 2;
    if (spec.shape === 'satellite') return 1.6;
    return spec.h || 1;
  }

  // ------------------------------------------------------------------ build
  build() {
    const start = this.addPlatform({ shape: 'rock', r: 9, h: 7, mat: 'sandrock', pos: new THREE.Vector3(0, 3, 0), zone: 0, noBatch: true });
    start.isStart = true;
    this.startTop = 3;
    this.spawnPoint = new THREE.Vector3(-1.5, 4.1, 2.5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this.rnd(-0.3, 0.3), d = this.rnd(12, 18);
      this.addPlatform({ shape: 'rock', r: this.rnd(1.5, 3), h: this.rnd(3, 5), mat: 'rock', pos: new THREE.Vector3(Math.cos(a) * d, this.rnd(0.6, 1.8), Math.sin(a) * d), zone: 0 });
    }
    start.path = 0;
    this.path.push(start);
    this.corridors = [];
    this.buildCores();

    let cur = start;
    let curTop = cur.top;
    const ranges = [];
    ZONES.forEach((zone, zi) => {
      this.zoneStarts[zi] = zi === 0 ? 0 : curTop - this.startTop;
      const y0 = curTop;
      if (zi > 0) {
        const entryMat = zone.mat === 'bluewood' ? 'brick' : zone.mat;
        const entry = this.placeNext(cur, curTop, zone, zi, { shape: 'cyl', r: 2.8, h: 1.2, mat: entryMat }, null, { gap: 1.6, rise: 0.8 });
        cur = entry.next; curTop = cur.top;
        entry.p.zoneEntry = zi;
      }
      const bag = this.behaviorBag(zone);
      for (let i = 0; i < zone.count; i++) {
        const t = i / (zone.count - 1);
        const bType = bag[i];
        let spec, behavior = null;
        if (bType === 'static') spec = this.shapeSpec(this.pick(zone.shapes), zone);
        else { const b = this.behaviorSpec(bType, zone); spec = b.spec; behavior = b.behavior; }
        const res = this.placeNext(cur, curTop, zone, zi, spec, behavior, { t });
        cur = res.next;
        curTop = cur.top + (behavior?.type === 'elevator' ? behavior.amp : 0);
      }
      ranges[zi] = [y0, curTop];
    });

    // スタート地点：最初の足場の方を向いて島の縁寄りに立つ
    const first = this.path[1].base;
    const fa = Math.atan2(first.x, first.z);
    this.spawnPoint = new THREE.Vector3(Math.sin(fa) * 5.5, this.startTop + 1.1, Math.cos(fa) * 5.5);
    this.spawnYaw = Math.atan2(-(first.x - this.spawnPoint.x), -(first.z - this.spawnPoint.z));

    const goalRes = this.placeNext(cur, curTop, ZONES[6], 6, { shape: 'cyl', r: 6, h: 2.2, mat: 'marble' }, null, { gap: 2.2, rise: 1.5 });
    this.buildGoal(goalRes.p);
    this.totalHeight = goalRes.p.top - this.startTop;
    this.ranges = ranges;

    ZONES.forEach((z, zi) => this.addFillers(z, zi, ranges[zi]));
    this.buildDecor();
    this.flushBatches();
  }

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

  /** 螺旋の接線方向（塔の周りを回りながら登る） */
  preferredAngle(pos) {
    const r = Math.hypot(pos.x, pos.z);
    const radial = Math.atan2(pos.x, pos.z);
    let ang = radial + this.spin * Math.PI / 2;
    if (r < R_MIN + 2) ang -= this.spin * 0.6;
    else if (r > R_MAX - 3) ang += this.spin * 0.6;
    return ang;
  }

  placeNext(cur, curTop, zone, zi, spec, behavior, opt = {}) {
    const t = opt.t ?? 0;
    const bType = behavior?.type;
    const g = PHYS.G * this.zoneGravity(zi);
    const from = cur.surface;
    let rise = opt.rise ?? this.rnd(zone.rise[0], zone.rise[1]) * THREE.MathUtils.lerp(0.85, 1.1, t);
    let gap = opt.gap ?? this.rnd(zone.gap[0], zone.gap[1]) * THREE.MathUtils.lerp(0.85, 1.05, t) * this.rnd(0.9, 1.05);
    if (from === 'bounce') { rise = this.rnd(5, 7) * (zi === 6 ? 1.6 : 1); gap = this.rnd(0.6, 1.6); }
    else if (from === 'fan') { rise = this.rnd(7, 10); gap = this.rnd(0.6, 1.4); }
    else if (from === 'rope') { rise = this.rnd(0.0, 0.3); gap = this.rnd(0.3, 0.6); }
    else if (from === 'carrier') { rise = this.rnd(0.1, 0.5); gap = this.rnd(0.4, 0.9); }
    else gap = Math.min(gap, reach(rise, g, from === 'ice' ? 5.5 : PHYS.RUN) * zone.safety);
    if (bType === 'rotator') rise = Math.min(rise, 0.6);
    if ((bType === 'rope' || bType === 'carrier') && !['bounce', 'fan'].includes(from)) { rise = Math.min(rise, 0.6); gap = Math.min(gap, 1.0); }

    let fp;
    if (bType === 'rotator') fp = { type: 'circle', r: behavior.L / 2 };
    else if (bType === 'rope') fp = { type: 'rect', hw: 0.12, hd: behavior.len / 2 };
    else fp = this.footprintOf(spec);
    const depth = (bType === 'rope' ? 1 : this.heightOf(spec)) + (spec.supports ? 7 : 0);
    const up = bType === 'elevator' ? behavior.amp : 0;
    const outR = (spec.shape === 'satellite' ? spec.span + 0.9 : this.outerRadius(fp)) + (bType === 'mover' ? behavior.amp : 0);

    const dir = new THREE.Vector3();
    const forced = cur.forceDir != null;
    const pref = forced ? cur.forceDir : this.preferredAngle(cur.base);
    let best = null;
    for (let attempt = 0; attempt < 70 && !best; attempt++) {
      const spread = forced ? Math.min(0.6, attempt * 0.05) : Math.min(Math.PI * 0.9, 0.6 + attempt * 0.1);
      const ang = pref + this.rnd(-spread, spread);
      dir.set(Math.sin(ang), 0, Math.cos(ang));
      const straight = bType === 'rope' || bType === 'carrier';
      const yaw = straight ? ang : spec.align ? ang + this.rnd(-0.25, 0.25) : spec.randomYaw ? this.rnd(0, Math.PI * 2) : 0;
      const fromExt = this.rayExtent(cur.footprint, cur.yaw, dir);
      const toExt = bType === 'rotator' ? behavior.L / 2 : this.rayExtent(fp, yaw, dir);
      const g2 = attempt > 45 ? gap * 0.75 : gap;
      const dist = bType === 'rope' ? fromExt - 0.25 + behavior.len / 2 : fromExt + g2 + toExt;
      const top = curTop + (bType === 'rope' ? 0.05 : rise);
      const center = cur.base.clone().addScaledVector(dir, dist);
      center.y = top;
      let checkCenter = center, checkR = outR;
      if (bType === 'carrier') {
        checkCenter = center.clone().addScaledVector(dir, behavior.dist / 2);
        checkR = behavior.dist / 2 + fp.hd + 0.5;
      }
      const rr = Math.hypot(checkCenter.x, checkCenter.z);
      if ((rr > R_MAX + 4 || rr < 3.5) && attempt < 60) continue;
      if (this.collides(checkCenter, checkR, top - depth - up - (bType === 'carrier' ? 3 : 0), top + 2.8 + up + (bType === 'fan' ? 11 : 0), cur.ref || cur)) continue;
      best = { center, yaw, ang };
    }
    if (!best) {
      this.fallbacks = (this.fallbacks || 0) + 1;
      dir.set(Math.sin(pref), 0, Math.cos(pref));
      const center = cur.base.clone().addScaledVector(dir, this.rayExtent(cur.footprint, cur.yaw, dir) + gap + this.outerRadius(fp));
      center.y = curTop + rise;
      best = { center, yaw: pref, ang: pref };
    }
    if (from === 'bounce') (cur.ref || cur).bounceV = Math.sqrt(2 * g * (best.center.y - cur.top + 3.4));

    let p, next;
    if (bType === 'rope') {
      ({ p, next } = this.addRope(curTop, best, behavior, zi));
    } else {
      const finalSpec = { ...spec, pos: best.center, yaw: best.yaw, zone: zi, behavior };
      if (spec.tilt) { finalSpec.tiltX = this.rnd(-spec.tilt, spec.tilt); finalSpec.tiltZ = this.rnd(-spec.tilt, spec.tilt); }
      p = this.addPlatform(finalSpec);
      if (bType === 'rotator') p.footprint = { type: 'circle', r: behavior.L / 2 };
      p.outR = outR; p.minY = best.center.y - depth - up; p.maxY = best.center.y + 2.8 + up;
      this.attachBehavior(p, dir);
      next = p;
      if (bType === 'carrier') {
        const b = p.behavior;
        next = { base: b.to.clone(), top: p.top, footprint: p.footprint, yaw: p.yaw, surface: 'carrier', forceDir: best.ang, ref: p };
        p.minY = best.center.y - 4; p.outR = b.dist / 2 + p.footprint.hd;
        p.checkCenter = best.center.clone().addScaledVector(dir, b.dist / 2);
      } else if (bType === 'fan') {
        p.maxY = p.top + 13;
        next = { base: p.base, top: p.top, footprint: p.footprint, yaw: 0, surface: 'fan', ref: p };
      } else if (bType === 'bounce') {
        next = { base: p.base, top: p.top, footprint: p.footprint, yaw: p.yaw, surface: 'bounce', ref: p };
      }
    }
    p.path = this.path.length;
    this.path.push(p);
    const ca = cur.base, cb = best.center;
    this.corridors.push({ ax: ca.x, az: ca.z, bx: cb.x, bz: cb.z, y0: Math.min(curTop, cb.y) - 1.5, y1: Math.max(curTop, cb.y) + (from === 'fan' || from === 'bounce' ? 12 : 3.5) });

    if (zone.wind && !['rope', 'carrier', 'rotator', 'fan'].includes(bType) && from === 'normal' && this.rng() < zone.wind && t > 0.1) {
      this.addWind(cur.base, best.center, curTop);
    }
    return { p, next };
  }

  /** 電線・ロープ（細い綱渡り）。終端から次の足場へ続く */
  addRope(curTop, best, behavior, zi) {
    const R = this.RAPIER;
    const dir = new THREE.Vector3(Math.sin(best.ang), 0, Math.cos(best.ang));
    const L = behavior.len;
    const a = best.center.clone().addScaledVector(dir, -L / 2); a.y = curTop + 0.02;
    const b = best.center.clone().addScaledVector(dir, L / 2); b.y = curTop + L * behavior.slope;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const seg = b.clone().sub(a);
    const len = seg.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), seg.clone().normalize());
    const cpos = new THREE.Vector3(mid.x, mid.y - 0.09, mid.z);
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cpos.x, cpos.y, cpos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    const cable = boxProjectUV(new THREE.CylinderGeometry(0.07, 0.07, len, 10, 1), 1).applyQuaternion(q).translate(cpos.x, cpos.y, cpos.z);
    this.addToBatch(cable, 'cable', mid.y);
    for (const [pt, s] of [[a, -1], [b, 1]]) {
      const pole = boxProjectUV(new THREE.CylinderGeometry(0.16, 0.2, 7, 10), 1.2).translate(pt.x + dir.x * s * 0.12, pt.y - 3.4, pt.z + dir.z * s * 0.12);
      this.addToBatch(pole, 'wood', pt.y);
    }
    const group = new THREE.Group();
    const spec = { shape: 'rope', pos: mid, yaw: best.ang, zone: zi, behavior, surface: 'rope' };
    const p = this.record(spec, body, group, { type: 'rect', hw: 0.12, hd: L / 2 }, 0.2);
    p.rope = { a, b };
    const c = this.world.createCollider(R.ColliderDesc.capsule(len / 2, 0.09).setFriction(0), body);
    p.colliders.push(c); this.byCollider.set(c.handle, p);
    p.outR = L / 2 + 0.5; p.minY = Math.min(a.y, b.y) - 7; p.maxY = Math.max(a.y, b.y) + 2.8;
    const next = { base: b.clone(), top: b.y, footprint: { type: 'circle', r: 0.15 }, yaw: best.ang, surface: 'rope', forceDir: best.ang, ref: p };
    return { p, next };
  }

  collides(center, outR, minY, maxY, ignore) {
    for (const p of this.platforms) {
      if (p === ignore) continue;
      const pMin = p.minY ?? p.top - p.h, pMax = p.maxY ?? p.top + 2.8;
      if (maxY < pMin || minY > pMax) continue;
      const pr = p.outR ?? this.outerRadius(p.footprint);
      const pc = p.checkCenter || p.base;
      if (Math.hypot(center.x - pc.x, center.z - pc.z) < outR + pr + 1.0) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ behaviors
  attachBehavior(p, dir) {
    const b = p.behavior;
    if (b.type === 'mover') {
      const side = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      p.update = (time) => {
        this._v.copy(p.base).addScaledVector(side, Math.sin((time / b.period) * Math.PI * 2 + b.phase) * b.amp);
        this.setPose(p, this._v, p.baseQ);
      };
    } else if (b.type === 'elevator') {
      p.update = (time) => {
        this._v.copy(p.base); this._v.y += Math.sin((time / b.period) * Math.PI * 2 + b.phase) * b.amp;
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
      const barMat = this.mats.get('rust', { emissive: 0x661100, emissiveIntensity: 0.6 });
      const bar = new THREE.Mesh(boxProjectUV(new THREE.CylinderGeometry(0.22, 0.22, len, 14).rotateZ(Math.PI / 2), 1.5), barMat);
      bar.position.y = 0.5; bar.castShadow = true;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12), barMat);
      post.position.y = 0.3;
      pivot.add(bar, post);
      this.root.add(pivot);
      const hz = { p, len, speed: b.speed, angle: 0, pivot, top: p.top };
      this.hazards.push(hz);
      p.update = (time) => { hz.angle = time * b.speed; pivot.rotation.y = hz.angle; };
    } else if (b.type === 'bounce') {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8).rotateX(-Math.PI / 2), makePadMaterial());
      const holder = new THREE.Group(); holder.position.copy(p.base); holder.position.y += 0.02; holder.quaternion.copy(p.baseQ); holder.add(pad);
      this.root.add(holder);
      p.pad = pad;
      this.animated.push(pad.material);
    } else if (b.type === 'fan') {
      // 上向きの巨大扇風機（シーリングファンを逆さに設置）と上昇気流
      const holder = new THREE.Group();
      holder.position.copy(p.base);
      const spinner = new THREE.Group();
      const fan = this.props.addDynamic('ceiling_fan');
      fan.rotation.x = Math.PI;
      fan.position.y = this.props.dims('ceiling_fan').h * 0.2;
      spinner.add(fan);
      holder.add(spinner);
      this.root.add(holder);
      const f = { p, center: p.base.clone(), r: 2.1, y0: p.top, y1: p.top + 13, spinner, holder };
      this.fans.push(f);
      this.addFanStreaks(f);
      p.update = (time, dt) => { spinner.rotation.y += dt * 9; };
    } else if (b.type === 'crumble') {
      p.update = (time, dt) => this.updateCrumble(p, dt);
    } else if (b.type === 'carrier') {
      // 梁から吊られた車がケーブルで往復する
      b.from = p.base.clone();
      b.to = p.base.clone().addScaledVector(dir, b.dist);
      const beamH = 9;
      const mid = b.from.clone().add(b.to).multiplyScalar(0.5);
      const beam = boxProjectUV(new THREE.BoxGeometry(0.5, 0.7, b.dist + 6), 2.4).rotateY(p.yaw).translate(mid.x, p.top + beamH, mid.z);
      this.addToBatch(beam, 'rust', p.top);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, beamH, 6).translate(0, beamH / 2, 0), this.mats.get('cable'));
      p.visual.add(cable);
      const T = b.dist / b.speed;
      p.update = (time) => {
        const cyc = T * 2 + 2.8;
        const u = ((time / cyc + b.phase) % 1) * cyc;
        let k;
        if (u < 1.4) k = 0; else if (u < 1.4 + T) k = (u - 1.4) / T; else if (u < 2.8 + T) k = 1; else k = 1 - (u - 2.8 - T) / T;
        k = k * k * (3 - 2 * k);
        this._v.lerpVectors(b.from, b.to, k);
        this.setPose(p, this._v, p.baseQ);
      };
    }
  }

  addFanStreaks(f) {
    const count = 28;
    const mat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.04, 1.6), mat, count);
    inst.frustumCulled = false;
    f.inst = inst;
    f.seeds = Array.from({ length: count }, () => [Math.random(), Math.random() * Math.PI * 2, Math.sqrt(Math.random())]);
    this.root.add(inst);
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
    const mat = p.material;
    b.timer += dt;
    if (b.state === 'shake') {
      p.visual.position.set((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08);
      mat?.emissive.setRGB(0.5 * b.timer, 0.12 * b.timer, 0);
      if (b.timer > 0.85) { b.state = 'fall'; b.timer = 0; b.vy = 0; b.y = p.base.y; p.colliders.forEach((c) => c.setEnabled(false)); }
      this.setPose(p, p.base, p.baseQ);
    } else if (b.state === 'fall') {
      b.vy += 20 * dt; b.y -= b.vy * dt;
      this._v.copy(p.base); this._v.y = b.y;
      this.setPose(p, this._v, p.baseQ);
      if (mat) { mat.transparent = true; mat.opacity = Math.max(0, 1 - b.timer / 1.4); }
      if (b.timer > 1.4) { b.state = 'gone'; b.timer = 0; p.group.visible = false; }
    } else if (b.state === 'gone') {
      if (b.timer > 4.5) {
        b.state = 'respawn'; b.timer = 0; p.group.visible = true;
        this.setPose(p, p.base, p.baseQ);
        p.colliders.forEach((c) => c.setEnabled(true));
        mat?.emissive.setRGB(0, 0, 0);
      }
    } else if (b.state === 'respawn') {
      if (mat) mat.opacity = Math.min(1, b.timer / 0.6);
      if (b.timer > 0.6) { b.state = 'idle'; if (mat) { mat.transparent = false; mat.opacity = 1; } }
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
    const count = 46;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 0.035), mat, count);
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
      if (Math.abs(la) < w.halfLen && Math.abs(ls) < w.halfW && Math.abs(dy) < w.halfH) out.addScaledVector(w.side, w.strength * this.gust(w, time));
    }
    return out;
  }

  /** 扇風機の上昇気流：柱の中なら目標上昇速度、圏外なら 0 */
  fanLift(pos) {
    for (const f of this.fans) {
      if (pos.y < f.y0 - 0.5 || pos.y > f.y1) continue;
      if (Math.hypot(pos.x - f.center.x, pos.z - f.center.z) > f.r) continue;
      return 12 * (1 - THREE.MathUtils.smoothstep(pos.y, f.y1 - 4, f.y1));
    }
    return 0;
  }

  // ------------------------------------------------------------------ tower body & fillers
  /** 塔の芯：海から一本の巨大な構造物として立ち上がる（スラム→工業→都市） */
  buildCores() {
    const R = this.RAPIER;
    const addCore = (geo, mat, pos, desc) => {
      this.addToBatch(boxProjectUV(geo, this.mats.tile(mat)).translate(pos.x, pos.y, pos.z), mat, pos.y);
      const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z));
      const c = this.world.createCollider(desc.setFriction(0), body);
      const p = this.record({ shape: 'core', pos, zone: 0 }, body, new THREE.Group(), { type: 'circle', r: 3 }, 12);
      p.colliders.push(c); this.byCollider.set(c.handle, p);
      p.core = true; p.minY = pos.y - 6; p.maxY = pos.y + 6 + 2.8; p.outR = 3.4;
    };
    const h = 12;
    for (let y = 2; y < 430; y += h) {
      const pos = new THREE.Vector3(0, y + h / 2, 0);
      if (y < 140) {
        addCore(new THREE.BoxGeometry(5, h, 5).rotateY(y * 0.13), this.rng() < 0.5 ? 'brick' : 'shutter', pos, R.ColliderDesc.cuboid(2.5, h / 2, 2.5).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), y * 0.13)));
      } else if (y < 290) {
        addCore(new THREE.CylinderGeometry(2.4, 2.4, h, 20), 'iron', pos, R.ColliderDesc.cylinder(h / 2, 2.4));
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + y * 0.01;
          this.addToBatch(boxProjectUV(new THREE.CylinderGeometry(0.6, 0.6, h, 12), 2.5).translate(Math.cos(a) * 2.8, y + h / 2, Math.sin(a) * 2.8), 'rust', y);
        }
      } else {
        addCore(new THREE.BoxGeometry(4.4, h, 4.4).rotateY(y * 0.05), 'concrete', pos, R.ColliderDesc.cuboid(2.2, h / 2, 2.2).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), y * 0.05)));
      }
    }
  }

  /** 経路の周りにガラクタを詰め込む（塔の密度感＋落ちたときの受け皿） */
  addFillers(zone, zi, range) {
    if (!zone.filler?.length || !range) return;
    const [y0, y1] = range;
    let placed = 0;
    for (let tries = 0; tries < zone.fillers * 6 && placed < zone.fillers; tries++) {
      const id = zone.filler[Math.floor(this.rng() * zone.filler.length)];
      const d = this.props.dims(id);
      const a = this.rnd(0, Math.PI * 2), r = zi === 0 ? this.rnd(11, 30) : this.rnd(4, R_MAX + 7);
      const top = zi === 0 ? this.rnd(0.5, 1.4) : this.rnd(y0, y1);
      const pos = new THREE.Vector3(Math.cos(a) * r, top, Math.sin(a) * r);
      const outR = Math.hypot(d.hw, d.hd);
      if (this.collides(pos, outR, top - d.h - 0.5, top + 3.4, null)) continue;
      if (this.blocksCorridor(pos, outR, top - d.h, top)) continue;
      const p = this.addPlatform({ shape: 'prop', id, pos, yaw: this.rnd(0, Math.PI * 2), zone: zi });
      p.outR = outR; p.minY = top - d.h; p.maxY = top + 2.8; p.filler = true;
      placed++;
    }
  }

  /** 足場から足場へのジャンプ経路にかぶるか */
  blocksCorridor(pos, r, y0, y1) {
    for (const c of this.corridors) {
      if (y1 < c.y0 || y0 > c.y1) continue;
      const dx = c.bx - c.ax, dz = c.bz - c.az;
      const L2 = dx * dx + dz * dz || 1;
      const t = THREE.MathUtils.clamp(((pos.x - c.ax) * dx + (pos.z - c.az) * dz) / L2, 0, 1);
      if (Math.hypot(pos.x - (c.ax + dx * t), pos.z - (c.az + dz * t)) < r + 1.6) return true;
    }
    return false;
  }

  buildGoal(p) {
    const g = new THREE.Group();
    g.position.copy(p.base);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.18, emissive: 0x442200, envMapIntensity: 1.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.28, 24, 96), gold);
    ring.position.y = 4.5; ring.castShadow = true;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.08, 12, 96), gold);
    inner.position.y = 4.5;
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

  buildDecor() {
    for (let i = 0; i < 14; i++) {
      const a = this.rnd(0, Math.PI * 2), d = this.rnd(120, 280);
      const h = this.rnd(30, 110), rb = this.rnd(8, 18);
      const geo = boxProjectUV(this.rockGeometry(rb * this.rnd(0.25, 0.5), rb, h, 18, 0.25).translate(0, h / 2 - 2, 0), 7);
      const m = new THREE.Mesh(geo, this.mats.get(i % 2 ? 'rock' : 'sandrock'));
      m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      m.receiveShadow = true;
      this.root.add(m);
    }
    const top = this.totalHeight + this.startTop;
    const mats = ['rock', 'sandrock', 'rock', 'concrete', 'snow', 'marble', 'rock'];
    for (let i = 0; i < 26; i++) {
      const a = this.rnd(0, Math.PI * 2), d = this.rnd(90, 210);
      const r = this.rnd(5, 13), h = r * this.rnd(1.2, 2);
      const k = i / 26;
      const m = new THREE.Mesh(boxProjectUV(this.rockGeometry(r, r * 0.15, h, 18, 0.25), 6), this.mats.get(mats[Math.min(6, Math.floor(k * 7))]));
      m.position.set(Math.cos(a) * d, 30 + k * (top - 30), Math.sin(a) * d);
      m.rotation.y = this.rnd(0, 6);
      this.root.add(m);
    }
  }

  // ------------------------------------------------------------------ runtime
  update(time, dt) {
    for (const p of this.platforms) if (p.update) p.update(time, dt);
  }

  updateVisuals(time, camera, playerY) {
    for (const m of this.animated) if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
    if (this.goal) { this.goal.ring.rotation.y = time * 0.6; this.goal.inner.rotation.x = time * 0.9; }
    // 遠いチャンクは描かない（足場の結合メッシュは広め、ガラクタは近くだけ）
    const lo = Math.floor((playerY - 420) / CHUNK), hi = Math.floor((playerY + 420) / CHUNK);
    for (const m of this.batchMeshes) m.visible = m.userData.chunk >= lo && m.userData.chunk <= hi;
    const dummy = this._dummy || (this._dummy = new THREE.Object3D());
    for (const w of this.winds) {
      if (camera.position.distanceTo(w.center) > 90) { w.inst.visible = false; continue; }
      w.inst.visible = true;
      const g = this.gust(w, time);
      w.inst.material.opacity = 0.12 + 0.3 * g;
      w.seeds.forEach(([s, a, h], i) => {
        const k = ((s + time * 0.35 * (0.6 + g)) % 1) * 2 - 1;
        dummy.position.copy(w.center).addScaledVector(w.side, k * w.halfW * 1.4).addScaledVector(w.along, a * w.halfLen);
        dummy.position.y += h * w.halfH;
        dummy.rotation.set(0, 0, 0);
        dummy.lookAt(dummy.position.x + w.side.x, dummy.position.y, dummy.position.z + w.side.z);
        dummy.rotateY(Math.PI / 2);
        dummy.scale.setScalar(0.6 + g);
        dummy.updateMatrix();
        w.inst.setMatrixAt(i, dummy.matrix);
      });
      w.inst.instanceMatrix.needsUpdate = true;
    }
    // 動く足場・扇風機は近くのものだけ描画
    for (const p of this.platforms) {
      if (p.kinematic && p.behavior.type !== 'crumble') p.group.visible = Math.abs(p.top - playerY) < 160;
    }
    for (const f of this.fans) {
      f.holder.visible = Math.abs(f.y0 - playerY) < 130;
      if (camera.position.distanceTo(f.center) > 80) { f.inst.visible = false; continue; }
      f.inst.visible = true;
      f.seeds.forEach(([s, a, r], i) => {
        const k = (s + time * 0.6) % 1;
        dummy.position.set(f.center.x + Math.cos(a + time * 0.5) * r * f.r, f.y0 + k * (f.y1 - f.y0), f.center.z + Math.sin(a + time * 0.5) * r * f.r);
        dummy.rotation.set(0, 0, 0);
        dummy.lookAt(camera.position.x, dummy.position.y, camera.position.z);
        dummy.scale.set(1, 0.5 + (1 - k), 1);
        dummy.updateMatrix();
        f.inst.setMatrixAt(i, dummy.matrix);
      });
      f.inst.instanceMatrix.needsUpdate = true;
    }
    this.props.updateVisibility(playerY);
  }

  zoneAt(height) {
    let z = 0;
    for (let i = 0; i < this.zoneStarts.length; i++) if (height >= this.zoneStarts[i] - 0.5) z = i;
    return z;
  }

  reset() {
    for (const p of this.platforms) {
      if (p.behavior.type !== 'crumble') continue;
      const b = p.behavior; b.state = 'idle'; b.timer = 0;
      p.group.visible = true;
      if (p.material) { p.material.transparent = false; p.material.opacity = 1; p.material.emissive.setRGB(0, 0, 0); }
      p.colliders.forEach((c) => c.setEnabled(true));
    }
  }
}
