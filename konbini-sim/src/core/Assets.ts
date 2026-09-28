import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = import.meta.env.BASE_URL + 'assets/';

export const CHARACTER_IDS = [
  'Male_Adult_01', 'Male_Adult_03', 'Male_Adult_05', 'Male_Adult_08', 'Male_Adult_09', 'Male_Adult_11',
  'Male_Adult_14', 'Male_Adult_16', 'Male_Adult_17', 'Male_Adult_20',
  'Female_Adult_01', 'Female_Adult_03', 'Female_Adult_05', 'Female_Adult_08', 'Female_Adult_12',
  'Female_Adult_13', 'Female_Adult_15', 'Female_Adult_17', 'Female_Party_01',
  'Business_Male_01', 'Business_Male_04', 'Business_Male_06', 'Business_Female_02',
  'Construction_Male_02', 'Delivery_Male_01', 'Police_Male_01',
] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const PROP_IDS = ['fridge', 'car', 'cone', 'waterbottle', 'coffeemug'] as const;
export type PropId = (typeof PROP_IDS)[number];

export const SFX_IDS = [
  'step0', 'step1', 'step2', 'step3', 'box_drop', 'box_drop2', 'place', 'place2', 'place_can', 'place_glass',
  'metal', 'plate', 'coin0', 'coin1', 'coins', 'bill', 'bill2', 'box_open', 'click', 'switch', 'rollover',
  'drawer', 'punch', 'glass_break', 'bell', 'wood',
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/** Central loader + cache for every external asset used by the game. */
export class Assets {
  private gltf = new GLTFLoader();
  private rgbe = new HDRLoader();
  private tex = new THREE.TextureLoader();
  readonly characters = new Map<CharacterId, GLTF>();
  readonly props = new Map<PropId, GLTF>();
  readonly anims: Record<'m' | 'f', THREE.AnimationClip[]> = { m: [], f: [] };
  readonly hdri: Record<'day' | 'dusk' | 'night', THREE.DataTexture | null> = { day: null, dusk: null, night: null };
  readonly textures = new Map<string, THREE.Texture>();
  readonly sfx = new Map<SfxId, ArrayBuffer>();

  constructor() {
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
  }

  async loadAll(onProgress: (p: number, label: string) => void): Promise<void> {
    const jobs: { label: string; run: () => Promise<void>; weight: number }[] = [];
    for (const id of CHARACTER_IDS) {
      jobs.push({ label: `人物 ${id}`, weight: 3, run: async () => void this.characters.set(id, await this.gltf.loadAsync(`${BASE}characters/${id}.glb`)) });
    }
    for (const g of ['m', 'f'] as const) {
      jobs.push({
        label: `アニメーション (${g})`, weight: 4,
        run: async () => {
          const a = await this.gltf.loadAsync(`${BASE}anims/anims_${g}.glb`);
          this.anims[g] = a.animations.map((clip) => {
            // Keep rotations everywhere, and only the pelvis translation (hip bob);
            // bone lengths differ between avatars so other translations would distort them.
            clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'Bip01_Pelvis.position');
            return clip;
          });
        },
      });
    }
    for (const id of PROP_IDS) {
      jobs.push({ label: `モデル ${id}`, weight: id === 'car' ? 4 : 1, run: async () => void this.props.set(id, await this.gltf.loadAsync(`${BASE}props/${id}.glb`)) });
    }
    const hd: [keyof Assets['hdri'], string][] = [['day', 'pedestrian_overpass_1k'], ['dusk', 'venice_sunset_1k'], ['night', 'moonless_golf_1k']];
    for (const [k, f] of hd) {
      jobs.push({
        label: `HDRI ${f}`, weight: 2,
        run: async () => {
          const t = await this.rgbe.loadAsync(`${BASE}hdri/${f}.hdr`);
          t.mapping = THREE.EquirectangularReflectionMapping;
          this.hdri[k] = t;
        },
      });
    }
    for (const f of ['asphalt_02_diff_1k', 'asphalt_02_rough_1k']) {
      jobs.push({
        label: `テクスチャ ${f}`, weight: 1,
        run: async () => {
          const t = await this.tex.loadAsync(`${BASE}textures/${f}.webp`);
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = 8;
          if (f.includes('diff')) t.colorSpace = THREE.SRGBColorSpace;
          this.textures.set(f, t);
        },
      });
    }
    for (const id of SFX_IDS) {
      jobs.push({ label: `サウンド ${id}`, weight: 0.2, run: async () => void this.sfx.set(id, await (await fetch(`${BASE}sfx/${id}.ogg`)).arrayBuffer()) });
    }

    const total = jobs.reduce((s, j) => s + j.weight, 0);
    let done = 0;
    const queue = [...jobs];
    const worker = async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        await j.run();
        done += j.weight;
        onProgress(done / total, j.label);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  clip(gender: 'm' | 'f', name: string): THREE.AnimationClip | undefined {
    return this.anims[gender].find((c) => c.name === name);
  }
}
