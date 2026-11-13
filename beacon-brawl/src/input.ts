/**
 * 入力（ブロスタ風）
 * - 移動: 左側をタッチした場所に出るスティック / WASD
 * - 攻撃・スキル: ボタンをタップで自動照準、引っぱって離すと手動で狙う。中心に戻して離すとキャンセル
 * - PC: マウスで狙う。左クリック=攻撃、Q/E=スキル、Space=必殺技（押している間は予告を表示し、離すと発動）
 */

/** 'atk' = 通常攻撃、0/1 = スキル、2 = 必殺技 */
export type Slot = 'atk' | 0 | 1 | 2;

export interface AimInput {
  slot: Slot;
  /** 手動で狙っているか（false なら自動照準） */
  manual: boolean;
  /** 画面上の方向と強さ。右が +x、上が +y。長さ 0..1（1 で最大射程） */
  x: number; y: number;
  /** マウスで狙っているときのカーソル位置（画面座標） */
  cursor?: [number, number];
}

const DRAG_MAX = 70;     // これだけ引くと最大射程
const DRAG_MANUAL = 18;  // これ以上引くと手動照準
const STICK_MAX = 56;
const DEADZONE = 0.15;

export class Input {
  /** 現在狙っている途中のもの（予告表示用） */
  aiming: AimInput | null = null;
  private fires: AimInput[] = [];
  private keys = new Set<string>();
  private stick: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  private button: { id: number; slot: Slot; x0: number; y0: number; el: HTMLElement } | null = null;
  private mouse: [number, number] = [0, 0];
  private keySlot: { code: string; slot: Slot } | null = null;
  private stickEl: HTMLElement; private knobEl: HTMLElement;

  constructor(surface: HTMLElement) {
    this.stickEl = document.getElementById('stick')!;
    this.knobEl = document.getElementById('knob')!;

    const KEYS: Record<string, Slot> = { KeyQ: 0, KeyE: 1, Space: 2, Digit1: 0, Digit2: 1, Digit3: 2, KeyJ: 'atk' };
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      const slot = KEYS[e.code];
      if (slot === undefined) return;
      e.preventDefault();
      if (e.repeat || this.keySlot) return;
      this.keySlot = { code: e.code, slot };
      this.aiming = this.mouseAim(slot);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (this.keySlot?.code === e.code) { this.fires.push(this.mouseAim(this.keySlot.slot)); this.keySlot = null; this.aiming = null; }
    });
    addEventListener('blur', () => { this.keys.clear(); this.keySlot = null; this.aiming = null; });
    addEventListener('mousemove', (e) => {
      this.mouse = [e.clientX, e.clientY];
      if (this.keySlot || this.aiming?.cursor) this.aiming = this.mouseAim(this.aiming?.slot ?? this.keySlot!.slot);
    });

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        surface.setPointerCapture(e.pointerId);
        this.aiming = this.mouseAim('atk');
        return;
      }
      // タッチ: 左側ならスティック
      if (e.clientX < innerWidth * 0.5 && !this.stick) {
        surface.setPointerCapture(e.pointerId);
        this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0 };
        this.stickEl.style.display = 'block';
        this.stickEl.style.left = `${e.clientX}px`; this.stickEl.style.top = `${e.clientY}px`;
        this.knobEl.style.transform = 'translate(-50%,-50%)';
      }
    });
    surface.addEventListener('pointermove', (e) => {
      if (this.stick?.id !== e.pointerId) return;
      let dx = e.clientX - this.stick.x0, dy = e.clientY - this.stick.y0;
      const len = Math.hypot(dx, dy);
      if (len > STICK_MAX) { dx *= STICK_MAX / len; dy *= STICK_MAX / len; }
      this.stick.x = dx / STICK_MAX; this.stick.y = -dy / STICK_MAX;
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e: PointerEvent) => {
      if (this.stick?.id === e.pointerId) { this.stick = null; this.stickEl.style.display = 'none'; }
      if (e.pointerType === 'mouse' && this.aiming?.slot === 'atk' && this.aiming.cursor) { this.fires.push(this.mouseAim('atk')); this.aiming = null; }
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private mouseAim(slot: Slot): AimInput {
    return { slot, manual: true, x: 0, y: 0, cursor: [...this.mouse] };
  }

  /** 攻撃・スキルのボタンに、タップ/引っぱり操作を付ける */
  bindButton(el: HTMLElement, slot: Slot) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.button) return;
      if (e.pointerType === 'mouse') { // PC はボタンをクリックしたらカーソル方向へ即発動
        this.fires.push({ slot, manual: false, x: 0, y: 0 });
        return;
      }
      try { el.setPointerCapture(e.pointerId); } catch { /* 合成イベントなど */ }
      this.button = { id: e.pointerId, slot, x0: e.clientX, y0: e.clientY, el };
      this.aiming = { slot, manual: false, x: 0, y: 0 };
      el.classList.add('held');
    });
    el.addEventListener('pointermove', (e) => {
      const b = this.button;
      if (!b || b.id !== e.pointerId || !this.aiming) return;
      const dx = e.clientX - b.x0, dy = e.clientY - b.y0, len = Math.hypot(dx, dy);
      if (len > DRAG_MANUAL) this.aiming.manual = true;
      const k = Math.min(1, len / DRAG_MAX) / Math.max(1, len);
      this.aiming.x = dx * k; this.aiming.y = -dy * k;
    });
    const end = (e: PointerEvent) => {
      const b = this.button;
      if (!b || b.id !== e.pointerId) return;
      const a = this.aiming;
      const len = Math.hypot(e.clientX - b.x0, e.clientY - b.y0);
      // 手動で狙ったあと中心に戻して離したらキャンセル
      if (a && !(a.manual && len < DRAG_MANUAL) && e.type === 'pointerup') this.fires.push(a);
      b.el.classList.remove('held');
      this.button = null; this.aiming = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** 移動入力 (right, forward)。少し倒せば全速 */
  move(): [number, number] {
    if (this.stick) {
      const { x, y } = this.stick, len = Math.hypot(x, y);
      return len < DEADZONE ? [0, 0] : [x / len, y / len];
    }
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    return l > 1 ? [x / l, y / l] : [x, y];
  }

  /** 発動待ちの攻撃・スキルを取り出す */
  takeFires() { const f = this.fires; this.fires = []; return f; }
  /** 自動テスト・デバッグ用 */
  push(a: AimInput) { this.fires.push(a); }
  reset() { this.fires = []; this.aiming = null; this.button = null; this.keySlot = null; }
}
