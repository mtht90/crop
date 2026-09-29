import type { Input } from '../core/Input';
import { h } from './dom';

export type TouchContext = 'play' | 'register' | 'menu';

interface ActionDef {
  id: string;
  label: string;
  code: string;
  /** Held while the finger is down (mop cleaning, run). */
  hold?: boolean;
  toggle?: boolean;
  big?: boolean;
}

const ACTIONS: ActionDef[] = [
  { id: 'use', label: '使う', code: 'KeyE', big: true },
  { id: 'primary', label: '陳列\n掃除', code: 'Mouse0', hold: true, big: true },
  { id: 'back', label: '戻す', code: 'Mouse2' },
  { id: 'drop', label: '置く', code: 'KeyQ' },
  { id: 'dispose', label: '撤去', code: 'KeyR' },
  { id: 'price', label: '価格', code: 'KeyT' },
  { id: 'run', label: '走る', code: 'ShiftLeft', toggle: true },
];

/**
 * On-screen controls for iPad / touch screens:
 * - left half: floating analog stick (appears where the thumb lands)
 * - right half: drag to look, tap (in register mode) to scan an item
 * - action buttons bottom-right, menu button top-right
 */
export class TouchControls {
  readonly el: HTMLElement;
  private stickBase: HTMLElement;
  private stickKnob: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private looks = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private buttons: HTMLElement;
  private menuBtn: HTMLElement;
  private ctx: TouchContext = 'play';
  private buttonEls = new Map<string, HTMLElement>();
  /** Labels shown in prompts for each keyboard binding while in touch mode. */
  static readonly LABELS: Record<string, string> = {
    E: '使う', 左クリック: '陳列', 右クリック: '戻す', Q: '置く', R: '撤去', T: '価格', '左クリック長押し': '掃除(長押し)', Space: 'タップ',
  };

  constructor(private input: Input, root: HTMLElement, onMenu: () => void) {
    this.stickBase = h('div', { class: 'stick-base' });
    this.stickKnob = h('div', { class: 'stick-knob' });
    this.stickBase.append(this.stickKnob);
    this.buttons = h('div', { class: 'touch-buttons' });
    for (const a of ACTIONS) {
      const b = h('button', { class: `tbtn ${a.big ? 'big' : ''}`, 'data-id': a.id }, a.label);
      this.bindButton(b, a);
      this.buttonEls.set(a.id, b);
      this.buttons.append(b);
    }
    this.menuBtn = h('button', { class: 'tbtn menu-btn', 'aria-label': 'メニュー' }, '☰');
    this.menuBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onMenu();
    });
    const zone = h('div', { class: 'touch-zone' });
    this.el = h('div', { class: 'touch-layer' }, zone, this.stickBase, this.buttons, this.menuBtn,
      h('div', { class: 'rotate-hint' }, '横向きでプレイしてください'));
    root.append(this.el);
    // a trackpad / mouse click switches back to desktop controls (pointer lock)
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') this.input.setTouchMode(false);
    });
    zone.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    zone.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    zone.addEventListener('touchend', (e) => this.onEnd(e), { passive: false });
    zone.addEventListener('touchcancel', (e) => this.onEnd(e), { passive: false });
    this.setVisible(false);
  }

  private bindButton(b: HTMLElement, a: ActionDef) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (a.toggle) {
        const on = !b.classList.contains('on');
        b.classList.toggle('on', on);
        this.input.setVirtual(a.code, on);
        return;
      }
      b.classList.add('on');
      this.input.inject(a.code);
      if (a.hold) this.input.setVirtual(a.code, true);
    });
    const up = () => {
      if (a.toggle) return;
      b.classList.remove('on');
      if (a.hold) this.input.setVirtual(a.code, false);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }

  setVisible(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
    if (!on) this.resetStick();
  }

  /** Show only what makes sense for the current game mode. */
  setContext(c: TouchContext): void {
    if (c === this.ctx) return;
    this.ctx = c;
    this.el.dataset.ctx = c;
    if (c !== 'play') this.resetStick();
  }

  /** Highlight buttons whose action is currently offered by the prompt. */
  highlight(ids: string[]): void {
    for (const [id, el] of this.buttonEls) el.classList.toggle('hint', ids.includes(id));
  }

  private resetStick() {
    this.stickId = null;
    this.input.moveX = 0;
    this.input.moveY = 0;
    this.stickBase.classList.remove('active');
  }

  private onStart(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const leftSide = t.clientX < window.innerWidth * 0.42;
      if (leftSide && this.stickId === null && this.ctx === 'play') {
        this.stickId = t.identifier;
        this.stickOrigin = { x: t.clientX, y: t.clientY };
        this.stickBase.style.left = `${t.clientX}px`;
        this.stickBase.style.top = `${t.clientY}px`;
        this.stickKnob.style.transform = 'translate(-50%, -50%)';
        this.stickBase.classList.add('active');
      } else {
        this.looks.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now() });
      }
    }
  }

  private onMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        const R = 60;
        let dx = t.clientX - this.stickOrigin.x;
        let dy = t.clientY - this.stickOrigin.y;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        const dead = 0.12;
        const nx = dx / R;
        const ny = -dy / R;
        this.input.moveX = Math.abs(nx) < dead ? 0 : nx;
        this.input.moveY = Math.abs(ny) < dead ? 0 : ny;
        // pushing the stick all the way runs
        this.input.setVirtual('ShiftRight', d >= R * 0.98 && ny > 0.7);
      } else {
        const l = this.looks.get(t.identifier);
        if (!l) continue;
        if (this.ctx === 'play') this.input.addLook((t.clientX - l.x) * 1.6, (t.clientY - l.y) * 1.6);
        l.x = t.clientX;
        l.y = t.clientY;
      }
    }
  }

  private onEnd(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.resetStick();
        this.input.setVirtual('ShiftRight', false);
        continue;
      }
      const l = this.looks.get(t.identifier);
      if (l) {
        const moved = Math.hypot(t.clientX - l.sx, t.clientY - l.sy);
        if (moved < 12 && performance.now() - l.t < 350) this.input.tap(t.clientX, t.clientY);
        this.looks.delete(t.identifier);
      }
    }
  }
}
