import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MODEL_SOURCES, type ModelSource } from './modelSources';

/**
 * 開発用：外部素材（glb/obj/fbx）を読み込み、向き・大きさを揃えて
 * テクスチャ埋め込みの glTF(JSON) に変換する。scripts/convert-models.cjs から実行する。
 * 魚は「+X が頭・+Y が背・全長 1・中心が原点」に正規化する。
 */
declare global {
  interface Window {
    __save?: (path: string, data: string) => Promise<void>;
    __done?: boolean;
    __log?: string[];
  }
}

const log = (s: string) => {
  (window.__log ??= []).push(s);
  console.log(s);
};

async function loadTexture(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

function shrink(img: CanvasImageSource & { width: number; height: number }, max: number, w = img.width, h = img.height): THREE.CanvasTexture {
  const k = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.mimeType = 'image/jpeg';
  return t;
}

async function loadSource(src: ModelSource): Promise<THREE.Object3D> {
  const base = src.file.slice(0, src.file.lastIndexOf('/') + 1);
  if (src.type === 'gltf') return (await new GLTFLoader().loadAsync(src.file)).scene;
  if (src.type === 'fbx') return await new FBXLoader().loadAsync(src.file);
  const obj = new OBJLoader();
  if (src.mtl) {
    const mtl = await new MTLLoader().setPath(base).loadAsync(src.mtl);
    mtl.preload();
    obj.setMaterials(mtl);
  }
  return await obj.loadAsync(src.file);
}

/** すべてのメッシュを1つのジオメトリ（マテリアルごとのグループ付き）にまとめる */
function bake(root: THREE.Object3D, skip?: string[]): { geo: THREE.BufferGeometry; mats: THREE.Material[] } {
  root.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    src.applyMatrix4(m.matrixWorld);
    src.computeBoundingBox();
    const bs = new THREE.Vector3();
    src.boundingBox!.getSize(bs);
    log(`  mesh ${m.name} verts=${src.getAttribute('position').count} size=${bs.toArray().map((v) => v.toFixed(2)).join('x')}`);
    if (skip?.includes(m.name) || src.getAttribute('position').count === 0) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    const groups = src.groups.length ? src.groups : [{ start: 0, count: src.getAttribute('position').count, materialIndex: 0 }];
    for (const g of groups) {
      const part = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const a = src.getAttribute(name) as THREE.BufferAttribute | undefined;
        const size = name === 'uv' ? 2 : 3;
        const arr = new Float32Array(g.count * size);
        if (a) for (let i = 0; i < g.count; i++) for (let k = 0; k < size; k++) arr[i * size + k] = a.array[(g.start + i) * a.itemSize + k];
        part.setAttribute(name, new THREE.BufferAttribute(arr, size));
      }
      if (!src.getAttribute('normal')) part.computeVertexNormals();
      geos.push(part);
      mats.push(list[g.materialIndex ?? 0] ?? list[0]);
    }
  });
  const geo = mergeGeometries(geos, true)!;
  return { geo, mats };
}

function normalizeFish(geo: THREE.BufferGeometry, src: ModelSource): void {
  geo.computeBoundingBox();
  const s = new THREE.Vector3();
  geo.boundingBox!.getSize(s);
  // 一番長い軸を X に
  if (s.z >= s.x && s.z >= s.y) geo.rotateY(Math.PI / 2);
  else if (s.y >= s.x && s.y >= s.z) geo.rotateZ(-Math.PI / 2);
  if (src.flip) geo.rotateY(Math.PI);
  if (src.roll) geo.rotateX(src.roll);
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox!.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z);
  geo.boundingBox!.getSize(s);
  geo.scale(1 / s.x, 1 / s.x, 1 / s.x);
  geo.computeBoundingBox();
}

function normalizeProp(geo: THREE.BufferGeometry, height?: number): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const c = new THREE.Vector3();
  bb.getCenter(c);
  geo.translate(-c.x, -bb.min.y, -c.z);
  if (height) {
    const k = height / (bb.max.y - bb.min.y);
    geo.scale(k, k, k);
  }
}

async function convert(src: ModelSource): Promise<void> {
  const root = await loadSource(src);
  const { geo, mats } = bake(root, src.skip);
  const out: THREE.Material[] = [];
  for (const m of mats) {
    const sm = m as THREE.MeshStandardMaterial & THREE.MeshPhongMaterial;
    const nm = new THREE.MeshStandardMaterial({
      color: sm.color ? sm.color.clone() : new THREE.Color(1, 1, 1),
      roughness: src.kind === 'fish' ? 0.45 : 0.85,
      metalness: 0,
      side: sm.side ?? THREE.FrontSide,
      name: sm.name,
    });
    if (src.srgbColors) {
      nm.color.convertSRGBToLinear();
      // 葉・草の青緑を自然な緑に寄せる
      if (/leaf|leafs|grass|lily|plant|bush/i.test(sm.name)) nm.color.multiply(new THREE.Color(0.75, 1, 0.45));
      if (/wood|bark/i.test(sm.name)) nm.color.multiply(new THREE.Color(0.45, 0.5, 0.55));
    }
    if (src.texture) {
      nm.map = shrink(await loadTexture(src.texture), src.texSize ?? 512);
      nm.color.set(0xffffff);
    } else if (sm.map?.image) {
      nm.map = shrink(sm.map.image as HTMLImageElement, src.texSize ?? 512);
    }
    out.push(nm);
  }
  if (src.udim) {
    // UDIM（タイル 1001..） を横一列のアトラスにまとめ、UV を詰め直す
    const imgs = await Promise.all(src.udim.map(loadTexture));
    const tile = 512;
    const cv = document.createElement('canvas');
    cv.width = tile * imgs.length;
    cv.height = tile;
    const g = cv.getContext('2d')!;
    imgs.forEach((im, i) => g.drawImage(im, i * tile, 0, tile, tile));
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.userData.mimeType = 'image/jpeg';
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) / imgs.length);
    for (const m of out) {
      (m as THREE.MeshStandardMaterial).map = t;
      (m as THREE.MeshStandardMaterial).color.set(0xffffff);
    }
  }
  if (src.kind === 'fish') normalizeFish(geo, src);
  else normalizeProp(geo, src.height);
  geo.deleteAttribute('color');
  if (!src.keepUv && !out.some((m) => (m as THREE.MeshStandardMaterial).map)) geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, out.length === 1 ? out[0] : out);
  mesh.name = src.id;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const json = (await new GLTFExporter().parseAsync(scene, { binary: false, embedImages: true })) as object;
  const text = JSON.stringify(json);
  await window.__save!(src.out, text);
  const bb = geo.boundingBox!;
  log(`${src.id}: ${(text.length / 1024).toFixed(0)}KB tris=${geo.getAttribute('position').count / 3} size=${bb.max.x - bb.min.x}x${(bb.max.y - bb.min.y).toFixed(3)}x${(bb.max.z - bb.min.z).toFixed(3)}`);
}

(async () => {
  const only = new URLSearchParams(location.search).get('only');
  for (const s of MODEL_SOURCES) {
    if (only && !only.split(',').includes(s.id)) continue;
    try {
      await convert(s);
    } catch (e) {
      log(`FAILED ${s.id}: ${(e as Error).message}`);
    }
  }
  window.__done = true;
})();
