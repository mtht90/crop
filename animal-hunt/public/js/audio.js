// WebAudio で合成する効果音。外部アセットは使わない。

let ctx = null;
let master = null;
let curVol = 1;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ freq = 440, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, slide = 0, delay = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol * curVol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.3, freq = 1200, q = 1, delay = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol * curVol;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

const MUSIC_BOX = [1046, 1318, 1568, 1318, 1760, 1568, 1318, 1046];

const SOUNDS = {
  heartbeat: () => {
    tone({ freq: 60, type: 'sine', dur: 0.18, vol: 0.9, slide: 0.6 });
    tone({ freq: 55, type: 'sine', dur: 0.2, vol: 0.7, slide: 0.6, delay: 0.2 });
  },
  skill_warn: () => tone({ freq: 1320, type: 'triangle', dur: 0.15, vol: 0.25 }),
  skill_great: () => {
    tone({ freq: 1568, type: 'triangle', dur: 0.12, vol: 0.25 });
    tone({ freq: 2093, type: 'triangle', dur: 0.2, vol: 0.25, delay: 0.08 });
  },
  skill_good: () => tone({ freq: 1046, type: 'triangle', dur: 0.15, vol: 0.2 }),
  skill_miss: () => tone({ freq: 200, type: 'square', dur: 0.35, vol: 0.2, slide: 0.5 }),
  boing: () => tone({ freq: 220, type: 'square', dur: 0.4, vol: 0.2, slide: 0.4 }),
  swoosh: () => noise({ dur: 0.18, vol: 0.4, freq: 2400, q: 0.8 }),
  dash: () => noise({ dur: 0.45, vol: 0.5, freq: 600, q: 0.6 }),
  hit: () => {
    tone({ freq: 520, type: 'square', dur: 0.12, vol: 0.25, slide: 0.5 });
    noise({ dur: 0.12, vol: 0.4, freq: 900 });
  },
  down: () => {
    tone({ freq: 440, type: 'sawtooth', dur: 0.5, vol: 0.2, slide: 0.3 });
  },
  pallet: () => {
    noise({ dur: 0.3, vol: 0.6, freq: 300, q: 0.7 });
    tone({ freq: 90, type: 'sine', dur: 0.3, vol: 0.5 });
  },
  crack: () => {
    noise({ dur: 0.25, vol: 0.6, freq: 1500, q: 2 });
    noise({ dur: 0.2, vol: 0.4, freq: 700, q: 2, delay: 0.08 });
  },
  stun: () => {
    for (let i = 0; i < 3; i++) tone({ freq: 1800 - i * 300, type: 'sine', dur: 0.15, vol: 0.15, delay: i * 0.1 });
  },
  bonk: () => tone({ freq: 160, type: 'square', dur: 0.25, vol: 0.3, slide: 0.5 }),
  kick: () => {
    noise({ dur: 0.2, vol: 0.5, freq: 400 });
    tone({ freq: 300, type: 'square', dur: 0.3, vol: 0.12, slide: 0.6 });
  },
  pickup: () => tone({ freq: 300, type: 'triangle', dur: 0.25, vol: 0.25, slide: 1.5 }),
  cage: () => {
    tone({ freq: 880, type: 'square', dur: 0.1, vol: 0.12 });
    tone({ freq: 660, type: 'square', dur: 0.2, vol: 0.12, delay: 0.1 });
  },
  unhook: () => {
    for (let i = 0; i < 4; i++) tone({ freq: 660 + i * 220, type: 'triangle', dur: 0.12, vol: 0.18, delay: i * 0.07 });
  },
  balloon: () => tone({ freq: 400, type: 'sine', dur: 1.2, vol: 0.2, slide: 2.5 }),
  gen_done: () => {
    MUSIC_BOX.forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.5, vol: 0.18, delay: i * 0.13 }));
  },
  power: () => {
    tone({ freq: 220, type: 'sawtooth', dur: 1.2, vol: 0.12, slide: 4 });
  },
  gate: () => {
    tone({ freq: 523, type: 'triangle', dur: 0.4, vol: 0.2 });
    tone({ freq: 784, type: 'triangle', dur: 0.6, vol: 0.2, delay: 0.15 });
  },
  hatch: () => tone({ freq: 300, type: 'sine', dur: 0.8, vol: 0.2, slide: 0.5 }),
  escape: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.18, delay: i * 0.1 }));
  },
  howl: () => {
    tone({ freq: 380, type: 'sawtooth', dur: 1.4, vol: 0.12, slide: 1.6, attack: 0.3 });
    tone({ freq: 384, type: 'sine', dur: 1.4, vol: 0.2, slide: 1.55, attack: 0.3 });
  },
  rustle: () => noise({ dur: 0.4, vol: 0.4, freq: 3000, q: 0.5 }),
  repair: () => tone({ freq: MUSIC_BOX[Math.floor(Math.random() * MUSIC_BOX.length)], type: 'sine', dur: 0.4, vol: 0.06 }),
};

export function play(name, vol = 1) {
  if (!ctx || vol <= 0.01) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  curVol = vol;
  fn();
  curVol = 1;
}

// 距離で音量を下げる
export function playAt(name, x, y, lx, ly, range = 20) {
  const d = Math.hypot(x - lx, y - ly);
  const v = Math.max(0, 1 - d / range);
  play(name, v * v);
}
