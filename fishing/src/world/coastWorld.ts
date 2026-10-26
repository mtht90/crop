import * as THREE from 'three';
import type { Water } from 'three/examples/jsm/objects/Water.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { instanced, model, texture } from '../core/assets';
import { Rng } from '../sim/rng';
import { buildHut, buildWater, terrainMaterial, type Collider, type FishingWorld } from './common';
import { fbm } from './shapes/lake';
import { COAST_MAX_DEPTH, COAST_DOCK as DOCK, COAST_HUT as HUT, ZONES, beachK, coastDistance, coastHeight, coastX, harborK, rockK } from './shapes/coast';

const TERRAIN_SIZE = 760;
const TERRAIN_SEG = 300;

/** 汐見港・磯：海・堤防・テトラポッド・灯台・磯・砂浜・河口・釣具店 */
export class CoastWorld implements FishingWorld {
  readonly group = new THREE.Group();
  readonly water: Water;
  readonly colliders: Collider[] = [];
  readonly nightLights: THREE.PointLight[] = [];
  readonly windowMats: THREE.MeshStandardMaterial[] = [];

  constructor() {
    this.group.add(this.buildTerrain());
    this.water = buildWater(0x0a3346);
    this.group.add(this.water);
    this.group.add(this.buildBreakwater());
    this.group.add(buildHut(HUT, '釣具店', this, coastHeight(HUT.x, HUT.z)));
    this.group.add(this.buildTrees());
    this.group.add(this.buildRocks());
    this.group.add(this.buildReeds());
    void this.loadProps();
  }

  update(dt: number, waveStrength: number): void {
    const u = this.water.material.uniforms;
    // 海は湖よりうねりが大きい
    u.time.value += dt * (0.6 + waveStrength * 1.1);
    u.distortionScale.value = 3.2 + waveStrength * 5;
    u.size.value = 0.7;
  }

  setClarity(see: number, glare: number): void {
    const u = this.water.material.uniforms;
    u.uSee.value = see;
    u.uGlare.value = glare;
  }

  private buildTerrain(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, coastHeight(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const nor = geo.getAttribute('normal');
    const splat = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const d = coastDistance(x, z);
      const slope = 1 - nor.getY(i);
      const rk = rockK(z);
      const bk = beachK(z);
      const hk = harborK(z);
      let grass = 0;
      let sand = 0;
      let paved = 0;
      let rock = 0;
      if (d < 0 || y < 0.4) {
        // 海底：砂、磯の周りは岩
        sand = 1 - rk * 0.8;
        rock = rk * 0.8;
      } else {
        // 浜は砂、磯は岩、港は舗装、その奥は草地
        const near = 1 - Math.min(1, Math.max(0, (d - 30) / 30));
        sand = bk * near + (1 - rk - hk) * 0.4 * (1 - Math.min(1, d / 12));
        rock = rk * (1 - Math.min(1, Math.max(0, (d - 45) / 20)));
        paved = hk * (1 - Math.min(1, Math.max(0, (d - 45) / 10)));
        grass = Math.max(0, 1 - sand - rock - paved);
      }
      if (slope > 0.22) rock = Math.max(rock, Math.min(1, (slope - 0.22) * 4));
      const sum = grass + sand + paved + rock || 1;
      grass /= sum;
      sand /= sum;
      paved /= sum;
      rock /= sum;
      // 内陸の松林の地面（残り）
      const forest = d > 50 ? Math.min(1, (d - 50) / 30) * (0.5 + 0.5 * fbm(x * 0.03, z * 0.03)) : 0;
      splat.set([grass * (1 - forest), sand * (1 - forest), paved * (1 - forest), rock * (1 - forest)], i * 4);
    }
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    const mat = terrainMaterial({
      grass: 'aerial_grass_rock_diff.jpg',
      sand: 'coast_sand_01_diff.jpg',
      mud: 'concrete_floor_02_diff.jpg',
      rock: 'coast_land_rocks_01_diff.jpg',
      forest: 'forest_ground_04_diff.jpg',
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    // 地形の外の沖：深い海底を遠くまで敷く（水面越しに空が透けないように）
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x06202c }));
    deep.position.y = -COAST_MAX_DEPTH - 0.5;
    mesh.add(deep);
    return mesh;
  }

  /** 堤防：コンクリートの突堤、外海側の胸壁とテトラポッド、先端の赤灯台、常夜灯 */
  private buildBreakwater(): THREE.Group {
    const g = new THREE.Group();
    const conc = texture('concrete_floor_02_diff.jpg').clone();
    conc.needsUpdate = true;
    conc.repeat.set((DOCK.xLand - DOCK.xEnd) / 4, 1.2);
    const concMat = new THREE.MeshStandardMaterial({ map: conc, color: 0xd8d4cc, roughness: 0.95 });
    const len = DOCK.xLand - DOCK.xEnd + 6;
    const bottom = -9;
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, DOCK.deckY - bottom, DOCK.halfWidth * 2), concMat);
    body.position.set((DOCK.xLand + DOCK.xEnd) / 2 + 3, (DOCK.deckY + bottom) / 2, 0);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    // 外海側（北）の胸壁
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len - 4, 1.1, 0.5), concMat);
    wall.position.set((DOCK.xLand + DOCK.xEnd) / 2 + 5, DOCK.deckY + 0.55, DOCK.halfWidth - 0.25);
    wall.castShadow = true;
    g.add(wall);
    this.colliders.push(...Array.from({ length: Math.ceil((len - 4) / 1.2) }, (_, i) => ({ x: DOCK.xEnd + 3 + i * 1.2, z: DOCK.halfWidth + 0.1, r: 0.45 })));

    // テトラポッド：中心から正四面体の4頂点へ伸びる円錐
    const legs: THREE.BufferGeometry[] = [];
    const dirs = [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, -1, -1), new THREE.Vector3(-1, 1, -1), new THREE.Vector3(-1, -1, 1)];
    for (const v of dirs) {
      const c = new THREE.CylinderGeometry(0.28, 0.55, 1.5, 10);
      c.translate(0, 0.75, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize()));
      legs.push(c.toNonIndexed());
    }
    const tetraGeo = mergeGeometries(legs)!;
    tetraGeo.computeVertexNormals();
    const tetraTex = texture('concrete_floor_02_diff.jpg').clone();
    tetraTex.needsUpdate = true;
    tetraTex.repeat.set(0.6, 0.6);
    const rng = new Rng(4242);
    const mats: THREE.Matrix4[] = [];
    for (let x = DOCK.xEnd - 3; x < DOCK.xLand - 6; x += 1.5) {
      for (let row = 0; row < 3; row++) {
        const z = DOCK.halfWidth + 1.4 + row * 1.7 + rng.range(-0.4, 0.4);
        const y = DOCK.deckY - 0.8 - row * 1.4 + rng.range(-0.4, 0.3);
        mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x + rng.range(-0.4, 0.4), y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 6.3), rng.range(0, 6.3), rng.range(0, 6.3))), new THREE.Vector3(1, 1, 1)));
      }
    }
    // 先端のまわりにも
    for (let i = 0; i < 14; i++) {
      const a = rng.range(-1.6, 1.6);
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(DOCK.xEnd - 4.5 + Math.cos(a + Math.PI) * 1.5, DOCK.deckY - 1.2 - rng.range(0, 2.2), Math.sin(a) * 4), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 6.3), rng.range(0, 6.3), 0)), new THREE.Vector3(1, 1, 1)));
    }
    const tetra = new THREE.InstancedMesh(tetraGeo, new THREE.MeshStandardMaterial({ map: tetraTex, color: 0xcfcbc2, roughness: 0.95 }), mats.length);
    mats.forEach((m, i) => tetra.setMatrixAt(i, m));
    tetra.castShadow = tetra.receiveShadow = true;
    g.add(tetra);

    // 赤灯台
    const lh = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 1.0, 20), white);
    base.position.y = 0.5;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 7, 20), red);
    tower.position.y = 4.5;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.18, 20), white);
    gallery.position.y = 8.05;
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x302a20, emissive: 0xff5040, emissiveIntensity: 0 });
    this.windowMats.push(lampMat);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 16), lampMat);
    lamp.position.y = 8.55;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.6, 16), red);
    cap.position.y = 9.25;
    lh.add(base, tower, gallery, lamp, cap);
    lh.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    const beacon = new THREE.PointLight(0xff4030, 0, 30, 1.6);
    beacon.position.y = 9;
    lh.add(beacon);
    this.nightLights.push(beacon);
    lh.position.set(DOCK.xEnd + 1.3, DOCK.deckY, 1.45);
    g.add(lh);
    this.colliders.push({ x: DOCK.xEnd + 1.3, z: 1.45, r: 1.1 });

    // 常夜灯（夜はこの明かりに小魚が集まる）
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x6a6e72, roughness: 0.4, metalness: 0.6 });
    for (let x = DOCK.xEnd + 12; x < DOCK.xLand - 4; x += 16) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5, 8), poleMat);
      pole.position.set(x, DOCK.deckY + 2.5, -DOCK.halfWidth + 0.3);
      const headMat = new THREE.MeshStandardMaterial({ color: 0x404040, emissive: 0xffe0a0, emissiveIntensity: 0 });
      this.windowMats.push(headMat);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.3), headMat);
      head.position.set(x, DOCK.deckY + 5, -DOCK.halfWidth - 0.1);
      const l = new THREE.PointLight(0xffe2b0, 0, 22, 1.4);
      l.position.set(x, DOCK.deckY + 4.8, -DOCK.halfWidth - 1.5);
      this.nightLights.push(l);
      g.add(pole, head, l);
      this.colliders.push({ x, z: -DOCK.halfWidth + 0.3, r: 0.2 });
    }
    // 係船柱
    for (let x = DOCK.xEnd + 6; x < DOCK.xLand - 2; x += 10) {
      const bit = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.5 }));
      bit.position.set(x, DOCK.deckY + 0.25, -DOCK.halfWidth + 0.35);
      g.add(bit);
    }
    return g;
  }

  /** 内陸の松、浜の防風林 */
  private buildTrees(): THREE.Group {
    const g = new THREE.Group();
    const rng = new Rng(808);
    const pines = ['tree_pineTallA', 'tree_pineTallB', 'tree_pineDefaultA', 'tree_pineRoundA'];
    const broad = ['tree_oak', 'tree_default', 'tree_fat'];
    const byKind = new Map<string, THREE.Matrix4[]>();
    let n = 0;
    for (let tries = 0; tries < 9000 && n < 800; tries++) {
      const z = rng.range(-370, 370);
      const d = 22 + Math.pow(rng.next(), 0.7) * 260;
      const x = coastX(z) + d;
      if (x > 375) continue;
      const h = coastHeight(x, z);
      if (h < 0.8) continue;
      if (Math.hypot(x - HUT.x, z - HUT.z) < 16) continue;
      if (harborK(z) > 0.3 && d < 55) continue;
      const beachPines = beachK(z) > 0.5 && d > 35 && d < 95;
      if (!beachPines && fbm(x * 0.02, z * 0.02) < 0.4 && d < 90) continue;
      const kind = beachPines || rng.chance(0.75) ? pines[rng.int(0, pines.length - 1)] : broad[rng.int(0, broad.length - 1)];
      const s = rng.range(5, 8.5);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.15, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.3)), new THREE.Vector3(s, s * rng.range(0.9, 1.3), s));
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind)!.push(m);
      n++;
      if (d < 70) this.colliders.push({ x, z, r: 0.06 * s });
    }
    for (const [kind, mats] of byKind) g.add(instanced(kind, mats, { tint: (_, c) => c.setHSL(0, 0, rng.range(0.55, 0.8)) }));
    return g;
  }

  /** 磯の岩、浜の石：ノイズで歪めた多面体に岩肌のテクスチャ */
  private buildRocks(): THREE.Group {
    const g = new THREE.Group();
    const rng = new Rng(77);
    const variants: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const geo = new THREE.IcosahedronGeometry(1, 3);
      const p = geo.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = 0.75 + 0.5 * fbm(v.x * 1.6 + k * 7, v.z * 1.6 + v.y * 1.3 + k * 3, 4) + 0.08 * Math.sin(v.x * 9 + k);
        v.multiplyScalar(n);
        // 上は平たく、下は埋まる
        if (v.y > 0.3) v.y = 0.3 + (v.y - 0.3) * 0.55;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      variants.push(geo);
    }
    const tex = texture('coast_land_rocks_01_diff.jpg').clone();
    tex.needsUpdate = true;
    tex.repeat.set(1.5, 1.5);
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xb8b0a4, roughness: 0.95 });
    const byKind: THREE.Matrix4[][] = variants.map(() => []);
    const add = (x: number, z: number, s: number) => {
      const y = coastHeight(x, z);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y - s * 0.25, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.25, 0.25), rng.range(0, 6.3), rng.range(-0.25, 0.25))),
        new THREE.Vector3(s * rng.range(0.8, 1.4), s * rng.range(0.6, 1.0), s * rng.range(0.8, 1.3)),
      );
      byKind[rng.int(0, variants.length - 1)].push(m);
      if (s > 1.2 && y > -0.4) this.colliders.push({ x, z, r: s * 0.7 });
    };
    // 磯：波打ち際から沖へ岩が点在
    for (let i = 0; i < 220; i++) {
      const z = rng.range(ZONES.rocks[0] - 10, ZONES.rocks[1] + 10);
      const d = rng.range(-24, 16);
      add(coastX(z) + d, z, rng.range(0.8, 3.6));
    }
    // 浜と港の脇に石
    for (let i = 0; i < 60; i++) {
      const z = rng.range(-300, 300);
      const d = rng.range(4, 120);
      add(coastX(z) + d, z, rng.range(0.4, 1.3));
    }
    variants.forEach((geo, k) => {
      const mats = byKind[k];
      if (!mats.length) return;
      const im = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = im.receiveShadow = true;
      g.add(im);
    });
    return g;
  }

  /** 河口のヨシ */
  private buildReeds(): THREE.Group {
    const rng = new Rng(13);
    const tall: THREE.Matrix4[] = [];
    for (let i = 0; i < 3000 && tall.length < 500; i++) {
      const z = ZONES.river + rng.range(-24, 24);
      const x = coastX(z) + rng.range(-4, 70);
      const y = coastHeight(x, z);
      if (y < -0.9 || y > 0.8) continue;
      const s = rng.range(2, 3.2);
      tall.push(new THREE.Matrix4().compose(new THREE.Vector3(x, Math.max(y, -0.9), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.3)), new THREE.Vector3(s, s * rng.range(1.8, 2.8), s)));
    }
    const g = new THREE.Group();
    g.add(instanced('grass_large', tall, { shadow: false, tint: (_, c) => c.setRGB(0.62, 0.6, 0.4) }));
    return g;
  }

  private async loadProps(): Promise<void> {
    const barrel = await model('barrel');
    if (barrel) {
      for (const [dx, dz] of [
        [-3.4, 2.8],
        [-3.0, 3.8],
        [-2.2, 3.2],
      ]) {
        const b = barrel.clone();
        b.position.set(HUT.x + dx, coastHeight(HUT.x + dx, HUT.z + dz), HUT.z + dz);
        b.traverse((o) => (o.castShadow = true));
        this.group.add(b);
      }
    }
    // 港の内側（堤防の南）に舫った小舟
    const canoe = await model('canoe');
    if (canoe) {
      for (const [x, z, r] of [
        [DOCK.xLand - 14, -DOCK.halfWidth - 2.2, Math.PI / 2 + 0.05],
        [DOCK.xLand - 22, -DOCK.halfWidth - 2.6, Math.PI / 2 - 0.08],
      ]) {
        const c = canoe.clone();
        c.scale.setScalar(3.4);
        c.position.set(x, -0.12, z);
        c.rotation.y = r;
        this.group.add(c);
      }
    }
    // 浜の流木
    const log = await model('log');
    if (log) {
      const rng = new Rng(31);
      for (let i = 0; i < 8; i++) {
        const z = rng.range(ZONES.beach[0], ZONES.beach[1]);
        const x = coastX(z) + rng.range(4, 20);
        const l = log.clone();
        l.scale.setScalar(rng.range(2.5, 4));
        l.rotation.y = rng.range(0, 6.3);
        l.position.set(x, coastHeight(x, z), z);
        this.group.add(l);
      }
    }
  }
}
