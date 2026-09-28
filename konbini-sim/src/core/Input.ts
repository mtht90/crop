/**
 * Keyboard / mouse state with pointer-lock handling.
 * `pressed` sets are cleared at the end of each frame by `endFrame()`.
 */
export class Input {
  private down = new Set<string>();
  private pressedKeys = new Set<string>();
  private mousePressed = new Set<number>();
  private mouseDown = new Set<number>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  /** Cursor position in normalised device coords (for UI-mode picking). */
  ndcX = 0;
  ndcY = 0;
  locked = false;
  /** Pointer lock refused (embedded frames, some browsers): right-drag to look instead. */
  lockFailed = false;
  /** When false, gameplay ignores keys (e.g. while typing in a modal). */
  enabled = true;
  sensitivity = 1;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.down.add(e.code);
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      if (this.locked || (this.lockFailed && e.buttons & 2)) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
      this.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mousePressed.add(e.button);
      this.mouseDown.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseDown.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  lock(): void {
    if (!this.locked) {
      try {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => undefined);
      } catch {
        this.lockFailed = true;
      }
    }
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  pressed(code: string): boolean {
    return this.enabled && this.pressedKeys.has(code);
  }

  /** Raw pressed check that ignores `enabled` (for Esc / menu toggles). */
  pressedRaw(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  mouse(button: number): boolean {
    return this.enabled && this.mousePressed.has(button);
  }

  mouseHeld(button: number): boolean {
    return this.enabled && this.mouseDown.has(button);
  }

  /** Simulate input from automated tests. */
  inject(code: string): void {
    this.pressedKeys.add(code);
  }
  injectMouse(button: number): void {
    this.mousePressed.add(button);
  }

  /** Forget key presses of this frame (after closing a menu with the same key). */
  clearPressed(): void {
    this.pressedKeys.clear();
    this.mousePressed.clear();
  }

  endFrame(): void {
    this.pressedKeys.clear();
    this.mousePressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
