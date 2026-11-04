/* カードTD — 効果音と BGM(Web Audio でその場で合成。音声ファイル不要) */
(function (CTD) {
  'use strict';

  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let lastPlay = {};

  function init() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }

  CTD.audioUnlock = function () {
    const a = init();
    if (a && a.state === 'suspended') a.resume();
  };

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(type, f0, f1, dur, vol, when = 0, bus = sfxBus) {
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, q = 1, type = 'bandpass', when = 0) {
    const t = ac.currentTime + when;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    env(g, t, 0.004, vol, dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t); s.stop(t + dur + 0.05);
  }

  const SFX = {
    deploy() { tone('triangle', 300, 600, 0.12, 0.25); noise(0.15, 0.15, 900, 0.8); },
    hit() { noise(0.08, 0.3, 2400, 1.5); tone('square', 220, 90, 0.06, 0.08); },
    smash() { noise(0.2, 0.45, 500, 0.7); tone('sine', 120, 45, 0.22, 0.35); },
    arrow() { noise(0.12, 0.12, 3800, 4); },
    arrowhit() { noise(0.05, 0.2, 1800, 2); },
    magic() { tone('sine', 700, 1400, 0.18, 0.12); tone('triangle', 1050, 2100, 0.14, 0.06, 0.03); },
    frost() { tone('sine', 1600, 900, 0.3, 0.1); noise(0.3, 0.12, 5000, 3, 'highpass'); },
    boom() { noise(0.35, 0.5, 300, 0.6, 'lowpass'); tone('sine', 90, 35, 0.35, 0.4); },
    death() { tone('triangle', 400, 120, 0.18, 0.12); },
    bigdeath() { tone('sawtooth', 160, 40, 0.5, 0.18); noise(0.4, 0.3, 300, 0.7, 'lowpass'); },
    castle() { noise(0.25, 0.35, 400, 0.9); tone('sine', 70, 40, 0.25, 0.3); },
    click() { tone('triangle', 900, 1200, 0.05, 0.12); },
    denied() { tone('square', 200, 140, 0.12, 0.08); },
    count() { tone('square', 660, 660, 0.12, 0.12); },
    go() { tone('square', 990, 990, 0.3, 0.14); tone('triangle', 1320, 1320, 0.3, 0.1); },
    surge() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.18, 0.13, i * 0.07)); },
    bonus() { tone('sine', 1200, 1800, 0.1, 0.1); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('triangle', f, f, i === 5 ? 0.6 : 0.16, 0.18, i * 0.13)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.98, 0.3, 0.16, i * 0.22)); },
    star() { tone('triangle', 1320, 1760, 0.25, 0.18); tone('sine', 2640, 2640, 0.2, 0.06, 0.05); },
    flip() { noise(0.08, 0.2, 2500, 1); tone('triangle', 500, 900, 0.08, 0.08); },
    shine() { [1047, 1319, 1568, 2093].forEach((f, i) => tone('sine', f, f, 0.3, 0.1, i * 0.06)); },
  };

  // ---- 効果音ファイル(Kenney 50 RPG Sound Effects) ----
  const SAMPLE_FILES = ['deploy', 'hit', 'hit2', 'smash', 'metal', 'metal2', 'arrow', 'arrowhit', 'castle', 'death', 'click', 'denied', 'flip', 'open', 'coins', 'page', 'step'];
  const buffers = {};
  let samplesLoading = false;
  function loadSamples() {
    if (samplesLoading || !ac) return;
    samplesLoading = true;
    for (const k of SAMPLE_FILES) {
      fetch(CTD.assetURL('audio/sfx_' + k + '.mp3'))
        .then(r => r.arrayBuffer())
        .then(b => new Promise((res, rej) => ac.decodeAudioData(b, res, rej)))
        .then(buf => { buffers[k] = buf; })
        .catch(() => {});
    }
  }
  function sample(k, vol = 1, rate = 1) {
    const buf = buffers[k];
    if (!buf) return false;
    const s = ac.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = ac.createGain();
    g.gain.value = vol;
    s.connect(g); g.connect(sfxBus);
    s.start();
    return true;
  }
  // 素材の音があればそれを鳴らす。魔法・ジングルなど素材にない音は合成音
  const MAP = {
    deploy: () => sample('deploy', 0.9),
    hit: () => sample(Math.random() < 0.5 ? 'hit' : 'hit2', 0.7),
    smash: () => sample('smash', 1) && sample('metal', 0.35, 0.7),
    arrow: () => sample('arrow', 0.45, 1.4),
    arrowhit: () => sample('arrowhit', 0.35, 1.2),
    castle: () => sample('castle', 0.9, 0.8),
    death: () => sample('death', 0.6),
    bigdeath: () => sample('castle', 0.8, 0.6) && sample('death', 0.8, 0.7),
    rock: () => sample('step', 0.9, 0.6),
    click: () => sample('click', 0.7),
    denied: () => sample('denied', 0.6),
    flip: () => sample('flip', 0.8),
    open: () => sample('open', 0.9),
    coins: () => sample('coins', 0.8),
    page: () => sample('page', 0.6),
  };

  CTD.sfx = function (name, vol) {
    if (!CTD.save || !CTD.save.data || !CTD.save.data.settings.sound) return;
    if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime;
    // 同じ音を同時に鳴らしすぎない
    if (lastPlay[name] && now - lastPlay[name] < 0.05) return;
    lastPlay[name] = now;
    if (MAP[name] && MAP[name]()) return;
    const fn = SFX[name];
    if (fn) fn(vol);
  };

  // ---- BGM(FREE Music Loop Bundle) ----
  const tracks = {};
  let current = null, currentName = null;
  function track(name) {
    if (!tracks[name]) {
      const a = new Audio(CTD.assetURL('audio/bgm_' + name + '.mp3'));
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      tracks[name] = a;
    }
    return tracks[name];
  }
  function fade(a, to, ms, then) {
    const from = a.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) requestAnimationFrame(step); else if (then) then();
    };
    step();
  }
  CTD.music = function (name) {
    const on = CTD.save.data.settings.music;
    const want = on ? name : null;
    if (want === currentName) return;
    if (current) { const old = current; fade(old, 0, 500, () => old.pause()); }
    current = null; currentName = want;
    if (!want) return;
    const a = track(want);
    try { a.currentTime = 0; } catch (e) { /* 読み込み前 */ }
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
    fade(a, 0.45, 700);
    current = a;
  };
  CTD.musicName = () => currentName;

  const _unlock = CTD.audioUnlock;
  CTD.audioUnlock = function () {
    _unlock();
    loadSamples();
    if (current && current.paused) { const p = current.play(); if (p && p.catch) p.catch(() => {}); }
  };
})(window.CTD);
