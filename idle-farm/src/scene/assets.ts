import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

const ASSET_ROOT = 'assets/';
const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadGltf(path: string): Promise<GLTF> {
  let p = cache.get(path);
  if (!p) {
    p = import.meta.env.MODE === 'artifact' ? loadConverted(path) : loader.loadAsync(ASSET_ROOT + path);
    cache.set(path, p);
  }
  return p;
}

/**
 * claude.ai のプレビュー用（scripts/artifact.mjs で変換したモデル）。
 * .json に glTF 本体と base64 のバイナリが入っているので、GLB に組み直して読み込む。
 */
async function loadConverted(path: string): Promise<GLTF> {
  const url = ASSET_ROOT + path.replace(/\.(gltf|glb)$/, '.json');
  const json = await (await fetch(url)).json();
  const bin = Uint8Array.from(atob(json['x-bin']), (c) => c.charCodeAt(0));
  delete json['x-bin'];
  const glb = toGlb(new TextEncoder().encode(JSON.stringify(json)), bin);
  return loader.parseAsync(glb, url.slice(0, url.lastIndexOf('/') + 1));
}

function toGlb(json: Uint8Array, bin: Uint8Array): ArrayBuffer {
  const pad = (n: number) => (n + 3) & ~3;
  const jsonLen = pad(json.length);
  const binLen = pad(bin.length);
  const out = new ArrayBuffer(12 + 8 + jsonLen + 8 + binLen);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, out.byteLength, true);
  view.setUint32(12, jsonLen, true);
  view.setUint32(16, 0x4e4f534a, true); // JSON
  bytes.fill(0x20, 20, 20 + jsonLen);
  bytes.set(json, 20);
  view.setUint32(20 + jsonLen, binLen, true);
  view.setUint32(24 + jsonLen, 0x004e4942, true); // BIN
  bytes.set(bin, 28 + jsonLen);
  return out;
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
