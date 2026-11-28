import './style.css';
import { Renderer } from './render/renderer.js';
import { AudioEngine } from './audio/audio.js';
import { Game } from './game/game.js';
import { World } from './world/world.js';
import { UI } from './ui/ui.js';
import { loadSave, writeSave, checkAchievements } from './meta/save.js';
import { RELICS } from './game/data.js';

class App {
  constructor() {
    this.save = loadSave();
    this.renderer = new Renderer(document.getElementById('gl'), this.save.settings.quality);
    this.audio = new AudioEngine();
    this.game = new Game(this.renderer, this.audio, this.save);
    this.ui = new UI(this);
    this.paused = false;
    this.modal = false;
    this.input = { x: 0, z: 0, dash: false };
    this.game.input = this.input;
    this.keys = new Set();
    this.bindGameEvents();
    this.bindInput();
    this.applySettings();
    this.toTitle();
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsN = 0; this.lowFpsT = 0;
    requestAnimationFrame((t) => this.frame(t));
    // 最初の操作で音を有効化(ブラウザの自動再生制限のため)
    const unlock = () => { this.audio.init(); this.applySettings(); if (this.audio.music && !this.audio.music.playing) this.audio.music.start(); };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.game.running && !this.modal) this.togglePause(true); });
    window.__app = this;
  }
  applySettings() {
    const s = this.save.settings;
    this.audio.vol = { master: s.master, sfx: s.sfx, bgm: s.bgm };
    this.audio.applyVolume();
    if (this.renderer.quality !== s.quality) this.renderer.setQuality(s.quality);
    this.game.settingsShake = s.shake;
    this.game.settingsNumbers = s.numbers;
  }
  toTitle() {
    this.game.running = false;
    this.game.cleanup();
    this.paused = false; this.modal = false;
    if (!this.titleWorld) this.titleWorld = new World(this.renderer.scene, 12345);
    this.titleCam = { x: 0, z: 0, t: 0 };
    this.ui.title();
    if (this.audio.music) { this.audio.music.setMode('title'); this.audio.music.setIntensity(0); }
  }
  startRun(heroId) {
    this.audio.init();
    if (this.titleWorld) { this.titleWorld.dispose(); this.titleWorld = null; }
    this.ui.clear();
    this.paused = false; this.modal = false;
    this.game.start(heroId);
    this.applySettings();
    this.ui.hudStart();
    if (this.audio.music) { if (!this.audio.music.playing) this.audio.music.start(); this.audio.music.setMode('field'); this.audio.music.setIntensity(1); }
  }
  togglePause(v) {
    if (!this.game.running || (this.modal && !this.paused)) return;
    this.paused = v === undefined ? !this.paused : v;
    if (this.paused) this.ui.pause(); else this.ui.clear();
  }
  openModal(fn) {
    this.modal = true;
    this.game.modal = true;
    try {
      fn(() => { this.modal = false; this.game.modal = false; this.ui.padSelect = null; this.ui.clear(); this.last = performance.now(); });
    } catch (e) { console.error(e); this.modal = false; this.game.modal = false; this.ui.clear(); }
  }
  bindGameEvents() {
    const g = this.game, ui = this.ui;
    g.on('levelup', () => this.openModal((close) => ui.levelUp(() => { close(); g.levelDone(); })));
    g.on('chest', (rw, gold) => this.openModal((close) => ui.chest(rw, gold, close)));
    g.on('relic', (opts) => {
      const open = () => this.openModal((close) => ui.pickList('秘宝を選ぶ', 'ひとつだけ持ち帰れる。ランの間ずっと効果が続く', opts, (o) => { g.takeRelic(o.id); close(); }));
      if (this.modal) this.queued = open; else open();
    });
    g.on('blessing', (opts) => this.openModal((close) => ui.pickList('祠の祝福', '女神の加護をひとつ授かる', opts, (o) => { g.takeBlessing(o); close(); }, '')));
    g.on('banner', (t, s) => ui.banner(t, s));
    g.on('toast', (t, c) => ui.toast(t, c));
    g.on('hurt', () => ui.hurtFlash());
    g.on('fever', (on) => ui.fever(on));
    g.on('boss', (b) => ui.boss(b));
    g.on('inventory', () => ui.inventory());
    g.on('end', (run) => this.finishRun(run));
  }
  finishRun(run) {
    const s = this.save;
    const gold = run.gold + Math.floor(run.time / 60) * 10;
    s.gold += gold;
    s.totalKills += run.kills; s.totalRuns++; s.totalChests += run.chests; s.totalBosses += run.bosses; s.totalSeals += run.seals; s.totalEvolves += run.evolves;
    if (run.won) s.totalWins++;
    const rec = { time: run.time > s.best.time, kills: run.kills > s.best.kills, level: run.level > s.best.level };
    s.best.time = Math.max(s.best.time, run.time); s.best.kills = Math.max(s.best.kills, run.kills); s.best.level = Math.max(s.best.level, run.level);
    const unlocked = checkAchievements(s, run);
    writeSave(s);
    this.modal = false; this.paused = false;
    document.getElementById('hud').classList.add('hidden');
    if (this.audio.music) { this.audio.music.setMode('title'); this.audio.music.setIntensity(0); }
    this.ui.result(run, { gold, rec, unlocked });
  }
  bindInput() {
    const K = this.keys;
    addEventListener('keydown', (e) => {
      K.add(e.code);
      if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.game.running && !this.modal && !this.paused) { this.input.dash = true; e.preventDefault(); }
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.game.running && !this.modal) this.togglePause();
    });
    addEventListener('keyup', (e) => K.delete(e.code));
    addEventListener('blur', () => K.clear());
    // タッチ:どこを触っても仮想スティック
    const joy = document.getElementById('joy'), knob = document.getElementById('joyknob');
    this.touch = null;
    const gl = document.getElementById('gl');
    gl.addEventListener('pointerdown', (e) => {
      if (!this.game.running || this.modal || this.paused) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
      joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px';
      joy.classList.remove('hidden');
      knob.style.transform = '';
      gl.setPointerCapture(e.pointerId);
    });
    gl.addEventListener('pointermove', (e) => {
      const t = this.touch;
      if (!t || t.id !== e.pointerId) return;
      let dx = e.clientX - t.x, dy = e.clientY - t.y;
      const l = Math.hypot(dx, dy), max = 55;
      if (l > max) { t.x += (dx / l) * (l - max); t.y += (dy / l) * (l - max); dx = (dx / l) * max; dy = (dy / l) * max; joy.style.left = t.x + 'px'; joy.style.top = t.y + 'px'; }
      t.dx = dx / max; t.dy = dy / max;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e) => { if (this.touch && this.touch.id === e.pointerId) { this.touch = null; joy.classList.add('hidden'); } };
    gl.addEventListener('pointerup', end);
    gl.addEventListener('pointercancel', end);
    document.getElementById('dashbtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.input.dash = true; });
  }
  readInput() {
    const K = this.keys;
    let x = 0, z = 0;
    if (K.has('KeyA') || K.has('ArrowLeft')) x -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) x += 1;
    if (K.has('KeyW') || K.has('ArrowUp')) z -= 1;
    if (K.has('KeyS') || K.has('ArrowDown')) z += 1;
    if (this.touch) { x += this.touch.dx; z += this.touch.dy; }
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() || [] : []; } catch (e) { pads = []; }
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.18) { x += ax; z += ay; }
      if (gp.buttons[12]?.pressed) z -= 1;
      if (gp.buttons[13]?.pressed) z += 1;
      if (gp.buttons[14]?.pressed) x -= 1;
      if (gp.buttons[15]?.pressed) x += 1;
      const a = gp.buttons[0]?.pressed || gp.buttons[5]?.pressed || gp.buttons[7]?.pressed;
      if (a && !this.padA) {
        if (this.modal && this.ui.padSelect) this.ui.padSelect.pick(this.padSel || 0);
        else this.input.dash = true;
      }
      this.padA = a;
      // メニューでの左右選択
      if (this.modal && this.ui.padSelect) {
        const dir = ax > 0.6 || gp.buttons[15]?.pressed ? 1 : ax < -0.6 || gp.buttons[14]?.pressed ? -1 : 0;
        if (dir && !this.padDir) { const n = this.ui.padSelect.count; this.padSel = ((this.padSel || 0) + dir + n) % n; this.ui.padSelect.cards.forEach((c, i) => c.classList.toggle('sel', i === this.padSel)); this.audio.play('hover'); }
        this.padDir = dir;
      }
      const st = gp.buttons[9]?.pressed;
      if (st && !this.padStart && this.game.running && !this.modal) this.togglePause();
      this.padStart = st;
    }
    this.input.x = x; this.input.z = z;
  }
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.readInput();
    const g = this.game;
    if (g.running) {
      if (!this.paused && !this.modal) {
        g.update(dt);
        if (!this.modal && this.queued) { const q = this.queued; this.queued = null; q(); }
      } else this.renderer.render();
      if (!this.paused && !this.modal) {
        g.numbers.update(dt, this.renderer.camera, this.save.settings.numbers);
        this.ui.updateHud(dt);
      }
      this.renderer.render();
      // 音楽の強さ
      const m = this.audio.music;
      if (m) {
        const bossOn = g.bosses.length > 0;
        m.setMode(bossOn ? 'boss' : g.isNight() ? 'night' : 'field');
        const inten = g.feverT > 0 ? 3 : bossOn || g.enemies.length > 220 ? 2 : g.enemies.length > 40 || g.time > 60 ? 1 : 1;
        m.setIntensity(inten);
      }
      this.autoQuality(dt);
    } else if (this.titleWorld) {
      const c = this.titleCam;
      c.t += dt;
      c.x += dt * 3.2; c.z += Math.sin(c.t * 0.1) * dt * 2;
      this.titleWorld.update(c.x, c.z, dt);
      this.renderer.setNight(0.15, null);
      this.renderer.follow(c.x, c.z, 3, 0, dt, false);
      this.renderer.render();
    } else this.renderer.render();
  }
  // 重い端末では自動で画質を落とす
  autoQuality(dt) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 2) {
      const fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0; this.fpsN = 0;
      if (fps < 38 && !this.paused && !this.modal) this.lowFpsT++; else this.lowFpsT = 0;
      if (this.lowFpsT >= 3) {
        const s = this.save.settings;
        const next = s.quality === 'high' ? 'mid' : s.quality === 'mid' ? 'low' : null;
        if (next) { s.quality = next; this.applySettings(); writeSave(this.save); this.ui.toast(`画質を「${next === 'mid' ? '中' : '低'}」に自動調整しました`, '#9fd3ff'); }
        this.lowFpsT = 0;
      }
    }
  }
}
new App();
