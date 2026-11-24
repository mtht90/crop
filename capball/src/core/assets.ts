import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL + 'assets/';
/** モデルの拡張子。アーティファクト版は glTF（JSON・埋め込み）を .json で配る */
const EXT = (import.meta.env.VITE_MODEL_EXT as string | undefined) || 'glb';

export const MODEL_NAMES = ['knight', 'barbarian', 'mage', 'rogue'] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

export interface Assets {
  models: Record<ModelName, GLTF>;
  anims: THREE.AnimationClip[];
  city: GLTF;
  bat: GLTF;
  sky: THREE.Texture;
}

export async function loadAssets(onProgress: (p: number) => void): Promise<Assets> {
  const gltf = new GLTFLoader();
  const jobs: Promise<unknown>[] = [];
  let done = 0;
  const track = <T>(p: Promise<T>): Promise<T> => {
    jobs.push(p);
    return p.then((v) => {
      done++;
      onProgress(done / jobs.length);
      return v;
    });
  };
  const models = {} as Record<ModelName, GLTF>;
  const modelJobs = MODEL_NAMES.map((n) => track(gltf.loadAsync(BASE + `models/${n}.${EXT}`)).then((g) => (models[n] = g)));
  const anims = track(gltf.loadAsync(BASE + `models/anims.${EXT}`));
  const city = track(gltf.loadAsync(BASE + `models/city.${EXT}`));
  const bat = track(gltf.loadAsync(BASE + `models/bat.${EXT}`));
  const sky = track(new THREE.TextureLoader().loadAsync(BASE + 'sky/sky_2k.jpg'));
  await Promise.all(modelJobs);
  return {
    models,
    anims: (await anims).animations,
    city: await city,
    bat: await bat,
    sky: await sky,
  };
}
