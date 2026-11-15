import * as THREE from 'three';
import { assets, type ModelKey } from './assets';
import type { Hitbox, HitInfo, HitResult, Target, Combat } from './combat';
import type { HitboxDef, PartDef } from './data';
import type { World } from './world';
import type { Player } from './player';
import type { FX } from './fx';
import { audio, type SfxKey } from './audio';

export interface Ctx {
  world: World;
  player: Player;
  combat: Combat;
  fx: FX;
  scene: THREE.Scene;
  creatures: Creature[];
  onKill(c: Creature): void;
  onPartBreak(c: Creature, p: PartState): void;
  onFlinch?(c: Creature): void;
}

export interface PartState {
  def: PartDef;
  hp: number;
  broken: boolean;
}

/** モデル・アニメ・当たり判定・部位・状態異常を持つ生物の基底 */
export abstract class Creature implements Target {
  ctx: Ctx;
  root = new THREE.Group();
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  current?: THREE.AnimationAction;
  currentName = '';
  hitboxes: Hitbox[] = [];
  parts: PartState[] = [];
  hp: number;
  maxHp: number;
  alive = true;
  center = new THREE.Vector3();
  boundR = 2;
  radius: number;
  yaw = 0;
  poisonStacks: { t: number; dps: number }[] = [];
  slowT = 0;
  aggro = false;
  deadT = 0;
  hurtAccum = 0;
  flinchCd = 0;
  removeMe = false;
  isBoss?: boolean;
  timeScale = 1;
  abstract readonly displayName: string;

  constructor(ctx: Ctx, modelKey: ModelKey, scale: number, hp: number, radius: number) {
    this.ctx = ctx;
    this.model = assets.cloneScene(modelKey);
    this.model.scale.setScalar(scale);
    // マテリアルは個体ごとに複製（被弾フラッシュ用）
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
        m.frustumCulled = false;
      }
    });
    this.root.add(this.model);
    ctx.scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of assets.clips(modelKey)) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.hp = this.maxHp = hp;
    this.radius = radius;
  }

  setupHitboxes(defs: HitboxDef[]) {
    for (const d of defs) {
      const bone = this.model.getObjectByName(d.bone);
      if (!bone) {
        console.warn('bone missing', d.bone);
        continue;
      }
      this.hitboxes.push({ def: d, bone, pos: new THREE.Vector3(), r: d.r, active: true });
    }
  }

  setupParts(defs: PartDef[] = []) {
    this.parts = defs.map((def) => ({ def, hp: def.hp, broken: false }));
  }

  part(id: string) {
    return this.parts.find((p) => p.def.id === id);
  }
  partIntact(id: string) {
    const p = this.part(id);
    return !!p && !p.broken;
  }

  play(name: string, o: { loop?: boolean; fade?: number; speed?: number; restart?: boolean } = {}) {
    const a = this.actions.get(name);
    if (!a) return undefined;
    if (this.current === a && !o.restart) {
      a.timeScale = o.speed ?? 1;
      return a;
    }
    a.reset();
    a.setLoop(o.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = o.loop === false;
    a.timeScale = o.speed ?? 1;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, o.fade ?? 0.18, false);
    a.play();
    this.current = a;
    this.currentName = name;
    return a;
  }

  /** 再生中アクションの進行度 0..1 */
  progress() {
    if (!this.current) return 1;
    return this.current.time / this.current.getClip().duration;
  }
  finished() {
    if (!this.current) return true;
    return !this.current.isRunning() || this.current.time >= this.current.getClip().duration - 1e-3;
  }

  updateCommon(dt: number) {
    this.timeScale = this.slowT > 0 ? 0.6 : 1;
    this.mixer.update(dt * this.timeScale);
    this.root.position.y = this.root.position.y;
    this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
    // 当たり判定を骨に追従
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.center.set(0, 0, 0);
    let n = 0;
    for (const hb of this.hitboxes) {
      hb.bone.getWorldPosition(hb.pos);
      if (hb.def.off) hb.pos.add(new THREE.Vector3(...hb.def.off).applyQuaternion(q));
      this.center.add(hb.pos);
      n++;
    }
    if (n) this.center.divideScalar(n);
    let br = 0;
    for (const hb of this.hitboxes) br = Math.max(br, hb.pos.distanceTo(this.center) + hb.r);
    this.boundR = br;
    // 状態異常
    if (this.alive) {
      let pd = 0;
      for (let i = this.poisonStacks.length - 1; i >= 0; i--) {
        const s = this.poisonStacks[i];
        s.t -= dt;
        pd += s.dps * dt;
        if (s.t <= 0) this.poisonStacks.splice(i, 1);
      }
      if (pd > 0) {
        this.hp -= pd;
        if (Math.random() < dt * 4) this.ctx.fx.spawn('sparkle', this.center, { vel: new THREE.Vector3(0, 1.5, 0), life: 0.6, size: 0.35, size1: 0.05, color: 0x9cff5a });
        if (this.hp <= 0) this.die();
      }
      if (this.slowT > 0) {
        this.slowT -= dt;
        if (Math.random() < dt * 3) this.ctx.fx.spawn('sparkle', this.center, { vel: new THREE.Vector3(0, -0.5, 0), life: 0.8, size: 0.4, size1: 0.1, color: 0xf0f0ff });
      }
    }
    this.flinchCd -= dt;
    this.hurtAccum = Math.max(0, this.hurtAccum - dt * this.maxHp * 0.08);
  }

  /** 被弾処理（ダメージ計算・部位・状態異常） */
  receiveHit(h: HitInfo): HitResult {
    if (!this.alive) return { dealt: 0, kind: 'immune', killed: false };
    this.aggro = true;
    const imm = this.immuneFactor();
    let dmg = h.dmg;
    let kind: HitResult['kind'] = h.kind;
    let broke: string | undefined;
    if (h.kind === 'weak') dmg *= h.weakMul;
    // 部位へのダメージ
    if (h.kind === 'part' && h.part) {
      const p = this.part(h.part);
      if (p && !p.broken) {
        p.hp -= dmg * h.partMul * (h.core === 'blast' ? 1.4 : 1);
        if (p.hp <= 0) {
          p.broken = true;
          broke = p.def.name;
          this.breakPart(p);
        }
      } else kind = 'body';
    }
    // 装甲（生きている部位による軽減）。貫牙弾は無視
    let armor = 0;
    for (const p of this.parts) if (!p.broken && p.def.armor) armor = Math.max(armor, p.def.armor);
    if (h.core === 'fang') armor = 0;
    if (h.kind !== 'weak') dmg *= 1 - armor;
    if (armor > 0 && h.kind !== 'weak' && kind !== 'part') kind = 'armor';
    dmg *= imm;
    if (imm < 0.5) kind = 'armor';
    if (h.core === 'fang') dmg *= 1.1;

    if (h.core === 'venom') {
      if (this.poisonStacks.length >= 5) this.poisonStacks.shift();
      this.poisonStacks.push({ t: 5, dps: 4 + h.dmg * 0.18 });
      if (!h.splash) audio.play('poison', { vol: 0.25, pos: h.point, rate: 1.5 });
    }
    if (h.core === 'silk') this.slowT = this.isBoss ? 3.5 : 4.5;

    this.hp -= dmg;
    this.hurtAccum += dmg;
    this.flashHit();
    let killed = false;
    if (this.hp <= 0) {
      this.die();
      killed = true;
    } else {
      this.onDamaged(dmg, h, !!broke);
    }
    return { dealt: dmg, kind, killed, broke };
  }

  /** 1 = 通常, 0.1 = 殻にこもり中など */
  immuneFactor() {
    return 1;
  }

  flashT = 0;
  flashHit() {
    this.flashT = 0.08;
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.emissive) mat.emissive.setRGB(0.6, 0.25, 0.2);
      }
    });
  }
  updateFlash(dt: number) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
          }
        });
      }
    }
  }

  breakPart(p: PartState) {
    for (const name of p.def.meshes) {
      this.model.traverse((o) => {
        if (o.name === name || o.name.startsWith(name + '_')) o.visible = false;
      });
    }
    for (const hb of this.hitboxes) if (hb.def.part === p.def.id) hb.active = false;
    audio.play('part_break', { vol: 0.9, pos: this.center });
    audio.play('armor_hit', { vol: 0.8, pos: this.center, rate: 0.7 });
    this.ctx.fx.explosion(this.center.clone(), 1.6, 0xc0d8ff);
    this.ctx.onPartBreak(this, p);
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.onDeath();
    this.ctx.onKill(this);
  }

  sfx(k: SfxKey | string, vol = 0.8, rate = 1) {
    audio.play(k as SfxKey, { vol, pos: this.center, rate });
  }

  faceTo(target: THREE.Vector3, dt: number, rate = 8) {
    const want = Math.atan2(target.x - this.root.position.x, target.z - this.root.position.z);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
    return Math.abs(d);
  }

  dispose() {
    this.ctx.scene.remove(this.root);
    this.mixer.stopAllAction();
  }

  abstract onDamaged(dmg: number, h: HitInfo, broke: boolean): void;
  abstract onDeath(): void;
  abstract update(dt: number): void;
}
