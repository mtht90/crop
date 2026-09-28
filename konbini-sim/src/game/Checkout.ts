import * as THREE from 'three';
import type { Game } from './Game';
import { PRODUCTS, product } from '../data/products';
import { productMesh } from '../world/ProductVisuals';
import { P, L } from '../world/Layout';
import { h, yen } from '../ui/dom';
import type { Customer } from '../npc/Customers';

interface CounterItem {
  productId: string;
  mesh: THREE.Object3D;
  scanned: boolean;
  price: number;
  anim: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

const DENOMS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];

/**
 * The register: scanning items on the counter, hot-snack requests, age
 * verification, payment and counting change. Also handles the part-timer
 * serving automatically.
 */
export class Checkout {
  customer: Customer | null = null;
  items: CounterItem[] = [];
  active = false; // player is standing at the register
  private panelClose: (() => void) | null = null;
  private stage: 'scan' | 'pay' | 'change' | 'done' = 'scan';
  private ageChecked = false;
  private given = 0;
  private changeGiven: number[] = [];
  private hotAdded: string[] = [];
  private autoTimer = 0;
  private itemGroup = new THREE.Group();
  private startedAt = 0;
  private mouseDown = false;

  constructor(private g: Game) {
    g.store.root.add(this.itemGroup);
    window.addEventListener('keydown', (e) => {
      if (!this.active || this.g.mode !== 'register') return;
      if (e.code === 'Space') this.scanNext();
      if (e.code === 'KeyE' || e.code === 'Escape') {
        if (!this.g.dialog.active) this.exit();
      }
    });
  }

  reset(): void {
    this.forceClose();
    this.customer = null;
    this.clearItems();
  }

  forceClose(): void {
    if (this.active) this.exit();
  }

  private clearItems() {
    for (const it of this.items) it.mesh.removeFromParent();
    this.items = [];
  }

  get busy(): boolean {
    return !!this.customer;
  }

  /** Called by a customer who reached the register spot. */
  begin(c: Customer): void {
    this.customer = c;
    this.stage = 'scan';
    this.ageChecked = false;
    this.given = 0;
    this.changeGiven = [];
    this.hotAdded = [];
    this.autoTimer = 0;
    this.startedAt = this.g.time;
    this.clearItems();
    const mat = this.g.store.anchors.counterMat;
    const base = mat.getWorldPosition(new THREE.Vector3());
    c.basket.forEach((it, i) => {
      const p = product(it.productId);
      const m = productMesh(p);
      const col = i % 3;
      const row = Math.floor(i / 3) % 3;
      const layer = Math.floor(i / 9);
      m.position.set(base.x - 0.13 + row * 0.13, L.counter.h + 0.008 + layer * 0.12, base.z - 0.2 + col * 0.19);
      m.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      m.userData.counterItem = i;
      this.itemGroup.add(m);
      this.items.push({ productId: it.productId, mesh: m, scanned: false, price: this.g.state.price(it.productId), anim: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
    });
    this.g.audio.play('place', { pos: base, volume: 0.6 });
    if (this.active) this.render();
  }

  /** Customer walked off (patience, theft …). */
  abandon(): void {
    this.clearItems();
    this.customer = null;
    if (this.active) this.render();
  }

  // ------------------------------------------------------------------ register mode

  enter(): void {
    const g = this.g;
    if (g.player.held) return;
    this.active = true;
    g.enterUIMode('register');
    g.mode = 'register';
    g.player.position.copy(P.registerStaff);
    const eye = P.registerStaff.clone().setY(1.72).add(new THREE.Vector3(0.05, 0, -0.1));
    const look = new THREE.Vector3(L.counter.minX + 0.05, 0.75, L.register.z - 0.45);
    g.player.setFocus(eye, look);
    g.ui.setCrosshair(false);
    g.ui.setHeld(null);
    this.render();
    g.state.tutorial |= 4;
  }

  exit(): void {
    const g = this.g;
    this.active = false;
    this.panelClose?.();
    this.panelClose = null;
    g.player.setFocus(null);
    g.player.lookAtPoint(new THREE.Vector3(3.0, 1.2, L.register.z));
    g.ui.setCrosshair(true);
    g.mode = 'play';
    g.requestLock();
  }

  updateRegisterMode(_dt: number): void {
    const g = this.g;
    // click-to-scan with the cursor
    const down = g.input.mouseHeld(0) || g.input.mouse(0);
    if (g.input.mouse(0) && !this.mouseDown) {
      const ray = g.player.ray(true);
      const hits = ray.intersectObjects(this.itemGroup.children, true);
      const hit = hits[0];
      if (hit) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o.userData.counterItem == null) o = o.parent;
        if (o) this.scan(this.items[o.userData.counterItem as number]);
      }
    }
    this.mouseDown = down;
  }

  private scanNext(): void {
    const it = this.items.find((x) => !x.scanned);
    if (it) this.scan(it);
  }

  private scan(it: CounterItem | undefined): void {
    if (!it || it.scanned || this.stage !== 'scan') return;
    it.scanned = true;
    it.anim = 0.0001;
    it.from.copy(it.mesh.position);
    const bag = this.g.store.anchors.bagArea.getWorldPosition(new THREE.Vector3());
    const k = this.items.filter((x) => x.scanned).length - 1;
    it.to.set(bag.x - 0.1 + (k % 3) * 0.1, bag.y + 0.006 + Math.floor(k / 6) * 0.1, bag.z - 0.1 + (Math.floor(k / 3) % 2) * 0.16);
    this.g.audio.scanBeep(it.mesh.getWorldPosition(new THREE.Vector3()));
    this.render();
  }

  update(dt: number, time: number): void {
    for (const it of this.items) {
      if (it.anim > 0 && it.anim < 1) {
        it.anim = Math.min(1, it.anim + dt * 4);
        const t = it.anim;
        it.mesh.position.lerpVectors(it.from, it.to, t);
        it.mesh.position.y += Math.sin(t * Math.PI) * 0.12;
      }
    }
    // part-timer serves when the player is not at the register
    const c = this.customer;
    if (c && !this.active && this.g.customers.partTimerOnDuty() && c.readyForCheckout()) {
      this.autoTimer += dt;
      if (this.autoTimer > 2.5 + this.items.length * 0.8) this.autoComplete();
    }
    // idle register screen shows the current total
    void time;
  }

  // ------------------------------------------------------------------ totals

  private subtotal(): number {
    let t = 0;
    for (const it of this.items) if (it.scanned) t += it.price;
    for (const id of this.hotAdded) t += this.g.state.price(id);
    return t;
  }

  private needsAge(): boolean {
    return this.items.some((i) => i.scanned && product(i.productId).age);
  }

  private allScanned(): boolean {
    return this.items.every((i) => i.scanned);
  }

  // ------------------------------------------------------------------ UI

  private render(): void {
    const g = this.g;
    const c = this.customer;
    const panel = h('div', { class: 'register interactive' });
    const header = h('header', { style: 'padding:12px 14px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(90deg,rgba(18,138,90,.4),transparent)' },
      h('b', {}, '🧾 POSレジ'), h('button', { onclick: () => this.exit() }, 'レジを離れる [E]'));
    panel.append(header);
    const screen = h('div', { class: 'screen' });
    if (!c) {
      screen.append(h('div', { style: 'color:var(--muted);padding:30px 0;text-align:center' }, 'お客さんを待っています…'));
      panel.append(screen);
    } else if (c.claim) {
      screen.append(h('div', { style: 'padding:20px 0' }, h('b', {}, 'お客様からのお申し出'), h('p', { style: 'color:var(--muted)' }, 'お客さんと話してください。')));
      const talk = h('button', { class: 'primary', onclick: () => this.g.customers.handleClaim(c) }, '話を聞く');
      panel.append(screen, h('div', { class: 'actions' }, talk));
    } else {
      for (const it of this.items) {
        const p = product(it.productId);
        screen.append(h('div', { class: `line ${it.scanned ? '' : 'pending'}` }, h('span', {}, `${it.scanned ? '' : '・'}${p.name}${p.age ? ' 🔞' : ''}`), h('span', {}, it.scanned ? yen(it.price) : '未スキャン')));
      }
      for (const id of this.hotAdded) screen.append(h('div', { class: 'line' }, h('span', {}, `${product(id).name} 🍗`), h('span', {}, yen(g.state.price(id)))));
      panel.append(screen);
      panel.append(h('div', { class: 'total' }, h('span', {}, '合計'), h('span', {}, yen(this.subtotal()))));
      const actions = h('div', { class: 'actions' });
      if (this.stage === 'scan') {
        const remaining = this.items.filter((i) => !i.scanned).length;
        panel.append(h('div', { class: 'hint' }, remaining ? `カウンターの商品をクリック、または [Space] でスキャン（残り${remaining}点）` : 'スキャン完了。会計へ進みましょう。'));
        // hot snack request
        if (c.wantsHot && c.hotState === 'asked') {
          const id = c.wantsHot;
          const have = g.hot.fresh(id);
          actions.append(h('button', {
            class: 'primary', disabled: !have,
            onclick: () => {
              if (g.hot.takeFor(id)) {
                this.hotAdded.push(id);
                c.hotState = 'served';
                g.audio.play('plate', { volume: 0.5 });
                this.render();
              }
            },
          }, `${product(id).name}を入れる (${have})`));
          actions.append(h('button', {
            onclick: () => {
              c.hotState = 'refused';
              c.mood -= 1;
              c.char.say('えー、ないの…', g.time, 2.5, 'thought');
              this.render();
            },
          }, '品切れを伝える'));
        }
        // manual hot snack sale for any fresh item
        const hotAvail = PRODUCTS.filter((p) => p.zone === 'hot' && g.hot.fresh(p.id) > 0);
        if (!(c.wantsHot && c.hotState === 'asked') && hotAvail.length && c.hotState !== 'served') {
          // nothing — only on request
        }
        if (this.needsAge() && !this.ageChecked) {
          actions.append(h('button', { class: 'danger', onclick: () => this.ageCheck() }, '年齢確認 🔞'));
        }
        const canPay = this.allScanned() && (!this.needsAge() || this.ageChecked) && !(c.wantsHot && c.hotState === 'asked') && (this.items.length > 0 || this.hotAdded.length > 0);
        actions.append(h('button', { class: 'primary', disabled: !canPay, onclick: () => this.toPayment() }, 'お会計'));
      } else if (this.stage === 'change' || this.stage === 'pay') {
        this.renderPayment(panel, actions);
      }
      panel.append(actions);
    }
    this.panelClose?.();
    this.panelClose = g.ui.panel(panel);
    // mirror on the in-world register screen
    this.drawScreen();
  }

  private drawScreen(): void {
    const s = this.g.store;
    const ctx = s.registerScreenCanvas.getContext('2d')!;
    ctx.fillStyle = '#1b4f7a';
    ctx.fillRect(0, 0, 512, 384);
    ctx.fillStyle = '#128a5a';
    ctx.fillRect(0, 0, 512, 44);
    ctx.fillStyle = '#fff';
    ctx.font = '900 26px "Noto Sans JP", sans-serif';
    ctx.fillText('まいにちマート POS', 14, 31);
    ctx.font = '700 20px "Noto Sans JP", sans-serif';
    let y = 80;
    for (const it of this.items.filter((i) => i.scanned).slice(-8)) {
      ctx.fillText(product(it.productId).name.slice(0, 14), 14, y);
      ctx.textAlign = 'right';
      ctx.fillText(yen(it.price), 498, y);
      ctx.textAlign = 'left';
      y += 30;
    }
    ctx.fillStyle = '#ffd23f';
    ctx.font = '900 34px "Noto Sans JP", sans-serif';
    ctx.fillText(`合計 ${yen(this.subtotal())}`, 14, 364);
    s.registerScreen.needsUpdate = true;
  }

  private async ageCheck(): Promise<void> {
    const g = this.g;
    const c = this.customer;
    if (!c) return;
    g.audio.play('click');
    if (!c.underage) {
      this.ageChecked = true;
      c.char.say('はい（画面をタッチ）', g.time, 1.8);
      this.render();
      return;
    }
    c.char.say('え…身分証？', g.time, 2);
    const choice = await g.dialog.ask('客（若い男性）', '「身分証？…今持ってないんすよ。見ればわかるでしょ、20歳超えてますって。」', [
      { text: '申し訳ございません。確認できない場合はお売りできません。', hint: '法令遵守' },
      { text: '…今回だけですよ。', hint: 'リスクあり' },
    ]);
    if (choice === 0) {
      // remove alcohol from the transaction
      for (const it of [...this.items]) {
        if (product(it.productId).age) {
          it.mesh.removeFromParent();
          this.items.splice(this.items.indexOf(it), 1);
          c.returnItem(it.productId);
        }
      }
      c.char.say('ちっ…わかったよ', g.time, 2.5, 'angry');
      g.state.addRep(1, '未成年への販売をお断り');
      g.ui.notify('適切に対応しました。評判 +1', 'good');
      if (!this.items.length) {
        c.leaveAfterCheckout(false);
        this.customer = null;
        this.clearItems();
      }
    } else {
      this.ageChecked = true;
      c.char.say('どーも！', g.time, 2);
      if (Math.random() < 0.45) {
        setTimeout(() => {
          g.state.money -= 30000;
          g.state.addRep(-10, '未成年への酒類販売が発覚');
          g.ui.notify('🚨 未成年への酒類販売が警察に発覚しました。罰金 ¥30,000・評判 -10', 'bad', 9000);
        }, 25000);
      }
    }
    this.render();
  }

  private toPayment(): void {
    const g = this.g;
    const c = this.customer;
    if (!c) return;
    const total = this.subtotal();
    if (total <= 0) {
      this.finish(true);
      return;
    }
    if (c.payMethod === 'emoney') {
      this.stage = 'pay';
      c.char.say('電子マネーで', g.time, 2.5);
    } else {
      this.stage = 'change';
      this.given = customerTender(total);
      this.changeGiven = [];
      c.char.say(`${yen(this.given)}でお願いします`, g.time, 3);
      g.audio.play('bill', { volume: 0.6 });
      if (g.state.has('changer')) {
        this.changeGiven = [this.given - total];
      }
    }
    g.audio.registerOpen(g.store.anchors.register.getWorldPosition(new THREE.Vector3()));
    this.render();
  }

  private renderPayment(panel: HTMLElement, actions: HTMLElement): void {
    const g = this.g;
    const total = this.subtotal();
    if (this.stage === 'pay') {
      panel.append(h('div', { class: 'hint' }, '電子マネー決済。端末にタッチしてもらいます。'));
      actions.append(h('button', { class: 'primary', onclick: () => {
        g.audio.scanBeep();
        setTimeout(() => g.audio.uiConfirm(), 150);
        this.finish(true);
      } }, '決済する 💳'));
      return;
    }
    const change = this.given - total;
    const giving = this.changeGiven.reduce((a, b) => a + b, 0);
    panel.append(h('div', { class: 'change-box' },
      h('div', {}, 'お預かり'), h('div', { class: 'big', style: 'text-align:right' }, yen(this.given)),
      h('div', {}, 'おつり'), h('div', { class: 'big', style: 'text-align:right;color:var(--warn)' }, yen(change)),
      h('div', {}, '渡す金額'), h('div', { class: 'big', style: `text-align:right;color:${giving === change ? 'var(--good)' : 'var(--text)'}` }, yen(giving)),
    ));
    if (!g.state.has('changer')) {
      const cash = h('div', { class: 'cash' });
      for (const d of DENOMS.slice(1)) {
        cash.append(h('button', {
          class: d >= 1000 ? 'bill' : 'coin',
          onclick: () => {
            this.changeGiven.push(d);
            g.audio.play(d >= 1000 ? 'bill2' : Math.random() < 0.5 ? 'coin0' : 'coin1', { volume: 0.6 });
            this.render();
          },
        }, yen(d)));
      }
      panel.append(cash);
      actions.append(h('button', { onclick: () => { this.changeGiven = []; this.render(); } }, 'やり直し'));
    } else {
      panel.append(h('div', { class: 'hint' }, '自動釣銭機がおつりを払い出しました。'));
    }
    actions.append(h('button', { class: 'primary', onclick: () => this.giveChange() }, 'おつりを渡す'));
  }

  private giveChange(): void {
    const g = this.g;
    const c = this.customer;
    if (!c) return;
    const total = this.subtotal();
    const change = this.given - total;
    const giving = this.changeGiven.reduce((a, b) => a + b, 0);
    if (giving < change) {
      c.char.say(`おつり足りないよ！あと${yen(change - giving)}`, g.time, 3, 'angry');
      c.mood -= 1.5;
      g.audio.errorBuzz();
      g.state.addRep(-0.5);
      return;
    }
    if (giving > change) {
      const over = giving - change;
      g.state.money -= over;
      g.state.stats.events.push(`おつり渡しすぎ -${over}`);
      g.ui.notify(`おつりを ${yen(over)} 多く渡してしまった…`, 'bad');
    } else {
      c.mood += 0.5;
    }
    g.audio.cashIn();
    this.finish(true);
  }

  private finish(paid: boolean): void {
    const g = this.g;
    const c = this.customer;
    if (!c) return;
    const total = this.subtotal();
    const s = g.state;
    if (paid) {
      s.money += total;
      s.stats.sales += total;
      s.totalSales += total;
      s.stats.customers += 1;
      let cogs = 0;
      for (const it of this.items) {
        cogs += product(it.productId).cost;
        s.stats.sold[it.productId] = (s.stats.sold[it.productId] ?? 0) + 1;
      }
      for (const id of this.hotAdded) {
        cogs += product(id).cost;
        s.stats.sold[id] = (s.stats.sold[id] ?? 0) + 1;
      }
      s.stats.cogs += cogs;
      const wait = g.time - this.startedAt;
      if (wait < 20) c.mood += 0.5;
      g.audio.printer(g.store.anchors.register.getWorldPosition(new THREE.Vector3()));
    }
    const rankBefore = s.rank;
    c.leaveAfterCheckout(true);
    this.customer = null;
    this.stage = 'scan';
    const done = this.items;
    this.items = [];
    setTimeout(() => done.forEach((it) => it.mesh.removeFromParent()), 400);
    if (s.rank > rankBefore) g.menus.rankUp(s.rank);
    if (this.active) this.render();
  }

  private autoComplete(): void {
    const c = this.customer;
    if (!c) return;
    for (const it of this.items) it.scanned = true;
    if (c.wantsHot && c.hotState === 'asked') {
      if (this.g.hot.takeFor(c.wantsHot)) {
        this.hotAdded.push(c.wantsHot);
        c.hotState = 'served';
      } else c.hotState = 'refused';
    }
    if (c.underage) {
      for (const it of [...this.items]) if (product(it.productId).age) this.items.splice(this.items.indexOf(it), 1);
    }
    this.g.audio.scanBeep();
    this.finish(true);
  }
}

/** What a customer hands over for a given total. */
function customerTender(total: number): number {
  const r = Math.random();
  if (r < 0.18) return total;
  if (r < 0.5) return Math.ceil(total / 1000) * 1000;
  if (r < 0.7) {
    // e.g. ¥732 -> pays ¥1,032 to get a neat ¥300 back
    return Math.ceil(total / 1000) * 1000 + (total % 100);
  }
  if (r < 0.85 && total < 5000) return 5000;
  if (total < 10000) return 10000;
  return Math.ceil(total / 1000) * 1000;
}
