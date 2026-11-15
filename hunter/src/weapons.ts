import * as THREE from 'three';
import { assets } from './assets';
import { CORES, WEAPONS, type CoreId, type WeaponDef, type WeaponId } from './data';
import { input } from './input';
import { audio } from './audio';
import type { Player } from './player';
import type { Combat } from './combat';
import type { FX } from './fx';
import { save, quirkOf } from './save';

interface Rig {
  def: WeaponDef;
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current?: THREE.AnimationAction;
  muzzleBone?: THREE.Object3D;
  arrowMeshes: THREE.Object3D[];
}

export interface WeaponRuntime {
  id: WeaponId;
  ammo: number;
  mag: number;
  chamber?: { core: CoreId; rounds: number };
}

/** 一人称の武器（外部モデル＋外部アニメーション）と射撃ロジック */
export class Weapons {
  vScene = new THREE.Scene();
  vCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  rigs = new Map<WeaponId, Rig>();
  loadout: WeaponRuntime[] = [];
  idx = 0;
  player: Player;
  combat: Combat;
  fx: FX;
  fireT = 0;
  reloadT = 0;
  devourT = 0;
  devourCore?: CoreId;
  switchT = 0;
  charge = 0; // 弓の引き絞り
  drawing = false;
  ads = false;
  oneShotT = 0;
  swayX = 0;
  swayY = 0;
  onDevoured?: (core: CoreId) => void;
  onFire?: () => void;
  takeCore?: () => CoreId | undefined;

  constructor(player: Player, combat: Combat, fx: FX) {
    this.player = player;
    this.combat = combat;
    this.fx = fx;
    this.vScene.add(new THREE.HemisphereLight(0xe8eef8, 0x404040, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.6);
    d.position.set(0.5, 1, 0.3);
    this.vScene.add(d);
    this.vScene.add(this.vCam);
  }

  setup(ids: WeaponId[]) {
    for (const r of this.rigs.values()) this.vCam.remove(r.root);
    this.rigs.clear();
    this.loadout = ids.map((id) => {
      const mag = this.magSize(id);
      return { id, ammo: mag, mag };
    });
    for (const id of ids) this.rigs.set(id, this.buildRig(id));
    this.idx = 0;
    this.showCurrent();
  }

  magSize(id: WeaponId) {
    const lv = save.weapons[id].mods.feed;
    return Math.max(1, Math.round(WEAPONS[id].mag * (1 + lv * 0.15)));
  }

  private buildRig(id: WeaponId): Rig {
    const def = WEAPONS[id];
    const model = assets.cloneScene(def.model);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.frustumCulled = false;
        m.castShadow = false;
        if (/^Icosphere/i.test(m.name)) m.visible = false;
      }
      if ((o as THREE.Camera).isCamera) o.visible = false;
    });
    // リグの座標系：銃口が +Z。カメラ（-Z向き）に合わせて反転し、目の位置を原点に
    const root = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI;
    inner.add(model);
    model.position.set(-def.view.x, -def.view.y, -def.view.z);
    root.add(inner);
    root.visible = false;
    this.vCam.add(root);
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const c of assets.clips(def.model)) actions.set(c.name, mixer.clipAction(c));
    const arrowMeshes: THREE.Object3D[] = [];
    model.traverse((o) => {
      if (/^fleche/.test(o.name) || /^bullet/.test(o.name)) arrowMeshes.push(o);
    });
    const muzzleBone = model.getObjectByName('slide') ?? model.getObjectByName('fusil') ?? model.getObjectByName('arc') ?? undefined;
    return { def, root, model, mixer, actions, muzzleBone, arrowMeshes };
  }

  get cur() {
    return this.loadout[this.idx];
  }
  get rig() {
    return this.rigs.get(this.cur.id)!;
  }
  get def() {
    return WEAPONS[this.cur.id];
  }

  private showCurrent() {
    for (const [id, r] of this.rigs) r.root.visible = id === this.cur.id;
    this.vCam.fov = this.def.view.fov;
    this.vCam.updateProjectionMatrix();
    this.playLoop(this.def.anim.idle);
    this.switchT = 0.35;
  }

  playLoop(name: string, speed = 1, fade = 0.2) {
    const r = this.rig;
    const a = r.actions.get(name);
    if (!a) return;
    if (r.current === a && a.loop === THREE.LoopRepeat) {
      a.timeScale = speed;
      return;
    }
    a.reset().setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (r.current) a.crossFadeFrom(r.current, fade, false);
    a.play();
    r.current = a;
  }

  playOnce(name: string, speed = 1, fade = 0.06) {
    const r = this.rig;
    const a = r.actions.get(name);
    if (!a) return 0;
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (r.current && r.current !== a) a.crossFadeFrom(r.current, fade, false);
    a.play();
    r.current = a;
    const dur = a.getClip().duration / speed;
    this.oneShotT = dur;
    return dur;
  }

  // ── 改造・おまけ効果
  dmgMul(id: WeaponId) {
    return 1 + save.weapons[id].mods.power * 0.1;
  }
  reloadMul(id: WeaponId) {
    const q = quirkOf(id);
    return (1 + save.weapons[id].mods.feed * 0.12) * (q?.id === 'quick' ? 1.06 : 1);
  }
  coreRounds(id: WeaponId) {
    const q = quirkOf(id);
    return Math.round(WEAPONS[id].coreRounds * (1 + save.weapons[id].mods.gut * 0.25)) + (q?.id === 'deep' ? 1 : 0);
  }
  devourTime(id: WeaponId) {
    return 1.25 / (1 + save.weapons[id].mods.gut * 0.15);
  }

  busy() {
    return this.reloadT > 0 || this.devourT > 0 || this.switchT > 0;
  }

  update(dt: number, canAct: boolean) {
    const p = this.player;
    const def = this.def;
    const cur = this.cur;
    this.fireT -= dt;
    this.oneShotT -= dt;
    this.switchT = Math.max(0, this.switchT - dt);

    // 武器切替
    if (canAct && !this.drawing) {
      let want = -1;
      if (input.hit('Digit1')) want = 0;
      if (input.hit('Digit2')) want = 1;
      if (input.wheel !== 0 && this.loadout.length > 1) want = (this.idx + (input.wheel > 0 ? 1 : this.loadout.length - 1)) % this.loadout.length;
      if (want >= 0 && want < this.loadout.length && want !== this.idx) {
        this.idx = want;
        this.reloadT = 0;
        this.devourT = 0;
        this.charge = 0;
        this.showCurrent();
        audio.play('ui_open', { vol: 0.5 });
      }
    }

    // ADS
    this.ads = canAct && input.rmb && this.reloadT <= 0 && this.devourT <= 0;
    p.adsAmount = THREE.MathUtils.damp(p.adsAmount, this.ads || this.drawing ? 1 : 0, 12, dt);

    // 装填
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        cur.ammo = cur.mag;
        if (def.id === 'shotgun') audio.play('shotgun_pump', { vol: 0.6 });
      }
    }
    // 素材喰い
    if (this.devourT > 0) {
      this.devourT -= dt;
      if (this.devourT <= 0 && this.devourCore) {
        cur.chamber = { core: this.devourCore, rounds: this.coreRounds(cur.id) };
        audio.play('core_ready', { vol: 0.7 });
        this.fx.coreBurst(this.player.eyePos().add(this.player.forward().multiplyScalar(1)), CORES[this.devourCore].color);
        this.onDevoured?.(this.devourCore);
        this.devourCore = undefined;
      }
    }

    if (canAct && !this.busy()) {
      if (input.hit('KeyR') && cur.ammo < cur.mag && def.id !== 'bow') this.startReload();
      if (input.hit('KeyF')) this.startDevour();
    }

    // 射撃
    if (canAct && !this.busy()) {
      if (def.id === 'bow') this.updateBow(dt);
      else if (input.lmbPressed || (input.lmb && def.id === 'pistol' && false)) {
        if (this.fireT <= 0) {
          if (cur.ammo > 0) this.fire();
          else {
            audio.play('dry_fire', { vol: 0.6 });
            this.startReload();
          }
        }
      }
    } else if (def.id === 'bow' && !canAct) {
      this.drawing = false;
      this.charge = 0;
    }

    // 移動アニメ
    if (this.oneShotT <= 0 && !this.drawing) {
      const empty = cur.ammo <= 0;
      const hs = Math.hypot(p.vel.x, p.vel.z);
      if (this.reloadT > 0 || this.devourT > 0) {
        /* 装填アニメを継続 */
      } else if (p.sprinting && hs > 1) this.playLoop(empty ? def.anim.runEmpty : def.anim.run, 1);
      else if (hs > 1 && p.onGround) this.playLoop(empty ? def.anim.walkEmpty : def.anim.walk, hs / 4.5);
      else this.playLoop(empty ? def.anim.idleEmpty : def.anim.idle, 1);
    }
    const rig = this.rig;
    rig.mixer.update(dt);
    // 弓：矢が無い間は矢を隠す
    if (def.id === 'bow') for (const m of rig.arrowMeshes) m.visible = cur.ammo > 0 || this.reloadT < 0.3;

    // 視点の揺れ（スウェイ）
    this.swayX = THREE.MathUtils.damp(this.swayX, -input.mouseDX * 0.0006, 8, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, input.mouseDY * 0.0006, 8, dt);
    const ads = p.adsAmount;
    rig.root.position.set(this.swayX + (def.id === 'pistol' ? -0.05 * ads : def.id === 'shotgun' ? -0.07 * ads : 0), this.swayY - 0.02 * ads + (this.switchT > 0 ? -this.switchT * 0.8 : 0), 0.05 * ads + p.recoil * 0.04);
    rig.root.rotation.set(p.recoil * 0.12, 0, 0);
    this.vCam.fov = THREE.MathUtils.lerp(def.view.fov, def.view.fov - 8, ads);
    this.vCam.updateProjectionMatrix();
  }

  private updateBow(dt: number) {
    const cur = this.cur;
    const def = this.def;
    if (cur.ammo <= 0) {
      this.startReload();
      return;
    }
    if (input.lmbPressed && this.fireT <= 0) {
      this.drawing = true;
      this.charge = 0;
      this.playOnce(def.anim.aim!, 1);
      audio.play('bow_draw', { vol: 0.7 });
    }
    if (this.drawing) {
      this.charge = Math.min(1, this.charge + dt / 0.9);
      if (this.oneShotT <= 0) this.playLoop(def.anim.aimIdle!, 1, 0.05);
      if (!input.lmb) {
        this.drawing = false;
        this.fire(this.charge);
        this.charge = 0;
      }
    }
  }

  startReload() {
    const cur = this.cur;
    const def = this.def;
    if (this.reloadT > 0) return;
    const t = def.reloadTime / this.reloadMul(cur.id);
    this.reloadT = t;
    const clip = this.rig.actions.get(def.anim.reload);
    const dur = clip ? clip.getClip().duration : t;
    this.playOnce(def.anim.reload, dur / t);
    if (def.id === 'pistol') {
      audio.play('clip_out', { vol: 0.6 });
      setTimeout(() => audio.play('clip_in', { vol: 0.6 }), t * 600);
    } else if (def.id === 'shotgun') audio.play('shell_load', { vol: 0.6 });
  }

  startDevour() {
    if (this.devourT > 0) return;
    const core = this.takeCore?.();
    if (!core) return;
    this.devourCore = core;
    const t = this.devourTime(this.cur.id);
    this.devourT = t;
    const def = this.def;
    const clip = this.rig.actions.get(def.anim.reload);
    const dur = clip ? clip.getClip().duration : t;
    this.playOnce(def.anim.reload, (dur / t) * 0.9);
    audio.play('devour', { vol: 0.8 });
  }

  fire(charge = 1) {
    const cur = this.cur;
    const def = this.def;
    const p = this.player;
    const q = quirkOf(cur.id);
    this.fireT = def.fireInterval * (q?.id === 'swift' ? 0.95 : 1);
    cur.ammo--;
    const core = cur.chamber?.core;
    if (cur.chamber) {
      cur.chamber.rounds--;
      if (cur.chamber.rounds <= 0) cur.chamber = undefined;
    }
    const eye = p.eyePos();
    const fwd = new THREE.Vector3();
    p.camera.getWorldDirection(fwd);
    const muzzle = eye.clone().add(fwd.clone().multiplyScalar(0.8)).add(new THREE.Vector3(0, -0.12, 0)).add(new THREE.Vector3(-fwd.z, 0, fwd.x).normalize().multiplyScalar(def.id === 'bow' ? 0 : 0.12));
    const ads = p.adsAmount > 0.5;
    let spread = (ads ? def.spreadAds : def.spreadHip) * (q?.id === 'steady' ? 0.9 : 1);
    if (!p.onGround) spread *= 1.8;
    if (Math.hypot(p.vel.x, p.vel.z) > 3) spread *= 1.4;

    let pellets = def.pellets;
    let dmg = def.damage * this.dmgMul(cur.id);
    let speed = def.speed;
    if (def.id === 'bow') {
      dmg *= 0.3 + 0.7 * charge;
      speed *= 0.4 + 0.6 * charge;
    }
    if (core === 'swarm') {
      pellets = def.id === 'shotgun' ? pellets + 4 : 3;
      dmg *= def.id === 'shotgun' ? 0.85 : 0.6;
      spread = Math.max(spread, def.id === 'shotgun' ? spread * 1.2 : 3);
    }
    const weakMul = def.weakMul * (q?.id === 'crit' ? 1.06 : 1);
    const partMul = def.partMul * (q?.id === 'breaker' ? 1.08 : 1);
    // 照準点（目からのレイ上の点）へ向けて撃つ
    for (let i = 0; i < pellets; i++) {
      const d = fwd.clone();
      const sp = THREE.MathUtils.degToRad(spread);
      const r = Math.sqrt(Math.random()) * sp;
      const a = Math.random() * Math.PI * 2;
      const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, d).normalize();
      d.addScaledVector(right, Math.cos(a) * Math.tan(r)).addScaledVector(up, Math.sin(a) * Math.tan(r)).normalize();
      const visual = def.id === 'bow' ? 'arrow' : def.id === 'shotgun' ? 'pellet' : 'bullet';
      this.combat.spawn({
        owner: 'player',
        // 弾は目の位置から出し、見た目だけ銃口寄りにする（照準と一致させるため）
        pos: eye.clone().addScaledVector(d, 0.3),
        vel: d.multiplyScalar(speed),
        gravity: def.gravity,
        dmg,
        weakMul,
        partMul,
        core,
        weapon: cur.id,
        visual,
        life: def.id === 'bow' ? 4 : 1.2,
      });
    }
    // 演出
    if (def.id === 'bow') {
      this.playOnce(def.anim.fire, 1.4);
      audio.play('bow_shoot', { vol: 0.8 });
      p.recoil += 0.3;
    } else {
      this.playOnce(def.anim.fire, def.id === 'shotgun' ? 1.5 : 1.2);
      audio.play(def.id === 'shotgun' ? 'shotgun_shot' : 'pistol_shot', { vol: def.id === 'shotgun' ? 0.75 : 0.55 });
      if (def.id === 'shotgun') setTimeout(() => audio.play('shotgun_pump', { vol: 0.45 }), 380);
      this.fx.muzzle(muzzle, core ? CORES[core].color : 0xffd090, def.id === 'shotgun');
      p.recoil += def.id === 'shotgun' ? 1.6 : 0.7;
      p.pitch += def.id === 'shotgun' ? 0.03 : 0.008;
    }
    if (core) audio.play('spark_hit', { vol: 0.25, rate: 1.6 });
    this.onFire?.();
  }
}
