// バトル画面。BattleView（演出）と、あなたの操作（BattleController）を兼ねる。
// カードは上へスワイプして出す。兵は相手の兵か城へドラッグして攻撃。対象のいる呪文は対象までドラッグ。
import { BATTLE, CARDS, HEROES, KW_DESC, KW_NAME, PLAYER_COLORS, cardText } from '../data/defs.ts';
import { audio, type Sfx } from '../audio.ts';
import type { BAction, Battle, BattleController, BattleView, Target, Unit } from '../game/battle.ts';
import { BattleAI } from '../game/battleAi.ts';
import type { HeroId } from '../game/types.ts';
import { icon } from './icons.ts';
import { esc, sleep, type UI } from './ui.ts';

const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 振動できない端末 */
  }
};

export interface BattleSideInfo {
  name: string;
  hero: HeroId | null;
  color: string;
  icon: string;
  /** 攻める側か守る側か、どこの領地か */
  role: string;
}

/** 手札・報酬などで使うカード1枚の HTML */
export function battleCardHtml(id: string, opts: { usable?: boolean; small?: boolean; idx?: number; spellBonus?: number } = {}) {
  const c = CARDS[id];
  const cls = ['card', c.type === 'unit' ? 'k-unit' : 'k-spell', `r-${c.rarity}`, c.monster ? 'monster' : '', opts.usable === false ? 'unusable' : '', opts.small ? 'small' : ''].filter(Boolean).join(' ');
  const text = cardText(c, opts.spellBonus ?? 0);
  return `<div class="${cls}" data-card="${id}" ${opts.idx !== undefined ? `data-idx="${opts.idx}"` : ''}>
    <div class="c-art">${icon(c.icon)}</div>
    <i class="c-win"></i>
    <div class="c-text${text.length > 30 ? ' long' : text.length > 20 ? ' mid' : ''}"><span>${text || (c.type === 'unit' ? 'ふつうの兵。' : '')}</span></div>
    <div class="c-type">${c.type === 'unit' ? (c.monster ? '魔物' : '兵') : '呪文'}</div>
    <i class="c-trim"></i>
    <div class="c-banner"><span>${c.name}</span></div>
    <div class="c-cost">${c.cost}</div>
    <i class="c-mark"></i>
    ${c.type === 'unit' ? `<div class="c-atk">${c.atk}</div><div class="c-hp">${c.hp}</div>` : ''}
  </div>`;
}

type Drag = { kind: 'card'; index: number } | { kind: 'unit'; uid: number };

export class BattleUI implements BattleView, BattleController {
  ui: UI;
  root: HTMLElement;
  b!: Battle;
  me: 0 | 1;
  info: [BattleSideInfo, BattleSideInfo];
  auto = false;
  private ai = new BattleAI(0.9);
  private resolveAct: ((a: BAction) => void) | null = null;
  private unitEls = new Map<number, HTMLElement>();
  private selected: Drag | null = null;
  private dealing = 0;
  private busy = false;
  private cpuDelay = 520;

  constructor(ui: UI, me: 0 | 1, info: [BattleSideInfo, BattleSideInfo]) {
    this.ui = ui;
    this.me = me;
    this.info = info;
    this.root = document.createElement('div');
    this.root.className = 'battle';
    ui.root.appendChild(this.root);
  }

  private get foe(): 0 | 1 {
    return this.me === 0 ? 1 : 0;
  }

  // ---------- 骨組み ----------
  mount(b: Battle) {
    this.b = b;
    const side = (s: 0 | 1, mine: boolean) => {
      const inf = this.info[s];
      return `<div class="b-hero ${mine ? 'me' : 'foe'}" data-target="face-${s}" style="--pc:${inf.color}">
        <div class="b-portrait">${icon(inf.icon)}</div>
        <div class="b-hinfo"><b>${esc(inf.name)}</b><small>${inf.role}</small></div>
        <div class="b-hp"><i class="gi-wrap">${icon('hearts')}</i><span class="hpn"></span><div class="hpbar"><i></i></div></div>
        ${mine ? '' : '<div class="b-foehand"></div>'}
        <div class="b-mana"></div>
      </div>`;
    };
    this.root.innerHTML = `
      <div class="b-backdrop"></div>
      <div class="b-board">
        ${side(this.foe, false)}
        <div class="b-field foe" data-side="${this.foe}"></div>
        <div class="b-mid"><span class="b-turn"></span></div>
        <div class="b-field me" data-side="${this.me}"></div>
        ${side(this.me, true)}
      </div>
      <div class="b-controls">
        <button type="button" class="pile deck" title="山札"><b>0</b></button>
        <button type="button" class="btn ghost b-auto" title="CPUに任せる">${icon('cog')}おまかせ</button>
        <button type="button" class="end-turn">ターン終了</button>
      </div>
      <div class="b-hint"></div>
      <div class="hand fan b-hand"></div>`;
    requestAnimationFrame(() => this.root.classList.add('in'));
    this.root.querySelector('.end-turn')!.addEventListener('click', () => {
      if (this.myTurn() && !this.busy) this.submit({ type: 'end' });
    });
    this.root.querySelector('.b-auto')!.addEventListener('click', () => {
      this.auto = !this.auto;
      this.root.querySelector('.b-auto')!.classList.toggle('on', this.auto);
      if (this.auto && this.resolveAct) void this.ai.act(this.b, this.me).then((a) => this.submit(a));
    });
    this.root.querySelector('.pile.deck')!.addEventListener('click', () => this.showDeck());
    // 盤面のクリック（選択中のカードや兵の対象を選ぶ）
    this.root.querySelector('.b-board')!.addEventListener('click', (e) => this.onBoardTap(e as MouseEvent));
    this.sync();
  }

  unmount() {
    this.root.classList.remove('in');
    setTimeout(() => this.root.remove(), 300);
  }

  private myTurn() {
    return this.b.turn === this.me && !!this.resolveAct;
  }

  // ---------- 描画 ----------
  sync() {
    if (!this.b) return;
    for (const s of [0, 1] as const) {
      const side = this.b.sides[s];
      const hero = this.root.querySelector<HTMLElement>(`.b-hero[data-target="face-${s}"]`)!;
      hero.querySelector('.hpn')!.textContent = String(Math.max(0, side.hp));
      (hero.querySelector('.hpbar i') as HTMLElement).style.width = `${Math.max(0, (side.hp / side.maxHp) * 100)}%`;
      hero.querySelector('.b-mana')!.innerHTML = Array.from({ length: BATTLE.maxMana }, (_, k) => `<i class="${k < side.mana ? 'on' : k < side.maxMana ? 'used' : ''}"></i>`).join('') + `<span>${side.mana}/${side.maxMana}</span>`;
      const fh = hero.querySelector('.b-foehand');
      if (fh) fh.innerHTML = `${'<i></i>'.repeat(Math.min(side.hand.length, 8))}<span>${side.hand.length}</span>`;
      this.syncField(s);
    }
    const me = this.b.sides[this.me];
    this.root.querySelector('.pile.deck b')!.textContent = String(me.deck.length);
    this.renderHand();
    const myTurn = this.myTurn();
    this.root.classList.toggle('my-turn', myTurn);
    const anyMove = myTurn && (me.hand.some((_, i) => this.b.canPlay(this.me, i)) || me.field.some((u) => this.b.attackTargets(u).length > 0));
    this.root.querySelector('.end-turn')!.classList.toggle('ready', myTurn && !anyMove);
    (this.root.querySelector('.end-turn') as HTMLButtonElement).disabled = !myTurn;
    this.root.querySelector('.b-turn')!.textContent = this.b.over ? '' : this.b.turn === this.me ? 'あなたのターン' : '相手のターン';
    this.root.querySelector('.b-hint')!.textContent = !myTurn
      ? ''
      : this.selected
        ? this.selected.kind === 'unit'
          ? '攻撃する相手をタップ（光っているもの）'
          : '対象をタップ（光っているもの）'
        : 'カードは上へスワイプで出す。兵は敵へドラッグで攻撃';
    this.markTargets();
  }

  private syncField(s: 0 | 1) {
    const box = this.root.querySelector<HTMLElement>(`.b-field[data-side="${s}"]`)!;
    const units = this.b.sides[s].field;
    for (const u of units) {
      let el = this.unitEls.get(u.uid);
      if (!el) {
        el = document.createElement('div');
        el.className = 'bunit enter';
        el.dataset.target = `unit-${u.uid}`;
        el.dataset.uid = String(u.uid);
        const c = CARDS[u.card];
        el.innerHTML = `<div class="u-art">${icon(c.icon)}</div><div class="u-name">${c.name}</div><div class="u-kw"></div><div class="u-atk"></div><div class="u-hp"></div>`;
        this.unitEls.set(u.uid, el);
        if (s === this.me) this.bindUnit(el, u.uid);
        el.addEventListener('animationend', () => el!.classList.remove('enter'), { once: true });
      }
      if (el.parentElement !== box) box.appendChild(el);
      const c = CARDS[u.card];
      el.querySelector('.u-atk')!.textContent = String(u.atk);
      const hp = el.querySelector<HTMLElement>('.u-hp')!;
      hp.textContent = String(u.hp);
      hp.classList.toggle('hurt', u.hp < u.maxHp);
      el.querySelector<HTMLElement>('.u-atk')!.classList.toggle('up', u.atk > (c.atk ?? 0));
      el.querySelector('.u-kw')!.innerHTML = u.kw.filter((k) => k !== 'shield').map((k) => `<i title="${KW_NAME[k]}">${icon({ guard: 'shield', rush: 'fast-forward-button', ranged: 'bow-arrow', shield: 'magic-shield' }[k])}</i>`).join('');
      el.classList.toggle('guard', u.kw.includes('guard'));
      el.classList.toggle('shielded', u.shield);
      el.classList.toggle('ready', s === this.me && this.myTurn() && this.b.attackTargets(u).length > 0);
      el.classList.toggle('sel', this.selected?.kind === 'unit' && this.selected.uid === u.uid);
      el.title = `${c.name}（${u.atk}/${u.hp}）${u.kw.map((k) => '\n' + KW_DESC[k]).join('')}${cardText(c) && c.fx?.length ? '\n' + cardText(c) : ''}`;
    }
    // 並び順をそろえる
    units.forEach((u) => box.appendChild(this.unitEls.get(u.uid)!));
  }

  private renderHand() {
    const box = this.root.querySelector<HTMLElement>('.b-hand')!;
    const me = this.b.sides[this.me];
    const n = me.hand.length;
    const fresh = this.dealing;
    this.dealing = 0;
    const bonus = me.hero === 'mage' ? 1 : 0;
    const usable = (i: number) => this.myTurn() && this.b.canPlay(this.me, i);
    box.style.setProperty('--n', String(n));
    box.classList.toggle('enter', fresh > 0);
    box.innerHTML = me.hand
      .map((c, i) => {
        const mid = (n - 1) / 2;
        const isNew = i >= n - fresh;
        const sel = this.selected?.kind === 'card' && this.selected.index === i;
        return `<div class="slot${usable(i) ? ' playable' : ''}${sel ? ' sel' : ''}" style="--i:${i - mid};--d:${isNew ? (i - (n - fresh)) * 90 : 0}ms${isNew ? '' : ';animation:none'}" data-i="${i}">${battleCardHtml(c, { usable: usable(i) || !this.myTurn(), idx: i, spellBonus: bonus })}</div>`;
      })
      .join('');
    box.querySelectorAll<HTMLElement>('.slot').forEach((el) => this.bindCard(el, Number(el.dataset.i)));
  }

  /** 選んでいるカード・兵の対象を光らせる */
  private markTargets() {
    this.root.querySelectorAll('.tgt').forEach((e) => e.classList.remove('tgt'));
    const ts = this.targetsFor(this.selected);
    for (const t of ts) this.elOf(t)?.classList.add('tgt');
  }
  private targetsFor(d: Drag | null): Target[] {
    if (!d || !this.myTurn()) return [];
    if (d.kind === 'unit') {
      const u = this.b.unit(d.uid);
      return u ? this.b.attackTargets(u) : [];
    }
    const card = this.b.sides[this.me].hand[d.index];
    return card && this.b.needsTarget(card) ? this.b.cardTargets(this.me, card) : [];
  }
  private elOf(t: Target): HTMLElement | null {
    if (t.kind === 'face') return this.root.querySelector(`.b-hero[data-target="face-${t.side}"]`);
    return this.unitEls.get(t.uid) ?? null;
  }
  private targetAt(x: number, y: number): Target | null {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-target]');
    if (!el || !this.root.contains(el)) return null;
    const [k, v] = el.dataset.target!.split('-');
    return k === 'face' ? { kind: 'face', side: Number(v) as 0 | 1 } : { kind: 'unit', uid: Number(v) };
  }

  // ---------- 操作 ----------
  async act(b: Battle, side: 0 | 1): Promise<BAction> {
    this.b = b;
    if (side !== this.me) {
      // 相手（CPU）の手番：少し間をおいて1手ずつ
      await sleep(this.cpuDelay);
      return this.ai.act(b, side).then((a) => (a.type === 'end' ? a : a));
    }
    if (this.auto) {
      await sleep(this.cpuDelay * 0.7);
      return this.ai.act(b, side);
    }
    return new Promise((resolve) => {
      this.resolveAct = resolve;
      this.selected = null;
      this.sync();
    });
  }

  private submit(a: BAction) {
    const r = this.resolveAct;
    if (!r) return;
    this.resolveAct = null;
    this.selected = null;
    r(a);
  }

  private trySubmit(d: Drag, target?: Target) {
    if (!this.myTurn()) return false;
    if (d.kind === 'card') {
      const card = this.b.sides[this.me].hand[d.index];
      if (!card || !this.b.canPlay(this.me, d.index)) return false;
      const ts = this.b.needsTarget(card) ? this.b.cardTargets(this.me, card) : [];
      if (ts.length && (!target || !ts.some((t) => this.b.sameTarget(t, target)))) return false;
      this.submit({ type: 'play', hand: d.index, target: ts.length ? target : undefined });
      return true;
    }
    const u = this.b.unit(d.uid);
    if (!u || !target || !this.b.attackTargets(u).some((t) => this.b.sameTarget(t, target))) return false;
    this.submit({ type: 'attack', uid: d.uid, target });
    return true;
  }

  private onBoardTap(e: MouseEvent) {
    if (!this.selected || !this.myTurn()) return;
    const t = this.targetAt(e.clientX, e.clientY);
    if (t && this.trySubmit(this.selected, t)) return;
    // 自分の兵をタップしたなら選び直し（bindUnit 側で処理）
    if ((e.target as HTMLElement).closest('.bunit')) return;
    this.selected = null;
    this.sync();
  }

  /** 手札のカード：上へスワイプで出す／対象までドラッグ／2回タップ */
  private bindCard(el: HTMLElement, index: number) {
    this.bindDrag(el, { kind: 'card', index }, (x, y) => {
      const card = this.b.sides[this.me].hand[index];
      if (!card) return null;
      if (this.b.needsTarget(card)) return this.targetAt(x, y);
      const line = this.root.querySelector('.b-hand')!.getBoundingClientRect().top - 20;
      return y < line ? ({ kind: 'face', side: this.foe } as Target) : null; // 対象のいらないカードは「上で離す」だけ
    });
  }
  private bindUnit(el: HTMLElement, uid: number) {
    this.bindDrag(el, { kind: 'unit', uid }, (x, y) => this.targetAt(x, y));
  }

  private bindDrag(el: HTMLElement, d: Drag, probe: (x: number, y: number) => Target | null) {
    let start: { x: number; y: number } | null = null;
    let ghost: HTMLElement | null = null;
    let line: SVGSVGElement | null = null;
    let hover: Target | null = null;
    const origin = () => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const isCard = d.kind === 'card';
    const ok = () => (isCard ? this.myTurn() && this.b.canPlay(this.me, d.index) : this.myTurn() && !!this.b.unit(d.uid) && this.b.attackTargets(this.b.unit(d.uid)!).length > 0);
    const needs = () => (isCard ? this.b.needsTarget(this.b.sides[this.me].hand[d.index] ?? '') : true);
    const begin = () => {
      this.selected = d;
      this.markTargets();
      el.classList.add('lifting');
      audio.play('hover', { volume: 0.6 });
      vibrate(8);
      if (isCard && !needs()) {
        ghost = document.createElement('div');
        ghost.className = 'drag-card';
        ghost.innerHTML = el.querySelector('.card')!.outerHTML;
        this.root.appendChild(ghost);
        el.classList.add('ghost');
      } else {
        // 矢印で狙う
        line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        line.setAttribute('class', 'aim-arrow');
        line.innerHTML = '<defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ffd35c"/></marker></defs><path class="shaft" marker-end="url(#ah)"/>';
        this.root.appendChild(line);
      }
    };
    const move = (x: number, y: number) => {
      if (ghost) {
        const w = 120;
        ghost.style.transform = `translate(${x - w / 2}px, ${y - w * 0.9}px) rotate(${(x - start!.x) * 0.03}deg)`;
        const armed = !!probe(x, y);
        ghost.classList.toggle('armed', armed && ok());
      }
      if (line) {
        const o = origin();
        const t = probe(x, y);
        const valid = !!t && this.targetsFor(d).some((v) => this.b.sameTarget(v, t));
        line.querySelector('.shaft')!.setAttribute('d', `M${o.x} ${o.y} Q${(o.x + x) / 2} ${Math.min(o.y, y) - 60} ${x} ${y}`);
        line.classList.toggle('on', valid);
        const nh = valid ? t : null;
        if ((nh && (!hover || !this.b.sameTarget(nh, hover))) || (!nh && hover)) {
          this.root.querySelectorAll('.tgt-hot').forEach((e) => e.classList.remove('tgt-hot'));
          if (nh) {
            this.elOf(nh)?.classList.add('tgt-hot');
            vibrate(5);
          }
          hover = nh;
        }
      }
    };
    const finish = (x: number, y: number, cancel: boolean) => {
      el.classList.remove('lifting');
      this.root.querySelectorAll('.tgt-hot').forEach((e) => e.classList.remove('tgt-hot'));
      line?.remove();
      line = null;
      const t = cancel ? null : probe(x, y);
      const g = ghost;
      ghost = null;
      if (t && ok() && this.trySubmit(d, needs() ? t : undefined)) {
        if (g) {
          void g.animate([{ opacity: 1 }, { opacity: 0, transform: `${g.style.transform} scale(1.3)` }], { duration: 250, fill: 'forwards' }).finished.then(() => g.remove());
        }
        audio.play('card');
        vibrate(16);
        return;
      }
      g?.remove();
      el.classList.remove('ghost');
      if (!ok() && !cancel) this.nope(el);
      this.selected = null;
      this.sync();
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !this.myTurn()) return;
      start = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!ghost && !line && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) begin();
      if (ghost || line) move(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (!start) return;
      const dragged = !!ghost || !!line;
      start = null;
      if (dragged) return finish(e.clientX, e.clientY, e.type === 'pointercancel');
      // タップ：選ぶ → もう一度で使う（対象がいるなら対象をタップ）
      if (e.type !== 'pointerup') return;
      const same = this.selected && this.selected.kind === d.kind && (d.kind === 'card' ? (this.selected as { index: number }).index === d.index : (this.selected as { uid: number }).uid === d.uid);
      if (same && isCard && !needs()) {
        if (ok() && this.trySubmit(d)) {
          audio.play('card');
          return;
        }
        this.nope(el);
        return;
      }
      if (!ok()) {
        this.nope(el);
        return;
      }
      this.selected = same ? null : d;
      audio.play('hover', { volume: 0.5 });
      this.sync();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private nope(el: HTMLElement) {
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
    audio.play('click', { volume: 0.4, rate: 0.6 });
    vibrate(30);
  }

  private showDeck() {
    const me = this.b.sides[this.me];
    const m = new Map<string, number>();
    for (const c of me.deck) m.set(c, (m.get(c) ?? 0) + 1);
    const list = [...m].sort((a, b) => CARDS[a[0]].cost - CARDS[b[0]].cost);
    void this.ui.dialog({
      title: `山札（残り${me.deck.length}枚）`,
      icon: 'card-random',
      body: `<div class="shop-row wrap">${list.map(([c, n]) => `<div class="shop-item" style="cursor:default">${battleCardHtml(c, { small: true })}<small>×${n}</small></div>`).join('')}</div>`,
      buttons: [{ label: '閉じる', value: 0, kind: 'primary' }],
      className: 'discard',
    });
  }

  // ---------- 演出（BattleView） ----------
  private float(t: Target, text: string, cls: string) {
    const el = this.elOf(t);
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.ui.float(r.left + r.width / 2, r.top + r.height / 2, text, cls);
  }
  private sfx(name: Sfx, opts?: { volume?: number; rate?: number }) {
    audio.play(name, opts);
  }

  async turnStart(side: 0 | 1) {
    this.sync();
    const mine = side === this.me;
    const el = this.root.querySelector('.b-turn')!;
    el.classList.remove('flash');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('flash');
    if (mine) {
      this.sfx('select');
      vibrate(10);
    }
    await sleep(mine ? 350 : 250);
  }

  async draw(side: 0 | 1, cards: string[], burned: string[]) {
    if (side === this.me) {
      this.dealing += cards.length;
      if (cards.length) this.sfx('card', { volume: 0.6 });
      if (burned.length) this.ui.float(innerWidth / 2, innerHeight - 160, `手札がいっぱいで「${CARDS[burned[0]].name}」を失った`, 'loss small');
      this.sync();
      await sleep(180);
    } else this.sync();
  }

  async play(side: 0 | 1, card: string) {
    const c = CARDS[card];
    if (side !== this.me) {
      // 相手が出したカードを大きく見せる
      const el = document.createElement('div');
      el.className = 'b-reveal';
      el.innerHTML = battleCardHtml(card);
      this.root.appendChild(el);
      this.sfx(c.type === 'spell' ? (`spell${Math.floor(Math.random() * 5)}` as Sfx) : 'card');
      await sleep(900);
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    } else if (c.type === 'spell') this.sfx(`spell${Math.floor(Math.random() * 5)}` as Sfx);
    this.sync();
  }

  async summon(_u: Unit) {
    this.sync();
    this.sfx('build', { volume: 0.5 });
    await sleep(220);
  }

  async attack(u: Unit, target: Target) {
    const a = this.unitEls.get(u.uid);
    const t = this.elOf(target);
    if (!a || !t) return;
    const ra = a.getBoundingClientRect();
    const rt = t.getBoundingClientRect();
    const dx = rt.left + rt.width / 2 - (ra.left + ra.width / 2);
    const dy = rt.top + rt.height / 2 - (ra.top + ra.height / 2);
    a.classList.add('attacking');
    this.sfx(u.kw.includes('ranged') ? 'slide' : 'thud');
    if (u.kw.includes('ranged')) {
      // 矢が飛ぶ
      const ar = document.createElement('div');
      ar.className = 'b-arrow';
      ar.innerHTML = icon('arrow-flights');
      this.root.appendChild(ar);
      await ar.animate([{ transform: `translate(${ra.left + ra.width / 2}px, ${ra.top + ra.height / 2}px) rotate(${Math.atan2(dy, dx)}rad)` }, { transform: `translate(${rt.left + rt.width / 2}px, ${rt.top + rt.height / 2}px) rotate(${Math.atan2(dy, dx)}rad)` }], { duration: 260, easing: 'ease-in' }).finished;
      ar.remove();
    } else {
      await a.animate([{ transform: 'none' }, { transform: `translate(${dx * 0.8}px, ${dy * 0.8}px) scale(1.1)`, offset: 0.55 }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.5,0,.5,1)' }).finished;
    }
    a.classList.remove('attacking');
  }

  async damage(target: Target, n: number, blocked: boolean) {
    const el = this.elOf(target);
    if (blocked) {
      this.float(target, '盾！', 'block');
      this.sfx('spell1', { volume: 0.5 });
    } else {
      this.float(target, `-${n}`, target.kind === 'face' ? 'loss big' : 'loss');
      this.sfx(target.kind === 'face' ? 'trap' : 'thud', { volume: 0.6 });
      if (target.kind === 'face' && target.side === this.me) vibrate(25);
    }
    if (el) {
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }
    this.sync();
    await sleep(160);
  }

  async heal(side: 0 | 1, n: number) {
    if (n > 0) this.float({ kind: 'face', side }, `+${n}`, 'gain');
    this.sfx('bonus', { volume: 0.5 });
    this.sync();
    await sleep(200);
  }

  async buff(u: Unit) {
    const el = this.unitEls.get(u.uid);
    el?.classList.remove('buffed');
    void el?.offsetWidth;
    el?.classList.add('buffed');
    this.sfx('spell2', { volume: 0.5 });
    this.sync();
    await sleep(160);
  }

  async death(u: Unit) {
    const el = this.unitEls.get(u.uid);
    this.unitEls.delete(u.uid);
    if (!el) return;
    this.sfx('slide', { volume: 0.5, rate: 0.7 });
    await el.animate([{ opacity: 1, transform: 'none', filter: 'none' }, { opacity: 0, transform: 'scale(.6) rotate(8deg)', filter: 'grayscale(1) brightness(2)' }], { duration: 320, easing: 'ease-in' }).finished;
    el.remove();
  }

  async fatigue(side: 0 | 1, n: number) {
    this.ui.float(innerWidth / 2, side === this.me ? innerHeight - 200 : 160, `山札が尽きた！ ${n}ダメージ`, 'loss small');
    await sleep(300);
  }

  async end(winner: 0 | 1) {
    this.sync();
    const won = winner === this.me;
    this.sfx(won ? 'win' : 'trap');
    if (won) vibrate(40);
    await this.ui.banner(won ? '勝利！' : '敗北…', won ? `${esc(this.info[this.foe].name)} を打ち破った` : `${esc(this.info[winner].name)} に敗れた`, won ? 'k-win' : 'k-event-bad', 1500);
  }
}

/** 色とアイコン：領主か魔物か */
export function sideInfo(name: string, hero: HeroId | null, color: string | null, role: string, monsterIcon: string): BattleSideInfo {
  return { name, hero, color: color ?? PLAYER_COLORS[0], icon: hero ? HEROES[hero].icon : monsterIcon, role };
}
