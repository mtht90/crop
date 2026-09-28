import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Assets, CharacterId } from '../core/Assets';
import type { Collision } from '../world/Collision';

export type AnimName =
  | 'idle' | 'walk' | 'walk_slow' | 'walk_drunk' | 'idle_drunk' | 'angry' | 'talk_angry' | 'talk' | 'look' | 'wait'
  | 'phone' | 'read' | 'run' | 'take' | 'crouch' | 'shrug' | 'wave' | 'yawn' | 'deny' | 'scratch';

const LOOPING = new Set<AnimName>(['idle', 'walk', 'walk_slow', 'walk_drunk', 'idle_drunk', 'angry', 'talk_angry', 'talk', 'wait', 'phone', 'read', 'run', 'crouch', 'look']);

let shadowGeo: THREE.PlaneGeometry | null = null;

/**
 * A rigged Rocketbox human with animation blending, path following,
 * simple local avoidance and a speech bubble anchor.
 */
export class Character {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly gender: 'm' | 'f';
  private actions = new Map<AnimName, THREE.AnimationAction>();
  current: AnimName | null = null;
  path: THREE.Vector3[] = [];
  speed = 1.25;
  moveAnim: AnimName = 'walk';
  idleAnim: AnimName = 'idle';
  heading = 0;
  private targetHeading: number | null = null;
  bubble: { text: string; until: number; tone: 'normal' | 'angry' | 'thought' } | null = null;
  readonly head = new THREE.Object3D();
  radius = 0.28;
  stuck = 0;
  private lastPos = new THREE.Vector3();
  private oneShotUntil = 0;
  marker: 'none' | 'thief' | 'alert' = 'none';
  /** Items the character is visibly carrying. */
  readonly basket: THREE.Group;
  private handBone: THREE.Object3D | null = null;

  constructor(assets: Assets, readonly avatar: CharacterId, shadowMat: THREE.Material) {
    const gltf = assets.characters.get(avatar)!;
    this.gender = /Female/.test(avatar) ? 'f' : 'm';
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.transparent) {
          // hair / eyelash cards: alpha-test looks crisper and sorts correctly
          mat.transparent = false;
          mat.alphaTest = 0.45;
          mat.side = THREE.DoubleSide;
        }
        mat.envMapIntensity = 0.4;
        if (mat.roughnessMap && !mat.userData.remapped) {
          // Rocketbox specular maps read too glossy under IBL: lift the floor.
          mat.userData.remapped = true;
          mat.onBeforeCompile = (sh) => {
            sh.fragmentShader = sh.fragmentShader.replace(
              '#include <roughnessmap_fragment>',
              THREE.ShaderChunk.roughnessmap_fragment.replace('roughnessFactor *= texelRoughness.g;', 'roughnessFactor *= mix(0.62, 1.0, texelRoughness.g);'),
            );
          };
        }
      }
      if (o.name === 'Bip01_R_Hand' || o.name === 'Bip01 R Hand') this.handBone = o;
    });
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of assets.anims[this.gender]) {
      const a = this.mixer.clipAction(clip);
      const name = clip.name as AnimName;
      if (!LOOPING.has(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
    this.head.position.set(0, 1.95, 0);
    this.root.add(this.head);
    shadowGeo ??= new THREE.PlaneGeometry(0.9, 0.9);
    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.006;
    sh.renderOrder = -1;
    this.root.add(sh);
    this.basket = new THREE.Group();
    if (this.handBone) {
      this.handBone.add(this.basket);
    }
    this.play('idle', 0);
    // desync crowds
    this.mixer.update(Math.random() * 3);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  play(name: AnimName, fade = 0.3, timeScale = 1): void {
    if (this.current === name) return;
    const next = this.actions.get(name) ?? this.actions.get('idle')!;
    next.reset();
    next.setEffectiveTimeScale(timeScale);
    next.setEffectiveWeight(1);
    next.play();
    const prev = this.current ? this.actions.get(this.current) : null;
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
    this.current = name;
  }

  /** Play a non-looping gesture; returns its duration in seconds. */
  gesture(name: AnimName, time: number): number {
    const a = this.actions.get(name);
    if (!a) return 0;
    this.current = null;
    this.play(name, 0.25);
    const d = a.getClip().duration;
    this.oneShotUntil = time + d * 0.92;
    return d;
  }

  busy(time: number): boolean {
    return time < this.oneShotUntil;
  }

  say(text: string, time: number, seconds = 3.5, tone: 'normal' | 'angry' | 'thought' = 'normal'): void {
    this.bubble = { text, until: time + seconds, tone };
  }

  goTo(path: THREE.Vector3[] | null): boolean {
    if (!path || !path.length) return false;
    this.path = path.slice(1);
    if (!this.path.length) this.path = [path[0]];
    return true;
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  faceTowards(p: THREE.Vector3): void {
    this.targetHeading = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
  }

  faceHeading(h: number): void {
    this.targetHeading = h;
  }

  update(dt: number, time: number, others: Character[], col: Collision | null): void {
    if (this.path.length) {
      const target = this.path[0];
      const pos = this.root.position;
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const arrive = this.path.length === 1 ? 0.08 : 0.3;
      // blocked just short of the goal (someone standing there, collider): accept arrival
      const giveUp = this.stuck > 1.5 && (dist < 0.9 || this.path.length > 1);
      if (dist < arrive || giveUp) {
        this.stuck = 0;
        this.path.shift();
        if (!this.path.length) this.play(this.idleAnim);
      } else {
        const step = Math.min(dist, this.speed * dt);
        let vx = (dx / dist) * step;
        let vz = (dz / dist) * step;
        // separation from other people
        for (const o of others) {
          if (o === this) continue;
          const ox = pos.x - o.root.position.x;
          const oz = pos.z - o.root.position.z;
          const od = Math.hypot(ox, oz);
          if (od < 0.55 && od > 1e-3) {
            const push = (0.55 - od) * 1.5 * dt;
            vx += (ox / od) * push;
            vz += (oz / od) * push;
          }
        }
        pos.x += vx;
        pos.z += vz;
        if (col) col.resolve(pos, 0.2, (r) => r.nav === false || r.tag === 'glass' || r.tag === 'bound');
        this.targetHeading = Math.atan2(dx, dz);
        if (!this.busy(time)) this.play(this.moveAnim, 0.25);
        // stuck detection
        if (pos.distanceTo(this.lastPos) < this.speed * dt * 0.2) this.stuck += dt;
        else this.stuck = Math.max(0, this.stuck - dt);
        this.lastPos.copy(pos);
      }
    } else if (!this.busy(time) && this.current !== this.idleAnim && !this.holdPose) {
      this.play(this.idleAnim);
    }
    if (this.targetHeading != null) {
      let d = this.targetHeading - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 8);
      this.root.rotation.y = this.heading;
    }
    this.mixer.update(dt);
    if (this.bubble && time > this.bubble.until) this.bubble = null;
  }

  /** When true, the idle override is suspended (e.g. reading, phone). */
  holdPose = false;

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
