import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { audio } from './audio/audio';
import { characters } from './characters';
import { Fighter } from './combat/fighter';
import { phaseOf } from './combat/phase';
import { emptyIntent, TICK, type Intent } from './combat/types';
import { CombatWorld } from './combat/world';
import { BODY_HEIGHT, BODY_RADIUS } from './config';
import { GameView } from './render/view';

/**
 * Development tool (?viewer): plays every move on a training dummy with
 * slow motion, frame stepping and hitbox display, using the real combat code.
 */
export class AnimViewer {
  private view: GameView;
  private controls: OrbitControls;
  private world!: CombatWorld;
  private subject!: Fighter;
  private dummy!: Fighter;
  private charId = 'blaze';
  private speed = Number(new URLSearchParams(location.search).get('speed') ?? 1);
  private paused = false;
  private stepOnce = false;
  private loopAction: string | null = null;
  private showHitboxes = !new URLSearchParams(location.search).has('nohit');
  private dummyGuard = false;
  private pending: Partial<Intent> = {};
  private acc = 0;
  private last = performance.now();
  private debug = new THREE.Group();
  private info: HTMLDivElement;
  private panel: HTMLDivElement;

  constructor(root: HTMLElement) {
    // Handle for automated frame-exact captures.
    (window as unknown as { __viewer: AnimViewer }).__viewer = this;
    this.view = new GameView(root);
    this.view.freeCamera = true;
    this.view.scene.add(this.debug);
    this.view.camera.position.set(2.8, 1.7, 1.6);
    this.controls = new OrbitControls(this.view.camera, this.view.renderer.domElement);
    this.controls.target.set(0, 1, -1.1);
    const qs = new URLSearchParams(location.search);
    const cam = qs.get('cam')?.split(',').map(Number);
    if (cam?.length === 3) this.view.camera.position.set(cam[0], cam[1], cam[2]);
    this.controls.update();

    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    Object.assign(this.panel.style, { position: 'fixed', left: '12px', top: '12px', maxWidth: '420px', fontSize: '14px', pointerEvents: 'auto' });
    root.appendChild(this.panel);
    this.info = document.createElement('div');
    this.info.className = 'panel';
    Object.assign(this.info.style, { position: 'fixed', right: '12px', top: '12px', fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre', pointerEvents: 'none' });
    root.appendChild(this.info);
    if (qs.has('clean')) this.panel.style.display = this.info.style.display = 'none';

    window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.paused = !this.paused;
        this.renderPanel();
      }
      if (e.code === 'Period') this.stepOnce = true;
    });
    this.setup();
    requestAnimationFrame((t) => this.frame(t));
  }

  private setup() {
    const def = characters[this.charId];
    const other = characters[this.charId === 'blaze' ? 'star' : 'blaze'];
    this.subject = new Fighter(def, 0);
    this.dummy = new Fighter(other, 1);
    this.world = new CombatWorld(this.subject, this.dummy);
    this.subject.reset(0, 0, 0);
    this.dummy.reset(0, -Number(new URLSearchParams(location.search).get('dummy') ?? 2.2), Math.PI);
    this.subject.setState('free');
    this.dummy.setState('free');
    this.view.bind(this.world, null);
    this.renderPanel();
  }

  private renderPanel() {
    const def = this.subject.def;
    const btn = (label: string, act: string, on = false) => `<button class="btn ${on ? 'on' : ''}" style="font-size:13px;padding:4px 10px;border-width:3px" data-act="${act}">${label}</button>`;
    this.panel.innerHTML = `
      <h3>アニメーションビューア</h3>
      <div class="row" style="justify-content:flex-start">${Object.keys(characters).map((id) => btn(characters[id].name, `char:${id}`, id === this.charId)).join('')}</div>
      <p>技（ループ: ${this.loopAction ?? 'なし'}）</p>
      <div class="row" style="justify-content:flex-start">${Object.keys(def.actions).map((id) => btn(id, `act:${id}`, this.loopAction === id)).join('')}</div>
      <p>動作</p>
      <div class="row" style="justify-content:flex-start">
        ${btn('ダッシュ', 'dash')}${btn('ジャンプ', 'jump')}${btn('被弾(弱)', 'hit:light')}${btn('被弾(強)', 'hit:heavy')}${btn('ガードさせる', 'guarded')}${btn('ガード維持', 'guardhold', this.dummyGuard)}
      </div>
      <p>再生</p>
      <div class="row" style="justify-content:flex-start">
        ${btn(this.paused ? '▶ 再生 (Space)' : '❚❚ 停止 (Space)', 'pause')}${btn('コマ送り (.)', 'step')}${btn('当たり判定', 'hitbox', this.showHitboxes)}${btn('ループ解除', 'noloop')}
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:800">速度 <input type="range" min="0.05" max="1" step="0.05" value="${this.speed}" data-k="speed"> ${this.speed.toFixed(2)}x</label>
      <p style="font-size:12px">ドラッグで回転・ホイールでズーム。ダミーは技の相手として立っています。</p>`;
    this.panel.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => b.addEventListener('click', () => this.onAct(b.dataset.act!)));
    this.panel.querySelector<HTMLInputElement>('[data-k="speed"]')!.addEventListener('input', (e) => {
      this.speed = Number((e.target as HTMLInputElement).value);
      this.renderPanel();
    });
  }

  private onAct(a: string) {
    audio.unlock();
    const [k, v] = a.split(':');
    switch (k) {
      case 'char':
        this.charId = v;
        this.loopAction = null;
        this.setup();
        return;
      case 'act':
        this.loopAction = v;
        this.trigger(v);
        break;
      case 'noloop':
        this.loopAction = null;
        break;
      case 'dash':
        this.pending.dashPressed = true;
        this.pending.moveX = 1;
        break;
      case 'jump':
        this.pending.jumpPressed = true;
        break;
      case 'hit': {
        const heavy = v === 'heavy';
        this.world.applyHit(
          this.dummy,
          this.subject,
          { damage: 0, knockback: heavy ? 12 : 3, knockUp: heavy ? 8 : 1, hitstun: 18, hitstop: heavy ? 8 : 4, heavy },
          new THREE.Vector3(0, 0, 1),
          this.subject.eye.add(new THREE.Vector3(0, -0.3, -0.4)),
          false,
        );
        break;
      }
      case 'guarded':
        this.dummy.guarding = true;
        this.world.applyHit(this.subject, this.dummy, { damage: 0, knockback: 4, knockUp: 0, hitstun: 10, hitstop: 4, guardDamage: 10 }, new THREE.Vector3(0, 0, -1), this.dummy.eye.add(new THREE.Vector3(0, -0.3, 0.4)), false);
        break;
      case 'guardhold':
        this.dummyGuard = !this.dummyGuard;
        break;
      case 'pause':
        this.paused = !this.paused;
        break;
      case 'step':
        this.paused = true;
        this.stepOnce = true;
        break;
      case 'hitbox':
        this.showHitboxes = !this.showHitboxes;
        break;
    }
    this.renderPanel();
  }

  private trigger(id: string) {
    const f = this.subject;
    if (f.state !== 'free') return;
    f.ult = 100;
    f.skillCd = 0;
    if (f.def.ammo) f.ammo = f.def.ammo;
    f.startAction(id);
  }

  private tick() {
    const s = this.subject;
    const d = this.dummy;
    // Keep the dummy standing in front, fully healed.
    if (d.state === 'free' && d.pos.distanceTo(new THREE.Vector3(0, 0, -2.2)) > 0.05 && Math.hypot(d.vel.x, d.vel.z) < 0.5) d.pos.lerp(new THREE.Vector3(0, 0, -2.2), 0.05);
    d.hp = d.def.maxHp;
    s.hp = s.def.maxHp;
    if (s.pos.y < -2 || Math.hypot(s.pos.x, s.pos.z) > 12) s.reset(0, 0, 0), s.setState('free');
    if (d.state === 'ringout') d.reset(0, -2.2, Math.PI), d.setState('free');
    if (this.loopAction && s.state === 'free' && s.grounded) this.trigger(this.loopAction);

    const si: Intent = { ...emptyIntent(), yaw: 0, pitch: 0, ...this.pending };
    this.pending = {};
    const di: Intent = { ...emptyIntent(), yaw: Math.PI, guard: this.dummyGuard };
    this.world.step([si, di]);
    this.view.handleEvents(this.world.drainEvents());
  }

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    let simDt = 0;
    if (!this.paused) {
      this.acc += dt * this.speed;
      while (this.acc >= TICK) {
        this.acc -= TICK;
        this.tick();
        simDt += TICK;
      }
    } else if (this.stepOnce) {
      this.stepOnce = false;
      this.tick();
      simDt = TICK;
    }
    this.controls.update();
    this.view.render(this.paused ? simDt : dt * this.speed, this.paused ? 1 : this.acc / TICK, { yaw: 0, pitch: 0 }, { x: 0, y: 0 }, false);
    this.drawDebug();
    requestAnimationFrame((t) => this.frame(t));
  }

  private drawDebug() {
    this.debug.clear();
    const s = this.subject;
    const a = s.action;
    let text = `state  : ${s.state} (${s.stateT})\n`;
    if (a) {
      const ph = phaseOf(a.def, a.frame);
      text += `action : ${a.def.id}\nframe  : ${a.frame} / ${a.def.total}\nstage  : ${ph.stage} ${(ph.t * 100).toFixed(0)}%\nactive : ${ph.firstActive}-${ph.lastActive}`;
    }
    text += `\nhitstop: ${this.world.hitstop}`;
    this.info.textContent = text;
    if (!this.showHitboxes) return;
    const red = new THREE.MeshBasicMaterial({ color: 0xff2244, wireframe: true });
    for (const h of this.world.debugHitSpheres) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(h.radius, 12, 8), red);
      m.position.copy(h.pos);
      this.debug.add(m);
    }
    const green = new THREE.MeshBasicMaterial({ color: 0x22ff88, wireframe: true });
    for (const f of this.world.fighters) {
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(BODY_RADIUS, BODY_HEIGHT - BODY_RADIUS * 2, 4, 10), f.isInvulnerable() ? new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true }) : green);
      c.position.set(f.pos.x, f.pos.y + BODY_HEIGHT / 2, f.pos.z);
      this.debug.add(c);
    }
  }
}
