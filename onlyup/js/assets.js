// すべて外部ホストの素材（CC0中心）。リポジトリ版はCDNから直接、アーティファクト版は同梱ファイルから読み込む。
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PH_MODELS } from './asset-models.js';
import { TEXTURE_SETS, URLS, PROPS, PROP_DIMS, SOUNDS } from './asset-data.js';

export { TEXTURE_SETS, URLS, PROPS, PROP_DIMS, SOUNDS, allAssetUrls } from './asset-data.js';

/** 外部URL → 実際に読み込むURL（アーティファクト版では同梱ファイルに差し替え） */
export const resolve = (url) => (window.SKYWARD_ASSETS && window.SKYWARD_ASSETS[url]) || url;

// ---------------------------------------------------------------- loaders
export class AssetLoader {
  constructor(renderer) {
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.texLoader = new THREE.TextureLoader();
    this.texLoader.setCrossOrigin('anonymous');
    this.cache = new Map();
    this.total = 0; this.done = 0;
    this.onProgress = null;
  }

  track(p) {
    this.total++;
    p.finally(() => { this.done++; this.onProgress?.(this.done, this.total); });
    return p;
  }

  texture(url, srgb = false) {
    const key = url + srgb;
    if (this.cache.has(key)) return this.cache.get(key);
    const p = this.track(new Promise((res, rej) => {
      this.texLoader.load(resolve(url), (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = this.maxAniso;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        res(t);
      }, undefined, () => rej(new Error('テクスチャ取得失敗: ' + url.split('/').pop())));
    }));
    this.cache.set(key, p);
    return p;
  }

  cubeTexture(urls) {
    return this.track(new Promise((res, rej) => {
      new THREE.CubeTextureLoader().load(urls.map(resolve), (t) => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => rej(new Error('星空テクスチャ取得失敗')));
    }));
  }

  hdr(url) {
    return this.track(new Promise((res, rej) => {
      const l = new RGBELoader();
      l.setDataType(THREE.FloatType); // 太陽位置の解析のため Float で受け取る
      l.load(resolve(url), res, undefined, () => rej(new Error('HDRI取得失敗')));
    }));
  }

  gltf(url) { return this.track(new GLTFLoader().loadAsync(resolve(url))); }

  /** Poly Haven の glTF：相対参照(bin/テクスチャ)を include の実URLに解決して読む */
  phModel(id) {
    if (this.cache.has('ph:' + id)) return this.cache.get('ph:' + id);
    const m = PH_MODELS[id];
    const mgr = new THREE.LoadingManager();
    mgr.setURLModifier((u) => {
      const rel = Object.keys(m.include).find((r) => u.endsWith(r) || decodeURIComponent(u).endsWith(r));
      return rel ? resolve(m.include[rel]) : u;
    });
    const p = this.track(new GLTFLoader(mgr).loadAsync(resolve(m.gltf)));
    this.cache.set('ph:' + id, p);
    return p;
  }
}

/**
 * HDRI の輝度を走査して太陽の方向と地平線の色を推定する。
 * これで平行光源・水面反射・フォグ色が空と一致する。
 */
export function analyzeHDR(hdr) {
  const { data, width, height } = hdr.image;
  const ch = data.length / (width * height);
  let best = -1, bx = 0, by = 0;
  const horizon = new THREE.Color(0, 0, 0);
  let hn = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * ch;
      const lum = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (lum > best) { best = lum; bx = x; by = y; }
      if (Math.abs(y - height * 0.5) < height * 0.02) {
        horizon.r += data[i]; horizon.g += data[i + 1]; horizon.b += data[i + 2]; hn++;
      }
    }
  }
  horizon.multiplyScalar(1 / hn);
  const u = (bx + 0.5) / width;
  const v = hdr.flipY ? 1 - (by + 0.5) / height : (by + 0.5) / height;
  const lon = (u - 0.5) * Math.PI * 2;
  let lat = (v - 0.5) * Math.PI;
  lat = THREE.MathUtils.clamp(lat, THREE.MathUtils.degToRad(28), THREE.MathUtils.degToRad(70));
  const sunDir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize();
  return { sunDir, horizon };
}
