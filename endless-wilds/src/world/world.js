// 無限に続くオープンワールド。チャンク単位で地面と景観を生成・破棄する。
import * as THREE from 'three';
import { fbm, hash2, makeRng } from '../core/util.js';
import { decorGeometry, itemGeometry } from '../render/models.js';

export const CHUNK = 32;
const SEG = 12;
const RADIUS = 2;

export const BIOMES = {
  meadow: { name: '陽だまりの草原', ground: ['#7cc45a', '#86cf60', '#74b954'], decor: { grass: 9, flower: 5, tree: 2.2, bush: 2, rock: 1 }, density: 34, tint: null, map: '#7cc45a' },
  forest: { name: 'ささやきの森', ground: ['#4f9a45', '#57a64c', '#46903f'], decor: { tree: 8, pine: 4, bush: 4, mushroom: 2, grass: 5, rock: 1 }, density: 46, tint: '#1d4a2a', map: '#3f8a3a' },
  desert: { name: '灼熱の砂海', ground: ['#dcbd7e', '#e3c68a', '#d2b170'], decor: { cactus: 4, sandrock: 3, bones: 2, deadtree: 1 }, density: 18, tint: '#ffb060', map: '#e0c27e' },
  snow: { name: '凍てつく雪原', ground: ['#cfdbe8', '#d8e3ee', '#c5d2e1'], decor: { snowpine: 7, snowrock: 3, iceshard: 2 }, density: 30, tint: '#9fd0ff', map: '#e8f0f8' },
  ash: { name: '灰燼の焦土', ground: ['#3d3436', '#463b3c', '#352d2f'], decor: { lavarock: 5, deadtree: 3, bones: 2 }, density: 22, tint: '#ff4a1a', map: '#4a3a3a' },
  crystal: { name: '虹晶の谷', ground: ['#5a4a8a', '#64529a', '#52437e'], decor: { crystalcluster: 6, pillar: 2, rock: 1, mushroom: 1 }, density: 26, tint: '#b04dff', map: '#6a56a0' },
};

const DECOR_KINDS = ['tree', 'pine', 'snowpine', 'deadtree', 'rock', 'sandrock', 'bush', 'grass', 'flower', 'cactus', 'bones', 'iceshard', 'snowrock', 'lavarock', 'crystalcluster', 'pillar', 'mushroom'];

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.chunks = new Map();
    this.explored = new Map(); // key -> 4x4 color array (ミニマップ用)
    this.consumed = new Set(); // 使用済みPOI
    this.pois = new Map(); // id -> poi
    this.onPoiSpawn = null;
    this.onPoiDespawn = null;
    this.time = { value: 0 };

    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.decorMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.decorMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float sway = max(position.y - 0.4, 0.0) * 0.05;
          transformed.x += sin(uTime * 1.6 + position.x * 0.35 + position.z * 0.2) * sway;
          transformed.z += cos(uTime * 1.3 + position.z * 0.3) * sway * 0.6;`);
    };

    // 景観の形はあらかじめ数種類ずつ作っておき、チャンク生成時は配列コピーだけにする
    this.library = {};
    const rng = makeRng(seed ^ 0x9e3779b9);
    for (const k of DECOR_KINDS) {
      this.library[k] = [];
      for (let i = 0; i < 5; i++) {
        const g = decorGeometry(k, rng);
        this.library[k].push({ pos: g.attributes.position.array, nor: g.attributes.normal.array, col: g.attributes.color.array });
      }
    }
    this.poiGeo = {};
    for (const k of ['chest', 'crate', 'vase', 'shrine', 'obelisk', 'seal', 'spring']) this.poiGeo[k] = itemGeometry(k);
    this.seals = [];
    this.makeSeals();
  }

  makeSeals() {
    const r = makeRng(this.seed * 7 + 3);
    const base = r() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const a = base + (i / 3) * Math.PI * 2 + r.range(-0.3, 0.3);
      const d = r.range(165, 215);
      this.seals.push({ id: 'seal' + i, kind: 'seal', x: Math.cos(a) * d, z: Math.sin(a) * d, index: i, broken: false });
    }
  }

  biomeAt(x, z) {
    const s = this.seed;
    const d = Math.hypot(x, z);
    const temp = fbm(x * 0.0045 + 100, z * 0.0045, s + 1, 3);
    const moist = fbm(x * 0.006, z * 0.006 - 50, s + 2, 3);
    const corr = fbm(x * 0.005 - 300, z * 0.005 + 70, s + 3, 3) + Math.max(0, d - 120) / 700;
    if (d < 55) return 'meadow';
    if (corr > 0.74) return temp > 0.5 ? 'ash' : 'crystal';
    if (temp > 0.6) return 'desert';
    if (temp < 0.38) return 'snow';
    if (moist > 0.53) return 'forest';
    return 'meadow';
  }
  dangerAt(x, z) {
    return Math.min(5, Math.floor(Math.hypot(x, z) / 110));
  }

  update(px, pz, dt) {
    this.time.value += dt;
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const need = new Set();
    for (let dx = -RADIUS; dx <= RADIUS; dx++)
      for (let dz = -RADIUS; dz <= RADIUS; dz++) {
        const k = `${cx + dx},${cz + dz}`;
        need.add(k);
        if (!this.chunks.has(k)) this.buildChunk(cx + dx, cz + dz, k);
      }
    for (const [k, ch] of this.chunks) {
      if (!need.has(k)) this.disposeChunk(k, ch);
    }
  }

  buildChunk(cx, cz, key) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const rng = makeRng(Math.floor(hash2(cx, cz, this.seed) * 4294967295));
    const step = CHUNK / SEG;
    // 地面
    const triCount = SEG * SEG * 2;
    const pos = new Float32Array(triCount * 9);
    const col = new Float32Array(triCount * 9);
    const hgt = (x, z) => (hash2(Math.round(x / step), Math.round(z / step), this.seed + 9) - 0.5) * 0.35;
    const c = new THREE.Color();
    let o = 0;
    const mapCols = [];
    for (let i = 0; i < SEG; i++)
      for (let j = 0; j < SEG; j++) {
        const ax = x0 + i * step, az = z0 + j * step;
        const quads = [[ax, az], [ax + step, az], [ax + step, az + step], [ax, az + step]];
        const tris = (i + j) % 2 ? [[0, 3, 1], [1, 3, 2]] : [[0, 3, 2], [0, 2, 1]];
        for (const t of tris) {
          let mx = 0, mz = 0;
          for (const vi of t) { mx += quads[vi][0] / 3; mz += quads[vi][1] / 3; }
          const b = BIOMES[this.biomeAt(mx, mz)];
          c.set(b.ground[Math.floor(hash2(i * 7 + t[0], j * 13 + t[2], this.seed + cx * 31 + cz) * b.ground.length)]);
          const jit = 0.94 + hash2(Math.floor(mx * 3), Math.floor(mz * 3), 5) * 0.12;
          for (const vi of t) {
            const [vx, vz] = quads[vi];
            pos[o] = vx; pos[o + 1] = hgt(vx, vz) - 0.18; pos[o + 2] = vz;
            col[o] = c.r * jit; col[o + 1] = c.g * jit; col[o + 2] = c.b * jit;
            o += 3;
          }
        }
      }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) mapCols.push(BIOMES[this.biomeAt(x0 + (i + 0.5) * 8, z0 + (j + 0.5) * 8)].map);
    this.explored.set(key, mapCols);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    gg.computeVertexNormals();
    const ground = new THREE.Mesh(gg, this.groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // POI
    const pois = [];
    const d = Math.hypot(x0 + CHUNK / 2, z0 + CHUNK / 2);
    const addPoi = (kind, x, z, extra = {}) => {
      const id = `${kind}@${cx},${cz}#${pois.length}`;
      if (this.consumed.has(id)) return;
      pois.push({ id, kind, x, z, ...extra });
    };
    const inner = () => [x0 + rng.range(6, CHUNK - 6), z0 + rng.range(6, CHUNK - 6)];
    {
      const r1 = rng();
      if (d > 30 && r1 < 0.11 + Math.min(0.08, d / 3000)) addPoi('chest', ...inner());
      const r2 = rng();
      if (d > 40 && r2 < 0.07) addPoi('shrine', ...inner());
      const r3 = rng();
      if (d > 90 && r3 < 0.06) addPoi('obelisk', ...inner());
      const r4 = rng();
      if (d > 40 && r4 < 0.045) addPoi('spring', ...inner());
      const nCrates = rng() < 0.55 ? rng.int(1, 3) : 0;
      for (let i = 0; i < nCrates; i++) { const [x, z] = inner(); addPoi(rng() < 0.5 ? 'crate' : 'vase', x, z); }
    }
    for (const s of this.seals) {
      if (!s.broken && Math.floor(s.x / CHUNK) === cx && Math.floor(s.z / CHUNK) === cz) pois.push(s);
    }
    // 景観
    const items = [];
    const center = BIOMES[this.biomeAt(x0 + CHUNK / 2, z0 + CHUNK / 2)];
    const n = Math.floor(center.density * (0.8 + rng() * 0.4));
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * CHUNK, z = z0 + rng() * CHUNK;
      if (Math.hypot(x, z) < 4) continue;
      let blocked = false;
      for (const p of pois) if (Math.hypot(p.x - x, p.z - z) < (p.kind === 'seal' ? 7 : p.kind === 'crate' || p.kind === 'vase' ? 1.2 : 3.5)) blocked = true;
      if (blocked) continue;
      const bio = BIOMES[this.biomeAt(x, z)];
      const kinds = Object.keys(bio.decor);
      let tot = 0; for (const k of kinds) tot += bio.decor[k];
      let rr = rng() * tot, kind = kinds[0];
      for (const k of kinds) { rr -= bio.decor[k]; if (rr <= 0) { kind = k; break; } }
      items.push({ kind, x, z, rot: rng() * Math.PI * 2, s: 0.8 + rng() * 0.45, v: Math.floor(rng() * 5) });
    }
    // 遺跡(ところどころに柱が並ぶ)
    if (rng() < 0.08 && d > 50) {
      const rx = x0 + rng.range(8, CHUNK - 8), rz = z0 + rng.range(8, CHUNK - 8);
      const cnt = rng.int(5, 8);
      for (let i = 0; i < cnt; i++) { const a = (i / cnt) * Math.PI * 2; if (rng() < 0.8) items.push({ kind: 'pillar', x: rx + Math.cos(a) * 5, z: rz + Math.sin(a) * 5, rot: rng() * 6, s: 0.9 + rng() * 0.3, v: Math.floor(rng() * 5) }); }
    }
    let total = 0;
    for (const it of items) total += this.library[it.kind][it.v].pos.length;
    const dp = new Float32Array(total), dn = new Float32Array(total), dc = new Float32Array(total);
    o = 0;
    for (const it of items) {
      const L = this.library[it.kind][it.v];
      const cs = Math.cos(it.rot), sn = Math.sin(it.rot);
      const P = L.pos, N = L.nor, C = L.col;
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i] * it.s, y = P[i + 1] * it.s, z = P[i + 2] * it.s;
        dp[o + i] = x * cs + z * sn + it.x;
        dp[o + i + 1] = y;
        dp[o + i + 2] = -x * sn + z * cs + it.z;
        dn[o + i] = N[i] * cs + N[i + 2] * sn;
        dn[o + i + 1] = N[i + 1];
        dn[o + i + 2] = -N[i] * sn + N[i + 2] * cs;
        dc[o + i] = C[i]; dc[o + i + 1] = C[i + 1]; dc[o + i + 2] = C[i + 2];
      }
      o += P.length;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dg.setAttribute('normal', new THREE.BufferAttribute(dn, 3));
    dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    dg.computeBoundingSphere();
    const decor = new THREE.Mesh(dg, this.decorMat);
    decor.castShadow = true;
    decor.receiveShadow = true;
    this.scene.add(decor);

    const ch = { ground, decor, pois: [] };
    for (const p of pois) {
      const mesh = new THREE.Mesh(this.poiGeo[p.kind], this.decorMat);
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = rng() * Math.PI * 2;
      mesh.castShadow = true;
      this.scene.add(mesh);
      p.mesh = mesh;
      p.chunk = key;
      this.pois.set(p.id, p);
      ch.pois.push(p);
      this.onPoiSpawn && this.onPoiSpawn(p);
    }
    this.chunks.set(key, ch);
  }

  disposeChunk(key, ch) {
    this.scene.remove(ch.ground, ch.decor);
    ch.ground.geometry.dispose();
    ch.decor.geometry.dispose();
    for (const p of ch.pois) this.removePoiMesh(p);
    this.chunks.delete(key);
  }
  removePoiMesh(p) {
    if (p.mesh) { this.scene.remove(p.mesh); p.mesh = null; }
    this.pois.delete(p.id);
    this.onPoiDespawn && this.onPoiDespawn(p);
  }
  consume(p) {
    this.consumed.add(p.id);
    const ch = this.chunks.get(p.chunk);
    if (ch) ch.pois = ch.pois.filter((q) => q !== p);
    this.removePoiMesh(p);
  }
  dispose() {
    for (const [k, ch] of this.chunks) this.disposeChunk(k, ch);
  }
}
