// 画面上の UI 部品。3D の上に HTML を重ねる。
import { CARDS, GROUPS, HEROES, LEVEL_NAMES, PLAYER_COLORS, RARITY_NAME, TILES } from '../data/defs.ts';
import { audio } from '../audio.ts';
import type { Game } from '../game/engine.ts';
import type { CardId, Player } from '../game/types.ts';
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

export function cardHtml(id: CardId, opts: { usable?: boolean; small?: boolean; idx?: number } = {}) {
  const c = CARDS[id];
  return `<div class="card rarity-${c.rarity}${opts.usable === false ? ' unusable' : ''}${opts.small ? ' small' : ''}" data-card="${id}" ${opts.idx !== undefined ? `data-idx="${opts.idx}"` : ''}>
    <div class="card-rarity">${RARITY_NAME[c.rarity]}</div>
    <div class="card-art">${icon(c.icon)}</div>
    <div class="card-name">${c.name}</div>
    <div class="card-desc">${c.desc}</div>
  </div>`;
}

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
      <div class="pill round${g.isFinal() ? ' final' : ''}">${icon('sands-of-time')}<span>ラウンド <b>${Math.min(s.round, s.cfg.rounds)}</b> / ${s.cfg.rounds}</span>${g.isFinal() ? '<em>最終局面</em>' : ''}</div>
      <button type="button" class="pill jackpot" data-tile="${jackpotTile}" title="黄金の泉に止まると全額もらえる">${icon('fountain')}<span>黄金の泉 <b class="num">${s.jackpot.toLocaleString()}</b>G</span></button>
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
        const monos = g.monopolies(p.id);
        const status = [
          p.jail > 0 ? `<span class="st jail" title="地下牢">${icon('prisoner')}</span>` : '',
          p.goldRain > 0 ? `<span class="st rain" title="黄金の雨">${icon('gold-bar')}</span>` : '',
          monos.length ? `<span class="st mono" title="領地制覇">${monos.map((m) => `<i style="background:${GROUPS[m].color}"></i>`).join('')}</span>` : '',
        ].join('');
        return `<div class="pcard${p.id === activeId ? ' active' : ''}${p.bankrupt ? ' out' : ''}${p.id === humanId ? ' me' : ''}" style="--pc:${PLAYER_COLORS[p.id]}" data-pid="${p.id}">
          <div class="pc-rank r${r}">${p.bankrupt ? '×' : r + 1}</div>
          <div class="pc-avatar">${icon(h.icon)}</div>
          <div class="pc-main">
            <div class="pc-name">${esc(p.name)}<small>${h.title}</small></div>
            <div class="pc-cash"><b class="num" data-cash="${p.id}">${(this.shownCash.get(p.id) ?? p.cash).toLocaleString()}</b>G</div>
            <div class="pc-sub">資産 ${g.assets(p).toLocaleString()}G ・ ${icon('card-random')}${p.hand.length}${status}</div>
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
        start: `通るたびに給料 ${g.stage.salary}G。ぴったり止まると +100G。自分の土地を1つ建てられる。`,
        shrine: 'カードを1枚引く。',
        event: '運命の巻物。何が起きるかはお楽しみ（下位ほど良いことが起きやすい）。',
        tax: '所持金の10%を払う。お金は黄金の泉に貯まる。',
        dungeon: '捕まると、50G払うかゾロ目を出すまで出られない。',
        jackpot: `黄金の泉。貯まった ${g.s.jackpot}G を全部もらえる。`,
        portal: '好きなマスへワープできる（黄金の泉は不可）。',
        tavern: '50G か 150G を賭けてサイコロ勝負。4〜5で2倍、6で3倍。',
        cathedral: '祝福金とカード1枚がもらえる。',
      };
      return `<div class="ti-head">${icon(def.icon)}<b>${def.name}</b></div><p>${desc[def.kind]}</p>`;
    }
    const grp = GROUPS[def.group!];
    const owner = t.owner !== null ? g.s.players[t.owner] : null;
    const set = g.groupTiles(def.group!).map((k) => {
      const o = g.s.tiles[k].owner;
      return `<i style="background:${o === null ? 'transparent' : PLAYER_COLORS[o]}" title="${TILES[k].name}"></i>`;
    });
    return `<div class="ti-head" style="--group:${grp.color}">${icon(def.icon)}<b>${def.name}</b><span class="grp">${grp.name}</span></div>
      <div class="ti-row"><span>持ち主</span><b>${owner ? `<span style="color:${PLAYER_COLORS[owner.id]}">${esc(owner.name)}</span>` : 'なし（' + g.price(i) + 'G で買える）'}</b></div>
      ${owner ? `<div class="ti-row"><span>建物</span><b>${LEVEL_NAMES[t.level]}</b></div><div class="ti-row"><span>通行料</span><b>${g.toll(i).toLocaleString()}G</b></div>` : ''}
      <div class="ti-row"><span>同じ色</span><span class="ti-set">${set.join('')}</span></div>
      ${t.festival ? `<div class="ti-tag fest">${icon('party-popper')}収穫祭 あと${t.festival}R（2倍）</div>` : ''}
      ${t.dragon ? `<div class="ti-tag dragon">${icon('fire-breath')}竜がいる あと${t.dragon}R（通行料0）</div>` : ''}`;
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

  // ---------- 手番の操作 ----------
  /** 手札とサイコロボタンを出し、どちらかが押されるのを待つ */
  turnActions(g: Game, p: Player, canUseCards: boolean): Promise<{ type: 'roll' } | { type: 'card'; card: CardId }> {
    return new Promise((resolve) => {
      const hand = p.hand
        .map((c, i) => cardHtml(c, { usable: canUseCards && g.cardUsable(p, c), idx: i }))
        .join('');
      this.action.innerHTML = `<div class="hand">${hand || '<div class="hand-empty">手札なし ・ 祠や大聖堂でカードが手に入る</div>'}</div>
        <button type="button" class="roll-btn">${icon('rolling-dices')}<span>サイコロを振る</span></button>`;
      this.action.classList.add('show');
      const done = (v: { type: 'roll' } | { type: 'card'; card: CardId }) => {
        this.action.classList.remove('show');
        this.action.innerHTML = '';
        resolve(v);
      };
      $('.roll-btn', this.action).addEventListener('click', () => done({ type: 'roll' }));
      this.action.querySelectorAll<HTMLElement>('.hand .card').forEach((el) =>
        el.addEventListener('click', async () => {
          const id = el.dataset.card as CardId;
          const usable = !el.classList.contains('unusable');
          const c = CARDS[id];
          const v = await this.dialog<boolean>({
            title: c.name,
            body: `<div class="card-big">${cardHtml(id)}</div>${!c.active ? '<p class="note">このカードは通行料を払うときに使えます。</p>' : !usable ? '<p class="note">今は使える対象がありません。</p>' : '<p class="note">サイコロを振る前に1枚だけ使えます。</p>'}`,
            buttons: [
              { label: 'やめる', value: false },
              { label: '使う', value: true, kind: 'primary', disabled: !usable },
            ],
          });
          if (v) done({ type: 'card', card: id });
        }),
      );
    });
  }
  waitRollButton(label = 'サイコロを振る'): Promise<void> {
    return new Promise((resolve) => {
      this.action.innerHTML = `<button type="button" class="roll-btn">${icon('rolling-dices')}<span>${label}</span></button>`;
      this.action.classList.add('show');
      const b = $('.roll-btn', this.action);
      b.focus();
      b.addEventListener('click', () => {
        this.action.classList.remove('show');
        this.action.innerHTML = '';
        resolve();
      });
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
