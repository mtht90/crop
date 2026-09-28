import type { Game } from '../game/Game';
import { PRODUCTS, CATEGORY_LABEL, ZONE_LABEL, type ProductDef } from '../data/products';
import { UPGRADES, RANKS } from '../game/State';
import { h, yen } from './dom';

type Tab = 'order' | 'price' | 'stock' | 'sales' | 'upgrade';

/** The back-office PC: ordering, pricing, stock overview, sales and upgrades. */
export class PCMenu {
  private tab: Tab = 'order';
  private cart = new Map<string, number>();
  private express = false;
  private close: (() => void) | null = null;
  private body: HTMLElement | null = null;
  private footer: HTMLElement | null = null;
  private tabsEl: HTMLElement | null = null;
  private filter: string = 'all';

  constructor(private g: Game) {}

  open(): void {
    const g = this.g;
    g.enterUIMode('pc');
    g.audio.play('click');
    this.tabsEl = h('div', { class: 'tabs' });
    this.body = h('div', { class: 'body', style: 'height:62vh' });
    this.footer = h('footer');
    const modal = h('div', { class: 'modal', style: 'width:min(980px,96vw)' },
      h('header', {}, h('h2', {}, '🖥 ストアコンピュータ'), this.tabsEl, h('button', { onclick: () => this.close?.() }, '閉じる [Esc]')),
      this.body, this.footer);
    this.close = g.ui.modal(modal, { onClose: () => { this.close = null; g.exitUIMode(); window.removeEventListener('keydown', esc); } });
    const esc = (e: KeyboardEvent) => {
      if (e.code === 'Escape') this.close?.();
    };
    window.addEventListener('keydown', esc);
    this.render();
  }

  private setTab(t: Tab) {
    this.tab = t;
    this.g.audio.play('click', { volume: 0.5 });
    this.render();
  }

  private render(): void {
    if (!this.body || !this.footer || !this.tabsEl) return;
    const tabs: [Tab, string][] = [['order', '発注'], ['price', '価格設定'], ['stock', '在庫'], ['sales', '売上'], ['upgrade', '店舗強化']];
    this.tabsEl.replaceChildren(...tabs.map(([t, l]) => h('button', { class: this.tab === t ? 'on' : '', onclick: () => this.setTab(t) }, l)));
    this.body.replaceChildren();
    this.footer.replaceChildren();
    ({ order: () => this.renderOrder(), price: () => this.renderPrice(), stock: () => this.renderStock(), sales: () => this.renderSales(), upgrade: () => this.renderUpgrade() })[this.tab]();
    this.drawScreen();
  }

  private categoryFilter(): HTMLElement {
    const cats = ['all', ...new Set(PRODUCTS.map((p) => p.category))];
    return h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px' },
      ...cats.map((c) => h('button', { class: this.filter === c ? 'primary' : '', style: 'padding:4px 10px;font-size:12px', onclick: () => { this.filter = c; this.render(); } }, c === 'all' ? 'すべて' : CATEGORY_LABEL[c as ProductDef['category']])));
  }

  private visible(): ProductDef[] {
    return PRODUCTS.filter((p) => this.filter === 'all' || p.category === this.filter);
  }

  private renderOrder(): void {
    const g = this.g;
    const s = g.state;
    const rows = this.visible().map((p) => {
      const locked = p.rank > s.rank;
      const stock = g.stockOf(p.id);
      const q = this.cart.get(p.id) ?? 0;
      const span = h('span', {}, String(q));
      const set = (d: number) => {
        const v = Math.max(0, Math.min(20, (this.cart.get(p.id) ?? 0) + d));
        if (v) this.cart.set(p.id, v);
        else this.cart.delete(p.id);
        this.render();
      };
      const pending = s.orders.filter((o) => o.productId === p.id).reduce((a, o) => a + o.cases, 0);
      const hotStock = p.zone === 'hot' ? s.hotStock[p.id] ?? 0 : null;
      return h('tr', { class: locked ? 'locked' : '' },
        h('td', {}, h('span', { class: 'swatch', style: `background:${p.colors[1]}` }), p.name, p.age ? ' 🔞' : '', locked ? h('span', { class: 'pill', style: 'margin-left:6px' }, `★${p.rank}で解放`) : null),
        h('td', {}, h('span', { class: 'pill' }, ZONE_LABEL[p.zone])),
        h('td', { class: 'num' }, `${p.caseSize}個`),
        h('td', { class: 'num' }, yen(p.cost * p.caseSize)),
        h('td', { class: 'num' }, hotStock != null ? `冷凍${hotStock}` : `${stock.shelf} / 箱${stock.boxes}`),
        h('td', { class: 'num' }, pending ? h('span', { class: 'pill warn' }, `${pending}箱`) : '—'),
        h('td', {}, h('div', { class: 'stepper' }, h('button', { disabled: locked, onclick: () => set(-1) }, '−'), span, h('button', { disabled: locked, onclick: () => set(1) }, '＋'))),
      );
    });
    this.body!.append(this.categoryFilter(), h('table', { class: 'grid' },
      h('tr', {}, h('th', {}, '商品'), h('th', {}, '売場'), h('th', { class: 'num' }, '入数'), h('th', { class: 'num' }, '1箱の仕入値'), h('th', { class: 'num' }, '売場 / 在庫'), h('th', { class: 'num' }, '発注済'), h('th', {}, '箱数')),
      ...rows));
    let total = 0;
    for (const [id, q] of this.cart) total += PRODUCTS.find((p) => p.id === id)!.cost * PRODUCTS.find((p) => p.id === id)!.caseSize * q;
    const fee = this.express ? 1500 : 0;
    const slot = g.deliveries.nextSlot();
    const m = slot % 1440;
    const when = `${Math.floor(slot / 1440) > s.day ? '明日 ' : ''}${String(Math.floor(m / 60)).padStart(2, '0')}:00`;
    const expressBox = h('input', { type: 'checkbox', checked: this.express, onchange: (e: Event) => { this.express = (e.target as HTMLInputElement).checked; this.render(); } });
    this.footer!.append(
      h('label', { style: 'display:flex;gap:6px;align-items:center;margin-right:auto;font-size:13px' }, expressBox, `特急便（30分で到着・手数料¥1,500）`, h('span', { style: 'color:var(--muted);margin-left:10px' }, this.express ? '' : `通常便の到着: ${when}`)),
      h('div', { style: 'font-weight:900;font-size:18px' }, `合計 ${yen(total + (total ? fee : 0))}`),
      h('button', { onclick: () => { this.cart.clear(); this.render(); } }, 'クリア'),
      h('button', { class: 'primary', disabled: !total || s.money < total + fee, onclick: () => this.placeOrder(total, fee) }, '発注する'),
    );
  }

  private placeOrder(total: number, fee: number): void {
    const g = this.g;
    for (const [id, q] of this.cart) g.deliveries.place(id, q, this.express);
    g.state.money -= total + fee;
    g.state.stats.orders += total + fee;
    g.ui.notify(`発注しました（${yen(total + fee)}）。${this.express ? '30分後に届きます。' : `次の納品便 ${g.deliveries.nextArrival()} で届きます。`}`, 'good');
    g.audio.uiConfirm();
    g.state.tutorial |= 8;
    this.cart.clear();
    this.render();
  }

  private renderPrice(): void {
    const g = this.g;
    const s = g.state;
    const rows = this.visible().filter((p) => p.rank <= s.rank).map((p) => {
      const price = s.price(p.id);
      const margin = Math.round(((price - p.cost) / price) * 100);
      const ratio = price / p.price;
      const tag = ratio > 1.25 ? h('span', { class: 'pill bad' }, '高すぎ') : ratio > 1.08 ? h('span', { class: 'pill warn' }, 'やや高い') : ratio < 0.9 ? h('span', { class: 'pill good' }, 'お買い得') : h('span', { class: 'pill' }, '相場');
      const set = (v: number) => {
        s.prices[p.id] = Math.max(p.cost, Math.min(p.price * 2, Math.round(v / 10) * 10));
        g.refreshTags();
        this.render();
      };
      return h('tr', {},
        h('td', {}, p.name),
        h('td', { class: 'num' }, yen(p.cost)),
        h('td', { class: 'num' }, yen(p.price)),
        h('td', {}, h('div', { class: 'stepper' }, h('button', { onclick: () => set(price - 10) }, '−10'), h('span', { style: 'min-width:64px' }, yen(price)), h('button', { onclick: () => set(price + 10) }, '＋10'))),
        h('td', { class: 'num' }, `${margin}%`),
        h('td', {}, tag),
        h('td', {}, h('button', { style: 'padding:3px 8px;font-size:12px', onclick: () => set(p.price) }, '相場に戻す')),
      );
    });
    this.body!.append(this.categoryFilter(), h('table', { class: 'grid' },
      h('tr', {}, h('th', {}, '商品'), h('th', { class: 'num' }, '原価'), h('th', { class: 'num' }, '相場'), h('th', {}, '売価'), h('th', { class: 'num' }, '粗利率'), h('th', {}, '評価'), h('th', {})),
      ...rows));
    this.footer!.append(h('div', { style: 'margin-right:auto;font-size:12px;color:var(--muted)' }, '相場より高いと買われにくくなり、評判も下がります。安くすると客が喜びますが利益は減ります。'));
  }

  private renderStock(): void {
    const g = this.g;
    const s = g.state;
    const rows = PRODUCTS.filter((p) => p.rank <= s.rank).map((p) => {
      const st = g.stockOf(p.id);
      let expired = 0;
      let slots = 0;
      for (const sl of g.store.slots) if (sl.productId === p.id) {
        expired += sl.expiredCount(s.abs);
        slots++;
      }
      const hot = p.zone === 'hot';
      const low = !hot && st.shelf < 4;
      return h('tr', {},
        h('td', {}, p.name),
        h('td', { class: 'num' }, hot ? `ケース ${g.hot.fresh(p.id)}` : String(st.shelf)),
        h('td', { class: 'num' }, hot ? `冷凍 ${s.hotStock[p.id] ?? 0}` : String(st.boxes)),
        h('td', { class: 'num' }, hot ? '—' : String(slots)),
        h('td', { class: 'num' }, expired ? h('span', { class: 'pill bad' }, `${expired}`) : '—'),
        h('td', { class: 'num' }, String(s.stats.sold[p.id] ?? 0)),
        h('td', {}, low ? h('span', { class: 'pill warn' }, '品薄') : ''),
      );
    });
    this.body!.append(h('table', { class: 'grid' },
      h('tr', {}, h('th', {}, '商品'), h('th', { class: 'num' }, '売場'), h('th', { class: 'num' }, 'バックヤード'), h('th', { class: 'num' }, 'フェイス数'), h('th', { class: 'num' }, '期限切れ'), h('th', { class: 'num' }, '本日販売'), h('th', {})),
      ...rows));
  }

  private renderSales(): void {
    const g = this.g;
    const s = g.state;
    const st = s.stats;
    const gross = st.sales - st.cogs;
    const kpi = (l: string, v: string, cls = '') => h('div', { class: 'kpi' }, h('div', { class: 'l' }, l), h('div', { class: `v ${cls}` }, v));
    const hist = [...s.history.slice(-13), st];
    const max = Math.max(1, ...hist.map((x) => x.sales));
    const top = Object.entries(st.sold).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const r = RANKS.find((x) => x.rank === s.rank + 1);
    this.body!.append(
      h('div', { class: 'report' },
        h('div', { class: 'kpis' }, kpi('本日の売上', yen(st.sales)), kpi('粗利', yen(gross), gross >= 0 ? 'pos' : 'neg'), kpi('来店客数', `${st.customers}人`), kpi('客単価', yen(st.customers ? st.sales / st.customers : 0))),
        h('div', { class: 'kpis' }, kpi('廃棄ロス', yen(st.waste), st.waste ? 'neg' : ''), kpi('万引き被害(判明分)', yen(st.theft), st.theft ? 'neg' : ''), kpi('帰った客', `${st.lost}人`, st.lost ? 'neg' : ''), kpi('累計売上', yen(s.totalSales))),
        r ? h('p', { style: 'font-size:13px;color:var(--muted)' }, `次のランク ★${r.rank}「${r.title}」まで 累計売上 あと ${yen(r.need - s.totalSales)}`) : h('p', {}, '最高ランクに到達しています！'),
        h('h4', {}, '売上推移'),
        h('div', { class: 'bars' }, ...hist.map((x) => h('div', { style: `height:${(x.sales / max) * 100}%`, title: yen(x.sales) }, h('span', {}, `${x.day}日`)))),
        h('h4', { style: 'margin-top:30px' }, '本日の売れ筋'),
        top.length ? h('div', {}, ...top.map(([id, n]) => h('div', {}, `${PRODUCTS.find((p) => p.id === id)!.name} — ${n}個`))) : h('div', { style: 'color:var(--muted)' }, 'まだ販売がありません'),
      ),
    );
  }

  private renderUpgrade(): void {
    const g = this.g;
    const s = g.state;
    const rows = UPGRADES.map((u) => {
      const owned = s.has(u.id);
      const locked = u.rank > s.rank;
      return h('tr', { class: locked ? 'locked' : '' },
        h('td', {}, h('b', {}, u.name), h('div', { style: 'font-size:12px;color:var(--muted)' }, u.desc)),
        h('td', { class: 'num' }, u.cost ? yen(u.cost) : '—', u.daily ? h('div', { style: 'font-size:11px;color:var(--muted)' }, `日額 ${yen(u.daily)}`) : null),
        h('td', {}, owned
          ? (u.daily ? h('button', { onclick: () => { s.upgrades = s.upgrades.filter((x) => x !== u.id); this.render(); } }, '解約する') : h('span', { class: 'pill good' }, '導入済み'))
          : h('button', {
            class: 'primary', disabled: locked || s.money < u.cost,
            onclick: () => {
              s.money -= u.cost;
              s.stats.orders += u.cost;
              if (u.id === 'ad') s.addRep(8, 'チラシ広告');
              else s.upgrades.push(u.id);
              g.audio.cashIn();
              g.ui.notify(`${u.name} を導入しました！`, 'good');
              this.render();
            },
          }, locked ? `★${u.rank}で解放` : '導入する')),
      );
    });
    this.body!.append(h('table', { class: 'grid' }, h('tr', {}, h('th', {}, '設備・サービス'), h('th', { class: 'num' }, '費用'), h('th', {})), ...rows));
  }

  /** Mirror a tiny summary on the in-world monitor. */
  private drawScreen(): void {
    const s = this.g.store;
    const st = this.g.state;
    const ctx = s.pcScreenCanvas.getContext('2d')!;
    ctx.fillStyle = '#0d2233';
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = '#128a5a';
    ctx.fillRect(0, 0, 640, 50);
    ctx.fillStyle = '#fff';
    ctx.font = '900 28px "Noto Sans JP", sans-serif';
    ctx.fillText('まいにちマート 店舗システム', 16, 35);
    ctx.font = '700 24px "Noto Sans JP", sans-serif';
    ctx.fillText(`本日売上 ${yen(st.stats.sales)}`, 16, 110);
    ctx.fillText(`来店 ${st.stats.customers}人`, 16, 150);
    ctx.fillText(`発注残 ${st.orders.length}件`, 16, 190);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`所持金 ${yen(st.money)}`, 16, 250);
    s.pcScreen.needsUpdate = true;
  }
}
