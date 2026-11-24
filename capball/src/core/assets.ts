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
  /** 以下は無くても試合はできる（読めなければ省く） */
  city: GLTF | null;
  bat: GLTF | null;
  sky: THREE.Texture | null;
}

/** 時間切れ付きで、失敗したら少し待って読み直す */
async function withRetry<T>(label: string, f: () => Promise<T>, tries = 3, timeoutMs = 25000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await Promise.race([
        f(),
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error('時間切れ')), timeoutMs)),
      ]);
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw new Error(`${label} を読み込めませんでした（${last instanceof Error ? last.message : String(last)}）`);
}

export async function loadAssets(onProgress: (p: number) => void): Promise<Assets> {
  const gltf = new GLTFLoader();
  let done = 0;
  const total = MODEL_NAMES.length + 4;
  const step = <T>(p: Promise<T>) =>
    p.finally(() => {
      done++;
      onProgress(done / total);
    });
  const model = (name: string) => step(withRetry(name, () => gltf.loadAsync(BASE + `models/${name}.${EXT}`)));
  const optional = <T>(p: Promise<T>) => p.catch((e) => {
    console.warn(e);
    return null;
  });
  const [models, anims, city, bat, sky] = await Promise.all([
    Promise.all(MODEL_NAMES.map((n) => model(n))).then((gs) => Object.fromEntries(MODEL_NAMES.map((n, i) => [n, gs[i]])) as Record<ModelName, GLTF>),
    model('anims'),
    optional(model('city')),
    optional(model('bat')),
    optional(step(withRetry('sky', () => new THREE.TextureLoader().loadAsync(BASE + 'sky/sky_2k.jpg')))),
  ]);
  return { models, anims: anims.animations, city, bat, sky };
}
