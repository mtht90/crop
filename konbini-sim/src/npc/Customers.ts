import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../game/Game';
import { Character, type AnimName } from './Character';
import { CHARACTER_IDS, type CharacterId } from '../core/Assets';
import { PRODUCTS, product, type ProductDef } from '../data/products';
import type { Slot } from '../game/Slot';
import { P } from '../world/Layout';
import type { BubbleSource, PromptInfo } from '../ui/UI';
import { yen } from '../ui/dom';

export type Archetype = 'normal' | 'drunk' | 'claimer' | 'thief' | 'loiterer' | 'underage';

type State = 'enter' | 'browse' | 'taking' | 'queue' | 'register' | 'leaving' | 'gone' | 'wander' | 'loiter' | 'flee' | 'exitSneak' | 'pause';

export interface Claim {
  kind: 'expired' | 'dirty' | 'wait' | 'price' | 'rude';
  line: string;
  valid: boolean;
}

const POOLS: Record<Archetype, CharacterId[]> = {
  normal: CHARACTER_IDS.filter((id) => !/Police|Delivery/.test(id)) as CharacterId[],
  underage: ['Male_Adult_16', 'Female_Adult_13'],
  drunk: ['Business_Male_01', 'Business_Male_04', 'Business_Male_06', 'Male_Adult_03', 'Construction_Male_02'],
  thief: ['Male_Adult_09', 'Male_Adult_17', 'Female_Adult_08', 'Male_Adult_20'],
  loiterer: ['Male_Adult_14', 'Male_Adult_05', 'Female_Adult_15', 'Male_Adult_11'],
  claimer: ['Male_Adult_03', 'Female_Adult_05', 'Business_Female_02', 'Business_Male_04'],
};

/** Customers per game hour at reputation 50 (index = hour 0..25). */
const RATE = [1.2, 1, 0.8, 0.8, 0.8, 1, 2, 3.2, 3.5, 2.4, 2.2, 2.8, 3.8, 3.2, 2.2, 2.2, 2.5, 3.2, 3.6, 3.2, 2.7, 2.2, 1.8, 1.6, 1.3, 1];

let nextId = 1;

export class Customer {
  readonly id = nextId++;
  readonly char: Character;
  readonly proxy: THREE.Mesh;
  state: State = 'enter';
  shopping: string[] = [];
  basket: { productId: string; expiry: number; slot: Slot | null }[] = [];
  concealed: { productId: string; expiry: number }[] = [];
  wantsHot: string | null = null;
  hotState: 'none' | 'asked' | 'served' | 'refused' = 'none';
  underage = false;
  payMethod: 'cash' | 'emoney' = 'cash';
  mood = 0;
  patience = 80;
  claim: Claim | null = null;
  greeted = false;
  talkedTo = false;
  detected = false;
  private target: Slot | null = null;
  timer = 0;
  private wanderLeft = 0;
  private exitVia: THREE.Vector3;
  queueIndex = -1;
  entered = false;

  constructor(readonly m: Customers, readonly type: Archetype, avatar: CharacterId) {
    const g = m.g;
    this.char = new Character(g.assets, avatar, g.store.m.shadow);
    const spawn = Math.random() < 0.5 ? P.outsideSpawnL : P.outsideSpawnR;
    this.exitVia = Math.random() < 0.5 ? P.outsideSpawnL : P.outsideSpawnR;
    this.char.root.position.copy(spawn).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 0.8));
    this.char.speed = 1.1 + Math.random() * 0.35;
    this.proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.75, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.position.y = 0.88;
    this.proxy.userData.npc = this.id;
    this.char.root.add(this.proxy);
    g.store.root.add(this.char.root);
    this.payMethod = Math.random() < 0.45 ? 'emoney' : 'cash';
    this.patience = 80 + Math.random() * 60;
    if (type === 'drunk') {
      this.char.moveAnim = 'walk_drunk';
      this.char.idleAnim = 'idle_drunk';
      this.char.speed = 0.75;
      this.patience = 200;
    }
    if (type === 'thief') this.char.speed = 1.2;
    if (type === 'underage') this.underage = true;
    this.go(P.doorOutside);
  }

  get pos(): THREE.Vector3 {
    return this.char.position;
  }

  go(p: THREE.Vector3, staff = false): boolean {
    const path = this.m.g.store.nav.findPath(this.pos, p, staff);
    return this.char.goTo(path);
  }

  readyForCheckout(): boolean {
    return this.state === 'register' && this.m.g.checkout.customer === this;
  }

  /** Put an item back on a shelf (e.g. refused alcohol, abandoned basket). */
  returnItem(productId: string): void {
    const i = this.basket.findIndex((b) => b.productId === productId);
    const it = i >= 0 ? this.basket.splice(i, 1)[0] : { productId, expiry: 99999, slot: null };
    const g = this.m.g;
    const p = product(productId);
    const slot = (it.slot && it.slot.canAccept(p) ? it.slot : null) ?? g.store.slots.find((s) => s.productId === productId && s.canAccept(p));
    if (slot) {
      slot.add(p, { expiry: it.expiry });
      g.instancer.markDirty(productId);
    }
  }

  leaveAfterCheckout(paid: boolean): void {
    const g = this.m.g;
    this.basket = [];
    if (paid) {
      const lines = ['ありがとう', 'どうも〜', 'ごちそうさま', 'また来ます', '（会釈）'];
      this.char.say(lines[Math.floor(Math.random() * lines.length)], g.time, 2);
      if (this.mood >= 0.5) g.state.addRep(0.35);
      else if (this.mood < -1.5) g.state.addRep(-0.6);
    }
    this.leave();
  }

  leave(): void {
    this.m.removeFromQueue(this);
    this.state = 'leaving';
    this.char.holdPose = false;
    this.go(P.doorInside) || this.go(this.exitVia);
    this.timer = 0;
  }

  /** Customer gives up and walks out, putting shopping back. */
  abandon(reason: string): void {
    const g = this.m.g;
    if (g.checkout.customer === this) g.checkout.abandon();
    for (const b of [...this.basket]) this.returnItem(b.productId);
    this.char.say(reason, g.time, 3, 'angry');
    this.char.gesture('angry', g.time);
    g.state.stats.lost += 1;
    g.state.addRep(-1);
    this.leave();
  }

  // ------------------------------------------------------------------ behaviour

  update(dt: number, time: number): void {
    const g = this.m.g;
    const c = this.char;
    switch (this.state) {
      case 'enter':
        if (!c.moving) {
          if (!this.entered) {
            this.entered = true;
            this.go(P.doorInside.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, -0.3)));
            return;
          }
          this.onEntered(time);
        }
        break;
      case 'browse':
        if (!c.moving) this.nextTarget(time);
        else if (c.stuck > 3) {
          c.stuck = 0;
          this.nextTarget(time);
        }
        break;
      case 'taking':
        if (time > this.timer) this.finishTake(time);
        break;
      case 'pause':
        if (time > this.timer) {
          this.state = 'browse';
          this.nextTarget(time);
        }
        break;
      case 'queue': {
        this.patience -= dt;
        const idx = this.m.queue.indexOf(this);
        const toRegister = idx === 0 && !g.checkout.busy;
        const key = toRegister ? -2 : idx;
        if (key !== this.queueIndex) {
          this.queueIndex = key;
          this.go(toRegister ? P.registerCustomer : P.queue[Math.min(idx, P.queue.length - 1)]);
        }
        if (this.queueIndex === -2 && !c.moving) {
          this.m.removeFromQueue(this);
          this.state = 'register';
          c.faceTowards(P.registerStaff);
          g.checkout.begin(this);
          if (this.claim) {
            c.say(this.claim.line, time, 6, 'angry');
            c.play('talk_angry');
            c.holdPose = true;
          } else {
            c.say(this.underage ? 'これください' : 'お願いします', time, 2);
            if (this.wantsHot) {
              this.hotState = 'asked';
              setTimeout(() => c.say(`あと、${product(this.wantsHot!).name}ひとつ`, g.time, 5), 900);
            }
          }
        } else if (!c.moving && idx >= 0) {
          c.faceTowards(P.registerCustomer.clone().add(new THREE.Vector3(0, 0, 3)));
          if (Math.random() < 0.003) c.gesture(Math.random() < 0.5 ? 'look' : 'scratch', time);
        }
        if (this.patience < 20 && Math.random() < 0.004) c.say('まだかな…', time, 2, 'thought');
        if (this.patience <= 0) this.abandon('遅い！もういいよ');
        break;
      }
      case 'register':
        if (!g.checkout.active && !(g.customers.partTimerOnDuty() && !this.claim)) this.patience -= dt;
        if (this.patience < 15 && Math.random() < 0.01) c.say(this.claim ? '店長まだ！？' : 'すみませーん！', time, 2, 'angry');
        if (this.patience <= 0) {
          if (this.claim) {
            g.state.addRep(-3, 'クレーム放置');
            g.ui.notify('クレームを放置してしまった… 評判 -3', 'bad');
            g.checkout.abandon();
            this.claim = null;
            this.char.say('二度と来るか！', time, 3, 'angry');
            this.leave();
          } else this.abandon('店員いないの？');
        }
        break;
      case 'wander':
        this.updateWander(time);
        break;
      case 'loiter':
        this.timer -= dt;
        g.state.addRep(-0.0015 * dt * 10);
        if (Math.random() < 0.002) c.say(['（ペラ…）', 'ふーん…', '（ニヤニヤ）'][Math.floor(Math.random() * 3)], time, 2, 'thought');
        if (this.timer <= 0) {
          c.holdPose = false;
          this.leave();
        }
        break;
      case 'exitSneak':
        if (!c.moving) {
          // made it out with the goods
          if (this.concealed.length) {
            let loss = 0;
            for (const it of this.concealed) loss += g.state.price(it.productId);
            g.state.stats.theft += loss;
            if (g.state.has('camera') || this.detected) g.ui.notify(`🚨 万引きされました… 被害 ${yen(loss)}`, 'bad', 6000);
            this.concealed = [];
          }
          this.state = 'leaving';
          this.go(this.exitVia);
        }
        break;
      case 'flee':
        if (!c.moving) this.despawn();
        break;
      case 'leaving':
        if (c.stuck > 5) {
          this.despawn();
          break;
        }
        if (!c.moving) {
          if (this.pos.z < 5.5) this.go(this.exitVia);
          else this.despawn();
        }
        break;
    }
  }

  private despawn(): void {
    this.state = 'gone';
    this.m.removeFromQueue(this);
    this.char.dispose();
  }

  private onEntered(time: number): void {
    const g = this.m.g;
    g.audio.doorChime(new THREE.Vector3(-4.5, 2.2, 5));
    g.dirt.onEnter();
    // first impression: cleanliness
    const dirt = g.dirt.count();
    if (dirt >= 3) {
      this.mood -= 1;
      if (Math.random() < 0.4) this.char.say('床、汚いな…', time, 2.5, 'thought');
    }
    switch (this.type) {
      case 'claimer':
        this.claim = this.m.makeClaim();
        this.state = 'queue';
        this.m.queue.push(this);
        this.patience = 90;
        return;
      case 'loiterer': {
        const spot = P.magazineSpots[Math.floor(Math.random() * P.magazineSpots.length)];
        this.go(spot);
        this.state = 'browse';
        this.shopping = [];
        this.loiterSpot = spot;
        return;
      }
      case 'drunk':
        this.wanderLeft = 3 + Math.floor(Math.random() * 3);
        this.state = 'wander';
        this.char.say(['ういー…ヒック', 'おーい、ビールどこだぁ？', 'へへへ…'][Math.floor(Math.random() * 3)], time, 3);
        this.nextWander();
        return;
      default:
        this.state = 'browse';
        this.nextTarget(time);
    }
  }

  private loiterSpot: THREE.Vector3 | null = null;

  private nextWander(): void {
    const pts = [new THREE.Vector3(-5.2, 0, 0), new THREE.Vector3(-3.8, 0, -3.5), new THREE.Vector3(1.5, 0, 1.3), new THREE.Vector3(-1.4, 0, -1.0), new THREE.Vector3(-1.4, 0, 3.6), new THREE.Vector3(2.8, 0, -3.3)];
    this.go(pts[Math.floor(Math.random() * pts.length)]);
  }

  private updateWander(time: number): void {
    const g = this.m.g;
    const c = this.char;
    if (c.moving) return;
    if (c.busy(time)) return;
    if (this.wanderLeft-- <= 0) {
      // finally buys beer
      this.shopping = ['beer', 'chuhai'].filter(() => Math.random() < 0.7);
      if (!this.shopping.length) this.shopping = ['beer'];
      this.state = 'browse';
      this.nextTarget(time);
      return;
    }
    const r = Math.random();
    if (r < 0.3) {
      // knocks items off a nearby shelf
      const near = g.store.slots.filter((s) => s.items.length > 2 && s.access.distanceTo(this.pos) < 2.2 && s.zone === 'shelf');
      const s = near[Math.floor(Math.random() * near.length)];
      if (s) {
        const p = s.product!;
        const n = Math.min(s.items.length, 2 + Math.floor(Math.random() * 3));
        for (let i = 0; i < n; i++) s.takeBack();
        g.instancer.markDirty(p.id);
        g.state.stats.waste += p.cost * n;
        g.state.stats.wasteItems += n;
        g.dirt.spawn('spill', this.pos.x, this.pos.z);
        g.audio.play('box_drop2', { pos: this.pos.clone().setY(1), volume: 0.7 });
        c.say('おっとっと…ヒック', time, 2.5);
        g.ui.notify(`酔っ払いが ${p.name} を落として散らかした！`, 'warn');
      }
    } else if (r < 0.45 && !this.vomited) {
      this.vomited = true;
      c.gesture('crouch', time);
      g.dirt.spawn('vomit', this.pos.x + 0.3, this.pos.z + 0.2);
      c.say('うっ…', time, 2);
      g.state.addRep(-0.5);
    } else {
      c.say(['ヒック', '店員さ〜ん', 'いい店だねぇ〜'][Math.floor(Math.random() * 3)], time, 2);
      c.gesture('talk', time);
    }
    this.timer = time + 2;
    setTimeout(() => this.state === 'wander' && this.nextWander(), 2200);
  }
  private vomited = false;

  private nextTarget(time: number): void {
    const g = this.m.g;
    const c = this.char;
    // loiterer arrives at magazine spot
    if (this.type === 'loiterer' && this.loiterSpot) {
      this.loiterSpot = null;
      this.state = 'loiter';
      this.timer = 90 + Math.random() * 120;
      c.faceHeading(0);
      c.holdPose = true;
      c.play('read', 0.4);
      return;
    }
    while (this.shopping.length) {
      const id = this.shopping[0];
      const slot = this.m.findSlot(id, this.pos);
      if (slot) {
        this.target = slot;
        if (!this.go(slot.access)) {
          this.shopping.shift();
          continue;
        }
        this.state = 'taking';
        this.timer = Number.POSITIVE_INFINITY;
        this.waitArrive = true;
        return;
      }
      // out of stock
      this.shopping.shift();
      this.mood -= 0.8;
      g.state.stats.events.push(`品切れ: ${product(id).name}`);
      if (Math.random() < 0.6) c.say(`${product(id).name}、売り切れか…`, time, 2.5, 'thought');
      g.state.addRep(-0.25);
      this.m.recordMissed(id);
      // try a substitute from the same category
      const sub = PRODUCTS.find((p) => p.category === product(id).category && p.id !== id && p.rank <= g.state.rank && this.m.findSlot(p.id, this.pos));
      if (sub && Math.random() < 0.5) this.shopping.unshift(sub.id);
      this.state = 'pause';
      this.timer = time + 1.2;
      c.gesture('shrug', time);
      return;
    }
    // done shopping
    if (this.type === 'thief') {
      if (this.concealed.length) {
        this.state = 'exitSneak';
        this.go(P.doorOutside);
        return;
      }
    }
    if (!this.basket.length) {
      if (Math.random() < 0.5) c.say('欲しいもの無かったな', time, 2.5, 'thought');
      this.mood -= 0.5;
      this.leave();
      return;
    }
    this.state = 'queue';
    this.queueIndex = -1;
    this.m.queue.push(this);
  }

  private waitArrive = false;

  /** Called each frame while walking to a shelf in the 'taking' state. */
  arriveCheck(time: number): void {
    if (this.state !== 'taking' || !this.waitArrive) return;
    const c = this.char;
    if (c.moving && c.stuck < 3) return;
    c.stuck = 0;
    this.waitArrive = false;
    const s = this.target!;
    c.faceTowards(s.frame.getWorldPosition(new THREE.Vector3()));
    const low = s.level === 0 && s.zone !== 'freezer' && s.zone !== 'magazine';
    const d = c.gesture(low ? 'crouch' : 'take', time);
    this.timer = time + Math.min(1.6, low ? 1.4 : d * 0.55 || 1.2);
    s.onTouch?.();
  }

  private finishTake(time: number): void {
    const g = this.m.g;
    const c = this.char;
    const s = this.target;
    const id = this.shopping.shift();
    this.state = 'browse';
    if (!s || !id) return;
    if (s.productId !== id || !s.items.some((i) => i.expiry > g.state.day)) {
      // someone else took the last one
      this.shopping.unshift(id);
      this.nextTarget(time);
      return;
    }
    // expired goods on display annoy people
    if (s.expiredCount(g.state.day) > 0) {
      this.mood -= 1;
      c.say('これ、期限切れてる…', time, 2.5, 'thought');
      g.state.addRep(-0.4);
    }
    const p = product(id);
    const price = g.state.price(id);
    const ratio = price / p.price;
    const accept = this.type === 'thief' ? 1 : ratio <= 1 ? 1 : Math.exp(-4 * Math.pow(ratio - 1, 1.2));
    if (Math.random() > accept) {
      c.say(`${yen(price)}か…高いな`, time, 2.5, 'thought');
      this.mood -= 0.4;
      if (ratio > 1.3) g.state.addRep(-0.15);
      this.nextTarget(time);
      return;
    }
    // take oldest non-expired
    const idx = s.items.findIndex((i) => i.expiry > g.state.day);
    const item = s.items.splice(idx, 1)[0];
    g.instancer.markDirty(id);
    if (this.type === 'thief' && (p.price >= 180 || Math.random() < 0.5) && this.concealed.length < 2) {
      this.concealed.push({ productId: id, expiry: item.expiry });
      c.gesture('look', time);
      if (g.state.has('camera')) {
        this.detected = true;
        c.marker = 'thief';
        g.audio.errorBuzz();
        g.ui.notify('🎥 防犯カメラ: 商品を隠した客がいます！（赤マーク）', 'bad', 6000);
      }
    } else {
      this.basket.push({ productId: id, expiry: item.expiry, slot: s });
      if (this.basket.length === 1) this.m.showBasket(this);
    }
    if (Math.random() < 0.25) {
      this.state = 'pause';
      this.timer = time + 0.8 + Math.random() * 1.5;
      if (Math.random() < 0.5) c.gesture('look', time);
    } else this.nextTarget(time);
  }
}

/** Spawning, queueing and the special-customer interactions. */
export class Customers {
  list: Customer[] = [];
  queue: Customer[] = [];
  private spawnAcc = 0;
  private missed: Record<string, number> = {};
  private partTimer: Character | null = null;

  constructor(readonly g: Game) {}

  clear(): void {
    for (const c of this.list) c.char.dispose();
    this.list = [];
    this.queue = [];
    this.g.checkout.abandon();
  }

  characters(): Character[] {
    const out = this.list.filter((c) => c.state !== 'gone').map((c) => c.char);
    if (this.g.deliveries.driver) out.push(this.g.deliveries.driver);
    return out;
  }

  proxies(): THREE.Object3D[] {
    return this.list.filter((c) => c.state !== 'gone').map((c) => c.proxy);
  }

  queueLength(): number {
    return this.queue.length + (this.g.checkout.customer ? 1 : 0);
  }

  removeFromQueue(c: Customer): void {
    const i = this.queue.indexOf(c);
    if (i >= 0) this.queue.splice(i, 1);
  }

  recordMissed(id: string): void {
    this.missed[id] = (this.missed[id] ?? 0) + 1;
  }

  partTimerOnDuty(): boolean {
    const h = this.g.state.minute / 60;
    return this.g.state.has('parttimer') && h >= 9 && h < 17;
  }

  findSlot(id: string, from: THREE.Vector3): Slot | null {
    const today = this.g.state.day;
    let best: Slot | null = null;
    let bd = Infinity;
    for (const s of this.g.store.slots) {
      if (s.productId !== id) continue;
      if (!s.items.some((i) => i.expiry > today)) continue;
      const d = s.access.distanceTo(from) + Math.random() * 1.5;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  showBasket(c: Customer): void {
    c.char.basket.add(basketMesh());
    // normalise scale regardless of the bone's world scale
    c.char.root.updateMatrixWorld(true);
    const ws = new THREE.Vector3();
    c.char.basket.getWorldScale(ws);
    const b = c.char.basket.children[c.char.basket.children.length - 1];
    b.scale.setScalar(1 / Math.max(ws.x, 1e-4));
    b.rotation.set(0, 0, Math.PI / 2);
  }

  makeClaim(): Claim {
    const g = this.g;
    const today = g.state.day;
    let expired = 0;
    for (const s of g.store.slots) expired += s.expiredCount(today);
    let ratioSum = 0;
    let n = 0;
    for (const p of g.products) {
      ratioSum += g.state.price(p.id) / p.price;
      n++;
    }
    const avgRatio = ratioSum / Math.max(1, n);
    const all: Claim[] = [
      { kind: 'expired', line: 'ちょっと！期限切れの商品が並んでるじゃないか！', valid: expired > 0 },
      { kind: 'dirty', line: '床が汚れてて滑りそうになったぞ！どうなってるんだ！', valid: g.dirt.count() >= 2 },
      { kind: 'wait', line: 'この前レジでずいぶん待たされたんだけど！', valid: g.state.stats.lost >= 2 },
      { kind: 'price', line: 'この店、ほかより高すぎない？ぼったくりでしょ', valid: avgRatio > 1.15 },
      { kind: 'rude', line: 'さっきの店員の態度、最悪だったんだけど！', valid: false },
    ];
    // prefer claims that are actually true
    const valid = all.filter((c) => c.valid);
    const pool = valid.length && Math.random() < 0.7 ? valid : all;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async handleClaim(c: Customer): Promise<void> {
    const g = this.g;
    if (!c.claim || c.talkedTo) return;
    c.talkedTo = true;
    const claim = c.claim;
    const choice = await g.dialog.ask('クレームのお客様', `「${claim.line}」`, [
      { text: '大変申し訳ございません。すぐに対応いたします。', hint: '謝罪' },
      { text: 'ご迷惑をおかけしました。こちらお詫びの商品券です。', hint: '-¥500' },
      { text: 'そのような事実はございません。', hint: '毅然と対応' },
    ]);
    const t = g.time;
    c.char.holdPose = false;
    if (choice === 0) {
      if (claim.valid) {
        g.state.addRep(1, 'クレームに誠実に対応');
        c.char.say('…ちゃんと直しなさいよ', t, 3);
        g.ui.notify('誠実な対応で納得してもらえた。評判 +1', 'good');
      } else {
        c.char.say('…まあいいわ', t, 3);
      }
    } else if (choice === 1) {
      g.state.money -= 500;
      g.state.stats.refunds += 500;
      if (claim.valid) {
        g.state.addRep(2, 'クレームにお詫び');
        c.char.say('そこまで言うなら…', t, 3);
        g.ui.notify('お詫びで満足してもらえた。評判 +2', 'good');
      } else {
        c.char.say('へへ、どうも', t, 3);
        g.ui.notify('言いがかりだったようだ…（-¥500）', 'warn');
      }
    } else {
      if (claim.valid) {
        g.state.addRep(-4, 'クレームに逆ギレ');
        c.char.gesture('angry', t);
        c.char.say('なんだその態度は！本部に言うからな！', t, 3.5, 'angry');
        g.ui.notify('事実だったのに突っぱねてしまった… 評判 -4', 'bad');
      } else {
        g.state.addRep(0.5);
        c.char.say('…ふん！', t, 2.5, 'angry');
        g.ui.notify('言いがかりを毅然と退けた。', 'good');
      }
    }
    c.claim = null;
    if (g.checkout.customer === c) g.checkout.abandon();
    c.leave();
  }

  promptFor(obj: THREE.Object3D): PromptInfo | null {
    const c = this.list.find((x) => x.proxy === obj);
    if (!c || c.state === 'gone' || c.state === 'leaving' || c.state === 'flee') return null;
    const label = {
      normal: 'お客さん', drunk: '酔っ払い客', claimer: 'ご立腹のお客さん', thief: 'お客さん', loiterer: '立ち読み客', underage: '若いお客さん',
    }[c.type];
    if (c.type === 'drunk' && !c.talkedTo) return { title: label, sub: 'ふらふらしている…', keys: [['E', '声をかける']] };
    if (c.type === 'loiterer' && c.state === 'loiter' && !c.talkedTo) return { title: label, sub: '長時間立ち読みしている', keys: [['E', '注意する']] };
    if (c.type === 'claimer' && c.claim && !c.talkedTo) return { title: label, sub: 'なにやら怒っている', keys: [['E', '話を聞く']] };
    if (c.type === 'thief' && (c.concealed.length || c.state === 'exitSneak') && !c.talkedTo) return { title: label, sub: c.detected ? '🎥 商品を隠した！' : 'きょろきょろしている…', keys: [['E', '声をかける']] };
    if (!c.greeted) return { title: label, keys: [['E', 'いらっしゃいませ！']] };
    return { title: label };
  }

  async interact(obj: THREE.Object3D): Promise<void> {
    const g = this.g;
    const c = this.list.find((x) => x.proxy === obj);
    if (!c) return;
    const t = g.time;
    if (c.type === 'claimer' && c.claim) return this.handleClaim(c);
    if (c.type === 'drunk' && !c.talkedTo) {
      c.talkedTo = true;
      const ch = await g.dialog.ask('酔っ払い客', '「ういー…ヒック。おう、にいちゃん、この店いい店だなぁ〜」', [
        { text: 'お客様、大丈夫ですか？お水をどうぞ。', hint: '-¥120' },
        { text: '他のお客様のご迷惑になりますので…', hint: '注意' },
        { text: 'これ以上騒ぐなら警察を呼びますよ。', hint: '強硬' },
      ]);
      if (ch === 0) {
        g.state.money -= 120;
        g.state.addRep(0.5);
        c.char.say('おぉ…ありがとなぁ…帰るわ', t, 3);
        c.shopping = ['beer'];
        c.state = 'browse';
        (c as unknown as { wanderLeft: number }).wanderLeft = 0;
        c.leave();
      } else if (ch === 1) {
        if (Math.random() < 0.55) {
          c.char.say('へいへい…わかったよぉ', t, 3);
          c.leave();
        } else {
          c.char.gesture('talk_angry', t);
          c.char.say('なんだとぉ！客に向かって！', t, 3, 'angry');
          g.state.addRep(-1);
          setTimeout(() => c.state !== 'gone' && c.leave(), 3500);
        }
      } else {
        c.char.say('ちっ、わかったよ！', t, 2.5, 'angry');
        g.state.addRep(-0.3);
        c.leave();
      }
      return;
    }
    if (c.type === 'loiterer' && c.state === 'loiter' && !c.talkedTo) {
      c.talkedTo = true;
      const ch = await g.dialog.ask('立ち読み客', '（雑誌を熱心に読んでいる…）', [
        { text: '申し訳ありません、立ち読みはご遠慮いただいております。' },
        { text: '（そっとしておく）' },
      ]);
      if (ch === 0) {
        c.char.holdPose = false;
        const r = Math.random();
        if (r < 0.35) {
          c.char.say('あ、じゃあこれ買います', t, 2.5);
          c.state = 'browse';
          c.shopping = [Math.random() < 0.5 ? 'magazine' : 'manga'];
          c.char.play('idle');
        } else if (r < 0.75) {
          c.char.say('すみません…', t, 2);
          c.leave();
        } else {
          c.char.say('ちっ、うるせーな', t, 2.5, 'angry');
          c.timer = 25;
          c.char.holdPose = true;
        }
      }
      return;
    }
    if (c.type === 'thief' && (c.concealed.length || c.state === 'exitSneak') && !c.talkedTo) {
      c.talkedTo = true;
      const ch = await g.dialog.ask('挙動不審な客', '（ポケットが不自然に膨らんでいる…）', [
        { text: 'お客様、お会計がお済みでない商品はございませんか？' },
        { text: '（気のせいかもしれない…見逃す）' },
      ]);
      if (ch === 0) {
        const success = c.detected ? 0.75 : 0.5;
        if (c.concealed.length && Math.random() < success) {
          for (const it of c.concealed) {
            const p = product(it.productId);
            const slot = g.store.slots.find((s) => s.productId === p.id && s.canAccept(p));
            if (slot) {
              slot.add(p, { expiry: it.expiry });
              g.instancer.markDirty(p.id);
            }
          }
          c.concealed = [];
          c.char.say('す、すみません…', t, 3);
          g.state.addRep(1, '万引きを未然に防いだ');
          g.ui.notify('商品を取り戻した！ 評判 +1', 'good');
          c.leave();
        } else if (c.concealed.length) {
          c.char.say('やべっ！', t, 1.5, 'angry');
          c.state = 'flee';
          c.char.moveAnim = 'run';
          c.char.speed = 3.8;
          c.char.marker = 'thief';
          let loss = 0;
          for (const it of c.concealed) loss += g.state.price(it.productId);
          g.state.stats.theft += loss;
          c.concealed = [];
          g.ui.notify(`万引き犯に逃げられた… 被害 ${yen(loss)}`, 'bad');
          c.go(new THREE.Vector3(-15, 0, 17));
          this.removeFromQueue(c);
        } else {
          c.char.say('は？なにもしてないけど？', t, 3, 'angry');
          g.state.addRep(-1.5, '無実の客を疑った');
        }
      }
      return;
    }
    if (!c.greeted) {
      c.greeted = true;
      c.mood += 0.4;
      g.audio.uiConfirm();
      c.char.say(Math.random() < 0.5 ? '（会釈）' : 'どうも', t, 1.6);
    }
  }

  bubbles(): BubbleSource[] {
    const out: BubbleSource[] = [];
    for (const c of this.list) {
      if (c.state === 'gone') continue;
      const b = c.char.bubble;
      const marker = c.char.marker === 'thief' ? '🔴' : undefined;
      out.push({ id: c.id, anchor: c.char.head, text: b?.text ?? null, tone: b?.tone ?? 'normal', marker });
    }
    const d = this.g.deliveries.driver;
    if (d?.bubble) out.push({ id: -1, anchor: d.head, text: d.bubble.text, tone: 'normal' });
    if (this.partTimer?.bubble) out.push({ id: -2, anchor: this.partTimer.head, text: this.partTimer.bubble.text, tone: 'normal' });
    return out;
  }

  // ------------------------------------------------------------------ spawning

  tickMinute(): void {
    const g = this.g;
    const s = g.state;
    const hour = Math.floor(s.minute / 60);
    let rate = RATE[Math.min(hour, RATE.length - 1)];
    rate *= 0.45 + s.reputation / 90;
    if (s.weather === 'rain') rate *= 0.75;
    if (s.has('led') && (hour >= 19 || hour < 5)) rate *= 1.15;
    rate *= 1 + (s.rank - 1) * 0.12;
    this.spawnAcc += rate / 60;
    const inside = this.list.filter((c) => c.state !== 'gone').length;
    if (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (inside < 8) this.spawn();
    }
    // part timer presence
    const duty = this.partTimerOnDuty();
    if (duty && !this.partTimer) {
      this.partTimer = new Character(g.assets, 'Female_Adult_12', g.store.m.shadow);
      this.partTimer.root.position.set(5.05, 0, 1.75);
      this.partTimer.faceHeading(-Math.PI / 2);
      g.store.root.add(this.partTimer.root);
    } else if (!duty && this.partTimer) {
      this.partTimer.dispose();
      this.partTimer = null;
    }
  }

  spawn(force?: Archetype): Customer | null {
    const g = this.g;
    const s = g.state;
    const night = s.minute >= 22 * 60 || s.minute < 5 * 60;
    let type: Archetype = 'normal';
    if (force) type = force;
    else if (Math.random() < (night ? 0.3 : 0.06) * (s.day === 1 && s.minute < 12 * 60 ? 0 : 1)) {
      const table: [Archetype, number][] = night
        ? [['drunk', 0.3], ['loiterer', 0.25], ['thief', 0.2], ['claimer', 0.1], ['underage', 0.15]]
        : [['thief', 0.35], ['claimer', 0.3], ['loiterer', 0.25], ['underage', 0.1]];
      let r = Math.random();
      for (const [t, w] of table) {
        if ((r -= w) <= 0) {
          type = t;
          break;
        }
      }
      if (this.list.some((c) => c.type === type && c.state !== 'gone')) type = 'normal';
    }
    const used = new Set(this.list.filter((c) => c.state !== 'gone').map((c) => c.char.avatar));
    const pool = POOLS[type].filter((a) => !used.has(a));
    const avatar = (pool.length ? pool : POOLS[type])[Math.floor(Math.random() * (pool.length || POOLS[type].length))];
    const c = new Customer(this, type, avatar);
    c.shopping = this.makeList(type);
    if (type === 'normal' || type === 'underage') {
      const band = s.band();
      const hotChance = [0.12, 0.3, 0.28, 0.15][band];
      if (Math.random() < hotChance) {
        const hots = PRODUCTS.filter((p) => p.zone === 'hot' && p.rank <= s.rank);
        c.wantsHot = weighted(hots, (p) => p.demand[band])?.id ?? null;
      }
    }
    this.list.push(c);
    return c;
  }

  private makeList(type: Archetype): string[] {
    const g = this.g;
    const s = g.state;
    const band = s.band();
    if (type === 'underage') return ['beer', Math.random() < 0.5 ? 'chips' : 'chuhai'];
    if (type === 'thief') return pickN(g.products.filter((p) => p.zone !== 'hot'), 2, (p) => p.price * p.demand[band]).map((p) => p.id);
    if (type === 'claimer' || type === 'loiterer' || type === 'drunk') return [];
    const r = Math.random();
    const n = r < 0.4 ? 1 : r < 0.75 ? 2 : r < 0.93 ? 3 : 4;
    const hotDay = s.weather === 'sunny' ? 1.25 : 1;
    const cands = g.products.filter((p) => p.zone !== 'hot');
    return pickN(cands, n, (p) => {
      let w = p.demand[band];
      if (p.category === 'ice' || p.category === 'drink') w *= hotDay;
      if (p.age && band < 2) w *= 0.2;
      // habit: people come back for things you stock well
      w *= 1 + Math.min(1, (this.missed[p.id] ?? 0) * 0.05);
      return w;
    }).map((p) => p.id);
  }

  update(dt: number, time: number): void {
    const chars = this.characters();
    for (const c of this.list) {
      if (c.state === 'gone') continue;
      c.update(dt, time);
      c.arriveCheck(time);
      c.char.update(dt, time, chars, c.state === 'flee' ? null : this.g.store.col);
    }
    this.partTimer?.update(dt, time, [], null);
    // purge gone customers
    if (this.list.length > 20) this.list = this.list.filter((c) => c.state !== 'gone');
  }
}

function weighted<T>(list: T[], w: (x: T) => number): T | null {
  const total = list.reduce((a, x) => a + w(x), 0);
  let r = Math.random() * total;
  for (const x of list) {
    if ((r -= w(x)) <= 0) return x;
  }
  return list[list.length - 1] ?? null;
}

function pickN<T>(list: T[], n: number, w: (x: T) => number): T[] {
  const pool = [...list];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const x = weighted(pool, w)!;
    out.push(x);
    pool.splice(pool.indexOf(x), 1);
  }
  return out;
}

export type { AnimName, ProductDef };

let basketGeo: THREE.BufferGeometry | null = null;
let basketMat: THREE.MeshStandardMaterial | null = null;

/** Open-top plastic shopping basket with a grid pattern and a handle. */
function basketMesh(): THREE.Object3D {
  if (!basketGeo || !basketMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#000';
    for (let y = 8; y < 64; y += 16) for (let x = 6; x < 64; x += 16) ctx.fillRect(x, y, 10, 8);
    const alpha = new THREE.CanvasTexture(c);
    alpha.wrapS = alpha.wrapT = THREE.RepeatWrapping;
    alpha.repeat.set(4, 2);
    basketMat = new THREE.MeshStandardMaterial({ color: '#d32f2f', roughness: 0.45, alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide });
    const W = 0.36, H = 0.19, D = 0.26;
    const parts: THREE.BufferGeometry[] = [];
    const wall = (w: number, x: number, z: number, ry: number) => {
      const g = new THREE.PlaneGeometry(w, H);
      g.rotateY(ry);
      g.translate(x, -H / 2, z);
      parts.push(g);
    };
    wall(W, 0, D / 2, 0);
    wall(W, 0, -D / 2, 0);
    wall(D, W / 2, 0, Math.PI / 2);
    wall(D, -W / 2, 0, Math.PI / 2);
    const bottom = new THREE.PlaneGeometry(W, D);
    bottom.rotateX(-Math.PI / 2);
    bottom.translate(0, -H, 0);
    parts.push(bottom);
    basketGeo = mergeGeometries(parts)!;
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(basketGeo, basketMat);
  body.position.y = -0.1;
  body.castShadow = true;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.01, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#b71c1c', roughness: 0.4 }));
  handle.position.y = -0.1;
  g.add(body, handle);
  return g;
}
