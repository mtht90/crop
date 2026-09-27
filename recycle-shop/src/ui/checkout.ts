import { audio } from '../core/audio';
import { events, toast } from '../core/events';
import { el, escapeHtml, nicePrice, rng, yen } from '../core/util';
import { itemDef } from '../data/items';
import { line } from '../data/dialogue';
import type { Customer } from '../entities/customer';
import type { Game } from '../game/game';
import type { ItemState } from '../game/state';
import { trueValue } from '../game/valuation';
import { Modal, icon } from './ui';

const DENOMS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];

/** レジ会計: スキャン → (値引き交渉) → 支払い (現金はお釣り計算・カードは金額入力) */
export class CheckoutUI extends Modal {
  private c: Customer | null = null;
  private scanned = new Set<string>();
  private prices = new Map<string, number>();
  private phase: 'scan' | 'haggle' | 'pay' | 'done' = 'scan';
  private method: 'cash' | 'card' = 'cash';
  private tendered = 0;
  private change: number[] = [];
  private cardInput = '';
  private autoTimer = 0;
  private body!: HTMLElement;

  constructor(private g: Game) {
    super('checkout');
    this.el.innerHTML = `<div class="co-card"><div class="co-head"></div><div class="co-body"></div></div>`;
    this.body = this.el.querySelector('.co-body')!;
  }

  // ───── 客側からの通知 ─────
  onCustomerReady(c: Customer) {
    if (this.g.model.has('cashier')) this.autoTimer = 4.5;
    else if (!this.g.ui.modalOpen) toast(`${c.name}がレジで待っています`, 'info', 'shopping-bag');
    this.g.world.first('register').extra.display?.(yen(c.basket.reduce((s, it) => s + (it.price ?? 0), 0)));
  }

  onCustomerLeft(c: Customer) {
    if (this.c === c) { this.c = null; if (this.g.ui.isOpen(this)) this.close(); }
  }

  busyWith(c: Customer) { return this.c === c && this.g.ui.isOpen(this); }

  openIfReady() {
    const c = this.g.customers.buyQueue[0];
    if (!c || c.state !== 'checkout') { toast('レジに並んでいるお客さんはいません', 'warn'); return; }
    this.start(c);
  }

  private start(c: Customer) {
    this.c = c;
    this.scanned.clear();
    this.prices.clear();
    for (const it of c.basket) this.prices.set(it.uid, it.price ?? 0);
    this.phase = 'scan';
    this.method = rng.chance(0.62) ? 'cash' : 'card';
    this.change = [];
    this.cardInput = '';
    this.g.ui.open(this);
  }

  onOpen() { this.render(); }

  update(dt: number) {
    // レジ係 (自動会計)
    if (this.autoTimer > 0 && !this.g.ui.isOpen(this)) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        const c = this.g.customers.buyQueue[0];
        if (c && c.state === 'checkout') {
          this.c = c;
          this.prices.clear();
          for (const it of c.basket) this.prices.set(it.uid, it.price ?? 0);
          this.finish(true);
        }
      }
    }
  }

  private total() { return [...this.prices.values()].reduce((s, v) => s + v, 0); }

  private render() {
    const c = this.c!;
    const head = this.el.querySelector('.co-head')!;
    head.innerHTML = `${icon('shopping-bag')} <b>${escapeHtml(c.name)}</b> <span class="tag">${escapeHtml(c.arch.label)}</span><span class="co-total">合計 <b>${yen(this.scannedTotal())}</b></span>`;
    this.g.world.first('register').extra.display?.(yen(this.scannedTotal()));
    if (this.phase === 'scan') this.renderScan();
    else if (this.phase === 'haggle') this.renderHaggle();
    else if (this.phase === 'pay') this.method === 'cash' ? this.renderCash() : this.renderCard();
  }

  private scannedTotal() { return [...this.scanned].reduce((s, u) => s + (this.prices.get(u) ?? 0), 0); }

  private renderScan() {
    const c = this.c!;
    this.body.innerHTML = `<div class="co-hint">商品をクリックしてバーコードをスキャン</div><div class="co-items"></div>`;
    const list = this.body.querySelector('.co-items')!;
    for (const it of c.basket) {
      const def = itemDef(it.defId);
      const done = this.scanned.has(it.uid);
      const row = el('button', `co-item ${done ? 'scanned' : ''}`, `<span class="nm">${escapeHtml(def.name)}</span><span class="pr">${done ? yen(this.prices.get(it.uid)!) : '―'}</span>${done ? icon('check-mark') : '<span class="bar">▮▯▮▮▯▮</span>'}`);
      row.disabled = done;
      row.onclick = () => {
        this.scanned.add(it.uid);
        audio.scanBeep();
        if (this.scanned.size === c.basket.length) this.afterScan();
        else this.render();
      };
      list.appendChild(row);
    }
  }

  private afterScan() {
    const c = this.c!;
    if (!c.haggled && rng.chance(c.arch.haggle) && this.total() > 500) {
      c.haggled = true;
      this.phase = 'haggle';
    } else this.phase = 'pay';
    this.prepPayment();
    this.render();
  }

  private haggleOffer = 0;
  private renderHaggle() {
    const c = this.c!;
    const total = this.total();
    this.haggleOffer = nicePrice(total * rng.range(0.78, 0.92));
    const text = line('haggle', { price: yen(this.haggleOffer) });
    c.say(text, 4);
    this.body.innerHTML = `
      <div class="co-haggle">${icon('conversation')} <b>${escapeHtml(c.name)}</b>「${escapeHtml(text)}」</div>
      <div class="co-hint">値引きに応じると満足度が上がります (合計 ${yen(total)} → ${yen(this.haggleOffer)})</div>
      <div class="btns"><button class="primary ok">${icon('thumb-up')} 値引きする</button><button class="danger ng">${icon('thumb-down')} 定価でお願いします</button></div>`;
    this.body.querySelector('.ok')!.addEventListener('click', () => {
      const ratio = this.haggleOffer / total;
      for (const [k, v] of this.prices) this.prices.set(k, Math.round(v * ratio));
      // 端数調整
      const diff = this.haggleOffer - this.total();
      const first = this.prices.keys().next().value!;
      this.prices.set(first, this.prices.get(first)! + diff);
      c.say(line('haggleAccepted'), 2.5, 'good');
      this.g.model.addRep(0.5);
      this.phase = 'pay';
      this.prepPayment();
      this.render();
    });
    this.body.querySelector('.ng')!.addEventListener('click', () => {
      c.say(line('haggleRefused'), 2.5);
      if (rng.chance(0.35)) {
        // 買うのをやめる
        toast(`${c.name}は買うのをやめました (商品は在庫へ)`, 'warn');
        for (const it of c.basket) it.loc = { type: 'stock' };
        c.basket = [];
        this.g.customers.completePurchase(c);
        this.c = null;
        this.close();
        return;
      }
      this.phase = 'pay';
      this.prepPayment();
      this.render();
    });
  }

  private prepPayment() {
    const total = this.total();
    // 客が出す金額: ぴったり or 上の区切り
    const opts = [total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000];
    this.tendered = rng.pick(opts.filter((v, i, a) => a.indexOf(v) === i && v >= total));
    if (rng.chance(0.25)) this.tendered = Math.ceil(total / 10000) * 10000;
    this.change = [];
    this.cardInput = '';
  }

  private renderCash() {
    const total = this.total();
    const need = this.tendered - total;
    const given = this.change.reduce((s, v) => s + v, 0);
    this.body.innerHTML = `
      <div class="co-pay">
        <div class="co-line"><span>お会計</span><b>${yen(total)}</b></div>
        <div class="co-line"><span>お預かり ${icon('cash')}</span><b>${yen(this.tendered)}</b></div>
        <div class="co-line big"><span>お釣り</span><b class="${given === need ? 'good' : given > need ? 'bad' : ''}">${yen(given)}</b></div>
      </div>
      <div class="co-hint">${need === 0 ? 'ちょうどお預かりしました。' : 'お札・硬貨をクリックしてお釣りを用意'}</div>
      <div class="co-drawer"></div>
      <div class="co-tray"></div>
      <div class="btns"><button class="clear">やり直す</button><button class="primary give">${icon('hand')} お釣りを渡す</button></div>`;
    const drawer = this.body.querySelector('.co-drawer')!;
    for (const d of DENOMS) {
      const b = el('button', `money ${d >= 1000 ? 'bill' : 'coin'} d${d}`, d >= 1000 ? `${d.toLocaleString()}円` : `${d}`);
      b.onclick = () => { this.change.push(d); audio.play(d >= 1000 ? 'swap' : 'coin', { volume: 0.35, rate: d >= 1000 ? 1 : 1.5 }); this.render(); };
      drawer.appendChild(b);
    }
    const tray = this.body.querySelector('.co-tray')!;
    tray.innerHTML = this.change.map((d) => `<span class="mini ${d >= 1000 ? 'bill' : 'coin'}">${d >= 1000 ? d / 1000 + '千' : d}</span>`).join('');
    this.body.querySelector('.clear')!.addEventListener('click', () => { this.change = []; this.render(); });
    this.body.querySelector('.give')!.addEventListener('click', () => {
      if (given < need) {
        audio.errorBuzz();
        this.c!.say(line('changeWrong'), 2.5, 'bad');
        this.c!.patience -= 0.08;
        return;
      }
      if (given > need) toast(`お釣りを ${yen(given - need)} 多く渡してしまった`, 'bad');
      this.finish(false, given - need);
    });
  }

  private renderCard() {
    const total = this.total();
    this.body.innerHTML = `
      <div class="co-pay"><div class="co-line"><span>お会計</span><b>${yen(total)}</b></div><div class="co-line"><span>支払い方法</span><b>${icon('wallet')} カード</b></div></div>
      <div class="co-hint">決済端末に金額を入力して「決済」</div>
      <div class="co-terminal"><div class="screen">¥${Number(this.cardInput || 0).toLocaleString()}</div><div class="keys"></div></div>`;
    const keys = this.body.querySelector('.keys')!;
    for (const k of ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '00', '決済']) {
      const b = el('button', `key ${k === '決済' ? 'enter' : ''}`, k);
      b.onclick = () => {
        if (k === 'C') this.cardInput = '';
        else if (k === '決済') {
          if (Number(this.cardInput) === total) { this.finish(false); return; }
          audio.errorBuzz();
          toast('金額が違います', 'bad');
          this.cardInput = '';
        } else if (this.cardInput.length < 8) this.cardInput += k;
        audio.play('press', { volume: 0.3, rate: 1.4 });
        this.render();
      };
      keys.appendChild(b);
    }
  }

  /** 会計確定 */
  private finish(auto: boolean, overpay = 0) {
    const c = this.c!;
    const m = this.g.model;
    const total = this.total();
    m.addMoney(total - overpay, auto ? 'レジ係の会計' : '販売');
    m.state.today.sales += total;
    let profit = -overpay;
    for (const it of c.basket) {
      const price = this.prices.get(it.uid) ?? it.price ?? 0;
      this.recordSale(it, price);
      profit += price;
    }
    m.state.stats.profit += profit;
    audio.register();
    this.g.world.first('register').extra.display?.('ありがとう');
    this.g.customers.completePurchase(c);
    this.phase = 'done';
    this.c = null;
    if (this.g.ui.isOpen(this)) this.close();
    toast(`${yen(total)} 売り上げました`, 'good', 'coins');
  }

  private recordSale(it: ItemState, price: number) {
    const m = this.g.model;
    const def = itemDef(it.defId);
    m.state.stats.itemsSold++;
    m.state.stats.totalSales += price;
    m.state.stats.bestSale = Math.max(m.state.stats.bestSale, price);
    m.state.today.sold++;
    m.addXp(6 + Math.sqrt(price) * 0.2);
    const tv = trueValue(it, m.trend(def.category));
    if (price <= tv * 1.05) m.addRep(0.35);
    // 偽物を本物価格で売った
    if (!it.authentic && price > tv * 3) m.state.pendingComplaints.push({ itemName: def.name, price, day: m.state.day });
    it.loc = { type: 'gone' };
    m.removeItem(it.uid);
    events.emit('item:sold', { itemUid: it.uid, price, cost: it.cost });
  }
}
