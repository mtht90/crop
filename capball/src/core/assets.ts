import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const BASE = import.meta.env.BASE_URL + 'assets/';

export const MODEL_NAMES = ['knight', 'barbarian', 'mage', 'rogue'] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

export interface Assets {
  models: Record<ModelName, GLTF>;
  anims: THREE.AnimationClip[];
  city: GLTF;
  bat: GLTF;
  envHdr: THREE.DataTexture;
  sky: THREE.Texture;
}

export async function loadAssets(onProgress: (p: number) => void): Promise<Assets> {
  const gltf = new GLTFLoader();
  const rgbe = new RGBELoader();
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
  const modelJobs = MODEL_NAMES.map((n) => track(gltf.loadAsync(BASE + `models/${n}.glb`)).then((g) => (models[n] = g)));
  const anims = track(gltf.loadAsync(BASE + 'models/anims.glb'));
  const city = track(gltf.loadAsync(BASE + 'models/city.glb'));
  const bat = track(gltf.loadAsync(BASE + 'models/bat.glb'));
  const envHdr = track(rgbe.loadAsync(BASE + 'sky/sky_1k.hdr'));
  const sky = track(new THREE.TextureLoader().loadAsync(BASE + 'sky/sky_2k.jpg'));
  await Promise.all(modelJobs);
  return {
    models,
    anims: (await anims).animations,
    city: await city,
    bat: await bat,
    envHdr: await envHdr,
    sky: await sky,
  };
}
