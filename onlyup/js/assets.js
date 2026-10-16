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
    // 同時読み込み数を絞り、失敗したら再試行。最後まで駄目なら単色の代用テクスチャで続行（ゲームは止めない）
    const p = this.track(new Promise((res) => {
      const attempt = (n) => this.slot(() => new Promise((done) => {
        const u = resolve(url) + (n > 0 ? (resolve(url).includes('?') ? '&' : '?') + 'r=' + n : '');
        this.texLoader.load(u, (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = this.maxAniso;
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          const img = t.image;
          if (this.maxSize && img && img.width > this.maxSize) { // スマホ：GPUメモリ節約のため縮小
            const k = this.maxSize / Math.max(img.width, img.height);
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            t.image = c; t.needsUpdate = true;
          }
          done(); res(t);
        }, undefined, () => {
          done();
          if (n < 3) setTimeout(() => attempt(n + 1), 600 * 2 ** n);
          else { console.warn('テクスチャ取得失敗（代用）:', url.split('/').pop()); this.failed = (this.failed || 0) + 1; res(placeholder(srgb)); }
        });
      }));
      attempt(0);
    }));
    this.cache.set(key, p);
    return p;
  }

  /** 同時に走らせる読み込みを最大 maxParallel 本に制限する */
  slot(fn) {
    this.queue ||= []; this.running ||= 0;
    const max = this.maxParallel || 8;
    const run = () => { this.running++; fn().finally(() => { this.running--; const nx = this.queue.shift(); if (nx) nx(); }); };
    if (this.running < max) run(); else this.queue.push(run);
  }

  cubeTexture(urls) {
    return this.track(new Promise((res, rej) => {
      new THREE.CubeTextureLoader().load(urls.map(resolve), (t) => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => rej(new Error('星空テクスチャ取得失敗')));
    }));
  }

  hdr(url) {
    if (this.isPacked(url)) {
      return this.track(this.unpack(url).then((buf) => {
        const l = new RGBELoader(); l.setDataType(THREE.FloatType);
        const d = l.parse(buf);
        const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
        t.flipY = true; t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
        return t;
      }));
    }
    return this.track(new Promise((res, rej) => {
      const l = new RGBELoader();
      l.setDataType(THREE.FloatType); // 太陽位置の解析のため Float で受け取る
      l.load(resolve(url), res, undefined, () => rej(new Error('HDRI取得失敗')));
    }));
  }

  /** アーティファクト版：.json に詰めた GLB / HDR を取り出す */
  async unpack(url) {
    let j;
    for (let n = 0; ; n++) { // 回線が不安定なスマホ向けに再試行
      try {
        const res = await fetch(resolve(url));
        if (!res.ok) throw new Error(res.status);
        j = await res.json();
        break;
      } catch (e) {
        if (n >= 3) throw new Error('素材取得失敗: ' + url.split('/').pop());
        await new Promise((r) => setTimeout(r, 800 * 2 ** n));
      }
    }
    const bin = atob(j.glb || j.hdr);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  isPacked(url) { return resolve(url).endsWith('.json'); }

  gltf(url) {
    if (this.isPacked(url)) return this.track(this.unpack(url).then((buf) => new GLTFLoader().parseAsync(buf, '')));
    return this.track(new GLTFLoader().loadAsync(resolve(url)));
  }

  /** Poly Haven の glTF：相対参照(bin/テクスチャ)を include の実URLに解決して読む */
  phModel(id) {
    if (this.cache.has('ph:' + id)) return this.cache.get('ph:' + id);
    const m = PH_MODELS[id];
    if (this.isPacked(m.gltf)) {
      const p = this.track(this.unpack(m.gltf).then((buf) => new GLTFLoader().parseAsync(buf, '')));
      this.cache.set('ph:' + id, p);
      return p;
    }
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

function placeholder(srgb) {
  const t = new THREE.DataTexture(new Uint8Array(srgb ? [200, 200, 200, 255] : [128, 128, 255, 255]), 1, 1);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.placeholder = true;
  return t;
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
