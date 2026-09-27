import { audio } from '../core/audio';
import { events } from '../core/events';
import { el, escapeHtml, nicePrice, yen } from '../core/util';
import { CATEGORIES, SIZE_LABEL, itemDef } from '../data/items';
import type { Game } from '../game/game';
import type { ItemState } from '../game/state';
import { GRADE_COLOR, GRADE_LABEL, knownValue } from '../game/valuation';
import { Modal, icon, priceInput } from './ui';

/** 値札をつける */
export class PriceUI extends Modal {
  private it: ItemState | null = null;
  private input = priceInput(0, () => this.refresh());
  private card: HTMLElement;

  constructor(private g: Game) {
    super('price');
    this.card = el('div', 'pr-card');
    this.el.appendChild(this.card);
  }

  open(it: ItemState) {
    this.it = it;
    this.g.ui.open(this);
  }

  onOpen() {
    const it = this.it!;
    const def = itemDef(it.defId);
    const cat = CATEGORIES[def.category];
    const trend = this.g.model.trend(def.category);
    const kv = knownValue(it, trend);
    this.card.innerHTML = `
      <div class="pr-head">${icon('price-tag')} 値札をつける</div>
      <div class="pr-name">${escapeHtml(def.name)}</div>
      <div class="pr-meta"><span style="color:${cat.color}">${icon(cat.icon)} ${cat.name}</span><span>${SIZE_LABEL[def.sizeClass]}</span>
        <span class="grade" style="background:${GRADE_COLOR[kv.grade]}">${kv.grade}</span><span>${GRADE_LABEL[kv.grade]}</span></div>
      <div class="pr-grid">
        <div>仕入れ値</div><b>${it.cost ? yen(it.cost) : '―'}</b>
        <div>相場目安</div><b>${yen(kv.value)}${kv.certain ? '' : ' ?'}</b>
        <div>相場動向</div><b class="${trend >= 1 ? 'good' : 'bad'}">${trend >= 1 ? '▲' : '▼'} ${Math.round((trend - 1) * 100)}%</b>
      </div>
      <div class="pr-input"></div>
      <div class="quick"></div>
      <div class="pr-meter"><div class="lbl">売れやすさ</div><div class="bar"><i></i></div><div class="txt"></div></div>
      <div class="pr-profit"></div>
      <div class="btns"><button class="primary set">${icon('check-mark')} 値札をつける <kbd>Enter</kbd></button><button class="remove">値札を外す</button></div>`;
    this.card.querySelector('.pr-input')!.appendChild(this.input.el);
    this.input.set(it.price ?? nicePrice(kv.value));
    const quick = this.card.querySelector('.quick')!;
    for (const p of [0.8, 0.9, 1.0, 1.15, 1.3, 1.6]) {
      const b = el('button', 'chip', `${Math.round(p * 100)}%`);
      b.onclick = () => this.input.set(nicePrice(kv.value * p));
      quick.appendChild(b);
    }
    this.card.querySelector('.set')!.addEventListener('click', () => this.apply());
    this.card.querySelector('.remove')!.addEventListener('click', () => { it.price = null; this.sync(); this.close(); });
    this.card.onkeydown = (e) => { if (e.key === 'Enter') this.apply(); };
    setTimeout(() => this.input.focus(), 50);
    this.refresh();
  }

  private refresh() {
    const it = this.it;
    if (!it || !this.card.querySelector('.pr-meter')) return;
    const kv = knownValue(it, this.g.model.trend(itemDef(it.defId).category));
    const p = this.input.get();
    const r = p / Math.max(1, kv.value);
    const chance = 1 / (1 + Math.exp((r - 1) * 5));
    const bar = this.card.querySelector('.pr-meter i') as HTMLElement;
    bar.style.width = `${chance * 100}%`;
    bar.style.background = chance > 0.6 ? '#6fdc7a' : chance > 0.35 ? '#ffc94a' : '#ff6b6b';
    this.card.querySelector('.pr-meter .txt')!.textContent = chance > 0.75 ? 'すぐ売れそう' : chance > 0.5 ? '売れそう' : chance > 0.3 ? 'やや高め' : chance > 0.12 ? '高い' : 'まず売れない';
    const profit = p - it.cost;
    this.card.querySelector('.pr-profit')!.innerHTML = it.cost ? `予想利益 <b class="${profit >= 0 ? 'good' : 'bad'}">${profit >= 0 ? '+' : ''}${yen(profit)}</b>` : '';
  }

  private apply() {
    const it = this.it!;
    it.price = Math.max(1, this.input.get());
    this.sync();
    audio.play('place2', { volume: 0.6 });
    events.emit('item:priced', { itemUid: it.uid, price: it.price });
    this.close();
  }

  private sync() {
    this.g.world.view(this.it!.uid)?.refreshTag(true);
  }
}

/** 在庫置き場の一覧から取り出す */
export class StockUI extends Modal {
  private filter: string = 'all';

  constructor(private g: Game) {
    super('stock');
  }

  open() { this.g.ui.open(this); }

  onOpen() { this.render(); }

  private render() {
    const items = this.g.model.stockItems();
    const cats = ['all', ...Object.keys(CATEGORIES)];
    const shown = items.filter((i) => this.filter === 'all' || itemDef(i.defId).category === this.filter);
    this.el.innerHTML = `
      <div class="st-card">
        <div class="st-head">${icon('cardboard-box')} 在庫置き場 <span class="dim">${items.length} 点</span><button class="x">×</button></div>
        <div class="tabs">${cats.map((c) => `<button data-c="${c}" class="${c === this.filter ? 'on' : ''}">${c === 'all' ? 'すべて' : CATEGORIES[c as keyof typeof CATEGORIES].name}</button>`).join('')}</div>
        <div class="st-grid">${shown.length ? '' : '<div class="empty">在庫はありません。買取カウンターで仕入れましょう。</div>'}</div>
        <div class="st-foot dim">取り出した商品は手に持った状態になります。棚や作業台に置きましょう。</div>
      </div>`;
    this.el.querySelector('.x')!.addEventListener('click', () => this.close());
    this.el.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { this.filter = (b as HTMLElement).dataset.c!; this.render(); }));
    const grid = this.el.querySelector('.st-grid')!;
    for (const it of shown.sort((a, b) => b.day - a.day)) {
      const def = itemDef(it.defId);
      const cat = CATEGORIES[def.category];
      const kv = knownValue(it, this.g.model.trend(def.category));
      const flags = [
        it.dirt > 0.25 ? '<span class="flag">汚れ</span>' : '',
        def.electronic && !it.tested ? '<span class="flag">未テスト</span>' : '',
        def.electronic && it.tested && !it.working ? '<span class="flag bad">故障</span>' : '',
        it.verdict === 'fake' ? '<span class="flag bad">偽物</span>' : '',
      ].join('');
      const card = el('button', 'st-item', `
        <div class="ic" style="color:${cat.color}">${icon(cat.icon)}</div>
        <div class="nm">${escapeHtml(def.name)}</div>
        <div class="mt"><span class="grade" style="background:${GRADE_COLOR[kv.grade]}">${kv.grade}</span> ${SIZE_LABEL[def.sizeClass]} ${flags}</div>
        <div class="pr">${it.cost ? `仕入 ${yen(it.cost)}` : '初期在庫'} ・ 相場 ${yen(kv.value)}</div>`);
      card.onclick = () => {
        if (this.g.interaction.held) { this.g.interaction.stashHeld(); }
        this.close();
        this.g.interaction.takeFromStock(it.uid);
      };
      grid.appendChild(card);
    }
  }
}
