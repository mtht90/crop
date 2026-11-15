import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** 外部素材のみを読み込む。パスは public/assets 以下。 */
export const MODEL_FILES = {
  wolf: 'models/wolf.glb',
  crab: 'models/crab.glb',
  rat: 'models/rat.glb',
  skeleton: 'models/skeleton.glb',
  boss: 'models/boss.glb',
  wasp: 'models/wasp.glb',
  spider: 'models/spider.glb',
  bat: 'models/bat.glb',
  plant: 'models/plant.glb',
  fp_pistol: 'models/fp_pistol.glb',
  fp_bow: 'models/fp_bow.glb',
  fp_shotgun: 'models/fp_shotgun.glb',
  swamp: 'models/swamp_lib.glb',
  dungeon: 'models/dungeon_kit.glb',
  monolith: 'models/monolith.glb',
  lamp: 'models/lamp.glb',
  gems: 'models/gems.glb',
} as const;
export type ModelKey = keyof typeof MODEL_FILES;

export const TEXTURE_FILES = {
  muzzle: 'textures/fx/muzzle.png',
  star: 'textures/fx/star.png',
  sparkle: 'textures/fx/sparkle.png',
  ring: 'textures/fx/ring.png',
  flarefour: 'textures/fx/flarefour.png',
  x1: 'textures/fx/x1.png',
  nova: 'textures/fx/nova.png',
  corona: 'textures/fx/corona.png',
  impact: 'textures/fx/impact_sheet.png',
} as const;
export type TexKey = keyof typeof TEXTURE_FILES;

const BASE = import.meta.env.BASE_URL + 'assets/';

class Assets {
  gltf = new Map<ModelKey, GLTF>();
  tex = new Map<TexKey, THREE.Texture>();
  sky?: THREE.CubeTexture;

  async loadAll(onProgress: (p: number, label: string) => void) {
    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    const entries = Object.entries(MODEL_FILES) as [ModelKey, string][];
    const texEntries = Object.entries(TEXTURE_FILES) as [TexKey, string][];
    const total = entries.length + texEntries.length + 1;
    let done = 0;
    const step = (label: string) => onProgress(++done / total, label);
    await Promise.all([
      ...entries.map(async ([k, f]) => {
        const g = await loader.loadAsync(BASE + f);
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            // FPSリグに含まれる不要な補助メッシュは非表示
            if (/^Icosphere/i.test(m.name)) m.visible = false;
          }
        });
        this.gltf.set(k, g);
        step(f);
      }),
      ...texEntries.map(async ([k, f]) => {
        const t = await texLoader.loadAsync(BASE + f);
        t.colorSpace = THREE.SRGBColorSpace;
        this.tex.set(k, t);
        step(f);
      }),
      (async () => {
        const cl = new THREE.CubeTextureLoader().setPath(BASE + 'textures/sky/');
        this.sky = await cl.loadAsync(['ft.jpg', 'bk.jpg', 'up.jpg', 'dn.jpg', 'rt.jpg', 'lf.jpg']);
        this.sky.colorSpace = THREE.SRGBColorSpace;
        step('sky');
      })(),
    ]);
  }

  model(k: ModelKey): GLTF {
    const g = this.gltf.get(k);
    if (!g) throw new Error('model not loaded ' + k);
    return g;
  }

  /** スキンメッシュ対応のクローン */
  cloneScene(k: ModelKey): THREE.Object3D {
    return skeletonClone(this.model(k).scene);
  }

  /** ライブラリGLB内の名前付きノードをクローン */
  clonePart(k: ModelKey, name: string): THREE.Object3D {
    const src = this.model(k).scene.getObjectByName(name);
    if (!src) throw new Error(`part ${name} not in ${k}`);
    const c = src.clone(true);
    c.position.set(0, 0, 0);
    return c;
  }

  clips(k: ModelKey): THREE.AnimationClip[] {
    return this.model(k).animations;
  }

  texture(k: TexKey): THREE.Texture {
    return this.tex.get(k)!;
  }
}

export const assets = new Assets();
export const ASSET_BASE = BASE;
