import type { CharacterDef } from '../combat/types';
import { getPortrait, paint } from './portraits';
import * as THREE from 'three';
import { GUARD_MAX, ROUNDS_TO_WIN, STAMINA_MAX, ULT_MAX } from '../config';
import type { Fighter } from '../combat/fighter';
import type { Banner, Match } from '../game/match';
import type { ViewFeedback } from '../render/view';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

interface HpUi {
  fill: HTMLDivElement;
  lag: HTMLDivElement;
  pips: HTMLSpanElement[];
  lagV: number;
}

/** DOM overlay: HP bars, timer, meters, banners and screen-space feedback. */
export class Hud {
  readonly root: HTMLDivElement;
  private hp: HpUi[] = [];
  private names: HTMLDivElement[] = [];
  private timer!: HTMLDivElement;
  private ult: HTMLDivElement;
  private ultLabel: HTMLSpanElement;
  private skill: HTMLDivElement;
  private skillCd: HTMLDivElement;
  private ammo: HTMLDivElement;
  private stamina: HTMLDivElement;
  private guard: HTMLDivElement;
  private guardFill: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private foeTag: HTMLDivElement;
  private banner: HTMLDivElement;
  private edge: HTMLDivElement;
  private hurt: HTMLDivElement;
  private speed: HTMLDivElement;
  private flash: HTMLDivElement;
  private bannerTimer = 0;

  constructor(container: HTMLElement) {
    this.edge = el('div', 'layer edge-warn', container);
    this.hurt = el('div', 'layer hurt', container);
    this.speed = el('div', 'layer speedlines', container);
    this.flash = el('div', 'layer flash', container);
    this.root = el('div', 'layer hud hidden', container);
    const top = el('div', 'hud-top', this.root);
    for (let i = 0; i < 2; i++) {
      const box = el('div', `hpbox ${i ? 'right' : ''}`, top);
      const name = el('div', 'nameplate', box);
      this.names.push(name);
      const bar = el('div', 'hpbar', box);
      const lag = el('div', 'lag', bar);
      const fill = el('div', 'fill', bar);
      el('div', 'shine', bar);
      const pipsRow = el('div', 'pips', box);
      const pips = Array.from({ length: ROUNDS_TO_WIN }, () => el('span', 'pip', pipsRow));
      this.hp.push({ fill, lag, pips, lagV: 1 });
      if (i === 0) this.timer = el('div', 'timer', top, '90');
    }
    const bottom = el('div', 'hud-bottom', this.root);
    this.ult = el('div', 'meter-ult', bottom);
    this.ultLabel = el('span', '', this.ult, 'Q');
    this.skill = el('div', 'chip', bottom, '<b>E</b><small>スキル</small>');
    this.skillCd = el('div', 'cd', this.skill);
    const st = el('div', 'chip', bottom, '<small>回避 Shift</small>');
    this.stamina = el('div', 'stamina', st);
    this.ammo = el('div', 'chip', bottom);
    this.guard = el('div', 'guardbar', this.root);
    this.guardFill = el('div', '', this.guard);
    this.crosshair = el('div', 'crosshair', this.root);
    this.foeTag = el('div', 'foe-tag', this.root);
    this.banner = el('div', 'banner', container);
  }

  setup(match: Match) {
    const fs = [match.player, match.cpu];
    fs.forEach((f, i) => {
      const color = hex(f.def.element.color);
      this.names[i].innerHTML = i === 0 ? `<span style="color:${color}">●</span> ${f.def.name}` : `${f.def.name} <small>CPU</small> <span style="color:${color}">●</span>`;
      this.hp[i].lagV = 1;
    });
    this.ult.style.setProperty('--el', hex(match.player.def.element.color));
    this.ammo.style.display = match.player.def.ammo ? '' : 'none';
    this.foeTag.textContent = match.cpu.def.name;
  }

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  setBanner(b: Banner | null) {
    if (!b) {
      this.banner.innerHTML = '';
      this.banner.className = 'banner';
      return;
    }
    this.banner.className = `banner ${b.style}`;
    this.banner.innerHTML = `<div class="main">${b.text}</div>${b.sub ? `<div class="sub">${b.sub}</div>` : ''}`;
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerTimer = b.style === 'count' ? 0.7 : b.style === 'fight' ? 0.9 : 99;
  }

  /** Short popup in the middle of the screen (just guard, etc.). */
  toast(text: string, color = '#6fe8ff') {
    const t = el('div', 'toast-pop', this.root, text);
    t.style.color = color;
    setTimeout(() => t.remove(), 900);
  }

  /** Anime-style super cut-in: a slanted band in the fighter's colors with portrait and move name. */
  cutIn(def: CharacterDef, moveName: string, opponent: boolean) {
    const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
    const c = el('div', `cutin ${opponent ? 'foe' : ''}`, this.root);
    c.style.setProperty('--el', hex(def.element.color));
    c.style.setProperty('--el2', hex(def.element.color2));
    // Letterbox bars, a white flash, then a thin dark strip with the user's eyes and the move name.
    el('div', 'cutin-bar top', c);
    el('div', 'cutin-bar bottom', c);
    el('div', 'cutin-flash', c);
    const band = el('div', 'cutin-band', c);
    const img = document.createElement('canvas');
    img.className = 'cutin-eyes';
    band.appendChild(img);
    paint(img, getPortrait(def.id)?.eyes);
    el('div', 'cutin-lines', band);
    el('div', 'cutin-text', c, `<small>${def.name}</small><b>${moveName}</b>`);
    setTimeout(() => c.remove(), 1300);
  }

  pingHit() {
    this.crosshair.classList.remove('hit');
    void this.crosshair.offsetWidth;
    this.crosshair.classList.add('hit');
  }

  update(dt: number, match: Match, fb: ViewFeedback, camera: THREE.Camera) {
    const fs: Fighter[] = [match.player, match.cpu];
    fs.forEach((f, i) => {
      const ui = this.hp[i];
      const v = Math.max(0, f.hp / f.def.maxHp);
      ui.lagV = ui.lagV > v ? Math.max(v, ui.lagV - dt * 0.45) : v;
      ui.fill.style.transform = `scaleX(${v})`;
      ui.fill.classList.toggle('low', v < 0.3);
      ui.lag.style.transform = `scaleX(${ui.lagV})`;
      ui.pips.forEach((p, k) => p.classList.toggle('on', match.wins[i] > k));
    });
    const secs = Math.max(0, Math.ceil(match.timer / 60));
    this.timer.textContent = String(secs);
    this.timer.classList.toggle('warn', secs <= 10);

    const p = match.player;
    const u = p.ult / ULT_MAX;
    this.ult.style.setProperty('--v', String(u));
    this.ult.classList.toggle('ready', u >= 1);
    this.ultLabel.textContent = u >= 1 ? 'Q!' : `${Math.floor(u * 100)}`;
    const cd = p.skillCd / p.def.skillCooldown;
    this.skillCd.style.height = `${cd * 100}%`;
    this.skill.classList.toggle('ready', cd === 0);
    this.stamina.innerHTML = Array.from({ length: STAMINA_MAX }, (_, i) => `<i class="${i < p.stamina ? '' : 'off'}"></i>`).join('');
    if (p.def.ammo) this.ammo.innerHTML = p.reloadT > 0 ? '<b>RELOAD</b><small>リロード中</small>' : `<b>${p.ammo}/${p.def.ammo}</b><small>R リロード</small>`;
    // Umbrella fighters: the bar shows the canopy's HP while it is open or recovering.
    const canopy = !!p.def.canopy && !p.guarding && (p.reflectActive() || p.canopyHp < 99 || p.canopyBroken > 0);
    const gv = canopy ? p.canopyHp / 100 : p.guardHp / GUARD_MAX;
    this.guard.classList.toggle('show', canopy || p.guarding || p.guardHp < GUARD_MAX - 1);
    this.guard.classList.toggle('canopy', canopy);
    this.guard.classList.toggle('broken', canopy && p.canopyBroken > 0);
    this.guardFill.style.transform = `scaleX(${p.canopyBroken > 0 && canopy ? 1 - p.canopyBroken / (p.def.canopy!.breakFrames || 1) : gv})`;

    // Name tag above the opponent.
    const head = match.cpu.pos.clone();
    head.y += 2.25;
    head.project(camera);
    const vis = head.z < 1 && Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1;
    this.foeTag.style.display = vis ? '' : 'none';
    if (vis) {
      this.foeTag.style.left = `${((head.x + 1) / 2) * window.innerWidth}px`;
      this.foeTag.style.top = `${((1 - head.y) / 2) * window.innerHeight}px`;
    }

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0 && this.banner.innerHTML) this.setBanner(null);
    this.feedback(fb);
  }

  feedback(fb: ViewFeedback) {
    this.edge.style.opacity = String(fb.edgeWarn * (0.75 + Math.sin(performance.now() / 90) * 0.25));
    this.hurt.style.opacity = String(fb.hurt);
    this.speed.style.opacity = String(fb.speed * 0.55);
    this.flash.style.background = fb.flash.color;
    this.flash.style.opacity = String(fb.flash.a);
  }
}
