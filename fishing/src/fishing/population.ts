import * as THREE from 'three';
import { speciesForSpot } from '../data/species';
import type { Conditions, Layer, Species } from '../data/types';
import { buildFishObject, type FishObject } from '../render/fishMesh';
import { generateFish, type FishInstance } from '../sim/individual';
import type { Rng } from '../sim/rng';
import { mult, RARITY_WEIGHT } from '../sim/spawn';
import { onDock, structureAt, waterDepth } from '../world/lakeShape';

/**
 * 湖を泳いでいる魚（目に見える個体）。
 * - 普段はポイント（藻場・桟橋・浅場など）の周りをうろつく
 * - 足音・走る・真上への着水で逃げ、しばらく警戒する（大物ほど敏感）
 * - 少し離れた着水音には捕食魚が寄ってくる
 * - アタリはこの中の個体が実際に寄ってきて起こる（FishingController が engage する）
 * - 同じ場所で釣り続ける・同じルアーを投げ続けると反応が落ちる（スレ）
 */

export type AmbientState = 'cruise' | 'hold' | 'flee' | 'inspect' | 'engaged';

export interface AmbientFish {
  species: Species;
  fish: FishInstance;
  obj: FishObject;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  home: THREE.Vector3;
  target: THREE.Vector3;
  /** 好む深さ (m) */
  depth: number;
  state: AmbientState;
  timer: number;
  /** 警戒 0..1（高いと食わない・寄ってこない） */
  alarm: number;
  /** 賢さ 0..1：大きい個体・珍しい魚ほど高い */
  wary: number;
  /** 群れのリーダー（小魚は群れで泳ぐ） */
  leader: AmbientFish | null;
  phase: number;
  /** 向き (rad)。+X が頭で、heading=0 は +X 方向 */
  heading: number;
  speed: number;
  /** 尾を振って加速している残り時間（0 以下は惰性で滑っている） */
  kick: number;
  /** 次に尾を振るまで */
  glide: number;
  pitch: number;
}

const TARGET_COUNT = 30;
const SPAWN_MIN = 6;
const SPAWN_MAX = 40;
const DESPAWN = 58;
/** スレを記録する区画の大きさ (m) */
const CELL = 8;
/** スレの半減期（実時間・秒） */
const PRESSURE_HALF_LIFE = 300;

const LAYER_KEYS: Layer[] = ['surface', 'mid', 'bottom'];

export interface PlayerPresence {
  x: number;
  z: number;
  /** 水平の移動速度 (m/s) */
  speed: number;
  onDock: boolean;
}

export class FishPopulation {
  readonly fish: AmbientFish[] = [];
  private pressure = new Map<string, number>();
  private lureUse = new Map<string, number>();
  private initialized = false;
  private time = 0;
  /** 人の気配で魚が逃げた時（助言用） */
  onPlayerSpooked: (() => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private rng: Rng,
    private ripple: (x: number, z: number, size: number) => void,
  ) {}

  // ---------------- スレ（場所・ルアーへの慣れ） ----------------

  private cellKey(x: number, z: number): string {
    return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  }

  /** その場所の魚のスレ具合（0 = スレていない） */
  pressureAt(x: number, z: number): number {
    let sum = 0;
    // 隣の区画にも少し影響させる
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const v = this.pressure.get(this.cellKey(x + i * CELL, z + j * CELL)) ?? 0;
        sum += i === 0 && j === 0 ? v : v * 0.3;
      }
    }
    return sum;
  }

  addPressure(x: number, z: number, amount: number): void {
    const k = this.cellKey(x, z);
    this.pressure.set(k, (this.pressure.get(k) ?? 0) + amount);
  }

  /** 同じ場所で同じルアーを投げた回数（見切られやすくなる） */
  lureFatigue(x: number, z: number, lureId: string): number {
    return this.lureUse.get(`${this.cellKey(x, z)}:${lureId}`) ?? 0;
  }

  private noteLure(x: number, z: number, lureId: string): void {
    const k = `${this.cellKey(x, z)}:${lureId}`;
    this.lureUse.set(k, (this.lureUse.get(k) ?? 0) + 1);
  }

  // ---------------- 出現 ----------------

  private ambientConditions(x: number, z: number, cond: Omit<Conditions, 'layer' | 'structure' | 'lure' | 'motion'>): Conditions {
    return { ...cond, layer: 'mid', structure: structureAt(x, z), lure: 'baitWorm', motion: 'slow' };
  }

  private pickSpecies(c: Conditions): Species | null {
    const list = speciesForSpot('lake');
    return this.rng.weighted(list, (s) => RARITY_WEIGHT[s.rarity] * mult(s.times, c.time) * mult(s.weathers, c.weather) * mult(s.seasons, c.season) * mult(s.structures, c.structure));
  }

  private preferredDepth(s: Species, wd: number): number {
    const layer = this.rng.weighted(LAYER_KEYS, (l) => mult(s.layers, l)) ?? 'mid';
    const d = layer === 'surface' ? this.rng.range(0.25, 0.7) : layer === 'bottom' ? wd - this.rng.range(0.2, 0.5) : wd * this.rng.range(0.3, 0.6);
    return Math.max(0.2, Math.min(wd - 0.15, d));
  }

  private waryOf(s: Species, fish: FishInstance): number {
    const big = Math.max(0, Math.min(1, (fish.length - s.length.mean) / Math.max(1, s.length.max - s.length.mean)));
    const rare = { common: 0, uncommon: 0.08, rare: 0.18, epic: 0.28, legend: 0.45 }[s.rarity];
    return Math.min(1, big * 0.6 + rare);
  }

  /** 個体を水中に置く（obj は呼び出し側が scene に追加済みでなくてよい） */
  private place(s: Species, fish: FishInstance, x: number, z: number, depth: number, leader: AmbientFish | null): AmbientFish {
    const obj = buildFishObject(s, fish.colorId, fish.patternId, false, true);
    obj.group.scale.setScalar(fish.length / 100);
    obj.group.rotation.order = 'YXZ';
    const heading = this.rng.range(-Math.PI, Math.PI);
    obj.group.rotation.y = heading;
    this.scene.add(obj.group);
    const pos = new THREE.Vector3(x, -depth, z);
    const a: AmbientFish = {
      species: s,
      fish,
      obj,
      pos,
      vel: new THREE.Vector3(),
      home: pos.clone(),
      target: pos.clone(),
      depth,
      state: 'cruise',
      timer: 0,
      alarm: 0,
      wary: this.waryOf(s, fish),
      leader,
      phase: this.rng.range(0, 10),
      heading,
      speed: 0,
      kick: 0,
      glide: this.rng.range(0, 2),
      pitch: 0,
    };
    this.fish.push(a);
    return a;
  }

  private randomWaterPoint(cx: number, cz: number, rMin: number, rMax: number, minDepth = 0.6): THREE.Vector3 | null {
    for (let i = 0; i < 24; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(rMin, rMax);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (waterDepth(x, z) >= minDepth && !onDock(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  private spawnOne(px: number, pz: number, rMin: number, cond: Omit<Conditions, 'layer' | 'structure' | 'lure' | 'motion'>): void {
    // 魚の付きやすいポイントほど出やすい
    let p: THREE.Vector3 | null = null;
    for (let i = 0; i < 4 && !p; i++) {
      const q = this.randomWaterPoint(px, pz, rMin, SPAWN_MAX);
      if (!q) continue;
      const st = structureAt(q.x, q.z);
      const attract = st === 'open' ? 0.35 : st === 'shallows' ? 0.8 : 1;
      if (this.rng.chance(attract)) p = q;
    }
    if (!p) return;
    const c = this.ambientConditions(p.x, p.z, cond);
    const s = this.pickSpecies(c);
    if (!s) return;
    const wd = waterDepth(p.x, p.z);
    const lead = this.place(s, generateFish(s, c, this.rng), p.x, p.z, this.preferredDepth(s, wd), null);
    // 小魚は群れで泳ぐ
    if (s.length.mean < 22) {
      const n = this.rng.int(3, 7);
      for (let i = 0; i < n; i++) {
        const x = p.x + this.rng.range(-1.2, 1.2);
        const z = p.z + this.rng.range(-1.2, 1.2);
        if (waterDepth(x, z) < 0.4) continue;
        this.place(s, generateFish(s, c, this.rng), x, z, Math.min(lead.depth + this.rng.range(-0.3, 0.3), waterDepth(x, z) - 0.15), lead);
      }
    }
  }

  /** アタリ用：見えていない深場から1匹寄せる */
  spawnFor(species: Species, fish: FishInstance, near: THREE.Vector3): AmbientFish {
    const p = this.randomWaterPoint(near.x, near.z, 5, 8, 1) ?? new THREE.Vector3(near.x + 5, 0, near.z);
    const wd = waterDepth(p.x, p.z);
    return this.place(species, fish, p.x, p.z, Math.max(0.3, Math.min(wd - 0.15, Math.max(1.5, -near.y))), null);
  }

  /** 開発用：指定の魚をその場に置いてとどまらせる */
  debugPlace(speciesId: string, x: number, z: number, depth: number, length?: number): void {
    const s = speciesForSpot('lake').find((sp) => sp.id === speciesId);
    if (!s) return;
    const cond: Conditions = { time: 'day', weather: 'sunny', season: 'spring', layer: 'mid', structure: 'open', lure: 'baitWorm', motion: 'slow' };
    const fish = generateFish(s, cond, this.rng);
    if (length) fish.length = length;
    const a = this.place(s, fish, x, z, depth, null);
    a.state = 'hold';
    a.timer = 1e6;
  }

  private remove(a: AmbientFish): void {
    const i = this.fish.indexOf(a);
    if (i >= 0) this.fish.splice(i, 1);
    for (const f of this.fish) if (f.leader === a) f.leader = null;
  }

  private dispose(a: AmbientFish): void {
    this.remove(a);
    this.scene.remove(a.obj.group);
    a.obj.dispose();
  }

  /** 掛かった魚を釣りの側に引き渡す（3Dオブジェクトはそのまま使う） */
  take(a: AmbientFish): FishObject {
    this.remove(a);
    return a.obj;
  }

  // ---------------- 反応 ----------------

  /** 魚を逃がす。from から遠ざかるように泳ぎ、しばらく警戒する */
  private scare(a: AmbientFish, fromX: number, fromZ: number, strength: number): void {
    if (a.state === 'engaged') return;
    const away = new THREE.Vector3(a.pos.x - fromX, 0, a.pos.z - fromZ);
    if (away.lengthSq() < 1e-4) away.set(this.rng.range(-1, 1), 0, this.rng.range(-1, 1));
    away.normalize();
    a.state = 'flee';
    a.timer = this.rng.range(1.4, 2.6);
    a.alarm = Math.min(1, a.alarm + strength);
    a.target.set(a.pos.x + away.x * 12, 0, a.pos.z + away.z * 12);
    // 浅いところで逃げると水面が割れる
    if (a.pos.y > -0.8) this.ripple(a.pos.x, a.pos.z, 0.25 + a.fish.length / 200);
  }

  /**
   * 着水・暴れる魚などの水音。
   * loud（0..1）が大きいほど近くの魚は散り、少し離れた捕食魚は様子を見に来る。
   */
  splash(x: number, z: number, loud: number, lureId?: string, attract = true): void {
    if (lureId) this.noteLure(x, z, lureId);
    const scareR = 1 + loud * 5;
    for (const a of this.fish) {
      if (a.state === 'engaged') continue;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z);
      const r = scareR * (1 + a.wary);
      if (d < r) this.scare(a, x, z, 0.6 + loud * 0.4);
      else if (attract && d < r + 9 && a.alarm < 0.3 && a.state !== 'flee' && this.isPredatorLike(a.species) && this.rng.chance(0.6 - a.wary * 0.4)) {
        a.state = 'inspect';
        a.timer = this.rng.range(3, 6);
        a.target.set(x + this.rng.range(-1.5, 1.5), 0, z + this.rng.range(-1.5, 1.5));
      }
    }
    this.addPressure(x, z, 0.04 * loud);
  }

  /** ルアーで釣れる（＝動くものに反応する）魚か */
  private isPredatorLike(s: Species): boolean {
    return Object.keys(s.lures).some((k) => !k.startsWith('bait'));
  }

  /** 逃げた・バレた・見切った魚は離れていき、しばらく警戒する */
  release(a: AmbientFish, spooked: boolean): void {
    if (!this.fish.includes(a)) return;
    a.heading = a.obj.group.rotation.y;
    a.pitch = 0;
    a.state = 'cruise';
    a.timer = 0;
    if (spooked) this.scare(a, a.pos.x + this.rng.range(-1, 1), a.pos.z + this.rng.range(-1, 1), 1);
    else {
      a.alarm = Math.min(1, a.alarm + 0.5);
      a.target.copy(a.home);
    }
  }

  engage(a: AmbientFish): void {
    a.state = 'engaged';
  }

  /** ルアーの近くで、食い気のある（警戒していない）魚 */
  candidates(at: THREE.Vector3, radius: number): AmbientFish[] {
    return this.fish.filter((a) => a.state !== 'flee' && a.state !== 'engaged' && a.alarm < 0.35 && Math.hypot(a.pos.x - at.x, a.pos.z - at.z) < radius);
  }

  // ---------------- 毎フレーム ----------------

  update(dt: number, player: PlayerPresence, cond: Omit<Conditions, 'layer' | 'structure' | 'lure' | 'motion'>, time: number): void {
    this.time = time;
    // 周りの魚の数を保つ（初回は近くにも、以降は見えにくい遠くに出す）
    for (const a of [...this.fish]) {
      if (a.state !== 'engaged' && Math.hypot(a.pos.x - player.x, a.pos.z - player.z) > DESPAWN) this.dispose(a);
    }
    let guard = 0;
    while (this.fish.length < TARGET_COUNT && guard++ < 6) this.spawnOne(player.x, player.z, this.initialized ? 32 : SPAWN_MIN, cond);
    this.initialized = true;

    // スレ・ルアーへの慣れは時間とともに抜ける
    const decay = Math.pow(0.5, dt / PRESSURE_HALF_LIFE);
    for (const [k, v] of this.pressure) v * decay < 0.01 ? this.pressure.delete(k) : this.pressure.set(k, v * decay);
    for (const [k, v] of this.lureUse) v * decay < 0.05 ? this.lureUse.delete(k) : this.lureUse.set(k, v * decay);

    // 人の気配：歩くと足音、走るとさらに遠くまで伝わる。桟橋の上は板が響く
    const moving = player.speed > 0.4;
    const threatR = (player.speed > 4 ? 9 : moving ? 4.5 : 1.8) * (player.onDock && moving ? 1.5 : 1);

    for (const a of this.fish) {
      if (a.state === 'engaged') continue;
      a.alarm = Math.max(0, a.alarm - dt * 0.03);
      const dp = Math.hypot(a.pos.x - player.x, a.pos.z - player.z);
      if (a.state !== 'flee' && dp < threatR * (1 + a.wary) && -a.pos.y < 3.5) {
        this.scare(a, player.x, player.z, moving ? 0.7 : 0.4);
        if (moving && dp < 12) this.onPlayerSpooked?.();
      }
      this.steer(a, dt);
    }
    this.render(player);
  }

  /**
   * 魚の泳ぎ：向きは少しずつしか変えられず、尾を数回振って加速しては惰性で滑る。
   * 個体ごとにふらつき（wander）があり、群れは仲間と間隔を取りながら大まかに揃う。
   */
  private steer(a: AmbientFish, dt: number): void {
    const s = a.species;
    const lenM = a.fish.length / 100;
    // 巡航速度は体長に比例（体長の 0.6〜1 倍/秒）
    let cruise = (0.12 + lenM * 0.8) * (0.7 + 0.3 * s.fight.speed);
    let turnRate = 0.9;
    a.timer -= dt;
    switch (a.state) {
      case 'flee':
        cruise = 1.8 + lenM * 3 + s.fight.speed;
        turnRate = 7;
        if (a.timer <= 0) {
          a.state = 'cruise';
          a.target.copy(a.home);
        }
        break;
      case 'inspect':
        cruise *= 1.6;
        turnRate = 2;
        if (a.timer <= 0) a.state = 'cruise';
        break;
      case 'hold':
        cruise = 0.02;
        turnRate = 0.3;
        if (a.timer <= 0) a.state = 'cruise';
        break;
      case 'cruise': {
        const reached = Math.hypot(a.target.x - a.pos.x, a.target.z - a.pos.z) < 1;
        if (a.leader && a.leader.state !== 'engaged') {
          if (a.leader.state === 'flee') {
            a.state = 'flee';
            a.timer = a.leader.timer + this.rng.range(-0.3, 0.3);
            a.target.copy(a.leader.target).add(new THREE.Vector3(this.rng.range(-2, 2), 0, this.rng.range(-2, 2)));
          }
        } else if (reached || a.timer <= 0) {
          if (this.rng.chance(0.4)) {
            a.state = 'hold';
            a.timer = this.rng.range(2, 8);
          } else {
            const t = this.randomWaterPoint(a.home.x, a.home.z, 0, 10, 0.5);
            if (t) a.target.copy(t);
            a.timer = this.rng.range(8, 20);
          }
        }
        break;
      }
    }

    // 行きたい方向
    let want: number;
    if (a.leader && a.leader.state !== 'engaged' && a.state !== 'flee') {
      // 群れ：リーダーに付いていきつつ、近すぎる仲間からは離れる
      const lx = a.leader.pos.x + Math.cos(a.leader.heading + Math.PI + Math.sin(a.phase) * 1.2) * (0.5 + (a.phase % 1) * 0.8);
      const lz = a.leader.pos.z - Math.sin(a.leader.heading + Math.PI + Math.sin(a.phase) * 1.2) * (0.5 + (a.phase % 1) * 0.8);
      let vx = lx - a.pos.x;
      let vz = lz - a.pos.z;
      for (const o of this.fish) {
        if (o === a || (o.leader !== a.leader && o !== a.leader)) continue;
        const dx = a.pos.x - o.pos.x;
        const dz = a.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.16 && d2 > 1e-6) {
          vx += (dx / d2) * 0.08;
          vz += (dz / d2) * 0.08;
        }
      }
      const far = Math.hypot(vx, vz);
      want = far > 0.3 ? Math.atan2(-vz, vx) : a.leader.heading;
      cruise = Math.max(cruise, a.leader.speed * (far > 1 ? 1.3 : 1));
      turnRate = 1.6;
    } else {
      want = Math.atan2(-(a.target.z - a.pos.z), a.target.x - a.pos.x);
    }
    // 個体ごとのふらつき
    want += (Math.sin(this.time * 0.37 + a.phase * 3.1) + Math.sin(this.time * 0.91 + a.phase)) * (a.state === 'flee' ? 0.15 : 0.45);
    // 先が浅ければ曲がる
    const look = 1 + lenM * 2;
    const ax = a.pos.x + Math.cos(a.heading) * look;
    const az = a.pos.z - Math.sin(a.heading) * look;
    if (waterDepth(ax, az) < 0.5 || onDock(ax, az)) {
      want = a.heading + (Math.sin(a.phase * 7) > 0 ? 1 : -1) * 1.5;
      cruise *= 0.6;
    }
    let dh = want - a.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    a.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, dh));

    // 尾を振って加速 → 惰性で滑る
    a.glide -= dt;
    if (a.kick > 0) a.kick -= dt;
    else if (a.glide <= 0) {
      a.kick = this.rng.range(0.25, 0.6) * (a.state === 'flee' ? 3 : 1);
      a.glide = a.kick + this.rng.range(0.3, 1.6) * (a.state === 'hold' ? 3 : 1);
    }
    const target = a.kick > 0 ? cruise * 1.35 : cruise * 0.45;
    const rate = a.kick > 0 ? (a.state === 'flee' ? 8 : 2) : 0.7;
    a.speed += (target - a.speed) * Math.min(1, dt * rate);
    a.vel.set(Math.cos(a.heading) * a.speed, 0, -Math.sin(a.heading) * a.speed);
    const nx = a.pos.x + a.vel.x * dt;
    const nz = a.pos.z + a.vel.z * dt;
    if (waterDepth(nx, nz) > 0.35 && !onDock(nx, nz)) {
      a.pos.x = nx;
      a.pos.z = nz;
    } else {
      a.speed *= 0.3;
      a.heading += Math.PI * 0.5 * (Math.sin(a.phase * 5) > 0 ? 1 : -1);
    }
    // 深さ：逃げる時は潜る。上下に動く時は頭を上げ下げする
    const here = waterDepth(a.pos.x, a.pos.z);
    const wantDepth = Math.min(here - 0.12, a.state === 'flee' ? Math.max(a.depth, Math.min(here * 0.7, a.depth + 1.5)) : a.depth + Math.sin(this.time * 0.2 + a.phase) * 0.15);
    const vy = (-Math.max(0.2, wantDepth) - a.pos.y) * Math.min(1, dt * 0.6);
    a.pos.y += vy;
    a.pitch += (Math.max(-0.35, Math.min(0.35, (vy / Math.max(dt, 1e-4)) * 0.8)) - a.pitch) * Math.min(1, dt * 2);
  }

  private render(player: PlayerPresence): void {
    for (const a of this.fish) {
      const g = a.obj.group;
      const far = Math.hypot(a.pos.x - player.x, a.pos.z - player.z) > 50;
      g.visible = !far;
      if (far || a.state === 'engaged') continue;
      g.position.copy(a.pos);
      g.rotation.order = 'YXZ';
      g.rotation.set(0, a.heading, a.pitch);
      // 尾の振り：加速中は大きく速く、滑っている間はほとんど振らない
      const effort = a.kick > 0 ? 1 : 0.15;
      const lenK = Math.max(0.4, a.fish.length / 40);
      a.obj.swim.uTime.value = this.time + a.phase;
      a.obj.swim.uAmp.value = 0.012 + effort * (0.03 + Math.min(0.05, a.speed * 0.04));
      a.obj.swim.uFreq.value = (3 + effort * (5 + a.speed * 6)) / Math.sqrt(lenK);
    }
  }

  clear(): void {
    for (const a of [...this.fish]) this.dispose(a);
    this.initialized = false;
  }
}
