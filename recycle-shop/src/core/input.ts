/** キーボード / マウス入力。フレーム単位の「押した瞬間」判定とポインタロックを管理する */
class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** UI が開いている間はゲーム操作を無効化 */
  enabled = true;
  sensitivity = 1;
  invertY = false;
  private canvas: HTMLElement | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;

  attach(canvas: HTMLElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.locked) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousedown', (e) => {
      const k = `Mouse${e.button}`;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
    });
    window.addEventListener('mouseup', (e) => {
      const k = `Mouse${e.button}`;
      this.down.delete(k);
      this.released.add(k);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });
    window.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
  }

  lock() {
    if (!this.canvas || this.locked) return;
    try {
      const p = (this.canvas as any).requestPointerLock?.({ unadjustedMovement: false });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* ヘッドレス環境など */ }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string) { return this.enabled && this.down.has(code); }
  wasPressed(code: string) { return this.enabled && this.pressed.has(code); }
  wasReleased(code: string) { return this.enabled && this.released.has(code); }
  /** UI 表示中でも拾いたいキー (Esc など) */
  rawPressed(code: string) { return this.pressed.has(code); }
  rawDown(code: string) { return this.down.has(code); }

  /** 自動テスト用: キー入力を注入 */
  simulate(code: string, state: 'press' | 'down' | 'up') {
    if (state === 'press') { this.pressed.add(code); }
    else if (state === 'down') { if (!this.down.has(code)) this.pressed.add(code); this.down.add(code); }
    else { this.down.delete(code); this.released.add(code); }
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

export const input = new Input();
