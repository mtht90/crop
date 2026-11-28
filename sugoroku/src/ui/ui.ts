// 画面上の UI 部品。3D の上に HTML を重ねる。
import { CARDS, HEROES, PLAYER_COLORS, REGIONS } from '../data/defs.ts';
import { audio } from '../audio.ts';
import type { Campaign } from '../game/campaign.ts';
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
  renderHud(c: Campaign, humanId: number, activeId: number) {
    const last = c.round >= c.cfg.rounds;
    this.top.innerHTML = `
      <div class="pill round${last ? ' final' : ''}">${icon('sands-of-time')}<span><i class="lbl">ラウンド </i><b>${Math.min(c.round, c.cfg.rounds)}</b> / ${c.cfg.rounds}</span>${last ? '<em>最終ラウンド</em>' : ''}</div>
      <div class="top-buttons">
        <button type="button" class="icon-btn speed" title="CPUの速さ">${icon('fast-forward-button')}<span>×${this.speed}</span></button>
        <button type="button" class="icon-btn sound" title="音">${icon(audio.muted ? 'speaker-off' : 'speaker')}</button>
        <button type="button" class="icon-btn menu" title="メニュー">${icon('cog')}</button>
      </div>`;
    const rank = c.ranking();
    this.players.innerHTML = c.lords
      .map((l) => {
        const h = HEROES[l.hero];
        const r = rank.indexOf(l);
        return `<div class="pcard${l.id === activeId ? ' active' : ''}${l.alive ? '' : ' out'}${l.id === humanId ? ' me' : ''}" style="--pc:${PLAYER_COLORS[l.id]}" data-pid="${l.id}">
          <div class="pc-rank r${r}">${l.alive ? r + 1 : '×'}</div>
          <div class="pc-avatar">${icon(h.icon)}</div>
          <div class="pc-main">
            <div class="pc-name">${esc(l.name)}<small>${h.title}</small></div>
            <div class="pc-cash"><b class="num">${c.regionsOf(l.id).length}</b><small>領地</small></div>
            <div class="pc-sub"><span>${icon('card-random')}${l.deck.length}枚</span><span>${icon('crossed-swords')}${l.stats.battlesWon}勝</span></div>
          </div>
        </div>`;
      })
      .join('');
  }

  /** 領地の説明（ツールチップ／タップ時） */
  regionInfo(c: Campaign, i: number) {
    const r = REGIONS[i];
    const o = c.owner[i];
    const owner = o === null ? null : c.lords[o];
    const pool = r.pool.length ? `<div class="ti-row"><span>報酬の例</span><b>${r.pool.map((x) => CARDS[x].name).join('・')}</b></div>` : '';
    const def = owner ? `${esc(owner.name)}（${HEROES[owner.hero].title}）` : r.kind === 'capital' ? '廃墟' : `魔物（${r.defenders.slice(0, 3).map((x) => CARDS[x].name).join('・')}など）`;
    return `<div class="ti-head" style="--group:${owner ? PLAYER_COLORS[owner.id] : '#8a8070'}">${icon(r.icon)}<b>${r.name}</b><span class="grp">${r.kind === 'capital' && o === r.start ? '王都' : r.kind === 'dragon' ? '竜の巣' : '領地'}</span></div>
      <div class="ti-row"><span>守り手</span><b>${def}</b></div>
      <div class="ti-row"><span>守りの城</span><b>${icon('hearts')} ${c.defenseHp(i)}</b></div>
      ${pool}`;
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
