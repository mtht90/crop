// WebAudio による効果音・簡易BGM（素材ファイル不要の合成音）
let ac = null, master = null, sfxBus = null, bgmBus = null, noiseBuf = null;
let muted = false;
const last = {};

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.6;
  master.connect(comp).connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
  bgmBus = ac.createGain(); bgmBus.gain.value = 0.32; bgmBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, ac.currentTime, 0.02);
}
export function isMuted() { return muted; }

function gate(key, interval) {
  if (!ac || muted) return false;
  const t = ac.currentTime;
  if (last[key] !== undefined && t - last[key] < interval) return false;
  last[key] = t;
  return true;
}

function tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0, attack = 0.005, bus = sfxBus } = {}) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, freq = 1200, q = 0.8, type = 'bandpass', delay = 0, bus = sfxBus } = {}) {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

const PENTA = [0, 1, 5, 7, 8, 12, 13, 17, 19, 20, 24]; // 陰旋法っぽい音階（半音）

export const sfx = {
  shoot() { if (gate('shoot', 0.06)) tone(880 + Math.random() * 120, 0.06, { type: 'triangle', vol: 0.04, slide: 1400 }); },
  hit() { if (gate('hit', 0.035)) noise(0.05, { vol: 0.07, freq: 2400 + Math.random() * 1500, q: 1.2 }); },
  kill() {
    if (!gate('kill', 0.03)) return;
    tone(300 + Math.random() * 300, 0.09, { type: 'square', vol: 0.035, slide: 120 });
    noise(0.08, { vol: 0.05, freq: 900, q: 0.7 });
  },
  gem(chain) {
    if (!gate('gem', 0.025)) return;
    const step = PENTA[Math.min(chain, PENTA.length - 1)];
    tone(660 * Math.pow(2, step / 12), 0.08, { type: 'sine', vol: 0.06 });
  },
  level() {
    if (!ac || muted) return;
    [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.35, { type: 'triangle', vol: 0.12, delay: i * 0.06 }));
    noise(0.6, { vol: 0.08, freq: 6000, q: 0.5, type: 'highpass' });
  },
  summon() {
    if (!gate('summon', 0.12)) return;
    tone(1046, 0.5, { type: 'sine', vol: 0.08 });
    tone(1568, 0.6, { type: 'sine', vol: 0.05, delay: 0.05 });
    noise(0.35, { vol: 0.06, freq: 3000, q: 0.6 });
  },
  thunder() {
    if (!gate('thunder', 0.08)) return;
    noise(0.35, { vol: 0.22, freq: 900, q: 0.4, type: 'lowpass' });
    tone(90, 0.3, { type: 'sawtooth', vol: 0.06, slide: 40 });
  },
  slam() {
    if (!gate('slam', 0.08)) return;
    tone(110, 0.25, { type: 'sine', vol: 0.25, slide: 45 });
    noise(0.2, { vol: 0.1, freq: 400, type: 'lowpass' });
  },
  hurt() {
    if (!gate('hurt', 0.1)) return;
    tone(180, 0.18, { type: 'sawtooth', vol: 0.12, slide: 70 });
  },
  taiko(delay = 0, vol = 0.4) {
    if (!ac || muted) return;
    tone(95, 0.45, { type: 'sine', vol, slide: 50, delay });
    noise(0.08, { vol: vol * 0.3, freq: 300, type: 'lowpass', delay });
  },
  alarm() {
    if (!ac || muted) return;
    for (let i = 0; i < 4; i++) this.taiko(i * 0.22, 0.45);
    tone(220, 1.0, { type: 'sawtooth', vol: 0.05, slide: 200, delay: 0.1 });
  },
  boom() {
    if (!ac || muted) return;
    tone(70, 0.9, { type: 'sine', vol: 0.4, slide: 25 });
    noise(1.0, { vol: 0.3, freq: 600, q: 0.3, type: 'lowpass' });
    noise(0.5, { vol: 0.12, freq: 5000, q: 0.4, type: 'highpass' });
  },
  chest() {
    if (!ac || muted) return;
    [0, 5, 7, 12, 17, 19, 24].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.3, { type: 'square', vol: 0.05, delay: i * 0.07 }));
  },
  select() { if (ac && !muted) tone(1200, 0.08, { type: 'triangle', vol: 0.08 }); },
  heal() { if (ac && !muted) [0, 7, 12].forEach((s, i) => tone(700 * Math.pow(2, s / 12), 0.2, { vol: 0.08, delay: i * 0.05 })); },
};

// ---- 簡易BGM：太鼓＋陰旋法のつま弾き。intensity で密度が上がる ----
let bgmTimer = null, nextBeat = 0, beat = 0;
export const music = {
  intensity: 0,
  start() {
    if (!ac || bgmTimer) return;
    nextBeat = ac.currentTime + 0.1;
    beat = 0;
    bgmTimer = setInterval(() => this.tick(), 50);
  },
  stop() { clearInterval(bgmTimer); bgmTimer = null; },
  tick() {
    if (!ac) return;
    const bpm = 112 + this.intensity * 36;
    const spb = 60 / bpm / 2; // 8分
    while (nextBeat < ac.currentTime + 0.15) {
      const d = nextBeat - ac.currentTime;
      const b = beat % 16;
      if (b === 0 || b === 6 || b === 10 || (this.intensity > 0.5 && b % 4 === 2)) {
        tone(80, 0.4, { type: 'sine', vol: 0.5, slide: 45, delay: d, bus: bgmBus });
      }
      if (b % 4 === 0 || (this.intensity > 0.3 && b % 2 === 1 && Math.random() < 0.4)) {
        noise(0.04, { vol: 0.12, freq: 5000, q: 1, type: 'highpass', delay: d, bus: bgmBus });
      }
      if (Math.random() < 0.28 + this.intensity * 0.25) {
        const n = PENTA[(Math.random() * 8) | 0];
        tone(293.66 * Math.pow(2, n / 12), 0.35, { type: 'triangle', vol: 0.12, delay: d, attack: 0.002, bus: bgmBus });
      }
      nextBeat += spb;
      beat++;
    }
  },
};
