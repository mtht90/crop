import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HEROES, type HeroDef } from './heroes';

const BASE = import.meta.env.BASE_URL + 'assets/';
const PROPS = ['pillar', 'pillar_decorated', 'barrier', 'box_large', 'crates_stacked', 'barrel_large',
  'banner_shield_blue', 'banner_shield_red', 'wall', 'floor_tile_large', 'Skeleton_Staff'] as const;
export type PropName = (typeof PROPS)[number];

const chars = new Map<string, GLTF>();
const props = new Map<string, GLTF>();

// 3段階のトゥーン陰影
const gradientMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

function toonify(root: THREE.Object3D) {
  const cache = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const old = m.material as THREE.MeshStandardMaterial;
    let neu = cache.get(old);
    if (!neu) {
      neu = new THREE.MeshToonMaterial({ map: old.map, color: old.color, gradientMap });
      cache.set(old, neu);
    }
    m.material = neu;
  });
}

export async function loadAssets(onProgress: (ratio: number) => void) {
  const loader = new GLTFLoader();
  const jobs: Promise<void>[] = [];
  let done = 0;
  const total = HEROES.length + PROPS.length;
  const tick = () => onProgress(++done / total);
  // VITE_ASSET_MODE=json: .glb を配信できないホスト向けに、base64 を入れた JSON から読み込む
  const packed = import.meta.env.VITE_ASSET_MODE === 'json';
  const load = async (path: string): Promise<GLTF> => {
    if (!packed) return loader.loadAsync(`${BASE}${path}.glb`);
    const res = await fetch(`${BASE}${path}.json`);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    const bin = atob((await res.json()).glb);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return loader.parseAsync(bytes.buffer, '');
  };
  for (const h of HEROES) {
    jobs.push(load(`chars/${h.model}`).then((g) => { toonify(g.scene); chars.set(h.model, g); tick(); }));
  }
  for (const p of PROPS) {
    jobs.push(load(`props/${p}`).then((g) => { toonify(g.scene); props.set(p, g); tick(); }));
  }
  await Promise.all(jobs);
}

export function prop(name: PropName): THREE.Object3D {
  return props.get(name)!.scene.clone(true);
}

/** 同じ小物を大量に並べるための InstancedMesh 群を作る */
export function instancedProp(name: PropName, matrices: THREE.Matrix4[]): THREE.Group {
  const group = new THREE.Group();
  const src = props.get(name)!.scene;
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const inst = new THREE.InstancedMesh(m.geometry, m.material, matrices.length);
    const tmp = new THREE.Matrix4();
    matrices.forEach((mat, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(mat, m.matrixWorld)));
    inst.castShadow = name !== 'floor_tile_large';
    inst.receiveShadow = true;
    group.add(inst);
  });
  return group;
}

export interface HeroModel {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  materials: THREE.MeshToonMaterial[];
}

export function createHeroModel(def: HeroDef): HeroModel {
  const g = chars.get(def.model)!;
  const root = SkeletonUtils.clone(g.scene);
  const materials: THREE.MeshToonMaterial[] = [];
  const cache = new Map<THREE.Material, THREE.MeshToonMaterial>();
  root.traverse((o) => {
    if (def.hide.includes(o.name)) o.visible = false;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; // スキンメッシュはバウンディングがずれるので常に描画
    const old = m.material as THREE.MeshToonMaterial;
    let neu = cache.get(old);
    if (!neu) { neu = old.clone(); cache.set(old, neu); materials.push(neu); }
    m.material = neu;
  });
  if (def.attach) {
    const slot = root.getObjectByName(def.attach.slot);
    if (slot) slot.add(prop(def.attach.prop));
  }
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of g.animations) clips.set(c.name, c);
  return { root, mixer: new THREE.AnimationMixer(root), clips, materials };
}
