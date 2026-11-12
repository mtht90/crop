import * as THREE from 'three';
import type { Match, Unit } from './game';
import { HALF_X, HALF_Z, BEACON_RADIUS, SPAWNS } from './stage';
import { portraitOf } from './assets';
import { iconSvg } from './icons';
import type { Input } from './input';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
const img = (src: string, cls = '') => { const e = document.createElement('img'); e.src = src; e.className = cls; e.alt = ''; return e; };
const CSS_TEAM = ['blue', 'red'];
const v = new THREE.Vector3();

export class Hud {
  cam: THREE.Camera | null = null;
  private plates = new Map<Unit, { root: HTMLElement; bar: HTMLElement }>();
  private labels: HTMLElement[] = [];
  private chips: { root: HTMLElement; fill: HTMLElement }[] = [];
  private tiles = new Map<Unit, { root: HTMLElement; bar: HTMLElement; timer: HTMLElement }>();
  private buttons: { root: HTMLElement; ico: HTMLElement; sweep: HTMLElement; num: HTMLElement; name: HTMLElement }[] = [];
  private map = ($('minimap') as HTMLCanvasElement).getContext('2d')!;
  private annT = 0; private bannerT = 0; private lastCount = '';
  private w = 1; private h = 1;

  constructor(input: Input) {
    const keys = ['Q', 'E', 'SPACE'];
    ['skill0', 'skill1', 'skill2'].forEach((id, i) => {
      const root = $(id);
      const face = el('div', 'face');
      const ico = el('div', 'ico'); const sweep = el('div', 'sweep'); const num = el('div', 'num');
      face.append(ico, sweep, num);
      const name = el('div', 'sname');
      root.append(face, name, el('div', 'key', keys[i]));
      root.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.press(i); });
      this.buttons.push({ root, ico, sweep, num, name });
    });
  }

  resize(w: number, h: number) { this.w = w; this.h = h; }

  setup(m: Match) {
    for (const id of ['plates', 'floats', 'feed', 'team-blue', 'team-red', 'beacons']) $(id).innerHTML = '';
    this.plates.clear(); this.tiles.clear(); this.labels = []; this.chips = [];
    this.cam = m.camera;
    for (const u of m.units) {
      const root = el('div', `plate ${CSS_TEAM[u.team]}${u.isPlayer ? ' me' : ''}`);
      const track = el('div', 'ptrack'); const bar = el('div', 'pbar');
      track.append(bar); root.append(el('div', 'pname', u.isPlayer ? 'YOU' : u.name), track);
      $('plates').append(root);
      this.plates.set(u, { root, bar });

      // 上部のチーム表示: 顔アイコン + HP + 復帰までの秒数
      const tile = el('div', `tile ${CSS_TEAM[u.team]}${u.isPlayer ? ' me' : ''}`);
      const frame = el('div', 'tframe'); const timer = el('div', 'ttimer');
      frame.append(img(portraitOf(u.def)), timer);
      const tt = el('div', 'ttrack'); const tb = el('div', 'tbar'); tt.append(tb);
      tile.append(frame, tt);
      $(u.team === 0 ? 'team-blue' : 'team-red').append(tile);
      this.tiles.set(u, { root: tile, bar: tb, timer });
    }
    m.beacons.forEach((_, i) => {
      const l = el('div', 'blabel', 'ABCDE'[i]); $('plates').append(l); this.labels.push(l);
      const c = el('div', 'chip'); const fill = el('div', 'chipfill');
      c.append(fill, el('span', '', 'ABCDE'[i])); $('beacons').append(c); this.chips.push({ root: c, fill });
    });
    this.buttons.forEach((b, i) => { const s = m.skillOf(m.player, i); b.name.textContent = s.name; b.ico.innerHTML = iconSvg(s.icon); });
    ($('me-img') as HTMLImageElement).src = portraitOf(m.player.def);
    $('me-name').textContent = m.player.name;
    $('announce').className = ''; $('banner').className = ''; $('count').textContent = '';
  }

  private project(p: THREE.Vector3, y: number, cam: THREE.Camera): [number, number, boolean] {
    v.set(p.x, y, p.z).project(cam);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h, v.z < 1];
  }

  update(m: Match) {
    const cam = m.camera, p = m.player;
    for (const [u, pl] of this.plates) {
      const [x, y, front] = this.project(u.pos, 3.25, cam);
      const show = u.alive && front && !(u.team !== p.team && u.stealth > 0);
      pl.root.hidden = !show;
      if (!show) continue;
      pl.root.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      pl.bar.style.width = `${(u.hp / u.maxHp) * 100}%`;
      pl.root.classList.toggle('stun', u.stun > 0);
    }
    m.beacons.forEach((b, i) => {
      const [x, y, front] = this.project(b.pos, 5.2, cam);
      const l = this.labels[i];
      l.hidden = !front;
      l.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) skewX(-12deg)`;
      const cls = b.owner === -1 ? 'neutral' : CSS_TEAM[b.owner];
      l.className = `blabel ${cls}`;
      const chip = this.chips[i];
      chip.root.className = `chip ${cls}`;
      chip.fill.style.height = `${Math.abs(b.value) * 100}%`;
      chip.fill.className = `chipfill ${b.value >= 0 ? 'blue' : 'red'}`;
    });
    const t = Math.max(0, Math.ceil(m.timeLeft));
    const timer = $('timer');
    timer.textContent = m.overtime ? 'OVERTIME' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    timer.classList.toggle('hot', m.overtime || t <= 10);
    const c = m.counts();
    $('score-blue').textContent = String(c[0]); $('score-red').textContent = String(c[1]);
    for (const [u, tile] of this.tiles) {
      tile.bar.style.width = `${(u.hp / u.maxHp) * 100}%`;
      tile.root.classList.toggle('dead', !u.alive);
      tile.root.classList.toggle('ult', u.ult >= 1 && u.alive);
      tile.timer.textContent = u.alive ? '' : String(Math.ceil(u.respawn));
    }
    this.buttons.forEach((b, i) => {
      const cdLeft = i < 2 ? Math.max(0, p.cds[i]) : 0;
      const k = i < 2 ? cdLeft / m.skillOf(p, i).cd : 1 - p.ult;
      b.sweep.style.setProperty('--k', String(k));
      b.num.textContent = k <= 0 ? '' : i < 2 ? String(Math.ceil(cdLeft)) : `${Math.floor(p.ult * 100)}%`;
      b.root.classList.toggle('ready', k <= 0 && p.alive);
    });
    $('myhp-bar').style.width = `${(p.hp / p.maxHp) * 100}%`;
    $('myhp-text').textContent = `${Math.max(0, Math.ceil(p.hp))}`;
    const rs = $('respawn');
    rs.hidden = p.alive || m.state !== 'play';
    if (!p.alive) rs.textContent = `復帰まで ${Math.ceil(p.respawn)}`;

    if (this.annT > 0 && (this.annT -= 1 / 60) <= 0) $('announce').classList.remove('show');
    if (this.bannerT > 0 && (this.bannerT -= 1 / 60) <= 0) $('banner').classList.remove('show');
    this.drawMap(m);
  }

  private drawMap(m: Match) {
    const g = this.map, W = g.canvas.width, H = g.canvas.height;
    const sx = (x: number) => ((x + HALF_X) / (HALF_X * 2)) * W, sz = (z: number) => ((z + HALF_Z) / (HALF_Z * 2)) * H;
    const k = W / (HALF_X * 2);
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(13,18,38,.8)'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(190,200,235,.5)';
    for (const o of m.stage.obstacles) g.fillRect(sx(o.x - o.hx), sz(o.z - o.hz), o.hx * 2 * k, o.hz * 2 * k);
    const col = ['#2f8fff', '#ff4458'];
    SPAWNS.forEach((s, i) => { g.globalAlpha = 0.3; g.fillStyle = col[i]; g.beginPath(); g.arc(sx(s.x), sz(s.z), 4.5 * k, 0, 7); g.fill(); g.globalAlpha = 1; });
    for (const b of m.beacons) {
      g.strokeStyle = b.owner === -1 ? '#e8ecf8' : col[b.owner]; g.lineWidth = 2;
      g.beginPath(); g.arc(sx(b.pos.x), sz(b.pos.z), BEACON_RADIUS * k, 0, 7); g.stroke();
      g.globalAlpha = 0.6; g.fillStyle = b.value >= 0 ? col[0] : col[1];
      g.beginPath(); g.arc(sx(b.pos.x), sz(b.pos.z), BEACON_RADIUS * k * Math.abs(b.value), 0, 7); g.fill(); g.globalAlpha = 1;
    }
    for (const u of m.units) {
      if (!u.alive || (u.team !== m.player.team && u.stealth > 0)) continue;
      g.fillStyle = u.isPlayer ? '#ffd60a' : col[u.team];
      g.beginPath(); g.arc(sx(u.pos.x), sz(u.pos.z), u.isPlayer ? 4.5 : 3.2, 0, 7); g.fill();
      if (u.isPlayer) { g.strokeStyle = '#0d1226'; g.lineWidth = 1.5; g.stroke(); }
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

  feed(by: Unit, victim: Unit) {
    const host = $('feed');
    const e = el('div', 'feedrow');
    const a = el('span', `fwho ${CSS_TEAM[by.team]}`); a.append(img(portraitOf(by.def)), el('b', '', by.name));
    const b = el('span', `fwho ${CSS_TEAM[victim.team]}`); b.append(img(portraitOf(victim.def)), el('b', '', victim.name));
    e.append(a, el('span', 'fx', 'KO'), b);
    host.prepend(e);
    while (host.childElementCount > 3) host.lastElementChild!.remove();
    setTimeout(() => e.remove(), 5000);
  }

  announce(text: string, cls: string) {
    const a = $('announce');
    a.textContent = text; a.className = `show ${cls}`;
    this.annT = cls.includes('big') ? 99 : 2.2;
  }

  /** 必殺技のカットイン */
  ultBanner(u: Unit, skill: string) {
    ($('banner-img') as HTMLImageElement).src = portraitOf(u.def);
    $('banner-who').textContent = u.name;
    $('banner-skill').textContent = skill;
    const b = $('banner');
    b.className = ''; void b.offsetWidth;
    b.className = `show ${CSS_TEAM[u.team]}`;
    this.bannerT = 1.7;
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
