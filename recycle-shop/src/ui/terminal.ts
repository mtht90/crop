import { audio } from '../core/audio';
import { toast } from '../core/events';
import { el, escapeHtml, nicePrice, yen } from '../core/util';
import { CATEGORIES, ITEMS, SIZE_LABEL, itemDef, type CategoryId } from '../data/items';
import { FIXTURES } from '../data/fixtures';
import { UPGRADES } from '../data/upgrades';
import type { Game } from '../game/game';
import { LOTS } from '../game/model';
import { CHECK_TABLE, GRADE_COLOR, knownValue } from '../game/valuation';
import { Modal, icon } from './ui';

type Tab = 'market' | 'lots' | 'items' | 'fixtures' | 'upgrades' | 'guide' | 'stats';

/** 店舗 PC (Tab キーでも開けるタブレット) */
export class TerminalUI extends Modal {
  private tab: Tab = 'market';
  private content!: HTMLElement;
  private gunPct = 100;

  constructor(private g: Game) {
    super('terminal');
  }

  open(tab?: Tab) {
    if (tab) this.tab = tab;
    this.g.ui.open(this);
  }

  onOpen() {
    const tabs: [Tab, string, string][] = [
      ['market', 'chart', '相場・ニュース'], ['lots', 'cardboard-box-closed', '仕入れ'], ['items', 'cardboard-box', '商品管理'], ['fixtures', 'shop', '什器'],
      ['upgrades', 'upgrade', '設備投資'], ['guide', 'magnifying-glass', '鑑定ガイド'], ['stats', 'histogram', '経営状況'],
    ];
    this.el.innerHTML = `
      <div class="tm-card">
        <div class="tm-head">${icon('laptop')} <b>SHOP PC</b> <span class="dim">${escapeHtml(this.g.model.state.shopName)}</span><span class="tm-money">${icon('coins')} ${yen(this.g.model.state.money)}</span><button class="x">×</button></div>
        <div class="tm-tabs">${tabs.map(([id, ic, label]) => `<button data-t="${id}" class="${id === this.tab ? 'on' : ''}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>
        <div class="tm-content"></div>
      </div>`;
    this.content = this.el.querySelector('.tm-content')!;
    this.el.querySelector('.x')!.addEventListener('click', () => this.close());
    this.el.querySelectorAll('.tm-tabs button').forEach((b) => b.addEventListener('click', () => {
      this.tab = (b as HTMLElement).dataset.t as Tab;
      this.el.querySelectorAll('.tm-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      this.render();
    }));
    this.render();
  }

  private refreshMoney() {
    const m = this.el.querySelector('.tm-money');
    if (m) m.innerHTML = `${icon('coins')} ${yen(this.g.model.state.money)}`;
  }

  private render() {
    this.refreshMoney();
    const c = this.content;
    c.innerHTML = '';
    c.scrollTop = 0;
    ({ market: () => this.renderMarket(), lots: () => this.renderLots(), items: () => this.renderItems(), fixtures: () => this.renderFixtures(), upgrades: () => this.renderUpgrades(), guide: () => this.renderGuide(), stats: () => this.renderStats() })[this.tab]();
  }

  // ───── 相場 ─────
  private renderMarket() {
    const mk = this.g.model.state.market;
    const news = mk.news.map((n) => `<div class="news ${n.effect > 0 ? 'up' : n.effect < 0 ? 'down' : ''}">${icon('newspaper')}<span>${escapeHtml(n.text)}</span>${n.cat ? `<b>${CATEGORIES[n.cat].name} ${n.effect > 0 ? '▲' : '▼'}</b>` : ''}</div>`).join('');
    this.content.innerHTML = `<h3>今日のニュース</h3>${news || '<div class="dim">特になし</div>'}<h3>カテゴリ別の相場 <span class="dim small">(100% = 基準価格。直近 ${mk.history.appliance.length} 日)</span></h3><div class="spark-grid"></div>`;
    const grid = this.content.querySelector('.spark-grid')!;
    for (const id of Object.keys(CATEGORIES) as CategoryId[]) {
      const cat = CATEGORIES[id];
      const hist = mk.history[id];
      const now = mk.trend[id];
      const prev = hist.length > 1 ? hist[hist.length - 2] : now;
      const card = el('div', 'spark', `<div class="sp-top"><span>${icon(cat.icon)} ${cat.name}</span><b>${Math.round(now * 100)}%</b><span class="delta ${now >= prev ? 'up' : 'down'}">${now >= prev ? '▲' : '▼'}${Math.abs(Math.round((now - prev) * 100))}</span></div>`);
      const cv = document.createElement('canvas');
      cv.width = 260; cv.height = 70;
      card.appendChild(cv);
      const tip = el('div', 'sp-tip');
      card.appendChild(tip);
      grid.appendChild(card);
      this.drawSpark(cv, hist, cat.color);
      cv.addEventListener('mousemove', (e) => {
        const r = cv.getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left) / r.width) * (hist.length - 1));
        const v = hist[Math.max(0, Math.min(hist.length - 1, i))];
        const day = this.g.model.state.day - (hist.length - 1 - i);
        tip.textContent = `${day}日目: ${Math.round(v * 100)}%`;
        tip.style.left = `${((e.clientX - r.left) / r.width) * 100}%`;
        tip.classList.add('show');
      });
      cv.addEventListener('mouseleave', () => tip.classList.remove('show'));
    }
  }

  private drawSpark(cv: HTMLCanvasElement, data: number[], color: string) {
    const x = cv.getContext('2d')!;
    const w = cv.width, h = cv.height, pad = 6;
    const lo = Math.min(0.6, ...data), hi = Math.max(1.4, ...data);
    const Y = (v: number) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2);
    const X = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
    // 基準線 (100%)
    x.strokeStyle = 'rgba(255,255,255,0.22)';
    x.setLineDash([4, 4]);
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(pad, Y(1)); x.lineTo(w - pad, Y(1)); x.stroke();
    x.setLineDash([]);
    if (data.length < 2) { x.fillStyle = color; x.beginPath(); x.arc(X(0), Y(data[0]), 4, 0, Math.PI * 2); x.fill(); return; }
    const grd = x.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, color + '55'); grd.addColorStop(1, color + '00');
    x.beginPath();
    data.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))));
    x.lineTo(X(data.length - 1), h); x.lineTo(X(0), h); x.closePath();
    x.fillStyle = grd; x.fill();
    x.beginPath();
    data.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))));
    x.strokeStyle = color; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke();
    x.fillStyle = color;
    x.beginPath(); x.arc(X(data.length - 1), Y(data[data.length - 1]), 4, 0, Math.PI * 2); x.fill();
  }

  // ───── まとめ仕入れ ─────
  private renderLots() {
    const m = this.g.model;
    const bought = m.lotsBoughtToday();
    this.content.innerHTML = `<div class="dim small">業者からまとめて仕入れます (各ロット 1 日 1 回)。中身は在庫置き場に届きます。<b>未検品</b>なので、作業台で傷を確かめ、清掃・修理してから並べましょう。</div><div class="shop-grid"></div>`;
    const grid = this.content.querySelector('.shop-grid')!;
    for (const lot of LOTS) {
      const locked = m.state.level < lot.level;
      const done = bought.includes(lot.id);
      const card = el('div', `shop-card ${done ? 'owned' : ''} ${locked ? 'locked' : ''}`, `
        <div class="sc-name">${icon('cardboard-box-closed')} ${escapeHtml(lot.name)}</div>
        <div class="sc-desc">${escapeHtml(lot.desc)}</div>
        <div class="sc-meta">${lot.count} 点 ・ ${lot.cats.map((c) => CATEGORIES[c].name).join(' / ')}</div>
        <div class="sc-foot"><b>${yen(lot.price)}</b></div>`);
      const b = el('button', 'primary', done ? '本日は購入済み' : locked ? `Lv.${lot.level} で解放` : '仕入れる');
      b.disabled = done || locked || !m.canAfford(lot.price);
      b.onclick = () => {
        const items = m.buyLot(lot);
        if (!items) return;
        audio.play('success');
        toast(`${lot.name} (${items.length} 点) が在庫置き場に届きました`, 'good', 'cardboard-box');
        this.render();
      };
      card.querySelector('.sc-foot')!.appendChild(b);
      grid.appendChild(card);
    }
  }

  // ───── 商品管理 ─────
  private renderItems() {
    const m = this.g.model;
    const all = m.state.items.filter((i) => ['stock', 'fixture', 'bench', 'counter'].includes(i.loc.type));
    const unpriced = m.displayed().filter((i) => !i.price);
    const locName = (t: string) => ({ stock: '在庫', fixture: '陳列中', bench: '作業台', counter: 'カウンター' } as Record<string, string>)[t] ?? t;
    this.content.innerHTML = `
      ${m.has('price_gun') ? `<div class="gun">${icon('price-tag')} 値付けガン: 値札のない陳列品 ${unpriced.length} 点を 相場の <input type="number" class="pct" value="${this.gunPct}" min="30" max="300">% で <button class="primary do-gun">一括値付け</button></div>` : `<div class="dim small">「値付けガン」を導入すると、陳列品にまとめて値札をつけられます。</div>`}
      <table class="tbl"><thead><tr><th>商品</th><th>状態</th><th>場所</th><th>仕入</th><th>相場目安</th><th>売価</th><th></th></tr></thead><tbody></tbody></table>
      <div class="dim small">「業者に売る」は相場の 30% で即時に現金化します (ジャンク品の処分に)。</div>`;
    const tb = this.content.querySelector('tbody')!;
    for (const it of all.sort((a, b) => a.loc.type.localeCompare(b.loc.type))) {
      const def = itemDef(it.defId);
      const kv = knownValue(it, m.trend(def.category));
      const tr = el('tr', '', `<td>${escapeHtml(def.name)}</td><td><span class="grade" style="background:${GRADE_COLOR[kv.grade]}">${kv.grade}</span></td><td>${locName(it.loc.type)}</td><td>${it.cost ? yen(it.cost) : '―'}</td><td>${yen(kv.value)}</td><td>${it.price ? yen(it.price) : '<span class="dim">なし</span>'}</td><td></td>`);
      if (it.loc.type === 'stock') {
        const b = el('button', 'small', '業者に売る');
        b.onclick = () => {
          const v = nicePrice(kv.value * 0.3);
          m.addMoney(v, '業者買取');
          m.state.today.sales += v;
          m.state.stats.profit += v;
          m.removeItem(it.uid);
          audio.play('coin');
          toast(`${def.name} を業者に ${yen(v)} で売りました`, 'info', 'coins');
          this.render();
        };
        tr.lastElementChild!.appendChild(b);
      }
      tb.appendChild(tr);
    }
    const gun = this.content.querySelector('.do-gun');
    gun?.addEventListener('click', () => {
      this.gunPct = Number((this.content.querySelector('.pct') as HTMLInputElement).value) || 100;
      for (const it of unpriced) {
        it.price = nicePrice(knownValue(it, m.trend(itemDef(it.defId).category)).value * this.gunPct / 100);
        this.g.world.view(it.uid)?.refreshTag(true);
      }
      audio.play('success');
      toast(`${unpriced.length} 点に値札をつけました`, 'good', 'price-tag');
      this.render();
    });
  }

  // ───── 什器 ─────
  private renderFixtures() {
    const m = this.g.model;
    this.content.innerHTML = `<div class="dim small">購入すると配置モードになります。<kbd>R</kbd> 回転 ・ <kbd>クリック</kbd> 設置 ・ <kbd>Esc</kbd> キャンセル。既存の什器は見ながら <kbd>G</kbd> で移動できます。</div><div class="shop-grid"></div>`;
    const grid = this.content.querySelector('.shop-grid')!;
    for (const f of Object.values(FIXTURES).filter((f) => f.buyable)) {
      const locked = m.state.level < f.level;
      const owned = m.state.fixtures.filter((x) => x.defId === f.id).length;
      const sizes = [...new Set(f.slots.map((s) => SIZE_LABEL[s.size]))].join('・');
      const card = el('div', `shop-card ${locked ? 'locked' : ''}`, `
        <div class="sc-name">${escapeHtml(f.name)}</div>
        <div class="sc-desc">${escapeHtml(f.desc)}</div>
        <div class="sc-meta">${f.slots.length ? `陳列枠 ${f.slots.length} (${sizes})` : '装飾'} ・ 所有 ${owned}</div>
        <div class="sc-foot"><b>${yen(f.price)}</b></div>`);
      const b = el('button', 'primary', locked ? `Lv.${f.level} で解放` : '購入して配置');
      b.disabled = locked || !m.canAfford(f.price);
      b.onclick = () => { this.close(); this.g.build.startNew(f.id); };
      card.querySelector('.sc-foot')!.appendChild(b);
      grid.appendChild(card);
    }
  }

  // ───── 設備投資 ─────
  private renderUpgrades() {
    const m = this.g.model;
    this.content.innerHTML = `<div class="shop-grid"></div>`;
    const grid = this.content.querySelector('.shop-grid')!;
    for (const u of UPGRADES) {
      const owned = m.has(u.id);
      const locked = m.state.level < u.level;
      const card = el('div', `shop-card ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}`, `
        <div class="sc-name">${icon(u.icon)} ${escapeHtml(u.name)}</div>
        <div class="sc-desc">${escapeHtml(u.desc)}</div>
        ${u.upkeep ? `<div class="sc-meta">維持費 ${yen(u.upkeep)}/日</div>` : ''}
        <div class="sc-foot"><b>${yen(u.price)}</b></div>`);
      const b = el('button', 'primary', owned ? '導入済み' : locked ? `Lv.${u.level} で解放` : '導入する');
      b.disabled = owned || locked || !m.canAfford(u.price);
      b.onclick = () => {
        if (m.buyUpgrade(u.id)) {
          audio.play('success');
          toast(`${u.name} を導入しました！`, 'good', u.icon);
          this.g.onUpgrade(u.id);
          this.render();
        }
      };
      card.querySelector('.sc-foot')!.appendChild(b);
      grid.appendChild(card);
    }
  }

  // ───── 鑑定ガイド ─────
  private renderGuide() {
    const rows = ITEMS.filter((i) => i.auth).map((i) => `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.auth!.brand)}</td><td><b>${escapeHtml(i.auth!.mark)}</b></td><td>${i.auth!.serial.replace('####', '0000').replace('@', '＊')}</td><td>${i.auth!.weight.toLocaleString()} g</td><td>${yen(i.base)}</td></tr>`).join('');
    this.content.innerHTML = `
      <h3>真贋チェックの手順</h3>
      <ol class="guide">
        <li><b>刻印</b>: 正規の表記と 1 文字ずつ見比べる (0 と O、I と l、綴りの違いに注意)。</li>
        <li><b>シリアル</b>: 4 桁の数字を合計し、その一の位に対応する文字が末尾にあるか確認する。</li>
        <li><b>重量</b>: カタログ重量から ±3% 以上ずれていたら怪しい。</li>
        <li>1 つでもおかしければ偽物の可能性大。「偽物と判断」して断るか、偽物として安く買い取ろう。</li>
      </ol>
      <div class="lp-table big">チェック文字表: ${CHECK_TABLE.map((c, i) => `<span>${i} → ${c}</span>`).join('')}</div>
      <h3>ブランド・美術品カタログ</h3>
      <table class="tbl"><thead><tr><th>品名</th><th>ブランド</th><th>正規刻印</th><th>シリアル書式</th><th>重量</th><th>基準価格</th></tr></thead><tbody>${rows}</tbody></table>
      <h3>グレードと価格</h3>
      <div class="grades">${(['S', 'A', 'B', 'C', 'D', 'J'] as const).map((g) => `<span class="grade" style="background:${GRADE_COLOR[g]}">${g}</span>`).join(' ')} <span class="dim">S=100% A=85% B=68% C=50% D=33% J(ジャンク)=18% ・ 付属品 1 つ欠けるごとに -7%</span></div>`;
  }

  // ───── 経営状況 ─────
  private renderStats() {
    const s = this.g.model.state;
    const t = s.today;
    const st = s.stats;
    const cost = this.g.model.dailyCosts();
    this.content.innerHTML = `
      <div class="stat-tiles">
        <div class="tile"><div class="lbl">本日の売上</div><div class="val">${yen(t.sales)}</div></div>
        <div class="tile"><div class="lbl">本日の仕入</div><div class="val">${yen(t.purchases)}</div></div>
        <div class="tile"><div class="lbl">来店客</div><div class="val">${t.customers}人</div></div>
        <div class="tile"><div class="lbl">店舗レベル</div><div class="val">Lv.${s.level}</div><div class="sub">次まで ${this.g.model.xpForLevel(s.level) - s.xp} XP</div></div>
      </div>
      <h3>累計</h3>
      <table class="tbl kv">
        <tr><td>累計売上</td><td>${yen(st.totalSales)}</td><td>累計仕入</td><td>${yen(st.totalPurchases)}</td></tr>
        <tr><td>累計利益</td><td class="${st.profit >= 0 ? 'good' : 'bad'}">${yen(st.profit)}</td><td>最高額の販売</td><td>${yen(st.bestSale)}</td></tr>
        <tr><td>販売数</td><td>${st.itemsSold}</td><td>買取数</td><td>${st.itemsBought}</td></tr>
        <tr><td>見抜いた偽物</td><td>${st.fakesCaught}</td><td>清掃 / 修理</td><td>${st.cleaned} / ${st.repaired}</td></tr>
      </table>
      <h3>毎日の固定費</h3>
      <table class="tbl kv">${cost.map((c) => `<tr><td>${escapeHtml(c.label)}</td><td>${yen(c.amount)}</td></tr>`).join('')}<tr><td><b>合計</b></td><td><b>${yen(cost.reduce((a, b) => a + b.amount, 0))}</b></td></tr></table>`;
  }
}
