import * as THREE from 'three';
import type { AudioEngine } from '../audio/audio';
import type { Input } from '../core/input';
import type { CatchRecord, SaveData } from '../core/save';
import { speciesForSpot } from '../data/species';
import { LINE_BY_ID, LURE_BY_ID, REEL_BY_ID, ROD_BY_ID, type Lure } from '../data/tackle';
import type { Conditions, Layer, Species } from '../data/types';
import { buildFishObject, type FishObject } from '../render/fishMesh';
import { activity, type GameClock } from '../sim/environment';
import { Fight, type FightOutcome } from '../sim/fight';
import { generateFish, type FishInstance } from '../sim/individual';
import { Rng } from '../sim/rng';
import { biteChancePerSecond, pickSpecies } from '../sim/spawn';
import { structureAt, waterDepth, terrainHeight } from '../world/lakeShape';
import type { Player } from '../world/player';
import { WaterEffects } from './effects';
import { RodView } from './rodView';

export type Phase = 'ready' | 'charging' | 'flying' | 'water' | 'fight' | 'landing';

interface Bite {
  species: Species;
  fish: FishInstance;
  cond: Conditions;
  nibbles: number;
  timer: number;
  /** approach = 魚影がルアーに寄ってくる / nibble = 前アタリ / take = 本アタリ */
  phase: 'approach' | 'nibble' | 'take';
  window: number;
}

export interface FishingHud {
  phase: Phase;
  charge: number;
  lureName: string;
  lureCount: number | null;
  depth: number;
  waterDepth: number;
  layer: Layer;
  distance: number;
  floatDepth: number;
  isBait: boolean;
  fight: null | {
    tension: number;
    lineTest: number;
    drag: number;
    dragMax: number;
    lineOut: number;
    capacity: number;
    stamina: number;
    slipping: boolean;
    wear: number;
    rodSide: number;
    reeling: boolean;
  };
}

export interface FishingCallbacks {
  toast(text: string, kind?: 'info' | 'good' | 'bad' | 'big'): void;
  onCatch(fish: FishInstance, species: Species, record: CatchRecord): void;
  onLost(kind: FightOutcome | 'miss'): void;
}

const FIXED = 1 / 60;
const FLOAT_STEPS = [0, 0.5, 1, 2, 3, 5];

/** 釣りモード（キャスト〜取り込み） */
export class FishingController {
  phase: Phase = 'ready';
  readonly rod: RodView;
  readonly fx: WaterEffects;
  private charge = 0;
  private castYaw = 0;
  private origin = new THREE.Vector3();
  private lure = new THREE.Vector3();
  private flightFrom = new THREE.Vector3();
  private flightTo = new THREE.Vector3();
  private flightT = 0;
  private flightDur = 1;
  private lureSpeed = 0;
  private inWaterTime = 0;
  private touchedBottom = false;
  private onLand = false;
  private spook = 0;
  private biteAcc = 0;
  private bite: Bite | null = null;
  private fight: Fight | null = null;
  private hooked: { fish: FishInstance; species: Species; cond: Conditions } | null = null;
  private fishObj: FishObject | null = null;
  private fishPos = new THREE.Vector3();
  private fixedAcc = 0;
  private rodSide = 0;
  private landT = 0;
  private jumpT = 0;
  private lastCond: Conditions | null = null;
  private time = 0;
  private rng = new Rng();
  /** 魚影（アタリ前に寄ってくる影） */
  private shadow: THREE.Mesh;
  private shadowFrom = new THREE.Vector3();
  private shadowPos = new THREE.Vector3();
  /** 水中のルアー位置を示す水面の目印 */
  private marker: THREE.Mesh;
  /** エサを巻き続けている時間（「エサは待つ」と教えるため） */
  private baitReelTime = 0;
  private reelHintShown = false;
  private input: Input | null = null;
  /** 画面の揺れ（Game がカメラに適用） */
  shake = 0;
  /** ラインが切れそうな度合い 0..1（画面の縁を赤くする） */
  danger = 0;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private save: SaveData,
    private clock: GameClock,
    private audio: AudioEngine,
    private cb: FishingCallbacks,
  ) {
    this.rod = new RodView(camera, scene);
    this.rod.setVisible(false);
    this.fx = new WaterEffects(scene);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x050a0c, transparent: true, opacity: 0, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), shadowMat);
    this.shadow.renderOrder = 3;
    this.shadow.visible = false;
    scene.add(this.shadow);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.14, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.marker.renderOrder = 3;
    this.marker.visible = false;
    scene.add(this.marker);
  }

  get lureDef(): Lure {
    return LURE_BY_ID[this.save.equip.lure];
  }

  get busy(): boolean {
    return this.phase !== 'ready';
  }

  enter(player: Player): void {
    this.origin.set(player.x, player.y, player.z);
    this.phase = 'ready';
    this.rod.setVisible(true);
    this.rod.setLureColor(this.lureDef.color);
  }

  exit(): void {
    this.reset();
    this.rod.setVisible(false);
  }

  /** ルアーを回収して待機状態に戻す */
  reset(): void {
    this.phase = 'ready';
    this.bite = null;
    this.fight = null;
    this.hooked = null;
    this.charge = 0;
    this.rod.bend = 0;
    this.rod.swing = 0;
    this.rod.lure.visible = false;
    this.rod.bobber.visible = false;
    this.shadow.visible = false;
    this.marker.visible = false;
    this.shake = 0;
    this.danger = 0;
    this.removeFish();
    this.audio.setReel(0);
    this.audio.setDrag(0);
  }

  private removeFish(): void {
    if (this.fishObj) {
      this.scene.remove(this.fishObj.group);
      this.fishObj.dispose();
      this.fishObj = null;
    }
  }

  cycleFloat(): void {
    const i = FLOAT_STEPS.indexOf(this.save.floatDepth);
    this.save.floatDepth = FLOAT_STEPS[(i + 1) % FLOAT_STEPS.length];
  }

  private conditions(layer: Layer): Conditions {
    const speed = this.lureSpeed;
    const lure = this.lureDef;
    let motion: Conditions['motion'] = speed < 0.06 ? 'still' : speed < 0.55 ? 'slow' : 'fast';
    if (lure.alive && motion === 'still') motion = 'slow';
    return {
      time: this.clock.timeBand,
      weather: this.clock.weather,
      season: this.clock.season,
      layer,
      structure: structureAt(this.lure.x, this.lure.z),
      lure: lure.category,
      motion,
    };
  }

  private layerAt(): Layer {
    const wd = waterDepth(this.lure.x, this.lure.z);
    const depth = -this.lure.y;
    if (depth < 0.6) return 'surface';
    if (wd - depth < 0.6) return 'bottom';
    return 'mid';
  }

  private hasBait(): boolean {
    const l = this.lureDef;
    return !l.pack || (this.save.owned.lures[l.id] ?? 0) > 0;
  }

  private consumeBait(): void {
    const l = this.lureDef;
    if (!l.pack) return;
    this.save.owned.lures[l.id] = Math.max(0, (this.save.owned.lures[l.id] ?? 0) - 1);
    if (this.save.owned.lures[l.id] === 0) this.cb.toast(`${l.name}を使い切った`, 'bad');
  }

  /** ラインブレイク等でルアーを失う */
  private loseLure(): void {
    const l = this.lureDef;
    if (l.pack) {
      this.consumeBait();
      return;
    }
    const n = (this.save.owned.lures[l.id] ?? 1) - 1;
    this.save.owned.lures[l.id] = Math.max(0, n);
    if (n <= 0) {
      this.cb.toast(`${l.name}をロストした…`, 'bad');
      const next = Object.entries(this.save.owned.lures).find(([, c]) => c > 0);
      if (next) this.save.equip.lure = next[0];
    }
  }

  update(dt: number, input: Input, player: Player, sensitivity: number): void {
    this.input = input;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.spook = Math.max(0, this.spook - dt * 0.25);
    const rodDef = ROD_BY_ID[this.save.equip.rod];
    const reel = REEL_BY_ID[this.save.equip.reel];
    const line = LINE_BY_ID[this.save.equip.line];
    const lure = this.lureDef;

    switch (this.phase) {
      case 'ready': {
        this.rod.swing += (0 - this.rod.swing) * Math.min(1, dt * 8);
        if (input.leftPressed && input.enabled) {
          if (!this.hasBait()) {
            this.cb.toast(`${lure.name}がありません（I でルアー/エサを変更）`, 'bad');
          } else {
            this.phase = 'charging';
            this.charge = 0;
          }
        }
        break;
      }
      case 'charging': {
        this.charge = Math.min(1.8, this.charge + dt * 0.9);
        this.rod.swing = 0.6 * Math.min(1, this.charge);
        if (!input.left) this.release(player, rodDef.cast, lure, line.capMult);
        break;
      }
      case 'flying': {
        this.flightT += dt / this.flightDur;
        const t = Math.min(1, this.flightT);
        this.lure.lerpVectors(this.flightFrom, this.flightTo, t);
        this.lure.y += Math.sin(t * Math.PI) * (this.flightFrom.distanceTo(this.flightTo) * 0.25);
        this.rod.swing += (-0.35 - this.rod.swing) * Math.min(1, dt * 10);
        if (t >= 1) this.splashDown(lure);
        break;
      }
      case 'water':
        this.updateWater(dt, input, rodDef.sensitivity, reel.speed, lure);
        break;
      case 'fight':
        this.updateFight(dt, input, sensitivity);
        break;
      case 'landing': {
        this.landT += dt;
        if (this.fishObj) {
          const target = this.camera.localToWorld(new THREE.Vector3(0.05, -0.15, -1.3));
          this.fishObj.group.position.lerp(target, Math.min(1, dt * 5));
          // lookAt で +Z（魚の体側）がカメラを向く
          this.fishObj.group.lookAt(this.camera.position);
          this.fishObj.swim.uAmp.value = 0.08;
          this.fishObj.swim.uFreq.value = 14;
        }
        if (this.landT > 1.1 && this.hooked) {
          const h = this.hooked;
          this.hooked = null;
          this.cb.onCatch(h.fish, h.species, this.record(h));
          this.reset();
        }
        break;
      }
    }

    // 振りかぶり・アワセの竿の角度は徐々に戻す（ファイト中はやや立てて構える）
    if (this.phase !== 'charging' && this.phase !== 'flying' && this.phase !== 'ready') {
      const rest = this.phase === 'fight' ? 0.12 : 0;
      this.rod.swing += (rest - this.rod.swing) * Math.min(1, dt * 5);
    }
    // 竿と糸の描画
    this.rod.update(dt);
    const tip = this.rod.tipWorld();
    if (this.phase === 'flying' || this.phase === 'water') {
      this.rod.lure.visible = true;
      this.rod.lure.position.copy(this.lure);
      const entry = this.lure.y < -0.02 ? new THREE.Vector3(this.lure.x, 0, this.lure.z) : null;
      const sag = this.phase === 'flying' ? 0.2 : this.bite?.phase === 'take' ? 0.02 : 0.25 + this.tip2lure(tip) * 0.01;
      const end = this.rod.bobber.visible ? this.rod.bobber.position : this.lure;
      this.rod.drawLine(tip, this.rod.bobber.visible ? end : this.lure, sag, this.rod.bobber.visible ? null : entry);
    } else if ((this.phase === 'fight' || this.phase === 'landing') && this.fight) {
      const sag = Math.max(0, Math.min(1.5, this.fight.slack * 0.4 + (this.fight.tension < 0.2 ? 0.3 : 0.02)));
      const entry = this.fishPos.y < -0.05 ? new THREE.Vector3(this.fishPos.x, 0, this.fishPos.z) : null;
      this.rod.drawLine(tip, this.fishPos, sag, entry);
    } else {
      // 待機中は竿先からルアーを垂らす
      const hang = tip.clone().add(new THREE.Vector3(0, -0.35, 0));
      this.rod.drawLine(tip, hang, 0, null);
      this.rod.lure.visible = true;
      this.rod.lure.position.copy(hang);
    }
    // 水中ルアーの目印と魚影
    const showMarker = this.phase === 'water' && this.lure.y < -0.1 && !this.rod.bobber.visible;
    this.marker.visible = showMarker;
    if (showMarker) {
      this.marker.position.set(this.lure.x, 0.04, this.lure.z);
      const k = 1 + 0.15 * Math.sin(this.time * 4);
      this.marker.scale.set(k, 1, k);
    }
    this.updateShadow(dt);
    this.fx.update(dt);
  }

  private updateShadow(dt: number): void {
    const b = this.bite;
    const mat = this.shadow.material as THREE.MeshBasicMaterial;
    if (!b || this.phase !== 'water') {
      mat.opacity = Math.max(0, mat.opacity - dt * 2);
      this.shadow.visible = mat.opacity > 0.01;
      return;
    }
    this.shadow.visible = true;
    const len = b.fish.length / 100;
    let target: THREE.Vector3;
    if (b.phase === 'approach') {
      const t = 1 - Math.max(0, b.timer) / b.window;
      target = this.shadowFrom.clone().lerp(this.lure, Math.min(1, t * 1.1));
      target.x += Math.sin(this.time * 3) * 0.15;
    } else {
      // 前アタリ・本アタリ中はルアーの周りでうろつく
      target = this.lure.clone().add(new THREE.Vector3(Math.sin(this.time * 5) * 0.12, 0, Math.cos(this.time * 4) * 0.12));
    }
    const prev = this.shadowPos.clone();
    this.shadowPos.lerp(target, Math.min(1, dt * 4));
    this.shadow.position.set(this.shadowPos.x, 0.03, this.shadowPos.z);
    const mv = this.shadowPos.clone().sub(prev);
    if (mv.lengthSq() > 1e-7) this.shadow.rotation.y = Math.atan2(-mv.z, mv.x);
    this.shadow.scale.set(len * 1.1, 1, len * 0.32);
    // 深いタナの魚ほど影が薄い
    const depthFade = Math.max(0.25, 1 - -this.lure.y / 6);
    mat.opacity = Math.min(0.5, mat.opacity + dt) * depthFade;
  }

  private tip2lure(tip: THREE.Vector3): number {
    return Math.hypot(tip.x - this.lure.x, tip.z - this.lure.z);
  }

  private release(player: Player, castDist: number, lure: Lure, capMult: number): void {
    const p = Math.min(1, this.charge);
    const over = Math.max(0, this.charge - 1.15);
    this.castYaw = player.yaw + (this.rng.next() - 0.5) * (0.05 + over * 0.9);
    const dist = castDist * lure.castMult * (0.2 + 0.8 * p) * (capMult > 1.2 ? 1.08 : 1) * this.rng.range(0.95, 1.05);
    const dir = new THREE.Vector3(-Math.sin(this.castYaw), 0, -Math.cos(this.castYaw));
    this.origin.set(player.x, player.y, player.z);
    this.flightFrom.copy(this.rod.tipWorld());
    this.flightTo.set(player.x + dir.x * dist, 0, player.z + dir.z * dist);
    const ground = terrainHeight(this.flightTo.x, this.flightTo.z);
    if (ground > 0) this.flightTo.y = ground;
    this.flightT = 0;
    this.flightDur = 0.5 + dist / 32;
    this.phase = 'flying';
    this.audio.cast();
    if (over > 0.2) this.cb.toast('力みすぎた！', 'info');
  }

  private tutorialTime = 0;

  /** 最初の1匹用：このルアーで釣れる身近な魚を寄せる */
  private forceTutorialBite(lure: Lure): void {
    this.tutorialTime = 0;
    const cond = this.conditions(this.layerAt());
    const list = speciesForSpot('lake').filter((s) => (s.lures[lure.category] ?? 0) > 0 && (s.rarity === 'common' || s.rarity === 'uncommon'));
    const species = list.length ? this.rng.pick(list) : speciesForSpot('lake')[0];
    const fish = generateFish(species, cond, this.rng);
    this.bite = { species, fish, cond, nibbles: 1, timer: 0, phase: 'approach', window: 1 };
    this.startApproach();
    this.tutorialBite = true;
  }

  private tutorialBite = false;

  private splashDown(lure: Lure): void {
    this.phase = 'water';
    this.baitReelTime = 0;
    this.tutorialTime = 0;
    this.inWaterTime = 0;
    this.touchedBottom = false;
    this.lureSpeed = 0;
    this.bite = null;
    this.biteAcc = 0;
    this.onLand = waterDepth(this.lure.x, this.lure.z) < 0.1;
    if (this.onLand) {
      this.cb.toast('陸に落ちた…巻いて回収しよう', 'info');
      return;
    }
    this.lure.y = 0;
    const heavy = lure.category === 'jig' ? 0.6 : lure.pack ? 0.35 : 0.3;
    this.spook = Math.max(this.spook, heavy);
    this.fx.splash(this.lure.x, this.lure.z, 0.25);
    this.audio.splash(0.3);
    const usesFloat = !!lure.pack && this.save.floatDepth > 0;
    this.rod.bobber.visible = usesFloat;
    if (usesFloat) this.rod.bobber.position.set(this.lure.x, 0, this.lure.z);
  }

  private updateWater(dt: number, input: Input, sensitivity: number, reelSpeed: number, lure: Lure): void {
    this.inWaterTime += dt;
    const reeling = input.left && input.enabled;
    const slow = input.down('ShiftLeft') || input.down('ShiftRight');
    const toOrigin = new THREE.Vector3(this.origin.x - this.lure.x, 0, this.origin.z - this.lure.z);
    const dist = toOrigin.length();
    const prev = this.lure.clone();
    const wd = waterDepth(this.lure.x, this.lure.z);
    const bottom = -wd;
    const usesFloat = this.rod.bobber.visible;
    this.audio.setReel(reeling ? (slow ? 0.4 : 1) : 0);
    this.rod.reelSpin = reeling ? (slow ? 0.5 : 1) : 0;

    if (this.onLand) {
      if (reeling) toOrigin.normalize().multiplyScalar(Math.min(dist, reelSpeed * 2 * dt));
      else toOrigin.set(0, 0, 0);
      this.lure.add(toOrigin);
      this.lure.y = Math.max(0, terrainHeight(this.lure.x, this.lure.z));
      if (dist < 3) this.reset();
      return;
    }

    // 水平方向の移動
    if (reeling && dist > 0.01) {
      const sp = reelSpeed * (slow ? 0.4 : 1);
      toOrigin.normalize().multiplyScalar(Math.min(dist, sp * dt));
      this.lure.x += toOrigin.x;
      this.lure.z += toOrigin.z;
    }
    // 右クリック：アクション（アタリ中はアワセ）
    if (input.rightPressed && input.enabled) {
      if (this.bite && this.bite.phase !== 'approach') this.hookset(sensitivity);
      else this.twitch(lure, toOrigin.clone().normalize());
    }

    // 縦方向（タナ）
    if (usesFloat) {
      const target = -Math.min(this.save.floatDepth, wd - 0.05);
      this.lure.y += Math.sign(target - this.lure.y) * Math.min(Math.abs(target - this.lure.y), Math.max(lure.sink, 0.3) * dt);
    } else if (reeling) {
      switch (lure.retrieve) {
        case 'dive':
          this.lure.y += Math.sign(-lure.dive - this.lure.y) * Math.min(Math.abs(-lure.dive - this.lure.y), 0.9 * dt);
          break;
        case 'hold':
          this.lure.y = Math.min(-0.3, this.lure.y + 0.12 * dt);
          break;
        case 'bottom':
          this.lure.y = bottom;
          break;
        case 'lift':
          this.lure.y = Math.min(0, this.lure.y + 0.45 * dt);
          break;
      }
    } else if (lure.sink > 0) {
      this.lure.y -= lure.sink * dt;
    } else {
      this.lure.y = Math.min(0, this.lure.y + 0.4 * dt);
    }
    if (this.lure.y <= bottom) {
      this.lure.y = bottom;
      if (!this.touchedBottom && !reeling && lure.sink > 0) {
        this.touchedBottom = true;
        this.cb.toast(`着底（水深 ${wd.toFixed(1)}m）`, 'info');
      }
    } else if (this.lure.y < bottom + 0.3 && lure.retrieve === 'dive' && reeling && this.rng.chance(dt * 2)) {
      this.rod.shake = 0.3;
    }
    this.lure.y = Math.min(0, this.lure.y);

    const moved = Math.hypot(this.lure.x - prev.x, this.lure.z - prev.z) / Math.max(dt, 1e-4);
    this.lureSpeed += (moved - this.lureSpeed) * Math.min(1, dt * 3);
    if (usesFloat) {
      this.rod.bobber.position.x = this.lure.x;
      this.rod.bobber.position.z = this.lure.z;
    }

    // 回収
    if (dist < 2.8 || (wd < 0.15 && reeling)) {
      this.cb.toast(this.bite ? '魚が離れた…' : '仕掛けを回収した。もう一度投げよう', 'info');
      this.reset();
      return;
    }

    // エサを巻き続けていたら教える
    if (lure.pack && reeling && !this.bite) {
      this.baitReelTime += dt;
      if (this.baitReelTime > 1.5 && !this.reelHintShown) {
        this.reelHintShown = true;
        this.cb.toast('エサは巻かずに待つと食ってくる！指を離して待ってみよう', 'big');
      }
    }

    // 最初の1匹は必ず釣れるように（エサなら数秒待つ、ルアーなら数秒巻くと寄ってくる）
    if (!this.bite && this.save.stats.caught === 0) {
      this.tutorialTime += lure.pack ? (reeling ? 0 : dt) : reeling ? dt : dt * 0.3;
      if (this.tutorialTime > 4) this.forceTutorialBite(lure);
    }

    // アタリの抽選と進行
    if (this.bite) this.updateBite(dt, reeling, sensitivity, lure);
    else if (this.inWaterTime > 0.8) {
      this.biteAcc += dt;
      while (this.biteAcc >= 0.1) {
        this.biteAcc -= 0.1;
        this.rollBite(lure);
        if (this.bite) break;
      }
    }

    // ウキの動き
    if (usesFloat) {
      const b = this.rod.bobber;
      let sink = Math.sin(this.time * 2) * 0.01;
      if (this.bite?.phase === 'nibble') sink -= this.rod.shake * 0.04;
      if (this.bite?.phase === 'take') sink = -0.12;
      b.position.y += (sink - b.position.y) * Math.min(1, dt * 12);
    }
  }

  private twitch(lure: Lure, dir: THREE.Vector3): void {
    const push = (m: number) => {
      this.lure.x += dir.x * m;
      this.lure.z += dir.z * m;
    };
    switch (lure.category) {
      case 'minnow':
        push(0.5);
        this.lure.y -= 0.15;
        break;
      case 'topwater':
      case 'frog':
        push(0.25);
        this.fx.splash(this.lure.x, this.lure.z, 0.08);
        this.audio.splash(0.1);
        break;
      case 'jig':
        push(0.3);
        this.lure.y = Math.min(0, this.lure.y + 1.2);
        break;
      case 'worm':
        push(0.3);
        this.lure.y = Math.min(0, this.lure.y + 0.4);
        break;
      default:
        push(0.2);
    }
    this.lureSpeed += 0.4;
    this.rod.swing = 0.25;
  }

  private rollBite(lure: Lure): void {
    const layer = this.layerAt();
    const cond = this.conditions(layer);
    this.lastCond = cond;
    const list = speciesForSpot('lake');
    const line = LINE_BY_ID[this.save.equip.line];
    const p = biteChancePerSecond(list, cond, {
      activity: activity(cond.time, cond.weather, cond.season),
      lineVisibility: line.visibility,
      spook: this.spook,
    });
    // 始めたばかりは釣れやすく
    const beginner = this.save.stats.caught < 3 ? 2.2 : 1.3;
    if (!this.rng.chance(p * 0.1 * beginner)) return;
    const species = pickSpecies(list, cond, this.rng);
    if (!species) return;
    const fish = generateFish(species, cond, this.rng);
    let nibbles = this.rng.int(species.nibbles[0], species.nibbles[1]);
    if (!lure.pack) nibbles = Math.min(nibbles, cond.motion === 'fast' ? 0 : 1);
    const rod = ROD_BY_ID[this.save.equip.rod];
    this.bite = {
      species,
      fish,
      cond,
      nibbles,
      timer: 0,
      phase: 'approach',
      window: species.hookWindow * rod.sensitivity * (lure.pack ? 1.3 : 1),
    };
    this.startApproach();
  }

  /** 魚影が少し離れた所から寄ってくる */
  private startApproach(): void {
    const b = this.bite!;
    const a = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(3, 6);
    this.shadowFrom.set(this.lure.x + Math.cos(a) * d, 0, this.lure.z + Math.sin(a) * d);
    this.shadowPos.copy(this.shadowFrom);
    b.phase = 'approach';
    b.timer = this.rng.range(1.2, 2.2);
    b.window = b.timer;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  /** 開発用：今のルアー位置で強制的にアタリを起こす */
  debugBite(speciesId?: string): void {
    if (this.phase !== 'water' || this.bite) return;
    const cond = this.conditions(this.layerAt());
    const list = speciesForSpot('lake');
    const species = list.find((s) => s.id === speciesId) ?? pickSpecies(list, cond, this.rng) ?? list[0];
    this.bite = { species, fish: generateFish(species, cond, this.rng), cond, nibbles: 0, timer: 0.1, phase: 'nibble', window: 3 };
    this.shadowPos.copy(this.lure);
  }

  private updateBite(dt: number, reeling: boolean, sensitivity: number, lure: Lure): void {
    const b = this.bite!;
    b.timer -= dt;
    if (b.phase === 'approach') {
      if (b.timer > 0) return;
      // 寄ってきた魚の本来のアワセ猶予に戻して前アタリへ
      const rod = ROD_BY_ID[this.save.equip.rod];
      b.window = b.species.hookWindow * rod.sensitivity * (lure.pack ? 1.3 : 1) * (this.tutorialBite ? 3 : 1);
      b.phase = 'nibble';
      this.cb.toast('魚が寄ってきた…！ まだ待って', 'info');
      b.timer = this.rng.range(0.15, 0.5);
      return;
    }
    if (b.phase === 'nibble') {
      if (b.timer > 0) return;
      if (b.nibbles > 0) {
        b.nibbles--;
        b.timer = this.rng.range(0.5, 1.3);
        this.rod.shake = 0.35 * sensitivity;
        this.audio.nibble();
        this.fx.ripple(this.lure.x, this.lure.z, 0.05);
        this.input?.vibrate(15);
        if (reeling && this.rng.chance(0.25)) {
          this.bite = null;
        }
        return;
      }
      b.phase = 'take';
      b.timer = b.window;
      this.rod.shake = 1;
      this.rod.bend = 0.6;
      this.audio.bite();
      this.cb.toast(this.input?.touch ? 'アタリ！「アワセ！」を押せ！' : 'アタリ！ 今だ、右クリックでアワセ！', 'big');
      this.fx.splash(this.lure.x, this.lure.z, 0.12);
      this.shake = 0.4;
      this.input?.vibrate([60, 40, 60]);
      // 巻いている最中の本アタリは「向こうアワセ」で掛かることがある
      if (reeling && !lure.pack && this.rng.chance(0.35)) this.startFight(true);
      return;
    }
    this.rod.shake = Math.max(this.rod.shake, 0.5);
    this.rod.bend = 0.5;
    if (b.timer <= 0) {
      this.cb.toast('見切られた…', 'bad');
      if (lure.pack && this.rng.chance(0.6)) {
        this.consumeBait();
        this.cb.toast('エサを取られた', 'info');
      }
      this.bite = null;
      this.rod.bend = 0;
      this.spook = 0.5;
    }
  }

  private hookset(sensitivity: number): void {
    const b = this.bite!;
    this.rod.swing = 0.6;
    this.audio.hookset();
    if (b.phase === 'approach' || b.phase === 'nibble') {
      this.cb.toast(b.phase === 'approach' ? '魚が驚いて逃げた…' : '早アワセ！ 魚が逃げた', 'bad');
      if (this.lureDef.pack && this.rng.chance(0.4)) this.consumeBait();
      this.bite = null;
      this.spook = 1;
      this.cb.onLost('miss');
      return;
    }
    if (this.rng.chance(Math.min(0.97, 0.86 + sensitivity * 0.05))) this.startFight(false);
    else {
      this.cb.toast('フッキング失敗…', 'bad');
      this.bite = null;
      this.spook = 0.8;
      this.cb.onLost('miss');
    }
  }

  private startFight(auto: boolean): void {
    const b = this.bite!;
    this.bite = null;
    const wd = waterDepth(this.lure.x, this.lure.z);
    const dist = Math.hypot(this.lure.x - this.origin.x, this.lure.z - this.origin.z);
    this.castYaw = Math.atan2(-(this.lure.x - this.origin.x), -(this.lure.z - this.origin.z));
    this.fight = new Fight(
      {
        species: b.species,
        weightKg: b.fish.weight / 1000,
        iv: b.fish.iv,
        rod: ROD_BY_ID[this.save.equip.rod],
        reel: REEL_BY_ID[this.save.equip.reel],
        line: LINE_BY_ID[this.save.equip.line],
        drag: this.save.drag,
        distance: dist,
        waterDepth: Math.max(0.5, wd),
        depth: -this.lure.y,
      },
      this.rng,
    );
    this.hooked = { fish: b.fish, species: b.species, cond: b.cond };
    this.phase = 'fight';
    this.rodSide = 0;
    this.fixedAcc = 0;
    this.rod.bobber.visible = false;
    this.rod.lure.visible = false;
    this.cb.toast(auto ? '向こうアワセで掛かった！' : 'フィッシュ！', 'good');
    this.tutorialBite = false;
    this.shake = 0.9;
    this.rod.shake = 1;
    this.fx.splash(this.lure.x, this.lure.z, 0.35);
    this.audio.splash(0.4);
    this.input?.vibrate([40, 30, 120]);
    this.removeFish();
    this.fishObj = buildFishObject(b.species, b.fish.colorId, b.fish.patternId);
    this.fishObj.group.scale.setScalar(b.fish.length / 100);
    this.fishObj.group.visible = false;
    this.scene.add(this.fishObj.group);
    this.fishPos.set(this.lure.x, this.lure.y, this.lure.z);
  }

  private updateFight(dt: number, input: Input, sensitivity: number): void {
    const f = this.fight!;
    const reeling = input.left && input.enabled;
    if (input.enabled) {
      if (input.freeCursor && !input.locked) this.rodSide += (Math.max(-1, Math.min(1, input.cursorX * 1.6)) - this.rodSide) * Math.min(1, dt * 8);
      else this.rodSide = Math.max(-1, Math.min(1, this.rodSide + input.mouseDX * 0.004 * sensitivity));
      if (input.wheel) {
        const reel = REEL_BY_ID[this.save.equip.reel];
        f.setDrag(f.drag - input.wheel * Math.max(0.1, reel.dragMax / 30));
        this.save.drag = f.drag;
      }
    }
    this.fixedAcc += dt;
    let jumped = false;
    let ran = false;
    while (this.fixedAcc >= FIXED && !f.outcome) {
      this.fixedAcc -= FIXED;
      f.step({ reeling, rodSide: this.rodSide }, FIXED);
      for (const e of f.events) {
        if (e === 'jump') jumped = true;
        if (e === 'run') ran = true;
        if (e === 'tug') {
          this.rod.shake = Math.max(this.rod.shake, 0.5 + f.tug * 0.5);
          input.vibrate(Math.round(18 + 30 * Math.min(1, f.tension / f.lineTest)));
        }
        if (e === 'surge') {
          this.shake = Math.max(this.shake, 0.7);
          this.rod.shake = 1;
          input.vibrate(90);
        }
        if (e === 'bolt') this.cb.toast('まだ元気だ！足元で突っ込んだ', 'info');
        if (e === 'slack') this.cb.toast('糸がたるんでいる！巻いて！', 'bad');
      }
    }
    if (ran) {
      this.rod.shake = 0.8;
      this.shake = Math.max(this.shake, 0.5);
      input.vibrate(70);
    }
    if (jumped) {
      this.jumpT = 0.9;
      this.cb.toast('エラ洗い！ 糸をたるませるな', 'info');
    }
    const tFrac = Math.min(1.2, f.tension / f.lineTest);
    this.audio.setDrag(f.dragSlipping ? 0.6 + Math.min(0.4, tFrac) : 0);
    // 重いときはリールがゆっくりになり、ギシギシ鳴る
    this.audio.setReel(reeling && !f.dragSlipping ? 0.9 * (1 - f.reelLoad * 0.75) : 0);
    this.audio.setStrain(reeling ? f.reelLoad : 0, tFrac);
    this.rod.reelSpin = reeling ? (f.dragSlipping ? 0.1 : 0.9 * (1 - f.reelLoad * 0.8)) : 0;
    const rodPower = Math.max(0.5, ROD_BY_ID[this.save.equip.rod].power);
    this.rod.bend = Math.min(1.8, f.tension / rodPower + 0.05 + f.tug * 0.25 * Math.min(1, f.pullMax / rodPower));
    this.rod.pull = Math.min(1, f.tension / rodPower) * 0.8 + f.tug * 0.2;
    this.rod.lineVibe = f.slack < 0.05 ? (0.015 + f.tug * 0.03) * Math.min(1, tFrac * 1.5) : 0;
    this.rod.side += (this.rodSide - this.rod.side) * Math.min(1, dt * 10);
    // 引きの強さに応じて画面を揺らす
    this.shake = Math.max(this.shake, f.tug * 0.35 * Math.min(1, tFrac + 0.3) + (f.dragSlipping ? 0.15 : 0));
    this.danger = Math.max(0, Math.min(1, (tFrac - 0.75) / 0.25));

    // 魚の位置
    const yaw = this.castYaw + f.lateral;
    const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const target = new THREE.Vector3(this.origin.x + dir.x * f.distance, -f.depth, this.origin.z + dir.z * f.distance);
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      const t = 1 - this.jumpT / 0.9;
      target.y = Math.sin(Math.min(1, t) * Math.PI) * (0.6 + Math.min(1, this.hooked!.fish.length / 80));
      if (this.jumpT <= 0 || (t > 0.02 && t < 0.06)) {
        this.fx.splash(target.x, target.z, 0.5 + this.hooked!.fish.length / 100);
        this.audio.splash(0.6);
      }
    }
    const prev = this.fishPos.clone();
    this.fishPos.lerp(target, Math.min(1, dt * 8));
    // 走っている魚が水面近くにいると引き波が立つ
    if (f.depth < 1 && f.behavior === 'run' && this.rng.chance(dt * 4)) this.fx.ripple(this.fishPos.x, this.fishPos.z, 0.3);
    if (this.fishObj) {
      const g = this.fishObj.group;
      g.visible = this.fishPos.y > -0.6 || f.distance < 5;
      g.position.copy(this.fishPos);
      const mv = this.fishPos.clone().sub(prev);
      if (mv.lengthSq() > 1e-6) {
        const head = Math.atan2(-mv.z, mv.x);
        g.rotation.set(0, head, this.jumpT > 0 ? Math.sin(this.time * 20) * 0.5 : 0);
      }
      this.fishObj.swim.uTime.value = this.time;
      this.fishObj.swim.uAmp.value = f.behavior === 'run' ? 0.06 : 0.035;
      this.fishObj.swim.uFreq.value = f.behavior === 'run' ? 12 : 7;
    }
    // カメラは魚の方向へゆっくり向く
    const toFish = Math.atan2(-(this.fishPos.x - this.origin.x), -(this.fishPos.z - this.origin.z));

    if (f.outcome) this.finishFight(f.outcome);
    this.cameraYawHint = toFish;
  }

  /** ファイト中、カメラが向くべき方向（Game が参照） */
  cameraYawHint: number | null = null;

  private finishFight(outcome: FightOutcome): void {
    this.audio.setDrag(0);
    this.audio.setReel(0);
    this.audio.setStrain(0, 0);
    this.rod.pull = 0;
    this.rod.lineVibe = 0;
    this.danger = 0;
    this.cameraYawHint = null;
    if (outcome === 'landed') {
      this.phase = 'landing';
      this.landT = 0;
      if (this.fishObj) this.fishObj.group.visible = true;
      this.fx.splash(this.fishPos.x, this.fishPos.z, 0.6);
      this.audio.splash(0.8);
      if (this.lureDef.pack) this.consumeBait();
      return;
    }
    const msg: Record<Exclude<FightOutcome, 'landed'>, string> = {
      lineBreak: 'ラインブレイク！ 糸を切られた…',
      spoolEmpty: '糸を全部出された…',
      hookOut: 'フックが外れた…',
    };
    this.cb.toast(msg[outcome], 'bad');
    if (outcome === 'lineBreak' || outcome === 'spoolEmpty') {
      this.audio.snap();
      this.loseLure();
    } else this.audio.miss();
    this.save.stats.lost++;
    this.cb.onLost(outcome);
    this.reset();
  }

  private record(h: { fish: FishInstance; species: Species; cond: Conditions }): CatchRecord {
    const e = this.save.equip;
    return {
      day: this.clock.day,
      clock: this.clock.label,
      time: h.cond.time,
      weather: h.cond.weather,
      season: h.cond.season,
      structure: h.cond.structure,
      layer: h.cond.layer,
      rod: e.rod,
      reel: e.reel,
      line: e.line,
      lure: e.lure,
      length: h.fish.length,
      weight: h.fish.weight,
      grade: h.fish.grade,
      colorId: h.fish.colorId,
      patternId: h.fish.patternId,
    };
  }

  /** 画面下に出す「次にやること」 */
  guide(touch: boolean): string {
    const cast = touch ? '「キャスト」' : '左クリック';
    const reel = touch ? '「巻く」' : '左クリック';
    const set = touch ? '「アワセ！」' : '右クリック';
    const lure = this.lureDef;
    switch (this.phase) {
      case 'ready':
        return `① ${cast}を長押しして力をためて、離して水面へ投げよう`;
      case 'charging':
        return 'ゲージがたまったら離す！（ためすぎると狙いがブレる）';
      case 'flying':
        return '…';
      case 'water': {
        const b = this.bite;
        if (this.onLand) return `陸に落ちた。${reel}を長押しして回収しよう`;
        if (b?.phase === 'take') return `🎣 今だ！ ${set}でアワセ！`;
        if (b?.phase === 'nibble') return '魚がつついている…まだアワセず、竿が大きく入るのを待て';
        if (b?.phase === 'approach') return '魚影が近づいてくる…そのまま';
        return lure.pack
          ? `② エサは巻かずに待とう。魚影が寄ってきて「アタリ！」が出たら ${set}`
          : `② ${reel}を長押しで巻いてルアーを泳がせよう。止めたり${touch ? '「誘う」' : '右クリック'}で動きをつけると食ってくる`;
      }
      case 'fight': {
        const f = this.fight!;
        if (f.tension > f.effectiveLineTest * 0.85) return '⚠ 切れそう！巻くのをやめて糸を出させよう';
        if (f.dragSlipping) return '魚が走って糸が出ている。無理に巻かず、竿を魚と逆に倒して耐えよう';
        if (f.slack > 0.5) return `糸がたるんでいる！${reel}で巻いて張ろう`;
        return `③ ${reel}を長押しで寄せよう。魚まであと ${Math.max(0, f.distance - 2.5).toFixed(1)} m`;
      }
      case 'landing':
        return '取り込み！';
    }
  }

  get hasBite(): boolean {
    return this.bite?.phase === 'take';
  }

  hud(): FishingHud {
    const lure = this.lureDef;
    const f = this.fight;
    const wd = waterDepth(this.lure.x, this.lure.z);
    return {
      phase: this.phase,
      charge: this.charge,
      lureName: lure.name,
      lureCount: this.save.owned.lures[lure.id] ?? 0,
      depth: Math.max(0, -this.lure.y),
      waterDepth: wd,
      layer: this.phase === 'water' ? this.layerAt() : 'surface',
      distance: Math.hypot(this.lure.x - this.origin.x, this.lure.z - this.origin.z),
      floatDepth: this.save.floatDepth,
      isBait: !!lure.pack,
      fight:
        f && this.phase === 'fight'
          ? {
              tension: f.tension,
              lineTest: f.effectiveLineTest,
              drag: f.drag,
              dragMax: REEL_BY_ID[this.save.equip.reel].dragMax,
              lineOut: f.lineOut,
              capacity: f.capacity,
              stamina: f.staminaFraction,
              slipping: f.dragSlipping,
              wear: f.wear,
              rodSide: this.rodSide,
              reeling: false,
            }
          : null,
    };
  }

  get lastConditions(): Conditions | null {
    return this.lastCond;
  }
}
