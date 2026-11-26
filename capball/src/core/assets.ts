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

/**
 * アーティファクト版のモデル（glTF JSON にバイナリを base64 で同梱）を読む。
 * data: URL の読み込みはアーティファクトで禁止されているので、ここで GLB に組み立て直して解析する。
 */
async function loadPackedGltf(loader: GLTFLoader, url: string): Promise<GLTF> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const uri: string = json.buffers[0].uri;
  const bin = Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  delete json.buffers[0].uri;
  json.buffers[0].byteLength = bin.length;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(jsonBytes.length / 4) * 4;
  const binLen = Math.ceil(bin.length / 4) * 4;
  const glb = new Uint8Array(12 + 8 + jsonLen + 8 + binLen);
  const dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, glb.length, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glb.set(jsonBytes, 20);
  glb.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);
  dv.setUint32(20 + jsonLen, binLen, true);
  dv.setUint32(24 + jsonLen, 0x004e4942, true); // 'BIN'
  glb.set(bin, 28 + jsonLen);
  // 画像は同じフォルダのファイルとして読む
  return loader.parseAsync(glb.buffer, url.slice(0, url.lastIndexOf('/') + 1));
}

/** 必要になったときに読むモデル（自販機など） */
export function loadExtraModel(name: string): Promise<GLTF> {
  const gltf = new GLTFLoader();
  const url = BASE + `models/${name}.${EXT}`;
  return withRetry(name, () => (EXT === 'json' ? loadPackedGltf(gltf, url) : gltf.loadAsync(url)));
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
  const url = (name: string) => BASE + `models/${name}.${EXT}`;
  const model = (name: string) => step(withRetry(name, () => (EXT === 'json' ? loadPackedGltf(gltf, url(name)) : gltf.loadAsync(url(name)))));
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
