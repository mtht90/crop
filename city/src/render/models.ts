import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BuildingVisual } from '../config/buildings';

/**
 * 同じ建物をまとめて InstancedMesh で描くためのプール。
 * glb 内のメッシュ（材質ごと）を1つずつ InstancedMesh にし、全パーツで同じ行列を使う。
 */
export class InstancePool {
  readonly parts: THREE.InstancedMesh[] = [];
  /** 区画に収めるための基本の大きさ（モデルの XZ 外接の最大辺） */
  readonly footprint: number;
  readonly baseOffset: THREE.Vector3;
  private capacity: number;
  private count = 0;
  private free: number[] = [];
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(
    private readonly root: THREE.Object3D,
    private readonly parent: THREE.Object3D,
    capacity = 16,
  ) {
    this.capacity = capacity;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    this.footprint = Math.max(size.x, size.z) || 1;
    // 底面中央が原点に来るようにずらす
    const c = box.getCenter(new THREE.Vector3());
    this.baseOffset = new THREE.Vector3(-c.x, -box.min.y, -c.z);
    this.build();
  }

  private build() {
    for (const p of this.parts) {
      this.parent.remove(p);
      p.dispose();
    }
    const old = this.parts.splice(0);
    const offset = new THREE.Matrix4().makeTranslation(this.baseOffset);
    let k = 0;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(offset, m.matrixWorld));
      const im = new THREE.InstancedMesh(geo, m.material, this.capacity);
      im.count = this.count;
      im.frustumCulled = false; // 街全体が画面に収まる程度なので、境界の再計算を省く
      im.castShadow = false;
      im.receiveShadow = false;
      const prev = old[k++];
      if (prev) for (let i = 0; i < this.count; i++) {
        const mat = new THREE.Matrix4();
        prev.getMatrixAt(i, mat);
        im.setMatrixAt(i, mat);
      }
      this.parts.push(im);
      this.parent.add(im);
    });
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
    }
  }

  remove(i: number) {
    this.set(i, this.hidden);
    this.free.push(i);
  }
}

export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<THREE.Object3D | null>>();
  private readonly pools = new Map<string, InstancePool>();
  readonly missing = new Set<string>();

  constructor(private readonly parent: THREE.Object3D) {}

  private load(name: string): Promise<THREE.Object3D | null> {
    let p = this.cache.get(name);
    if (!p) {
      const url = `${import.meta.env.BASE_URL}assets/models/${name}.glb`;
      p = this.loader.loadAsync(url).then(
        (g) => g.scene,
        () => {
          this.missing.add(name);
          return null;
        },
      );
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

  /** 区画（一辺 fit）に収まる行列を作る */
  static placeMatrix(pool: InstancePool, v: BuildingVisual, x: number, z: number, fit: number, rotY = 0): THREE.Matrix4 {
    const s = (fit / pool.footprint) * (v.scale ?? 1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY + THREE.MathUtils.degToRad(v.rotateDeg ?? 0));
    return new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
  }
}
