import { audio } from '../core/audio';
import { events, toast } from '../core/events';
import { el, escapeHtml, nicePrice, rng, yen } from '../core/util';
import { CATEGORIES, itemDef } from '../data/items';
import { line } from '../data/dialogue';
import type { Customer } from '../entities/customer';
import type { Game } from '../game/game';
import {
  CHECK_TABLE, GRADE_COLOR, GRADE_LABEL, GRADE_MULT, knownValue, markValid, serialValid, weightDeviation,
} from '../game/valuation';
import { InspectStage } from './inspect';
import { Modal, icon, priceInput } from './ui';

/** 買取査定と価格交渉 */
export class AppraisalUI extends Modal {
  private stage: InspectStage | null = null;
  private c: Customer | null = null;
  private offer = priceInput(0, () => this.refreshOfferHint());
  private log!: HTMLElement;
  private side!: HTMLElement;
  private done = false;

  constructor(private g: Game) {
    super('appraisal');
    this.el.innerHTML = `
      <div class="ap-view">
        <div class="ap-canvas"></div>
        <div class="ap-tools"></div>
        <div class="ap-hint">ドラッグで回転 ・ ホイールで拡大 ・ 傷や凹みを<b>クリック</b>して記録</div>
        <div class="ap-loupe hidden"></div>
      </div>
      <div class="ap-side"></div>`;
    this.side = this.el.querySelector('.ap-side')!;
  }

  open() {
    const c = this.g.customers.appraisalCustomer();
    if (!c || !c.sellItem) { toast('査定待ちのお客さんがいません', 'warn'); return; }
    this.c = c;
    this.done = false;
    c.state = 'appraising';
    this.g.ui.open(this);
  }

  onOpen() {
    const c = this.c!;
    const it = c.sellItem!;
    this.logLines = [];
    this.offer.set(0);
    if (!this.stage) this.stage = new InspectStage(this.el.querySelector('.ap-canvas')!);
    this.stage.setItem(it, 'appraise');
    this.stage.onDefectFound = (d) => {
      audio.play('success', { volume: 0.5, rate: 1.4 });
      toast(`${({ scratch: '擦り傷', dent: '凹み', crack: 'ヒビ', fade: '色あせ' } as const)[d.kind]}を発見 (状態 -${d.severity})`, 'info', 'magnifying-glass');
      this.renderSide();
    };
    const n = c.negotiation!;
    this.renderTools();
    this.renderSide();
    const wishKey = c.arch.id === 'mover' && rng.chance(0.4) ? 'wishLow' : 'wish';
    this.addLog(c.name, line(wishKey, { price: yen(nicePrice(n.ask)) }));
    if ((c as any).knowsBroken) this.addLog(c.name, '…実は電源が入らなくなっちゃって。');
    const acc = it.accessories.length ? `付属品は${it.accessories.join('・')}があります。` : '';
    if (acc) this.addLog(c.name, acc);
    this.offer.set(nicePrice(knownValue(it, this.g.model.trend(itemDef(it.defId).category)).value * 0.4));
    this.el.querySelector('.ap-loupe')!.classList.add('hidden');
  }

  onClose() {
    const c = this.c;
    if (c && !this.done && c.state === 'appraising') c.state = 'waitAppraisal';
  }

  update(dt: number) {
    this.stage?.render(dt);
    if (this.c && !this.done) {
      const bar = this.side.querySelector('.cust-mood i') as HTMLElement | null;
      if (bar) {
        bar.style.width = `${Math.max(0, this.c.patience) * 100}%`;
        bar.style.background = this.c.patience > 0.5 ? '#6fdc7a' : this.c.patience > 0.25 ? '#ffc94a' : '#ff5c5c';
      }
      // 査定中も少しずつ待たせている
      this.c.patience -= dt * 0.0025 * (1 - this.c.arch.patience);
      if (this.c.patience <= 0) this.walkAway();
    }
  }

  private renderTools() {
    const it = this.c!.sellItem!;
    const def = itemDef(it.defId);
    const tools = this.el.querySelector('.ap-tools')!;
    tools.innerHTML = '';
    const btn = (ico: string, label: string, fn: () => void, dis = false) => {
      const b = el('button', 'tool', `${icon(ico)}<span>${label}</span>`);
      b.disabled = dis;
      b.onclick = fn;
      tools.appendChild(b);
      return b;
    };
    if (def.electronic) {
      btn('laptop', it.tested ? (it.working ? '動作OK' : '動作不良') : '通電テスト', () => {
        it.tested = true;
        if (it.working) { audio.play('success', { volume: 0.6 }); toast('電源が入り、正常に動作した', 'good'); }
        else { audio.errorBuzz(); toast('電源が入らない…ジャンク品だ', 'bad'); }
        this.renderTools();
        this.renderSide();
      }, it.tested);
    }
    if (def.auth) {
      btn('magnifying-glass', '刻印ルーペ', () => this.showLoupe());
    }
    if (this.g.model.has('loupe') || this.g.model.state.level >= 99) {
      btn('sparkles', '全体を精査', () => { this.stage?.revealAll(); this.renderSide(); });
    }
  }

  private showLoupe() {
    const it = this.c!.sellItem!;
    const spec = itemDef(it.defId).auth!;
    const pro = this.g.model.has('loupe');
    const scale = this.g.model.has('scale');
    const box = this.el.querySelector('.ap-loupe')!;
    box.classList.remove('hidden');
    const markHtml = [...it.mark].map((ch, i) => {
      const bad = pro && ch !== spec.mark[i];
      return `<span class="${bad ? 'sus' : ''}">${escapeHtml(ch)}</span>`;
    }).join('') + (pro && it.mark.length !== spec.mark.length ? '<span class="sus">?</span>' : '');
    const dev = weightDeviation(spec, it.weight);
    box.innerHTML = `
      <div class="lp-head">${icon('magnifying-glass')} 刻印ルーペ <button class="x">×</button></div>
      <div class="lp-engrave">${markHtml}</div>
      <div class="lp-serial">SERIAL No. <b>${it.serial}</b></div>
      <div class="lp-weight">${icon('scales')} 実測 <b>${it.weight.toLocaleString()} g</b>${scale ? ` <span class="${Math.abs(dev) > 0.03 ? 'bad' : 'good'}">(カタログ比 ${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(1)}%)</span>` : ''}</div>
      <div class="lp-guide">
        <div class="lp-gt">鑑定ガイド: ${escapeHtml(spec.brand)}</div>
        <div>正規刻印: <b>${escapeHtml(spec.mark)}</b></div>
        <div>シリアル書式: <b>${spec.serial.replace('####', '0000').replace('@', '＊')}</b> ・ カタログ重量: <b>${spec.weight.toLocaleString()} g</b></div>
        <div class="lp-table">末尾＊＝4桁の数字の合計の一の位 → ${CHECK_TABLE.map((c, i) => `<span>${i}:${c}</span>`).join('')}</div>
      </div>
      <div class="lp-verdict">
        <button class="v-genuine ${it.verdict === 'genuine' ? 'on' : ''}">${icon('check-mark')} 本物と判断</button>
        <button class="v-fake ${it.verdict === 'fake' ? 'on' : ''}">${icon('cancel')} 偽物と判断</button>
      </div>`;
    box.querySelector('.x')!.addEventListener('click', () => box.classList.add('hidden'));
    box.querySelector('.v-genuine')!.addEventListener('click', () => { it.verdict = 'genuine'; this.showLoupe(); this.renderSide(); });
    box.querySelector('.v-fake')!.addEventListener('click', () => { it.verdict = 'fake'; this.showLoupe(); this.renderSide(); });
    // デバッグ用に正誤を保持
    box.setAttribute('data-valid', String(markValid(spec, it.mark) && serialValid(spec, it.serial) && Math.abs(dev) < 0.03));
  }

  private renderSide() {
    const c = this.c!;
    const it = c.sellItem!;
    const def = itemDef(it.defId);
    const cat = CATEGORIES[def.category];
    const trend = this.g.model.trend(def.category);
    const kv = knownValue(it, trend);
    const found = it.defects.filter((d) => d.found);
    const n = c.negotiation!;
    const offerVal = this.offer.get();
    this.side.innerHTML = `
      <div class="cust">
        <div class="cust-name">${escapeHtml(c.name)} <span class="tag">${escapeHtml(c.arch.label)}</span></div>
        <div class="cust-mood"><i></i></div>
      </div>
      <div class="ap-item">
        <div class="ap-cat" style="color:${cat.color}">${icon(cat.icon)} ${cat.name}</div>
        <div class="ap-name">${escapeHtml(def.name)}</div>
        <div class="ap-flavor">${escapeHtml(def.flavor)}</div>
        <div class="ap-grid">
          <div>付属品</div><div>${(def.accessories ?? []).map((a) => `<span class="acc ${it.accessories.includes(a) ? 'have' : 'miss'}">${a}</span>`).join('') || '<span class="dim">なし</span>'}</div>
          <div>発見した傷</div><div>${found.length ? found.map((d) => `<span class="def">-${d.severity}</span>`).join('') : '<span class="dim">まだ見つけていない</span>'}</div>
          <div>汚れ</div><div>${it.dirt > 0.6 ? 'ひどい' : it.dirt > 0.25 ? 'あり' : '少ない'} <span class="dim">(清掃で回復)</span></div>
          ${def.electronic ? `<div>動作</div><div>${it.tested ? (it.working ? '<b class="good">OK</b>' : '<b class="bad">不良 (ジャンク)</b>') : '<span class="dim">未確認</span>'}</div>` : ''}
          ${def.auth ? `<div>真贋</div><div>${it.verdict === 'genuine' ? '<b class="good">本物と判断</b>' : it.verdict === 'fake' ? '<b class="bad">偽物と判断</b>' : '<span class="dim">未判定 (刻印ルーペで確認)</span>'}</div>` : ''}
        </div>
      </div>
      <div class="ap-market">
        <div class="row"><span>相場 (新品同様・完品)</span><b>${yen(def.base * trend)}</b><span class="trend ${trend >= 1 ? 'up' : 'down'}">${trend >= 1 ? '▲' : '▼'}${Math.abs(Math.round((trend - 1) * 100))}%</span></div>
        <div class="row"><span>推定グレード</span><b><span class="grade" style="background:${GRADE_COLOR[kv.grade]}">${kv.grade}</span> ${GRADE_LABEL[kv.grade]} ×${GRADE_MULT[kv.grade]}</b></div>
        <div class="row big"><span>推定販売価格</span><b>${yen(kv.value)}${kv.certain ? '' : ' ?'}</b></div>
        ${kv.certain ? '' : '<div class="warn-note">未確認の項目があります。見落としがあると実際の価値はもっと低いかも。</div>'}
      </div>
      <div class="ap-ask">${icon('conversation')} 希望額 <b>${yen(nicePrice(n.ask))}</b>${n.rounds ? ` <span class="dim">(交渉 ${n.rounds} 回目)</span>` : ''}</div>
      <div class="ap-log"></div>
      <div class="ap-offer">
        <div class="quick"></div>
        <div class="offer-row"></div>
        <div class="offer-hint"></div>
        <div class="btns">
          <button class="primary offer-btn">${icon('money-stack')} この額を提示</button>
          <button class="danger decline-btn">${icon('cancel')} お断りする</button>
        </div>
      </div>`;
    this.log = this.side.querySelector('.ap-log')!;
    for (const l of this.logLines) this.log.appendChild(l.cloneNode(true));
    this.log.scrollTop = 1e6;
    this.side.querySelector('.offer-row')!.appendChild(this.offer.el);
    this.offer.set(offerVal || nicePrice(kv.value * 0.4));
    const quick = this.side.querySelector('.quick')!;
    for (const p of [0.3, 0.4, 0.5, 0.6]) {
      const b = el('button', 'chip', `${Math.round(p * 100)}%`);
      b.title = '推定販売価格に対する割合';
      b.onclick = () => this.offer.set(nicePrice(kv.value * p));
      quick.appendChild(b);
    }
    const ask = el('button', 'chip', '希望額');
    ask.onclick = () => this.offer.set(nicePrice(n.ask));
    quick.appendChild(ask);
    this.side.querySelector('.offer-btn')!.addEventListener('click', () => this.makeOffer());
    this.side.querySelector('.decline-btn')!.addEventListener('click', () => this.decline());
    this.refreshOfferHint();
  }

  private refreshOfferHint() {
    const hint = this.side?.querySelector('.offer-hint');
    if (!hint || !this.c?.sellItem) return;
    const it = this.c.sellItem;
    const kv = knownValue(it, this.g.model.trend(itemDef(it.defId).category));
    const o = this.offer.get();
    const margin = kv.value - o;
    const afford = this.g.model.canAfford(o);
    hint.innerHTML = `見込み粗利 <b class="${margin >= 0 ? 'good' : 'bad'}">${margin >= 0 ? '+' : ''}${yen(margin)}</b> (${Math.round((o / Math.max(1, kv.value)) * 100)}%)${afford ? '' : ' <b class="bad">所持金不足</b>'}`;
  }

  private logLines: HTMLElement[] = [];
  private addLog(who: string, text: string, kind = '') {
    const d = el('div', `log ${kind}`, `<b>${escapeHtml(who)}</b> ${escapeHtml(text)}`);
    this.logLines.push(d);
    if (this.logLines.length > 30) this.logLines.shift();
    if (this.log) { this.log.appendChild(d.cloneNode(true)); this.log.scrollTop = 1e6; }
    if (who !== 'あなた') this.c?.say(text, 3.5);
  }

  private makeOffer() {
    const c = this.c!;
    const it = c.sellItem!;
    const n = c.negotiation!;
    const o = this.offer.get();
    if (!this.g.model.canAfford(o)) { audio.errorBuzz(); toast('所持金が足りません', 'bad'); return; }
    if (o <= 0) return;
    this.addLog('あなた', `${yen(o)}でいかがでしょう？`, 'me');
    n.rounds++;
    const fakeFlagged = it.verdict === 'fake';
    // 偽物だと指摘された場合: 怪しい客は安値でも手放す
    let reserve = n.reserve;
    let ask = n.ask;
    if (fakeFlagged && !it.authentic) { reserve *= 0.08; ask *= 0.12; }
    if (o >= ask * 0.98) return this.accept(o, true);
    if (o >= reserve) {
      const t = (o - reserve) / Math.max(1, ask - reserve);
      if (rng.chance(0.3 + 0.6 * t) || n.rounds >= 4) return this.accept(o, t > 0.55);
      const next = nicePrice(Math.max(o * 1.06, (ask + o) / 2));
      n.ask = fakeFlagged && !it.authentic ? next / 0.12 : next;
      c.patience -= 0.1;
      this.addLog(c.name, line('counter', { price: yen(next) }));
    } else if (o < reserve * 0.55) {
      c.patience -= 0.34;
      this.addLog(c.name, line('insulted'), 'bad');
      c.gesture('Hit_B', 'Idle');
    } else {
      const next = nicePrice(Math.max(reserve * 1.12, ask * 0.92));
      n.ask = fakeFlagged && !it.authentic ? next / 0.12 : next;
      c.patience -= 0.18;
      this.addLog(c.name, line('counter', { price: yen(next) }));
    }
    audio.play('swap', { volume: 0.4 });
    if (c.patience <= 0) return this.walkAway();
    this.renderSide();
  }

  private accept(o: number, happy: boolean) {
    const c = this.c!;
    const it = c.sellItem!;
    const m = this.g.model;
    m.addMoney(-o, '買取');
    it.cost = o;
    it.day = m.state.day;
    m.state.today.purchases += o;
    m.state.today.bought++;
    m.state.stats.totalPurchases += o;
    m.state.stats.itemsBought++;
    m.state.stats.profit -= o;
    m.addXp(8 + Math.sqrt(o) * 0.15);
    if (happy) m.addRep(0.8);
    if (!it.authentic) {
      if (it.verdict === 'fake') { m.state.stats.fakesCaught++; m.addXp(40); events.emit('fake:detected', { itemUid: it.uid }); }
      else { m.state.stats.fakesBought++; events.emit('fake:bought', { itemUid: it.uid }); }
    }
    this.done = true;
    audio.register();
    this.addLog(c.name, happy ? line('acceptHappy') : line('acceptGrudging'), 'good');
    events.emit('item:bought', { itemUid: it.uid, price: o });
    this.g.customers.finishAppraisal(c, 'accepted', happy);
    // 品物はカウンター上に残る (手に取れる)
    this.showResult(`買取成立！ ${yen(o)} で「${itemDef(it.defId).name}」を買い取りました。`, it.uid);
  }

  private decline() {
    const c = this.c!;
    const it = c.sellItem!;
    const m = this.g.model;
    this.addLog('あなた', '申し訳ありませんが、今回はお引き取りください。', 'me');
    if (it.verdict === 'fake') {
      if (!it.authentic) {
        m.state.stats.fakesCaught++;
        m.addXp(40);
        m.addRep(1);
        toast('偽物を見抜いた！ 評判 +1', 'good', 'magnifying-glass');
        events.emit('fake:detected', { itemUid: it.uid });
      } else {
        m.addRep(-2);
        toast('本物を偽物扱いしてしまった… 評判 -2', 'bad', 'angry-eyes');
      }
    }
    this.done = true;
    this.g.customers.finishAppraisal(c, 'declined');
    this.close();
  }

  private walkAway() {
    if (this.done) return;
    this.done = true;
    this.g.model.addRep(-2);
    toast(`${this.c!.name}は怒って帰ってしまった… 評判 -2`, 'bad', 'angry-eyes');
    this.g.customers.finishAppraisal(this.c!, 'angry');
    this.close();
  }

  private showResult(text: string, uid: string) {
    const side = this.side;
    side.querySelector('.ap-offer')!.innerHTML = `
      <div class="result">${icon('check-mark')} ${escapeHtml(text)}</div>
      <div class="btns">
        <button class="primary to-stock">${icon('cardboard-box')} 在庫置き場へ送る</button>
        <button class="keep">カウンターに置いておく</button>
      </div>`;
    side.querySelector('.to-stock')!.addEventListener('click', () => {
      const it = this.g.model.item(uid);
      if (it) { this.g.world.destroyView(uid); it.loc = { type: 'stock' }; }
      this.close();
    });
    side.querySelector('.keep')!.addEventListener('click', () => this.close());
  }
}
