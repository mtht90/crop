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
        const buf = await (await fetch(f.url)).arrayBuffer();
        const ff = new FontFace(f.family, buf, { weight: String(f.weight) });
        await ff.load();
        document.fonts.add(ff);
      } catch (e) { console.warn('font', f.url, e); }
    })());
  }

  // HDRI → PMREM (.hdr そのもの、または配信用の base64 テキスト .hdr.b64.txt)
  track((async () => {
    try {
      const res = await fetch(A.hdri);
      let buf;
      if (A.hdri.endsWith('.b64.txt')) {
        const bin = atob((await res.text()).trim());
        buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        buf = buf.buffer;
      } else buf = await res.arrayBuffer();
      const loader = new RGBELoader();
      const data = loader.parse(buf);
      const tex = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type);
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.flipY = true;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      const pmrem = new THREE.PMREMGenerator(renderer);
      out.env = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
      pmrem.dispose();
    } catch (e) { console.warn('hdri', e); }
  })());

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
  // 図柄画像 (Canvas 描画用)
  const skin = A.symbolImages[A.symbolSkin] || {};
  const allImgs = { ...A.symbolImages.twemoji, ...skin, ...(A.uiImages || {}) };
  for (const [name, url] of Object.entries(allImgs)) {
    track(new Promise((ok) => {
      const img = new Image();
      img.onload = () => { out.images[name] = img; ok(); };
      img.onerror = () => ok();
      img.src = url;
    }));
  }

  // 日本語フォント (Google Fonts) は使う文字だけ先読みしておく
  track((async () => {
    const txt = jpText(cfg);
    try {
      await Promise.all([
        document.fonts.load(`800 100px ${A.jpFonts.mincho}`, txt),
        document.fonts.load(`700 40px ${A.jpFonts.gothic}`, txt),
        document.fonts.load(`900 40px ${A.jpFonts.gothic}`, txt),
      ]);
    } catch { /* フォールバックで描画 */ }
  })());

  await Promise.all(jobs);
  out.hall = out.hall.filter(Boolean);
  return out;
}

// 演出で使う日本語をまとめる (フォントのサブセット読み込み用)
function jpText() {
  return '所持金投資持ちメダル枚収支換金残高円千円で貸出ボタン本日の設定勝ち負け回転数通算日次へ7を狙えメダルがありません右機入れてください連チャンゾーン残り中合計終了獲得激アツレア役ぶどうチェリー算最大ハマ0123456789!?…';
}
