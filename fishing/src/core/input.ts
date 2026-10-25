/**
 * キーボード・マウス・タッチ入力。
 * - Pointer Lock が使えるときはマウスで視点を回す
 * - 使えないとき（拒否された環境）はカーソル位置で視点を回す（画面端ほど速く回る）
 * - タッチ端末は ui/touch.ts の仮想ボタン・スティックがこのクラスに入力を流し込む
 */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  left = false;
  right = false;
  leftPressed = false;
  leftReleased = false;
  rightPressed = false;
  locked = false;
  /** 自動テスト・タッチ用：Pointer Lock なしでもロック中として扱う */
  forceLocked = false;
  /** Pointer Lock が使えない環境ではカーソル位置で視点を回す */
  freeCursor = false;
  /** カーソル位置 -1..1（freeCursor 用） */
  cursorX = 0;
  cursorY = 0;
  /** タッチのスティック入力 -1..1 */
  stickX = 0;
  stickY = 0;
  stickRun = false;
  touch = false;
  /** 画面（視点エリア）を押しているか：スマホのキャストの引っぱりに使う */
  touchDown = false;
  touchPressed = false;
  /** UIが開いている間はゲーム入力を無視する */
  enabled = true;

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.left = this.right = false;
    });
    addEventListener('mousemove', (e) => {
      this.cursorX = (e.clientX / innerWidth) * 2 - 1;
      this.cursorY = (e.clientY / innerHeight) * 2 - 1;
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    el.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.freeCursor) return;
      if (e.button === 0) this.pressLeft();
      else if (e.button === 2) this.pressRight();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.releaseLeft();
      else if (e.button === 2) this.right = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener(
      'wheel',
      (e) => {
        if (this.locked || this.freeCursor) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = this.forceLocked || document.pointerLockElement === this.el;
      if (this.locked) this.freeCursor = false;
      if (!this.locked) this.left = this.right = false;
    });
    // 埋め込み表示などで Pointer Lock が拒否されたら、カーソル操作に切り替える
    document.addEventListener('pointerlockerror', () => {
      this.freeCursor = true;
    });
  }

  pressLeft(): void {
    if (!this.left) this.leftPressed = true;
    this.left = true;
  }

  releaseLeft(): void {
    if (this.left) this.leftReleased = true;
    this.left = false;
  }

  pressRight(): void {
    this.right = true;
    this.rightPressed = true;
  }

  /** 仮想ボタンからのキー入力 */
  tapKey(code: string): void {
    this.pressed.add(code);
  }

  lock(): void {
    if (this.forceLocked) {
      this.locked = true;
      return;
    }
    if (this.locked) return;
    try {
      const r = this.el.requestPointerLock?.() as unknown as Promise<void> | undefined;
      r?.catch?.(() => (this.freeCursor = true));
    } catch {
      this.freeCursor = true;
    }
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** 操作を受け付けられる状態か（ロック中・カーソル操作・タッチ） */
  get active(): boolean {
    return this.locked || this.freeCursor;
  }

  down(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  /** このフレームで押されたキー（UIが開いていても判定できる） */
  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  /** 移動入力（キーボード + スティック） */
  moveAxes(): { x: number; y: number; run: boolean } {
    let x = this.stickX;
    let y = this.stickY;
    if (this.down('KeyW')) y += 1;
    if (this.down('KeyS')) y -= 1;
    if (this.down('KeyD')) x += 1;
    if (this.down('KeyA')) x -= 1;
    const run = this.stickRun || this.down('ShiftLeft') || this.down('ShiftRight');
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), run };
  }

  /** カーソル操作時の視点回転量（画面端ほど速い） */
  cursorLook(dt: number): { dx: number; dy: number } {
    if (!this.freeCursor || this.locked) return { dx: 0, dy: 0 };
    const f = (v: number) => {
      const a = Math.abs(v);
      return a < 0.35 ? 0 : Math.sign(v) * ((a - 0.35) / 0.65) ** 2;
    };
    return { dx: f(this.cursorX) * dt * 900, dy: f(this.cursorY) * dt * 500 };
  }

  vibrate(pattern: number | number[]): void {
    if (!this.touch) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* 対応していない端末 */
    }
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
    this.leftPressed = this.leftReleased = this.rightPressed = false;
    this.touchPressed = false;
  }
}
