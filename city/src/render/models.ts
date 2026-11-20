import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BuildingVisual } from '../config/buildings';
import { CITY } from '../config/city';
import { loadPack } from './pack';

/**
 * 同じ建物をまとめて InstancedMesh で描くためのプール。
 * glb 内のメッシュ（材質ごと）を1つずつ InstancedMesh にし、全パーツで同じ行列を使う。
 */
export class InstancePool {
  readonly parts: THREE.InstancedMesh[] = [];
  private capacity: number;
  private count = 0;
  private free: number[] = [];
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(
    private readonly root: THREE.Object3D,
    private readonly parent: THREE.Object3D,
    capacity = 8,
  ) {
    this.capacity = capacity;
    root.updateMatrixWorld(true);
    this.build();
  }

  private build() {
    const old = this.parts.splice(0);
    let k = 0;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      const im = new THREE.InstancedMesh(geo, m.material, this.capacity);
      im.count = this.count;
      im.frustumCulled = false; // 街全体が画面に収まる程度なので、境界の再計算を省く
      const prev = old[k++];
      if (prev) {
        const mat = new THREE.Matrix4();
        for (let i = 0; i < this.count; i++) {
          prev.getMatrixAt(i, mat);
          im.setMatrixAt(i, mat);
        }
      }
      this.parts.push(im);
      this.parent.add(im);
    });
    for (const p of old) {
      this.parent.remove(p);
      p.dispose();
    }
  }

  add(matrix: THREE.Matrix4): number {
    let i = this.free.pop();
    if (i === undefined) {
      if (this.count >= this.capacity) {
        this.capacity *= 2;
        this.build();
      }
      i = this.count++;
      for (const p of this.parts) p.count = this.count;
    }
    this.set(i, matrix);
    return i;
  }

  set(i: number, matrix: THREE.Matrix4) {
    for (const p of this.parts) {
      p.setMatrixAt(i, matrix);
      p.instanceMatrix.needsUpdate = true;
      // 当たり判定用の外接球を更新し直す
      p.boundingSphere = null;
    }
  }

  remove(i: number) {
    this.set(i, this.hidden);
    this.free.push(i);
  }
}

export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private pack: Promise<Map<string, ArrayBuffer> | null>;
  private readonly cache = new Map<string, Promise<THREE.Object3D | null>>();
  private readonly pools = new Map<string, InstancePool>();
  readonly missing = new Set<string>();
  packError: string | null = null;

  constructor(private readonly parent: THREE.Object3D) {
    this.pack = loadPack(`${import.meta.env.BASE_URL}assets/models.pack`).catch((e: unknown) => {
      this.packError = String(e);
      return null;
    });
  }

  private load(name: string): Promise<THREE.Object3D | null> {
    let p = this.cache.get(name);
    if (!p) {
      p = this.pack.then(async (pack) => {
        const data = pack?.get(name);
        if (!data) {
          this.missing.add(name);
          return null;
        }
        const g = await this.loader.parseAsync(data, '');
        return g.scene;
      });
      this.cache.set(name, p);
    }
    return p;
  }

  async pool(name: string): Promise<InstancePool | null> {
    const existing = this.pools.get(name);
    if (existing) return existing;
    const obj = await this.load(name);
    if (!obj) return null;
    const again = this.pools.get(name);
    if (again) return again;
    const pool = new InstancePool(obj, this.parent);
    this.pools.set(name, pool);
    return pool;
  }

  /** 素材の原点（マスの中心・地面の高さ）を (x, z) に置く行列 */
  static placeMatrix(v: BuildingVisual, x: number, z: number, rotY = 0, y = 0): THREE.Matrix4 {
    const s = CITY.lotSize * (v.scale ?? 1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY + THREE.MathUtils.degToRad(v.rotateDeg ?? 0));
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
  }
}
