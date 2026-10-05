import type { Fighter } from '../combat/fighter';
import { STAMINA_MAX, ULT_MAX } from '../config';
import type { PlayerInput } from '../core/input';

/** Look sensitivity for touch drags (radians per CSS pixel, before the user multiplier). */
const TOUCH_LOOK = 0.0055;
const STICK_RADIUS = 56;

type Btn = 'attack' | 'jump' | 'dash' | 'guard' | 'skill' | 'ult' | 'reload';

/**
 * On-screen controller in the spirit of Brawl Stars: a floating move stick on
 * the left, a big attack button on the right that also aims while dragged,
 * plus super/skill/jump/dash/guard buttons. Dragging anywhere else on the right
 * half looks around. Turns on automatically on touch devices or at the first touch.
 */
export class TouchControls {
  active = false;
  private root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookIds = new Map<number, { x: number; y: number }>();
  private buttons = {} as Record<Btn, HTMLDivElement>;
  private visible = false;

  constructor(
    container: HTMLElement,
    private input: PlayerInput,
    private onPause: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'touch-ui';
    this.root.hidden = true;
    container.appendChild(this.root);

    const left = this.zone('touch-left');
    const right = this.zone('touch-right');
    this.stickBase = this.div('stick-base', this.root);
    this.stickKnob = this.div('stick-knob', this.stickBase);
    this.stickBase.hidden = true;

    // Move stick: appears where the thumb lands.
    left.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      left.setPointerCapture(e.pointerId);
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickBase.hidden = false;
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
      this.moveStick(e.clientX, e.clientY);
    });
    left.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.stickBase.hidden = true;
      this.input.touch.moveX = 0;
      this.input.touch.moveZ = 0;
    };
    left.addEventListener('pointerup', endStick);
    left.addEventListener('pointercancel', endStick);

    // Free look on the right half.
    this.dragLook(right);

    const mk = (id: Btn, label: string, hold: boolean) => {
      const b = this.div(`tbtn tbtn-${id}`, this.root, `<span>${label}</span>`);
      this.buttons[id] = b;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        b.classList.add('down');
        const t = this.input.touch;
        if (id === 'attack') {
          t.attack = true;
          t.pressed.add('attack');
        } else if (id === 'guard') t.guard = true;
        else t.pressed.add(id);
        if (id === 'jump') t.jump = true;
        if (hold) this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
      });
      const up = (e: PointerEvent) => {
        b.classList.remove('down');
        if (id === 'attack') this.input.touch.attack = false;
        if (id === 'guard') this.input.touch.guard = false;
        if (id === 'jump') this.input.touch.jump = false;
        this.lookIds.delete(e.pointerId);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      // Attack / super double as aim sticks while held (drag to aim).
      if (hold) b.addEventListener('pointermove', (e) => this.lookMove(e));
    };
    mk('attack', '攻撃', true);
    mk('ult', '必殺', true);
    mk('skill', 'スキル', false);
    mk('jump', 'ジャンプ', false);
    mk('dash', 'ダッシュ', false);
    mk('guard', 'ガード', false);
    mk('reload', 'R', false);
    const pause = this.div('tbtn-pause', this.root, 'II');
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onPause();
    });
    this.div('rotate-hint', container, '<div>横向きにすると遊びやすくなります</div>');

    // Auto-detect: coarse pointer, or the first real touch anywhere.
    if (window.matchMedia?.('(pointer: coarse)').matches) this.setActive(true);
    window.addEventListener('touchstart', () => this.setActive(true), { passive: true });
  }

  private div(cls: string, parent: HTMLElement, html = '') {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    parent.appendChild(d);
    return d;
  }

  private zone(cls: string) {
    return this.div(`touch-zone ${cls}`, this.root);
  }

  private dragLook(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('pointermove', (e) => this.lookMove(e));
    const end = (e: PointerEvent) => this.lookIds.delete(e.pointerId);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private lookMove(e: PointerEvent) {
    const last = this.lookIds.get(e.pointerId);
    if (!last) return;
    this.input.look(e.clientX - last.x, e.clientY - last.y, TOUCH_LOOK);
    last.x = e.clientX;
    last.y = e.clientY;
  }

  private moveStick(x: number, y: number) {
    let dx = x - this.stickOrigin.x;
    let dy = y - this.stickOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      dx = (dx / d) * STICK_RADIUS;
      dy = (dy / d) * STICK_RADIUS;
    }
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.min(1, d / STICK_RADIUS);
    const dead = k < 0.15 ? 0 : 1;
    this.input.touch.moveX = (dx / STICK_RADIUS) * dead;
    this.input.touch.moveZ = (-dy / STICK_RADIUS) * dead;
  }

  setActive(v: boolean) {
    if (this.active === v) return;
    this.active = v;
    document.body.classList.toggle('touch', v);
    this.root.hidden = !(v && this.visible);
  }

  show(v: boolean) {
    this.visible = v;
    this.root.hidden = !(v && this.active);
    if (!v) {
      const t = this.input.touch;
      t.moveX = t.moveZ = 0;
      t.attack = t.guard = t.jump = false;
      this.stickId = null;
      this.stickBase.hidden = true;
      this.lookIds.clear();
    }
  }

  /** Reflects meters on the buttons (super charge, skill cooldown, dashes, ammo). */
  update(f: Fighter) {
    if (this.root.hidden) return;
    const b = this.buttons;
    const ult = f.ult / ULT_MAX;
    b.ult.style.setProperty('--v', String(ult));
    b.ult.classList.toggle('ready', ult >= 1);
    b.skill.style.setProperty('--v', String(1 - f.skillCd / f.def.skillCooldown));
    b.skill.classList.toggle('ready', f.skillCd === 0);
    b.dash.dataset.pips = '●'.repeat(f.stamina) + '○'.repeat(STAMINA_MAX - f.stamina);
    b.reload.hidden = !f.def.ammo;
    b.attack.dataset.ammo = f.def.ammo ? (f.reloadT > 0 ? '…' : String(f.ammo)) : '';
    b.attack.style.setProperty('--el', `#${f.def.element.color.toString(16).padStart(6, '0')}`);
  }
}
