import * as THREE from 'three/webgpu';
import { abs, color, float, floor, mix, positionWorld, smoothstep, step, texture, time, vec2 } from 'three/tsl';
import { UNIT, type Rules } from '@cardbattle/sim';
import { assets } from '../assets/assets';
import { arena } from './coords';
import { arenaPart, bakeStatic } from './models';

/**
 * アリーナの地面・川・石畳・周りの村。
 * テクスチャは Medieval Village MegaKit のノイズと石畳（T_Noise_Terrain / T_BrushedNoise / T_UnevenBrick）だけを使い、
 * 色合いはシェーダー（TSL）で作る。素材が無いときは null を返し、呼び出し側が単色の地面にする。
 */
export function createEnvironment(rules: Rules, flipped = false): THREE.Group | null {
  const noise = assets.texture('env_noise');
  const brushed = assets.texture('env_brushed');
  const cobble = assets.texture('env_cobble');
  const cobbleNormal = assets.texture('env_cobble_normal');
  if (!noise || !brushed || !cobble || !cobbleNormal) return null;

  const root = new THREE.Group();
  const hw = arena.width / 2;
  const hh = arena.height / 2;
  const riverZ0 = hh - rules.riverEnd / UNIT;
  const riverZ1 = hh - rules.riverStart / UNIT;

  // ---------------------------------------------------------------- 芝生
  const wp = positionWorld.xz;
  const n1 = texture(noise, wp.mul(0.04)).r;
  const n2 = texture(noise, wp.mul(0.17)).r;
  const fine = texture(brushed, wp.mul(0.11)).r;
  const inside = step(abs(positionWorld.x), float(hw)).mul(step(abs(positionWorld.z), float(hh)));
  let grass = mix(color('#3f7a2c'), color('#7dbb4c'), n1.mul(1.3).sub(0.15).clamp());
  grass = mix(grass, color('#b4b65a'), smoothstep(0.6, 0.85, n2).mul(0.4)); // 乾いた草のむら
  grass = grass.mul(fine.mul(0.16).add(0.9));
  // アリーナの中だけ、うっすらとタイルの市松模様（配置の目安）
  const checker = floor(positionWorld.x).add(floor(positionWorld.z)).mod(2);
  grass = grass.mul(checker.mul(0.05).add(0.975).mul(inside).add(inside.oneMinus().mul(0.82)));
  const groundMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  groundMat.colorNode = grass;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // ---------------------------------------------------------------- 川（流れる水面ときらめき）
  const t = time;
  const w1 = texture(noise, wp.mul(0.12).add(vec2(t.mul(0.015), t.mul(-0.05)))).r;
  const w2 = texture(noise, wp.mul(0.31).add(vec2(t.mul(-0.03), t.mul(-0.09)))).r;
  const waves = w1.add(w2).mul(0.5);
  const waterMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.05 });
  waterMat.colorNode = mix(color('#17507e'), color('#46a9d6'), waves.mul(1.6).sub(0.3).clamp());
  waterMat.emissiveNode = color('#d8f4ff').mul(smoothstep(0.66, 0.78, waves).mul(0.55));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, riverZ1 - riverZ0), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.015, (riverZ0 + riverZ1) / 2);
  root.add(water);
  // 岸（石畳の帯）
  const bankMat = cobbleMaterial(cobble, cobbleNormal, '#c9bda5', 0.7);
  for (const z of [riverZ0 - 0.25, riverZ1 + 0.25]) {
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(120, 0.5), bankMat);
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(0, 0.02, z);
    bank.receiveShadow = true;
    root.add(bank);
  }

  // ---------------------------------------------------------------- 石畳（タワーの足元と、タワーから橋への道）
  const pathMat = cobbleMaterial(cobble, cobbleNormal, '#d8c8a8', 0.55);
  const paving = new THREE.Group();
  const addPatch = (cx: number, cz: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.01, cz);
    paving.add(m);
  };
  for (const p of [0, 1]) {
    const flip = p === 0 ? 1 : -1;
    for (const bx of rules.bridgeX) {
      const x = bx / UNIT - hw;
      const pz = (hh - rules.princess.localPos.y / UNIT) * flip;
      addPatch(x, pz, rules.princess.halfSize / UNIT * 2 + 1.4, rules.princess.halfSize / UNIT * 2 + 1.4);
      // タワーから橋までの道
      const z0 = pz;
      const z1 = (p === 0 ? riverZ1 : riverZ0) as number;
      addPatch(x, (z0 + z1) / 2, 1.8, Math.abs(z1 - z0));
    }
    const kz = (hh - rules.king.localPos.y / UNIT) * flip;
    addPatch(0, kz, rules.king.halfSize / UNIT * 2 + 1.6, rules.king.halfSize / UNIT * 2 + 1.6);
  }
  paving.traverse((o) => ((o as THREE.Mesh).receiveShadow = true));
  root.add(paving);

  // ---------------------------------------------------------------- 周りの村（背景）
  const village = new THREE.Group();
  const rng = mulberry(7);
  const houseSpots: [number, number, number][] = [];
  // 家は奥（相手側）と左右だけに置く。手前に置くとカメラと手札を隠してしまう
  const far = flipped ? 1 : -1;
  for (let i = 0; i < 6; i++) houseSpots.push([-15 + i * 6 + (rng() - 0.5) * 1.5, far * (hh + 4.5 + rng() * 2), (far > 0 ? Math.PI : 0) + rng() * 0.3 - 0.15]);
  for (const side of [-1, 1]) for (let z = -hh + 1; z < hh - 4; z += 6) houseSpots.push([side * (hw + 4.8 + rng()), far * -z + rng() * 1.5, side * -Math.PI / 2]);
  for (const [x, z, rot] of houseSpots) {
    const h = house(rng);
    if (!h) break;
    h.position.set(x, 0, z);
    h.rotation.y = rot;
    village.add(h);
  }
  // 小物：荷車・木箱
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const prop = rng() < 0.4 ? arenaPart('wagon', 1.6, 1.0, 2.6) : arenaPart('crate', 0.8, 0.8, 0.8);
    if (!prop) continue;
    prop.position.set(side * (hw + 1.8 + rng() * 1.2), 0, -hh + rng() * arena.height);
    prop.rotation.y = rng() * Math.PI;
    village.add(prop);
  }
  // 外周の鉄柵
  for (let z = -hh; z < hh; z += 2) {
    for (const side of [-1, 1]) {
      const f = arenaPart('metal_fence', 2, 1.4, 0.15);
      if (!f) continue;
      f.rotation.y = Math.PI / 2;
      f.position.set(side * (hw + 1.1), 0, z + 1);
      village.add(f);
    }
  }
  root.add(bakeStatic(village, false));
  return root;
}

function cobbleMaterial(map: THREE.Texture, normal: THREE.Texture, tint: string, scale: number): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const uv = positionWorld.xz.mul(scale);
  m.colorNode = texture(map, uv).rgb.mul(color(tint));
  m.normalMap = normal;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  return m;
}

/** 村の家：漆喰の壁（窓・扉つき）と木の柱、瓦屋根を組み合わせる */
function house(rng: () => number): THREE.Group | null {
  if (!arenaPart('house_wall', 1, 1, 1)) return null;
  const g = new THREE.Group();
  const w = 4;
  const h = 3;
  const kinds = ['house_window', 'house_wall', 'house_door', 'house_window'];
  for (let i = 0; i < 4; i++) {
    const kind = i === 0 ? 'house_door' : kinds[Math.floor(rng() * kinds.length)];
    const wall = arenaPart(kind, w, h, 0.3);
    if (!wall) continue;
    const a = (i * Math.PI) / 2;
    wall.rotation.y = a;
    wall.position.set(Math.sin(a) * (w / 2), 0, Math.cos(a) * (w / 2));
    g.add(wall);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = arenaPart('house_corner', 0.35, h, 0.35);
    if (!c) continue;
    c.position.set((sx * w) / 2, 0, (sz * w) / 2);
    g.add(c);
  }
  const roof = arenaPart('house_roof', w + 0.8, 2.2 + rng() * 0.6, w + 0.8);
  if (roof) {
    roof.position.y = h;
    g.add(roof);
  }
  const s = 0.9 + rng() * 0.35;
  g.scale.setScalar(s);
  return g;
}

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

