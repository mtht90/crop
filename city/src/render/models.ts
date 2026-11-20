import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingVisual } from '../config/buildings';
import { CITY } from '../config/city';
import { loadPack } from './pack';

/**
 * 同じ建物をまとめて InstancedMesh で描くためのプール。
 * glb 内のメッシュ（材質ごと）を1つずつ InstancedMesh にし、全パーツで同じ行列を使う。
 */
/** 会社の色で塗り分ける材質（屋根・ひさし・看板の部分） */
const TINT_MATERIALS = /^(Palette_Accent|Palette_Roof|Palette_Wall_2|Bus_Stripe)$/;
/** 夜に光らせる材質 */
export const GLOW_MATERIALS = /^(window|NightLight_.*)$/;

interface PartSpec {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** 会社の色で塗れるパーツなら、塗らないときの色 */
  tintBase: THREE.Color | null;
}

/** メッシュをまとめる：位置・法線だけにして、色は頂点色にする */
function mergeMeshes(meshes: THREE.Mesh[], vertexColor: (m: THREE.Mesh) => THREE.Color): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const m of meshes) {
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    if (g.getAttribute('normal')) out.setAttribute('normal', g.getAttribute('normal'));
    else out.computeVertexNormals();
    const c = vertexColor(m);
    const n = out.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(out);
  }
  if (!geos.length) return null;
  return mergeGeometries(geos, false);
}

/**
 * 同じ建物をまとめて InstancedMesh で描くためのプール。
 * 描画回数を減らすため、glb の中の色だけ違うメッシュは頂点色で1つにまとめる。
 * 会社の色で塗るパーツと、夜に光るパーツ（窓など）だけ別にする。
 */
export class InstancePool {
  readonly parts: THREE.InstancedMesh[] = [];
  private readonly specs: PartSpec[] = [];
  private tints: (THREE.Color | null)[] = [];
  readonly height: number;
  readonly materials = new Set<THREE.Material>();
  private capacity: number;
  private count = 0;
  private free: number[] = [];
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(
    root: THREE.Object3D,
    private readonly parent: THREE.Object3D,
    capacity = 8,
  ) {
    this.capacity = capacity;
    root.updateMatrixWorld(true);
    this.height = new THREE.Box3().setFromObject(root).max.y;
    const plain: THREE.Mesh[] = [];
    const tint: THREE.Mesh[] = [];
    const glow = new Map<string, THREE.Mesh[]>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = (m.material as THREE.Material).name;
      if (TINT_MATERIALS.test(name)) tint.push(m);
      else if (GLOW_MATERIALS.test(name)) glow.set(name, [...(glow.get(name) ?? []), m]);
      else plain.push(m);
    });
    const colorOf = (m: THREE.Mesh) => ((m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color('#ffffff')).clone();
    const base = mergeMeshes(plain, colorOf);
    if (base) this.specs.push({ geometry: base, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }), tintBase: null });
    const tg = mergeMeshes(tint, () => new THREE.Color('#ffffff'));
    if (tg) this.specs.push({ geometry: tg, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0 }), tintBase: colorOf(tint[0]) });
    for (const [name, list] of glow) {
      const g = mergeMeshes(list, () => new THREE.Color('#ffffff'));
      const src = list[0].material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.name = name;
      mat.vertexColors = false;
      if (g) this.specs.push({ geometry: g, material: mat, tintBase: null });
    }
    for (const sp of this.specs) this.materials.add(sp.material);
    this.build();
  }

  private build() {
    const old = this.parts.splice(0);
    this.specs.forEach((sp, k) => {
      const im = new THREE.InstancedMesh(sp.geometry, sp.material, this.capacity);
      im.count = this.count;
      im.frustumCulled = false; // 街全体が画面に収まる程度なので、境界の再計算を省く
      const prev = old[k];
      if (prev) {
        const mat = new THREE.Matrix4();
        for (let i = 0; i < this.count; i++) {
          prev.getMatrixAt(i, mat);
          im.setMatrixAt(i, mat);
        }
      }
      if (sp.tintBase) {
        for (let i = 0; i < this.capacity; i++) im.setColorAt(i, this.tints[i] ?? sp.tintBase);
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
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
    this.setTint(i, null);
    this.free.push(i);
  }

  /** 会社の色で塗る（null なら素材の元の色） */
  setTint(i: number, color: THREE.Color | null) {
    this.tints[i] = color;
    this.specs.forEach((sp, k) => {
      if (!sp.tintBase) return;
      const im = this.parts[k];
      im.setColorAt(i, color ?? sp.tintBase);
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
  }
}

export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private pack: Promise<Map<string, ArrayBuffer> | null>;
  private readonly cache = new Map<string, Promise<THREE.Object3D | null>>();
  readonly pools = new Map<string, InstancePool>();
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
