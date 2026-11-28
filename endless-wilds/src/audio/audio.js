// 効果音とBGMはすべて Web Audio でその場で合成する(音声素材ファイル不要)。
// public/audio/manifest.json があれば、そこに書かれた音声ファイルで差し替えられる。
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// ペンタトニック(経験値を連続で拾うと音階が上がっていく)
const PENTA = [0, 2, 4, 7, 9];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, sfx: 0.8, bgm: 0.6 };
    this.last = {};
    this.voices = {};
    this.overrides = {};
    this.music = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.bgm = ctx.createGain(); this.bgm.connect(this.master);
    this.applyVolume();
    const len = ctx.sampleRate * 1.0;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 簡易リバーブ
    this.reverb = ctx.createConvolver();
    const rl = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < rl; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3); }
    this.reverb.buffer = ir;
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.35;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.music = new Music(this);
    this.loadOverrides();
  }
  async loadOverrides() {
    try {
      const res = await fetch('audio/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const man = await res.json();
      const all = { ...(man.se || {}), ...Object.fromEntries(Object.entries(man.bgm || {}).map(([k, v]) => ['bgm:' + k, v])) };
      for (const [k, file] of Object.entries(all)) {
        try {
          const buf = await (await fetch('audio/' + file)).arrayBuffer();
          this.overrides[k] = await this.ctx.decodeAudioData(buf);
        } catch (e) { console.warn('audio override failed', k, e); }
      }
      if (this.music) this.music.refreshOverride();
    } catch (e) { /* 差し替えなし */ }
  }
  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.bgm.gain.value = this.vol.bgm * 0.55;
  }
  get t() { return this.ctx.currentTime; }

  // 同じ音の鳴りすぎを抑える
  gate(name, minGap, maxVoices = 6, dur = 0.2) {
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < minGap) return false;
    const v = (this.voices[name] = (this.voices[name] || []).filter((e) => e > now));
    if (v.length >= maxVoices) return false;
    v.push(now + dur);
    this.last[name] = now;
    return true;
  }
  env(g, t, a, peak, dcy) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }
  osc(type, f0, f1, t, dur, peak, dest = this.sfx, a = 0.004) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, a, peak, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  noiseHit(t, dur, peak, type, f0, f1, q = 1, dest = this.sfx) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.003, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  playBuffer(buf, vol = 1, rate = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.sfx); s.start();
  }

  play(name, p = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    const ov = this.overrides[name];
    if (ov) {
      if (this.gate(name, 0.03, 8, ov.duration)) this.playBuffer(ov, p.vol ?? 0.8, 0.95 + Math.random() * 0.1 + (p.pitch || 0));
      return;
    }
    const R = (a, b) => a + Math.random() * (b - a);
    switch (name) {
      case 'shoot':
        if (!this.gate(name, 0.045, 5)) return;
        this.osc('triangle', R(820, 980) * (p.pitch || 1), 380, t, 0.07, 0.09);
        break;
      case 'arrow':
        if (!this.gate(name, 0.05, 4)) return;
        this.noiseHit(t, 0.08, 0.12, 'bandpass', 2500, 5000, 3);
        this.osc('sine', 1200, 600, t, 0.05, 0.04);
        break;
      case 'blade':
        if (!this.gate(name, 0.09, 3)) return;
        this.noiseHit(t, 0.12, 0.08, 'bandpass', 1800, 3500, 6);
        break;
      case 'hit':
        if (!this.gate(name, 0.025, 8, 0.06)) return;
        this.noiseHit(t, 0.05, 0.16, 'highpass', 1800, 1800, 0.7);
        this.osc('square', R(180, 240), 90, t, 0.04, 0.05);
        break;
      case 'crit':
        if (!this.gate(name, 0.06, 4)) return;
        this.osc('square', 1400, 700, t, 0.06, 0.06);
        this.noiseHit(t, 0.06, 0.18, 'highpass', 3000, 3000);
        break;
      case 'kill': {
        if (!this.gate(name, 0.03, 8, 0.1)) return;
        const f = R(260, 380);
        this.osc('sine', f, f * 0.3, t, 0.1, 0.22);
        this.noiseHit(t, 0.07, 0.1, 'lowpass', 3000, 600);
        break;
      }
      case 'gem': {
        if (!this.gate(name, 0.022, 10, 0.18)) return;
        const c = p.combo || 0;
        const step = c % 15;
        const note = 72 + Math.floor(step / 5) * 12 + PENTA[step % 5];
        const f = NOTE(note);
        this.osc('sine', f, f, t, 0.16, 0.1);
        this.osc('sine', f * 2, f * 2, t, 0.08, 0.03);
        break;
      }
      case 'coin':
        if (!this.gate(name, 0.05, 4)) return;
        this.osc('square', 1318, 1318, t, 0.05, 0.05);
        this.osc('square', 1760, 1760, t + 0.06, 0.12, 0.05);
        break;
      case 'levelup': {
        const notes = [60, 64, 67, 72, 76, 79, 84];
        notes.forEach((n, i) => {
          this.osc('triangle', NOTE(n), NOTE(n), t + i * 0.045, 0.35, 0.12);
          this.osc('sine', NOTE(n + 12), NOTE(n + 12), t + i * 0.045, 0.25, 0.04);
        });
        this.noiseHit(t, 0.6, 0.05, 'highpass', 6000, 9000);
        break;
      }
      case 'pick':
        this.osc('triangle', 660, 660, t, 0.06, 0.12);
        this.osc('triangle', 990, 990, t + 0.05, 0.15, 0.12);
        this.osc('sine', 1320, 1320, t + 0.1, 0.3, 0.08);
        break;
      case 'chest':
        for (let i = 0; i < 14; i++) this.noiseHit(t + i * 0.05, 0.04, 0.05 + i * 0.01, 'bandpass', 400 + i * 80, 0, 4);
        [72, 76, 79, 84, 88].forEach((n, i) => this.osc('square', NOTE(n), NOTE(n), t + 0.75 + i * 0.07, 0.4, 0.06));
        this.osc('sine', NOTE(48), NOTE(48), t + 0.75, 0.8, 0.2);
        break;
      case 'evolve':
        [48, 55, 60, 64, 67, 72, 76, 79].forEach((n, i) => { this.osc('sawtooth', NOTE(n), NOTE(n), t + i * 0.03, 1.2, 0.03); this.osc('triangle', NOTE(n + 12), NOTE(n + 12), t + i * 0.06, 0.9, 0.06); });
        this.noiseHit(t, 1.2, 0.06, 'highpass', 5000, 12000);
        break;
      case 'explode': {
        if (!this.gate(name, 0.06, 4, 0.4)) return;
        const big = p.big ? 1.6 : 1;
        this.noiseHit(t, 0.45 * big, 0.35, 'lowpass', 2400, 120, 0.8);
        this.osc('sine', 110, 32, t, 0.35 * big, 0.45);
        break;
      }
      case 'thunder':
        if (!this.gate(name, 0.07, 3, 0.3)) return;
        this.noiseHit(t, 0.25, 0.28, 'highpass', 900, 3000, 0.6);
        this.noiseHit(t + 0.03, 0.4, 0.2, 'lowpass', 1200, 150);
        this.osc('square', 80, 40, t, 0.15, 0.08);
        break;
      case 'nova':
        if (!this.gate(name, 0.15, 2)) return;
        this.osc('sine', 2400, 1200, t, 0.4, 0.06);
        this.osc('sine', 3200, 1600, t, 0.35, 0.04);
        this.noiseHit(t, 0.4, 0.1, 'highpass', 4000, 8000);
        break;
      case 'fire':
        if (!this.gate(name, 0.1, 3, 0.3)) return;
        this.noiseHit(t, 0.3, 0.12, 'bandpass', 600, 300, 1.5);
        break;
      case 'throw':
        if (!this.gate(name, 0.06, 3)) return;
        this.noiseHit(t, 0.12, 0.06, 'bandpass', 800, 1800, 2);
        break;
      case 'meteor':
        this.noiseHit(t, 0.6, 0.15, 'bandpass', 300, 1500, 1);
        break;
      case 'dash':
        this.noiseHit(t, 0.22, 0.2, 'bandpass', 500, 3000, 1.5);
        this.osc('sine', 300, 900, t, 0.15, 0.06);
        break;
      case 'hurt':
        if (!this.gate(name, 0.15, 2)) return;
        this.osc('square', 220, 70, t, 0.18, 0.13);
        this.noiseHit(t, 0.12, 0.2, 'lowpass', 1500, 300);
        break;
      case 'heal':
        this.osc('sine', 523, 1046, t, 0.35, 0.1);
        this.osc('triangle', 784, 1568, t + 0.05, 0.3, 0.05);
        break;
      case 'boss':
        this.osc('sawtooth', 70, 45, t, 1.8, 0.22, this.sfx, 0.1);
        this.osc('sawtooth', 71.5, 44, t, 1.8, 0.22, this.sfx, 0.1);
        this.noiseHit(t, 1.5, 0.15, 'lowpass', 400, 80);
        break;
      case 'warn':
        for (let i = 0; i < 3; i++) { this.osc('square', 880, 880, t + i * 0.28, 0.12, 0.06); this.osc('square', 660, 660, t + i * 0.28 + 0.14, 0.12, 0.06); }
        break;
      case 'fever':
        [60, 67, 72, 79, 84, 91].forEach((n, i) => this.osc('sawtooth', NOTE(n), NOTE(n), t + i * 0.04, 0.5, 0.04));
        this.noiseHit(t, 0.8, 0.12, 'highpass', 3000, 10000);
        break;
      case 'ui':
        this.osc('triangle', 880, 1100, t, 0.05, 0.08);
        break;
      case 'hover':
        if (!this.gate(name, 0.04, 2)) return;
        this.osc('sine', 1500, 1500, t, 0.03, 0.03);
        break;
      case 'shrine':
        [67, 71, 74, 79].forEach((n, i) => this.osc('sine', NOTE(n), NOTE(n), t + i * 0.12, 1.0, 0.08));
        break;
      case 'bomb':
        this.noiseHit(t, 1.0, 0.45, 'lowpass', 3000, 60, 0.7);
        this.osc('sine', 90, 25, t, 0.9, 0.6);
        break;
      case 'step':
        if (!this.gate(name, 0.2, 1)) return;
        this.noiseHit(t, 0.04, 0.02, 'lowpass', 600, 600);
        break;
      case 'win':
        [60, 64, 67, 72, 67, 72, 76, 79, 84].forEach((n, i) => this.osc('triangle', NOTE(n), NOTE(n), t + i * 0.12, 0.5, 0.1));
        break;
      case 'lose':
        [64, 60, 57, 52].forEach((n, i) => this.osc('triangle', NOTE(n), NOTE(n), t + i * 0.25, 0.6, 0.1));
        break;
    }
  }
}

// ===== BGM:手続き的シーケンサ。強度(0〜3)で楽器が重なっていく =====
const PROGS = {
  field: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G
  night: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]], // Dm Bb C A
  boss: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], // Em C D B
  title: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],
};
class Music {
  constructor(engine) {
    this.e = engine;
    const ctx = engine.ctx;
    this.ctx = ctx;
    this.bus = {};
    for (const k of ['drums', 'bass', 'pad', 'arp', 'lead', 'perc']) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(engine.bgm); this.bus[k] = g;
    }
    this.bus.pad.connect(engine.reverb);
    this.bus.lead.connect(engine.reverb);
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 60 / 132 * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const dl = ctx.createGain(); dl.gain.value = 0.3;
    this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(dl); dl.connect(engine.bgm);
    this.bus.arp.connect(this.delay);
    this.mode = 'title';
    this.intensity = 0;
    this.bpm = 132;
    this.step = 0;
    this.nextT = ctx.currentTime + 0.1;
    this.playing = false;
    this.ovSrc = null;
    this.timer = setInterval(() => this.tick(), 25);
  }
  refreshOverride() { if (this.playing) this.setMode(this.mode, true); }
  start() { this.playing = true; this.nextT = this.ctx.currentTime + 0.05; this.setMode(this.mode, true); }
  stop() { this.playing = false; this.stopOverride(); this.setIntensity(-1); }
  stopOverride() { if (this.ovSrc) { try { this.ovSrc.stop(); } catch (e) {} this.ovSrc = null; } }
  setMode(m, force) {
    if (m === this.mode && !force) return;
    this.mode = m;
    this.bpm = m === 'boss' ? 148 : m === 'title' ? 100 : m === 'night' ? 138 : 132;
    this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    const ov = this.e.overrides['bgm:' + m] || (m === 'night' ? this.e.overrides['bgm:field'] : null);
    this.stopOverride();
    if (ov && this.playing) {
      const s = this.ctx.createBufferSource(); s.buffer = ov; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0.9; s.connect(g); g.connect(this.e.bgm); s.start();
      this.ovSrc = s;
    }
    this.setIntensity(this.intensity, true);
  }
  setIntensity(v, force) {
    if (v === this.intensity && !force) return;
    this.intensity = v;
    const t = this.ctx.currentTime;
    const ov = !!this.ovSrc;
    const lv = (k, on) => this.bus[k].gain.setTargetAtTime(on && !ov ? 1 : 0, t, 0.6);
    const title = this.mode === 'title';
    lv('pad', v >= 0);
    lv('arp', v >= 0);
    lv('drums', v >= 1 && !title);
    lv('bass', v >= 1);
    lv('lead', v >= 2 && !title);
    lv('perc', v >= 3);
  }
  tick() {
    if (!this.playing || !this.ctx || this.ctx.state !== 'running') { if (this.ctx) this.nextT = Math.max(this.nextT, this.ctx.currentTime + 0.05); return; }
    const sp = 60 / this.bpm / 4;
    while (this.nextT < this.ctx.currentTime + 0.15) {
      if (!this.ovSrc) this.playStep(this.step, this.nextT);
      this.nextT += sp;
      this.step++;
    }
  }
  playStep(step, t) {
    const prog = PROGS[this.mode] || PROGS.field;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = prog[bar % prog.length];
    const E = this.e;
    const sp = 60 / this.bpm / 4;
    // ドラム
    if (this.intensity >= 1 && this.mode !== 'title') {
      if (s % 4 === 0 || (this.mode === 'boss' && s === 14)) {
        E.osc('sine', 150, 42, t, 0.22, 0.9, this.bus.drums, 0.002);
      }
      if (s === 4 || s === 12) { E.noiseHit(t, 0.16, 0.45, 'bandpass', 1800, 900, 0.8, this.bus.drums); E.osc('triangle', 220, 160, t, 0.08, 0.25, this.bus.drums); }
      if (s % 2 === 0) E.noiseHit(t, 0.03, s % 4 === 2 ? 0.16 : 0.08, 'highpass', 8000, 8000, 1, this.bus.drums);
    }
    if (this.intensity >= 3 && s % 2 === 1) E.noiseHit(t, 0.025, 0.1, 'highpass', 10000, 10000, 1, this.bus.perc);
    if (this.intensity >= 3 && (s === 3 || s === 11)) E.osc('sine', 400, 300, t, 0.06, 0.2, this.bus.perc);
    // ベース(8分刻み+オクターブ)
    if (s % 2 === 0) {
      const root = chord[0] - 24 + (s % 8 === 6 ? 12 : 0);
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(root);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + sp * 1.8);
      const g = this.ctx.createGain(); E.env(g, t, 0.005, 0.32, sp * 1.8);
      o.connect(f); f.connect(g); g.connect(this.bus.bass); o.start(t); o.stop(t + sp * 2.2);
    }
    // パッド(小節頭)
    if (s === 0) {
      for (const n of chord) for (const det of [-6, 6]) {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = this.mode === 'title' ? 700 : 1100;
        const g = this.ctx.createGain(); const dur = sp * 16;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.35); g.gain.setValueAtTime(0.045, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
        o.connect(f); f.connect(g); g.connect(this.bus.pad); o.start(t); o.stop(t + dur + 0.3);
      }
    }
    // アルペジオ
    const arpOn = this.mode === 'title' ? s % 4 === 0 : s % 2 === 0 || this.intensity >= 2;
    if (arpOn) {
      const seq = [0, 1, 2, 1, 2, 0, 1, 2];
      const n = chord[seq[(s >> (this.mode === 'title' ? 2 : 1)) % seq.length]] + 12 + (s >= 8 && this.intensity >= 2 ? 12 : 0);
      E.osc(this.mode === 'boss' ? 'square' : 'triangle', NOTE(n), NOTE(n), t, sp * 1.5, this.mode === 'boss' ? 0.05 : 0.09, this.bus.arp);
    }
    // リード(4小節で一回りする旋律)
    if (this.intensity >= 2) {
      const mel = [0, -1, 2, -1, 1, -1, 2, 1, 0, -1, -1, 2, 1, -1, 0, -1];
      const mi = mel[s];
      if (mi >= 0 && (bar % 2 === 0 || s < 8)) {
        const n = chord[mi] + 24 - (bar % 4 === 3 && s > 8 ? 2 : 0);
        const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = NOTE(n);
        const vib = this.ctx.createOscillator(); vib.frequency.value = 5.5; const vg = this.ctx.createGain(); vg.gain.value = 6; vib.connect(vg); vg.connect(o.detune);
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
        const g = this.ctx.createGain(); E.env(g, t, 0.01, 0.05, sp * 2.6);
        o.connect(f); f.connect(g); g.connect(this.bus.lead); o.start(t); vib.start(t); o.stop(t + sp * 3); vib.stop(t + sp * 3);
      }
    }
  }
}
