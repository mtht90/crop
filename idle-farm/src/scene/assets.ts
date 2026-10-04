import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

const ASSET_ROOT = 'assets/';
const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadGltf(path: string): Promise<GLTF> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(ASSET_ROOT + path);
    cache.set(path, p);
  }
  return p;
}

/** 読み込み済みモデルの複製（ジオメトリとマテリアルは共有） */
export async function instance(path: string, shadows = true): Promise<THREE.Object3D> {
  const gltf = await loadGltf(path);
  const obj = gltf.scene.clone(true);
  if (shadows) {
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  return obj;
}

/** モデルの最初のメッシュ（InstancedMesh 用） */
export async function firstMesh(path: string): Promise<THREE.Mesh> {
  const gltf = await loadGltf(path);
  let mesh: THREE.Mesh | undefined;
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error(`メッシュがありません: ${path}`);
  return mesh;
}
