/**
 * キーボード / マウス(Pointer Lock) / タッチ(nipplejs + ドラッグ) / Gamepad API を統合
 */
export class Input {
  constructor(canvas, { touch }) {
    this.canvas = canvas;
    this.touch = touch;
    this.move = { x: 0, y: 0 };
    this.lookAcc = { x: 0, y: 0, zoom: 0 };
    this.jumpHeld = false; this._jumpEdge = false;
    this.sprint = false; this.sprintToggle = false;
    this.keys = new Set();
    this.mouseSens = 1; this.touchSens = 1;
    this.enabled = false;
    this.onPause = null; this.onRespawn = null;
    this.joy = { x: 0, y: 0, mag: 0 };
    this.pad = null; this._padPrev = [];

    addEventListener('keydown', (e) => {
      if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'Space') { this._jumpEdge = true; e.preventDefault(); }
      if (e.code === 'KeyP' || e.code === 'Escape') this.onPause?.();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // マウス
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.lookAcc.x += e.movementX * 0.0022 * this.mouseSens;
        this.lookAcc.y += e.movementY * 0.0022 * this.mouseSens;
      }
    });
    canvas.addEventListener('wheel', (e) => { this.lookAcc.zoom += Math.sign(e.deltaY) * 0.6; }, { passive: true });

    if (touch) this.setupTouch();
    addEventListener('gamepadconnected', (e) => { this.pad = e.gamepad.index; this.onGamepad?.(e.gamepad.id); });
  }

  lockPointer() {
    if (this.touch || document.pointerLockElement === this.canvas) return;
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      p?.catch?.(() => this.canvas.requestPointerLock?.());
    } catch { /* ignore */ }
  }
  unlockPointer() { if (document.pointerLockElement) document.exitPointerLock?.(); }

  setupTouch() {
    const zone = document.getElementById('joyZone');
    const make = () => {
      if (!window.nipplejs) return;
      const m = window.nipplejs.create({ zone, mode: 'dynamic', color: 'rgba(255,255,255,.85)', size: 130, threshold: 0.05, fadeTime: 120, restOpacity: 0.5 });
      m.on('move', (_, d) => {
        const mag = Math.min(1, d.distance / 65);
        this.joy.x = d.vector.x * mag; this.joy.y = d.vector.y * mag; this.joy.mag = mag;
      });
      m.on('end', () => { this.joy.x = this.joy.y = this.joy.mag = 0; });
    };
    if (window.nipplejs) make(); else addEventListener('load', make);

    // 右側ドラッグで視点
    const look = document.getElementById('lookZone');
    const ptrs = new Map();
    look.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); look.setPointerCapture(e.pointerId); });
    look.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      this.lookAcc.x += (e.clientX - p[0]) * 0.0055 * this.touchSens;
      this.lookAcc.y += (e.clientY - p[1]) * 0.0055 * this.touchSens;
      p[0] = e.clientX; p[1] = e.clientY;
    });
    const up = (e) => ptrs.delete(e.pointerId);
    look.addEventListener('pointerup', up); look.addEventListener('pointercancel', up);

    const jump = document.getElementById('tJump');
    jump.addEventListener('pointerdown', (e) => { e.preventDefault(); this._jumpEdge = true; this.jumpHeld = true; jump.setPointerCapture(e.pointerId); });
    const jUp = () => { this.jumpHeld = false; };
    jump.addEventListener('pointerup', jUp); jump.addEventListener('pointercancel', jUp);

    const sprint = document.getElementById('tSprint');
    sprint.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sprintToggle = !this.sprintToggle;
      sprint.classList.toggle('on', this.sprintToggle);
    });
  }

  rumble(strong = 0.5, weak = 0.5, duration = 120) {
    try {
      if (this.touch && navigator.vibrate) navigator.vibrate(Math.round(duration * 0.5));
      const gp = this.pad != null ? navigator.getGamepads?.()[this.pad] : null;
      gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration, strongMagnitude: strong, weakMagnitude: weak });
    } catch { /* ignore */ }
  }

  /** 毎フレーム呼ぶ：状態をまとめて返す（エッジ入力は消費） */
  poll(dt) {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    let jumpHeld = k.has('Space') || this.jumpHeld;
    let jump = this._jumpEdge;
    const look = { x: this.lookAcc.x, y: this.lookAcc.y, zoom: this.lookAcc.zoom };

    if (this.joy.mag > 0) {
      x = this.joy.x; y = this.joy.y;
      if (this.joy.mag > 0.93) sprint = true;
    }
    if (this.sprintToggle) sprint = true;

    // Gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = this.pad != null ? pads[this.pad] : [...pads].find(Boolean);
    if (gp) {
      this.pad = gp.index;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
      if (lx || ly) { x = lx; y = -ly; }
      look.x += dz(gp.axes[2] || 0) * 2.6 * dt * this.mouseSens;
      look.y += dz(gp.axes[3] || 0) * 2.0 * dt * this.mouseSens;
      const b = (i) => !!gp.buttons[i]?.pressed;
      if (b(0)) jumpHeld = true;
      if (b(0) && !this._padPrev[0]) jump = true;
      if (b(7) || b(4) || b(10)) sprint = true;
      if (this.enabled && b(9) && !this._padPrev[9]) this.onPause?.();
      if (b(12)) look.zoom -= dt * 6;
      if (b(13)) look.zoom += dt * 6;
      this._padPrev = gp.buttons.map((bt) => bt.pressed);
    }

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
    this._jumpEdge = false;
    this.lookAcc.x = this.lookAcc.y = this.lookAcc.zoom = 0;
    if (!this.enabled) return { move: { x: 0, y: 0 }, sprint: false, jumpHeld: false, jumpPressed: false, look: { x: 0, y: 0, zoom: 0 } };
    return { move: { x, y }, sprint, jumpHeld, jumpPressed: jump, look };
  }
}
