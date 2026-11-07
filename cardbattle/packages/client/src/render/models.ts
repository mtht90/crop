import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets } from '../assets/assets';
import { UNIT_VISUALS, type UnitVisual } from '../assets/visuals';

export type Team = 'ally' | 'enemy';
export const TEAM_COLORS: Record<Team, THREE.Color> = { ally: new THREE.Color('#3f7ee8'), enemy: new THREE.Color('#e04848') };

/** 素材モデルから作った表示用オブジェクト */
export interface ModelInstance {
  root: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  mixer?: THREE.AnimationMixer;
  actions?: Record<'idle' | 'move' | 'attack' | 'death', THREE.AnimationAction | undefined>;
  height: number;
}

/** マテリアルを複製して、陣営色や下地の色を混ぜる（マテリアルの色替え） */
function recolor(obj: THREE.Object3D, team: Team | null, amount: number, baseTint?: string): THREE.MeshStandardMaterial[] {
  const cache = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const list: THREE.MeshStandardMaterial[] = [];
  const base = baseTint ? new THREE.Color(baseTint) : null;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      let c = cache.get(m);
      if (!c) {
        c = (m as THREE.MeshStandardMaterial).clone();
        if (base) c.color.multiply(base);
        if (team && amount > 0) c.color.lerp(TEAM_COLORS[team], amount);
        cache.set(m, c);
        list.push(c);
      }
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  return list;
}

/** バウンディングボックスの底面中央が原点に来るようにし、指定した高さに拡大縮小する */
function normalize(obj: THREE.Object3D, height: number): THREE.Group {
  const holder = new THREE.Group();
  holder.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = height / Math.max(0.001, size.y);
  obj.scale.multiplyScalar(s);
  obj.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  return holder;
}

/** 部品を指定の大きさ（幅・高さ・奥行き）に合わせて置く。thin な軸を奥行きにそろえる */
function part(name: string, w: number, h: number, d: number): THREE.Group | null {
  const gltf = assets.model(name);
  if (!gltf) return null;
  const obj = gltf.scene.clone(true);
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(obj);
  holder.add(inner);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.x < size.z && w > d) inner.rotation.y = Math.PI / 2; // 薄い向きを Z にそろえる
  const sx = inner.rotation.y ? size.z : size.x;
  const sz = inner.rotation.y ? size.x : size.z;
  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(-center.x, -box.min.y, -center.z);
  inner.scale.set(w / Math.max(0.001, sx), h / Math.max(0.001, size.y), d / Math.max(0.001, sz));
  return holder;
}

/** 部品の一番長い向きを Z（前）にそろえ、その長さを length にして中心を原点に置く */
function alongZ(name: string, length: number): THREE.Group | null {
  const gltf = assets.model(name);
  if (!gltf) return null;
  const obj = gltf.scene.clone(true);
  const inner = new THREE.Group();
  inner.add(obj);
  obj.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) inner.rotation.y = Math.PI / 2;
  else if (size.y >= size.x && size.y >= size.z) inner.rotation.x = Math.PI / 2;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const s = length / Math.max(0.001, box.getSize(new THREE.Vector3()).z);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x * s, -c.y * s, -c.z * s);
  inner.scale.setScalar(s);
  const holder = new THREE.Group();
  holder.add(inner);
  return holder;
}

/**
 * 動かない部品の集まりを、マテリアルごとに1つのメッシュへまとめる（ドローコール削減）。
 * 位置・回転・拡大はジオメトリに焼き込む。
 */
export function bakeStatic(group: THREE.Object3D, castShadow = true): THREE.Group {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[] }>();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const g = mesh.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    // 結合できるように属性をそろえる（法線・UV・位置だけ残す）
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    const key = `${mesh.material.uuid}|${Object.keys(g.attributes).sort().join(',')}|${g.index ? 'i' : 'n'}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: mesh.material, geos: [] }));
    b.geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    out.add(m);
  }
  out.position.copy(group.position);
  out.quaternion.copy(group.quaternion);
  out.scale.copy(group.scale);
  return out;
}

// ------------------------------------------------------------------ ユニット

export function createUnitModel(cardId: string, team: Team | null): ModelInstance | null {
  const visual: UnitVisual | undefined = UNIT_VISUALS[cardId];
  const gltf = visual && assets.model(visual.model);
  if (!visual || !gltf) return null;
  const obj = cloneSkinned(gltf.scene);
  const root = normalize(obj, visual.height);
  const materials = recolor(root, team, visual.teamTint, visual.baseTint);
  const mixer = new THREE.AnimationMixer(obj);
  const clip = (n: string) => gltf.animations.find((a) => a.name === n);
  const action = (n: string) => {
    const c = clip(n);
    return c ? mixer.clipAction(c) : undefined;
  };
  const actions = {
    idle: action(visual.anims.idle),
    move: action(visual.anims.move),
    attack: action(visual.anims.attack),
    death: action(visual.anims.death),
  };
  if (actions.attack) {
    actions.attack.setLoop(THREE.LoopOnce, 1);
    actions.attack.clampWhenFinished = true;
  }
  if (actions.death) {
    actions.death.setLoop(THREE.LoopOnce, 1);
    actions.death.clampWhenFinished = true;
  }
  actions.idle?.play();
  return { root, materials, mixer, actions, height: visual.height };
}

// ------------------------------------------------------------------ タワー・建物

/** Medieval Village MegaKit の壁・柱・塔の屋根を組み合わせたタワー */
export function createTower(kind: 'king' | 'princess', team: Team, halfSize: number): ModelInstance | null {
  if (!assets.model('wall')) return null;
  const root = new THREE.Group();
  const w = halfSize * 2 * 0.86;
  const wallH = kind === 'king' ? 2.6 : 3.3;
  for (let i = 0; i < 4; i++) {
    const wall = part('wall', w, wallH, 0.35);
    if (!wall) continue;
    const a = (i * Math.PI) / 2;
    wall.rotation.y = a;
    wall.position.set(Math.sin(a) * (w / 2), 0, Math.cos(a) * (w / 2));
    root.add(wall);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const p = part('pillar', 0.5, wallH + 0.15, 0.5);
    if (!p) continue;
    p.position.set((sx * w) / 2, 0, (sz * w) / 2);
    root.add(p);
  }
  const floor = part('border', w + 0.4, 0.25, w + 0.4);
  if (floor) {
    floor.position.y = wallH - 0.05;
    root.add(floor);
  }
  const roof = part(`tower_roof_${team === 'ally' ? 'blue' : 'red'}`, w * 0.92, kind === 'king' ? 2.4 : 2.2, w * 0.92);
  if (roof) {
    roof.position.y = wallH + 0.15;
    root.add(roof);
  }
  const materials = recolor(root, null, 0);
  return { root: bakeStatic(root), materials, height: wallH + (kind === 'king' ? 2.6 : 2.4) };
}

/** 守りの砲台：MegaKit に大砲がないので、木箱の土台＋横倒しにしたレンガの煙突を砲身にして代用（ASSETS_TODO.md 参照） */
export function createCannon(team: Team | null, radius: number): ModelInstance | null {
  if (!assets.model('crate')) return null;
  const root = new THREE.Group();
  const base = part('crate', radius * 1.9, 0.8, radius * 1.9);
  const barrel = alongZ('chimney', 1.3);
  if (base) root.add(base);
  if (barrel) {
    barrel.position.set(0, 1.0, 0.1);
    barrel.rotation.x = -0.3; // 少し上に傾ける
    root.add(barrel);
  }
  if (team) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.75, 0.08, 8, 32),
      new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team], roughness: 0.4 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.82;
    root.add(ring);
  }
  const materials = recolor(root, null, 0);
  return { root, materials, height: 1.5 };
}

/** アリーナの飾り：柵・石の縁・橋の床板 */
export function arenaPart(name: string, w: number, h: number, d: number): THREE.Group | null {
  return part(name, w, h, d);
}
