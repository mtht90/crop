import type { Input } from '../core/input';
import type { Phase } from '../fishing/fishing';
import { h } from './dom';

/** 指を外に動かしても離した判定を取れるようにする（失敗しても操作は続ける） */
function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* 対応していない環境 */
  }
}

export interface TouchState {
  mode: 'walk' | 'fish' | 'hidden';
  phase: Phase;
  canFish: boolean;
  nearHut: boolean;
  isBait: boolean;
  hasBite: boolean;
}

/**
 * タッチ操作：左下のスティックで移動、画面ドラッグで視点（ファイト中は竿の向き）、
 * 右下のボタンは状況に応じて切り替わる。ボタンは Input に入力を流し込むだけ。
 */
export class TouchControls {
  readonly root = h('div', { class: 'touch' });
  private look = h('div', { class: 'touch-look' });
  private stick = h('div', { class: 'touch-stick' });
  private knob = h('div', { class: 'touch-knob' });
  private actions = h('div', { class: 'touch-actions' });
  private menu = h('div', { class: 'touch-menu' });
  private lastKey = '';
  enabled = false;

  constructor(
    parent: HTMLElement,
    private input: Input,
    private onPause: () => void,
  ) {
    this.stick.append(this.knob);
    this.root.append(this.look, this.stick, this.actions, this.menu);
    parent.append(this.root);
    this.root.style.display = 'none';
    this.bindLook();
    this.bindStick();
    const menuBtn = (label: string, fn: () => void) => this.tapButton(label, fn, 'touch-small');
    this.menu.append(
      menuBtn('図鑑', () => input.tapKey('Tab')),
      menuBtn('道具', () => input.tapKey('KeyI')),
      menuBtn('地図', () => input.tapKey('KeyM')),
      menuBtn('≡', () => this.onPause()),
    );
    const enable = () => this.enable();
    if (matchMedia('(pointer: coarse)').matches) this.enable();
    else addEventListener('touchstart', enable, { once: true, passive: true });
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.input.touch = true;
    this.input.forceLocked = true;
    this.input.locked = true;
    document.body.classList.add('is-touch');
  }

  private bindLook(): void {
    let id: number | null = null;
    let lx = 0;
    let ly = 0;
    this.look.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      this.input.touchDown = true;
      this.input.touchPressed = true;
      capture(this.look, e.pointerId);
    });
    this.look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      this.input.mouseDX += (e.clientX - lx) * 1.6;
      this.input.mouseDY += (e.clientY - ly) * 1.6;
      lx = e.clientX;
      ly = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      this.input.touchDown = false;
    };
    this.look.addEventListener('pointerup', end);
    this.look.addEventListener('pointercancel', end);
  }

  private bindStick(): void {
    let id: number | null = null;
    let cx = 0;
    let cy = 0;
    const R = 52;
    const set = (x: number, y: number) => {
      const len = Math.hypot(x, y);
      const k = len > R ? R / len : 1;
      this.knob.style.transform = `translate(${x * k}px, ${y * k}px)`;
      this.input.stickX = (x * k) / R;
      this.input.stickY = -(y * k) / R;
    };
    this.stick.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      const r = this.stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      capture(this.stick, e.pointerId);
      set(e.clientX - cx, e.clientY - cy);
    });
    this.stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      set(0, 0);
    };
    this.stick.addEventListener('pointerup', end);
    this.stick.addEventListener('pointercancel', end);
  }

  private tapButton(label: string, fn: () => void, cls = ''): HTMLButtonElement {
    const b = h('button', { class: `touch-btn ${cls}`, text: label });
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    return b;
  }

  /** 押している間だけ有効なボタン（キャスト・巻き取り） */
  private holdButton(label: string, cls = ''): HTMLButtonElement {
    const b = h('button', { class: `touch-btn ${cls}`, text: label });
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('on');
      this.input.pressLeft();
      capture(b, e.pointerId);
    });
    const up = () => {
      b.classList.remove('on');
      this.input.releaseLeft();
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return b;
  }

  update(st: TouchState): void {
    if (!this.enabled) return;
    this.root.style.display = st.mode === 'hidden' ? 'none' : '';
    this.stick.style.display = st.mode === 'walk' ? '' : 'none';
    const key = `${st.mode}|${st.phase}|${st.canFish}|${st.nearHut}|${st.isBait}|${st.hasBite}|${this.input.stickRun}`;
    if (key === this.lastKey) return;
    // 押している最中にボタンを作り直すと離した判定が取れないので、押下中は更新しない
    if (this.input.left && this.lastKey.split('|')[0] === st.mode) return;
    this.lastKey = key;
    const btns: HTMLElement[] = [];
    if (st.mode === 'walk') {
      if (st.nearHut) btns.push(this.tapButton('小屋', () => this.input.tapKey('KeyE'), 'touch-main'));
      else if (st.canFish) btns.push(this.tapButton('釣る', () => this.input.tapKey('KeyF'), 'touch-main'));
      btns.push(
        this.tapButton(this.input.stickRun ? '歩く' : '走る', () => {
          this.input.stickRun = !this.input.stickRun;
          this.lastKey = '';
        }),
      );
    } else if (st.mode === 'fish') {
      if (st.phase === 'ready' || st.phase === 'aiming') {
        // キャストは画面を引っぱって離す
        if (st.isBait) btns.push(this.tapButton('ウキ下', () => this.input.tapKey('KeyR')));
        btns.push(this.tapButton('やめる', () => this.input.tapKey('KeyF')));
      } else if (st.phase === 'water' || st.phase === 'flying') {
        btns.push(this.holdButton('巻く', 'touch-main'));
      } else if (st.phase === 'fight') {
        btns.push(this.holdButton('巻く', 'touch-main'));
        btns.push(this.tapButton('ドラグ＋', () => (this.input.wheel -= 1)));
        btns.push(this.tapButton('ドラグ−', () => (this.input.wheel += 1)));
      } else if (st.phase === 'net') {
        btns.push(this.tapButton('タモ！', () => (this.input.pressLeft(), setTimeout(() => this.input.releaseLeft(), 80)), 'touch-main touch-alert'));
      }
    }
    this.actions.replaceChildren(...btns);
  }
}
