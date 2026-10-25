import * as THREE from 'three';
import type { AudioEngine } from '../audio/audio';
import type { Input } from '../core/input';
import type { CatchRecord, SaveData } from '../core/save';
import { speciesForSpot } from '../data/species';
import { LINE_BY_ID, LURE_BY_ID, REEL_BY_ID, ROD_BY_ID, type Lure } from '../data/tackle';
import type { Conditions, Layer, Species } from '../data/types';
import { buildFishObject, type FishObject } from '../render/fishMesh';
import { activity, type GameClock } from '../sim/environment';
import { Fight, PUMP_LENGTH, type FightOutcome } from '../sim/fight';
import { generateFish, type FishInstance } from '../sim/individual';
import { Rng } from '../sim/rng';
import { biteChancePerSecond, pickSpecies } from '../sim/spawn';
import { structureAt, waterDepth, terrainHeight } from '../world/lakeShape';
import type { Player } from '../world/player';
import { WaterEffects } from './effects';
import { RodView } from './rodView';

/**
 * ready   = 構え（PCは視点を動かして狙う）
 * aiming  = 引っぱって飛距離・方向を決める（スリングショット）
 * flying  = 仕掛けが飛んでいる
 * water   = 水中（待つ・巻く・竿で誘う・アワセ）
 * fight   = やり取り（ポンピング・竿さばき・ドラグ）
 * net     = タモ入れ
 * landing = 取り込み演出
 */
export type Phase = 'ready' | 'aiming' | 'flying' | 'water' | 'fight' | 'net' | 'landing';

interface Bite {
  species: Species;
  fish: FishInstance;
  cond: Conditions;
  nibbles: number;
  timer: number;
  /** approach = 魚影が寄る(エサ) / chase = ルアーを追う / nibble = 前アタリ / take = 本アタリ */
  phase: 'approach' | 'chase' | 'nibble' | 'take';
  window: number;
  /** ルアーを追う魚のやる気 0..1（1で食う、0で見切る） */
  interest: number;
}

interface HotSpot {
  pos: THREE.Vector3;
  life: number;
  next: number;
}

export interface FishingHud {
  phase: Phase;
  lureName: string;
  lureCount: number | null;
  depth: number;
  waterDepth: number;
  layer: Layer;
  distance: number;
  floatDepth: number;
  isBait: boolean;
  rodLift: number;
  rodHigh: boolean;
  slack: number;
  chase: number | null;
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
    distance: number;
    jumping: boolean;
  };
}

export interface FishingCallbacks {
  toast(text: string, kind?: 'info' | 'good' | 'bad' | 'big'): void;
  onCatch(fish: FishInstance, species: Species, record: CatchRecord): void;
  onLost(kind: FightOutcome | 'miss'): void;
}

const FIXED = 1 / 60;
const FLOAT_STEPS = [0, 0.5, 1, 2, 3, 5];
/** 竿を振り上げた速さ（1秒あたりの角度変化）がこれを超えたらアワセ・誘いとみなす */
const FLICK = 2.0;
/** 引っぱり量 1 を超えて引きすぎると狙いがブレる */
const OVER_PULL = 1.12;

/** 釣りモード（キャスト〜取り込み） */
export class FishingController {
  phase: Phase = 'ready';
  readonly rod: RodView;
  readonly fx: WaterEffects;
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
  private landT = 0;
  private jumpT = 0;
  private lastCond: Conditions | null = null;
  private time = 0;
  private rng = new Rng();
  private input: Input | null = null;

  // 竿の操作（PC：マウス上下で竿を立てる/寝かせる・左右で倒す。スマホ：画面ドラッグ）
  private rodLift = 0.55;
  private rodSide = 0;
  private liftVel = 0;
  /** 竿を寝かせて出た糸ふけ（m）。巻くか竿を立てると取れる */
  private lineSlack = 0;

  // キャストの狙い
  private aimPower = 0;
  private aimYaw = 0;

  // ナブラ（水面がざわつく好ポイント）
  private hotspots: HotSpot[] = [];

  // ルアーの誘い
  private stillTime = 0;
  private lastTwitch = -10;

  // タモ入れ

  private shadow: THREE.Mesh;
  private shadowFrom = new THREE.Vector3();
  private shadowPos = new THREE.Vector3();
  private marker: THREE.Mesh;
  private tutorialTime = 0;
  private tutorialBite = false;

  /** 画面の揺れ（Game がカメラに適用） */
  shake = 0;
  /** ラインが切れそうな度合い 0..1（画面の縁を赤くする） */
  danger = 0;
  /** カメラが向くべき方向（Game が参照） */
  cameraYawHint: number | null = null;

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
    const flat = (inner: number, outer: number, color: number, opacity: number) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false }),
      );
      m.renderOrder = 10;
      m.visible = false;
      scene.add(m);
      return m;
    };
    this.marker = flat(0.1, 0.14, 0xfff4d0, 0.6);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x050a0c, transparent: true, opacity: 0, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), shadowMat);
    this.shadow.renderOrder = 3;
    this.shadow.visible = false;
    scene.add(this.shadow);
  }

  /** 慣れるまでの短い助言（2匹釣った後は出さない） */
  private tip(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    if (this.save.stats.caught < 2) this.cb.toast(text, kind);
  }

  get lureDef(): Lure {
    return LURE_BY_ID[this.save.equip.lure];
  }

  get busy(): boolean {
    return this.phase !== 'ready';
  }

  get hasBite(): boolean {
    return this.bite?.phase === 'take';
  }

  get lastConditions(): Conditions | null {
    return this.lastCond;
  }

  enter(player: Player): void {
    this.origin.set(player.x, player.y, player.z);
    this.phase = 'ready';
    this.rod.setVisible(true);
    this.rod.setLureColor(this.lureDef.color);
    this.hotspots = [];
  }

  exit(): void {
    this.reset();
    this.rod.setVisible(false);
    this.hotspots = [];
  }

  /** ルアーを回収して構えに戻す */
  reset(): void {
    this.phase = 'ready';
    this.bite = null;
    this.fight = null;
    this.hooked = null;
    this.aimPower = 0;
    this.lineSlack = 0;
    this.rod.bend = 0;
    this.rod.swing = 0;
    this.rod.pull = 0;
    this.rod.lineVibe = 0;
    this.rod.lure.visible = false;
    this.rod.bobber.visible = false;
    this.shadow.visible = false;
    this.marker.visible = false;
    this.shake = 0;
    this.danger = 0;
    this.cameraYawHint = null;
    this.removeFish();
    this.audio.setReel(0);
    this.audio.setDrag(0);
    this.audio.setStrain(0, 0);
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

  /** 竿の操作を読む（PC：マウス、スマホ：ドラッグ、カーソル操作：カーソル位置） */
  private readRod(input: Input, dt: number, sens: number): void {
    const prev = this.rodLift;
    if (!input.enabled) return;
    if (input.freeCursor && !input.locked) {
      const tl = Math.max(0, Math.min(1, 0.5 - input.cursorY * 0.9));
      const ts = Math.max(-1, Math.min(1, input.cursorX * 1.6));
      this.rodLift += (tl - this.rodLift) * Math.min(1, dt * 14);
      this.rodSide += (ts - this.rodSide) * Math.min(1, dt * 10);
    } else {
      this.rodLift = Math.max(0, Math.min(1, this.rodLift - input.mouseDY * 0.0032 * sens));
      this.rodSide = Math.max(-1, Math.min(1, this.rodSide + input.mouseDX * 0.004 * sens));
    }
    const v = (this.rodLift - prev) / Math.max(dt, 1e-4);
    // 速い振り上げを取りこぼさないよう、上向きは即座に、下向きはなめらかに追う
    this.liftVel = v > this.liftVel ? v : this.liftVel + (v - this.liftVel) * Math.min(1, dt * 12);
  }

  update(dt: number, input: Input, player: Player, sensitivity: number): void {
    this.input = input;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.spook = Math.max(0, this.spook - dt * 0.25);
    const rodDef = ROD_BY_ID[this.save.equip.rod];
    const lure = this.lureDef;
    const hold = (input.left || input.touchDown) && input.enabled;

    if (this.phase !== 'ready' && this.phase !== 'aiming' && this.phase !== 'landing') this.readRod(input, dt, sensitivity);

    switch (this.phase) {
      case 'ready': {
        this.rod.swing += (0 - this.rod.swing) * Math.min(1, dt * 8);
        this.rodLift += (0.55 - this.rodLift) * Math.min(1, dt * 4);
        if ((input.leftPressed || input.touchPressed) && input.enabled) {
          if (!this.hasBait()) this.cb.toast(`${lure.name}がありません（道具でルアー/エサを変更）`, 'bad');
          else {
            this.phase = 'aiming';
            this.aimPower = 0;
            this.aimYaw = player.yaw;
          }
        }
        break;
      }
      case 'aiming': {
        // 下へ引くほど遠くへ、左右で方向を決める
        if (input.enabled) {
          if (input.freeCursor && !input.locked) {
            this.aimPower = Math.max(0, Math.min(1.4, (input.cursorY + 0.2) * 1.2));
            this.aimYaw -= input.cursorX * dt * 1.2;
          } else {
            this.aimPower = Math.max(0, Math.min(1.4, this.aimPower + input.mouseDY * 0.0035 * sensitivity));
            this.aimYaw -= input.mouseDX * 0.0025 * sensitivity;
          }
        }
        player.yaw = this.aimYaw;
        // 竿を後ろへ振りかぶる（引いた分だけ遠くへ飛ぶ）
        this.rod.swing = 0.9 * Math.min(1.2, this.aimPower);
        if (!hold) {
          if (this.aimPower < 0.08) {
            // ほとんど引いていなければキャンセル
            this.phase = 'ready';
          } else this.release(player, rodDef.cast, lure);
        }
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
        this.updateWater(dt, input, rodDef.sensitivity, lure);
        break;
      case 'fight':
        this.updateFight(dt, input);
        break;
      case 'net':
        this.updateNet(dt, input);
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

    if (this.phase !== 'aiming' && this.phase !== 'flying' && this.phase !== 'ready') {
      this.rod.swing += (0 - this.rod.swing) * Math.min(1, dt * 5);
    }
    this.updateHotspots(dt);

    // 竿と糸の描画
    this.rod.lift = this.rodLift;
    this.rod.side += ((this.phase === 'fight' || this.phase === 'water' ? this.rodSide : 0) - this.rod.side) * Math.min(1, dt * 10);
    this.rod.update(dt);
    const tip = this.rod.tipWorld();
    if (this.phase === 'flying' || this.phase === 'water') {
      this.rod.lure.visible = true;
      this.rod.lure.position.copy(this.lure);
      const entry = this.lure.y < -0.02 ? new THREE.Vector3(this.lure.x, 0, this.lure.z) : null;
      const sag = this.phase === 'flying' ? 0.2 : this.bite?.phase === 'take' ? 0.02 : 0.15 + this.lineSlack * 0.35;
      const end = this.rod.bobber.visible ? this.rod.bobber.position : this.lure;
      this.rod.drawLine(tip, end, sag, this.rod.bobber.visible ? null : entry);
    } else if ((this.phase === 'fight' || this.phase === 'net' || this.phase === 'landing') && this.fight) {
      const sag = Math.max(0, Math.min(1.5, this.fight.slack * 0.4 + (this.fight.tension < 0.2 ? 0.3 : 0.02)));
      const entry = this.fishPos.y < -0.05 ? new THREE.Vector3(this.fishPos.x, 0, this.fishPos.z) : null;
      this.rod.drawLine(tip, this.fishPos, sag, entry);
    } else {
      const hang = tip.clone().add(new THREE.Vector3(0, -0.35, 0));
      this.rod.drawLine(tip, hang, 0, null);
      this.rod.lure.visible = true;
      this.rod.lure.position.copy(hang);
    }
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

  // ---------------- キャスト ----------------

  private castDistance(castDist: number, lure: Lure): number {
    const line = LINE_BY_ID[this.save.equip.line];
    return castDist * lure.castMult * (0.12 + 0.88 * Math.min(1, this.aimPower)) * (line.capMult > 1.2 ? 1.08 : 1);
  }

  private errorRadius(): number {
    return 0.7 + Math.max(0, this.aimPower - OVER_PULL) * 30;
  }

  private release(player: Player, castDist: number, lure: Lure): void {
    const d = this.castDistance(castDist, lure);
    const er = this.errorRadius();
    const a = this.rng.range(0, Math.PI * 2);
    const e = Math.sqrt(this.rng.next()) * er;
    this.castYaw = this.aimYaw;
    this.origin.set(player.x, player.y, player.z);
    this.flightFrom.copy(this.rod.tipWorld());
    this.flightTo.set(player.x - Math.sin(this.aimYaw) * d + Math.cos(a) * e, 0, player.z - Math.cos(this.aimYaw) * d + Math.sin(a) * e);
    const ground = terrainHeight(this.flightTo.x, this.flightTo.z);
    if (ground > 0) this.flightTo.y = ground;
    this.flightT = 0;
    this.flightDur = 0.5 + d / 32;
    this.phase = 'flying';
    this.audio.cast();

  }

  private splashDown(lure: Lure): void {
    this.phase = 'water';
    this.tutorialTime = 0;
    this.inWaterTime = 0;
    this.touchedBottom = false;
    this.lureSpeed = 0;
    this.stillTime = 0;
    this.lineSlack = 0.5;
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
    if (this.nearHotspot(this.lure, 2.5)) this.spook = 0;
    this.fx.splash(this.lure.x, this.lure.z, 0.25);
    this.audio.splash(0.3);
    const usesFloat = !!lure.pack && this.save.floatDepth > 0;
    this.rod.bobber.visible = usesFloat;
    if (usesFloat) this.rod.bobber.position.set(this.lure.x, 0, this.lure.z);
  }

  // ---------------- ナブラ（好ポイント） ----------------

  private nearHotspot(p: THREE.Vector3, r: number): boolean {
    return this.hotspots.some((h) => Math.hypot(h.pos.x - p.x, h.pos.z - p.z) < r);
  }

  private updateHotspots(dt: number): void {
    if (this.phase === 'landing') return;
    const maxD = ROD_BY_ID[this.save.equip.rod].cast * this.lureDef.castMult * 0.95;
    while (this.hotspots.length < 2) {
      // 正面 ±70° のキャストが届く範囲の水面に出す
      for (let i = 0; i < 20; i++) {
        const yaw = this.aimYaw + this.rng.range(-1.2, 1.2);
        const d = this.rng.range(8, Math.max(10, maxD));
        const p = new THREE.Vector3(this.origin.x - Math.sin(yaw) * d, 0, this.origin.z - Math.cos(yaw) * d);
        if (waterDepth(p.x, p.z) < 1) continue;
        this.hotspots.push({ pos: p, life: this.rng.range(25, 45), next: 0 });
        break;
      }
      if (this.hotspots.length < 2) break;
    }
    for (const h of this.hotspots) {
      h.life -= dt;
      h.next -= dt;
      if (h.next <= 0) {
        h.next = this.rng.range(1.2, 3.5);
        const jx = this.rng.range(-1.5, 1.5);
        const jz = this.rng.range(-1.5, 1.5);
        this.fx.ripple(h.pos.x + jx, h.pos.z + jz, this.rng.range(0.05, 0.15));
        if (this.rng.chance(0.3)) this.fx.splash(h.pos.x + jx, h.pos.z + jz, 0.04);
      }
    }
    this.hotspots = this.hotspots.filter((h) => h.life > 0);

  }

  // ---------------- 水中 ----------------

  private updateWater(dt: number, input: Input, sensitivity: number, lure: Lure): void {
    this.inWaterTime += dt;
    const reel = REEL_BY_ID[this.save.equip.reel];
    const reeling = input.left && input.enabled;
    const slow = input.down('ShiftLeft') || input.down('ShiftRight');
    const toOrigin = new THREE.Vector3(this.origin.x - this.lure.x, 0, this.origin.z - this.lure.z);
    const dist = toOrigin.length();
    const dir = toOrigin.clone().normalize();
    const prev = this.lure.clone();
    const wd = waterDepth(this.lure.x, this.lure.z);
    const bottom = -wd;
    const usesFloat = this.rod.bobber.visible;
    this.audio.setReel(reeling ? (slow ? 0.4 : 1) : 0);
    this.rod.reelSpin = reeling ? (slow ? 0.5 : 1) : 0;
    this.cameraYawHint = Math.atan2(-(this.lure.x - this.origin.x), -(this.lure.z - this.origin.z));

    if (this.onLand) {
      if (reeling) this.lure.addScaledVector(dir, Math.min(dist, reel.speed * 2 * dt));
      this.lure.y = Math.max(0, terrainHeight(this.lure.x, this.lure.z));
      if (dist < 3) this.reset();
      return;
    }

    // 竿の上下：寝かせると糸ふけが出る。立てると糸ふけを取り、取りきったらルアーを引く
    const dLift = this.rodLift - (this.prevLift ?? this.rodLift);
    this.prevLift = this.rodLift;
    let pullLen = 0;
    if (dLift < 0) this.lineSlack = Math.min(6, this.lineSlack - dLift * PUMP_LENGTH);
    else if (dLift > 0) {
      const take = Math.min(this.lineSlack, dLift * PUMP_LENGTH);
      this.lineSlack -= take;
      pullLen += dLift * PUMP_LENGTH - take;
    }
    // リール：まず糸ふけを巻き取り、張ったらルアーが動く
    if (reeling) {
      let wind = reel.speed * (slow ? 0.4 : 1) * dt;
      const take = Math.min(this.lineSlack, wind * 1.5);
      this.lineSlack -= take;
      wind -= take / 1.5;
      pullLen += wind;
    }
    if (pullLen > 0 && dist > 0.01) this.lure.addScaledVector(dir, Math.min(dist, pullLen * 0.85));

    // 竿をすばやくあおる＝誘い（ルアーが跳ねる）。アタリ中ならアワセ
    const flickSpeed = this.liftVel;
    const flick = flickSpeed > FLICK && this.lineSlack < 1.5;
    const rightClick = input.rightPressed && input.enabled;
    if (flick || rightClick) {
      this.liftVel = 0;
      if (this.bite?.phase === 'take' || this.bite?.phase === 'nibble' || (this.bite?.phase === 'approach' && lure.pack)) {
        // 右クリックは「軽いアワセ」扱い（振り上げた方がしっかり掛かる）
        this.hookset(sensitivity, flick ? flickSpeed : 2.6);
      } else if (flick || !lure.pack) this.twitch(lure, dir);
    }

    // 縦方向（タナ）
    const moving = pullLen > 0;
    if (usesFloat) {
      const target = -Math.min(this.save.floatDepth, wd - 0.05);
      this.lure.y += Math.sign(target - this.lure.y) * Math.min(Math.abs(target - this.lure.y), Math.max(lure.sink, 0.3) * dt);
    } else if (moving) {
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
      if (!this.touchedBottom && !moving && lure.sink > 0) {
        this.touchedBottom = true;
        this.cb.toast(`着底（水深 ${wd.toFixed(1)}m）`, 'info');
      }
    }
    this.lure.y = Math.min(0, this.lure.y);

    const moved = Math.hypot(this.lure.x - prev.x, this.lure.z - prev.z) / Math.max(dt, 1e-4);
    this.lureSpeed += (moved - this.lureSpeed) * Math.min(1, dt * 3);
    this.stillTime = this.lureSpeed < 0.05 ? this.stillTime + dt : 0;
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

    // 最初の1匹は必ず釣れるように（エサなら待つ、ルアーなら誘うと寄ってくる）
    if (!this.bite && this.save.stats.caught === 0) {
      this.tutorialTime += lure.pack ? (this.lureSpeed < 0.05 ? dt : 0) : this.lureSpeed > 0.05 ? dt : 0;
      if (this.tutorialTime > 4) this.forceTutorialBite(lure);
    }

    if (this.bite) this.updateBite(dt, lure);
    else if (this.inWaterTime > 0.8) {
      this.biteAcc += dt;
      while (this.biteAcc >= 0.1) {
        this.biteAcc -= 0.1;
        this.rollBite(lure);
        if (this.bite) break;
      }
    }

    if (usesFloat) {
      const b = this.rod.bobber;
      let sink = Math.sin(this.time * 2) * 0.01;
      if (this.bite?.phase === 'nibble') sink -= this.rod.shake * 0.04;
      if (this.bite?.phase === 'take') sink = -0.12;
      b.position.y += (sink - b.position.y) * Math.min(1, dt * 12);
    }
  }

  private prevLift: number | null = null;

  private twitch(lure: Lure, dir: THREE.Vector3): void {
    const push = (m: number) => this.lure.addScaledVector(dir, m);
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
    // 止めてからの誘い（ストップ＆ゴー）は追ってくる魚に効く
    const b = this.bite;
    if (b?.phase === 'chase') {
      const paused = this.stillTime > 0.3 && this.stillTime < 2;
      b.interest += paused ? 0.4 : 0.12;
    }
    this.stillTime = 0;
    this.lastTwitch = this.time;
  }

  private rollBite(lure: Lure): void {
    const layer = this.layerAt();
    const cond = this.conditions(layer);
    this.lastCond = cond;
    // ルアーは動かしていないと見向きもされない
    if (!lure.pack && this.lureSpeed < 0.05 && this.time - this.lastTwitch > 2) return;
    const list = speciesForSpot('lake');
    const line = LINE_BY_ID[this.save.equip.line];
    const p = biteChancePerSecond(list, cond, {
      activity: activity(cond.time, cond.weather, cond.season),
      lineVisibility: line.visibility,
      spook: this.spook,
    });
    const hot = this.nearHotspot(this.lure, 5) ? 1.8 : 1;
    if (!this.rng.chance(p * 0.1 * hot)) return;
    const species = pickSpecies(list, cond, this.rng);
    if (!species) return;
    const fish = generateFish(species, cond, this.rng);
    const nibbles = lure.pack ? this.rng.int(species.nibbles[0], species.nibbles[1]) : 0;
    this.bite = { species, fish, cond, nibbles, timer: 0, phase: 'approach', window: 1, interest: 0.4 };
    this.startApproach(lure);
  }

  /** 最初の1匹用：このルアーで釣れる身近な魚を寄せる */
  private forceTutorialBite(lure: Lure): void {
    this.tutorialTime = 0;
    const cond = this.conditions(this.layerAt());
    const list = speciesForSpot('lake').filter((s) => (s.lures[lure.category] ?? 0) > 0 && (s.rarity === 'common' || s.rarity === 'uncommon'));
    const species = list.length ? this.rng.pick(list) : speciesForSpot('lake')[0];
    this.bite = { species, fish: generateFish(species, cond, this.rng), cond, nibbles: 0, timer: 0, phase: 'approach', window: 1, interest: 0.7 };
    this.startApproach(lure);
    this.tutorialBite = true;
  }

  private startApproach(lure: Lure): void {
    const b = this.bite!;
    const a = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(3, 6);
    this.shadowFrom.set(this.lure.x + Math.cos(a) * d, 0, this.lure.z + Math.sin(a) * d);
    this.shadowPos.copy(this.shadowFrom);
    b.timer = this.rng.range(1.2, 2.2);
    b.window = b.timer;
    // ルアーには後ろから追ってくる
    b.phase = lure.pack ? 'approach' : 'chase';
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  /** 開発用：今のルアー位置で強制的にアタリを起こす */
  debugBite(speciesId?: string): void {
    if (this.phase !== 'water' || this.bite) return;
    const cond = this.conditions(this.layerAt());
    const list = speciesForSpot('lake');
    const species = list.find((s) => s.id === speciesId) ?? pickSpecies(list, cond, this.rng) ?? list[0];
    this.bite = { species, fish: generateFish(species, cond, this.rng), cond, nibbles: 0, timer: 0.1, phase: 'nibble', window: 3, interest: 1 };
    this.shadowPos.copy(this.lure);
  }

  private startTake(b: Bite, lure: Lure): void {
    b.phase = 'take';
    const rod = ROD_BY_ID[this.save.equip.rod];
    // ルアーへの食いつきは一瞬、エサはやや長い。最初の1匹だけは長めに待つ
    const base = b.species.hookWindow * rod.sensitivity * (lure.pack ? 1.4 : 1.1);
    b.timer = this.tutorialBite ? 2.5 : Math.max(0.6, base);
    b.window = b.timer;
    this.rod.shake = 1;
    this.rod.bend = 0.6;
    this.audio.bite();
    if (this.save.stats.caught < 2) this.cb.toast(this.input?.touch ? 'アタリ — 上にスワイプして合わせる' : 'アタリ — マウスを上に振って合わせる', 'info');
    this.fx.splash(this.lure.x, this.lure.z, lure.pack ? 0.12 : 0.3);
    this.shake = 0.4;
    this.input?.vibrate([60, 40, 60]);
  }

  private updateBite(dt: number, lure: Lure): void {
    const b = this.bite!;
    b.timer -= dt;
    if (b.phase === 'chase') {
      // ルアーを追う魚：一定速で巻き続けると少しずつ、止めてからの誘いで一気に食い気が上がる。
      // 止めすぎ・速すぎは見切られる
      const fast = this.lureSpeed > 1.1 && b.species.motion !== 'fast';
      if (this.stillTime > 2) b.interest -= 0.25 * dt;
      else if (fast) b.interest -= 0.15 * dt;
      else if (this.lureSpeed > 0.05) b.interest += 0.06 * dt;
      if (b.interest >= 1) {
        this.startTake(b, lure);
        return;
      }
      if (b.interest <= 0) {
        this.tip('見切られた。巻くだけでなく、止めてからあおってみよう', 'bad');
        this.bite = null;
        this.spook = 0.4;
      }
      return;
    }
    if (b.phase === 'approach') {
      if (b.timer > 0) return;
      b.phase = 'nibble';
      b.timer = this.rng.range(0.15, 0.5);
      return;
    }
    if (b.phase === 'nibble') {
      if (b.timer > 0) return;
      if (b.nibbles > 0) {
        b.nibbles--;
        b.timer = this.rng.range(0.5, 1.3);
        this.rod.shake = 0.35;
        this.audio.nibble();
        this.fx.ripple(this.lure.x, this.lure.z, 0.05);
        this.input?.vibrate(15);
        // エサを動かすと警戒される
        if (this.lureSpeed > 0.1 && this.rng.chance(0.35)) this.bite = null;
        return;
      }
      this.startTake(b, lure);
      return;
    }
    this.rod.shake = Math.max(this.rod.shake, 0.5);
    this.rod.bend = 0.5;
    if (b.timer <= 0) {
      this.tip('合わせが遅れた', 'bad');
      if (lure.pack && this.rng.chance(0.6)) this.consumeBait();
      this.bite = null;
      this.rod.bend = 0;
      this.spook = 0.5;
    }
  }

  /** アワセ：竿を振り上げる速さと、糸ふけ・タイミングで掛かり具合が決まる */
  private hookset(_sensitivity: number, speed: number): void {
    const b = this.bite!;
    this.rod.swing = 0.6;
    this.audio.hookset();
    if (b.phase !== 'take') {
      if (this.tutorialBite) return;
      this.tip('早合わせ。竿先が大きく入るまで待とう', 'bad');
      if (this.lureDef.pack && this.rng.chance(0.4)) this.consumeBait();
      this.bite = null;
      this.spook = 1;
      this.cb.onLost('miss');
      return;
    }
    const strength = Math.max(0, Math.min(1, 0.3 + (speed - FLICK) / 4));
    const timing = 1 - 0.4 * (1 - Math.max(0, b.timer) / b.window);
    const slackPenalty = this.lineSlack > 1 ? 0.4 : 1;
    const q = strength * timing * slackPenalty;
    if (q < 0.22 && !this.tutorialBite) {
      this.tip(this.lineSlack > 1 ? '糸ふけで合わせが効かなかった' : '合わせが弱かった', 'bad');
      this.bite = null;
      this.spook = 0.8;
      this.cb.onLost('miss');
      return;
    }
    this.startFight(Math.max(q, this.tutorialBite ? 0.8 : q));
  }

  // ---------------- ファイト ----------------

  private startFight(quality: number): void {
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
        hookQuality: quality,
      },
      this.rng,
    );
    this.fight.rodLift = this.rodLift;
    this.fight.lineOut = dist + this.rodLift * PUMP_LENGTH;
    this.hooked = { fish: b.fish, species: b.species, cond: b.cond };
    this.phase = 'fight';
    this.fixedAcc = 0;
    this.rod.bobber.visible = false;
    this.rod.lure.visible = false;

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

  private updateFight(dt: number, input: Input): void {
    const f = this.fight!;
    const reeling = input.left && input.enabled;
    if (input.enabled && input.wheel) {
      const reel = REEL_BY_ID[this.save.equip.reel];
      f.setDrag(f.drag - input.wheel * Math.max(0.1, reel.dragMax / 30));
      this.save.drag = f.drag;
    }
    // 魚に竿を持っていかれる：走る向きへ竿先が倒され、強く引かれるほど竿が寝かされる
    const rodPower = Math.max(0.5, ROD_BY_ID[this.save.equip.rod].power);
    const load = Math.min(1.5, f.tension / rodPower);
    if (input.enabled) {
      const sideK = f.behavior === 'run' ? 0.9 : f.behavior === 'hold' ? 0.35 : 0.15;
      this.rodSide = Math.max(-1, Math.min(1, this.rodSide + Math.sign(f.side) * Math.min(1, Math.abs(f.side) * 2) * sideK * load * dt));
      this.rodLift = Math.max(0, this.rodLift - load * (0.12 + 0.35 * f.tug) * dt);
    }
    this.fixedAcc += dt;
    let jumped = false;
    let ran = false;
    while (this.fixedAcc >= FIXED && !f.outcome) {
      this.fixedAcc -= FIXED;
      f.step({ reeling, rodSide: this.rodSide, rodLift: this.rodLift }, FIXED);
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
        if (e === 'slack') this.tip('糸がたるんでいる');
        if (e === 'turn') {
          // 切り返し：竿先が逆へ持っていかれる
          this.rod.shake = Math.max(this.rod.shake, 0.8);
          this.shake = Math.max(this.shake, 0.45);
          input.vibrate([25, 20, 50]);
          if (f.distance < 12 && this.fishPos.y > -1.2) this.fx.splash(this.fishPos.x, this.fishPos.z, 0.25);
        }
        if (e === 'weeds') {
          this.tip('藻に糸が擦れている。逆へ竿を倒して引き出す', 'bad');
          input.vibrate([15, 15, 15, 15, 15, 15]);
        }
      }
    }
    if (ran) {
      this.rod.shake = 0.8;
      this.shake = Math.max(this.shake, 0.5);
      input.vibrate(70);
    }
    if (jumped) {
      this.jumpT = 1.0;
      this.tip('跳んだら竿を下げる');
      input.vibrate([30, 30, 30, 30, 30]);
    }
    const tFrac = Math.min(1.2, f.tension / f.lineTest);
    this.audio.setDrag(f.dragSlipping ? 0.6 + Math.min(0.4, tFrac) : 0);
    this.audio.setReel(reeling && !f.dragSlipping ? 0.9 * (1 - f.reelLoad * 0.75) : 0);
    this.audio.setStrain(reeling ? f.reelLoad : 0, tFrac);
    this.rod.reelSpin = reeling ? (f.dragSlipping ? 0.1 : 0.9 * (1 - f.reelLoad * 0.8)) : 0;
    this.rod.bend = Math.min(1.8, f.tension / rodPower + 0.05 + f.tug * 0.25 * Math.min(1, f.pullMax / rodPower));
    this.rod.pull = Math.min(1, f.tension / rodPower) * 0.8 + f.tug * 0.2;
    this.rod.lineVibe = f.slack < 0.05 ? (0.015 + f.tug * 0.03) * Math.min(1, tFrac * 1.5) : 0;
    this.shake = Math.max(this.shake, f.tug * 0.35 * Math.min(1, tFrac + 0.3) + (f.dragSlipping ? 0.15 : 0));
    this.danger = Math.max(0, Math.min(1, (tFrac - 0.75) / 0.25), f.behavior === 'jump' && f.rodHigh ? 0.8 : 0);

    this.placeFish(dt, f);
    // 糸が水を切る：魚が横へ走るほど、糸の入水点から波紋が立つ
    if (f.behavior === 'run' && f.slack < 0.1 && this.rng.chance(dt * (2 + 8 * Math.min(1, Math.abs(f.side)) * Math.min(1, tFrac * 2)))) {
      const tip = this.rod.tipWorld();
      const k = tip.y / Math.max(0.01, tip.y - this.fishPos.y);
      const ex = tip.x + (this.fishPos.x - tip.x) * Math.min(1, k);
      const ez = tip.z + (this.fishPos.z - tip.z) * Math.min(1, k);
      this.fx.ripple(ex, ez, 0.15);
    }
    if (f.outcome === 'landed') this.startNet(f);
    else if (f.outcome) this.finishFight(f.outcome);
  }

  private placeFish(dt: number, f: Fight): void {
    const yaw = this.castYaw + f.lateral;
    const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    // 足元の魚は桟橋の先、見下ろせる位置で暴れる
    const dist = this.phase === 'net' ? 5 : f.distance;
    const target = new THREE.Vector3(this.origin.x + dir.x * dist, -f.depth, this.origin.z + dir.z * dist);
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      const t = 1 - this.jumpT / 1.0;
      target.y = Math.sin(Math.min(1, t) * Math.PI) * (0.6 + Math.min(1, this.hooked!.fish.length / 80));
      if (this.jumpT <= 0 || (t > 0.02 && t < 0.06)) {
        this.fx.splash(target.x, target.z, 0.5 + this.hooked!.fish.length / 100);
        this.audio.splash(0.6);
      }
    }
    if (this.phase === 'net') {
      // 足元で暴れる／おとなしくなると水面に浮いて横になる
      target.y = this.netQuiet ? 0.03 : -0.02 + Math.abs(Math.sin(this.time * 11)) * 0.14;
      if (!this.netQuiet) {
        target.x += Math.sin(this.time * 7.3) * 0.25;
        target.z += Math.cos(this.time * 5.1) * 0.25;
      }
    }
    const prev = this.fishPos.clone();
    this.fishPos.lerp(target, Math.min(1, dt * 8));
    // 浅いところを走ると水面が盛り上がる（引き波）
    if (f.depth < 1.6 && (f.behavior === 'run' || f.behavior === 'approach') && this.rng.chance(dt * (8 - f.depth * 4))) this.fx.ripple(this.fishPos.x, this.fishPos.z, 0.25 + 0.25 * (1 - f.depth / 1.6));
    if (this.fishObj) {
      const g = this.fishObj.group;
      g.visible = this.fishPos.y > -1.4 || f.distance < 6 || this.phase === 'net';
      g.position.copy(this.fishPos);
      const mv = this.fishPos.clone().sub(prev);
      const quiet = this.netQuiet;
      if (mv.lengthSq() > 1e-6 && !quiet) g.rotation.set(0, Math.atan2(-mv.z, mv.x), this.jumpT > 0 ? Math.sin(this.time * 20) * 0.5 : 0);
      // おとなしくなった魚は横倒しになる（向きを保ったまま体の軸で転がす）
      g.rotation.order = 'YXZ';
      g.rotation.x += ((quiet ? 1.25 : 0) - g.rotation.x) * Math.min(1, dt * 4);
      this.fishObj.swim.uTime.value = this.time;
      const thrash = f.behavior === 'run' || (this.phase === 'net' && !quiet);
      this.fishObj.swim.uAmp.value = quiet ? 0.015 : thrash ? 0.08 : 0.035;
      this.fishObj.swim.uFreq.value = quiet ? 3 : thrash ? 14 : 7;
    }
    this.cameraYawHint = Math.atan2(-(this.fishPos.x - this.origin.x), -(this.fishPos.z - this.origin.z));
  }

  // ---------------- 取り込み ----------------
  // 足元まで寄せた魚は、暴れる→おとなしくなる、を繰り返す。
  // おとなしくなった瞬間に竿を一気に振り上げれば抜き上げられる。暴れている最中に抜くとバレたり切られたりする。

  private netTime = 0;
  /** 足元で暴れている残り時間（0 ならおとなしい） */
  private netThrash = 0;
  /** 次に暴れ出すまでの時間 */
  private netCalm = 0;

  private startNet(_f: Fight): void {
    this.phase = 'net';
    this.netTime = 0;
    this.netThrash = this.rng.range(0.6, 1.2);
    this.netCalm = 0;
    this.liftVel = 0;
    this.audio.setDrag(0);
    this.audio.setReel(0);
    this.audio.setStrain(0, 0);
  }

  /** 足元の魚がおとなしくしているか */
  private get netQuiet(): boolean {
    return this.phase === 'net' && this.netThrash <= 0;
  }

  private updateNet(dt: number, input: Input): void {
    const f = this.fight!;
    this.netTime += dt;
    const h = this.hooked!;
    const heavy = Math.min(1, h.fish.weight / 1000 / Math.max(0.5, ROD_BY_ID[this.save.equip.rod].power));
    if (this.netThrash > 0) {
      this.netThrash -= dt;
      if (this.netThrash <= 0) this.netCalm = this.rng.range(0.9, 1.6) + Math.min(1.5, this.netTime * 0.12);
      if (this.rng.chance(dt * 7)) this.fx.splash(this.fishPos.x, this.fishPos.z, 0.2 + 0.3 * heavy);
      if (this.rng.chance(dt * 3)) {
        this.audio.splash(0.35);
        input.vibrate(30);
      }
      this.rod.shake = Math.max(this.rod.shake, 0.6);
    } else {
      this.netCalm -= dt;
      if (this.netCalm <= 0) {
        this.netThrash = this.rng.range(0.6, 1.4) * (0.7 + heavy);
        this.shake = Math.max(this.shake, 0.3);
      }
    }
    this.placeFish(dt, f);
    this.rod.bend = 0.45 + heavy * 0.5 + (this.netThrash > 0 ? 0.25 * Math.abs(Math.sin(this.time * 12)) : 0);

    // 竿を一気に振り上げて抜き上げる
    if (this.liftVel > FLICK && input.enabled) {
      this.liftVel = 0;
      this.rod.swing = 0.6;
      this.shake = Math.max(this.shake, 0.6);
      input.vibrate([20, 20, 80]);
      if (this.netThrash <= 0) {
        this.finishFight('landed');
        return;
      }
      // 暴れている最中に抜こうとした
      this.audio.splash(0.7);
      this.fx.splash(this.fishPos.x, this.fishPos.z, 0.6);
      if (heavy > 0.5 && this.rng.chance(heavy - 0.3)) {
        this.finishFight('lineBreak');
        return;
      }
      if (this.rng.chance(0.25 + 0.4 * (1 - f.hookQuality))) {
        this.finishFight('hookOut');
        return;
      }
      this.tip('暴れているうちは抜けない。おとなしくなるまで待つ', 'bad');
      f.resumeAfterNetMiss();
      this.phase = 'fight';
      return;
    }
    // もたもたしていると体力が戻って再び走る
    if (this.netTime > 10) {
      this.audio.splash(0.6);
      this.fx.splash(this.fishPos.x, this.fishPos.z, 0.5);
      f.resumeAfterNetMiss();
      this.phase = 'fight';
    }
  }

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
      lineBreak: '糸を切られた',
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
    } else if (b.phase === 'chase') {
      // ルアーの後ろをついてくる。やる気が高いほど近い
      const away = new THREE.Vector3(this.lure.x - this.origin.x, 0, this.lure.z - this.origin.z).normalize();
      target = this.lure.clone().addScaledVector(away, 0.4 + (1 - b.interest) * 1.4);
      target.x += Math.sin(this.time * 3) * 0.2;
    } else {
      target = this.lure.clone().add(new THREE.Vector3(Math.sin(this.time * 5) * 0.12, 0, Math.cos(this.time * 4) * 0.12));
    }
    const prev = this.shadowPos.clone();
    this.shadowPos.lerp(target, Math.min(1, dt * 4));
    this.shadow.position.set(this.shadowPos.x, 0.03, this.shadowPos.z);
    const mv = this.shadowPos.clone().sub(prev);
    if (mv.lengthSq() > 1e-7) this.shadow.rotation.y = Math.atan2(-mv.z, mv.x);
    this.shadow.scale.set(len * 1.1, 1, len * 0.32);
    const depthFade = Math.max(0.3, 1 - -this.lure.y / 6);
    mat.opacity = Math.min(0.55, mat.opacity + dt) * depthFade;
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

  /** 画面に出す「次にやること」 */
  guide(touch: boolean): string {
    if (this.save.stats.caught >= 2) return '';
    return this.guideText(touch);
  }

  private guideText(touch: boolean): string {
    const reel = touch ? '「巻く」' : '左クリック長押し';
    const up = touch ? '上にスワイプ' : 'マウスを上に振る';
    const lure = this.lureDef;
    switch (this.phase) {
      case 'ready':
        return touch ? '画面を押したまま下へ引いて竿を振りかぶり、離して投げる' : '左クリックを押したままマウスを下へ引いて振りかぶり、離して投げる';
      case 'aiming':
        return this.aimPower > OVER_PULL ? '振りかぶりすぎると狙いがぶれる' : '引くほど遠くへ飛ぶ';
      case 'flying':
        return '';
      case 'water': {
        const b = this.bite;
        if (this.onLand) return `陸に落ちた。${reel}で回収する`;
        if (b?.phase === 'take') return `竿先が入った — ${up}て合わせる`;
        if (b?.phase === 'nibble') return '小さなアタリ。竿先が大きく入るまで待つ';
        if (b?.phase === 'chase') return `魚が追っている。止めてから${touch ? '小さく上スワイプ' : 'マウスを小さく上へ'}であおる`;
        if (this.lineSlack > 1.5) return `糸ふけが出ている。${reel}で糸を張る`;
        return lure.pack ? 'エサは動かさずに待つ' : `${reel}で巻き、時々止めて竿をあおって誘う`;
      }
      case 'fight': {
        const f = this.fight!;
        const side = touch ? '左右にドラッグ' : 'マウス左右';
        if (f.behavior === 'jump') return '跳んだら竿を下げる';
        if (f.inWeeds) return `藻に擦れている。${side}で魚と逆へ竿を倒して引き出す`;
        if (f.behavior === 'run' && f.oppose < 0.3) return `魚が横へ走っている。${side}で逆へ竿を倒して耐えると弱っていく`;
        if (f.reelLoad > 0.9) return '重くて巻けないときは、竿を立てて寄せ、下げながら巻く';
        return '竿を立てて寄せ、下げながら巻く';
      }
      case 'net':
        return this.netQuiet
          ? `おとなしくなった。竿を下げてから${touch ? '一気に上へスワイプ' : 'マウスを一気に上へ振って'}抜き上げる`
          : '足元で暴れている。おとなしくなるまで待つ';
      case 'landing':
        return '';
    }
  }

  hud(): FishingHud {
    const lure = this.lureDef;
    const f = this.fight;
    const wd = waterDepth(this.lure.x, this.lure.z);
    return {
      phase: this.phase,
      lureName: lure.name,
      lureCount: this.save.owned.lures[lure.id] ?? 0,
      depth: Math.max(0, -this.lure.y),
      waterDepth: wd,
      layer: this.phase === 'water' ? this.layerAt() : 'surface',
      distance: Math.hypot(this.lure.x - this.origin.x, this.lure.z - this.origin.z),
      floatDepth: this.save.floatDepth,
      isBait: !!lure.pack,
      rodLift: this.rodLift,
      rodHigh: !!f && f.behavior === 'jump' && f.rodHigh,
      slack: this.phase === 'water' ? this.lineSlack : f ? Math.max(0, f.slack) : 0,
      chase: this.bite?.phase === 'chase' ? Math.max(0, Math.min(1, this.bite.interest)) : null,
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
              distance: f.distance,
              jumping: f.behavior === 'jump',
            }
          : null,
    };
  }
}
