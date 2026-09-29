/**
 * Keyboard / mouse / touch state.
 * - Desktop (and iPad with a trackpad): pointer lock + WASD.
 * - Touch: an on-screen stick feeds `moveX/moveY`, drags feed the look deltas,
 *   and buttons press virtual keys (see ui/TouchControls).
 * `pressed` sets are cleared at the end of each frame by `endFrame()`.
 */
export class Input {
  private down = new Set<string>();
  private virtualDown = new Set<string>();
  private pressedKeys = new Set<string>();
  private mousePressed = new Set<number>();
  private mouseDown = new Set<number>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  /** Analog movement from the touch stick (-1..1, +y = forward). */
  moveX = 0;
  moveY = 0;
  /** Cursor position in normalised device coords (for UI-mode picking). */
  ndcX = 0;
  ndcY = 0;
  locked = false;
  /** Pointer lock refused (embedded frames, some browsers): right-drag to look instead. */
  lockFailed = false;
  /** True while the last pointer interaction was a finger. */
  touchMode = false;
  /** When true, a tap on the 3D view counts as a left click at that point (register mode). */
  tapClicks = false;
  /** When false, gameplay ignores keys (e.g. while typing in a modal). */
  enabled = true;
  sensitivity = 1;
  private listeners: ((touch: boolean) => void)[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.down.add(e.code);
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.virtualDown.clear();
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked || (this.lockFailed && e.buttons & 2)) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
      this.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    // Pointer events distinguish mouse / pen / touch on iPad and desktop alike.
    canvas.addEventListener('pointerdown', (e) => {
      this.setTouchMode(e.pointerType === 'touch');
      if (e.pointerType === 'touch') return; // touches are handled by TouchControls
      this.mousePressed.add(e.button);
      this.mouseDown.add(e.button);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch') this.mouseDown.delete(e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    // First touch anywhere switches to touch mode (so the title screen tap counts too).
    window.addEventListener('touchstart', () => this.setTouchMode(true), { passive: true });
  }

  onTouchModeChange(fn: (touch: boolean) => void): void {
    this.listeners.push(fn);
  }

  setTouchMode(on: boolean): void {
    if (on === this.touchMode) return;
    this.touchMode = on;
    for (const fn of this.listeners) fn(on);
  }

  lock(): void {
    if (this.touchMode) return;
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
    return this.enabled && (this.down.has(code) || this.virtualDown.has(code));
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
    return this.enabled && (this.mouseDown.has(button) || this.virtualDown.has(`Mouse${button}`));
  }

  // ---- virtual input (touch buttons, tests)

  /** Press a key or mouse button for one frame. Codes: 'KeyE', 'Mouse0' … */
  inject(code: string): void {
    const m = /^Mouse(\d)$/.exec(code);
    if (m) this.mousePressed.add(Number(m[1]));
    else this.pressedKeys.add(code);
  }

  injectMouse(button: number): void {
    this.mousePressed.add(button);
  }

  /** Hold / release a virtual key (e.g. the run button or a long-press). */
  setVirtual(code: string, on: boolean): void {
    if (on) this.virtualDown.add(code);
    else this.virtualDown.delete(code);
  }

  /** A tap on the 3D view (touch) at client coordinates. */
  tap(clientX: number, clientY: number): void {
    this.ndcX = (clientX / window.innerWidth) * 2 - 1;
    this.ndcY = -(clientY / window.innerHeight) * 2 + 1;
    if (this.tapClicks) this.mousePressed.add(0);
  }

  addLook(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
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
