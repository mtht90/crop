import * as THREE from 'three';
import type { Water } from 'three/examples/jsm/objects/Water.js';
import { instanced, model, texture } from '../core/assets';
import { buildHut, buildWater, terrainMaterial, type Collider, type FishingWorld } from './common';
import { Rng } from '../sim/rng';
import {
  DOCK,
  HUT,
  fbm,
  isRockArea,
  isSandArea,
  isWeedArea,
  shoreDistance,
  shoreRadius,
  terrainHeight,
  ANGLES,
} from './shapes/lake';

const TERRAIN_SIZE = 760;
const TERRAIN_SEG = 300;

/** 湖の釣り場：地形・水面・桟橋・小屋・植生 */
export class LakeWorld implements FishingWorld {
  readonly group = new THREE.Group();
  readonly water: Water;
  readonly colliders: Collider[] = [];
  /** 夜に灯る明かり */
  readonly nightLights: THREE.PointLight[] = [];
  readonly windowMats: THREE.MeshStandardMaterial[] = [];
  private swayTime = { value: 0 };

  constructor() {
    this.group.add(this.buildTerrain());
    this.water = buildWater(0x0e2b2a);
    this.group.add(this.water);
    this.group.add(this.buildDock());
    this.group.add(buildHut(HUT, '釣り小屋', this, terrainHeight(HUT.x, HUT.z)));
    this.group.add(this.buildTrees());
    this.group.add(this.buildRocks());
    this.group.add(this.buildReeds());
    this.group.add(this.buildLilyPads());
    void this.loadProps();
  }

  update(dt: number, waveStrength: number): void {
    const u = this.water.material.uniforms;
    u.time.value += dt * (0.35 + waveStrength * 0.9);
    u.distortionScale.value = 1.6 + waveStrength * 4;
    this.swayTime.value += dt * (1 + waveStrength * 2);
  }

  private buildTerrain(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    const nor = geo.getAttribute('normal');
    const splat = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const d = shoreDistance(x, z);
      const slope = 1 - nor.getY(i);
      let grass = 1;
      let sand = 0;
      let mud = 0;
      let rock = 0;
      if (y < 0.25) {
        mud = 1;
        grass = 0;
        if (isSandArea(x, z) || (d > -6 && !isWeedArea(x, z))) {
          sand = isSandArea(x, z) ? 1 : 0.6;
          mud = 1 - sand;
        }
      } else if (d < 5) {
        const k = 1 - d / 5;
        sand = isSandArea(x, z) ? 1 : 0.55 * k;
        grass = 1 - sand;
      }
      if (isRockArea(x, z) && d > -12 && d < 30) {
        rock = Math.max(rock, 0.85);
      }
      if (slope > 0.18) rock = Math.max(rock, Math.min(1, (slope - 0.18) * 5));
      grass *= 1 - rock;
      sand *= 1 - rock;
      mud *= 1 - rock;
      // 森の地面（残り）：岸から離れるほど
      const forest = d > 14 ? Math.min(1, (d - 14) / 25) * (0.55 + 0.45 * fbm(x * 0.03, z * 0.03)) : 0;
      grass *= 1 - forest;
      splat.set([grass, sand, mud, rock], i * 4);
    }
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));

    const mat = terrainMaterial({
      grass: 'aerial_grass_rock_diff.jpg',
      sand: 'coast_sand_01_diff.jpg',
      mud: 'brown_mud_leaves_01_diff.jpg',
      rock: 'gray_rocks_diff.jpg',
      forest: 'forest_ground_04_diff.jpg',
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** 水の澄み具合 0..1 と、水面の照り返しの強さ（偏光グラスで下がる） */
  setClarity(see: number, glare: number): void {
    const u = this.water.material.uniforms;
    u.uSee.value = see;
    u.uGlare.value = glare;
  }

  private buildDock(): THREE.Group {
    const g = new THREE.Group();
    const planks = texture('weathered_planks_diff.jpg').clone();
    planks.repeat.set((DOCK.xLand - DOCK.xEnd) / 3, 1);
    const deckMat = new THREE.MeshStandardMaterial({ map: planks, roughness: 0.85 });
    const len = DOCK.xLand - DOCK.xEnd;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, DOCK.halfWidth * 2), deckMat);
    deck.position.set((DOCK.xLand + DOCK.xEnd) / 2, DOCK.deckY - 0.07, 0);
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.9 });
    for (let x = DOCK.xEnd + 0.3; x <= DOCK.xLand; x += 3) {
      for (const z of [-DOCK.halfWidth + 0.15, DOCK.halfWidth - 0.15]) {
        const bottom = terrainHeight(x, z) - 0.5;
        const h = DOCK.deckY + 0.5 - bottom;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, h, 8), postMat);
        post.position.set(x, bottom + h / 2, z);
        post.castShadow = true;
        g.add(post);
      }
    }
    // 先端の手すり
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, DOCK.halfWidth * 2), postMat);
    rail.position.set(DOCK.xEnd + 0.3, DOCK.deckY + 0.48, 0);
    g.add(rail);
    return g;
  }

  private async loadProps(): Promise<void> {
    const barrel = await model('barrel');
    if (barrel) {
      for (const [dx, dz] of [
        [-3.2, 2.6],
        [-3.0, 3.5],
      ]) {
        const b = barrel.clone();
        b.position.set(HUT.x + dx, terrainHeight(HUT.x + dx, HUT.z + dz), HUT.z + dz);
        b.traverse((o) => (o.castShadow = true));
        this.group.add(b);
      }
    }
    // 桟橋につないだカヌー
    const canoe = await model('canoe');
    if (canoe) {
      canoe.scale.setScalar(3.4);
      canoe.position.set(DOCK.xEnd + 8, -0.12, DOCK.halfWidth + 1.3);
      canoe.rotation.y = Math.PI / 2 + 0.06;
      this.group.add(canoe);
    }
    // 小屋のまわりの小物
    const decor: [string, number, number, number, number][] = [
      ['log', -1, 6.5, 3.2, 0.4],
      ['stump_old', 2, -5.5, 3, 0],
      ['mushroom_redGroup', 3.5, 5.2, 3, 0],
      ['flower_yellowA', -2.5, -4.8, 4, 0],
      ['flower_purpleA', -4.2, -3.6, 4, 0],
      ['plant_bushLarge', 4, 4, 5, 0],
    ];
    for (const [name, dx, dz, sc, rot] of decor) {
      const m = await model(name);
      if (!m) continue;
      const x = HUT.x + dx;
      const z = HUT.z + dz;
      m.scale.setScalar(sc);
      m.rotation.y = rot;
      m.position.set(x, terrainHeight(x, z), z);
      m.traverse((o) => (o.castShadow = true));
      this.group.add(m);
    }
    const fern = await model('fern');
    if (fern) {
      const rng = new Rng(77);
      for (let i = 0; i < 60; i++) {
        const a = rng.range(-0.6, 0.6);
        const r = shoreRadius(a) + rng.range(8, 40);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (Math.hypot(x - HUT.x, z - HUT.z) < 6 || Math.abs(z) < 4) continue;
        const f = fern.clone();
        f.position.set(x, terrainHeight(x, z), z);
        f.rotation.y = rng.range(0, Math.PI * 2);
        f.scale.setScalar(rng.range(0.8, 1.6));
        this.group.add(f);
      }
    }
  }

  /** 樹木（Kenney Nature Kit）を地形に合わせて並べる */
  private buildTrees(): THREE.Group {
    const g = new THREE.Group();
    const rng = new Rng(1234);
    const kinds = ['tree_pineTallA', 'tree_pineTallB', 'tree_pineDefaultA', 'tree_pineRoundA', 'tree_oak', 'tree_default', 'tree_detailed', 'tree_fat'];
    const byKind = new Map<string, THREE.Matrix4[]>();
    let tries = 0;
    let count = 0;
    while (count < 900 && tries++ < 9000) {
      const a = rng.range(-Math.PI, Math.PI);
      const r = shoreRadius(a) + 10 + Math.pow(rng.next(), 0.7) * 200;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 0.6) continue;
      if (Math.hypot(x - HUT.x, z - HUT.z) < 14) continue;
      if (x > DOCK.xLand - 5 && x < HUT.x + 30 && Math.abs(z) < 18) continue;
      if (fbm(x * 0.02, z * 0.02) < 0.38 && r < shoreRadius(a) + 60) continue;
      const near = shoreDistance(x, z) < 30;
      // 岸辺は広葉樹、奥は針葉樹が多い
      const kind = near && rng.chance(0.55) ? kinds[4 + rng.int(0, 3)] : rng.chance(0.78) ? kinds[rng.int(0, 3)] : kinds[4 + rng.int(0, 3)];
      const s = rng.range(5.5, 9);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, h - 0.15, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2)),
        new THREE.Vector3(s, s * rng.range(0.9, 1.25), s),
      );
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind)!.push(m);
      count++;
      if (shoreDistance(x, z) < 40) this.colliders.push({ x, z, r: 0.06 * s });
    }
    for (const [kind, mats] of byKind) g.add(instanced(kind, mats, { tint: (_, c) => c.setHSL(0, 0, rng.range(0.55, 0.85)) }));
    return g;
  }

  /** 岩（Kenney Nature Kit） */
  private buildRocks(): THREE.Group {
    const g = new THREE.Group();
    const rng = new Rng(99);
    const kinds = ['rock_largeA', 'rock_largeC', 'rock_tallA', 'stone_largeB'];
    const byKind = new Map<string, THREE.Matrix4[]>();
    const add = (x: number, z: number, s: number) => {
      const kind = kinds[rng.int(0, kinds.length - 1)];
      const y = terrainHeight(x, z);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y - s * 0.12, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.15, 0.15), rng.range(0, 6.3), rng.range(-0.15, 0.15))),
        new THREE.Vector3(s, s * rng.range(0.7, 1.2), s),
      );
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind)!.push(m);
      if (s > 1.2 && y > -0.5) this.colliders.push({ x, z, r: s * 0.4 });
    };
    for (let i = 0; i < 70; i++) {
      const a = ANGLES.rocks + rng.range(-0.38, 0.38);
      const r = shoreRadius(a) + rng.range(-14, 14);
      add(Math.cos(a) * r, Math.sin(a) * r, rng.range(1.2, 5));
    }
    for (let i = 0; i < 80; i++) {
      const a = rng.range(-Math.PI, Math.PI);
      const r = shoreRadius(a) + rng.range(2, 120);
      add(Math.cos(a) * r, Math.sin(a) * r, rng.range(0.8, 2.6));
    }
    for (const [kind, mats] of byKind) g.add(instanced(kind, mats));
    return g;
  }

  /** 岸辺の草むら・葦（Kenney Nature Kit の草を大きくして使う） */
  private buildReeds(): THREE.Group {
    const rng = new Rng(5);
    const tall: THREE.Matrix4[] = [];
    const tufts: THREE.Matrix4[] = [];
    for (let i = 0; i < 5000 && tall.length + tufts.length < 1400; i++) {
      const weed = rng.chance(0.7);
      const a = weed ? ANGLES.weeds + rng.range(-0.4, 0.4) : rng.range(-Math.PI, Math.PI);
      const r = shoreRadius(a) + rng.range(weed ? -9 : -3, 3);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = terrainHeight(x, z);
      if (y < -1.2 || y > 0.9) continue;
      if (Math.abs(z) < 5 && x > 0) continue;
      const s = rng.range(2, 3.4);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, Math.max(y, -1.2), z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.3)),
        new THREE.Vector3(s, s * (y < 0 ? rng.range(2, 3) : rng.range(1.1, 1.6)), s),
      );
      (y < 0.2 ? tall : tufts).push(m);
    }
    const g = new THREE.Group();
    g.add(instanced('grass_large', tall, { shadow: false, tint: (_, c) => c.setRGB(0.6, 0.62, 0.38) }));
    g.add(instanced('grass_leafsLarge', tufts, { shadow: false, tint: (_, c) => c.setRGB(0.6, 0.65, 0.45) }));
    return g;
  }

  /** スイレンの葉（Kenney Nature Kit） */
  private buildLilyPads(): THREE.Group {
    const rng = new Rng(8);
    const big: THREE.Matrix4[] = [];
    const small: THREE.Matrix4[] = [];
    for (let i = 0; i < 1500 && big.length + small.length < 380; i++) {
      const a = ANGLES.weeds + rng.range(-0.38, 0.38);
      const r = shoreRadius(a) - rng.range(4, 32);
      const x = Math.cos(a) * r + rng.range(-2, 2);
      const z = Math.sin(a) * r;
      if (fbm(x * 0.08, z * 0.08) < 0.45) continue;
      const s = rng.range(2.5, 4.5);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.3)), new THREE.Vector3(s, s, s));
      (rng.chance(0.6) ? big : small).push(m);
    }
    const g = new THREE.Group();
    g.add(instanced('lily_large', big, { shadow: false }));
    g.add(instanced('lily_small', small, { shadow: false }));
    g.renderOrder = 2;
    return g;
  }
}

/** 位置・法線・UVの簡易結合 */
export function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of parts) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of parts) {
    const p = g.getAttribute('position');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos[(o + i) * 3] = p.getX(i);
      pos[(o + i) * 3 + 1] = p.getY(i);
      pos[(o + i) * 3 + 2] = p.getZ(i);
      if (u) {
        uv[(o + i) * 2] = u.getX(i);
        uv[(o + i) * 2 + 1] = u.getY(i);
      }
    }
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeVertexNormals();
  return out;
}
