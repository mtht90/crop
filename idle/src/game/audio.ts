// Tiny synthesized sound effects (no audio assets needed). Soft, short, and rate-limited.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
const last: Record<string, number> = {};

export function setSound(on: boolean) {
  enabled = on;
}
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur: number, vol: number, hp = 800, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

function gate(key: string, ms: number) {
  if (!enabled || !ctx || document.hidden) return false;
  const now = performance.now();
  if ((last[key] ?? 0) + ms > now) return false;
  last[key] = now;
  return true;
}

export const sfx = {
  hit() {
    if (gate('hit', 70)) noise(0.06, 0.18, 1800);
  },
  crit() {
    if (!gate('crit', 90)) return;
    noise(0.08, 0.25, 1200);
    tone(880, 0.08, 'triangle', 0.08, 1.5);
  },
  shoot() {
    if (gate('shoot', 90)) tone(620, 0.07, 'triangle', 0.05, 1.6);
  },
  coin() {
    if (!gate('coin', 60)) return;
    tone(1320, 0.06, 'square', 0.03);
    tone(1760, 0.08, 'square', 0.03, 1, 0.05);
  },
  kill() {
    if (gate('kill', 80)) tone(420, 0.16, 'sine', 0.08, 0.45);
  },
  skill() {
    if (!gate('skill', 150)) return;
    tone(520, 0.18, 'sine', 0.08, 2);
    tone(780, 0.22, 'triangle', 0.05, 1.5, 0.05);
  },
  boom() {
    if (!gate('boom', 120)) return;
    noise(0.35, 0.3, 200);
    tone(110, 0.3, 'sine', 0.15, 0.5);
  },
  heal() {
    if (!gate('heal', 300)) return;
    [660, 880, 990].forEach((f, i) => tone(f, 0.16, 'sine', 0.05, 1, i * 0.06));
  },
  hurt() {
    if (gate('hurt', 160)) tone(200, 0.1, 'sawtooth', 0.04, 0.7);
  },
  bossIntro() {
    if (!gate('bossIntro', 1000)) return;
    tone(110, 0.6, 'sawtooth', 0.06, 0.8);
    tone(165, 0.6, 'sawtooth', 0.05, 0.8, 0.15);
    noise(0.5, 0.12, 300, 0.1);
  },
  win() {
    if (!gate('win', 800)) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, 1, i * 0.09));
  },
  lose() {
    if (!gate('lose', 800)) return;
    [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.07, 1, i * 0.14));
  },
  click() {
    if (gate('click', 40)) tone(900, 0.04, 'triangle', 0.05, 1.2);
  },
  levelUp() {
    if (!gate('lv', 60)) return;
    tone(700, 0.08, 'triangle', 0.05, 1.4);
  },
  orb() {
    if (!gate('orb', 200)) return;
    [880, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'sine', 0.05, 1, i * 0.07));
  },
  gacha(r: number) {
    if (!gate('gacha' + r, 50)) return;
    const base = [0, 440, 523, 659, 784, 988][r] ?? 440;
    tone(base, 0.25, 'triangle', 0.08, 1.2);
    if (r >= 4) [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m, 0.3, 'sine', 0.05, 1, 0.08 + i * 0.08));
  },
};
