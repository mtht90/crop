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
      this.look(e.movementX, e.movementY, 0.0022);
    });
  }

  /** Touch controller state, merged into each sampled intent. */
  readonly touch = {
    moveX: 0,
    moveZ: 0,
    attack: false,
    guard: false,
    jump: false,
    pressed: new Set<'attack' | 'jump' | 'dash' | 'skill' | 'ult' | 'reload'>(),
  };

  /** Applies a look delta in pixels (mouse or touch drag). */
  look(dx: number, dy: number, radPerPx: number) {
    if (!this.enabled) return;
    const s = radPerPx * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch - dy * s, -1.2, 1.2);
    this.swayX += dx;
    this.swayY += dy;
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
    const t = this.touch;
    if (!this.enabled) {
      this.pressed.clear();
      t.pressed.clear();
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
    i.jump = k.has('Space');
    i.dashPressed = p.has('ShiftLeft') || p.has('ShiftRight');
    i.skillPressed = p.has('KeyE');
    i.ultPressed = p.has('KeyQ');
    i.reloadPressed = p.has('KeyR');
    p.clear();
    // Touch controls add on top of keyboard/mouse.
    if (Math.hypot(t.moveX, t.moveZ) > Math.hypot(i.moveX, i.moveZ)) {
      i.moveX = t.moveX;
      i.moveZ = t.moveZ;
    }
    i.attack ||= t.attack;
    i.guard ||= t.guard;
    i.jump ||= t.jump;
    i.attackPressed ||= t.pressed.has('attack');
    i.jumpPressed ||= t.pressed.has('jump');
    i.dashPressed ||= t.pressed.has('dash');
    i.skillPressed ||= t.pressed.has('skill');
    i.ultPressed ||= t.pressed.has('ult');
    i.reloadPressed ||= t.pressed.has('reload');
    t.pressed.clear();
    return i;
  }

  consumeSway() {
    const s = { x: this.swayX, y: this.swayY };
    this.swayX = 0;
    this.swayY = 0;
    return s;
  }
}
