// 素材の読み込み（Poly Haven のテクスチャ・モデル・HDRI）とジオメトリの補助関数
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { loadB64, loadGLTFB64 } from './b64.js';

// RGBELoader.load() と同じ設定の DataTexture を ArrayBuffer から作る
function rgbeTexture(buf) {
  const L = new RGBELoader();
  const d = L.parse(buf);
  const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.flipY = true;
  t.needsUpdate = true;
  return t;
}
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// [フォルダ名, テクスチャ1枚が覆う大きさ(m)]
const TEX = {
  asphalt: ['asphalt_02', 5],
  sidewalk: ['concrete_pavement', 2],
  roof: ['grey_roof_tiles', 2.4],
  plaster: ['white_plaster_rough_01', 2.5],
  beige: ['beige_wall_001', 2.5],
  siding: ['rectangular_facade_tiles', 2],
  block: ['concrete_block_wall', 1.6],
  metal: ['box_profile_metal_sheet', 2.5],
  concrete: ['concrete_floor_02', 3],
  soil: ['farm_soil', 4],
  grass: ['leafy_grass', 4],
  gravel: ['gravel', 2.5],
  shutter: ['painted_metal_shutter', 2],
  cedar: ['japanese_cedar_planks', 1.5],
  stucco: ['white_stucco', 2.5],
};

const MODELS = ['cardboard_box_01', 'hand_truck', 'street_lamp_02', 'exterior_aircon_unit', 'utility_box_01', 'concrete_road_barrier',
  'shrub_02', 'shrub_04', 'planter_box_01', 'covered_car', 'rollershutter_door', 'plastic_crate_01'];

export const A = { mats: {}, models: {}, envMap: null, sky: null, maxAniso: 4 };

const texLoader = new THREE.TextureLoader();
function loadTex(path, srgb) {
  return new Promise((res, rej) => texLoader.load(path, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = A.maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    res(t);
  }, undefined, rej));
}

// UV はメートル単位で作るので、repeat = 1 / タイルの大きさ
function pbr(key, opts = {}) {
  const [folder, size] = TEX[key];
  const base = `assets/textures/${folder}/`;
  return Promise.all([loadTex(base + 'diff.jpg', true), loadTex(base + 'nor.jpg'), loadTex(base + 'rough.jpg')]).then(([d, n, r]) => {
    for (const t of [d, n, r]) t.repeat.set(1 / size, 1 / size);
    return { d, n, r, size };
  });
}

// テクスチャの平均色（リニア）を測る
const _meanCache = new Map();
function meanColor(tex) {
  if (_meanCache.has(tex)) return _meanCache.get(tex);
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.drawImage(tex.image, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  const col = new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  _meanCache.set(tex, col);
  return col;
}

function makeMat(set, opts = {}) {
  let color = new THREE.Color(opts.color ?? 0xffffff);
  // target を指定すると、テクスチャの平均色がその色になるように補正する
  if (opts.target != null) {
    const mean = meanColor(set.d), t = new THREE.Color(opts.target);
    color = new THREE.Color(t.r / Math.max(0.01, mean.r), t.g / Math.max(0.01, mean.g), t.b / Math.max(0.01, mean.b));
  }
  const m = new THREE.MeshStandardMaterial({
    map: set.d, normalMap: set.n, roughnessMap: set.r, roughness: opts.roughness ?? 1, metalness: opts.metalness ?? 0,
    color,
  });
  if (opts.normalScale) m.normalScale.set(opts.normalScale, opts.normalScale);
  if (opts.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
  return m;
}

export async function loadAll(renderer, onProgress) {
  A.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let done = 0;
  const total = Object.keys(TEX).length + MODELS.length + 1;
  const tick = (label) => { done++; onProgress && onProgress(done / total, label); };

  const sets = {};
  await Promise.all(Object.keys(TEX).map(k => pbr(k).then(s => { sets[k] = s; tick(TEX[k][0]); })));

  const M = A.mats;
  M.asphalt = makeMat(sets.asphalt, { target: 0x4e4f50 });
  M.sidewalk = makeMat(sets.sidewalk, { target: 0xb4aea4 });
  M.curb = makeMat(sets.concrete, { target: 0xc8c5bd });
  M.roof = makeMat(sets.roof, { target: 0x5d6166 });
  M.roofBrown = makeMat(sets.roof, { target: 0x6e5a4c });
  M.roofBlue = makeMat(sets.roof, { target: 0x4f5f70 });
  M.plaster = makeMat(sets.plaster, { target: 0xe9e6de });
  M.plasterCream = makeMat(sets.plaster, { target: 0xe3d8c2 });
  M.plasterGray = makeMat(sets.plaster, { target: 0xc4c4c0 });
  M.beige = makeMat(sets.beige, { target: 0xdccbb0 });
  M.siding = makeMat(sets.siding, { target: 0xd6d2ca });
  M.sidingDark = makeMat(sets.siding, { target: 0x8a8680 });
  M.stucco = makeMat(sets.stucco, { target: 0xefece6 });
  M.block = makeMat(sets.block, { target: 0xb3b0a8 });
  // 波板は色だけ自分で決める（元の色は赤茶色のため）
  M.metal = makeMat(sets.metal, { color: 0xd3d7d9, metalness: 0.35, roughness: 0.8 }); M.metal.map = null;
  M.metalBlue = makeMat(sets.metal, { color: 0x7d98b0, metalness: 0.35, roughness: 0.8 }); M.metalBlue.map = null;
  M.concrete = makeMat(sets.concrete, { target: 0xaeaaa2 });
  M.soil = makeMat(sets.soil, { target: 0x5e4836 });
  M.grass = makeMat(sets.grass, { target: 0x667f40 });
  M.gravel = makeMat(sets.gravel, { target: 0x958f86 });
  M.shutter = makeMat(sets.shutter, { color: 0xcfd2d2, metalness: 0.3 });
  M.cedar = makeMat(sets.cedar, { target: 0xa8825c });
  M.cedarDark = makeMat(sets.cedar, { target: 0x5e4330 });

  // テクスチャを使わない素材
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x1e2a30, metalness: 0.1, roughness: 0.04, envMapIntensity: 1.6, clearcoat: 1 });
  M.glassClear = new THREE.MeshPhysicalMaterial({ color: 0x2a3a42, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.28, envMapIntensity: 1.4, depthWrite: false });
  M.frame = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.7, roughness: 0.35 });
  M.frameDark = new THREE.MeshStandardMaterial({ color: 0x3b3a38, metalness: 0.5, roughness: 0.45 });
  M.white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.2 });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.55 });
  M.fabric = new THREE.MeshStandardMaterial({ color: 0x3d4148, roughness: 0.95 });
  M.lineWhite = new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.lineYellow = new THREE.MeshStandardMaterial({ color: 0xe0a92a, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.poleConcrete = makeMat(sets.concrete, { target: 0xbcb9b1 });
  M.wire = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
  M.leaf = new THREE.MeshStandardMaterial({ color: 0x4d6b35, roughness: 0.9 });
  M.trunk = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 });
  M.water = new THREE.MeshPhysicalMaterial({ color: 0x3b4a3c, roughness: 0.08, metalness: 0, envMapIntensity: 1.2 });

  const gltf = new GLTFLoader();
  await Promise.all(MODELS.map(name => new Promise((res) => {
    loadGLTFB64(gltf, `assets/models/${name}/${name}.glb.txt`).then((g) => {
      g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      A.models[name] = g.scene; tick(name); res();
    }, (e) => { console.warn('model load failed', name, e); tick(name); res(); });
  })));

  const hdr = await rgbeTexture(await loadB64('assets/hdri/sky_1k.hdr.txt'));
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  A.envMap = pm.fromEquirectangular(hdr).texture;
  A.sky = hdr;
  tick('sky');
}

// モデルの複製（meshName を指定すると、その部品だけを原点に置いて返す）
export function model(name, meshName) {
  const src = A.models[name];
  if (!src) return new THREE.Group();
  if (!meshName) return src.clone(true);
  let found = null;
  src.traverse(o => { if (!found && o.name === meshName) found = o; });
  if (!found) return src.clone(true);
  const c = found.clone(true);
  c.position.set(0, c.position.y, 0);
  const g = new THREE.Group(); g.add(c);
  return g;
}

// ---------------- ジオメトリ ----------------
// UV をメートル単位にした箱
export function box(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
    }
  }
  return g;
}

// 水平な板（上向き）。UV は世界座標から作る（隣り合う道路で模様がずれない）
export function flat(w, d, x = 0, z = 0) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + x, -(p.getZ(i) + z));
  return g;
}

// 切妻屋根：幅 w（棟の方向）× 奥行 d、高さ h、軒の出 o
export function gableRoof(w, d, h, o = 0.5) {
  const W = w / 2 + o, D = d / 2 + o, t = 0.12;
  const hh = h + (o * h) / (d / 2);
  const slope = Math.hypot(D, hh);
  const pos = [], uv = [];
  const quad = (a, b, c, e, ua) => { pos.push(...a, ...b, ...c, ...a, ...c, ...e); uv.push(...ua[0], ...ua[1], ...ua[2], ...ua[0], ...ua[2], ...ua[3]); };
  const y0 = -(o * h) / (d / 2);
  // 南側（+z）と北側（-z）の屋根面
  quad([-W, y0, D], [W, y0, D], [W, h, 0], [-W, h, 0], [[0, 0], [2 * W, 0], [2 * W, slope], [0, slope]]);
  quad([W, y0, -D], [-W, y0, -D], [-W, h, 0], [W, h, 0], [[0, 0], [2 * W, 0], [2 * W, slope], [0, slope]]);
  // 屋根の裏
  quad([W, y0 - t, D], [-W, y0 - t, D], [-W, h - t, 0], [W, h - t, 0], [[0, 0], [2 * W, 0], [2 * W, slope], [0, slope]]);
  quad([-W, y0 - t, -D], [W, y0 - t, -D], [W, h - t, 0], [-W, h - t, 0], [[0, 0], [2 * W, 0], [2 * W, slope], [0, slope]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// 妻壁（三角形）：幅 d、高さ h、厚み方向は x
export function gableWall(d, h) {
  const pos = [0, 0, -d / 2, 0, 0, d / 2, 0, h, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, d, 0, d / 2, h], 2));
  g.computeVertexNormals();
  return g;
}

const CHUNK = 70;
const WHITE = new THREE.Color(1, 1, 1);
// 色違いの素材：{ isTint, base(頂点カラーの素材), color }
export function tintOf(base, color) { return { isTint: true, base, color: new THREE.Color(color) }; }
// 同じ素材のジオメトリをまとめて描画回数を減らす
export class Batch {
  constructor(chunk = CHUNK) { this.groups = new Map(); this.chunk = chunk; }
  add(geo, mat, matrix, opts = {}) {
    // 色違いの素材は、共通の素材＋頂点の色にして描画回数を減らす
    let tint = null;
    if (mat.isTint) { tint = mat.color; mat = mat.base; }
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (mat.vertexColors) {
      const n = g.attributes.position.count, arr = new Float32Array(n * 3), c = tint || WHITE;
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    g.applyMatrix4(matrix);
    // 位置ごとに区切って、画面外の部分を描かないようにする
    g.computeBoundingBox();
    const bb = g.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const C = this.chunk;
    const big = bb.max.x - bb.min.x > C || bb.max.z - bb.min.z > C;
    const chunk = big ? 'big' : `${Math.floor(cx / C)},${Math.floor(cz / C)}`;
    const key = mat.uuid + (opts.noShadow ? ':ns' : '') + '@' + chunk;
    if (!this.groups.has(key)) this.groups.set(key, { mat, list: [], opts });
    this.groups.get(key).list.push(g);
  }
  // まとめられないもの（線・個別のメッシュ）
  extra(obj) { (this.extras = this.extras || []).push(obj); }
  build(parent) { for (const _ of this.steps(parent, Infinity)) { /* 一度に全部 */ } }
  // 少しずつまとめる（フレームの途中で区切れるように）
  *steps(parent, every = 8) {
    let k = 0;
    for (const { mat, list, opts } of this.groups.values()) {
      // 頂点数でまとめる単位を区切る
      for (let i = 0; i < list.length;) {
        let j = i, n = 0;
        while (j < list.length && (j === i || n + list[j].attributes.position.count < 400000)) n += list[j++].attributes.position.count;
        const part = list.slice(i, j);
        const merged = mergeGeometries(part, false);
        const m = new THREE.Mesh(merged, mat);
        m.castShadow = !opts.noShadow; m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        parent.add(m);
        for (const g of part) g.dispose();
        i = j;
        if (++k % every === 0) yield;
      }
    }
    this.groups.clear();
    if (this.extras) { for (const o of this.extras) parent.add(o); this.extras = null; }
  }
}

// 文字を描いたテクスチャ
export function textTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = A.maxAniso;
  return t;
}
export const JP_FONT = '"Zen Kaku Gothic New","Hiragino Sans","Yu Gothic","Noto Sans JP","Noto Sans CJK JP",sans-serif';

// 同じモデルをたくさん置くときはインスタンス描画にする
export class Instancer {
  constructor(chunk = CHUNK) { this.items = new Map(); this.chunk = chunk; }
  add(name, matrix, part) {
    const p = new THREE.Vector3().setFromMatrixPosition(matrix);
    const key = name + '|' + (part || '') + '@' + Math.floor(p.x / this.chunk) + ',' + Math.floor(p.z / this.chunk);
    if (!this.items.has(key)) this.items.set(key, { name, part, list: [] });
    this.items.get(key).list.push(matrix.clone());
  }
  build(parent) {
    for (const { name, part, list } of this.items.values()) {
      const src = A.models[name];
      if (!src) continue;
      let root = src;
      if (part) src.traverse(o => { if (o.name === part) root = o; });
      root.updateMatrixWorld(true);
      // 部品の位置は x,z を原点に寄せ、高さだけ残す
      const base = new THREE.Matrix4();
      if (part) { const p = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld); base.makeTranslation(-p.x, 0, -p.z); }
      root.traverse(o => {
        if (!o.isMesh) return;
        const local = base.clone().multiply(o.matrixWorld);
        const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(local)));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true; im.receiveShadow = true;
        im.computeBoundingSphere();
        parent.add(im);
      });
    }
    this.items.clear();
  }
}

// 表札などの小さな文字の板を1枚の大きなテクスチャにまとめる
export class Atlas {
  constructor(size = 2048, cw = 256, ch = 128) {
    this.size = size; this.cw = cw; this.ch = ch; this.n = 0;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.5 });
  }
  // draw(ctx, w, h) で描いた板のジオメトリ（幅 w, 高さ h のメートル）を返す
  plane(w, h, draw) {
    const per = this.size / this.cw;
    const col = this.n % per, row = Math.floor(this.n / per);
    this.n++;
    const x = col * this.cw, y = row * this.ch;
    this.ctx.save(); this.ctx.translate(x, y);
    this.ctx.beginPath(); this.ctx.rect(0, 0, this.cw, this.ch); this.ctx.clip();
    draw(this.ctx, this.cw, this.ch);
    this.ctx.restore();
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    const u0 = x / this.size, u1 = (x + this.cw) / this.size, v1 = 1 - y / this.size, v0 = 1 - (y + this.ch) / this.size;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    this.tex.needsUpdate = true;
    return g;
  }
}
