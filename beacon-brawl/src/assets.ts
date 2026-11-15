import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { HeroDef } from './heroes';
import { WEAPONS, type WeaponName } from './weapons';

const BASE = import.meta.env.BASE_URL + 'assets/';
/** キャラの表示倍率（VRM は実寸メートルなので、ゲーム内の縮尺に合わせて拡大） */
export const HERO_SCALE = 1.5;
/** スマホなどタッチ端末はテクスチャを半分に（1体あたり約80MB → 約20MB） */
const MOBILE = matchMedia('(pointer: coarse)').matches;
const TEXTURE_MAX = MOBILE ? 512 : 1024;
/** 同時に読み込んでおくキャラの上限（1試合6人＋ホームの1人） */
const CACHE_MAX = MOBILE ? 7 : 12;

// 移植元リグの骨 (GLTFLoader が名前の "." を除去する) → VRM ヒューマノイド骨
const BONE_MAP: Record<string, VRMHumanBoneName> = {
  'DEF-hips': 'hips', 'DEF-spine001': 'spine', 'DEF-spine002': 'chest', 'DEF-spine003': 'upperChest',
  'DEF-neck': 'neck', 'DEF-head': 'head',
};
for (const [S, side] of [['L', 'left'], ['R', 'right']] as const) {
  const m: Record<string, string> = {
    shoulder: 'Shoulder', upper_arm: 'UpperArm', forearm: 'LowerArm', hand: 'Hand',
    thigh: 'UpperLeg', shin: 'LowerLeg', foot: 'Foot', toe: 'Toes',
    thumb01: 'ThumbMetacarpal', thumb02: 'ThumbProximal', thumb03: 'ThumbDistal',
  };
  for (const f of ['index', 'middle', 'ring']) {
    m[`f_${f}01`] = `${f[0].toUpperCase()}${f.slice(1)}Proximal`; m[`f_${f}02`] = `${f[0].toUpperCase()}${f.slice(1)}Intermediate`; m[`f_${f}03`] = `${f[0].toUpperCase()}${f.slice(1)}Distal`;
  }
  m.f_pinky01 = 'LittleProximal'; m.f_pinky02 = 'LittleIntermediate'; m.f_pinky03 = 'LittleDistal';
  for (const [k, v] of Object.entries(m)) BONE_MAP[`DEF-${k}${S}`] = `${side}${v}` as VRMHumanBoneName;
}

const heroes = new Map<string, HeroModel>();
let rig: GLTF;
/** 移植元リグの基準姿勢: 各骨のワールド回転と、その親のワールド回転 */
const rigRest = new Map<string, { world: THREE.Quaternion; parent: THREE.Quaternion; pos: THREE.Vector3 }>();
let rigHipsHeight = 1;

export interface HeroModel {
  /** シーンに置くルート。向きは rotation.y で指定する */
  root: THREE.Group;
  vrm: VRM;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  materials: THREE.Material[];
  /** 顔アイコン（data URL）。HUD やカードで使う */
  portrait: string;
  update(dt: number): void;
  /** 瞬間移動の後に呼ぶ（髪や服の揺れが暴れないように） */
  settle(): void;
}

/** リグのアニメーションを、VRM の正規化ボーン向けに変換する */
function retarget(clip: THREE.AnimationClip, vrm: VRM): THREE.AnimationClip {
  const v0 = vrm.meta?.metaVersion === '0';
  const tracks: THREE.KeyframeTrack[] = [];
  const q = new THREE.Quaternion(), inv = new THREE.Quaternion(), p = new THREE.Vector3();
  const hipsScale = (vrm.humanoid.normalizedRestPose.hips?.position?.[1] ?? 1) / rigHipsHeight;
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const bone = track.name.slice(0, dot), prop = track.name.slice(dot + 1);
    const human = BONE_MAP[bone];
    const node = human && vrm.humanoid.getNormalizedBoneNode(human);
    const rest = rigRest.get(bone);
    if (!node || !rest) continue;
    if (prop === 'quaternion') {
      const out = new Float32Array(track.values.length);
      inv.copy(rest.world).invert();
      for (let i = 0; i < out.length; i += 4) {
        q.fromArray(track.values, i).premultiply(rest.parent).multiply(inv);
        if (v0) { q.x = -q.x; q.z = -q.z; }
        q.toArray(out, i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, track.times as unknown as number[], out as unknown as number[]));
    } else if (prop === 'position' && human === 'hips') {
      const out = new Float32Array(track.values.length);
      for (let i = 0; i < out.length; i += 3) {
        p.fromArray(track.values, i).applyQuaternion(rest.parent).multiplyScalar(hipsScale);
        if (v0) { p.x = -p.x; p.z = -p.z; }
        p.toArray(out, i);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, track.times as unknown as number[], out as unknown as number[]));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function attachWeapon(vrm: VRM, name: WeaponName, color: number) {
  const w = WEAPONS[name];
  const hand = vrm.humanoid.getNormalizedBoneNode(w.hand === 'right' ? 'rightHand' : 'leftHand');
  if (!hand) return;
  // 正規化ボーンは Tポーズで回転ゼロ・ワールド軸そろい。手首から手のひら中心へずらして持たせる
  const holder = new THREE.Group();
  holder.position.set(w.hand === 'right' ? -0.075 : 0.075, -0.025, 0.01);
  const obj = w.build(color);
  if (w.hand === 'left') obj.scale.x = -1; // 左手用は左右反転
  holder.add(obj);
  if (vrm.meta?.metaVersion === '0') { holder.position.x *= -1; holder.position.z *= -1; holder.rotation.y = Math.PI; }
  hand.add(holder);
}

function buildHero(def: HeroDef, gltf: GLTF): HeroModel {
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  const materials: THREE.Material[] = [];
  vrm.scene.traverse((o) => {
    o.frustumCulled = false;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (!materials.includes(mat)) materials.push(mat);
  });
  capTextures(materials, TEXTURE_MAX);
  for (const w of def.weapons) attachWeapon(vrm, w, def.color);
  const root = new THREE.Group();
  vrm.scene.scale.setScalar(HERO_SCALE);
  root.add(vrm.scene);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of rig.animations) if (c.name !== 'A_TPose') clips.set(c.name, retarget(c, vrm));
  const mixer = new THREE.AnimationMixer(vrm.scene);
  return {
    root, vrm, mixer, clips, materials, portrait: '',
    update(dt) { mixer.update(dt); vrm.update(dt); },
    settle() { root.updateMatrixWorld(true); vrm.springBoneManager?.reset(); },
  };
}

const gltfLoader = new GLTFLoader();
const vrmLoader = new GLTFLoader();
vrmLoader.register((parser) => new VRMLoaderPlugin(parser));
// VITE_ASSET_MODE=json: バイナリを配信できないホスト向けに、base64 を入れた JSON から読み込む
const packed = import.meta.env.VITE_ASSET_MODE === 'json';
async function load(l: GLTFLoader, path: string, ext: string): Promise<GLTF> {
  if (!packed) return l.loadAsync(`${BASE}${path}.${ext}`);
  const res = await fetch(`${BASE}${path}.json`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const bin = atob((await res.json()).data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return l.parseAsync(bytes.buffer, '');
}

/** 起動時はモーション用のリグだけ読む（キャラは使うときに読む） */
export async function loadAssets(onProgress: (ratio: number) => void) {
  const g = await load(gltfLoader, 'rig', 'glb');
  rig = g;
  // 基準姿勢は Tポーズのクリップから取る（VRM の正規化ボーンも Tポーズ基準）
  const tpose = g.animations.find((a) => a.name === 'A_TPose');
  if (tpose) { const mx = new THREE.AnimationMixer(g.scene); mx.clipAction(tpose).play(); mx.update(0); }
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    const world = o.getWorldQuaternion(new THREE.Quaternion());
    const parent = o.parent ? o.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    rigRest.set(o.name, { world, parent, pos: o.getWorldPosition(new THREE.Vector3()) });
  });
  rigHipsHeight = rigRest.get('DEF-hips')!.pos.y;
  onProgress(1);
}

const loading = new Map<string, Promise<void>>();
let useTick = 0;
const lastUse = new Map<string, number>();

/** 指定したヒーローを読み込む（読み込み済みならすぐ終わる）。古いものは自動で解放する */
export async function ensureHeroes(defs: HeroDef[], onProgress?: (ratio: number) => void) {
  const want = new Set(defs.map((d) => d.id));
  for (const d of defs) lastUse.set(d.id, ++useTick);
  // 上限を超えるぶん、使っていないものから解放
  const loaded = [...heroes.keys()].filter((id) => !want.has(id)).sort((a, b) => (lastUse.get(a) ?? 0) - (lastUse.get(b) ?? 0));
  while (heroes.size + defs.filter((d) => !heroes.has(d.id)).length > CACHE_MAX && loaded.length) disposeHero(loaded.shift()!);
  let done = 0;
  const todo = defs.filter((d) => !heroes.has(d.id));
  onProgress?.(todo.length ? 0 : 1);
  await Promise.all(todo.map((d) => {
    if (!loading.has(d.id)) {
      loading.set(d.id, load(vrmLoader, `vrm/${d.model}`, 'vrm').then((g) => { heroes.set(d.id, buildHero(d, g)); }).finally(() => loading.delete(d.id)));
    }
    return loading.get(d.id)!.then(() => onProgress?.(++done / todo.length));
  }));
}

function disposeHero(id: string) {
  const m = heroes.get(id);
  if (!m) return;
  m.root.removeFromParent();
  m.mixer.stopAllAction();
  VRMUtils.deepDispose(m.root);
  heroes.delete(id);
}

export const isLoaded = (def: HeroDef) => heroes.has(def.id);

/** 顔アイコン（事前に書き出した画像） */
export const portraitOf = (def: HeroDef | string) => `${BASE}portraits/${typeof def === 'string' ? def : def.id}.webp`;

/** 開発用: 読み込んだヒーローの顔を撮って data URL で返す（scripts/render-portraits.cjs から使う） */
export async function capturePortraits(renderer: THREE.WebGLRenderer, defs: HeroDef[]) {
  const out: Record<string, string> = {};
  for (const d of defs) {
    await ensureHeroes([d]);
    renderPortraits(renderer, [d]);
    out[d.id] = heroes.get(d.id)!.portrait;
  }
  return out;
}

/** 各ヒーローの顔を撮って UI 用のアイコンにする。メインの描画コンテキストをそのまま使う
 *  （別コンテキストを作ると全テクスチャが二重に確保され、スマホでメモリ不足になる） */
function renderPortraits(r: THREE.WebGLRenderer, defs: HeroDef[]) {
  const size = 256;
  // キャンバスから直接取り出すと端末によって空になるので、オフスクリーンに描いてピクセルを読む
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1.5, 3, 4);
  scene.add(key, new THREE.AmbientLight(0xffffff, 1.1));
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  const head = new THREE.Vector3();
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
  r.setClearColor(0x000000, 0);
  for (const def of defs) {
    const m = heroes.get(def.id)!;
    const idle = m.clips.get(def.idle);
    if (idle) m.mixer.clipAction(idle).play();
    scene.add(m.root);
    m.root.rotation.y = -0.35;
    m.update(0); m.settle(); m.update(0);
    (m.vrm.humanoid.getRawBoneNode('head') ?? m.root).getWorldPosition(head);
    head.y += 0.1 * HERO_SCALE;
    cam.position.set(head.x + 0.25, head.y + 0.05, head.z + 1.55);
    cam.lookAt(head);
    r.setRenderTarget(rt);
    r.clear();
    r.render(scene, cam);
    r.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    r.setRenderTarget(null);
    // 読み出しは上下が逆なので、行を入れ替えて画像にする
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    m.portrait = canvas.toDataURL('image/webp', 0.9);
    scene.remove(m.root);
    m.mixer.stopAllAction();
    m.root.rotation.y = 0;
  }
  r.setClearColor(prevColor, prevAlpha);
  rt.dispose();
}

/** GPU メモリ節約: テクスチャを最大辺 max px に縮める（初回描画の前に行う） */
function capTextures(materials: THREE.Material[], max: number) {
  const seen = new Set<THREE.Texture>();
  const visit = (v: unknown) => {
    const t = v as THREE.Texture;
    if (!t || !t.isTexture || seen.has(t)) return;
    seen.add(t);
    const img = t.image as (ImageBitmap | HTMLImageElement) & { close?: () => void };
    if (!img || !img.width || Math.max(img.width, img.height) <= max) return;
    const k = max / Math.max(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    t.image = c; t.needsUpdate = true;
    img.close?.();
  };
  for (const m of materials) {
    for (const v of Object.values(m)) visit(v);
    const uniforms = (m as THREE.ShaderMaterial).uniforms;
    if (uniforms) for (const u of Object.values(uniforms)) visit(u?.value);
  }
}

export function heroModel(def: HeroDef): HeroModel {
  const m = heroes.get(def.id)!;
  m.mixer.stopAllAction();
  m.root.position.set(0, 0, 0);
  m.root.rotation.set(0, 0, 0);
  m.root.visible = true;
  return m;
}
