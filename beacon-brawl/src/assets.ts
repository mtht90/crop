import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { HEROES, type HeroDef } from './heroes';

const BASE = import.meta.env.BASE_URL + 'assets/';
const PROPS = ['pillar', 'pillar_decorated', 'barrier', 'box_large', 'crates_stacked', 'barrel_large',
  'banner_shield_blue', 'banner_shield_red', 'wall', 'floor_tile_large',
  'sword_1handed', 'shield_badge', 'axe_2handed', 'staff', 'dagger', 'crossbow_2handed'] as const;
export type PropName = (typeof PROPS)[number];

/** キャラの表示倍率（VRM は実寸メートルなので、ゲーム内の縮尺に合わせて拡大） */
export const HERO_SCALE = 1.5;

// 武器の持たせ方。t / r は移植元リグの「手のスロット」から見た位置と回転
type Q = [number, number, number, number];
const Y180: Q = [0, 1, 0, 0];
export const WEAPONS = {
  sword: { prop: 'sword_1handed', hand: 'right', t: [0, 0.033, 0], r: Y180 },
  shield: { prop: 'shield_badge', hand: 'left', t: [0, 0.017, 0.156], r: [0, 0, 0, 1] },
  axe: { prop: 'axe_2handed', hand: 'right', t: [0, 0.033, 0], r: Y180 },
  staff: { prop: 'staff', hand: 'right', t: [0, 0, 0], r: Y180 },
  dagger: { prop: 'dagger', hand: 'right', t: [0, 0, 0], r: Y180 },
  daggerOff: { prop: 'dagger', hand: 'left', t: [0, 0, 0], r: [0, 0, 0, 1] },
  crossbow: { prop: 'crossbow_2handed', hand: 'right', t: [-0.105, -0.01, 0], r: [0, 0.707, 0, 0.707] },
} as const satisfies Record<string, { prop: PropName; hand: 'left' | 'right'; t: [number, number, number]; r: Q }>;
export type WeaponName = keyof typeof WEAPONS;

// 移植元リグの骨 (GLTFLoader が名前の "." を除去する) → VRM ヒューマノイド骨
const BONE_MAP: Record<string, VRMHumanBoneName> = {
  hips: 'hips', spine: 'spine', chest: 'chest', head: 'head',
  upperarml: 'leftUpperArm', lowerarml: 'leftLowerArm', wristl: 'leftHand',
  upperarmr: 'rightUpperArm', lowerarmr: 'rightLowerArm', wristr: 'rightHand',
  upperlegl: 'leftUpperLeg', lowerlegl: 'leftLowerLeg', footl: 'leftFoot', toesl: 'leftToes',
  upperlegr: 'rightUpperLeg', lowerlegr: 'rightLowerLeg', footr: 'rightFoot', toesr: 'rightToes',
};

const props = new Map<string, GLTF>();
const heroes = new Map<string, HeroModel>();
let rig: GLTF;
/** 移植元リグの基準姿勢: 各骨のワールド回転と、その親のワールド回転 */
const rigRest = new Map<string, { world: THREE.Quaternion; parent: THREE.Quaternion; pos: THREE.Vector3 }>();
let rigHipsHeight = 1;

// 3段階のトゥーン陰影（小物用）
const gradientMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

function toonify(root: THREE.Object3D) {
  const cache = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const old = m.material as THREE.MeshStandardMaterial;
    let neu = cache.get(old);
    if (!neu) {
      neu = new THREE.MeshToonMaterial({ map: old.map, color: old.color, gradientMap });
      cache.set(old, neu);
    }
    m.material = neu;
  });
}

export interface HeroModel {
  /** シーンに置くルート。向きは rotation.y で指定する */
  root: THREE.Group;
  vrm: VRM;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  materials: THREE.Material[];
  update(dt: number): void;
  /** 瞬間移動の後に呼ぶ（髪や服の揺れが暴れないように） */
  settle(): void;
}

const ARM_IN_L = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.32);
const ARM_IN_R = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.32);

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
      // 移植元は腕の短いデフォルメ体型で脇が大きく開くので、上腕を少し体側へ寄せる
      const armFix = human === 'leftUpperArm' ? ARM_IN_L : human === 'rightUpperArm' ? ARM_IN_R : null;
      for (let i = 0; i < out.length; i += 4) {
        q.fromArray(track.values, i).premultiply(rest.parent).multiply(inv);
        if (v0) { q.x = -q.x; q.z = -q.z; }
        if (armFix) q.premultiply(armFix);
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

function attachWeapon(vrm: VRM, name: WeaponName) {
  const w = WEAPONS[name];
  const side = w.hand === 'right' ? 'r' : 'l';
  const hand = vrm.humanoid.getNormalizedBoneNode(w.hand === 'right' ? 'rightHand' : 'leftHand');
  const slot = rigRest.get(`handslot${side}`), wrist = rigRest.get(`wrist${side}`);
  if (!hand || !slot || !wrist) return;
  const v0 = vrm.meta?.metaVersion === '0';
  const holder = new THREE.Group();
  // 正規化ボーンは基準姿勢で回転ゼロなので、スロットのワールド回転をそのまま使える
  holder.quaternion.copy(slot.world);
  holder.position.copy(slot.pos).sub(wrist.pos).multiplyScalar(0.5);
  if (v0) { holder.quaternion.x *= -1; holder.quaternion.z *= -1; holder.position.x *= -1; holder.position.z *= -1; }
  const s = 0.46;
  holder.scale.setScalar(s);
  const mesh = props.get(w.prop)!.scene.clone(true);
  mesh.position.fromArray(w.t);
  mesh.quaternion.fromArray(w.r);
  holder.add(mesh);
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
  for (const w of def.weapons) attachWeapon(vrm, w);
  const root = new THREE.Group();
  vrm.scene.scale.setScalar(HERO_SCALE);
  root.add(vrm.scene);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of rig.animations) clips.set(c.name, retarget(c, vrm));
  const mixer = new THREE.AnimationMixer(vrm.scene);
  return {
    root, vrm, mixer, clips, materials,
    update(dt) { mixer.update(dt); vrm.update(dt); },
    settle() { root.updateMatrixWorld(true); vrm.springBoneManager?.reset(); },
  };
}

export async function loadAssets(onProgress: (ratio: number) => void) {
  const loader = new GLTFLoader();
  const vrmLoader = new GLTFLoader();
  vrmLoader.register((parser) => new VRMLoaderPlugin(parser));
  // VITE_ASSET_MODE=json: バイナリを配信できないホスト向けに、base64 を入れた JSON から読み込む
  const packed = import.meta.env.VITE_ASSET_MODE === 'json';
  const load = async (l: GLTFLoader, path: string, ext: string): Promise<GLTF> => {
    if (!packed) return l.loadAsync(`${BASE}${path}.${ext}`);
    const res = await fetch(`${BASE}${path}.json`);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    const bin = atob((await res.json()).data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return l.parseAsync(bytes.buffer, '');
  };
  let done = 0;
  const total = HEROES.length + PROPS.length + 1;
  const tick = () => onProgress(++done / total);

  const jobs: Promise<void>[] = PROPS.map((p) => load(loader, `props/${p}`, 'glb').then((g) => { toonify(g.scene); props.set(p, g); tick(); }));
  jobs.push(load(loader, 'rig', 'glb').then((g) => {
    rig = g;
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      const world = o.getWorldQuaternion(new THREE.Quaternion());
      const parent = o.parent ? o.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
      rigRest.set(o.name, { world, parent, pos: o.getWorldPosition(new THREE.Vector3()) });
    });
    rigHipsHeight = rigRest.get('hips')!.pos.y;
    tick();
  }));
  const vrms = HEROES.map((h) => load(vrmLoader, `vrm/${h.model}`, 'vrm').then((g) => { tick(); return g; }));
  await Promise.all(jobs);
  (await Promise.all(vrms)).forEach((g, i) => heroes.set(HEROES[i].id, buildHero(HEROES[i], g)));
}

export function prop(name: PropName): THREE.Object3D {
  return props.get(name)!.scene.clone(true);
}

/** 同じ小物を大量に並べるための InstancedMesh 群を作る */
export function instancedProp(name: PropName, matrices: THREE.Matrix4[]): THREE.Group {
  const group = new THREE.Group();
  const src = props.get(name)!.scene;
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const inst = new THREE.InstancedMesh(m.geometry, m.material, matrices.length);
    const tmp = new THREE.Matrix4();
    matrices.forEach((mat, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(mat, m.matrixWorld)));
    inst.castShadow = name !== 'floor_tile_large';
    inst.receiveShadow = true;
    group.add(inst);
  });
  return group;
}

/** ヒーローのモデル。各ヒーロー1体だけ存在し、ロビーと対戦で使い回す */
export function heroModel(def: HeroDef): HeroModel {
  const m = heroes.get(def.id)!;
  m.mixer.stopAllAction();
  m.root.position.set(0, 0, 0);
  m.root.rotation.set(0, 0, 0);
  m.root.visible = true;
  return m;
}
