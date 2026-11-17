import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = './assets/';
// production (artifact) build ships models as self-contained glTF JSON
const MODEL_EXT = import.meta.env.PROD ? '.json' : '.glb';

export interface PBRSet { map: THREE.Texture; normalMap: THREE.Texture; armMap: THREE.Texture; }

export interface Library {
  /** model templates by node name, per kit */
  models: Map<string, THREE.Object3D>;
  runner: GLTF;
  runnerExtra: GLTF;
  pbr: Record<string, PBRSet>;
  hdr: Record<string, THREE.Texture>;
  sky: Record<string, THREE.Texture>;
  audio: Record<string, ArrayBuffer>;
}

export const PBR_SETS = ['concrete_floor_worn_001', 'anti_slip_concrete', 'metal_plate', 'rusty_metal_02', 'rocky_terrain_02'];
export const SKIES = ['kloofendal_48d_partly_cloudy_puresky', 'rogland_clear_night', 'industrial_sunset_puresky', 'qwantani_puresky'];
const AUDIO = ['01-footstep.ogg', '02-footstep.ogg', '03-footstep.ogg', '04-footstep.ogg', '05-footstep.ogg', 'wind.mp3', 'music_dnb.mp3',
  'sfx_slam_02.ogg', 'sfx_slam_05.ogg', 'sfx_hit_03.ogg', 'sfx_spring_03.ogg', 'sfx_metal_04.ogg', 'sfx_noise_01.ogg', 'sfx_glass_02.ogg',
  'sfx_bell_02.ogg', 'sfx_other_03.ogg', 'sfx_weird_02.ogg', 'sfx_explosion.ogg'];

export async function loadLibrary(onProgress: (p: number) => void): Promise<Library> {
  const manager = new THREE.LoadingManager();
  let total = 0, done = 0;
  const tick = () => { done++; onProgress(done / total); };
  const gl = new GLTFLoader(manager);
  const tl = new THREE.TextureLoader(manager);

  const lib: Library = { models: new Map(), runner: null as any, runnerExtra: null as any, pbr: {}, hdr: {}, sky: {}, audio: {} };
  const jobs: Promise<void>[] = [];
  const job = <T>(p: Promise<T>, then: (v: T) => void) => { total++; jobs.push(p.then((v) => { then(v); tick(); })); };

  job(gl.loadAsync(BASE + 'models/runner' + MODEL_EXT), (g) => (lib.runner = g));
  job(gl.loadAsync(BASE + 'models/runner_extra' + MODEL_EXT), (g) => (lib.runnerExtra = g));
  for (const kit of ['city', 'factory', 'nature', 'scifi']) {
    job(gl.loadAsync(BASE + `models/${kit}${MODEL_EXT}`), (g) => {
      for (const child of [...g.scene.children]) {
        child.position.set(0, 0, 0);
        child.updateMatrixWorld(true);
        child.traverse((o: any) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if (m.map) m.map.anisotropy = 4;
              // Kenney kits omit metallicFactor (glTF default = 1) → make them dielectric
              if (kit !== 'scifi' && !m.metalnessMap) { m.metalness = 0; m.roughness = Math.max(m.roughness, 0.75); }
            }
          }
        });
        lib.models.set(child.name, child);
      }
    });
  }
  for (const s of PBR_SETS) {
    const set: any = {};
    for (const [k, suffix] of [['map', 'Diffuse'], ['normalMap', 'nor_gl'], ['armMap', 'arm']] as const) {
      job(tl.loadAsync(BASE + `textures/${s}_${suffix}.jpg`), (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        if (k === 'map') t.colorSpace = THREE.SRGBColorSpace;
        set[k] = t;
      });
    }
    lib.pbr[s] = set;
  }
  for (const s of SKIES) {
    job(tl.loadAsync(BASE + `textures/${s}_sky.jpg`), (t) => { t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping; lib.sky[s] = t; lib.hdr[s] = t as any; });
  }
  for (const a of AUDIO) {
    job(fetch(BASE + 'audio/' + a).then((r) => r.arrayBuffer()), (b) => (lib.audio[a] = b));
  }
  await Promise.all(jobs);
  return lib;
}

// --------------------------------------------------------------------------------------
// Model helpers
// --------------------------------------------------------------------------------------
const _box = new THREE.Box3();
const bboxCache = new WeakMap<THREE.Object3D, THREE.Box3>();
export function templateBox(t: THREE.Object3D): THREE.Box3 {
  let b = bboxCache.get(t);
  if (!b) { t.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(t); bboxCache.set(t, b); }
  return b;
}

export class Models {
  constructor(public lib: Library) {}
  has(name: string) { return this.lib.models.has(name); }
  /** Plain clone (shared geometry/material). */
  clone(name: string): THREE.Object3D {
    const t = this.lib.models.get(name);
    if (!t) { console.warn('missing model', name); return new THREE.Object3D(); }
    return t.clone(true);
  }
  size(name: string): THREE.Vector3 { return templateBox(this.lib.models.get(name)!).getSize(new THREE.Vector3()); }
  /**
   * Clone and fit into an axis-aligned box. The model's bounding box is mapped onto
   * [min,max]. If `uniform` is set the model keeps proportions (scaled by xz) and sits on min.y.
   */
  fit(name: string, min: THREE.Vector3, max: THREE.Vector3, opts: { uniform?: boolean; rotY?: number } = {}): THREE.Object3D {
    const t = this.lib.models.get(name);
    if (!t) return new THREE.Object3D();
    const inner = t.clone(true);
    const wrap = new THREE.Object3D();
    const pivot = new THREE.Object3D();
    pivot.add(inner);
    if (opts.rotY) pivot.rotation.y = opts.rotY;
    pivot.updateMatrixWorld(true);
    _box.setFromObject(pivot);
    const sz = _box.getSize(new THREE.Vector3());
    const target = new THREE.Vector3().subVectors(max, min);
    const s = new THREE.Vector3(target.x / Math.max(sz.x, 1e-4), target.y / Math.max(sz.y, 1e-4), target.z / Math.max(sz.z, 1e-4));
    if (opts.uniform) { const u = Math.min(s.x, s.z); s.set(u, u, u); }
    wrap.add(pivot);
    pivot.position.set(-(_box.min.x + sz.x / 2), -_box.min.y, -(_box.min.z + sz.z / 2));
    wrap.scale.copy(s);
    wrap.position.set((min.x + max.x) / 2, min.y, (min.z + max.z) / 2);
    return wrap;
  }
}

/** Box geometry whose UVs are in world units (tiling textures) */
export function worldBox(w: number, h: number, d: number, tile = 4): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    let su: number, sv: number;
    if (ny > 0.5) { su = w; sv = d; } else if (nx > 0.5) { su = d; sv = h; } else { su = w; sv = h; }
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  g.setAttribute('uv1', uv.clone());
  return g;
}

export function pbrMaterial(set: PBRSet, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap, aoMap: set.armMap, roughnessMap: set.armMap, metalnessMap: set.armMap,
    roughness: 1, metalness: 1, ...opts,
  });
}
