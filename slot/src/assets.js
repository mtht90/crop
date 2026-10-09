// 外部素材ローダ (HDRI / PBR テクスチャ / GLB / フォント / 図柄画像)
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadAssets(cfg, renderer, onProgress) {
  const A = cfg.assets;
  const jobs = [];
  let done = 0;
  const track = (p) => { jobs.push(p); p.finally(() => onProgress?.(++done / jobs.length)); return p; };
  const out = { textures: {}, models: {}, hall: [], images: {} };

  // フォント
  for (const f of Object.values(A.fonts)) {
    track((async () => {
      try {
        const ff = new FontFace(f.family, `url(${f.url})`, { weight: String(f.weight) });
        await ff.load();
        document.fonts.add(ff);
      } catch (e) { console.warn('font', f.url, e); }
    })());
  }

  // HDRI → PMREM
  track(new Promise((ok) => {
    new RGBELoader().load(A.hdri, (tex) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      out.env = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
      pmrem.dispose();
      ok();
    }, undefined, (e) => { console.warn('hdri', e); ok(); });
  }));

  // PBR テクスチャセット
  const tl = new THREE.TextureLoader();
  const loadTex = (url, srgb) => new Promise((ok) => {
    tl.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      ok(t);
    }, undefined, () => ok(null));
  });
  const slot = { Color: 'map', NormalGL: 'normalMap', Roughness: 'roughnessMap', Metalness: 'metalnessMap' };
  for (const [name, { dir, maps }] of Object.entries(A.textures)) {
    track((async () => {
      const set = {};
      await Promise.all(maps.map(async (m) => { set[slot[m]] = await loadTex(`${dir}${m}.jpg`, m === 'Color'); }));
      out.textures[name] = set;
    })());
  }

  // GLB
  const gl = new GLTFLoader();
  const loadGlb = (url) => new Promise((ok) => gl.load(url, (g) => ok(g.scene), undefined, (e) => { console.warn('glb', url, e); ok(null); }));
  track(loadGlb(A.models.coin).then((s) => { out.models.coin = s; }));
  if (cfg.render.hall) {
    A.models.hall.forEach((u, i) => track(loadGlb(u).then((s) => { if (s) out.hall[i] = s; })));
  }

  // 図柄画像 (Canvas 描画用)
  const skin = A.symbolImages[A.symbolSkin] || {};
  const allImgs = { ...A.symbolImages.twemoji, ...skin };
  for (const [name, url] of Object.entries(allImgs)) {
    track(new Promise((ok) => {
      const img = new Image();
      img.onload = () => { out.images[name] = img; ok(); };
      img.onerror = () => ok();
      img.src = url;
    }));
  }

  await Promise.all(jobs);
  out.hall = out.hall.filter(Boolean);
  return out;
}
