/** キーボード・マウス入力（Pointer Lock 前提） */
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
  /** 自動テスト用：Pointer Lock なしでもロック中として扱う */
  forceLocked = false;
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
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    el.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.left = true;
        this.leftPressed = true;
      } else if (e.button === 2) {
        this.right = true;
        this.rightPressed = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        if (this.left) this.leftReleased = true;
        this.left = false;
      } else if (e.button === 2) this.right = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = this.forceLocked || document.pointerLockElement === this.el;
      if (!this.locked) this.left = this.right = false;
    });
  }

  lock(): void {
    if (this.forceLocked) {
      this.locked = true;
      return;
    }
    if (!this.locked) this.el.requestPointerLock?.();
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  /** このフレームで押されたキー（UIが開いていても判定できる） */
  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
    this.leftPressed = this.leftReleased = this.rightPressed = false;
  }
}
