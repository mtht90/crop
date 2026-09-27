import * as THREE from 'three';
import { ARCHETYPES, SURNAMES, type Archetype } from '../data/customers';
import { itemDef } from '../data/items';
import { line } from '../data/dialogue';
import { audio } from '../core/audio';
import { events, toast } from '../core/events';
import { rng, uid, yen } from '../core/util';
import { Customer, type CustomerRole } from '../entities/customer';
import { buyChance, sellerTerms } from '../game/pricing';
import { SPOTS } from '../world/layout';
import type { SlotRuntime } from '../world/fixtureView';
import type { Game } from '../game/game';

/** 来店客の出現と行動 AI */
export class CustomerManager {
  readonly list: Customer[] = [];
  readonly sellQueue: Customer[] = [];
  readonly buyQueue: Customer[] = [];
  private spawnAcc = 0;
  /** 同じ商品を複数の客が狙わないよう予約 */
  private reserved = new Set<string>();

  constructor(private g: Game) {}

  get count() { return this.list.length; }

  positions(): THREE.Vector3[] {
    return [...this.list.map((c) => c.pos), this.g.player.pos];
  }

  // ───── 出現 ─────
  /** 1 ゲーム分あたりの来店率 */
  private rate(): number {
    const s = this.g.model.state;
    let perHour = 3.2 + s.reputation / 16 + s.level * 0.45;
    if (this.g.model.has('sign')) perHour *= 1.25;
    if (this.g.model.has('expand')) perHour *= 1.2;
    return perHour / 60;
  }

  update(dt: number, gameMinutes: number) {
    const s = this.g.model.state;
    if (s.phase === 'open' && s.minute < this.g.model.closeMinute() - 20) {
      this.spawnAcc += this.rate() * gameMinutes;
      const cap = 9 + (this.g.model.has('expand') ? 4 : 0);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.list.length < cap) this.spawn();
      }
    }
    // 他の客との接近で減速
    for (const c of this.list) {
      c.slow = 1;
      if (!c.moving) continue;
      const next = c.path[0];
      const dir = new THREE.Vector3(next.x - c.pos.x, 0, next.z - c.pos.z).normalize();
      for (const o of this.list) {
        if (o === c) continue;
        const d = new THREE.Vector3(o.pos.x - c.pos.x, 0, o.pos.z - c.pos.z);
        const dist = d.length();
        if (dist < 0.6 && d.dot(dir) > 0.2 && (o.moving === false || c.id > o.id)) c.slow = Math.min(c.slow, dist < 0.35 ? 0.1 : 0.45);
      }
    }
    for (const c of [...this.list]) {
      c.update(dt);
      this.think(c, dt, gameMinutes);
    }
  }

  spawn(forceRole?: CustomerRole, forceArch?: string): Customer | null {
    const m = this.g.model;
    const hour = m.state.minute / 60;
    const pool = ARCHETYPES.filter((a) => a.minLevel <= m.state.level && (!a.hours || (hour >= a.hours[0] && hour < a.hours[1])));
    const arch = forceArch ? ARCHETYPES.find((a) => a.id === forceArch)! : rng.weighted(pool, (a) => a.rarity);
    let sellW = arch.sellWeight * (m.has('flyer') ? 1.4 : 1);
    if (this.sellQueue.length >= 3) sellW = 0;
    const role: CustomerRole = forceRole ?? (rng.next() * (sellW + arch.buyWeight) < sellW ? 'seller' : 'buyer');
    if (role === 'seller' && arch.sellWeight === 0 && !forceRole) return null;
    const side = rng.chance(0.5) ? SPOTS.outsideLeft : SPOTS.outsideRight;
    const c = new Customer(uid('c'), `${rng.pick(SURNAMES)}さん`, arch, role, rng.pick(arch.models), side.clone().add(new THREE.Vector3(rng.range(-2, 2), 0, rng.range(-0.4, 0.4))));
    this.g.engine.scene.add(c.root);
    this.list.push(c);
    this.g.model.state.today.customers++;
    if (role === 'seller') {
      c.sellItem = m.rollSellItem({ careful: arch.careful, fakeRate: arch.fakeRate, fav: arch.fav, flyer: m.has('flyer') });
    }
    c.state = 'enter';
    c.stateTime = 0;
    c.goTo(this.g.world.nav.findPath(c.pos, SPOTS.doorInside));
    return c;
  }

  // ───── 行動 ─────
  private patienceRate(c: Customer) {
    let r = (1 - c.arch.patience) * 0.012 + 0.004;
    if (this.g.model.has('aircon')) r *= 0.8;
    const f = this.g.model.state.fixtures;
    if (f.some((x) => x.defId === 'bench_decor')) r *= 0.92;
    r *= 1 - Math.min(0.1, f.filter((x) => x.defId === 'plant_decor').length * 0.02);
    return r;
  }

  private think(c: Customer, _dt: number, gm: number) {
    const s = this.g.model.state;
    const closing = s.phase !== 'open' || s.minute >= this.g.model.closeMinute();
    switch (c.state) {
      case 'enter':
        if (!c.moving) {
          if (c.stateTime > 0.3) {
            if (rng.chance(0.4)) c.say(line('enter'), 2);
            if (c.role === 'seller') this.joinSellQueue(c);
            else this.startBrowse(c);
          }
        }
        break;

      // ── 買い物客 ──
      case 'browse':
        if (closing) { this.finishBrowsing(c); break; }
        if (!c.moving) {
          c.state = 'look';
          c.stateTime = 0;
          c.gesture('Interact', 'Idle');
        }
        break;
      case 'look':
        if (c.stateTime > 1.8) {
          c.pendingDecision?.();
          c.pendingDecision = null;
        }
        break;
      case 'toRegister':
      case 'queue':
        c.patience -= this.patienceRate(c) * gm * 0.6;
        if (!c.moving) {
          if (c.queueIndex === 0) {
            c.state = 'checkout';
            c.lookTarget = new THREE.Vector3(SPOTS.registerCounter.x + 1, 0, SPOTS.registerCounter.z);
            c.play('Idle');
            this.g.checkout.onCustomerReady(c);
          } else {
            c.state = 'queue';
            c.lookTarget = SPOTS.buyQueue[0];
          }
        }
        if (c.patience <= 0) this.abandonQueue(c);
        else if (c.patience < 0.3 && rng.chance(0.004)) c.say(line('queue'), 2, 'bad');
        break;
      case 'checkout':
        if (!this.g.checkout.busyWith(c)) c.patience -= this.patienceRate(c) * gm * 0.6;
        if (c.patience <= 0) this.abandonQueue(c);
        break;

      // ── 持ち込み客 ──
      case 'toCounter':
      case 'sellQueue':
        c.patience -= this.patienceRate(c) * gm * 0.45;
        if (!c.moving) {
          if (c.queueIndex === 0) {
            c.state = 'waitAppraisal';
            c.stateTime = 0;
            c.lookTarget = new THREE.Vector3(SPOTS.appraisalCounter.x - 1, 0, SPOTS.appraisalCounter.z);
            c.play('Idle');
            this.placeOnCounter(c);
            c.say(line(c.arch.id === 'shady' ? 'greetSellShady' : c.arch.id === 'phantom' ? 'greetSellPhantom' : 'greetSell'), 4);
          } else {
            c.state = 'sellQueue';
            c.lookTarget = SPOTS.sellQueue[0];
          }
        }
        if (c.patience <= 0) this.abandonSell(c);
        break;
      case 'waitAppraisal':
        c.patience -= this.patienceRate(c) * gm * 0.45;
        if (c.patience <= 0) this.abandonSell(c);
        break;
      case 'appraising':
        break;

      case 'leave':
        if (!c.moving) this.despawn(c);
        break;
    }
  }

  // ── 買い物 ──
  private startBrowse(c: Customer) {
    const slot = this.pickSlot(c);
    if (!slot) {
      c.visits++;
      if (c.visits > 2) { this.finishBrowsing(c); return; }
      // 店内をうろうろ
      c.state = 'browse';
      c.stateTime = 0;
      const p = new THREE.Vector3(rng.range(-1, 6), 0, rng.range(-4, 0));
      c.goTo(this.g.world.nav.findPath(c.pos, p));
      c.pendingDecision = () => this.startBrowse(c);
      return;
    }
    c.visits++;
    this.reserved.add(slot.item!.state.uid);
    const view = slot.fixture.viewPoint(slot);
    view.x += rng.range(-0.15, 0.15);
    c.state = 'browse';
    c.stateTime = 0;
    c.lookTarget = slot.anchor.getWorldPosition(new THREE.Vector3());
    c.goTo(this.g.world.nav.findPath(c.pos, view));
    c.pendingDecision = () => this.decide(c, slot);
  }

  private pickSlot(c: Customer): SlotRuntime | null {
    const slots = this.g.world.displayedSlots().filter((s) => s.item && !this.reserved.has(s.item.state.uid));
    if (!slots.length) return null;
    return rng.weighted(slots, (s) => {
      const d = itemDef(s.item!.state.defId);
      let w = c.arch.fav.includes(d.category) ? 3 : 1;
      if (!s.item!.state.price) w *= 0.5;
      return w;
    });
  }

  private decide(c: Customer, slot: SlotRuntime) {
    const it = slot.item?.state;
    if (it) this.reserved.delete(it.uid);
    if (it && slot.item) {
      const price = it.price;
      if (!price) {
        if (rng.chance(0.5)) c.say(line('noPrice'), 2.5);
      } else {
        const p = buyChance(this.g.model, it, c.arch, price, slot.fixture.def.prestige ?? 0);
        if (price <= c.budget && rng.chance(p)) {
          // 購入決定: 棚から取る
          this.g.world.destroyView(it.uid);
          it.loc = { type: 'customer', customer: c.id };
          c.basket.push(it);
          c.budget -= price;
          c.say(line('found'), 2.5, 'good');
          c.gesture('PickUp', 'Idle');
          audio.play('pickup', { volume: 0.4 });
        } else {
          c.rejects++;
          if (price > c.budget || p < 0.3) c.say(line('tooExpensive'), 2.5, 'bad');
          else if (rng.chance(0.3)) c.say(line('browse'), 2);
        }
      }
    }
    const moreChance = c.basket.length ? 0.3 : 0.75;
    if (c.visits < c.maxVisits && rng.chance(moreChance) && c.budget > 200) this.startBrowse(c);
    else this.finishBrowsing(c);
  }

  private finishBrowsing(c: Customer) {
    c.pendingDecision = null;
    if (c.basket.length) this.joinBuyQueue(c);
    else {
      if (c.rejects >= 2) this.g.model.addRep(-0.3);
      c.say(line('nothing'), 2.5);
      this.leave(c);
    }
  }

  private joinBuyQueue(c: Customer) {
    this.buyQueue.push(c);
    c.state = 'toRegister';
    c.setMoodVisible(true);
    this.repathQueue(this.buyQueue, SPOTS.buyQueue);
  }

  private repathQueue(q: Customer[], spots: THREE.Vector3[]) {
    q.forEach((c, i) => {
      if (c.queueIndex === i && (c.state === 'checkout' || c.state === 'waitAppraisal' || c.state === 'appraising')) return;
      c.queueIndex = i;
      const base = spots[Math.min(i, spots.length - 1)].clone();
      if (i >= spots.length) base.add(new THREE.Vector3(0.5 * (i - spots.length + 1), 0, -0.3));
      c.goTo(this.g.world.nav.findPath(c.pos, base));
      if (c.state === 'queue') c.state = 'toRegister';
      if (c.state === 'sellQueue') c.state = 'toCounter';
    });
  }

  /** レジ待ちを諦めて帰る: 商品は在庫へ */
  private abandonQueue(c: Customer) {
    for (const it of c.basket) it.loc = { type: 'stock' };
    if (c.basket.length) toast(`${c.name}が待ちくたびれて帰りました (商品は在庫に戻しました)`, 'bad', 'angry-eyes');
    c.basket = [];
    c.say(line('queueAngry'), 3, 'bad');
    c.gesture('Hit_A', 'Idle');
    this.g.model.addRep(-2);
    this.g.model.state.today.lostCustomers++;
    this.removeFromQueue(c);
    this.g.checkout.onCustomerLeft(c);
    this.leave(c, false);
  }

  /** 会計完了 */
  completePurchase(c: Customer) {
    c.basket = [];
    c.say(line('paid'), 3, 'good');
    c.gesture('Cheer', 'Idle');
    this.removeFromQueue(c);
    this.leave(c, true);
  }

  private removeFromQueue(c: Customer) {
    const qi = this.buyQueue.indexOf(c);
    if (qi >= 0) { this.buyQueue.splice(qi, 1); this.repathQueue(this.buyQueue, SPOTS.buyQueue); }
    const si = this.sellQueue.indexOf(c);
    if (si >= 0) { this.sellQueue.splice(si, 1); this.repathQueue(this.sellQueue, SPOTS.sellQueue); }
    c.queueIndex = -1;
    c.setMoodVisible(false);
  }

  // ── 持ち込み ──
  private joinSellQueue(c: Customer) {
    this.sellQueue.push(c);
    c.state = 'toCounter';
    c.setMoodVisible(true);
    this.repathQueue(this.sellQueue, SPOTS.sellQueue);
  }

  private placeOnCounter(c: Customer) {
    const slot = this.g.world.counterSlot();
    if (!slot || !c.sellItem) return;
    const it = c.sellItem;
    this.g.model.addItem(it);
    this.g.world.attachItem(it, slot);
    const t = sellerTerms(this.g.model, it, c.arch);
    c.negotiation = { ask: t.ask, reserve: t.reserve, rounds: 0, lastCounter: null };
    (c as any).knowsBroken = t.knowsBroken;
    audio.play('place', { volume: 0.5 });
  }

  /** 査定を始められる客 */
  appraisalCustomer(): Customer | null {
    const c = this.sellQueue[0];
    return c && (c.state === 'waitAppraisal' || c.state === 'appraising') ? c : null;
  }

  /** 査定終了。accepted=true なら品物は店のもの */
  finishAppraisal(c: Customer, result: 'accepted' | 'declined' | 'angry', happy = true) {
    const it = c.sellItem;
    if (it && result !== 'accepted') {
      this.g.world.destroyView(it.uid);
      this.g.model.removeItem(it.uid);
    }
    c.sellItem = null;
    if (result === 'accepted') {
      c.say(happy ? line('acceptHappy') : line('acceptGrudging'), 3, happy ? 'good' : 'normal');
      c.gesture(happy ? 'Cheer' : 'Idle', 'Idle');
    } else if (result === 'declined') {
      c.say(line('leaveDeclined'), 3);
    } else {
      c.say(line('leaveAngry'), 3, 'bad');
      c.gesture('Hit_A', 'Idle');
      this.g.model.state.today.lostCustomers++;
    }
    this.removeFromQueue(c);
    this.leave(c, result === 'accepted' && happy);
  }

  private abandonSell(c: Customer) {
    if (c.state === 'appraising') return;
    this.g.model.addRep(-1.5);
    toast(`${c.name}が待ちきれずに帰りました`, 'bad', 'angry-eyes');
    if (c.state === 'waitAppraisal') this.finishAppraisal(c, 'angry');
    else {
      c.say(line('leaveAngry'), 3, 'bad');
      this.removeFromQueue(c);
      this.leave(c, false);
    }
  }

  // ── 退店 ──
  leave(c: Customer, happy = true) {
    c.state = 'leave';
    c.pendingDecision = null;
    c.lookTarget = null;
    c.happy = happy;
    const out = c.pos.x < 0 ? SPOTS.outsideLeft : SPOTS.outsideRight;
    const path = this.g.world.nav.findPath(c.pos, SPOTS.doorOutside) ?? [];
    const path2 = this.g.world.nav.findPath(SPOTS.doorOutside, out) ?? [out.clone()];
    c.goTo([...path, ...path2]);
    events.emit('customer:left', { happy });
    if (happy) this.g.model.state.stats.customersServed++;
  }

  private despawn(c: Customer) {
    c.state = 'gone';
    c.dispose();
    this.list.splice(this.list.indexOf(c), 1);
  }

  /** 閉店時: 列に並んでいない客を帰す */
  closeShop() {
    for (const c of this.list) {
      if (c.state === 'browse' || c.state === 'look' || c.state === 'enter') {
        c.pendingDecision = null;
        this.finishBrowsing(c);
      }
    }
  }

  /** 全員を即座に消す (日付変更時) */
  clearAll() {
    for (const c of [...this.list]) {
      for (const it of c.basket) it.loc = { type: 'stock' };
      if (c.sellItem) { this.g.world.destroyView(c.sellItem.uid); this.g.model.removeItem(c.sellItem.uid); }
      c.dispose();
    }
    this.list.length = 0;
    this.sellQueue.length = 0;
    this.buyQueue.length = 0;
    this.reserved.clear();
  }

  /** 店内に客が残っているか */
  anyoneInside() { return this.list.some((c) => c.state !== 'leave'); }

  debugSummary() {
    return this.list.map((c) => `${c.name}(${c.arch.label}/${c.role}) ${c.state} p=${c.patience.toFixed(2)} basket=${c.basket.length} ${c.sellItem ? itemDef(c.sellItem.defId).name : ''} budget=${yen(c.budget)}`);
  }

  archetype(id: string): Archetype | undefined { return ARCHETYPES.find((a) => a.id === id); }
}
