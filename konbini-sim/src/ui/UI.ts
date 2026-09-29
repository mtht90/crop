import * as THREE from 'three';
import './style.css';
import { h, yen } from './dom';
import type { GameState } from '../game/State';
import { RANKS } from '../game/State';

export interface PromptInfo {
  title: string;
  sub?: string;
  keys?: [string, string][];
}

/** Keyboard label → on-screen touch button label. */
const TOUCH_KEYS: Record<string, [string, string]> = {
  E: ['使う', 'use'],
  左クリック: ['陳列', 'primary'],
  左クリック長押し: ['掃除 長押し', 'primary'],
  右クリック: ['戻す', 'back'],
  Q: ['置く', 'drop'],
  R: ['撤去', 'dispose'],
  T: ['価格', 'price'],
};

/** Rewrites keyboard hints in free text for touch players. */
export function touchText(t: string): string {
  return t
    .replace(/ ?\[E\]/g, '')
    .replace(/\[Space\] ?で?/g, '')
    .replace(/［左クリック］/g, '［陳列］')
    .replace(/［([EQRT])］/g, (_m, k: string) => `［${TOUCH_KEYS[k][0]}］`)
    .replace(/左クリック長押し/g, '［陳列/掃除］長押し')
    .replace(/右クリック/g, '［戻す］')
    .replace(/左クリック|クリック/g, 'タップ')
    .replace(/(^|[^A-Za-z])E ?(で|を)/g, '$1［使う］$2');
}

export interface BubbleSource {
  id: number;
  anchor: THREE.Object3D;
  text: string | null;
  tone: 'normal' | 'angry' | 'thought' | 'thief';
  marker?: string;
}

/**
 * All 2D interface: HUD, prompts, notifications, speech bubbles, modals.
 * Game systems call into it; it never mutates game state directly.
 */
export class UI {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private clock!: HTMLElement;
  private dayEl!: HTMLElement;
  private moneyEl!: HTMLElement;
  private repEl!: HTMLElement;
  private repBar!: HTMLElement;
  private rankEl!: HTMLElement;
  private weatherEl!: HTMLElement;
  private cross: HTMLElement;
  private promptEl: HTMLElement;
  private heldEl: HTMLElement;
  private notesEl: HTMLElement;
  private alertsEl: HTMLElement;
  private tasksEl: HTMLElement;
  private bubbleLayer: HTMLElement;
  private bubbles = new Map<number, HTMLElement>();
  private modalLayer: HTMLElement;
  private lastMoney = 0;
  private lastPromptKey = '';
  modalOpen = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.bubbleLayer = h('div');
    this.hud = h('div', { style: 'position:absolute;inset:0' });
    this.cross = h('div', { class: 'crosshair' });
    this.promptEl = h('div', { class: 'prompt' });
    this.heldEl = h('div', { class: 'held', style: 'display:none' });
    this.notesEl = h('div', { class: 'notes' });
    this.alertsEl = h('div', { class: 'alerts' });
    this.tasksEl = h('div', { class: 'tasks', style: 'display:none' });
    this.modalLayer = h('div');
    this.buildTopBar();
    this.hud.append(this.cross, this.promptEl, this.heldEl, this.alertsEl, this.tasksEl);
    root.append(this.bubbleLayer, this.hud, this.notesEl, this.modalLayer);
    this.hud.style.display = 'none';
  }

  private buildTopBar() {
    this.clock = h('div', { class: 'value' }, '06:00');
    this.dayEl = h('div', { class: 'label' }, '1日目');
    this.moneyEl = h('div', { class: 'value money' }, '¥0');
    this.repEl = h('div', { class: 'value small' }, '50');
    this.repBar = h('div');
    this.rankEl = h('div', { class: 'value small' }, '★');
    this.weatherEl = h('div', { class: 'value small' }, '晴れ');
    const top = h(
      'div',
      { class: 'hud-top' },
      h('div', { class: 'chip-row' },
        h('div', { class: 'chip clock' }, this.dayEl, this.clock),
        h('div', { class: 'chip' }, h('div', { class: 'label' }, '天気'), this.weatherEl),
      ),
      h('div', { class: 'chip-row' },
        h('div', { class: 'chip' }, h('div', { class: 'label' }, '店舗ランク'), this.rankEl),
        h('div', { class: 'chip' }, h('div', { class: 'label' }, '評判'), this.repEl, h('div', { class: 'rep-bar' }, this.repBar)),
        h('div', { class: 'chip' }, h('div', { class: 'label' }, '所持金'), this.moneyEl),
      ),
    );
    this.hud.append(top);
  }

  showHUD(on: boolean): void {
    this.hud.style.display = on ? '' : 'none';
    this.bubbleLayer.style.display = on ? '' : 'none';
  }

  updateHUD(s: GameState): void {
    this.clock.textContent = s.clock();
    this.dayEl.textContent = `${s.day}日目`;
    const m = Math.round(s.money);
    if (m !== this.lastMoney) {
      this.moneyEl.classList.remove('up', 'down');
      void this.moneyEl.offsetWidth;
      this.moneyEl.classList.add(m > this.lastMoney ? 'up' : 'down');
      this.lastMoney = m;
    }
    this.moneyEl.textContent = yen(m);
    this.repEl.textContent = `${Math.round(s.reputation)} / 100`;
    this.repBar.style.width = `${s.reputation}%`;
    const r = s.rank;
    this.rankEl.textContent = `${'★'.repeat(r)}${'☆'.repeat(4 - r)} ${RANKS[r - 1].title}`;
    this.weatherEl.textContent = { sunny: '☀ 晴れ', cloudy: '☁ くもり', rain: '☂ 雨' }[s.weather];
  }

  /** Touch play: button labels instead of keys, UI rearranged around the on-screen controls. */
  touch = false;
  /** Called with the touch button ids the current prompt offers. */
  onPromptButtons: ((ids: string[]) => void) | null = null;

  setTouch(on: boolean): void {
    this.touch = on;
    this.root.classList.toggle('touch', on);
    this.lastPromptKey = '#';
  }

  /** Text shown to the player, adapted to the current input device. */
  tx(t: string): string {
    return this.touch ? touchText(t) : t;
  }

  setPrompt(p: PromptInfo | null): void {
    const key = p ? JSON.stringify(p) + this.touch : '';
    if (key === this.lastPromptKey) return;
    this.lastPromptKey = key;
    this.cross.classList.toggle('active', !!p);
    this.promptEl.replaceChildren();
    if (!p) {
      this.onPromptButtons?.([]);
      return;
    }
    this.promptEl.append(h('div', { class: 'title' }, p.title));
    if (p.sub) this.promptEl.append(h('div', { class: 'sub' }, p.sub));
    const keys = p.keys ?? [];
    if (keys.length) this.promptEl.append(h('div', { class: 'keys' }, ...keys.map(([k, t]) => h('div', {}, h('kbd', {}, this.touch ? TOUCH_KEYS[k]?.[0] ?? k : k), t))));
    this.onPromptButtons?.(keys.map(([k]) => TOUCH_KEYS[k]?.[1]).filter((x): x is string => !!x));
  }

  setCrosshair(on: boolean): void {
    this.cross.style.display = on ? '' : 'none';
  }

  setHeld(title: string | null, meta = ''): void {
    if (!title) {
      this.heldEl.style.display = 'none';
      return;
    }
    this.heldEl.style.display = '';
    this.heldEl.replaceChildren(h('div', { class: 'name' }, title), h('div', { class: 'meta' }, this.tx(meta)));
  }

  notify(text: string, kind: 'info' | 'good' | 'bad' | 'warn' = 'info', ms = 4200): void {
    const n = h('div', { class: `note ${kind === 'info' ? '' : kind}` }, this.tx(text));
    this.notesEl.prepend(n);
    while (this.notesEl.children.length > 6) this.notesEl.lastChild?.remove();
    setTimeout(() => n.classList.add('fade'), ms);
    setTimeout(() => n.remove(), ms + 700);
  }

  setAlerts(list: { text: string; info?: boolean }[]): void {
    const key = list.map((a) => a.text).join('|');
    if (this.alertsEl.dataset.key === key) return;
    this.alertsEl.dataset.key = key;
    this.alertsEl.replaceChildren(...list.map((a) => h('div', { class: `alert ${a.info ? 'info' : ''}` }, a.text)));
  }

  setTasks(title: string, tasks: { text: string; done: boolean }[] | null): void {
    if (!tasks) {
      this.tasksEl.style.display = 'none';
      return;
    }
    const key = title + tasks.map((t) => t.text + t.done).join();
    if (this.tasksEl.dataset.key === key) return;
    this.tasksEl.dataset.key = key;
    this.tasksEl.style.display = '';
    this.tasksEl.replaceChildren(h('h4', {}, title), ...tasks.map((t) => h('div', { class: `t ${t.done ? 'done' : ''}` }, h('span', { class: 'dot' }), t.text)));
  }

  updateBubbles(list: BubbleSource[], cam: THREE.Camera): void {
    const seen = new Set<number>();
    const v = new THREE.Vector3();
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    for (const b of list) {
      if (!b.text && !b.marker) continue;
      b.anchor.getWorldPosition(v);
      const dist = v.distanceTo(camPos);
      if (dist > 14) continue;
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) continue;
      seen.add(b.id);
      let el = this.bubbles.get(b.id);
      const cls = b.text ? `bubble ${b.tone}` : 'marker';
      const content = b.text ?? b.marker ?? '';
      if (!el) {
        el = h('div', { class: cls });
        this.bubbleLayer.append(el);
        this.bubbles.set(b.id, el);
      }
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== content) el.textContent = content;
      el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
      el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
      el.style.opacity = String(Math.max(0.35, 1 - dist / 14));
    }
    for (const [id, el] of this.bubbles) {
      if (!seen.has(id)) {
        el.remove();
        this.bubbles.delete(id);
      }
    }
  }

  // ------------------------------------------------------------------ modals

  /** Show a modal; returns a close function. */
  modal(content: HTMLElement, opts: { onClose?: () => void; dim?: boolean } = {}): () => void {
    const wrap = h('div', { class: 'modal-wrap', style: opts.dim === false ? 'background:transparent' : '' }, content);
    this.modalLayer.append(wrap);
    this.modalOpen = true;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.remove();
      this.modalOpen = this.modalLayer.children.length > 0;
      opts.onClose?.();
    };
    return close;
  }

  /** Non-blocking panel (register, dialog) mounted directly in the modal layer. */
  panel(el: HTMLElement): () => void {
    this.modalLayer.append(el);
    return () => el.remove();
  }

  clearModals(): void {
    this.modalLayer.replaceChildren();
    this.modalOpen = false;
  }

  loading(): { set: (p: number, label: string) => void; done: () => void } {
    const bar = h('div');
    const label = h('div', { class: 'label' }, '準備中…');
    const el = h('div', { class: 'loading' }, h('div', { class: 'box' },
      h('div', { class: 'logo', style: 'font-size:48px' }, 'まいにちマート'),
      h('div', { class: 'logo-stripes', style: 'width:260px' }, h('div', { style: 'background:#128a5a' }), h('div', { style: 'background:#f39a1e' }), h('div', { style: 'background:#e8423a' })),
      h('div', { class: 'bar' }, bar), label));
    this.root.append(el);
    return {
      set: (p, l) => {
        bar.style.width = `${Math.round(p * 100)}%`;
        label.textContent = `${Math.round(p * 100)}%  ${l}`;
      },
      done: () => el.remove(),
    };
  }

  title(opts: { hasSave: boolean; onNew: () => void; onContinue: () => void; onHelp: () => void; onSettings: () => void }): () => void {
    const el = h('div', { class: 'title-screen' },
      h('div', { class: 'logo' }, 'まいにちマート'),
      h('div', { class: 'logo-stripes' }, h('div', { style: 'background:#128a5a' }), h('div', { style: 'background:#f39a1e' }), h('div', { style: 'background:#e8423a' })),
      h('div', { class: 'subtitle' }, 'コンビニ経営シミュレーター'),
      h('div', { class: 'menu' },
        opts.hasSave ? h('button', { class: 'primary', onclick: opts.onContinue }, '▶ つづきから') : null,
        h('button', { class: opts.hasSave ? '' : 'primary', onclick: opts.onNew }, opts.hasSave ? '＋ はじめから' : '▶ はじめる'),
        h('button', { onclick: opts.onHelp }, '？ 操作説明'),
        h('button', { onclick: opts.onSettings }, '⚙ 設定'),
      ),
      h('div', { class: 'credits' },
        '人物: Microsoft Rocketbox (MIT) / 店舗什器: SIGVerse project (NII 稲邑グループ) — レジ numiteg・コーヒーマシン Kreutergarten・コピー機 thethieme・カゴ kowbassen (CC-BY 4.0) / 冷蔵庫・車・カラーコーン: Khronos glTF Sample Assets (CC-BY 4.0) / 小物・HDRI: Poly Haven (CC0) / テクスチャ: ShareTextures (CC0) / 効果音: Kenney (CC0) / 登場する商品・ブランドはすべて架空のものです'),
    );
    this.root.append(el);
    return () => el.remove();
  }

  helpContent(): HTMLElement {
    const rows: [string, string][] = this.touch ? [
      ['左側をドラッグ', '移動（スティックを奥まで倒すと走る）'], ['右側をドラッグ', '視点移動'], ['使う', '手に取る / 使う / 話しかける'],
      ['陳列/掃除', '商品を棚に並べる / 長押しで掃除'], ['戻す', '棚の商品を箱に戻す'], ['置く', '持っている物を置く'],
      ['撤去', '期限切れ商品を撤去'], ['価格', '棚の商品の売価を変更'], ['走る', '走る（切り替え）'], ['☰', 'メニュー'],
      ['キーボード', 'iPadにキーボード・トラックパッドを繋げばPCと同じ操作もできます'],
    ] : [
      ['W A S D', '移動'], ['Shift', '走る'], ['マウス', '視点移動'], ['E', '手に取る / 使う / 話しかける'],
      ['左クリック', '商品を棚に並べる / 掃除する'], ['右クリック', '棚の商品を箱に戻す'], ['Q', '持っている物を置く'],
      ['R', '期限切れ商品を撤去（棚・ホットケース）'], ['T', '棚の商品の売価を変更'], ['Tab / Esc', 'メニュー'],
    ];
    return h('div', {},
      h('div', { class: 'pause-help' }, ...rows.flatMap(([k, t]) => [h('div', {}, h('kbd', {}, k)), h('div', {}, t)])),
      h('p', { style: 'color:var(--muted);font-size:13px;line-height:1.7;margin-top:14px' },
        'バックヤードのPCで商品を発注すると、納品時間（7時・13時・19時）に段ボールが届きます。箱を持って売場の棚に陳列しましょう。',
        h('br'), this.tx('お客さんがレジに並んだら、レジで E を押して接客。カウンターの商品をクリックしてスキャンし、会計・おつりを渡します。'),
        h('br'), '夜になると酔っ払い・クレーマー・万引き犯・立ち読み客など、ちょっと困ったお客さんもやってきます。',
      ),
    );
  }
}
