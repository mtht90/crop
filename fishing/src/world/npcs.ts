import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGltf } from '../core/gltf';
import { NPCS, type NpcDef } from '../data/npcs';
import type { Collider } from './common';
import { DOCK, onDock, terrainHeight } from './shape';

const HEIGHT = 1.7;

interface Rig {
  bones: Record<string, THREE.Bone>;
  /** 腕を下ろした姿勢（待機の基準） */
  rest: Map<THREE.Bone, THREE.Quaternion>;
}

interface NpcActor {
  def: NpcDef;
  root: THREE.Group;
  rig: Rig | null;
  yaw: number;
  /** 依頼の印（頭上の「！」） */
  mark: THREE.Sprite;
  bob: number;
  /** うなずき（0..1 で減衰） */
  nod: number;
  /** 頭の向き（こちらを見る） */
  look: number;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/** 骨 bone を、その子 child の方向が world 方向 dir を向くように回す（ワールド座標で計算） */
function aimBone(bone: THREE.Bone, child: THREE.Object3D, dir: THREE.Vector3): void {
  bone.updateWorldMatrix(true, true);
  const from = _v1.setFromMatrixPosition(child.matrixWorld).sub(_v2.setFromMatrixPosition(bone.matrixWorld)).normalize();
  const rot = _q.setFromUnitVectors(from, dir.clone().normalize());
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(_q2) : _q2.identity();
  const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
  // 新しいワールド回転 = rot × 今のワールド回転 → 親の回転で割ってローカルへ
  const next = rot.multiply(worldQ);
  bone.quaternion.copy(parentQ.clone().invert().multiply(next));
}

/**
 * MakeHuman の人物は腕を斜めに広げた姿勢（A ポーズ）で作られているので、
 * 読み込んだら腕を体の横に下ろし、肘を少し曲げた立ち姿にする
 */
function makeRig(body: THREE.Object3D): Rig | null {
  const bones: Record<string, THREE.Bone> = {};
  body.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
  });
  if (!bones.upperarm_l) return null;
  // 人物の座標：前が +Z、左腕が +X
  for (const side of ['l', 'r'] as const) {
    const sx = side === 'l' ? 1 : -1;
    aimBone(bones[`upperarm_${side}`], bones[`lowerarm_${side}`], new THREE.Vector3(0.13 * sx, -1, 0.02));
    aimBone(bones[`lowerarm_${side}`], bones[`hand_${side}`], new THREE.Vector3(0.05 * sx, -1, 0.28));
  }
  const rest = new Map<THREE.Bone, THREE.Quaternion>();
  for (const b of Object.values(bones)) rest.set(b, b.quaternion.clone());
  return { bones, rest };
}

function markTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(20,30,40,0.75)';
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffd25a';
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 釣り場にいる人（MakeHuman の CC0 データから作った人物）。息づかいと重心の揺れ、近づくとこちらを向いて目を合わせる */
export class NpcLayer {
  private actors: NpcActor[] = [];
  private markTex = markTexture();
  private gen = 0;

  constructor(private scene: THREE.Scene) {}

  /** 釣り場を移った時に入れ替える。障害物は colliders に足す */
  async setArea(area: string, colliders: Collider[]): Promise<void> {
    const gen = ++this.gen;
    for (const a of this.actors) this.scene.remove(a.root);
    this.actors = [];
    for (const def of NPCS.filter((n) => n.area === area)) {
      colliders.push({ x: def.x, z: def.z, r: 0.35 });
      let gltf;
      try {
        gltf = await loadGltf(`${import.meta.env.BASE_URL}assets/npc/${def.id}.json`);
      } catch (e) {
        console.warn('npc model', def.id, e);
        continue;
      }
      if (gen !== this.gen) return;
      const body = cloneSkinned(gltf.scene) as THREE.Group;
      body.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
        (o as THREE.Mesh).frustumCulled = false;
      });
      const root = new THREE.Group();
      root.add(body);
      const box = new THREE.Box3().setFromObject(body);
      const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markTex, depthTest: false, transparent: true }));
      mark.scale.setScalar(0.32);
      mark.position.y = Math.max(HEIGHT * 0.9, box.max.y) + 0.35;
      mark.renderOrder = 10;
      root.add(mark);
      const y = onDock(def.x, def.z) ? DOCK.deckY : terrainHeight(def.x, def.z);
      root.position.set(def.x, y, def.z);
      root.rotation.y = def.yaw + Math.PI;
      this.scene.add(root);
      const rig = makeRig(body);
      this.actors.push({ def, root, rig, yaw: def.yaw, mark, bob: Math.random() * 6, nod: 0, look: 0 });
    }
  }

  /** うなずく（依頼を渡した時など） */
  emote(id: string): void {
    const a = this.actors.find((x) => x.def.id === id);
    if (a) a.nod = 1;
  }

  /** 一番近い話しかけられる人（range m 以内） */
  nearest(x: number, z: number, range = 2.6): NpcDef | null {
    let best: NpcActor | null = null;
    let bd = range;
    for (const a of this.actors) {
      const d = Math.hypot(a.root.position.x - x, a.root.position.z - z);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best?.def ?? null;
  }

  /** marks = 依頼が出ている人（頭上に「！」） */
  update(dt: number, player: { x: number; z: number }, marks: Set<string>): void {
    for (const a of this.actors) {
      const dx = player.x - a.root.position.x;
      const dz = player.z - a.root.position.z;
      const d = Math.hypot(dx, dz);
      // 近づくと体ごとこちらを向き、離れると元の向きに戻る
      const want = d < 5 ? Math.atan2(-dx, -dz) : a.def.yaw;
      let diff = want - a.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.yaw += diff * Math.min(1, dt * 2.2);
      a.root.rotation.y = a.yaw + Math.PI;
      a.bob += dt;
      a.nod = Math.max(0, a.nod - dt * 1.2);
      a.mark.visible = marks.has(a.def.id);
      a.mark.position.y += Math.sin(a.bob * 2.2) * 0.0008;
      if (a.rig) this.idle(a, d < 8 ? 1 : 0, dt);
    }
  }

  /** 待機の動き：呼吸、重心の揺れ、頭の向き、うなずき */
  private idle(a: NpcActor, attend: number, dt: number): void {
    const { bones, rest } = a.rig!;
    for (const [b, q] of rest) b.quaternion.copy(q);
    const t = a.bob;
    const breath = Math.sin(t * 1.6);
    bones.spine_02?.rotateX(breath * 0.012);
    bones.spine_03?.rotateX(breath * 0.018);
    bones.clavicle_l?.rotateZ(breath * 0.01);
    bones.clavicle_r?.rotateZ(-breath * 0.01);
    // ゆっくり重心を左右に移す
    const sway = Math.sin(t * 0.45) * 0.025;
    bones.pelvis?.rotateZ(sway);
    bones.spine_01?.rotateZ(-sway * 0.8);
    bones.thigh_l?.rotateZ(-sway * 0.6);
    bones.thigh_r?.rotateZ(-sway * 0.6);
    // 話しかけられる距離では、こちらに顔を向ける（体が向き終わるまで首で補う）
    a.look += (attend - a.look) * Math.min(1, dt * 3);
    const glance = Math.sin(t * 0.3) * 0.25 * (1 - a.look);
    bones.neck_01?.rotateY(glance * 0.5);
    bones.head?.rotateY(glance * 0.5);
    bones.head?.rotateX(-0.04 * a.look + Math.sin(a.nod * Math.PI * 3) * 0.22 * a.nod);
  }
}
