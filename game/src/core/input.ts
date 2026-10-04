import { clamp } from './math';
import { emptyIntent, type Intent } from '../combat/types';

/** Mouse + keyboard input for the human player. */
export class PlayerInput {
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  /** Mouse delta since last render frame (drives viewmodel sway). */
  swayX = 0;
  swayY = 0;
  enabled = false;
  private skipMoves = 0;

  private keys = new Set<string>();
  private mouse = new Set<number>();
  private pressed = new Set<string>();

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.clear();
    });
    element.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouse.add(e.button);
      this.pressed.add(`Mouse${e.button}`);
    });
    window.addEventListener('mouseup', (e) => this.mouse.delete(e.button));
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => (this.skipMoves = 2));
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      // Browsers can report a bogus jump right after acquiring pointer lock.
      if (this.skipMoves > 0 || Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) {
        this.skipMoves = Math.max(0, this.skipMoves - 1);
        return;
      }
      const s = 0.0022 * this.sensitivity;
      this.yaw -= e.movementX * s;
      this.pitch = clamp(this.pitch - e.movementY * s, -1.2, 1.2);
      this.swayX += e.movementX;
      this.swayY += e.movementY;
    });
  }

  get locked() {
    return document.pointerLockElement === this.element;
  }

  requestLock() {
    if (!this.locked) {
      const r = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {});
    }
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }

  setView(yaw: number, pitch: number) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  /** Builds the intent for one simulation tick and consumes edge-triggered presses. */
  sample(): Intent {
    const i = emptyIntent();
    i.yaw = this.yaw;
    i.pitch = this.pitch;
    if (!this.enabled) {
      this.pressed.clear();
      return i;
    }
    const k = this.keys;
    i.moveZ = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    i.moveX = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    i.attack = this.mouse.has(0);
    i.guard = this.mouse.has(2);
    const p = this.pressed;
    i.attackPressed = p.has('Mouse0');
    i.jumpPressed = p.has('Space');
    i.dashPressed = p.has('ShiftLeft') || p.has('ShiftRight');
    i.skillPressed = p.has('KeyE');
    i.ultPressed = p.has('KeyQ');
    i.reloadPressed = p.has('KeyR');
    p.clear();
    return i;
  }

  consumeSway() {
    const s = { x: this.swayX, y: this.swayY };
    this.swayX = 0;
    this.swayY = 0;
    return s;
  }
}
