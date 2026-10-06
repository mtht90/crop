import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadFx } from './textures';

/**
 * CC0 assets by Quaternius (Universal Base Characters, Universal Animation
 * Library 1 & 2), optimized by the asset pipeline into public/assets/models.
 */
const MODEL_FILES = {
  female: 'Superhero_Female_FullBody.glb',
  male: 'Superhero_Male_FullBody.glb',
  hairBuns: 'Hair_Buns.glb',
  hairLong: 'Hair_Long.glb',
  hairParted: 'Hair_SimpleParted.glb',
  hairBuzzed: 'Hair_Buzzed.glb',
  hairBuzzedF: 'Hair_BuzzedFemale.glb',
  hairBeard: 'Hair_Beard.glb',
  /** Kenney Blaster Kit (CC0) "blaster-j", Star's twin pistols. */
  blaster: 'Blaster.glb',
  /** Kenney Blaster Kit (CC0) "blaster-h", Zip's hook launcher. */
  hookGun: 'HookGun.glb',
  /** Kenney Blaster Kit (CC0) "blaster-b", Don's arm cannon. */
  armCannon: 'ArmCannon.glb',
  /** Kenney Blaster Kit (CC0) "blaster-e" (long, scoped), Rei's rifle. */
  rifle: 'Rifle.glb',
  /** "Cute umbrella" by ege (OpenGameArt, CC0), Ameri's umbrella. */
  umbrella: 'Umbrella.glb',
  /** "Katana" by pfunked and the sheath from "Katana" by Clint Bellanger (OpenGameArt, CC0). */
  katana: 'Katana.glb',
  saya: 'Saya.glb',
  /** Quaternius Modular Character Outfits - Fantasy (CC0), textures greyed for tinting. */
  outfitMaleRanger: 'Outfit_Male_Ranger.glb',
  outfitFemaleRanger: 'Outfit_Female_Ranger.glb',
  outfitMalePeasant: 'Outfit_Male_Peasant.glb',
  outfitFemalePeasant: 'Outfit_Female_Peasant.glb',
  /** Kenney Pirate Kit (CC0): Don's arm cannon and shells, pirate cove decor (one node per model). */
  pirate: 'Pirate.glb',
} as const;
const ANIM_FILES = ['anims1.glb', 'anims2.glb'];

export type ModelKey = keyof typeof MODEL_FILES;

export const assets = {
  models: {} as Record<ModelKey, GLTF>,
  clips: {} as Record<string, THREE.AnimationClip>,
  ready: false,
};

const base = () => `${import.meta.env.BASE_URL}assets/models/`;
/** Hosts that can't serve .glb get embedded-glTF .json copies (see tools/embed-gltf.mjs). */
const EXT = (import.meta.env.VITE_MODEL_EXT as string | undefined) ?? 'glb';
const file = (f: string) => f.replace(/\.glb$/, `.${EXT}`);

export async function loadAssets(onProgress?: (p: number) => void) {
  if (assets.ready) return;
  const loader = new GLTFLoader();
  const files = [...Object.values(MODEL_FILES), ...ANIM_FILES];
  let done = 0;
  const load = async (f: string) => {
    const g = await loadModel(loader, base() + file(f));
    done++;
    onProgress?.(done / files.length);
    return g;
  };
  const fxDone = loadFx();
  const entries = await Promise.all(Object.entries(MODEL_FILES).map(async ([k, f]) => [k, await load(f)] as const));
  for (const [k, g] of entries) assets.models[k as ModelKey] = g;
  for (const g of await Promise.all(ANIM_FILES.map(load))) for (const c of g.animations) assets.clips[c.name] = c;
  await fxDone;
  assets.ready = true;
}

/**
 * Fetches a GLB (or a GLB wrapped as base64 JSON) and parses it without any
 * data: or blob: fetches, so it also works under strict CSP hosts.
 */
async function loadModel(loader: GLTFLoader, url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  let bytes: Uint8Array;
  if (EXT === 'json') {
    const { glb } = (await res.json()) as { glb: string };
    const bin = atob(glb);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else bytes = new Uint8Array(await res.arrayBuffer());
  // Embedded textures: use <img> + blob URL (allowed) instead of fetch()-based ImageBitmapLoader.
  const g = globalThis as { createImageBitmap?: unknown };
  const cib = g.createImageBitmap;
  g.createImageBitmap = undefined;
  try {
    const p = loader.parseAsync(bytes.buffer as ArrayBuffer, '');
    g.createImageBitmap = cib;
    return await p;
  } finally {
    g.createImageBitmap = cib;
  }
}
