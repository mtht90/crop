// 画面上の UI 部品。3D の上に HTML を重ねる。
import { CARD_KIND, GROUPS, HEROES, KIND_NAME, LEVEL_NAMES, PLAYER_COLORS, RARITY_NAME, TILES, baseId, card } from '../data/defs.ts';
import { audio } from '../audio.ts';
import type { Game } from '../game/engine.ts';
import type { CardRef, Player } from '../game/types.ts';
import { icon } from './icons.ts';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DialogButton<T> {
  label: string;
  value: T;
  kind?: 'primary' | 'secondary' | 'danger' | 'gold';
  disabled?: boolean;
  sub?: string;
}
export interface DialogSpec<T> {
  title: string;
  icon?: string;
  color?: string;
  body?: string;
  buttons: DialogButton<T>[];
  className?: string;
}

/** カード1枚の HTML（Wholetone のカード素材を重ねて組み立てる） */
export function cardHtml(ref: CardRef, opts: { usable?: boolean; small?: boolean; idx?: number } = {}) {
  const c = card(ref);
  const kind = CARD_KIND[baseId(ref)];
  const cls = ['card', `k-${kind}`, `r-${c.rarity}`, c.up ? 'up' : '', opts.usable === false ? 'unusable' : '', opts.small ? 'small' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" data-card="${ref}" title="${c.name}（${RARITY_NAME[c.rarity]}）" ${opts.idx !== undefined ? `data-idx="${opts.idx}"` : ''}>
    <div class="c-art">${icon(c.icon)}</div>
    <i class="c-win"></i>
    <div class="c-text${c.desc.length + (c.exhaust ? 4 : 0) > 30 ? ' long' : c.desc.length > 22 ? ' mid' : ''}">${c.exhaust ? '<span class="c-kw">消耗</span>' : ''}<span>${c.desc}</span></div>
    <div class="c-type">${KIND_NAME[kind]}</div>
    <i class="c-trim"></i>
    <div class="c-banner"><span>${c.name}</span></div>
    <div class="c-cost">${c.cost}</div>
    <i class="c-mark"></i>
    ${c.up ? '<span class="c-plus">強化</span>' : ''}
  </div>`;
}

/** 手札の操作で盤面に触るための窓口（ドラッグでマスを選ぶ） */
export interface BoardHooks {
  pick(x: number, y: number): number | null;
  highlight(tiles: number[] | null): void;
  hover(tile: number | null): void;
}
export type HandResult = { index: number; target?: number } | 'end';
const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 振動できない端末 */
  }
};

export function heroBadge(p: Player) {
  return `<span class="hero-badge" style="--pc:${PLAYER_COLORS[p.id]}">${icon(HEROES[p.hero].icon)}</span>`;
}

export class UI {
  root: HTMLElement;
  hud: HTMLElement;
  players: HTMLElement;
  top: HTMLElement;
  action: HTMLElement;
  dialogs: HTMLElement;
  banners: HTMLElement;
  floats: HTMLElement;
  tooltip: HTMLElement;
  logEl: HTMLElement;
  screen: HTMLElement;
  speed = 1;
  private shownCash = new Map<number, number>();

  constructor(root: HTMLElement) {
    this.root = root;
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="hud" hidden>
        <div class="topbar"></div>
        <div class="players"></div>
        <div class="log"></div>
        <div class="action"></div>
      </div>
      <div class="floats"></div>
      <div class="tooltip" hidden></div>
      <div class="banners"></div>
      <div class="dialogs"></div>
      <div class="screen" hidden></div>`,
    );
    this.hud = $('.hud', root);
    this.top = $('.topbar', root);
    this.players = $('.players', root);
    this.logEl = $('.log', root);
    this.action = $('.action', root);
    this.dialogs = $('.dialogs', root);
    this.banners = $('.banners', root);
    this.floats = $('.floats', root);
    this.tooltip = $('.tooltip', root);
    this.screen = $('.screen', root);
    // クリック音
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && !b.disabled) audio.play('click', { volume: 0.6 });
    });
  }

  // ---------- 画面 ----------
  showScreen(html: string, cls = '') {
    this.screen.className = `screen ${cls}`;
    this.screen.innerHTML = html;
    this.screen.hidden = false;
    this.screen.scrollTop = 0;
    return this.screen;
  }
  hideScreen() {
    this.screen.hidden = true;
    this.screen.innerHTML = '';
  }

  // ---------- ダイアログ ----------
  dialog<T>(spec: DialogSpec<T>): Promise<T> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = `dialog-wrap ${spec.className ?? ''}`;
      el.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" style="${spec.color ? `--accent:${spec.color}` : ''}">
        ${spec.icon ? `<div class="dialog-icon">${icon(spec.icon)}</div>` : ''}
        <h2>${spec.title}</h2>
        ${spec.body ? `<div class="dialog-body">${spec.body}</div>` : ''}
        <div class="dialog-buttons">${spec.buttons
          .map((b, i) => `<button type="button" class="btn ${b.kind ?? 'secondary'}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}${b.sub ? `<small>${b.sub}</small>` : ''}</button>`)
          .join('')}</div>
      </div>`;
      this.dialogs.appendChild(el);
      requestAnimationFrame(() => el.classList.add('in'));
      el.querySelectorAll<HTMLButtonElement>('.dialog-buttons button').forEach((btn) =>
        btn.addEventListener('click', () => {
          el.classList.remove('in');
          setTimeout(() => el.remove(), 180);
          resolve(spec.buttons[Number(btn.dataset.i)].value);
        }),
      );
      (el.querySelector('.btn.primary, .btn.gold') as HTMLButtonElement | null)?.focus();
    });
  }

  // ---------- バナー ----------
  async banner(text: string, sub = '', cls = '', ms = 1500) {
    const el = document.createElement('div');
    el.className = `banner ${cls}`;
    el.innerHTML = `<div class="banner-text">${text}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
    this.banners.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    await sleep(ms / this.speed);
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
    await sleep(200 / this.speed);
  }

  float(x: number, y: number, text: string, cls = '') {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.floats.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  log(msg: string) {
    const el = document.createElement('div');
    el.className = 'log-line';
    el.innerHTML = msg;
    this.logEl.prepend(el);
    while (this.logEl.children.length > 30) this.logEl.lastChild?.remove();
  }

  // ---------- HUD ----------
  renderHud(g: Game, humanId: number, activeId: number) {
    const s = g.s;
    const jackpotTile = TILES.findIndex((t) => t.kind === 'jackpot');
    this.top.innerHTML = `
      <div class="pill round${g.isFinal() ? ' final' : ''}">${icon('sands-of-time')}<span><i class="lbl">ラウンド </i><b>${Math.min(s.round, s.cfg.rounds)}</b> / ${s.cfg.rounds}</span>${g.isFinal() ? '<em>最終決戦</em>' : ''}</div>
      <button type="button" class="pill jackpot" data-tile="${jackpotTile}" title="黄金の泉に止まると全額もらえる">${icon('fountain')}<span><i class="lbl">黄金の泉 </i><b class="num">${s.jackpot.toLocaleString()}</b>G</span></button>
      <div class="top-buttons">
        <button type="button" class="icon-btn speed" title="CPUの速さ">${icon('fast-forward-button')}<span>×${this.speed}</span></button>
        <button type="button" class="icon-btn sound" title="音">${icon(audio.muted ? 'speaker-off' : 'speaker')}</button>
        <button type="button" class="icon-btn menu" title="メニュー">${icon('cog')}</button>
      </div>`;
    const rank = g.ranking();
    this.players.innerHTML = s.players
      .map((p) => {
        const h = HEROES[p.hero];
        const r = rank.indexOf(p);
        const sets = g.sets(p.id);
        const status = [
          p.jail > 0 ? `<span class="st jail" title="地下牢">${icon('prisoner')}</span>` : '',
          sets.length ? `<span class="st mono" title="統一した色">${sets.map((m) => `<i style="background:${GROUPS[m].color}"></i>`).join('')}</span>` : '',
        ].join('');
        return `<div class="pcard${p.id === activeId ? ' active' : ''}${p.bankrupt ? ' out' : ''}${p.id === humanId ? ' me' : ''}" style="--pc:${PLAYER_COLORS[p.id]}" data-pid="${p.id}">
          <div class="pc-rank r${r}">${p.bankrupt ? '×' : r + 1}</div>
          <div class="pc-avatar">${icon(h.icon)}</div>
          <div class="pc-main">
            <div class="pc-name">${esc(p.name)}<small>${h.title}</small></div>
            <div class="pc-cash"><b class="num" data-cash="${p.id}">${(this.shownCash.get(p.id) ?? p.cash).toLocaleString()}</b>G</div>
            <div class="pc-sub"><span class="pc-terr">${icon('tower-flag')}<b>${g.territories(p).length}</b>陣</span> ${icon('card-random')}${p.hand.length}${status}</div>
          </div>
        </div>`;
      })
      .join('');
    for (const p of s.players) this.tweenCash(p.id, p.cash);
  }
  private tweenCash(id: number, to: number) {
    const from = this.shownCash.get(id) ?? to;
    this.shownCash.set(id, to);
    if (from === to) return;
    const el = this.players.querySelector<HTMLElement>(`[data-cash="${id}"]`);
    if (!el) return;
    const card = el.closest('.pcard');
    card?.classList.remove('gain', 'loss');
    void (card as HTMLElement | null)?.offsetWidth;
    card?.classList.add(to > from ? 'gain' : 'loss');
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 700);
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      const cur = this.players.querySelector<HTMLElement>(`[data-cash="${id}"]`);
      if (cur) cur.textContent = v.toLocaleString();
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }

  /** マスの説明（ツールチップ／タップ時） */
  tileInfo(g: Game, i: number) {
    const def = TILES[i];
    const t = g.s.tiles[i];
    if (def.kind !== 'prop') {
      const desc: Record<string, string> = {
        start: `通るたびに給料 ${g.stage.salary}G と、カードを3枚から1枚もらえる（王の贈り物）。`,
        shrine: 'カード屋。3枚の中から買える。',
        event: '運命の巻物。何が起きるかはお楽しみ（下位ほど良いことが起きやすい）。',
        tax: '所持金の10%を払う。お金は黄金の泉に貯まる。',
        dungeon: '止まると捕まり、次のターンは移動できない。',
        jackpot: `黄金の泉。貯まった ${g.s.jackpot}G を全部もらえる。`,
        portal: '好きなマスへワープできる（黄金の泉は不可）。',
        tavern: '50G か 150G を賭けてサイコロ勝負。4〜5で2倍、6で3倍。',
        cathedral: '祝福金とカード1枚がもらえる。',
      };
      return `<div class="ti-head">${icon(def.icon)}<b>${def.name}</b></div><p>${desc[def.kind]}</p>`;
    }
    const grp = GROUPS[def.group!];
    const owner = t.owner !== null ? g.s.players[t.owner] : null;
    const me = g.s.players.find((x) => x.human) ?? g.s.players[0];
    const set = g.groupTiles(def.group!).map((k) => {
      const o = g.s.tiles[k].owner;
      return `<i style="background:${o === null ? 'transparent' : PLAYER_COLORS[o]}" title="${TILES[k].name}"></i>`;
    });
    return `<div class="ti-head" style="--group:${grp.color}">${icon(def.icon)}<b>${def.name}</b><span class="grp">${grp.name}</span></div>
      <div class="ti-row"><span>持ち主</span><b>${owner ? `<span style="color:${PLAYER_COLORS[owner.id]}">${esc(owner.name)}</span>` : `なし（${g.price(i)}G で旗を立てられる）`}</b></div>
      ${owner ? `<div class="ti-row"><span>砦</span><b>${LEVEL_NAMES[t.level]}</b></div><div class="ti-row"><span>通行税</span><b>${g.toll(i).toLocaleString()}G</b></div><div class="ti-row"><span>奪う値段</span><b>${g.stealCost(i, me).toLocaleString()}G</b></div>` : ''}
      <div class="ti-row"><span>同じ色</span><span class="ti-set">${set.join('')}</span></div>
      ${t.guard ? `<div class="ti-tag fest">${icon('magic-shield')}守りの結界 あと${t.guard}R（奪えない）</div>` : ''}`;
  }
  showTooltip(html: string, x: number, y: number) {
    this.tooltip.innerHTML = html;
    this.tooltip.hidden = false;
    const r = this.tooltip.getBoundingClientRect();
    const px = Math.min(innerWidth - r.width - 12, Math.max(12, x + 16));
    const py = Math.min(innerHeight - r.height - 12, Math.max(12, y + 16));
    this.tooltip.style.left = `${px}px`;
    this.tooltip.style.top = `${py}px`;
  }
  hideTooltip() {
    this.tooltip.hidden = true;
  }

  // ---------- 手札（カードゲーム風） ----------
  /** 次に手札を出すとき、末尾から何枚を「配られる」演出にするか */
  private dealing = 0;
  private lastEnergy: number | null = null;
  /** 引いたカード。次の手札表示で山札から配られてくる */
  dealCards(cards: CardRef[]) {
    this.dealing += cards.length;
    this.bumpPile('deck');
  }
  private bumpPile(which: 'deck' | 'discard') {
    const el = this.action.querySelector(`.pile.${which}`);
    el?.classList.remove('bump');
    void (el as HTMLElement | null)?.offsetWidth;
    el?.classList.add('bump');
  }

  /** ターン終了：残った手札が捨て札へ飛んでいく */
  async tossHand(n: number) {
    const W = innerWidth;
    const H = innerHeight;
    const els: HTMLElement[] = [];
    for (let k = 0; k < n; k++) {
      const el = document.createElement('div');
      el.className = 'toss';
      el.innerHTML = '<div class="card-back" style="--cw:90px"></div>';
      this.root.appendChild(el);
      const x0 = W / 2 + (k - (n - 1) / 2) * 50 - 45;
      el.animate(
        [
          { transform: `translate(${x0}px, ${H - 150}px) rotate(${(k - n / 2) * 6}deg)`, opacity: 1 },
          { transform: `translate(${W - 110}px, ${H - 120}px) rotate(40deg) scale(.4)`, opacity: 0 },
        ],
        { duration: 420, delay: k * 50, easing: 'cubic-bezier(.5,0,.7,1)', fill: 'forwards' },
      );
      els.push(el);
    }
    if (n) audio.play('slide', { volume: 0.5 });
    await sleep(420 + n * 50);
    els.forEach((e) => e.remove());
  }

  /** 使うカードが中央へ飛んで光る */
  private async castFx(ref: CardRef, from: DOMRect) {
    const el = document.createElement('div');
    el.className = 'cast';
    el.innerHTML = cardHtml(ref);
    this.root.appendChild(el);
    const w = 150;
    const h = (w * 336) / 240;
    const cx = innerWidth / 2 - w / 2;
    const cy = innerHeight * 0.42 - h / 2;
    const sx = from.left + from.width / 2 - w / 2;
    const sy = from.top + from.height / 2 - h / 2;
    const k = from.width / w;
    audio.play('card');
    vibrate(18);
    await el.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) scale(${k})` },
        { transform: `translate(${cx}px, ${cy}px) scale(1.12)`, offset: 0.6 },
        { transform: `translate(${cx}px, ${cy}px) scale(1)` },
      ],
      { duration: 320, easing: 'cubic-bezier(.2,1,.3,1)', fill: 'forwards' },
    ).finished;
    const b = document.createElement('div');
    b.className = 'cast-burst';
    b.style.left = `${innerWidth / 2}px`;
    b.style.top = `${innerHeight * 0.42}px`;
    this.root.appendChild(b);
    await el.animate([{ opacity: 1, filter: 'brightness(1)' }, { opacity: 0, filter: 'brightness(2.2)', transform: `translate(${cx}px, ${cy - 30}px) scale(1.25)` }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished;
    el.remove();
    setTimeout(() => b.remove(), 400);
  }

  /** 手札を扇形に出す。カードは上へスワイプ（ドラッグ）するか、2回タップで使う */
  handPhase(g: Game, p: Player, board: BoardHooks): Promise<HandResult> {
    return new Promise((resolve) => {
      let sel = -1;
      let busy = false;
      const needsTarget = (ref: CardRef) => {
        const t = card(ref).target;
        return t === 'ownTile' || t === 'enemyTile' || t === 'emptyTile' || t === 'anyTile';
      };
      const usable = (ref: CardRef) => g.canPlay(p, ref) && (!needsTarget(ref) || g.cardTargets(p, ref).length > 0);
      const render = () => {
        const n = p.hand.length;
        const anyPlayable = p.hand.some(usable);
        const noMove = !p.moved && !p.hand.some((c) => card(c).move && g.canPlay(p, c));
        const hint = !p.hand.length
          ? '<div class="hand-hint">手札を使い切った</div>'
          : noMove && !p.moved
            ? '<div class="hand-hint warn">移動カードがない…このターンは動けない</div>'
            : '<div class="hand-hint">カードを上へスワイプして使う（2回タップでもOK）</div>';
        const fresh = this.dealing;
        if (fresh) this.lastEnergy = null;
        this.dealing = 0;
        const total = this.allCount(p);
        this.action.innerHTML = `
          <div class="hand-zone">
            <div class="hand fan${fresh ? ' enter' : ''}" style="--n:${n}">${p.hand
              .map((c, i) => {
                const ok = usable(c);
                const mid = (n - 1) / 2;
                const isNew = i >= n - fresh;
                return `<div class="slot${i === sel ? ' sel' : ''}${ok ? ' playable' : ''}" style="--i:${i - mid};--d:${isNew ? (i - (n - fresh)) * 90 : 0}ms${isNew ? '' : ';animation:none'}" data-i="${i}">${cardHtml(c, { usable: ok, idx: i })}${i === sel ? `<button type="button" class="btn primary use" ${ok ? '' : 'disabled'}>${ok ? (needsTarget(c) ? 'マスを選ぶ' : '使う') : '使えない'}</button>` : ''}</div>`;
              })
              .join('')}</div>
            <div class="hand-bar">
              <div class="orb${p.energy ? '' : ' empty'}${this.lastEnergy !== null && p.energy !== this.lastEnergy ? ' pulse' : ''}" title="行動力（毎ターン回復）">${p.energy}<small>行動力</small></div>
              <div class="piles">
                <button type="button" class="pile deck" title="山札（タップでデッキを見る）"><b>${p.deck.length}</b></button>
                <button type="button" class="pile discard" title="捨て札"><b>${p.discard.length}</b></button>
              </div>
              <button type="button" class="end-turn${anyPlayable ? '' : ' ready'}">ターン終了</button>
            </div>
            ${hint}
          </div>`;
        void total;
        this.lastEnergy = p.energy;
        this.action.classList.add('show');
        this.action.querySelector('.end-turn')!.addEventListener('click', () => !busy && finish('end'));
        this.action.querySelectorAll<HTMLElement>('.pile').forEach((b) => b.addEventListener('click', () => this.showDeck(p)));
        this.action.querySelectorAll<HTMLElement>('.slot').forEach((el) => this.bindSlot(el, p, usable, needsTarget, g, board, {
          tap: (i, useBtn) => {
            if (busy) return;
            const ref = p.hand[i];
            if (useBtn || sel === i) {
              if (!usable(ref)) return this.nope(el);
              return play(i, el.getBoundingClientRect());
            }
            sel = i;
            audio.play('hover', { volume: 0.5 });
            vibrate(6);
            render();
          },
          drop: (i, target, rect) => {
            if (busy) return;
            return play(i, rect, target);
          },
          setBusy: (v) => (busy = v),
        }));
      };
      const play = async (i: number, rect: DOMRect, target?: number) => {
        busy = true;
        const ref = p.hand[i];
        const slot = this.action.querySelector<HTMLElement>(`.slot[data-i="${i}"]`);
        slot?.classList.add('ghost');
        await this.castFx(ref, rect);
        finish({ index: i, target });
      };
      const finish = (v: HandResult) => {
        this.action.classList.remove('show');
        this.action.innerHTML = '';
        resolve(v);
      };
      render();
    });
  }

  private allCount(p: Player) {
    return p.deck.length + p.hand.length + p.discard.length;
  }

  private nope(el: HTMLElement) {
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
    audio.play('click', { volume: 0.4, rate: 0.6 });
    vibrate(30);
  }

  /** 1枚のカードに、タップとドラッグ（スワイプ）の操作をつける */
  private bindSlot(
    el: HTMLElement,
    p: Player,
    usable: (r: CardRef) => boolean,
    needsTarget: (r: CardRef) => boolean,
    g: Game,
    board: BoardHooks,
    cb: { tap: (i: number, useBtn: boolean) => void; drop: (i: number, target: number | undefined, rect: DOMRect) => void; setBusy: (v: boolean) => void },
  ) {
    const i = Number(el.dataset.i);
    const ref = p.hand[i];
    let start: { x: number; y: number } | null = null;
    let drag: HTMLElement | null = null;
    let line: HTMLElement | null = null;
    let pos = { x: 0, y: 0 };
    let vx = 0;
    let lastX = 0;
    let tile: number | null = null;
    let raf = 0;
    let ring: HTMLElement | null = null;
    let aim = false;
    const targets = needsTarget(ref) ? g.cardTargets(p, ref) : [];
    const lineY = () => {
      const hand = this.action.querySelector('.hand')!.getBoundingClientRect();
      return hand.top - 10;
    };
    const cardW = () => (innerWidth < 760 ? 120 : 132);
    const place = () => {
      if (!drag) return;
      const w = cardW();
      const h = (w * 336) / 240;
      const rot = Math.max(-18, Math.min(18, vx * 0.6));
      // マスを狙うときはカードを小さくして指の左上へ。指先のマスが見えるようにする
      if (aim) drag.style.transform = `translate(${pos.x - w * 0.62}px, ${pos.y - h * 0.62 - 34}px) scale(.55) rotate(${rot * 0.5}deg)`;
      else drag.style.transform = `translate(${pos.x - w / 2}px, ${pos.y - h * 0.62}px) rotate(${rot}deg)`;
      if (ring) ring.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      vx *= 0.82;
      raf = requestAnimationFrame(place);
    };
    const begin = (e: PointerEvent) => {
      drag = document.createElement('div');
      drag.className = 'drag-card';
      drag.innerHTML = cardHtml(ref, { usable: usable(ref) });
      this.root.appendChild(drag);
      el.classList.add('ghost');
      line = document.createElement('div');
      const aiming = targets.length > 0 && usable(ref);
      line.className = `play-line show${aiming ? ' aim' : ''}`;
      line.style.top = `${lineY()}px`;
      line.innerHTML = `<span>${!usable(ref) ? 'このカードは今は使えない' : aiming ? '光ったマスの上で離す' : 'ここより上で離すと使う'}</span>`;
      this.root.appendChild(line);
      if (aiming) {
        // マスを狙うときは手札を下へ引っ込めて、盤面を広く見せる
        board.highlight(targets);
        this.action.classList.add('aiming');
        aim = true;
        ring = document.createElement('div');
        ring.className = 'aim-ring';
        this.root.appendChild(ring);
      }
      audio.play('hover', { volume: 0.6 });
      vibrate(8);
      pos = { x: e.clientX, y: e.clientY };
      lastX = e.clientX;
      place();
    };
    const update = (e: PointerEvent) => {
      vx += (e.clientX - lastX) * 0.5;
      lastX = e.clientX;
      pos = { x: e.clientX, y: e.clientY };
      const above = e.clientY < lineY();
      let ok = false;
      if (usable(ref) && (above || targets.length)) {
        if (targets.length) {
          const t = board.pick(e.clientX, e.clientY);
          const nt = t !== null && targets.includes(t) ? t : null;
          if (nt !== tile) {
            tile = nt;
            board.hover(tile);
            if (tile !== null) {
              audio.play('hover', { volume: 0.4, rate: 1.3 });
              vibrate(5);
            }
          }
          ok = tile !== null;
        } else ok = true;
      } else if (tile !== null) {
        tile = null;
        board.hover(null);
      }
      const wasArmed = drag!.classList.contains('armed') || drag!.classList.contains('target');
      drag!.classList.toggle('armed', ok && !targets.length);
      drag!.classList.toggle('target', ok && !!targets.length);
      ring?.classList.toggle('on', ok);
      line!.classList.toggle('armed', ok);
      if (ok && !wasArmed) vibrate(10);
    };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      line?.remove();
      line = null;
      board.hover(null);
      if (targets.length) board.highlight(null);
      this.action.classList.remove('aiming');
      ring?.remove();
      ring = null;
      aim = false;
    };
    const snapBack = async () => {
      const d = drag!;
      drag = null;
      cleanup();
      const r = el.getBoundingClientRect();
      const w = cardW();
      await d.animate([{ transform: d.style.transform }, { transform: `translate(${r.left}px, ${r.top}px) scale(${r.width / w})` }], { duration: 220, easing: 'cubic-bezier(.3,1.4,.5,1)' }).finished;
      d.remove();
      el.classList.remove('ghost');
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      start = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!drag && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) begin(e);
      if (drag) update(e);
    });
    const end = async (e: PointerEvent) => {
      if (!start) return;
      start = null;
      if (!drag) {
        if (e.type === 'pointerup') cb.tap(i, !!(e.target as HTMLElement).closest('.use'));
        return;
      }
      const armed = drag.classList.contains('armed') || drag.classList.contains('target');
      if (e.type === 'pointerup' && armed) {
        const d = drag;
        drag = null;
        const t = tile ?? undefined;
        cleanup();
        const rect = d.firstElementChild!.getBoundingClientRect();
        d.remove();
        cb.drop(i, t, rect);
        return;
      }
      // マスの上で離さなかった → 手札に戻す（2回タップならマスを選ぶ画面になる）
      await snapBack();
      if (!usable(ref)) this.nope(el);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    void cb.setBusy;
  }

  /** デッキの中身を見る */
  showDeck(p: Player) {
    const count = (list: CardRef[]) => {
      const m = new Map<CardRef, number>();
      for (const c of list) m.set(c, (m.get(c) ?? 0) + 1);
      return [...m].sort((a, b) => card(a[0]).cost - card(b[0]).cost);
    };
    const row = (title: string, list: CardRef[]) =>
      list.length
        ? `<div class="shop-sec"><h3>${title}（${list.length}枚）</h3><div class="shop-row">${count(list)
            .map(([c, n]) => `<div class="shop-item" style="cursor:default">${cardHtml(c, { small: true })}<small>×${n}</small></div>`)
            .join('')}</div></div>`
        : '';
    void this.dialog({
      title: 'あなたのデッキ',
      icon: 'card-random',
      body: `<div class="shop-cols">${row('山札', p.deck)}${row('手札', p.hand)}${row('捨て札', p.discard)}${row('消耗して消えた', p.exhausted)}</div>`,
      buttons: [{ label: '閉じる', value: 0, kind: 'primary' }],
      className: 'discard',
    });
  }

  /** マスを選ぶ。cancel を許すと null が返ることがある */
  selectBar(text: string, allowCancel: boolean, onCancel: () => void) {
    this.action.innerHTML = `<div class="select-bar"><span>${icon('flag-objective')}${text}</span>${allowCancel ? '<button type="button" class="btn secondary">やめる</button>' : ''}</div>`;
    this.action.classList.add('show');
    this.action.querySelector('button')?.addEventListener('click', onCancel);
  }
  clearAction() {
    this.action.classList.remove('show');
    this.action.innerHTML = '';
  }
}
