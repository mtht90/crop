import * as THREE from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { FX_TEXTURES, MODEL_FILES } from './visuals';

let base = './assets/game/';
/** 開発ツールのページなど、別の階層から読み込むときに変える */
export const setAssetBase = (b: string): void => {
  base = b;
};
/** public/assets/game/ のパス（相対パスにしてサブフォルダ配信にも対応） */
export const assetUrl = (rel: string): string => `${base}${rel}`;

/**
 * 素材の読み込み。起動時にまとめて読み込み、以後は同期的に取り出す。
 * 素材が置かれていない（npm run assets:prepare 前）場合は available=false になり、仮の図形で描画する。
 */
class AssetStore {
  available = false;
  /** 置かれている BGM の名前 */
  bgm: string[] = [];
  private readonly models = new Map<string, GLTF>();
  private readonly textures = new Map<string, THREE.Texture>();

  async load(onProgress: (done: number, total: number) => void): Promise<void> {
    // manifest.json：素材の有無と、モデルの形式（通常は .glb、GLB を配信できない場所では .json の glTF）
    let manifest: { modelExt?: string; bgm?: string[] } | null = null;
    try {
      const res = await fetch(assetUrl('manifest.json'));
      if (res.ok && !(res.headers.get('content-type') ?? '').includes('html')) manifest = await res.json();
    } catch {
      manifest = null;
    }
    if (!manifest) {
      console.warn('素材が見つかりません（npm run assets:prepare）。仮の図形で表示します');
      return;
    }
    const ext = manifest.modelExt ?? 'glb';
    this.bgm = manifest.bgm ?? [];
    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    const total = MODEL_FILES.length + FX_TEXTURES.length;
    let done = 0;
    const tick = () => onProgress(++done, total);
    await Promise.all([
      ...MODEL_FILES.map(async (name) => {
        const gltf = await loader.loadAsync(assetUrl(`models/${name}.${ext}`));
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.models.set(name, gltf);
        tick();
      }),
      ...FX_TEXTURES.map(async (name) => {
        const tex = await texLoader.loadAsync(assetUrl(`fx/${name}.png`));
        tex.colorSpace = THREE.SRGBColorSpace;
        this.textures.set(name, tex);
        tick();
      }),
    ]);
    this.available = true;
  }

  model(name: string): GLTF | undefined {
    return this.models.get(name);
  }

  texture(name: string): THREE.Texture | undefined {
    return this.textures.get(name);
  }
}

export const assets = new AssetStore();
