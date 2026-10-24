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

export async function model(name: string): Promise<THREE.Group | null> {
  try {
    const g: GLTF = await gltfLoader.loadAsync(`${BASE}models/${name}/${name}.gltf`);
    return g.scene;
  } catch (e) {
    console.warn('model load failed', name, e);
    return null;
  }
}
