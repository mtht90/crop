// スマホ・タブレット用の操作: 左半分ドラッグでバーチャルスティック、右下にボタン
import { BTN } from '/shared/constants.js';

const LAYOUTS = {
  survivor: [
    { id: 'interact', label: '修理/治療\n(長押し)', bit: BTN.INTERACT, big: true, x: 120, y: 120 },
    { id: 'action', label: '板/窓枠', bit: BTN.ACTION, x: 30, y: 52 },
    { id: 'sneak', label: 'しゃがむ', bit: BTN.SNEAK, toggle: true, x: 140, y: 10 },
  ],
  killer: [
    { id: 'attack', label: '攻撃', bit: BTN.ATTACK, big: true, x: 120, y: 120 },
    { id: 'action', label: 'アクション', bit: BTN.ACTION, x: 30, y: 52 },
    { id: 'power', label: '突進\n(溜め)', bit: BTN.POWER, x: 140, y: 10 },
    { id: 'howl', label: '咆哮', bit: BTN.HOWL, x: 30, y: 150 },
  ],
};

export class TouchControls {
  constructor() {
    this.root = document.getElementById('touch');
    this.zone = document.getElementById('stick-zone');
    this.base = document.getElementById('stick-base');
    this.knob = document.getElementById('stick-knob');
    this.btnBox = document.getElementById('touch-buttons');
    this.enabled = false;
    this.vec = null;
    this.held = 0;
    this.pressed = 0;
    this.toggles = 0;
    this.stickId = null;
    this.onButton = null; // (id) => true なら通常の入力として扱わない
    this.buttons = new Map();
    this.bindStick();
  }

  // 一度でもタッチされたらタッチ操作を有効にする
  enableIfTouch() {
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (touch) this.enabled = true;
    return this.enabled;
  }

  show(role) {
    if (!this.enabled) return;
    this.root.classList.remove('hidden');
    this.build(role === 'survivor' ? 'survivor' : 'killer');
  }

  hide() {
    this.root.classList.add('hidden');
    this.vec = null;
    this.held = 0;
    this.toggles = 0;
  }

  build(role) {
    this.btnBox.innerHTML = '';
    this.buttons.clear();
    for (const b of LAYOUTS[role]) {
      const el = document.createElement('button');
      el.className = 'tbtn' + (b.big ? ' big' : '');
      el.textContent = b.label;
      el.style.whiteSpace = 'pre-line';
      el.style.right = `${b.x - (b.big ? 48 : 37)}px`;
      el.style.bottom = `${b.y - (b.big ? 48 : 37)}px`;
      const down = (e) => {
        e.preventDefault();
        if (this.onButton && this.onButton(b.id)) return;
        if (b.toggle) {
          this.toggles ^= b.bit;
          el.classList.toggle('on', !!(this.toggles & b.bit));
          return;
        }
        this.held |= b.bit;
        this.pressed |= b.bit;
        el.classList.add('on');
      };
      const up = (e) => {
        e.preventDefault();
        if (b.toggle) return;
        this.held &= ~b.bit;
        el.classList.remove('on');
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      this.btnBox.appendChild(el);
      this.buttons.set(b.id, el);
    }
  }

  setLabel(id, label) {
    const el = this.buttons.get(id);
    if (el && el.textContent !== label) el.textContent = label;
  }

  setCooldown(id, cool) {
    const el = this.buttons.get(id);
    if (el) el.classList.toggle('cool', cool);
  }

  bindStick() {
    const R = 55;
    const start = (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.style.bottom = 'auto';
      this.base.classList.add('active');
      this.moveKnob(0, 0);
    };
    const move = (e) => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      this.moveKnob(dx, dy);
      const m = Math.min(1, l / R);
      this.vec = m > 0.2 ? { x: dx / (Math.hypot(dx, dy) || 1), y: dy / (Math.hypot(dx, dy) || 1), mag: m } : null;
    };
    const end = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.vec = null;
      this.moveKnob(0, 0);
      this.base.classList.remove('active');
      this.base.style.left = '';
      this.base.style.top = '';
      this.base.style.bottom = '';
    };
    this.zone.addEventListener('pointerdown', start);
    this.zone.addEventListener('pointermove', move);
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
  }

  moveKnob(dx, dy) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // 入力サンプリング時に呼ぶ
  take() {
    const p = this.pressed;
    this.pressed = 0;
    return { held: this.held | this.toggles, pressed: p, move: this.vec };
  }
}
