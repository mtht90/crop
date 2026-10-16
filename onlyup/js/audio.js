import { SOUNDS, resolve } from './assets.js';

/** Howler.js による BGM / SE 管理（外部ホストの音源） */
export class Audio {
  constructor() {
    this.ok = typeof window.Howl === 'function';
    this.sfx = {};
    this.vol = { master: 0.8, bgm: 0.45, sfx: 0.8 };
    this.last = {};
    if (!this.ok) return;
    for (const [name, src] of Object.entries(SOUNDS)) {
      if (name === 'bgm') continue;
      this.sfx[name] = new window.Howl({ src: src.map(resolve), format: src.map((u) => u.split('.').pop()), volume: 1, preload: true, pool: 6 });
    }
    this.bgm = new window.Howl({ src: SOUNDS.bgm.map(resolve), format: SOUNDS.bgm.map((u) => u.split('.').pop()), loop: true, volume: 0, html5: false, preload: true });
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    if (!this.ok) return;
    window.Howler.volume(this.vol.master);
    if (this.bgm.playing()) this.bgm.volume(this.vol.bgm);
  }

  play(name, { volume = 1, rate = 1, throttle = 0.05 } = {}) {
    if (!this.ok) return;
    const s = this.sfx[name]; if (!s) return;
    const now = performance.now() / 1000;
    if (now - (this.last[name] || 0) < throttle) return;
    this.last[name] = now;
    const id = s.play();
    s.volume(Math.min(1, volume * this.vol.sfx), id);
    s.rate(rate, id);
  }

  startBgm() {
    if (!this.ok) return;
    if (!this.bgm.playing()) this.bgm.play();
    this.bgm.fade(this.bgm.volume(), this.vol.bgm, 1500);
  }
  duckBgm(on) {
    if (!this.ok || !this.bgm.playing()) return;
    this.bgm.fade(this.bgm.volume(), on ? this.vol.bgm * 0.3 : this.vol.bgm, 400);
  }
  setPaused(p) { if (this.ok) window.Howler.mute(p && this.muteOnPause); }
}
