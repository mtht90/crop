import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { assets } from '../core/assets';
import { angleDiff, escapeHtml, rng } from '../core/util';
import type { Archetype } from '../data/customers';
import type { ItemState } from '../game/state';

const CHAR_SCALE = 0.68;
const HIDE = /Sword|Shield|Axe|Mug|Spellbook|Wand|Staff|Knife|Crossbow|Throwable/;
/** 人間の客は兜・マント・帽子を外して「街の人」らしくする */
const HUMAN_HIDE = /Knight_Helmet|Knight_Cape|Barbarian_Cape|Mage_Cape|Mage_Hat|Rogue_Cape/;
const OPTIONAL = /Helmet|Hat|Cape|Cloak|Hood$/;

export type CustomerRole = 'buyer' | 'seller';

export type CustomerState =
  | 'enter' | 'browse' | 'look' | 'toRegister' | 'queue' | 'checkout'
  | 'toCounter' | 'sellQueue' | 'waitAppraisal' | 'appraising' | 'leave' | 'gone';

/** 来店客 1 人 (見た目・移動・アニメーション・吹き出し) */
export class Customer {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  readonly pos: THREE.Vector3;
  heading = 0;
  path: THREE.Vector3[] = [];
  speed = 1.35 + rng.range(-0.15, 0.25);
  state: CustomerState = 'enter';
  stateTime = 0;
  /** 0..1。0 になると怒って帰る */
  patience = 1;
  budget: number;
  basket: ItemState[] = [];
  sellItem: ItemState | null = null;
  visits = 0;
  maxVisits: number;
  rejects = 0;
  queueIndex = -1;
  lookTarget: THREE.Vector3 | null = null;
  pendingDecision: (() => void) | null = null;
  happy = true;
  private bubble: CSS2DObject;
  private bubbleEl: HTMLDivElement;
  private bubbleTimer = 0;
  private moodEl: HTMLDivElement;
  private moodObj: CSS2DObject;
  /** 交渉中の状態 */
  negotiation: { ask: number; reserve: number; rounds: number; lastCounter: number | null } | null = null;
  haggled = false;
  /** 探し物依頼の引き取り客 */
  requestId: string | null = null;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly arch: Archetype,
    readonly role: CustomerRole,
    modelPath: string,
    spawn: THREE.Vector3,
  ) {
    this.pos = spawn.clone();
    const model = assets.instance(modelPath, { scale: CHAR_SCALE, ground: false });
    model.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      if (HIDE.test(o.name) || HUMAN_HIDE.test(o.name)) o.visible = false;
      else if (OPTIONAL.test(o.name) && rng.chance(0.45)) o.visible = false;
    });
    // 同じモデルでも少し体格差をつける
    const s = rng.range(0.93, 1.07);
    model.scale.setScalar(s);
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of assets.animations('chars/anims.glb')) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('Walking_A');
    this.budget = Math.round(rng.range(arch.budget[0], arch.budget[1]));
    this.maxVisits = rng.int(3, 7);

    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'bubble';
    this.bubble = new CSS2DObject(this.bubbleEl);
    this.bubble.position.set(0, 2.05, 0);
    this.bubble.visible = false;
    this.root.add(this.bubble);

    this.moodEl = document.createElement('div');
    this.moodEl.className = 'mood';
    this.moodEl.innerHTML = '<i></i>';
    this.moodObj = new CSS2DObject(this.moodEl);
    this.moodObj.position.set(0, 1.78, 0);
    this.moodObj.visible = false;
    this.root.add(this.moodObj);

    this.root.position.copy(this.pos);
  }

  play(name: string, fade = 0.25, once = false) {
    const a = this.actions.get(name);
    if (!a || a === this.current) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once;
    a.fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
    if (name.startsWith('Walking') || name.startsWith('Running')) a.timeScale = this.speed / 1.4;
  }

  /** 一度だけ再生してから idle に戻す */
  gesture(name: string, then = 'Idle') {
    this.play(name, 0.15, true);
    const a = this.actions.get(name);
    if (!a) return;
    const dur = a.getClip().duration;
    this.gestureTimer = dur * 0.95;
    this.gestureThen = then;
  }
  private gestureTimer = 0;
  private gestureThen = 'Idle';

  say(text: string, seconds = 3.2, kind: 'normal' | 'good' | 'bad' = 'normal') {
    if (!text) return;
    this.bubbleEl.className = `bubble ${kind}`;
    this.bubbleEl.innerHTML = escapeHtml(text);
    this.bubble.visible = true;
    this.bubbleTimer = seconds;
  }

  setMoodVisible(v: boolean) { this.moodObj.visible = v; }

  goTo(path: THREE.Vector3[] | null) {
    this.path = path ?? [];
  }

  get moving() { return this.path.length > 0; }

  update(dt: number) {
    this.stateTime += dt;
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) this.bubble.visible = false;
    }
    if (this.moodObj.visible) {
      const bar = this.moodEl.firstElementChild as HTMLElement;
      bar.style.width = `${Math.max(0, this.patience) * 100}%`;
      bar.style.background = this.patience > 0.5 ? '#6fdc7a' : this.patience > 0.25 ? '#ffc94a' : '#ff5c5c';
    }
    if (this.gestureTimer > 0) {
      this.gestureTimer -= dt;
      if (this.gestureTimer <= 0 && !this.moving) this.play(this.gestureThen);
    }
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) {
        this.path.shift();
        if (!this.path.length) this.play('Idle');
      } else {
        const want = Math.atan2(dx, dz);
        this.heading += angleDiff(this.heading, want) * Math.min(1, dt * 8);
        const step = Math.min(d, this.speed * dt * this.slow);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.play('Walking_A');
      }
    } else if (this.lookTarget) {
      const want = Math.atan2(this.lookTarget.x - this.pos.x, this.lookTarget.z - this.pos.z);
      this.heading += angleDiff(this.heading, want) * Math.min(1, dt * 6);
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    this.mixer.update(dt);
  }

  /** 他の客とぶつかりそうなときの減速率 */
  slow = 1;

  dispose() {
    this.bubbleEl.remove();
    this.moodEl.remove();
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
