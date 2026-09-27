/** キーボード / マウス入力。フレーム単位の「押した瞬間」判定とポインタロックを管理する */
class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** ポインタロックが使えない環境 (埋め込み表示など) では、ドラッグで視点を動かす */
  dragMode = false;
  private dragging = false;
  private dragDist = 0;
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
      if (this.dragMode && e.button === 0 && e.target === this.canvas) {
        // クリックかドラッグかは離したときに判定
        this.dragging = true;
        this.dragDist = 0;
        return;
      }
      const k = `Mouse${e.button}`;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
    });
    window.addEventListener('mouseup', (e) => {
      if (this.dragMode && e.button === 0 && this.dragging) {
        this.dragging = false;
        if (this.dragDist < 6) this.pressed.add('Mouse0');
        return;
      }
      const k = `Mouse${e.button}`;
      this.down.delete(k);
      this.released.add(k);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dragMode && this.dragging) {
        this.dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
        return;
      }
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockerror', () => { if (this.lockFromClick) this.enableDragMode(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });
    window.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
  }

  /** 視点操作が有効か (ポインタロック中 or ドラッグモード) */
  get active() { return this.locked || this.dragMode; }

  private enableDragMode() {
    if (this.dragMode) return;
    this.dragMode = true;
    this.onLockChange?.(false);
  }

  private lockFromClick = false;

  /** fromClick: ユーザーのクリック起点。これで失敗した場合だけドラッグ操作に切り替える */
  lock(fromClick = false) {
    if (!this.canvas || this.locked || this.dragMode) return;
    this.lockFromClick = fromClick;
    const fail = () => { if (fromClick) this.enableDragMode(); else this.onLockChange?.(false); };
    try {
      const fn = (this.canvas as any).requestPointerLock;
      if (!fn) { this.enableDragMode(); return; }
      const p = fn.call(this.canvas);
      if (p && typeof p.catch === 'function') p.catch(fail);
    } catch { fail(); }
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
