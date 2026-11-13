/** キーボード / マウス / タッチ入力をまとめる */
export class Input {
  moveX = 0; moveY = 0;          // -1..1 (右 / 前)
  private keys = new Set<string>();
  private pressed: boolean[] = [false, false, false];
  private camDelta = 0; private camDeltaY = 0; private zoom = 0;
  private stick: { id: number; x0: number; y0: number } | null = null;
  private look: { id: number; x: number; y: number } | null = null;
  private stickEl: HTMLElement; private knobEl: HTMLElement;

  constructor(surface: HTMLElement) {
    this.stickEl = document.getElementById('stick')!;
    this.knobEl = document.getElementById('knob')!;
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      const i = ['KeyJ', 'KeyK', 'KeyL'].indexOf(e.code);
      const j = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (e.code === 'Space') { this.pressed[2] = true; e.preventDefault(); }
      else if (i >= 0) this.pressed[i] = true;
      else if (j >= 0) this.pressed[j] = true;
      else if (e.code === 'KeyQ') this.pressed[0] = true;
      else if (e.code === 'KeyE') this.pressed[1] = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    surface.addEventListener('pointerdown', (e) => {
      surface.setPointerCapture(e.pointerId);
      const leftHalf = e.clientX < innerWidth * 0.45;
      if (e.pointerType !== 'mouse' && leftHalf && !this.stick) {
        this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
        this.stickEl.style.display = 'block';
        this.stickEl.style.left = `${e.clientX}px`; this.stickEl.style.top = `${e.clientY}px`;
        this.knobEl.style.transform = 'translate(-50%,-50%)';
      } else if (!this.look) {
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    });
    surface.addEventListener('pointermove', (e) => {
      if (this.stick?.id === e.pointerId) {
        let dx = e.clientX - this.stick.x0, dy = e.clientY - this.stick.y0;
        const len = Math.hypot(dx, dy), max = 56;
        if (len > max) { dx *= max / len; dy *= max / len; }
        this.moveX = dx / max; this.moveY = -dy / max;
        this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (this.look?.id === e.pointerId) {
        this.camDelta += e.clientX - this.look.x; this.camDeltaY += e.clientY - this.look.y;
        this.look.x = e.clientX; this.look.y = e.clientY;
      }
    });
    const end = (e: PointerEvent) => {
      if (this.stick?.id === e.pointerId) { this.stick = null; this.moveX = this.moveY = 0; this.stickEl.style.display = 'none'; }
      if (this.look?.id === e.pointerId) this.look = null;
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('wheel', (e) => { this.zoom += e.deltaY; e.preventDefault(); }, { passive: false });
  }

  press(i: number) { this.pressed[i] = true; }

  /** そのフレームの移動入力 (right, forward) */
  move(): [number, number] {
    if (this.stick) return [this.moveX, this.moveY];
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    return l > 1 ? [x / l, y / l] : [x, y];
  }
  takeSkill(i: number) { const p = this.pressed[i]; this.pressed[i] = false; return p; }
  takeCamDelta() { const d = this.camDelta; this.camDelta = 0; return d; }
  takeCamDeltaY() { const d = this.camDeltaY; this.camDeltaY = 0; return d; }
  takeZoom() { const d = this.zoom; this.zoom = 0; return d; }
  reset() { this.pressed = [false, false, false]; this.camDelta = this.camDeltaY = this.zoom = 0; }
}
