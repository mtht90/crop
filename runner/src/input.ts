export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  rightDown = false;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 2) { this.rightDown = true; this.pressed.add('Mouse2'); }
      if (e.button === 0) this.pressed.add('Mouse0');
    });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.rightDown = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      this.onLockChange(this.locked);
    });
  }

  lock() { this.el.requestPointerLock?.(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(...codes: string[]) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes: string[]) { return codes.some((c) => this.pressed.has(c)); }

  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; }

  get strafe() { return (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0); }
  get slide() { return this.down('ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft', 'KeyS', 'ArrowDown'); }
  get jumpHeld() { return this.down('Space', 'KeyW', 'ArrowUp'); }
}
