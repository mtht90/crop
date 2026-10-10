import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const BASE = import.meta.env.BASE_URL;

const texLoader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture>>();

function loadTex(url: string, srgb: boolean): Promise<THREE.Texture> {
  const key = url + srgb;
  let p = cache.get(key);
  if (!p) {
    p = texLoader.loadAsync(url).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    });
    cache.set(key, p);
  }
  return p;
}

export interface PBROptions {
  repeat?: [number, number];
  metal?: boolean; // Metalness マップがある素材
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  envMapIntensity?: number;
  normalScale?: number;
}

/** ambientCG の PBR テクスチャセットからマテリアルを作る */
export async function pbrMaterial(name: string, o: PBROptions = {}): Promise<THREE.MeshStandardMaterial> {
  const dir = `${BASE}assets/textures/${name}/`;
  const [map, normalMap, roughnessMap, metalnessMap] = await Promise.all([
    loadTex(dir + 'Color.jpg', true),
    loadTex(dir + 'NormalGL.jpg', false),
    loadTex(dir + 'Roughness.jpg', false),
    o.metal ? loadTex(dir + 'Metalness.jpg', false) : Promise.resolve(null),
  ]);
  const clone = (t: THREE.Texture) => {
    const c = t.clone();
    if (o.repeat) c.repeat.set(o.repeat[0], o.repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  const ns = o.normalScale ?? 1;
  return new THREE.MeshStandardMaterial({
    map: clone(map),
    normalMap: clone(normalMap),
    normalScale: new THREE.Vector2(ns, ns),
    roughnessMap: clone(roughnessMap),
    metalnessMap: metalnessMap ? clone(metalnessMap) : null,
    metalness: o.metalness ?? (o.metal ? 1 : 0),
    roughness: o.roughness ?? 1,
    color: o.color ?? 0xffffff,
    envMapIntensity: o.envMapIntensity ?? 1,
  });
}

// .hdr / .bin を配信できないホスト向け：埋め込み済みのバイナリ（URL→base64）を
// three.js のキャッシュに入れておき、ローダーが fetch せずにそれを使うようにする
declare global {
  interface Window {
    __EMBEDDED_FILES?: Record<string, string>;
  }
}
if (window.__EMBEDDED_FILES) {
  THREE.Cache.enabled = true;
  for (const [url, b64] of Object.entries(window.__EMBEDDED_FILES)) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    THREE.Cache.add(`file:${url}`, bytes.buffer); // FileLoader のキャッシュキー形式
  }
}

export function loadHDR(name: string): Promise<THREE.DataTexture> {
  return new HDRLoader().loadAsync(`${BASE}assets/hdri/${name}`).then((t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
}

export function loadModel(name: string): Promise<GLTF> {
  return new GLTFLoader().loadAsync(`${BASE}assets/models/${name}/${name}.gltf`);
}
