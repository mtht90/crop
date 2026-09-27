import { assets } from '../core/assets';
import { audio } from '../core/audio';
import { events } from '../core/events';
import { input } from '../core/input';
import { el, escapeHtml } from '../core/util';

export const icon = (name: string, cls = '') => `<span class="ico ${cls}">${assets.icon(name)}</span>`;

/** モーダル画面の基底 */
export abstract class Modal {
  readonly el: HTMLDivElement;
  /** 開いている間ゲーム内時間を止めるか */
  pausesTime = false;
  /** Esc で閉じられるか */
  closable = true;
  ui!: UI;

  constructor(cls: string) {
    this.el = el('div', `modal ${cls}`);
  }

  onOpen(): void {}
  onClose(): void {}
  update(_dt: number): void {}
  close() { this.ui.close(this); }
}

/** DOM ベースの UI 管理 (モーダルのスタック・トースト・ポインタロック) */
export class UI {
  readonly root: HTMLElement;
  readonly layer: HTMLDivElement;
  readonly toasts: HTMLDivElement;
  private stack: Modal[] = [];
  private clickToPlay: HTMLDivElement;
  /** タイトル画面などゲーム外 */
  inGame = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.layer = el('div', 'modal-layer');
    this.toasts = el('div', 'toasts');
    this.clickToPlay = el('div', 'click-to-play hidden', `<div class="ctp-card"><div class="ctp-title">クリックで再開</div><div class="ctp-sub">WASD 移動 ・ マウス 視点 ・ Esc メニュー</div></div>`);
    root.append(this.layer, this.toasts, this.clickToPlay);
    this.clickToPlay.addEventListener('click', () => { audio.init(); input.lock(); });
    events.on('toast', (t) => this.toast(t.text, t.kind, t.icon));
    input.onLockChange = () => this.refreshLock();
    // ボタンのクリック音
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('button')) audio.play('press', { volume: 0.5 });
    });
  }

  get top(): Modal | null { return this.stack[this.stack.length - 1] ?? null; }
  get modalOpen() { return this.stack.length > 0; }
  isOpen(m: Modal) { return this.stack.includes(m); }
  timePaused() { return this.stack.some((m) => m.pausesTime); }

  open(m: Modal) {
    if (this.stack.includes(m)) return;
    m.ui = this;
    this.stack.push(m);
    this.layer.appendChild(m.el);
    m.el.classList.remove('closing');
    requestAnimationFrame(() => m.el.classList.add('open'));
    input.enabled = false;
    input.unlock();
    m.onOpen();
    this.refreshLock();
  }

  close(m: Modal | null = this.top) {
    if (!m) return;
    const i = this.stack.indexOf(m);
    if (i < 0) return;
    this.stack.splice(i, 1);
    m.el.classList.remove('open');
    m.el.remove();
    m.onClose();
    if (!this.stack.length) {
      input.enabled = true;
      if (this.inGame) input.lock();
    }
    this.refreshLock();
  }

  closeAll() { while (this.stack.length) this.close(); }

  refreshLock() {
    const show = this.inGame && !this.stack.length && !input.locked;
    this.clickToPlay.classList.toggle('hidden', !show);
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'warn' = 'info', ico?: string) {
    const t = el('div', `toast ${kind}`, `${ico ? icon(ico) : ''}<span>${escapeHtml(text)}</span>`);
    this.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3800);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild?.remove();
  }

  update(dt: number) {
    for (const m of this.stack) m.update(dt);
    if (input.rawPressed('Escape') && this.top?.closable) this.close();
  }
}

/** 数値入力つきスライダー */
export function priceInput(initial: number, onChange: (v: number) => void, opts: { min?: number; max?: number; step?: number } = {}) {
  const wrap = el('div', 'price-input');
  const minus = el('button', 'pi-btn', '−');
  const field = el('input') as HTMLInputElement;
  field.type = 'text';
  field.inputMode = 'numeric';
  const plus = el('button', 'pi-btn', '+');
  wrap.append(minus, el('span', 'pi-yen', '¥'), field, plus);
  let value = initial;
  const step = () => opts.step ?? (value < 1000 ? 10 : value < 10000 ? 100 : value < 100000 ? 500 : 1000);
  const set = (v: number, fromField = false) => {
    value = Math.max(opts.min ?? 0, Math.min(opts.max ?? 99_999_999, Math.round(v)));
    if (!fromField) field.value = value.toLocaleString('ja-JP');
    onChange(value);
  };
  field.addEventListener('input', () => {
    const n = Number(field.value.replace(/[^0-9]/g, ''));
    if (!Number.isNaN(n)) set(n, true);
  });
  field.addEventListener('blur', () => set(value));
  field.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { set(value + step()); e.preventDefault(); }
    if (e.key === 'ArrowDown') { set(value - step()); e.preventDefault(); }
    e.stopPropagation();
  });
  minus.addEventListener('click', () => set(value - step()));
  plus.addEventListener('click', () => set(value + step()));
  set(initial);
  return { el: wrap, get: () => value, set, focus: () => { field.focus(); field.select(); } };
}
