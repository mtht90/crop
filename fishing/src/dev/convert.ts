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
  const g = cv.getContext('2d')!;
  // GLTFLoader は ImageBitmap を上下反転済み（imageOrientation: flipY）で読むので元に戻す
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
    g.translate(0, cv.height);
    g.scale(1, -1);
  }
  g.drawImage(img, 0, 0, cv.width, cv.height);
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
    // 量子化（正規化された整数）の頂点はそのまま変換すると範囲外が潰れるので、先に小数へ戻す
    for (const name of Object.keys(src.attributes)) {
      const a = src.getAttribute(name);
      if (a.array instanceof Float32Array && !a.normalized && !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) continue;
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
      src.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
    }
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
        const a = src.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
        const size = name === 'uv' ? 2 : 3;
        const arr = new Float32Array(g.count * size);
        // getX/Y/Z は量子化（normalized）された値やインターリーブ配列も正しく読める
        const get = [(j: number) => a!.getX(j), (j: number) => a!.getY(j), (j: number) => a!.getZ(j)];
        if (a) for (let i = 0; i < g.count; i++) for (let k = 0; k < size; k++) arr[i * size + k] = get[k](g.start + i);
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

/** 魚の向きと大きさをそろえる。かけた変換を返す（同じ変換を元モデルにも使うため） */
function normalizeFish(geo: THREE.BufferGeometry, src: ModelSource): THREE.Matrix4 {
  const M = new THREE.Matrix4();
  const apply = (m: THREE.Matrix4) => {
    geo.applyMatrix4(m);
    M.premultiply(m);
  };
  geo.computeBoundingBox();
  const s = new THREE.Vector3();
  geo.boundingBox!.getSize(s);
  // 一番長い軸を X に
  if (s.z >= s.x && s.z >= s.y) apply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  else if (s.y >= s.x && s.y >= s.z) apply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  if (src.flip) apply(new THREE.Matrix4().makeRotationY(Math.PI));
  if (src.roll) apply(new THREE.Matrix4().makeRotationX(src.roll));
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox!.getCenter(c);
  apply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  geo.boundingBox!.getSize(s);
  apply(new THREE.Matrix4().makeScale(1 / s.x, 1 / s.x, 1 / s.x));
  geo.computeBoundingBox();
  return M;
}

/**
 * 高精細モデルを左右の真横から正射影で撮り、上半分 = +Z 側、下半分 = -Z 側の画像にする。
 * 透明な縁は周りの色で埋めて、投影の境目に背景が出ないようにする。
 */
function bakeSides(hi: THREE.BufferGeometry, mats: THREE.Material[], size: number, y0: number, y1: number): HTMLCanvasElement {
  const half = size / 2;
  const r = new THREE.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, half);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const basic = mats.map((m) => new THREE.MeshBasicMaterial({ map: (m as THREE.MeshStandardMaterial).map ?? null, color: (m as THREE.MeshStandardMaterial).map ? 0xffffff : (m as THREE.MeshStandardMaterial).color, side: THREE.DoubleSide }));
  scene.add(new THREE.Mesh(hi, basic.length === 1 ? basic[0] : basic));
  const cam = new THREE.OrthographicCamera(-0.52, 0.52, y1, y0, 0.01, 20);
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const g = out.getContext('2d')!;
  for (const [side, row] of [[1, 0], [-1, half]] as const) {
    cam.position.set(0, 0, 5 * side);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    r.render(scene, cam);
    g.drawImage(r.domElement, 0, row);
  }
  r.dispose();
  // 縁の透明な所を周りの色で埋める
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let pass = 0; pass < 12; pass++) {
    const src = new Uint8ClampedArray(d);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (src[i + 3] > 200) continue;
        let n = 0;
        let cr = 0, cg = 0, cb = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size || (yy < half) !== (y < half)) continue;
          const j = (yy * size + xx) * 4;
          if (src[j + 3] > 200) {
            cr += src[j];
            cg += src[j + 1];
            cb += src[j + 2];
            n++;
          }
        }
        if (n) {
          d[i] = cr / n;
          d[i + 1] = cg / n;
          d[i + 2] = cb / n;
          d[i + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

/** 軽いメッシュの UV を、真横からの投影で付け直す（面の向きで左右どちらの画像を使うか決める） */
function projectSideUv(geo: THREE.BufferGeometry, y0: number, y1: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t);
    b.fromBufferAttribute(pos, t + 1);
    c.fromBufferAttribute(pos, t + 2);
    const nz = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).z;
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(t + k);
      const y = (pos.getY(t + k) - y0) / (y1 - y0);
      uv[(t + k) * 2] = nz >= 0 ? (x + 0.52) / 1.04 : (0.52 - x) / 1.04;
      uv[(t + k) * 2 + 1] = nz >= 0 ? 0.5 + y * 0.5 : y * 0.5;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.clearGroups();
  return g;
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
  let finalGeo = geo;
  let finalMats = out;
  if (src.kind === 'fish') {
    const M = normalizeFish(geo, src);
    if (src.hiFile) {
      // 高精細モデルを同じ向き・大きさにそろえて、真横から撮ったテクスチャを作る
      const hiRoot = (await new GLTFLoader().loadAsync(src.hiFile)).scene;
      const hi = bake(hiRoot, src.skip);
      hi.geo.applyMatrix4(M);
      hi.geo.computeBoundingBox();
      const y0 = hi.geo.boundingBox!.min.y * 1.04;
      const y1 = hi.geo.boundingBox!.max.y * 1.04;
      const atlas = bakeSides(hi.geo, hi.mats, src.texSize ?? 1024, y0, y1);
      const t = new THREE.CanvasTexture(atlas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.userData.mimeType = 'image/jpeg';
      finalGeo = projectSideUv(geo, y0, y1);
      finalMats = [new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0, side: THREE.DoubleSide, name: 'scan' })];
    }
  } else normalizeProp(geo, src.height);
  const geo2 = finalGeo;
  geo2.deleteAttribute('color');
  if (!src.keepUv && !finalMats.some((m) => (m as THREE.MeshStandardMaterial).map)) geo2.deleteAttribute('uv');
  geo2.computeVertexNormals();
  geo2.computeBoundingBox();
  const mesh = new THREE.Mesh(geo2, finalMats.length === 1 ? finalMats[0] : finalMats);
  mesh.name = src.id;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const json = (await new GLTFExporter().parseAsync(scene, { binary: false, embedImages: true })) as object;
  const text = JSON.stringify(json);
  await window.__save!(src.out, text);
  const bb = geo2.boundingBox!;
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
