import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { instanced, model, texture } from '../core/assets';
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
} from './lakeShape';

const TERRAIN_SIZE = 760;
const TERRAIN_SEG = 300;

export interface Collider {
  x: number;
  z: number;
  r: number;
}

/** 湖の釣り場：地形・水面・桟橋・小屋・植生 */
export class LakeWorld {
  readonly group = new THREE.Group();
  readonly water: Water;
  readonly colliders: Collider[] = [];
  /** 夜に灯る明かり */
  readonly nightLights: THREE.PointLight[] = [];
  readonly windowMats: THREE.MeshStandardMaterial[] = [];
  private swayTime = { value: 0 };

  constructor() {
    this.group.add(this.buildTerrain());
    this.water = this.buildWater();
    this.group.add(this.water);
    this.group.add(this.buildDock());
    this.group.add(this.buildHut());
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

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const tex = {
      tGrass: { value: texture('aerial_grass_rock_diff.jpg') },
      tSand: { value: texture('coast_sand_01_diff.jpg') },
      tMud: { value: texture('brown_mud_leaves_01_diff.jpg') },
      tRock: { value: texture('gray_rocks_diff.jpg') },
      tForest: { value: texture('forest_ground_04_diff.jpg') },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, tex);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D tGrass; uniform sampler2D tSand; uniform sampler2D tMud; uniform sampler2D tRock; uniform sampler2D tForest;
          varying vec4 vSplat; varying vec3 vWPos;
          vec3 tri(sampler2D t, vec2 p) { return mix(texture2D(t, p * 0.11).rgb, texture2D(t, p * 0.027).rgb, 0.45); }`,
        )
        .replace(
          '#include <map_fragment>',
          `vec2 p = vWPos.xz;
          float wf = clamp(1.0 - (vSplat.x + vSplat.y + vSplat.z + vSplat.w), 0.0, 1.0);
          vec3 col = tri(tGrass, p) * vSplat.x + tri(tSand, p) * vSplat.y + tri(tMud, p) * vSplat.z + tri(tRock, p * 0.7) * vSplat.w + tri(tForest, p) * wf;
          float under = clamp(-vWPos.y / 2.5, 0.0, 1.0);
          col = mix(col, col * vec3(0.32, 0.45, 0.42), under);
          diffuseColor.rgb *= col * 1.15;`,
        );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildWater(): Water {
    const geo = new THREE.PlaneGeometry(1600, 1600);
    const normals = texture('waternormals.jpg', { srgb: false });
    const water = new Water(geo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: new THREE.Vector3(0.5, 0.6, 0.2).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x0e2b2a,
      distortionScale: 2.2,
      fog: true,
      alpha: 0.93,
    });
    water.material.transparent = true;
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    water.renderOrder = 1;
    return water;
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

  private buildHut(): THREE.Group {
    const g = new THREE.Group();
    const wallTex = texture('weathered_planks_diff.jpg').clone();
    wallTex.repeat.set(2, 1);
    wallTex.rotation = Math.PI / 2;
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xb59a7a, roughness: 0.9 });
    const y0 = terrainHeight(HUT.x, HUT.z);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(HUT.d, 3, HUT.w), wallMat);
    walls.position.set(0, 1.5, 0);
    walls.castShadow = walls.receiveShadow = true;
    g.add(walls);
    // 屋根
    const roofShape = new THREE.Shape([new THREE.Vector2(-HUT.d / 2 - 0.5, 0), new THREE.Vector2(HUT.d / 2 + 0.5, 0), new THREE.Vector2(0, 1.6)]);
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: HUT.w + 0.8, bevelEnabled: false });
    roofGeo.translate(0, 0, -(HUT.w + 0.8) / 2);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x5b2f25, roughness: 0.8 }));
    roof.position.y = 3;
    roof.castShadow = true;
    g.add(roof);
    // 正面（湖側 = -X）にドアと窓
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 }));
    door.position.set(-HUT.d / 2 - 0.03, 1.05, 0.9);
    g.add(door);
    for (const z of [-1.6]) {
      const winMat = new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0xffb050, emissiveIntensity: 0 });
      this.windowMats.push(winMat);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.2), winMat);
      win.position.set(-HUT.d / 2 - 0.03, 1.7, z);
      g.add(win);
    }
    // 看板
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 128;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#4a3220';
    c.fillRect(0, 0, 512, 128);
    c.strokeStyle = '#2a1a10';
    c.lineWidth = 10;
    c.strokeRect(5, 5, 502, 118);
    c.fillStyle = '#f2e2c0';
    c.font = 'bold 64px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('釣り小屋', 256, 68);
    const signTex = new THREE.CanvasTexture(cv);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }));
    sign.position.set(-HUT.d / 2 - 0.08, 2.65, 0);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    const lamp = new THREE.PointLight(0xffb060, 0, 14, 1.6);
    lamp.position.set(-HUT.d / 2 - 0.6, 2.3, -0.4);
    g.add(lamp);
    this.nightLights.push(lamp);
    g.position.set(HUT.x, y0 - 0.1, HUT.z);
    this.colliders.push({ x: HUT.x, z: HUT.z, r: 3.6 });
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
