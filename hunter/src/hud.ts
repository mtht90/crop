import * as THREE from 'three';
import { CORES, WEAPONS, type CoreId } from './data';
import type { Weapons } from './weapons';
import type { Player } from './player';
import type { Boss } from './boss';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class HUD {
  root = $('hud');
  hp = $('hp-fill');
  hpLag = $('hp-lag');
  st = $('st-fill');
  status = $('status');
  ammo = $('ammo');
  wname = $('wname');
  chamber = $('chamber');
  slots = $('slots');
  pouch = $('pouch');
  prompt = $('prompt');
  log = $('log');
  hit = $('hitmark');
  vignette = $('vignette');
  bossBar = $('bossbar');
  bossName = $('boss-name');
  bossFill = $('boss-fill');
  bossLag = $('boss-lag');
  bossParts = $('boss-parts');
  charge = $('charge');
  chargeFill = $('charge-fill');
  dmgLayer = $('dmgnums');
  banner = $('banner');
  objective = $('objective');
  hitT = 0;
  lagHp = 1;
  lagBoss = 1;
  bannerT = 0;

  show(on: boolean) {
    this.root.style.display = on ? 'block' : 'none';
  }

  message(text: string, cls = '') {
    const d = document.createElement('div');
    d.className = 'logline ' + cls;
    d.innerHTML = text;
    this.log.prepend(d);
    while (this.log.children.length > 6) this.log.lastChild?.remove();
    setTimeout(() => d.classList.add('fade'), 4200);
    setTimeout(() => d.remove(), 5200);
  }

  showBanner(text: string, sub = '', time = 3) {
    this.banner.innerHTML = `<div class="b-main">${text}</div><div class="b-sub">${sub}</div>`;
    this.banner.classList.add('on');
    this.bannerT = time;
  }

  hitMarker(kind: 'body' | 'weak' | 'part' | 'armor' | 'immune', killed: boolean) {
    this.hit.className = 'on ' + kind + (killed ? ' kill' : '');
    this.hitT = killed ? 0.35 : 0.16;
  }

  damageNumber(world: THREE.Vector3, cam: THREE.Camera, n: number, kind: string) {
    const v = world.clone().project(cam);
    if (v.z > 1) return;
    const d = document.createElement('div');
    d.className = 'dmg ' + kind;
    d.textContent = Math.max(1, Math.round(n)).toString();
    const x = (v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 30;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight - 20;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    this.dmgLayer.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }

  update(dt: number, p: Player, w: Weapons, pouch: CoreId[], pouchSel: number, boss: Boss | null) {
    const hpR = p.hp / p.maxHp;
    this.hp.style.width = hpR * 100 + '%';
    this.lagHp = Math.max(hpR, this.lagHp - dt * 0.4);
    this.hpLag.style.width = this.lagHp * 100 + '%';
    this.st.style.width = (p.stamina / p.maxStamina) * 100 + '%';
    const s: string[] = [];
    if (p.poison > 0) s.push('<span class="st-poison">毒</span>');
    if (p.slow > 0) s.push('<span class="st-slow">粘糸</span>');
    this.status.innerHTML = s.join('');

    const cur = w.cur;
    const def = WEAPONS[cur.id];
    this.wname.textContent = def.name;
    if (def.id === 'bow') this.ammo.innerHTML = cur.ammo > 0 ? '<b>矢</b> 番え済' : '<b>矢</b> 番え中…';
    else this.ammo.innerHTML = `<b>${cur.ammo}</b> / ${cur.mag}`;
    if (w.devourT > 0) {
      this.chamber.innerHTML = `<span class="devouring">喰炉 起動中…</span>`;
    } else if (cur.chamber) {
      const c = CORES[cur.chamber.core];
      this.chamber.innerHTML = `<span class="core-dot" style="background:#${c.color.toString(16).padStart(6, '0')}"></span>${c.ammo} <b>${cur.chamber.rounds}</b>`;
    } else this.chamber.innerHTML = '<span class="dim">喰炉：空（通常弾）</span>';
    this.slots.innerHTML = w.loadout
      .map((l, i) => `<span class="slot ${i === w.idx ? 'sel' : ''}">${i + 1} ${WEAPONS[l.id].name}${l.chamber ? ` <i style="color:#${CORES[l.chamber.core].color.toString(16).padStart(6, '0')}">◆</i>` : ''}</span>`)
      .join('');
    // 魔核ポーチ
    let ph = '';
    for (let i = 0; i < 3; i++) {
      const c = pouch[i];
      if (c) {
        const cd = CORES[c];
        ph += `<div class="pslot ${i === pouchSel ? 'sel' : ''}"><span class="core-dot" style="background:#${cd.color.toString(16).padStart(6, '0')}"></span>${cd.name}<small>→${cd.ammo}</small></div>`;
      } else ph += `<div class="pslot empty">―</div>`;
    }
    this.pouch.innerHTML = ph;

    // 弓のため
    if (def.id === 'bow' && w.drawing) {
      this.charge.style.display = 'block';
      this.chargeFill.style.width = w.charge * 100 + '%';
      this.chargeFill.classList.toggle('full', w.charge >= 1);
    } else this.charge.style.display = 'none';

    this.hitT -= dt;
    if (this.hitT <= 0) this.hit.className = '';

    this.vignette.style.opacity = String(Math.min(1, p.hurtFlash + (hpR < 0.3 ? 0.35 + Math.sin(performance.now() / 200) * 0.1 : 0)));
    this.vignette.classList.toggle('poison', p.poison > 0);

    if (boss && boss.started && boss.alive) {
      this.bossBar.style.display = 'block';
      this.bossName.textContent = boss.displayName + (boss.enraged ? '（激昂）' : '');
      const r = boss.hp / boss.maxHp;
      this.bossFill.style.width = r * 100 + '%';
      this.lagBoss = Math.max(r, this.lagBoss - dt * 0.25);
      this.bossLag.style.width = this.lagBoss * 100 + '%';
      this.bossParts.innerHTML = boss.parts
        .map((pt) => `<span class="bpart ${pt.broken ? 'broken' : ''}">${pt.def.name}${pt.broken ? ' 破壊' : `<i style="width:${(pt.hp / pt.def.hp) * 100}%"></i>`}</span>`)
        .join('');
    } else this.bossBar.style.display = 'none';

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('on');
    }
  }

  setPrompt(text: string | null) {
    this.prompt.style.display = text ? 'block' : 'none';
    if (text) this.prompt.innerHTML = text;
  }
  setObjective(text: string) {
    this.objective.innerHTML = text;
  }
}
