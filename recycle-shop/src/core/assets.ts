import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/`;

/**
 * Artifact 版では .glb / .hdr がそのまま配信できないため、base64 テキスト (.txt) で置き、
 * 読み込み時に復元して blob URL にする。
 */
const ASSET_B64 = import.meta.env.VITE_ASSET_B64 === '1';
// Artifact の CSP は fetch(blob:) を許可しないため、GLTFLoader に ImageBitmapLoader (fetch) ではなく
// <img> 要素で埋め込みテクスチャを読ませる (createImageBitmap が無いと TextureLoader を使う)
if (ASSET_B64) (globalThis as any).createImageBitmap = undefined;

/** 素材のバイト列を取得 (Artifact 版は base64 テキストから復元)。blob: URL は CSP で弾かれるので使わない */
async function fetchBinary(url: string): Promise<ArrayBuffer> {
  const res = await fetch(ASSET_B64 ? `${url}.txt` : url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  if (!ASSET_B64) return res.arrayBuffer();
  const b64 = (await res.text()).trim();
  const fromB64 = (Uint8Array as any).fromBase64 as ((s: string) => Uint8Array) | undefined;
  if (fromB64) return fromB64(b64).buffer as ArrayBuffer;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** 読み込み失敗時にどのファイルかわかるようにする */
const withName = <T>(p: Promise<T>, name: string) => p.catch((e: Error) => { throw new Error(`${name}: ${e?.message ?? e}`); });

/** UI アイコン (SVG) はビルドに同梱してファイル数を減らす */
const BUNDLED_ICONS = import.meta.glob('../../public/assets/icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface InstanceOptions {
  /** 目標サイズ (m)。fit で基準軸を選ぶ */
  size?: number;
  fit?: 'max' | 'y' | 'xz';
  /** 追加の一律スケール (KayKit 什器のように元スケールを保ちたいとき) */
  scale?: number;
  /** 足元を y=0 に揃え XZ 中心を原点へ */
  ground?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

interface Normalized {
  box: THREE.Box3;
}

/**
 * 外部 glTF 素材の読み込みとキャッシュ。
 * instance() はクローンを返し、サイズ正規化はラッパー Group で行う (元モデルの変換は保持)。
 */
class AssetStore {
  readonly manager = new THREE.LoadingManager();
  private gltfLoader = new GLTFLoader(this.manager).setMeshoptDecoder(MeshoptDecoder);
  private hdrLoader = new HDRLoader(this.manager);
  private texLoader = new THREE.TextureLoader(this.manager);
  private gltfCache = new Map<string, Promise<GLTF>>();
  private gltfReady = new Map<string, GLTF>();
  private boxCache = new Map<string, Normalized>();
  private textCache = new Map<string, string>();
  private hdrCache = new Map<string, Promise<THREE.DataTexture>>();
  private texCache = new Map<string, THREE.Texture>();

  url(rel: string) { return ASSET_ROOT + rel; }

  loadGltf(rel: string): Promise<GLTF> {
    let p = this.gltfCache.get(rel);
    if (!p) {
      p = withName(fetchBinary(this.url(`models/${rel}`)).then((buf) => this.gltfLoader.parseAsync(buf, '')), rel).then((g) => {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) {
              const sm = mat as THREE.MeshStandardMaterial;
              if (sm.map) sm.map.anisotropy = 4;
            }
          }
        });
        this.gltfReady.set(rel, g);
        return g;
      });
      this.gltfCache.set(rel, p);
    }
    return p;
  }

  get(rel: string): GLTF {
    const g = this.gltfReady.get(rel);
    if (!g) throw new Error(`asset not preloaded: ${rel}`);
    return g;
  }

  has(rel: string) { return this.gltfReady.has(rel); }

  private bounds(rel: string): Normalized {
    let n = this.boxCache.get(rel);
    if (!n) {
      const scene = this.get(rel).scene;
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3();
      // SkinnedMesh はバインドポーズのジオメトリで計算されるため precise で
      box.setFromObject(scene, true);
      n = { box };
      this.boxCache.set(rel, n);
    }
    return n;
  }

  /** 正規化済みのクローンを返す。戻り値は Group で、子にモデル本体 */
  instance(rel: string, opt: InstanceOptions = {}): THREE.Group {
    const src = this.get(rel).scene;
    const hasSkin = !!src.getObjectByProperty('isSkinnedMesh', true);
    const model = hasSkin ? (SkeletonUtils.clone(src) as THREE.Object3D) : src.clone(true);
    const wrap = new THREE.Group();
    wrap.name = rel;
    const inner = new THREE.Group();
    inner.add(model);
    wrap.add(inner);
    const { box } = this.bounds(rel);
    const size = box.getSize(new THREE.Vector3());
    let s = opt.scale ?? 1;
    if (opt.size) {
      const ref = opt.fit === 'y' ? size.y : opt.fit === 'xz' ? Math.max(size.x, size.z) : Math.max(size.x, size.y, size.z);
      s *= opt.size / Math.max(ref, 1e-6);
    }
    inner.scale.setScalar(s);
    if (opt.ground !== false) {
      const c = box.getCenter(new THREE.Vector3());
      inner.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    }
    const cast = opt.castShadow ?? true;
    const recv = opt.receiveShadow ?? true;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; }
    });
    wrap.userData.localSize = size.clone().multiplyScalar(s);
    return wrap;
  }

  animations(rel: string): THREE.AnimationClip[] {
    return this.get(rel).animations;
  }

  loadHdr(rel: string): Promise<THREE.DataTexture> {
    let p = this.hdrCache.get(rel);
    if (!p) {
      p = withName(fetchBinary(this.url(rel)), rel).then((buf) => {
        // HDRLoader.load 相当を parse から組み立てる
        const d = this.hdrLoader.parse(buf) as { data: Uint16Array | Float32Array; width: number; height: number; type: THREE.TextureDataType };
        const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
        t.colorSpace = THREE.LinearSRGBColorSpace;
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.flipY = true;
        t.needsUpdate = true;
        t.mapping = THREE.EquirectangularReflectionMapping;
        return t;
      });
      this.hdrCache.set(rel, p);
    }
    return p;
  }

  texture(rel: string, srgb = true): THREE.Texture {
    let t = this.texCache.get(rel);
    if (!t) {
      t = this.texLoader.load(this.url(rel));
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      this.texCache.set(rel, t);
    }
    return t;
  }

  /** SVG アイコン (game-icons.net) をインライン SVG 文字列で取得 */
  async loadIcon(name: string): Promise<string> {
    const cached = this.textCache.get(name);
    if (cached) return cached;
    let svg = BUNDLED_ICONS[`../../public/assets/icons/${name}.svg`];
    if (!svg) svg = await (await fetch(this.url(`icons/${name}.svg`))).text();
    // 背景の黒矩形を消し、currentColor で塗れるようにする
    svg = svg.replace(/<path d="M0 0h512v512H0z"\/>/, '').replace(/fill="#fff"/g, 'fill="currentColor"');
    this.textCache.set(name, svg);
    return svg;
  }

  icon(name: string): string {
    return this.textCache.get(name) ?? '';
  }
}

export const assets = new AssetStore();

export async function preloadAll(paths: string[], icons: string[], onProgress: (p: number, label: string) => void): Promise<string[]> {
  const failures: string[] = [];
  let done = 0;
  const total = paths.length + icons.length;
  const tick = (label: string) => { done++; onProgress(done / total, label); };
  const jobs: Promise<unknown>[] = [];
  // 同時接続数を抑えて順次読み込む
  const queue = [...paths];
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift()!;
      try { await assets.loadGltf(p); } catch (e) { console.warn('failed to load', p, e); failures.push((e as Error)?.message ?? String(e)); }
      tick(p);
    }
  };
  for (let i = 0; i < 6; i++) jobs.push(worker());
  jobs.push(...icons.map((i) => assets.loadIcon(i).then(() => tick(i), () => tick(i))));
  await Promise.all(jobs);
  return failures;
}
