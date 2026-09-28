import * as THREE from 'three';
import type { Game } from './Game';
import { DELIVERY_TIMES, type PendingOrder } from './State';
import { Character } from '../npc/Character';
import { P } from '../world/Layout';
import { product } from '../data/products';

/**
 * Scheduled deliveries. When orders fall due, a delivery driver walks in with
 * a hand truck, drops the cases in the back room and leaves.
 */
export class Deliveries {
  driver: Character | null = null;
  private phase: 'in' | 'drop' | 'out' | null = null;
  private waitUntil = 0;
  private carrying: PendingOrder[] = [];
  private cart: THREE.Object3D | null = null;

  constructor(private g: Game) {}

  reset(): void {
    this.driver?.dispose();
    this.driver = null;
    this.phase = null;
    this.carrying = [];
  }

  /** Next delivery slot (absolute minute) that is at least `lead` minutes away. */
  nextSlot(lead = 45): number {
    const s = this.g.state;
    for (let d = 0; d < 3; d++) {
      for (const t of DELIVERY_TIMES) {
        const abs = (s.day + d) * 1440 + t;
        if (abs - s.abs >= lead) return abs;
      }
    }
    return (s.day + 1) * 1440 + DELIVERY_TIMES[0];
  }

  nextArrival(): string | null {
    const s = this.g.state;
    if (!s.orders.length) return null;
    const t = Math.min(...s.orders.map((o) => o.arriveAt));
    const day = Math.floor(t / 1440);
    const m = t % 1440;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${day > s.day ? '明日 ' : ''}${hh}:${mm}`;
  }

  place(productId: string, cases: number, express: boolean): number {
    const s = this.g.state;
    const at = express ? s.abs + 30 : this.nextSlot();
    const existing = s.orders.find((o) => o.productId === productId && o.arriveAt === at);
    if (existing) existing.cases += cases;
    else s.orders.push({ productId, cases, arriveAt: at });
    return at;
  }

  tick(): void {
    const s = this.g.state;
    if (this.driver) return;
    const due = s.orders.filter((o) => o.arriveAt <= s.abs);
    if (!due.length) return;
    s.orders = s.orders.filter((o) => o.arriveAt > s.abs);
    this.carrying = due;
    this.spawnDriver();
  }

  private spawnDriver(): void {
    const g = this.g;
    const c = new Character(g.assets, 'Delivery_Male_01', g.store.m.shadow);
    c.root.position.copy(P.outsideSpawnR);
    c.speed = 1.5;
    g.store.root.add(c.root);
    this.driver = c;
    this.phase = 'in';
    // hand truck with stacked cases
    const cart = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: '#c0392b', metalness: 0.4, roughness: 0.5 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.04), frame);
    post.position.set(0, 0.6, -0.2);
    cart.add(post);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.3), frame);
    plate.position.set(0, 0.03, 0);
    cart.add(plate);
    const stackMat = new THREE.MeshStandardMaterial({ color: '#b98d5a', roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.3), stackMat);
      b.position.set(0, 0.2 + i * 0.29, 0);
      b.castShadow = true;
      cart.add(b);
    }
    cart.position.set(0, 0, 0.55);
    c.root.add(cart);
    this.cart = cart;
    c.goTo(g.store.nav.findPath(c.position, P.deliveryDrop, true));
    c.say('まいどー、お届けものでーす！', g.time, 3);
    g.audio.carPass();
    g.ui.notify('🚚 納品が到着しました。バックヤードの納品置場を確認しましょう。', 'info', 6000);
  }

  update(_dt: number, time: number): void {
    const c = this.driver;
    if (!c) return;
    c.update(_dt, time, this.g.customers.characters(), null);
    if (this.phase === 'in' && !c.moving) {
      this.phase = 'drop';
      this.waitUntil = time + 2.5;
      c.gesture('take', time);
      c.faceTowards(P.deliveryDrop.clone().add(new THREE.Vector3(0, 0, -1)));
    } else if (this.phase === 'drop' && time > this.waitUntil) {
      this.g.spawnDeliveryBoxes(this.carrying.map((o) => ({ productId: o.productId, cases: o.cases })));
      const names = this.carrying.map((o) => `${product(o.productId).name}×${o.cases}`).join('、');
      this.g.ui.notify(`📦 納品完了: ${names}`, 'good', 7000);
      this.g.audio.play('box_drop', { pos: P.deliveryDrop.clone(), volume: 0.8 });
      this.carrying = [];
      this.cart?.children.slice(2).forEach((b) => (b.visible = false));
      this.phase = 'out';
      c.say('ありがとうございましたー', time, 2.5);
      c.goTo(this.g.store.nav.findPath(c.position, P.outsideSpawnR, true));
    } else if (this.phase === 'out' && !c.moving) {
      c.dispose();
      this.driver = null;
      this.phase = null;
      this.tick();
    }
  }
}
