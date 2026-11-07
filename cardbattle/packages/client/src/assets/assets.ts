import * as THREE from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ENV_TEXTURES, FX_TEXTURES, MODEL_FILES } from './visuals';

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
    // 素材の設定：ページに埋め込まれていればそれを使い、無ければ manifest.json を読む
    let manifest: { modelExt?: string; bgm?: string[] } | null =
      (window as unknown as { __RUNE_ASSETS__?: { modelExt?: string; bgm?: string[] } }).__RUNE_ASSETS__ ?? null;
    if (!manifest) {
      try {
        const res = await fetch(assetUrl('manifest.json'));
        if (res.ok && !(res.headers.get('content-type') ?? '').includes('html')) manifest = await res.json();
      } catch (e) {
        this.failures.push(`manifest.json: ${String(e)}`);
      }
    }
    if (!manifest) {
      console.warn('素材が見つかりません（npm run assets:prepare）。仮の図形で表示します');
      return;
    }
    // 素材は1つずつ読み込み、読めなかったものだけ仮の図形にする（1つの失敗で全部が仮表示にならないように）
    this.available = true;
    const ext = manifest.modelExt ?? 'glb';
    this.bgm = manifest.bgm ?? [];
    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    const total = MODEL_FILES.length + FX_TEXTURES.length + ENV_TEXTURES.length;
    let done = 0;
    const tick = () => onProgress(++done, total);
    const attempt = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        console.warn('素材の読み込みに失敗', label, e);
        this.failures.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
      tick();
    };
    await Promise.all([
      ...MODEL_FILES.map((name) =>
        attempt(`models/${name}`, async () => {
          const gltf = await loader.loadAsync(assetUrl(`models/${name}.${ext}`));
          gltf.scene.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          this.models.set(name, gltf);
        }),
      ),
      ...ENV_TEXTURES.map((name) =>
        attempt(`env/${name}`, async () => {
          const tex = await texLoader.loadAsync(assetUrl(`env/${name}.png`));
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.anisotropy = 4;
          if (name === 'cobble') tex.colorSpace = THREE.SRGBColorSpace;
          this.textures.set(`env_${name}`, tex);
        }),
      ),
      ...FX_TEXTURES.map((name) =>
        attempt(`fx/${name}`, async () => {
          const tex = await texLoader.loadAsync(assetUrl(`fx/${name}.png`));
          tex.colorSpace = THREE.SRGBColorSpace;
          this.textures.set(name, tex);
        }),
      ),
    ]);
  }

  /** 読み込めなかった素材（原因の調査用） */
  readonly failures: string[] = [];

  model(name: string): GLTF | undefined {
    return this.models.get(name);
  }

  texture(name: string): THREE.Texture | undefined {
    return this.textures.get(name);
  }
}

export const assets = new AssetStore();
