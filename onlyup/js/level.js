import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxProjectUV, bakeColor, makeBeamMaterial, makePadMaterial } from './materials.js';
import { PROPS } from './assets.js';
import { CHUNK } from './props.js';
import { Kit, PIECES, buildFerris } from './kit.js';

// ---- プレイヤー物理と同じ定数で「届く距離」を計算し、必ず登れる配置にする ----
export const PHYS = { G: 26, JUMP_V: 10, RUN: 7.0, SPRINT: 9.2 };
function reach(dy, g = PHYS.G, speed = PHYS.RUN) {
  const d = PHYS.JUMP_V ** 2 - 2 * g * dy;
  if (d < 0) return 0;
  return speed * (PHYS.JUMP_V + Math.sqrt(d)) / g;
}

// 本家 Only Up! の流れに沿った 12 エリア。pieces = 大型セットピース、shapes = 間をつなぐ単発の足場
export const ZONES = [
  { key: 'slums', name: 'スラムのゴミ山', en: 'THE SLUMS', count: 26, gap: [1.1, 2.3], rise: [0.4, 1.1], safety: 0.62, mat: 'plaster',
    shapes: { 'p:wooden_crate_01': 2, 'p:Television_01': 1.5, 'p:Barrel_01': 1.5, 'p:utility_box_02': 1, 'p:old_tyre': 1, shack: 2, plank: 1.5 },
    behaviors: { static: 8, bed: 1.6, mover: 0.6, crumble: 0.4, rope: 0.3 }, pieces: { shackRow: 3, junkPile: 3, fireEscape: 2 }, pieceRate: 0.32,
    filler: ['trashbag', 'cardboard_box_01', 'Sofa_01', 'ArmChair_01', 'old_tyre', 'wooden_crate_01', 'Television_01'], fillers: 110 },
  { key: 'rail', name: '線路と貨物列車', en: 'RAILWAY', count: 22, gap: [1.2, 2.5], rise: [0.5, 1.2], safety: 0.64, mat: 'gravel',
    shapes: { 'p:barrel_03': 2, sleepers: 2, plate: 1, 'p:wooden_crate_01': 1, freightBlock: 1.5 },
    behaviors: { static: 7, cart: 2, mover: 0.8 }, pieces: { trackBridge: 2, train: 4 }, pieceRate: 0.36,
    filler: ['barrel_03', 'wooden_crate_01', 'old_tyre'], fillers: 60 },
  { key: 'factory', name: '危険物の工場', en: 'THE FACTORY', count: 26, gap: [1.3, 2.6], rise: [0.6, 1.25], safety: 0.66, mat: 'metalplate',
    shapes: { pipe: 3, plate: 2, grate: 2, 'p:Barrel_01': 2, 'p:steel_frame_shelves_01': 1.2 },
    behaviors: { static: 7, conveyor: 1.6, rotator: 1.2, sweeper: 0.9, fan: 0.6, elevator: 0.8 }, pieces: { pipeRun: 3, catwalk: 3, tankFarm: 2 }, pieceRate: 0.33,
    filler: ['Barrel_01', 'propane_tank', 'metal_tool_chest', 'barrel_03', 'modular_industrial_pipes_01'], fillers: 80 },
  { key: 'subway', name: '地下鉄', en: 'SUBWAY', count: 16, gap: [1.3, 2.6], rise: [0.6, 1.2], safety: 0.66, mat: 'tilewall',
    shapes: { 'p:plastic_crate_01': 2, tileBlock: 2, bench: 1 }, behaviors: { static: 6, mover: 1.2, crumble: 1 }, pieces: { subway: 4 }, pieceRate: 0.34,
    filler: ['plastic_crate_01', 'cardboard_box_01'], fillers: 40 },
  { key: 'construction', name: '工事現場', en: 'CONSTRUCTION SITE', count: 26, gap: [1.3, 2.7], rise: [0.6, 1.3], safety: 0.68, mat: 'paintedmetal',
    shapes: { 'p:cement_bag': 2, plywoodSheet: 2, rebarSlab: 2, ibeam: 2 },
    behaviors: { static: 6, crane: 1.4, carrier: 1.4, crumble: 0.8, rope: 0.3 }, pieces: { containers: 4, scaffold: 3 }, pieceRate: 0.36,
    filler: ['cement_bag', 'plastic_crate_01', 'Barrel_01', 'wooden_crate_01'], fillers: 70 },
  { key: 'road', name: '崩れた高架道路', en: 'THE HIGHWAY', count: 22, gap: [1.4, 2.8], rise: [0.6, 1.3], safety: 0.68, mat: 'asphalt',
    shapes: { roadChunk: 3, barrier: 2, 'p:covered_car': 1 }, behaviors: { static: 6, crumble: 2, mover: 1, carrier: 0.8 }, pieces: { highway: 5 }, pieceRate: 0.36,
    filler: ['covered_car', 'old_tyre', 'cardboard_box_01'], fillers: 50 },
  { key: 'mall', name: 'ショッピングモール', en: 'SHOPPING MALL', count: 22, gap: [1.4, 2.8], rise: [0.6, 1.3], safety: 0.68, mat: 'marbletile',
    shapes: { 'p:wooden_display_shelves_01': 2, 'p:CashRegister_01': 1, marbleSlab: 2, glassBox: 1.5 },
    behaviors: { static: 6, trap: 1.4, elevator: 1, mover: 0.8 }, pieces: { storeFloor: 4, escalator: 3 }, pieceRate: 0.36,
    filler: ['modern_arm_chair_01', 'CoffeeCart_01', 'wooden_display_shelves_01', 'cardboard_box_01'], fillers: 50 },
  { key: 'ferris', name: '観覧車', en: 'FERRIS WHEEL', count: 7, gap: [1.4, 2.6], rise: [0.5, 1.1], safety: 0.66, mat: 'asphalt',
    shapes: { roadChunk: 3, barrier: 1 }, behaviors: { static: 4, crumble: 2 }, pieces: {}, pieceRate: 0, ferrisAt: 4,
    filler: ['covered_car', 'old_tyre'], fillers: 14 },
  { key: 'office', name: '金ピカの社長室', en: 'THE BOSS ROOM', count: 22, gap: [1.4, 2.8], rise: [0.6, 1.3], safety: 0.7, mat: 'woodfloor',
    shapes: { 'p:metal_office_desk': 2, 'p:drawer_cabinet': 2, floorSlab: 2 }, behaviors: { static: 6, elevator: 1.6, mover: 0.8 }, pieces: { officeFloor: 3, goldRoom: 2 }, pieceRate: 0.33,
    filler: ['metal_office_desk', 'drawer_cabinet', 'modern_arm_chair_01', 'classic_laptop'], fillers: 50 },
  { key: 'building', name: 'ビルの配管と階段', en: 'THE TOWER', count: 22, gap: [1.4, 2.8], rise: [0.6, 1.3], safety: 0.7, mat: 'facade',
    shapes: { 'p:exterior_aircon_unit': 2, facadeBlock: 2, duct: 1.5, pipe: 1 }, behaviors: { static: 7, fan: 1, elevator: 0.6 }, pieces: { facadeClimb: 4, fireEscapeFacade: 2 }, pieceRate: 0.36,
    filler: ['exterior_aircon_unit', 'utility_box_02', 'Barrel_01'], fillers: 50 },
  { key: 'heaven', name: '天国への階段', en: 'STAIRWAY TO HEAVEN', count: 26, gap: [1.5, 3.0], rise: [0.6, 1.4], safety: 0.72, mat: 'marble',
    shapes: { marbleSlab: 3, column: 3, cloud: 2 }, behaviors: { static: 6, bounce: 1, rotator: 1, mover: 1, crumble: 1 }, pieces: { stairway: 4, temple: 2 }, pieceRate: 0.33,
    filler: ['marble_bust_01', 'horse_statue_01', 'gothic_statue'], fillers: 30 },
  { key: 'space', name: '宇宙とブラックホール', en: 'BEYOND THE SKY', count: 24, gap: [2.0, 4.0], rise: [1.0, 2.4], safety: 0.6, mat: 'spacemetal', gravity: 0.45,
    shapes: { 'p:moon_rock_01': 3, 'p:moon_rock_03': 2, 'p:moon_rock_05': 1.5, satellite: 2, 'p:vintage_spacecraft_instrument': 1 },
    behaviors: { static: 7, mover: 1.5, rotator: 1.5, crumble: 1 }, pieces: {}, pieceRate: 0,
    filler: ['moon_rock_01', 'moon_rock_03', 'Television_01', 'Barrel_01', 'covered_car'], fillers: 40 },
];

const R_MIN = 14, R_MAX = 44; // 塔の中心軸からの半径
const KINEMATIC = ['mover', 'elevator', 'rotator', 'crumble', 'carrier', 'cart', 'trap', 'gondola', 'crane'];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Level {
  constructor({ RAPIER, world, scene, mats, props, seed = 20261016 }) {
    Object.assign(this, { RAPIER, world, scene, mats, props });
    this.rng = mulberry32(seed);
    this.noise = createNoise3D(mulberry32(seed + 7));
    this.platforms = [];
    this.route = [];        // 経路の目印（上面中心）
    this.path = [];         // 単発の足場・セットピースの並び
    this.byCollider = new Map();
    this.hazards = []; this.winds = []; this.fans = []; this.animated = []; this.conveyors = [];
    this.zoneStarts = [];
    this.batches = new Map();
    this.batchMeshes = [];
    this.occ = new Map();   // 高さ 8m ごとの占有リスト
    this.hanging = [];
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

  gravityAt(height) {
    const s = this.zoneStarts[11];
    if (s === undefined) return 1;
    return THREE.MathUtils.lerp(1, ZONES[11].gravity, THREE.MathUtils.smoothstep(height, s - 25, s + 5));
  }

  // ------------------------------------------------------------------ occupancy
  occupy(c, r, y0, y1, rec) {
    const e = { x: c.x, z: c.z, r, y0, y1, rec };
    for (let b = Math.floor(y0 / 8); b <= Math.floor(y1 / 8); b++) {
      if (!this.occ.has(b)) this.occ.set(b, []);
      this.occ.get(b).push(e);
    }
  }
  collides(center, outR, minY, maxY, ignore) {
    const seen = new Set();
    for (let b = Math.floor(minY / 8); b <= Math.floor(maxY / 8); b++) {
      const list = this.occ.get(b); if (!list) continue;
      for (const e of list) {
        if (seen.has(e)) continue; seen.add(e);
        if (ignore && e.rec === ignore) continue;
        if (maxY < e.y0 || minY > e.y1) continue;
        if (Math.hypot(center.x - e.x, center.z - e.z) < outR + e.r + 1.0) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ geometry helpers
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

  /** 頂点カラーとUVを付けて結合用に整える */
  finishGeo(geo, matKey, tint = 1, ao = true) {
    const g = boxProjectUV(geo, this.mats.tile(matKey), new THREE.Vector3(this.rnd(0, 9), this.rnd(0, 9), this.rnd(0, 9)));
    return bakeColor(g, typeof tint === 'number' ? tint * this.rnd(0.9, 1.06) : tint, { ao });
  }

  roundBox(w, h, d, r = 0.06) {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return rr > 0.005 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
  }

  buildShape(spec) {
    const R = this.RAPIER;
    const descs = [], parts = [];
    let footprint, h;
    const box = (w, hh, d, mat, x = 0, y = 0, z = 0, tint = spec.tint ?? 1) => {
      parts.push({ geo: this.roundBox(w, hh, d, spec.round ?? 0.06).translate(x, y - hh / 2, z), mat, tint });
      descs.push(R.ColliderDesc.cuboid(w / 2, hh / 2, d / 2).setTranslation(x, y - hh / 2, z));
    };
    switch (spec.shape) {
      case 'box':
        h = spec.h; box(spec.w, h, spec.d, spec.mat);
        footprint = { type: 'rect', hw: spec.w / 2, hd: spec.d / 2 };
        break;
      case 'shack':
        h = spec.h;
        box(spec.w, h - 0.25, spec.d, spec.mat, 0, -0.25);
        box(spec.w + 0.5, 0.25, spec.d + 0.5, 'roofiron');
        footprint = { type: 'rect', hw: spec.w / 2 + 0.25, hd: spec.d / 2 + 0.25 };
        break;
      case 'ibeam': // H形鋼
        h = spec.h;
        box(spec.w, 0.12, spec.d, spec.mat, 0, 0, 0);
        box(0.12, spec.h - 0.24, spec.d, spec.mat, 0, -0.12, 0);
        box(spec.w, 0.12, spec.d, spec.mat, 0, -spec.h + 0.12, 0);
        footprint = { type: 'rect', hw: spec.w / 2, hd: spec.d / 2 };
        break;
      case 'satellite': {
        h = 1.6;
        box(1.8, 1.6, 1.8, 'spacemetal');
        const span = spec.span;
        box(span, 0.12, 1.6, 'bluemetal', -(0.9 + span / 2), -0.55);
        box(span, 0.12, 1.6, 'bluemetal', 0.9 + span / 2, -0.55);
        footprint = { type: 'rect', hw: 0.9, hd: 0.9 };
        break;
      }
      case 'cyl': {
        const { r } = spec; h = spec.h;
        parts.push({ geo: new THREE.CylinderGeometry(r, r * (spec.taper ?? 1), h, 28, 1).translate(0, -h / 2, 0), mat: spec.mat, tint: spec.tint ?? 1 });
        descs.push(R.ColliderDesc.cylinder(h / 2, r).setTranslation(0, -h / 2, 0));
        footprint = { type: 'circle', r };
        break;
      }
      case 'rock': {
        const { r } = spec; h = spec.h;
        const geo = this.rockGeometry(r, r * this.rnd(0.18, 0.4), h).translate(0, -h / 2, 0);
        parts.push({ geo, mat: spec.mat, tint: spec.tint ?? 1 });
        const hull = R.ColliderDesc.convexHull(new Float32Array(geo.attributes.position.array));
        descs.push(hull || R.ColliderDesc.cylinder(h / 2, r).setTranslation(0, -h / 2, 0));
        footprint = { type: 'circle', r: r * 0.93 };
        break;
      }
      case 'pipe': {
        const { r, len } = spec; h = r * 2;
        parts.push({ geo: new THREE.CylinderGeometry(r, r, len, 24, 1).rotateX(Math.PI / 2).translate(0, -r, 0), mat: spec.mat, tint: spec.tint ?? 1 });
        for (let f = -len / 2 + 0.6; f < len / 2; f += 2.4) parts.push({ geo: new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.16, 24).rotateX(Math.PI / 2).translate(0, -r, f), mat: 'metalplate', tint: 0.7 });
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
        const geo = this.finishGeo(part.geo, part.mat, part.tint);
        if (!kinematic && !spec.noBatch) { this.addToBatch(geo.applyMatrix4(group.matrixWorld), part.mat, spec.pos.y); continue; }
        let mat = this.mats.get(part.mat, spec.matOpts);
        if (type === 'crumble' || type === 'trap') {
          const src = mat;
          mat = src.clone(); mat.emissive = new THREE.Color(0);
          mat.onBeforeCompile = src.onBeforeCompile; mat.customProgramCacheKey = src.customProgramCacheKey; mat.userData = src.userData;
          this.mats.load(part.mat).then(() => {
            Object.assign(mat, { map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, aoMap: src.aoMap, metalnessMap: src.metalnessMap, metalness: src.metalness, roughness: src.roughness });
            mat.color.set(0xd8d0c8); mat.needsUpdate = true;
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

  /** 静的な部品はチャンク×マテリアル単位で結合（ドローコール削減） */
  addToBatch(geo, mat, y) {
    const m = typeof mat === 'string' ? this.mats.get(mat) : mat;
    if (!geo.attributes.color) bakeColor(geo, 1, { ao: false });
    const key = `${Math.floor(y / CHUNK)}|${m.uuid}`;
    if (!this.batches.has(key)) this.batches.set(key, { mat: m, geos: [], chunk: Math.floor(y / CHUNK) });
    this.batches.get(key).geos.push(geo);
  }

  flushBatches() {
    for (const { mat, geos, chunk } of this.batches.values()) {
      const merged = mergeGeometries(geos.map((g) => {
        const k = g.index ? g.toNonIndexed() : g;
        for (const a of Object.keys(k.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) k.deleteAttribute(a);
        if (!k.attributes.normal) k.computeVertexNormals();
        return k;
      }), false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !mat.transparent; mesh.receiveShadow = true;
      mesh.userData.chunk = chunk;
      this.root.add(mesh);
      this.batchMeshes.push(mesh);
    }
    this.batches.clear();
  }

  addSupports(p, spec) {
    const R = this.RAPIER;
    const len = this.rnd(3, 7);
    const matKey = spec.mat === 'grate' || spec.mat === 'rust' || spec.mat === 'metalplate' ? 'rust' : 'wood';
    const { hw, hd } = p.footprint;
    const r = 0.11;
    const corners = [[-1, -1], [1, 1], [-1, 1], [1, -1]].slice(0, this.rng() < 0.5 ? 2 : 4);
    for (const [sx, sz] of corners) {
      const x = sx * (hw - 0.15), z = sz * (hd - 0.2);
      const geo = this.finishGeo(new THREE.CylinderGeometry(r, r, len, 8).translate(x, -len / 2 - p.h, z), matKey, 0.8, false);
      if (!p.kinematic) this.addToBatch(geo.applyMatrix4(p.group.matrixWorld), matKey, p.top);
      else { const m = new THREE.Mesh(geo, this.mats.get(matKey)); m.castShadow = true; p.visual.add(m); }
      const c = this.world.createCollider(R.ColliderDesc.cylinder(len / 2, r).setTranslation(x, -len / 2 - p.h, z), p.body);
      p.colliders.push(c); this.byCollider.set(c.handle, p);
    }
    p.h += len;
  }

  /** 天井から吊るす飾り（シャンデリアなど） */
  addHanging(id, pos) {
    this.props.addStatic(id, pos, this.rnd(0, 6), null);
    this.hanging.push(pos);
  }

  // ------------------------------------------------------------------ specs
  shapeSpec(kind, zone) {
    const r = (a, b) => this.rnd(a, b);
    if (kind.startsWith('p:')) return { shape: 'prop', id: kind.slice(2), randomYaw: true };
    switch (kind) {
      case 'rock': return { shape: 'rock', r: r(1.5, 2.4), h: r(2.5, 4.5), mat: 'rock' };
      case 'plank': return { shape: 'box', w: r(0.9, 1.3), h: 0.22, d: r(3, 4.5), mat: 'wood', supports: true, align: true, round: 0.03 };
      case 'shack': return { shape: 'shack', w: r(2.4, 3.4), h: r(2.4, 3.2), d: r(2.4, 3.4), mat: this.rng() < 0.5 ? 'bluewood' : 'plaster', randomYaw: true };
      case 'sleepers': return { shape: 'box', w: 2.6, h: r(0.8, 1.6), d: r(1.4, 2.2), mat: 'wood', randomYaw: true, tint: 0.75, round: 0.04 };
      case 'freightBlock': return { shape: 'box', w: 2.6, h: r(2, 2.8), d: r(3, 4), mat: 'freight', randomYaw: true, tint: new THREE.Color(this.rng() < 0.5 ? 0x9c3a2a : 0x2f5a8a) };
      case 'pipe': return { shape: 'pipe', r: r(0.55, 0.8), len: r(3.5, 6), mat: 'rust', align: true };
      case 'plate': return { shape: 'box', w: r(1.8, 2.6), h: 0.25, d: r(1.8, 2.6), mat: 'metalplate', supports: true, randomYaw: true, round: 0.03 };
      case 'grate': return { shape: 'box', w: r(1.0, 1.4), h: 0.15, d: r(4, 6), mat: 'grate', supports: true, align: true, round: 0.02 };
      case 'tileBlock': return { shape: 'box', w: r(1.6, 2.4), h: r(1.5, 3.5), d: r(1.6, 2.4), mat: 'tilewall', randomYaw: true };
      case 'bench': return { shape: 'box', w: 0.7, h: 0.5, d: r(2.4, 3.2), mat: 'wood', align: true, round: 0.05 };
      case 'plywoodSheet': return { shape: 'box', w: r(1.2, 1.5), h: 0.08, d: r(2.4, 3.2), mat: 'plywood', supports: true, align: true, round: 0.01 };
      case 'rebarSlab': return { shape: 'box', w: r(2.2, 3.2), h: r(0.3, 0.5), d: r(2.6, 3.6), mat: 'rebar', randomYaw: true, tilt: 0.06 };
      case 'ibeam': return { shape: 'ibeam', w: 0.5, h: 0.6, d: r(4, 7), mat: 'paintedmetal', align: true, tint: new THREE.Color(0.95, 0.6, 0.2) };
      case 'roadChunk': return { shape: 'box', w: r(3, 5), h: 0.9, d: r(3, 5), mat: 'asphalt', randomYaw: true, tilt: 0.08 };
      case 'barrier': return { shape: 'box', w: 0.6, h: 1.0, d: 3.6, mat: 'concrete', align: true, round: 0.12 };
      case 'marbleSlab': return { shape: 'box', w: r(2, 2.8), h: 0.5, d: r(2, 3), mat: zone.key === 'mall' ? 'marbletile' : 'marble', randomYaw: true };
      case 'glassBox': return { shape: 'box', w: r(1.6, 2.2), h: r(1.2, 2), d: r(1.6, 2.2), mat: 'metalplate', randomYaw: true, matOpts: undefined, tint: 0.9 };
      case 'floorSlab': return { shape: 'box', w: r(2.4, 3.2), h: 0.4, d: r(2.4, 3.2), mat: this.rng() < 0.5 ? 'woodfloor' : 'carpet', randomYaw: true };
      case 'facadeBlock': return { shape: 'box', w: r(1.8, 2.6), h: r(2, 4), d: r(1.8, 2.6), mat: 'facade', randomYaw: true };
      case 'duct': return { shape: 'box', w: 1.2, h: 1.0, d: r(3.5, 5.5), mat: 'metalplate', align: true, tint: 0.85, round: 0.1 };
      case 'column': return { shape: 'cyl', r: r(0.85, 1.2), h: r(5, 12), mat: 'marble' };
      case 'cloud': return { shape: 'rock', r: r(1.6, 2.4), h: r(1.4, 2.2), mat: 'snow', tint: 1.1 };
      case 'satellite': return { shape: 'satellite', span: r(2.2, 3.2), randomYaw: true };
    }
    return { shape: 'box', w: 2, h: 0.5, d: 2, mat: zone.mat };
  }

  behaviorSpec(type, zone) {
    const m = zone.mat;
    const r = (a, b) => this.rnd(a, b);
    const slab = m === 'gravel' ? 'wood' : m === 'tilewall' ? 'terrazzo' : m;
    switch (type) {
      case 'mover': return { spec: { shape: 'box', w: r(2.0, 2.6), h: 0.45, d: r(2.0, 2.6), mat: slab, align: true },
        behavior: { type, amp: r(2.5, 4), period: r(4.5, 7), phase: r(0, 6.28) } };
      case 'elevator': return { spec: { shape: 'box', w: 2.6, h: 0.45, d: 2.6, mat: m === 'woodfloor' ? 'metalplate' : 'grate', align: true },
        behavior: { type, amp: r(2.0, 2.8), period: r(5, 7), phase: r(0, 6.28) } };
      case 'rotator': { const L = r(8, 10); return { spec: { shape: 'box', w: 1.25, h: 0.5, d: L, mat: m === 'marble' ? 'marble' : 'metalplate', align: true },
        behavior: { type, speed: r(0.45, 0.8) * (this.rng() < 0.5 ? -1 : 1), L } }; }
      case 'crane': { const L = r(12, 16); return { spec: { shape: 'box', w: 1.3, h: 0.6, d: L, mat: 'paintedmetal', align: true, tint: new THREE.Color(1, 0.75, 0.25) },
        behavior: { type: 'rotator', crane: true, speed: r(0.3, 0.5) * (this.rng() < 0.5 ? -1 : 1), L } }; }
      case 'sweeper': return { spec: { shape: 'cyl', r: 4, h: 0.8, mat: 'metalplate' }, behavior: { type, speed: r(1.3, 1.9) * (this.rng() < 0.5 ? -1 : 1) } };
      case 'bounce': return { spec: { shape: 'box', w: 2.4, h: 0.7, d: 3.0, mat: 'fabric', surface: 'bounce', align: true, round: 0.25 }, behavior: { type } };
      case 'bed': return { spec: { shape: 'prop', id: 'vintage_day_bed', surface: 'bounce', randomYaw: true }, behavior: { type: 'bounce', bed: true } };
      case 'fan': return { spec: { shape: 'cyl', r: 2.3, h: 0.9, mat: 'rust', taper: 1.1 }, behavior: { type } };
      case 'conveyor': { const L = r(7, 10); return { spec: { shape: 'box', w: 1.6, h: 0.5, d: L, mat: 'metalplate', align: true, tint: 0.45, round: 0.1 }, behavior: { type: 'conveyor', speed: r(2.5, 4) * (this.rng() < 0.35 ? -1 : 1), L } }; }
      case 'crumble': return { spec: { shape: 'box', w: r(1.8, 2.4), h: 0.5, d: r(1.8, 2.4), mat: m === 'marble' ? 'marble' : m === 'asphalt' ? 'asphalt' : 'concrete', randomYaw: true },
        behavior: { type, state: 'idle', timer: 0 } };
      case 'trap': return { spec: { shape: 'box', w: 2.4, h: 0.4, d: 2.4, mat: 'metalplate', align: true }, behavior: { type: 'trap', state: 'idle', timer: 0 } };
      case 'rope': return { spec: { shape: 'rope' }, behavior: { type, len: r(6, 10), slope: r(0.02, 0.14) } };
      case 'carrier': return { spec: m === 'paintedmetal' ? { shape: 'ibeam', w: 0.9, h: 0.6, d: 5, mat: 'paintedmetal', tint: new THREE.Color(1, 0.6, 0.2) } : { shape: 'prop', id: 'covered_car' },
        behavior: { type, dist: r(9, 14), speed: r(2.6, 3.4), phase: r(0, 1) } };
      case 'cart': return { spec: { shape: 'box', w: 1.6, h: 1.0, d: 2.2, mat: 'rust', tint: 0.8, round: 0.08 }, behavior: { type: 'carrier', cart: true, dist: r(14, 22), speed: r(3, 4), phase: r(0, 1) } };
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
      case 'box': case 'ibeam': return { type: 'rect', hw: spec.w / 2, hd: spec.d / 2 };
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
    // スタート：海に浮かぶゴミの島
    const start = this.addPlatform({ shape: 'rock', r: 15, h: 7, mat: 'sandrock', pos: new THREE.Vector3(0, 3, 0), zone: 0, noBatch: true });
    start.isStart = true;
    this.startTop = 3;
    this.occupy(start.base, 15, -4, 6, start);
    start.path = 0;
    this.path.push(start);
    this.route.push({ pos: start.base.clone(), rec: start });
    this.corridors = [];
    this.buildCore();

    let cur = { base: start.base.clone(), top: 3, footprint: { type: 'circle', r: 13.5 }, yaw: 0, surface: 'normal', ref: start };
    let curTop = 3;
    const ranges = [];
    ZONES.forEach((zone, zi) => {
      this.zoneStarts[zi] = zi === 0 ? 0 : curTop - this.startTop;
      const y0 = curTop;
      const bag = this.courseBag(zone);
      for (let i = 0; i < bag.length; i++) {
        const step = bag[i];
        const t = i / Math.max(1, bag.length - 1);
        let res;
        if (step === 'ferris') res = this.placeFerris(cur, curTop, zi);
        else if (step.startsWith('piece:')) res = this.placePiece(cur, curTop, zone, zi, step.slice(6));
        if (!res) {
          let spec, behavior = null;
          const bType = step.startsWith('piece:') || step === 'ferris' ? 'static' : step;
          if (bType === 'static') spec = this.shapeSpec(this.pick(zone.shapes), zone);
          else { const b = this.behaviorSpec(bType, zone); spec = b.spec; behavior = b.behavior; }
          res = this.placeNext(cur, curTop, zone, zi, spec, behavior, { t });
        }
        cur = res.next;
        curTop = cur.top + (res.p?.behavior?.type === 'elevator' ? res.p.behavior.amp : 0);
      }
      ranges[zi] = [y0, curTop];
    });

    this.buildGoal(cur, curTop);
    this.totalHeight = this.goal.top - this.startTop;
    this.ranges = ranges;

    const first = this.route[1]?.pos || new THREE.Vector3(10, 3, 0);
    const fa = Math.atan2(first.x, first.z);
    this.spawnPoint = new THREE.Vector3(Math.sin(fa) * 11.5, this.startTop + 1.1, Math.cos(fa) * 11.5);
    this.spawnYaw = Math.atan2(-(first.x - this.spawnPoint.x), -(first.z - this.spawnPoint.z));

    ZONES.forEach((z, zi) => this.addFillers(z, zi, ranges[zi]));
    this.buildSkyline(ranges);
    this.flushBatches();
  }

  /** ゾーン内の並び：単発の足場・ギミック・セットピースを混ぜる（特殊な足場が続きすぎないように） */
  courseBag(zone) {
    const n = Math.round(zone.count * (zone.key === 'ferris' ? 1 : 1.85)); // 本家に近い規模（約1時間・約900 m）
    const out = ['static', 'static'];
    const pieceNames = Object.keys(zone.pieces);
    const entries = Object.entries(zone.behaviors);
    const sum = entries.reduce((a, [, w]) => a + w, 0);
    const pool = [];
    for (const [k, w] of entries) if (k !== 'static') for (let i = 0; i < Math.max(1, Math.round((w / sum) * n * (1 - zone.pieceRate))); i++) pool.push(k);
    const nPieces = Math.round(n * zone.pieceRate);
    for (let i = 0; i < nPieces; i++) pool.push('piece:' + (pieceNames.length ? this.pick(zone.pieces) : 'x'));
    while (pool.length < n - 2) pool.push('static');
    pool.length = n - 2;
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // 特殊なものの間には必ず普通の足場を挟む
    const res = [...out];
    for (const s of pool) {
      if (s !== 'static' && res[res.length - 1] !== 'static') res.push('static');
      res.push(s);
    }
    if (zone.ferrisAt !== undefined) res.splice(zone.ferrisAt, 0, 'ferris');
    return res.filter((s) => s !== 'piece:x');
  }

  preferredAngle(pos) {
    const r = Math.hypot(pos.x, pos.z);
    const radial = Math.atan2(pos.x, pos.z);
    let ang = radial + this.spin * Math.PI / 2;
    if (r < R_MIN + 3) ang -= this.spin * 0.7;
    else if (r > R_MAX - 6) ang += this.spin * 0.7;
    return ang;
  }

  pushRoute(pos, rec, kind = 'hop') {
    const prev = this.route[this.route.length - 1];
    if (prev) this.corridors.push({ ax: prev.pos.x, az: prev.pos.z, bx: pos.x, bz: pos.z, y0: Math.min(prev.pos.y, pos.y) - 1.5, y1: Math.max(prev.pos.y, pos.y) + 3.5 });
    this.route.push({ pos: pos.clone(), rec, kind });
  }

  /** 大型セットピースを置く。入口は今の足場から跳べる距離、ぶつかる向きは避ける */
  placePiece(cur, curTop, zone, zi, name) {
    if (!PIECES[name] && !['goldRoom', 'fireEscapeFacade'].includes(name)) return null;
    const pref = this.preferredAngle(cur.base);
    const log = (this.pieceLog ||= {})[name] ||= { ok: 0, radius: 0, fit: 0, fail: 0 };
    for (let attempt = 0; attempt < 18; attempt++) {
      const ang = pref + this.rnd(-1, 1) * Math.min(Math.PI * 0.85, 0.4 + attempt * 0.18);
      const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
      const kit = new Kit(this, zi);
      let exit;
      if (name === 'goldRoom') exit = PIECES.officeFloor(kit, { gold: true });
      else if (name === 'fireEscapeFacade') exit = PIECES.fireEscape(kit, { wall: 'facade' });
      else exit = PIECES[name](kit);
      const rise = this.rnd(0, 0.8);
      const gap = this.rnd(1.0, 1.8);
      const origin = cur.base.clone().addScaledVector(dir, this.rayExtent(cur.footprint, cur.yaw, dir) + gap);
      origin.y = curTop + rise;
      const far = origin.clone().addScaledVector(dir, exit.z);
      const rr = Math.hypot(far.x, far.z), r0 = Math.hypot(origin.x, origin.z);
      if ((rr > R_MAX + 10 || rr < R_MIN - 4 || r0 < R_MIN - 4) && attempt < 14) { log.radius++; continue; }
      if (!kit.fits(origin, ang, cur.ref || null)) { log.fit++; continue; }
      log.ok++;
      const rec = kit.commit(origin, ang);
      rec.path = this.path.length; rec.piece = name;
      this.path.push(rec);
      for (const w of rec.wps) this.pushRoute(w, rec, 'piece');
      const M = new THREE.Matrix4().compose(origin, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(1, 1, 1));
      const ex = new THREE.Vector3(exit.x, exit.y, exit.z).applyMatrix4(M);
      const next = { base: ex, top: ex.y, footprint: exit.fp, yaw: ang + (exit.yaw || 0), surface: 'normal', ref: rec };
      return { p: rec, next };
    }
    log.fail++;
    return null;
  }

  /** 観覧車（ゴンドラが回り続ける。一番上で隣の足場へ跳び移る） */
  placeFerris(cur, curTop, zi) {
    const R = 18;
    const pref = this.preferredAngle(cur.base);
    const radial = Math.atan2(cur.base.x, cur.base.z);
    for (let attempt = 0; attempt < 40; attempt++) {
      // 前半は螺旋の向き、後半は塔の外向き（ホイールが塔から張り出す）
      const ang = (attempt % 2 ? radial : pref) + this.rnd(-1, 1) * (0.3 + attempt * 0.06);
      const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
      const origin = cur.base.clone().addScaledVector(dir, this.rayExtent(cur.footprint, cur.yaw, dir) + 1.4);
      origin.y = curTop + 0.3;
      const kit = new Kit(this, zi);
      const { center, R: RR } = buildFerris(kit, R);
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const C = center.clone().applyQuaternion(qy).add(origin);
      // ホイールは dir を含む薄い円盤：面に沿って円を並べて判定
      const slices = [];
      for (let sx = -RR; sx <= RR + 0.01; sx += 4) {
        const hy = Math.sqrt(Math.max(0, RR * RR - sx * sx));
        slices.push({ c: C.clone().addScaledVector(dir, sx), y0: Math.max(C.y - hy - 3, curTop + 3), y1: C.y + hy + 4 });
      }
      if (slices.some((q) => this.collides(q.c, 3.2, q.y0, q.y1, cur.ref))) { (this.pieceLog ||= {}).ferrisFit = ((this.pieceLog.ferrisFit) || 0) + 1; continue; }
      const rec = kit.commit(origin, ang);
      for (const q of slices) this.occupy(q.c, 3.2, q.y0, q.y1, rec);
      rec.path = this.path.length; rec.piece = 'ferris';
      this.path.push(rec);
      this.pushRoute(rec.wps[0], rec, 'piece');
      // ゴンドラ（ホイールの面は ローカル yz 平面）
      const n = 10, speed = 0.09;
      const fwd = dir.clone(), up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const g = this.addPlatform({ shape: 'box', w: 2.2, h: 0.25, d: 2.2, mat: 'bluemetal', pos: C.clone(), yaw: ang, zone: zi, behavior: { type: 'gondola', a0, speed, R: RR - 1.3, C: C.clone(), fwd, up } });
        // 屋根と柱（見た目）
        const roof = new THREE.Mesh(this.finishGeo(this.roundBox(2.4, 0.2, 2.4, 0.08).translate(0, 2.4, 0), 'bluemetal', new THREE.Color(0.9, 0.35, 0.3)), this.mats.get('bluemetal'));
        g.visual.add(roof);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const post = new THREE.Mesh(this.finishGeo(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6).translate(sx * 1.05, 1.15, sz * 1.05), 'rust', 0.8, false), this.mats.get('rust'));
          g.visual.add(post);
        }
        roof.castShadow = true;
        const b = g.behavior;
        g.update = (time) => {
          const a = b.a0 + time * b.speed;
          this._v.copy(b.C).addScaledVector(b.fwd, Math.cos(a) * b.R).addScaledVector(b.up, Math.sin(a) * b.R - 1.2);
          this.setPose(g, this._v, g.baseQ);
        };
        g.top = C.y - RR; g.outR = 2;
        if (i === 0) this.pushRoute(C.clone().addScaledVector(up, -RR), g, 'ride');
      }
      // 頂上の降り場（ホイールの真横）
      const side = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
      const topPos = C.clone().addScaledVector(up, RR - 1.2 + 0.25).addScaledVector(side, 3.2);
      const land = this.addPlatform({ shape: 'box', w: 3.2, h: 0.5, d: 4, mat: 'bluemetal', pos: topPos, yaw: ang, zone: zi });
      this.occupy(topPos, 3, topPos.y - 1, topPos.y + 3, land);
      land.path = this.path.length; this.path.push(land);
      this.pushRoute(topPos, land, 'hop');
      return { p: land, next: { base: topPos, top: topPos.y, footprint: land.footprint, yaw: ang, surface: 'normal', ref: land } };
    }
    return null;
  }

  placeNext(cur, curTop, zone, zi, spec, behavior, opt = {}) {
    const t = opt.t ?? 0;
    const bType = behavior?.type;
    const g = PHYS.G * this.zoneGravity(zi);
    const from = cur.surface;
    let rise = opt.rise ?? this.rnd(zone.rise[0], zone.rise[1]) * THREE.MathUtils.lerp(0.85, 1.1, t);
    let gap = opt.gap ?? this.rnd(zone.gap[0], zone.gap[1]) * THREE.MathUtils.lerp(0.85, 1.05, t) * this.rnd(0.9, 1.05);
    if (from === 'bounce') { rise = this.rnd(5, 7) * (zi === 11 ? 1.6 : 1); gap = this.rnd(0.6, 1.6); }
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
      if (bType === 'carrier') { checkCenter = center.clone().addScaledVector(dir, behavior.dist / 2); checkR = behavior.dist / 2 + fp.hd + 0.5; }
      const rr = Math.hypot(checkCenter.x, checkCenter.z);
      if ((rr > R_MAX + 4 || rr < R_MIN - 3) && attempt < 60) continue;
      if (this.collides(checkCenter, checkR, top - depth - up - (bType === 'carrier' ? 3 : 0), top + 2.8 + up + (bType === 'fan' ? 11 : 0), cur.ref || null)) continue;
      best = { center, yaw, ang, checkCenter, checkR };
    }
    if (!best) {
      this.fallbacks = (this.fallbacks || 0) + 1;
      dir.set(Math.sin(pref), 0, Math.cos(pref));
      const center = cur.base.clone().addScaledVector(dir, this.rayExtent(cur.footprint, cur.yaw, dir) + gap + this.outerRadius(fp));
      center.y = curTop + rise;
      best = { center, yaw: pref, ang: pref, checkCenter: center, checkR: outR };
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
      this.attachBehavior(p, dir);
      next = p;
      if (bType === 'carrier') {
        const b = p.behavior;
        next = { base: b.to.clone(), top: p.top, footprint: p.footprint, yaw: p.yaw, surface: 'carrier', forceDir: best.ang, ref: p };
      } else if (bType === 'fan') {
        next = { base: p.base, top: p.top, footprint: p.footprint, yaw: 0, surface: 'fan', ref: p };
      } else if (bType === 'bounce') {
        next = { base: p.base, top: p.top, footprint: p.footprint, yaw: p.yaw, surface: 'bounce', ref: p };
      }
    }
    this.occupy(best.checkCenter, best.checkR, best.center.y - depth - up - (bType === 'carrier' ? 4 : 0), best.center.y + 2.8 + up + (bType === 'fan' ? 13 : 0), p);
    p.path = this.path.length;
    this.path.push(p);
    this.pushRoute(bType === 'rope' ? p.rope.a.clone() : best.center, p, bType || 'hop');

    if (zone.wind && !['rope', 'carrier', 'rotator', 'fan'].includes(bType) && from === 'normal' && this.rng() < zone.wind && t > 0.1) this.addWind(cur.base, best.center, curTop);
    return { p, next };
  }

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
    this.addToBatch(this.finishGeo(new THREE.CylinderGeometry(0.07, 0.07, len, 10, 1), 'cable', 1, false).applyQuaternion(q).translate(cpos.x, cpos.y, cpos.z), 'cable', mid.y);
    for (const [pt, s] of [[a, -1], [b, 1]]) this.addToBatch(this.finishGeo(new THREE.CylinderGeometry(0.16, 0.2, 7, 10), 'wood', 1, false).translate(pt.x + dir.x * s * 0.12, pt.y - 3.4, pt.z + dir.z * s * 0.12), 'wood', pt.y);
    const spec = { shape: 'rope', pos: mid, yaw: best.ang, zone: zi, behavior, surface: 'rope' };
    const p = this.record(spec, body, new THREE.Group(), { type: 'rect', hw: 0.12, hd: L / 2 }, 0.2);
    p.rope = { a, b };
    const c = this.world.createCollider(R.ColliderDesc.capsule(len / 2, 0.09).setFriction(0), body);
    p.colliders.push(c); this.byCollider.set(c.handle, p);
    best.checkR = L / 2 + 0.5;
    const next = { base: b.clone(), top: b.y, footprint: { type: 'circle', r: 0.15 }, yaw: best.ang, surface: 'rope', forceDir: best.ang, ref: p };
    return { p, next };
  }

  // ------------------------------------------------------------------ behaviors
  attachBehavior(p, dir) {
    const b = p.behavior;
    if (b.type === 'mover') {
      const side = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      p.update = (time) => { this._v.copy(p.base).addScaledVector(side, Math.sin((time / b.period) * Math.PI * 2 + b.phase) * b.amp); this.setPose(p, this._v, p.baseQ); };
    } else if (b.type === 'elevator') {
      // 昇降台：支柱とワイヤー
      p.update = (time) => { this._v.copy(p.base); this._v.y += Math.sin((time / b.period) * Math.PI * 2 + b.phase) * b.amp; this.setPose(p, this._v, p.baseQ); };
      for (const [sx, sz] of [[-1.4, -1.4], [1.4, 1.4]]) {
        const geo = this.finishGeo(new THREE.CylinderGeometry(0.08, 0.08, b.amp * 2 + 6, 8).translate(0, 0, 0), 'rust', 0.8, false);
        geo.applyMatrix4(new THREE.Matrix4().compose(p.base.clone().add(new THREE.Vector3(sx, b.amp + 1.5, sz).applyQuaternion(p.baseQ)), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
        this.addToBatch(geo, 'rust', p.base.y);
      }
    } else if (b.type === 'rotator') {
      const hub = new THREE.Mesh(this.finishGeo(new THREE.CylinderGeometry(0.5, 0.7, 0.9, 16), 'rust', 0.8, false), this.mats.get('rust'));
      hub.position.y = -0.7; hub.castShadow = true;
      p.visual.add(hub);
      if (b.crane) {
        // タワークレーンのマスト（静止）とジブのトラス
        const mastH = 16;
        for (const [sx, sz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
          this.addToBatch(this.finishGeo(new THREE.CylinderGeometry(0.07, 0.07, mastH, 6).translate(p.base.x + sx, p.base.y - 1.2 - mastH / 2, p.base.z + sz), 'paintedmetal', new THREE.Color(1, 0.72, 0.25), false), 'paintedmetal', p.base.y);
        }
        for (let y = 0; y < mastH; y += 1.6) this.addToBatch(this.finishGeo(this.roundBox(1.5, 0.08, 1.5, 0.02).translate(p.base.x, p.base.y - 1.2 - y, p.base.z), 'paintedmetal', new THREE.Color(1, 0.72, 0.25), false), 'paintedmetal', p.base.y);
        const truss = new THREE.Mesh(this.finishGeo(this.roundBox(0.1, 1.4, b.L, 0.02).translate(0.6, 0.7, 0), 'paintedmetal', new THREE.Color(1, 0.72, 0.25), false), this.mats.get('paintedmetal'));
        const truss2 = truss.clone(); truss2.position.x = -1.2;
        const cab = new THREE.Mesh(this.finishGeo(this.roundBox(1.6, 1.6, 1.8, 0.1).translate(0, -0.4, -1.4), 'metalplate', 0.9), this.mats.get('metalplate'));
        p.visual.add(truss, truss2, cab);
      }
      p.update = (time) => { this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw + time * b.speed); this.setPose(p, p.base, this._q); };
    } else if (b.type === 'sweeper') {
      const len = 7.6;
      const pivot = new THREE.Group();
      pivot.position.copy(p.base);
      const barMat = this.mats.get('rust', { emissive: 0x661100, emissiveIntensity: 0.6 });
      const bar = new THREE.Mesh(this.finishGeo(new THREE.CylinderGeometry(0.22, 0.22, len, 14).rotateZ(Math.PI / 2), 'rust', 1, false), barMat);
      bar.position.y = 0.5; bar.castShadow = true;
      const post = new THREE.Mesh(this.finishGeo(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12), 'rust', 1, false), barMat);
      post.position.y = 0.3;
      pivot.add(bar, post);
      this.root.add(pivot);
      const hz = { p, len, speed: b.speed, angle: 0, pivot, top: p.top };
      this.hazards.push(hz);
      p.update = (time) => { hz.angle = time * b.speed; pivot.rotation.y = hz.angle; };
    } else if (b.type === 'bounce') {
      if (!b.bed) {
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8).rotateX(-Math.PI / 2), makePadMaterial());
        const holder = new THREE.Group(); holder.position.copy(p.base); holder.position.y += 0.02; holder.quaternion.copy(p.baseQ); holder.add(pad);
        this.root.add(holder);
        p.pad = pad;
        this.animated.push(pad.material);
      }
    } else if (b.type === 'fan') {
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
    } else if (b.type === 'conveyor') {
      // ベルトコンベア：乗ると運ばれる（テクスチャも流れる）
      b.dir = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)).multiplyScalar(Math.sign(b.speed));
      b.v = Math.abs(b.speed);
      const beltMat = this.mats.get('rubber_belt', { color: 0x2a2a2a, roughness: 0.7 });
      const belt = new THREE.Mesh(this.finishGeo(this.roundBox(1.4, 0.06, b.L - 0.2, 0.02).translate(0, 0.01, 0), 'rubber_belt', 0.4, false), beltMat);
      p.visual.add(belt);
      for (let z = -b.L / 2 + 0.4; z < b.L / 2; z += 1.2) {
        const ar = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3).rotateX(Math.PI / 2 * Math.sign(b.speed)).translate(0, 0.06, z), new THREE.MeshBasicMaterial({ color: 0xd8b030 }));
        ar.scale.set(1, 0.2, 1);
        p.visual.add(ar);
      }
      if (!p.group.parent) this.root.add(p.group);
      this.conveyors.push(p);
    } else if (b.type === 'crumble') {
      p.update = (time, dt) => this.updateCrumble(p, dt);
    } else if (b.type === 'trap') {
      // 罠のエレベーター：乗ると少し上がってから落ちる（本家のデパートの罠）
      for (const [sx, sz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
        this.addToBatch(this.finishGeo(new THREE.CylinderGeometry(0.06, 0.06, 9, 6).translate(p.base.x + sx, p.base.y + 4.3, p.base.z + sz), 'metalplate', 0.8, false), 'metalplate', p.base.y);
      }
      p.update = (time, dt) => this.updateTrap(p, dt);
    } else if (b.type === 'carrier') {
      b.from = p.base.clone();
      b.to = p.base.clone().addScaledVector(dir, b.dist);
      const mid = b.from.clone().add(b.to).multiplyScalar(0.5);
      if (b.cart) {
        // トロッコ：レールと車輪
        for (const sx of [-0.55, 0.55]) {
          const rail = this.finishGeo(this.roundBox(0.1, 0.14, b.dist + 4, 0.02), 'rust', 0.8, false).rotateY(p.yaw);
          rail.translate(mid.x + Math.cos(p.yaw) * sx, p.top - 1.3, mid.z - Math.sin(p.yaw) * sx);
          this.addToBatch(rail, 'rust', p.top);
        }
        for (let s = -b.dist / 2 - 2; s < b.dist / 2 + 2; s += 0.7) {
          const sl = this.finishGeo(this.roundBox(1.6, 0.1, 0.22, 0.02), 'wood', 0.7, false).rotateY(p.yaw);
          sl.translate(mid.x + dir.x * s, p.top - 1.42, mid.z + dir.z * s);
          this.addToBatch(sl, 'wood', p.top);
        }
        for (let s = -b.dist / 2; s <= b.dist / 2; s += 6) this.addToBatch(this.finishGeo(new THREE.CylinderGeometry(0.2, 0.25, 8, 8).translate(mid.x + dir.x * s, p.top - 5.5, mid.z + dir.z * s), 'rust', 0.7, false), 'rust', p.top);
        for (const [sx, sz] of [[-0.6, -0.7], [0.6, -0.7], [-0.6, 0.7], [0.6, 0.7]]) {
          const w = new THREE.Mesh(this.finishGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14).rotateZ(Math.PI / 2).translate(sx, -1.05, sz), 'rust', 0.5, false), this.mats.get('rust'));
          p.visual.add(w);
        }
      } else {
        const beamH = 9;
        const beam = this.finishGeo(this.roundBox(0.5, 0.7, b.dist + 6, 0.04), 'rust', 0.8, false).rotateY(p.yaw).translate(mid.x, p.top + beamH, mid.z);
        this.addToBatch(beam, 'rust', p.top);
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, beamH, 6).translate(0, beamH / 2, 0), this.mats.get('cable'));
        p.visual.add(cable);
      }
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
    if (p.behavior.state === 'idle') { p.behavior.state = p.type === 'trap' ? 'rise' : 'shake'; p.behavior.timer = 0; this.onCrumble?.(p); }
  }

  updateTrap(p, dt) {
    const b = p.behavior;
    b.timer += dt;
    if (b.state === 'rise') {
      this._v.copy(p.base); this._v.y += Math.min(1, b.timer / 1.2) * 1.6;
      this.setPose(p, this._v, p.baseQ);
      if (b.timer > 1.5) { b.state = 'fall'; b.timer = 0; b.vy = 0; b.y = p.base.y + 1.6; }
    } else if (b.state === 'fall') {
      b.vy += 28 * dt; b.y -= b.vy * dt;
      this._v.copy(p.base); this._v.y = b.y;
      this.setPose(p, this._v, p.baseQ);
      if (b.timer > 2.2) { b.state = 'gone'; b.timer = 0; p.group.visible = false; p.colliders.forEach((c) => c.setEnabled(false)); }
    } else if (b.state === 'gone') {
      if (b.timer > 3.5) { b.state = 'idle'; p.group.visible = true; p.colliders.forEach((c) => c.setEnabled(true)); this.setPose(p, p.base, p.baseQ); }
    } else this.setPose(p, p.base, p.baseQ);
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
      if (b.timer > 4.5) { b.state = 'respawn'; b.timer = 0; p.group.visible = true; this.setPose(p, p.base, p.baseQ); p.colliders.forEach((c) => c.setEnabled(true)); mat?.emissive.setRGB(0, 0, 0); }
    } else if (b.state === 'respawn') {
      if (mat) mat.opacity = Math.min(1, b.timer / 0.6);
      if (b.timer > 0.6) { b.state = 'idle'; if (mat) { mat.transparent = false; mat.opacity = 1; } }
      this.setPose(p, p.base, p.baseQ);
    } else { p.visual.position.set(0, 0, 0); this.setPose(p, p.base, p.baseQ); }
  }

  addWind(a, b, y0) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const along = new THREE.Vector3().subVectors(b, a); along.y = 0;
    const len = along.length(); along.normalize();
    const side = new THREE.Vector3(along.z, 0, -along.x).multiplyScalar(this.rng() < 0.5 ? 1 : -1);
    const yTop = Math.max(a.y, b.y);
    const w = { center: new THREE.Vector3(mid.x, (y0 + yTop) / 2 + 2, mid.z), along, side, halfLen: len / 2 + 1.5, halfW: 4.5, halfH: (yTop - y0) / 2 + 3.5, strength: this.rnd(7, 11), phase: this.rnd(0, 6.28) };
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 0.035), mat, 46);
    inst.frustumCulled = false;
    w.inst = inst; w.seeds = Array.from({ length: 46 }, () => [Math.random(), Math.random() * 2 - 1, Math.random() * 2 - 1]);
    this.root.add(inst);
    this.winds.push(w);
  }
  gust(w, time) { return 0.55 + 0.45 * Math.sin(time * 1.3 + w.phase) * Math.sin(time * 0.37 + w.phase * 2); }
  windAt(pos, time, out) {
    out.set(0, 0, 0);
    for (const w of this.winds) {
      const dx = pos.x - w.center.x, dy = pos.y - w.center.y, dz = pos.z - w.center.z;
      const la = dx * w.along.x + dz * w.along.z, ls = dx * w.side.x + dz * w.side.z;
      if (Math.abs(la) < w.halfLen && Math.abs(ls) < w.halfW && Math.abs(dy) < w.halfH) out.addScaledVector(w.side, w.strength * this.gust(w, time));
    }
    return out;
  }
  fanLift(pos) {
    for (const f of this.fans) {
      if (pos.y < f.y0 - 0.5 || pos.y > f.y1) continue;
      if (Math.hypot(pos.x - f.center.x, pos.z - f.center.z) > f.r) continue;
      return 12 * (1 - THREE.MathUtils.smoothstep(pos.y, f.y1 - 4, f.y1));
    }
    return 0;
  }

  // ------------------------------------------------------------------ tower core / fillers / skyline
  /** 塔の芯：エリアごとの巨大な構造物を中心に積む（どこから見ても一本の塔に見える） */
  buildCore() {
    const R = this.RAPIER;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    const rec = this.record({ shape: 'core', pos: new THREE.Vector3(), zone: 0 }, body, new THREE.Group(), { type: 'circle', r: 8 }, 1);
    rec.core = true;
    const add = (geo, mat, desc, x, y, z, tint = 1) => {
      this.addToBatch(this.finishGeo(geo, mat, tint).translate(x, y, z), mat, y);
      if (desc) { const c = this.world.createCollider(desc.setTranslation(x, y, z).setFriction(0), body); rec.colliders.push(c); this.byCollider.set(c.handle, rec); }
    };
    // 高さごとの主題（推定の高さ。実際のゾーン境界と多少ずれてもよい）
    const themes = [
      [1, 80, 'slums'], [80, 150, 'rail'], [150, 240, 'factory'], [240, 290, 'subway'], [290, 380, 'construction'],
      [380, 450, 'road'], [450, 540, 'mall'], [540, 600, 'ferris'], [600, 680, 'office'], [680, 780, 'building'],
    ];
    for (const [y0, y1, th] of themes) {
      for (let y = y0 + 2; y < y1; ) {
        const h = this.rnd(5, 10);
        const w = this.rnd(9, 13), d = this.rnd(9, 13), rot = this.rnd(0, 1.5);
        const mat = { slums: this.rng() < 0.5 ? 'plaster' : 'bluewood', rail: 'concrete', factory: this.rng() < 0.5 ? 'factorywall' : 'rust', subway: 'tilewall', construction: this.rng() < 0.5 ? 'rebar' : 'freight',
          road: 'concrete', mall: 'whiteplaster', ferris: 'concrete', office: 'facade', building: 'facade' }[th];
        const tint = th === 'construction' ? new THREE.Color().setHSL(this.rng(), 0.5, 0.45) : this.rnd(0.75, 1.0);
        if (th === 'factory' && this.rng() < 0.4) {
          add(new THREE.CylinderGeometry(w / 2, w / 2, h, 28), mat, R.ColliderDesc.cylinder(h / 2, w / 2), 0, y + h / 2, 0, tint);
        } else {
          const geo = this.roundBox(w, h, d, 0.15).rotateY(rot);
          add(geo, mat, R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setRotation({ x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) }), 0, y + h / 2, 0, tint);
          if (th === 'slums' || th === 'construction') add(this.roundBox(w + 1, 0.3, d + 1, 0.05).rotateY(rot), 'roofiron', null, 0, y + h + 0.15, 0, 0.9);
        }
        this.occupy(new THREE.Vector3(0, 0, 0), Math.hypot(w, d) / 2 + 0.5, y, y + h, rec);
        y += h;
      }
    }
  }

  /** 経路の周りにガラクタを詰め込む（密度感＋落ちたときの受け皿） */
  addFillers(zone, zi, range) {
    if (!zone.filler?.length || !range) return;
    const [y0, y1] = range;
    const pts = this.route.filter((r) => r.pos.y >= y0 - 2 && r.pos.y <= y1 + 2);
    if (!pts.length) return;
    let placed = 0;
    const nF = Math.round(zone.fillers * 1.5); // 塔が高くなった分、ガラクタも増やす
    for (let tries = 0; tries < nF * 8 && placed < nF; tries++) {
      const id = zone.filler[Math.floor(this.rng() * zone.filler.length)];
      const d = this.props.dims(id);
      const anchor = pts[Math.floor(this.rng() * pts.length)].pos;
      const a = this.rnd(0, Math.PI * 2), r = this.rnd(4, 13);
      const pos = new THREE.Vector3(anchor.x + Math.cos(a) * r, anchor.y + this.rnd(-7, 2), anchor.z + Math.sin(a) * r);
      const outR = Math.hypot(d.hw, d.hd);
      if (this.collides(pos, outR, pos.y - d.h - 0.5, pos.y + 3.4, null)) continue;
      if (this.blocksCorridor(pos, outR, pos.y - d.h, pos.y)) continue;
      const p = this.addPlatform({ shape: 'prop', id, pos, yaw: this.rnd(0, Math.PI * 2), zone: zi });
      this.occupy(pos, outR, pos.y - d.h, pos.y + 2.8, p);
      p.filler = true;
      placed++;
    }
  }

  blocksCorridor(pos, r, y0, y1) {
    for (const c of this.corridors) {
      if (y1 < c.y0 || y0 > c.y1) continue;
      const dx = c.bx - c.ax, dz = c.bz - c.az;
      const L2 = dx * dx + dz * dz || 1;
      const t = THREE.MathUtils.clamp(((pos.x - c.ax) * dx + (pos.z - c.az) * dz) / L2, 0, 1);
      if (Math.hypot(pos.x - (c.ax + dx * t), pos.z - (c.az + dz * t)) < r + 1.8) return true;
    }
    return false;
  }

  /** 遠景：エリアの主題に合わせた巨大な建物群（当たり判定なし） */
  buildSkyline(ranges) {
    const top = this.totalHeight + this.startTop;
    for (let i = 0; i < 14; i++) {
      const a = this.rnd(0, Math.PI * 2), d = this.rnd(130, 280);
      const h = this.rnd(30, 110), rb = this.rnd(8, 18);
      const m = new THREE.Mesh(this.finishGeo(this.rockGeometry(rb * this.rnd(0.25, 0.5), rb, h, 18, 0.25).translate(0, h / 2 - 2, 0), i % 2 ? 'rock' : 'sandrock', 0.9), this.mats.get(i % 2 ? 'rock' : 'sandrock'));
      m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      this.root.add(m);
    }
    const themed = { slums: ['plaster', 'bluewood', 'brick'], rail: ['concrete', 'freight'], factory: ['factorywall', 'rust', 'metalplate'], subway: ['tilewall', 'concrete'], construction: ['rebar', 'freight', 'concrete'],
      road: ['concrete', 'asphalt'], mall: ['whiteplaster', 'facade'], ferris: ['concrete'], office: ['facade', 'whiteplaster'], building: ['facade', 'brick'] };
    ZONES.forEach((z, zi) => {
      const mats = themed[z.key]; if (!mats || !ranges[zi]) return;
      const [y0, y1] = ranges[zi];
      for (let i = 0; i < 9; i++) {
        const a = this.rnd(0, Math.PI * 2), dist = this.rnd(95, 175);
        const w = this.rnd(10, 24), d = this.rnd(10, 24), h = this.rnd(12, 36);
        const y = this.rnd(y0 - 10, y1);
        const mat = mats[Math.floor(this.rng() * mats.length)];
        const ry = this.rnd(0, 3), cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
        const geo = this.finishGeo(this.roundBox(w, h, d, 0.3), mat, this.rnd(0.85, 1.02));
        geo.rotateY(ry).translate(cx, y, cz);
        this.addToBatch(geo, mat, y);
        // 本家の「宙に浮く街の欠片」：建物の下にえぐれた岩盤
        const rr = Math.max(w, d) * 0.62, rh = this.rnd(8, 16);
        const rock = this.finishGeo(this.rockGeometry(rr * 0.25, rr, rh, 14, 0.3).rotateX(Math.PI).translate(cx, y - h / 2 - rh / 2 + 0.6, cz), 'rock', 0.95);
        this.addToBatch(rock, 'rock', y);
        // 屋上の看板・タンク
        if (this.rng() < 0.5) this.addToBatch(this.finishGeo(new THREE.CylinderGeometry(2, 2, 3, 16), 'rust', 0.7).translate(Math.cos(a) * dist, y + h / 2 + 1.5, Math.sin(a) * dist), 'rust', y);
      }
    });
    for (let i = 0; i < 30; i++) {
      const a = this.rnd(0, Math.PI * 2), d = this.rnd(100, 220);
      const r = this.rnd(5, 13), h = r * this.rnd(1.2, 2);
      const k = i / 30;
      const mat = ['rock', 'sandrock', 'concrete', 'marble', 'snow'][Math.min(4, Math.floor(k * 5))];
      const m = new THREE.Mesh(this.finishGeo(this.rockGeometry(r, r * 0.15, h, 18, 0.25), mat, 0.9), this.mats.get(mat));
      m.position.set(Math.cos(a) * d, 40 + k * (top - 40), Math.sin(a) * d);
      m.rotation.y = this.rnd(0, 6);
      this.root.add(m);
    }
  }

  /** ゴール：宇宙船と宇宙飛行士 */
  buildGoal(cur, curTop) {
    const dir = new THREE.Vector3(Math.sin(this.preferredAngle(cur.base)), 0, Math.cos(this.preferredAngle(cur.base)));
    const pos = cur.base.clone().addScaledVector(dir, this.rayExtent(cur.footprint, cur.yaw, dir) + 2.2 + 7);
    pos.y = curTop + 1.5;
    const p = this.addPlatform({ shape: 'cyl', r: 7, h: 2.2, mat: 'spacemetal', pos, zone: 11, noBatch: true });
    p.path = this.path.length; this.path.push(p);
    this.pushRoute(pos, p, 'goal');
    const g = new THREE.Group();
    g.position.copy(pos);
    const white = this.mats.get('spacemetal', { color: 0xf2f2f0 });
    const rocket = new THREE.Group();
    const body = new THREE.Mesh(this.finishGeo(new THREE.CylinderGeometry(1.6, 1.8, 9, 32).translate(0, 4.5 + 1.2, 0), 'spacemetal', 1, false), white);
    const nose = new THREE.Mesh(this.finishGeo(new THREE.ConeGeometry(1.6, 4, 32).translate(0, 9 + 1.2 + 2, 0), 'spacemetal', new THREE.Color(0.85, 0.3, 0.25), false), this.mats.get('spacemetal'));
    const ring = new THREE.Mesh(this.finishGeo(new THREE.CylinderGeometry(1.82, 1.82, 0.5, 32).translate(0, 6, 0), 'spacemetal', new THREE.Color(0.25, 0.3, 0.4), false), this.mats.get('spacemetal'));
    rocket.add(body, nose, ring);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(this.finishGeo(this.roundBox(0.25, 3, 2, 0.05).translate(0, 2.2, 2.2), 'spacemetal', new THREE.Color(0.85, 0.3, 0.25), false), this.mats.get('spacemetal'));
      fin.rotation.y = (i / 4) * Math.PI * 2;
      rocket.add(fin);
    }
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24).translate(0, 7.5, 1.62), this.mats.get('glass', { glass: true, color: 0x3a6a9a }));
    rocket.add(win);
    rocket.position.set(-3, 0, -2);
    rocket.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const beamMat = makeBeamMaterial(0xffd27d);
    beamMat.uniforms.uOpacity.value = 0.45;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 300, 24, 1, true).translate(0, 160, 0), beamMat);
    beam.position.set(-3, 0, -2);
    this.animated.push(beamMat);
    const light = new THREE.PointLight(0xffe2a8, 40, 40, 1.6);
    light.position.set(0, 6, 0);
    g.add(rocket, beam, light);
    this.root.add(g);
    // 宇宙船の当たり
    const c = this.world.createCollider(this.RAPIER.ColliderDesc.cylinder(4.5, 1.8).setTranslation(-3, 4.5, -2), p.body);
    this.byCollider.set(c.handle, p);
    this.goal = { pos: pos.clone(), top: pos.y, r: 6.5, astronautPos: pos.clone().add(new THREE.Vector3(1.5, 0, -1)) };
  }

  // ------------------------------------------------------------------ runtime
  update(time, dt) {
    for (const p of this.platforms) if (p.update) p.update(time, dt);
  }

  updateVisuals(time, camera, playerY) {
    for (const m of this.animated) if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
    const lo = Math.floor((playerY - 420) / CHUNK), hi = Math.floor((playerY + 420) / CHUNK);
    for (const m of this.batchMeshes) m.visible = m.userData.chunk >= lo && m.userData.chunk <= hi;
    for (const p of this.platforms) if (p.kinematic && p.type !== 'crumble' && p.type !== 'trap') p.group.visible = Math.abs(p.top - playerY) < 160;
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
      if (p.type !== 'crumble' && p.type !== 'trap') continue;
      const b = p.behavior; b.state = 'idle'; b.timer = 0;
      p.group.visible = true;
      if (p.material) { p.material.transparent = false; p.material.opacity = 1; p.material.emissive.setRGB(0, 0, 0); }
      p.colliders.forEach((c) => c.setEnabled(true));
    }
  }
}
