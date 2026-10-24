import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const texCache = new Map<string, THREE.Texture>();

export function texture(name: string, opts: { repeat?: boolean; srgb?: boolean } = {}): THREE.Texture {
  const key = `${name}|${opts.srgb !== false}`;
  let t = texCache.get(key);
  if (!t) {
    t = texLoader.load(`${BASE}textures/${name}`);
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    if (opts.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    texCache.set(key, t);
  }
  return t;
}

/** 小道具モデル（public/assets/props/<name>.json、変換済み glTF） */
export async function model(name: string): Promise<THREE.Group | null> {
  try {
    const g: GLTF = await gltfLoader.loadAsync(`${BASE}props/${name}.json`);
    return g.scene;
  } catch (e) {
    console.warn('model load failed', name, e);
    return null;
  }
}

/**
 * モデルを大量に並べる（部位ごとに InstancedMesh を作る）。
 * 返す Group は先に配置でき、読み込みが終わると中身が入る。
 */
export function instanced(name: string, matrices: THREE.Matrix4[], opts: { shadow?: boolean; tint?: (i: number, c: THREE.Color) => void } = {}): THREE.Group {
  const out = new THREE.Group();
  if (!matrices.length) return out;
  void model(name).then((root) => {
    if (!root) return;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      const im = new THREE.InstancedMesh(geo, m.material, matrices.length);
      const c = new THREE.Color();
      matrices.forEach((mat, i) => {
        im.setMatrixAt(i, mat);
        if (opts.tint) {
          c.setRGB(1, 1, 1);
          opts.tint(i, c);
          im.setColorAt(i, c);
        }
      });
      im.castShadow = opts.shadow ?? true;
      im.receiveShadow = true;
      out.add(im);
    });
  });
  return out;
}
