import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGltf } from '../core/gltf';
import { NPCS, type NpcDef } from '../data/npcs';
import type { Collider } from './common';
import { DOCK, onDock, terrainHeight } from './shape';

const HEIGHT = 1.55;

interface NpcActor {
  def: NpcDef;
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  current: string;
  yaw: number;
  /** 依頼の印（頭上の「！」） */
  mark: THREE.Sprite;
  bob: number;
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

/** 釣り場にいる人（Kenney Mini Characters）。待機の動き、近づくとこちらを向く */
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
        gltf = await loadGltf(`${import.meta.env.BASE_URL}assets/npc/${def.model}.json`);
      } catch (e) {
        console.warn('npc model', def.model, e);
        continue;
      }
      if (gen !== this.gen) return;
      const body = cloneSkinned(gltf.scene) as THREE.Group;
      const box = new THREE.Box3().setFromObject(body);
      body.scale.setScalar(HEIGHT / Math.max(0.01, box.max.y - box.min.y));
      body.traverse((o) => {
        o.castShadow = true;
        (o as THREE.Mesh).frustumCulled = false;
      });
      const root = new THREE.Group();
      root.add(body);
      const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markTex, depthTest: false, transparent: true }));
      mark.scale.setScalar(0.45);
      mark.position.y = HEIGHT + 0.45;
      mark.renderOrder = 10;
      root.add(mark);
      const y = onDock(def.x, def.z) ? DOCK.deckY : terrainHeight(def.x, def.z);
      root.position.set(def.x, y, def.z);
      root.rotation.y = def.yaw + Math.PI;
      this.scene.add(root);
      const mixer = gltf.animations.length ? new THREE.AnimationMixer(body) : null;
      const actions: Record<string, THREE.AnimationAction> = {};
      if (mixer) for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
      const actor: NpcActor = { def, root, mixer, actions, current: '', yaw: def.yaw, mark, bob: Math.random() * 6 };
      this.play(actor, 'idle');
      this.actors.push(actor);
    }
  }

  private play(a: NpcActor, name: string): void {
    if (a.current === name || !a.actions[name]) return;
    const next = a.actions[name];
    next.reset().fadeIn(0.25).play();
    if (a.current) a.actions[a.current]?.fadeOut(0.25);
    a.current = name;
  }

  /** うなずく（依頼を渡した時など） */
  emote(id: string, yes = true): void {
    const a = this.actors.find((x) => x.def.id === id);
    if (!a) return;
    const clip = a.actions[yes ? 'emote-yes' : 'emote-no'];
    if (!clip) return;
    clip.reset().setLoop(THREE.LoopOnce, 1).play();
    clip.clampWhenFinished = false;
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
      a.mixer?.update(dt);
      const dx = player.x - a.root.position.x;
      const dz = player.z - a.root.position.z;
      const d = Math.hypot(dx, dz);
      // 近づくとこちらを向き、離れると元の向きに戻る
      const want = d < 6 ? Math.atan2(-dx, -dz) : a.def.yaw;
      let diff = want - a.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.yaw += diff * Math.min(1, dt * 4);
      a.root.rotation.y = a.yaw + Math.PI;
      a.bob += dt * 2.2;
      a.mark.visible = marks.has(a.def.id);
      a.mark.position.y = HEIGHT + 0.45 + Math.sin(a.bob) * 0.05;
    }
  }
}
