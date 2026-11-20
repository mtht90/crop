import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = './assets/';
// production (artifact) build ships models as self-contained glTF JSON
const MODEL_EXT = import.meta.env.PROD ? '.json' : '.glb';

export interface PBRSet { map: THREE.Texture; normalMap: THREE.Texture; armMap: THREE.Texture; }

export interface Library {
  /** model templates by node name, per kit */
  models: Map<string, THREE.Object3D>;
  runner: GLTF;
  runnerExtra: GLTF;
  pbr: Record<string, PBRSet>;
  hdr: Record<string, THREE.Texture>;
  sky: Record<string, THREE.Texture>;
  audio: Record<string, ArrayBuffer>;
}

export const PBR_SETS = ['concrete_floor_worn_001', 'anti_slip_concrete', 'metal_plate', 'rusty_metal_02', 'rocky_terrain_02'];
export const SKIES = ['kloofendal_48d_partly_cloudy_puresky', 'rogland_clear_night', 'industrial_sunset_puresky', 'qwantani_puresky'];
const AUDIO = ['01-footstep.mp3', '02-footstep.mp3', '03-footstep.mp3', '04-footstep.mp3', '05-footstep.mp3', 'wind.mp3', 'music_dnb.mp3',
  'sfx_slam_02.mp3', 'sfx_slam_05.mp3', 'sfx_hit_03.mp3', 'sfx_spring_03.mp3', 'sfx_metal_04.mp3', 'sfx_noise_01.mp3', 'sfx_glass_02.mp3',
  'sfx_bell_02.mp3', 'sfx_other_03.mp3', 'sfx_weird_02.mp3', 'sfx_explosion.mp3'];

/** Assets each biome needs (index = biome). Biome 0 + the runner are the "core" needed to start. */
const BIOME_DEPS: { models: string[]; pbr: string[]; sky: string }[] = [
  { models: ['city', 'factory'], pbr: ['concrete_floor_worn_001', 'anti_slip_concrete'], sky: SKIES[0] },
  { models: ['scifi', 'city'], pbr: ['metal_plate'], sky: SKIES[1] },
  { models: ['factory'], pbr: ['metal_plate', 'rusty_metal_02'], sky: SKIES[2] },
  { models: ['nature'], pbr: ['rocky_terrain_02'], sky: SKIES[3] },
];
const CORE_AUDIO = AUDIO.filter((a) => a !== 'music_dnb.mp3');

export interface Loading {
  lib: Library;
  /** runner + first biome + sfx: enough to start playing */
  core: Promise<void>;
  /** per-biome readiness, filled in the background */
  biomeReady: boolean[];
  onBiomeReady: (i: number) => void;
  onAudio: (name: string, buf: ArrayBuffer) => void;
  status: () => { pending: string[]; failed: string[] };
}

export function startLoading(onCoreProgress: (p: number) => void): Loading {
  const gl = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  const lib: Library = { models: new Map(), runner: null as any, runnerExtra: null as any, pbr: {}, hdr: {}, sky: {}, audio: {} };
  const cache = new Map<string, Promise<void>>();
  // diagnostics: what is still loading / what failed (shown on the title screen if loading stalls)
  const pending = new Set<string>(); const failed: string[] = [];
  /** wraps a load with a timeout; on failure/timeout resolves to `fallback()` instead of hanging forever */
  const track = <T>(name: string, p: Promise<T>, fallback?: () => T, ms = 30000): Promise<T> => {
    pending.add(name);
    return new Promise<T>((resolve, reject) => {
      const fail = (e: unknown) => { pending.delete(name); failed.push(name.split('/').pop() + ': ' + String((e as any)?.message ?? e).slice(0, 60)); if (fallback) resolve(fallback()); else reject(e); };
      const t = setTimeout(() => fail('timeout'), ms);
      p.then((v) => { clearTimeout(t); pending.delete(name); resolve(v); }, (e) => { clearTimeout(t); fail(e); });
    });
  };
  const blankTex = () => { const t = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1); t.needsUpdate = true; return t; };
  const once = (key: string, f: () => Promise<void>) => { let p = cache.get(key); if (!p) { p = f(); cache.set(key, p); } return p; };

  const loadKit = (kit: string) => once('m:' + kit, () => track(`models/${kit}`, gl.loadAsync(BASE + `models/${kit}${MODEL_EXT}`), () => null as any, 60000).then((g) => {
    if (!g) return;
    for (const child of [...g.scene.children]) {
      child.position.set(0, 0, 0);
      child.updateMatrixWorld(true);
      child.traverse((o: any) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          dequantize(o.geometry);
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m.map) m.map.anisotropy = 4;
            // Kenney kits omit metallicFactor (glTF default = 1) → make them dielectric
            if (kit !== 'scifi' && !m.metalnessMap) { m.metalness = 0; m.roughness = Math.max(m.roughness, 0.75); }
          }
        }
      });
      lib.models.set(child.name, child);
    }
  }));
  const loadPbr = (s: string) => once('p:' + s, async () => {
    const set: any = {};
    await Promise.all(([['map', 'Diffuse'], ['normalMap', 'nor_gl'], ['armMap', 'arm']] as const).map(([k, suffix]) =>
      track(`${s}_${suffix}`, tl.loadAsync(BASE + `textures/${s}_${suffix}.jpg`), blankTex).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
        if (k === 'map') t.colorSpace = THREE.SRGBColorSpace;
        set[k] = t;
      })));
    lib.pbr[s] = set;
  });
  const loadSky = (s: string) => once('s:' + s, () => track(`${s}_sky`, tl.loadAsync(BASE + `textures/${s}_sky.jpg`), blankTex).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping; lib.sky[s] = t; lib.hdr[s] = t;
  }));
  const loadAudio = (a: string) => once('a:' + a, () => track(a, fetch(BASE + 'audio/' + a).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }), () => null as any, 20000).then((b) => { if (b) lib.audio[a] = b; }));
  const loadBiome = (i: number) => { const d = BIOME_DEPS[i]; return Promise.all([...d.models.map(loadKit), ...d.pbr.map(loadPbr), loadSky(d.sky)]); };

  const L: Loading = { lib, core: null as any, biomeReady: [false, false, false, false], onBiomeReady: () => {}, onAudio: () => {}, status: () => ({ pending: [...pending], failed: [...failed] }) };
  const coreJobs: Promise<unknown>[] = [
    track('models/runner', gl.loadAsync(BASE + 'models/runner' + MODEL_EXT), undefined, 60000).then((g) => { lib.runner = g; }),
    track('models/runner_extra', gl.loadAsync(BASE + 'models/runner_extra' + MODEL_EXT), () => ({ scene: new THREE.Group(), animations: [] } as any), 60000).then((g) => { lib.runnerExtra = g; }),
    loadBiome(0),
    ...CORE_AUDIO.map(loadAudio),
  ];
  let done = 0;
  for (const j of coreJobs) j.then(() => onCoreProgress(++done / coreJobs.length));
  L.core = Promise.all(coreJobs).then(() => {
    L.biomeReady[0] = true;
    // background: music, then the remaining biomes in play order
    loadAudio('music_dnb.mp3').then(() => L.onAudio('music_dnb.mp3', lib.audio['music_dnb.mp3']));
    (async () => {
      for (let i = 1; i < BIOME_DEPS.length; i++) {
        try { await loadBiome(i); L.biomeReady[i] = true; L.onBiomeReady(i); } catch (e) { console.warn('biome load failed', i, e); }
      }
    })();
  });
  return L;
}

// --------------------------------------------------------------------------------------
// Model helpers
// --------------------------------------------------------------------------------------
const _box = new THREE.Box3();
const bboxCache = new WeakMap<THREE.Object3D, THREE.Box3>();
export function templateBox(t: THREE.Object3D): THREE.Box3 {
  let b = bboxCache.get(t);
  if (!b) { t.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(t); bboxCache.set(t, b); }
  return b;
}

export class Models {
  constructor(public lib: Library) {}
  has(name: string) { return this.lib.models.has(name); }
  /** Plain clone (shared geometry/material). */
  clone(name: string): THREE.Object3D {
    const t = this.lib.models.get(name);
    if (!t) { console.warn('missing model', name); return new THREE.Object3D(); }
    return t.clone(true);
  }
  size(name: string): THREE.Vector3 { return templateBox(this.lib.models.get(name)!).getSize(new THREE.Vector3()); }
  /**
   * Clone and fit into an axis-aligned box. The model's bounding box is mapped onto
   * [min,max]. If `uniform` is set the model keeps proportions (scaled by xz) and sits on min.y.
   */
  fit(name: string, min: THREE.Vector3, max: THREE.Vector3, opts: { uniform?: boolean; rotY?: number } = {}): THREE.Object3D {
    const t = this.lib.models.get(name);
    if (!t) return new THREE.Object3D();
    const inner = t.clone(true);
    const wrap = new THREE.Object3D();
    const pivot = new THREE.Object3D();
    pivot.add(inner);
    if (opts.rotY) pivot.rotation.y = opts.rotY;
    pivot.updateMatrixWorld(true);
    _box.setFromObject(pivot);
    const sz = _box.getSize(new THREE.Vector3());
    const target = new THREE.Vector3().subVectors(max, min);
    const s = new THREE.Vector3(target.x / Math.max(sz.x, 1e-4), target.y / Math.max(sz.y, 1e-4), target.z / Math.max(sz.z, 1e-4));
    if (opts.uniform) { const u = Math.min(s.x, s.z); s.set(u, u, u); }
    wrap.add(pivot);
    pivot.position.set(-(_box.min.x + sz.x / 2), -_box.min.y, -(_box.min.z + sz.z / 2));
    wrap.scale.copy(s);
    wrap.position.set((min.x + max.x) / 2, min.y, (min.z + max.z) / 2);
    return wrap;
  }
}

/** Box geometry whose UVs are in world units (tiling textures) */
export function worldBox(w: number, h: number, d: number, tile = 4): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    let su: number, sv: number;
    if (ny > 0.5) { su = w; sv = d; } else if (nx > 0.5) { su = d; sv = h; } else { su = w; sv = h; }
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  g.setAttribute('uv1', uv.clone());
  return g;
}

export function pbrMaterial(set: PBRSet, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap, aoMap: set.armMap, roughnessMap: set.armMap, metalnessMap: set.armMap,
    roughness: 1, metalness: 1, ...opts,
  });
}

/** meshopt/quantized attributes → Float32 so geometry can be transformed and merged on the CPU */
function dequantize(g: THREE.BufferGeometry) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute;
    if (a.array instanceof Float32Array && !(a as any).isInterleavedBufferAttribute) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
}
