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
      if (!this.locked || this.touch) return;
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

  /** On-screen buttons for touch devices (iPad / phones) */
  touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  setupTouch(root: HTMLElement) {
    if (!this.touch) return;
    const mk = (label: string, code: string, cls: string) => {
      const b = document.createElement('button');
      b.className = 'tbtn ' + cls; b.textContent = label;
      const down = (e: Event) => { e.preventDefault(); this.keys.add(code); this.pressed.add(code); b.classList.add('on'); };
      const up = (e: Event) => { e.preventDefault(); this.keys.delete(code); b.classList.remove('on'); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      root.appendChild(b);
    };
    mk('◀', 'KeyA', 'tl'); mk('▶', 'KeyD', 'tr2');
    mk('JUMP', 'Space', 'tj'); mk('SLIDE', 'ShiftLeft', 'ts'); mk('OD', 'KeyE', 'to');
    // drag anywhere else to look around
    let last: { x: number; y: number } | null = null;
    root.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).classList.contains('tbtn')) return; last = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointermove', (e) => { if (!last) return; this.mouseDX += (e.clientX - last.x) * 1.5; this.mouseDY += (e.clientY - last.y) * 1.5; last = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointerup', () => { last = null; });
    root.classList.add('touch');
  }

  lock() {
    if (this.touch) return; // no pointer lock on tablets/phones
    try { const r: any = (this.el as any).requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch { /* not allowed in this frame */ }
  }
  unlock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ } }

  down(...codes: string[]) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes: string[]) { return codes.some((c) => this.pressed.has(c)); }

  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; }

  get strafe() { return (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0); }
  get slide() { return this.down('ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft', 'KeyS', 'ArrowDown'); }
  get jumpHeld() { return this.down('Space', 'KeyW', 'ArrowUp'); }
}
