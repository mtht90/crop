import * as THREE from 'three';
import type { Match, Unit } from './game';
import { HALF_X, HALF_Z, BEACON_RADIUS, SPAWNS } from './stage';
import type { Input } from './input';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
const CSS_TEAM = ['blue', 'red'];
const v = new THREE.Vector3();

export class Hud {
  private plates = new Map<Unit, { root: HTMLElement; bar: HTMLElement }>();
  private labels: HTMLElement[] = [];
  private chips: HTMLElement[] = [];
  private rows = new Map<Unit, { root: HTMLElement; bar: HTMLElement; ult: HTMLElement }>();
  private buttons: { root: HTMLElement; cd: HTMLElement; name: HTMLElement }[] = [];
  private map = ($('minimap') as HTMLCanvasElement).getContext('2d')!;
  private annT = 0; private bannerT = 0; private lastCount = '';
  private w = 1; private h = 1;

  constructor(input: Input) {
    const keys = ['Q', 'E', 'SPACE'];
    ['skill0', 'skill1', 'skill2'].forEach((id, i) => {
      const root = $(id);
      const cd = el('div', 'cd'); const name = el('div', 'sname'); const key = el('div', 'key', keys[i]);
      root.append(cd, name, key);
      root.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.press(i); });
      this.buttons.push({ root, cd, name });
    });
  }

  resize(w: number, h: number) { this.w = w; this.h = h; }

  setup(m: Match) {
    $('plates').innerHTML = ''; $('floats').innerHTML = ''; $('feed').innerHTML = '';
    $('allies').innerHTML = ''; $('enemies').innerHTML = ''; $('beacons').innerHTML = '';
    this.plates.clear(); this.rows.clear(); this.labels = []; this.chips = [];
    for (const u of m.units) {
      const root = el('div', `plate ${CSS_TEAM[u.team]}${u.isPlayer ? ' me' : ''}`);
      const name = el('div', 'pname', u.isPlayer ? 'YOU' : u.name);
      const track = el('div', 'ptrack'); const bar = el('div', 'pbar');
      track.append(bar); root.append(name, track);
      $('plates').append(root);
      this.plates.set(u, { root, bar });

      const row = el('div', `row ${CSS_TEAM[u.team]}`);
      const dot = el('span', 'dot'); dot.style.background = `#${u.def.color.toString(16).padStart(6, '0')}`;
      const rt = el('div', 'rtrack'); const rb = el('div', 'rbar'); rt.append(rb);
      const ult = el('span', 'rult', '★');
      row.append(dot, el('span', `rname${u.isPlayer ? ' me' : ''}`, u.name), rt, ult);
      $(u.team === 0 ? 'allies' : 'enemies').append(row);
      this.rows.set(u, { root: row, bar: rb, ult });
    }
    m.beacons.forEach((_, i) => {
      const l = el('div', 'blabel', 'ABCDE'[i]); $('plates').append(l); this.labels.push(l);
      const c = el('div', 'chip'); c.append(el('div', 'chipfill'), el('span', '', 'ABCDE'[i])); $('beacons').append(c); this.chips.push(c);
    });
    this.cam = m.camera;
    this.buttons.forEach((b, i) => { b.name.textContent = m.skillOf(m.player, i).name; });
    $('announce').className = ''; $('banner').className = ''; $('count').textContent = '';
  }

  private project(p: THREE.Vector3, y: number, cam: THREE.Camera): [number, number, boolean] {
    v.set(p.x, y, p.z).project(cam);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h, v.z < 1];
  }

  update(m: Match) {
    const cam = m.camera, p = m.player;
    // 頭上のHPバー
    for (const [u, pl] of this.plates) {
      const [x, y, front] = this.project(u.pos, 3.05, cam);
      const show = u.alive && front && !(u.team !== p.team && u.stealth > 0);
      pl.root.style.display = show ? '' : 'none';
      if (!show) continue;
      pl.root.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      pl.bar.style.width = `${(u.hp / u.maxHp) * 100}%`;
      pl.root.classList.toggle('stun', u.stun > 0);
    }
    m.beacons.forEach((b, i) => {
      const [x, y, front] = this.project(b.pos, 5.2, cam);
      const l = this.labels[i];
      l.style.display = front ? '' : 'none';
      l.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      const cls = b.owner === -1 ? 'neutral' : CSS_TEAM[b.owner];
      l.className = `blabel ${cls}`;
      const chip = this.chips[i];
      chip.className = `chip ${cls}`;
      const fill = chip.firstElementChild as HTMLElement;
      fill.style.height = `${Math.abs(b.value) * 100}%`;
      fill.className = `chipfill ${b.value >= 0 ? 'blue' : 'red'}`;
    });
    // 上部
    const t = Math.max(0, Math.ceil(m.timeLeft));
    const timer = $('timer');
    timer.textContent = m.overtime ? '延長' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    timer.classList.toggle('hot', m.overtime || t <= 10);
    const c = m.counts();
    $('score-blue').textContent = String(c[0]); $('score-red').textContent = String(c[1]);
    for (const [u, r] of this.rows) {
      r.bar.style.width = `${(u.hp / u.maxHp) * 100}%`;
      r.root.classList.toggle('dead', !u.alive);
      r.ult.classList.toggle('on', u.ult >= 1);
    }
    // スキルボタン
    this.buttons.forEach((b, i) => {
      const k = i < 2 ? Math.max(0, p.cds[i]) / m.skillOf(p, i).cd : 1 - p.ult;
      b.cd.style.height = `${k * 100}%`;
      b.root.classList.toggle('ready', k <= 0 && p.alive);
    });
    $('myhp-bar').style.width = `${(p.hp / p.maxHp) * 100}%`;
    $('myhp-text').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
    const rs = $('respawn');
    rs.style.display = !p.alive && m.state === 'play' ? '' : 'none';
    if (!p.alive) rs.textContent = `やられた！ 復帰まで ${Math.ceil(p.respawn)}`;

    if (this.annT > 0 && (this.annT -= 1 / 60) <= 0) $('announce').classList.remove('show');
    if (this.bannerT > 0 && (this.bannerT -= 1 / 60) <= 0) $('banner').classList.remove('show');
    this.drawMap(m);
  }

  private drawMap(m: Match) {
    const g = this.map, W = g.canvas.width, H = g.canvas.height;
    const sx = (x: number) => ((x + HALF_X) / (HALF_X * 2)) * W, sz = (z: number) => ((z + HALF_Z) / (HALF_Z * 2)) * H;
    const k = W / (HALF_X * 2);
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,14,30,.72)'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(160,170,200,.55)';
    for (const o of m.stage.obstacles) g.fillRect(sx(o.x - o.hx), sz(o.z - o.hz), o.hx * 2 * k, o.hz * 2 * k);
    const col = ['#3d8bff', '#ff4a4a'];
    SPAWNS.forEach((s, i) => { g.globalAlpha = 0.3; g.fillStyle = col[i]; g.beginPath(); g.arc(sx(s.x), sz(s.z), 4.5 * k, 0, 7); g.fill(); g.globalAlpha = 1; });
    for (const b of m.beacons) {
      g.strokeStyle = b.owner === -1 ? '#d8dde8' : col[b.owner]; g.lineWidth = 2;
      g.beginPath(); g.arc(sx(b.pos.x), sz(b.pos.z), BEACON_RADIUS * k, 0, 7); g.stroke();
      g.globalAlpha = 0.6; g.fillStyle = b.value >= 0 ? col[0] : col[1];
      g.beginPath(); g.arc(sx(b.pos.x), sz(b.pos.z), BEACON_RADIUS * k * Math.abs(b.value), 0, 7); g.fill(); g.globalAlpha = 1;
    }
    for (const u of m.units) {
      if (!u.alive || (u.team !== m.player.team && u.stealth > 0)) continue;
      g.fillStyle = col[u.team];
      g.beginPath(); g.arc(sx(u.pos.x), sz(u.pos.z), u.isPlayer ? 4 : 3, 0, 7); g.fill();
      if (u.isPlayer) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
    }
  }

  floatText(pos: THREE.Vector3, text: string, cls: string) {
    const host = $('floats');
    if (host.childElementCount > 40 || !this.cam) return;
    const [x, y, front] = this.project(pos, 2.6, this.cam);
    if (!front) return;
    const e = el('div', `float ${cls}`, text);
    e.style.left = `${x + (Math.random() - 0.5) * 30}px`; e.style.top = `${y}px`;
    host.append(e);
    setTimeout(() => e.remove(), 800);
  }
  cam: THREE.Camera | null = null;

  feed(by: Unit, victim: Unit) {
    const host = $('feed');
    const e = el('div', 'feedrow');
    e.append(el('span', CSS_TEAM[by.team], by.name), el('span', 'x', ' ▶ '), el('span', CSS_TEAM[victim.team], victim.name));
    host.prepend(e);
    while (host.childElementCount > 4) host.lastElementChild!.remove();
    setTimeout(() => e.remove(), 5000);
  }

  announce(text: string, cls: string) {
    const a = $('announce');
    a.textContent = text; a.className = `show ${cls}`;
    this.annT = cls.includes('big') ? 99 : 2.2;
  }

  ultBanner(u: Unit, skill: string) {
    const b = $('banner');
    b.innerHTML = '';
    b.append(el('span', 'bwho', u.name), el('span', 'bskill', skill));
    b.className = `show ${CSS_TEAM[u.team]}`;
    this.bannerT = 1.6;
  }

  countdown(t: number) {
    const s = t > 0.6 ? String(Math.ceil(t - 0.6)) : t > 0 ? 'GO!' : '';
    if (s !== this.lastCount) {
      this.lastCount = s;
      const c = $('count');
      c.textContent = s; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    }
  }
}
