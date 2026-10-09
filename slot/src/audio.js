// WebAudio サンプルプレイヤー (SE / BGM / ループ)
export class AudioEngine {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
    this.buffers = new Map();
    this.bgmNode = null;
    this.bgmName = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.cfg.audio.master;
    // 軽いコンプレッサで派手な重なりでも割れないように
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.cfg.audio.sfx;
    this.sfxBus.connect(this.master);
    this.bgmBus = this.ctx.createGain();
    this.bgmBus.gain.value = this.cfg.audio.bgm;
    this.bgmBus.connect(this.master);
  }

  async resume() {
    this.init();
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async load(map, onProgress) {
    this.init();
    const entries = Object.entries(map);
    let done = 0;
    await Promise.all(entries.map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        const buf = await new Promise((ok, ng) => this.ctx.decodeAudioData(arr, ok, ng));
        this.buffers.set(name, buf);
      } catch (e) {
        console.warn('audio load failed', name, e);
      }
      onProgress?.(++done / entries.length);
    }));
  }

  setVolumes(a) {
    if (!this.ctx) return;
    this.master.gain.value = a.master;
    this.sfxBus.gain.value = a.sfx;
    this.bgmBus.gain.value = a.bgm;
  }

  play(name, { gain = 1, rate = 1, loop = false, delay = 0, detune = 0 } = {}) {
    if (!this.ctx || !this.enabled) return null;
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.detune.value = detune;
    src.loop = loop;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfxBus);
    src.start(this.ctx.currentTime + delay);
    return {
      src, gain: g,
      stop: (fade = 0.05) => {
        const t = this.ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
        try { src.stop(t + fade + 0.01); } catch { /* already stopped */ }
      },
      rate: (r) => src.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.05),
    };
  }

  bgm(name, { fade = 0.6, gain = 1 } = {}) {
    if (!this.ctx) return;
    if (this.bgmName === name) return;
    this.stopBgm(fade);
    if (!name) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + fade);
    src.connect(g).connect(this.bgmBus);
    src.start();
    this.bgmNode = { src, g };
    this.bgmName = name;
  }

  stopBgm(fade = 0.6) {
    if (!this.bgmNode) return;
    const { src, g } = this.bgmNode;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + fade);
    try { src.stop(t + fade + 0.05); } catch { /* noop */ }
    this.bgmNode = null;
    this.bgmName = null;
  }

  // 一時的に BGM を絞る (フリーズ・告知時)
  duck(amount = 0.15, ms = 1200) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = this.cfg.audio.bgm;
    this.bgmBus.gain.cancelScheduledValues(t);
    this.bgmBus.gain.setValueAtTime(v * amount, t);
    this.bgmBus.gain.linearRampToValueAtTime(v, t + ms / 1000);
  }
}
