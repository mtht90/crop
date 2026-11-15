class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  lmb = false;
  rmb = false;
  lmbPressed = false;
  lmbReleased = false;
  locked = false;
  enabled = false;
  canvas!: HTMLCanvasElement;
  onUnlock?: () => void;
  onLock?: () => void;
  /** ポインタロックが使えない環境（埋め込み表示など）での代替モード */
  fallback = false;

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'Tab', 'KeyF', 'KeyQ'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.lmb = this.rmb = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) return;
      if (e.button === 0) {
        this.lmb = true;
        this.lmbPressed = true;
      }
      if (e.button === 2) this.rmb = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        if (this.lmb) this.lmbReleased = true;
        this.lmb = false;
      }
      if (e.button === 2) this.rmb = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    });
    window.addEventListener('keydown', (e) => {
      if (this.fallback && this.locked && e.code === 'Escape') this.unlock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.onLock?.();
      if (!this.locked) {
        this.lmb = this.rmb = false;
        this.keys.clear();
        this.onUnlock?.();
      }
    });
  }

  lock() {
    const fb = () => {
      if (document.pointerLockElement === this.canvas) return;
      // ポインタロック不可：カーソルを出したままマウス移動量で視点操作
      this.fallback = true;
      this.locked = true;
      this.onLock?.();
    };
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(fb);
      setTimeout(fb, 500);
    } catch {
      fb();
    }
  }
  unlock() {
    if (this.fallback && this.locked) {
      this.locked = false;
      this.lmb = this.rmb = false;
      this.keys.clear();
      this.onUnlock?.();
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string) {
    return this.keys.has(code);
  }
  hit(code: string) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
    this.lmbPressed = this.lmbReleased = false;
  }
}

export const input = new Input();
