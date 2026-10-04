import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * CC0 assets by Quaternius (Universal Base Characters, Universal Animation
 * Library 1 & 2), optimized by the asset pipeline into public/assets/models.
 */
const MODEL_FILES = {
  female: 'Superhero_Female_FullBody.glb',
  male: 'Superhero_Male_FullBody.glb',
  hairBuns: 'Hair_Buns.glb',
  hairLong: 'Hair_Long.glb',
  hairParted: 'Hair_SimpleParted.glb',
  hairBuzzed: 'Hair_Buzzed.glb',
  hairBuzzedF: 'Hair_BuzzedFemale.glb',
} as const;
const ANIM_FILES = ['anims1.glb', 'anims2.glb'];

export type ModelKey = keyof typeof MODEL_FILES;

export const assets = {
  models: {} as Record<ModelKey, GLTF>,
  clips: {} as Record<string, THREE.AnimationClip>,
  ready: false,
};

const base = () => `${import.meta.env.BASE_URL}assets/models/`;
/** Hosts that can't serve .glb get embedded-glTF .json copies (see tools/embed-gltf.mjs). */
const EXT = (import.meta.env.VITE_MODEL_EXT as string | undefined) ?? 'glb';
const file = (f: string) => f.replace(/\.glb$/, `.${EXT}`);

export async function loadAssets(onProgress?: (p: number) => void) {
  if (assets.ready) return;
  const loader = new GLTFLoader();
  const files = [...Object.values(MODEL_FILES), ...ANIM_FILES];
  let done = 0;
  const load = async (f: string) => {
    const g = await loader.loadAsync(base() + file(f));
    done++;
    onProgress?.(done / files.length);
    return g;
  };
  const entries = await Promise.all(Object.entries(MODEL_FILES).map(async ([k, f]) => [k, await load(f)] as const));
  for (const [k, g] of entries) assets.models[k as ModelKey] = g;
  for (const g of await Promise.all(ANIM_FILES.map(load))) for (const c of g.animations) assets.clips[c.name] = c;
  assets.ready = true;
}
