// 効果音は WebAudio でその場合成（外部ファイルなし）
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function initAudio() {
  if (ctx) { void ctx.resume(); return; }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}
export function setMuted(m: boolean) { muted = m; }

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.5, delay = 0) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur: number, vol = 0.4, freq = 1200) {
  if (!ctx || !master || muted) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(master);
  s.start();
}

export const sfx = {
  hit: () => { noise(0.08, 0.35, 1800); tone('square', 220, 90, 0.08, 0.2); },
  shoot: () => tone('triangle', 880, 320, 0.12, 0.25),
  skill: () => { tone('sawtooth', 300, 900, 0.18, 0.25); noise(0.15, 0.2, 3000); },
  ult: () => { tone('sawtooth', 160, 1200, 0.5, 0.35); tone('square', 80, 40, 0.6, 0.3); noise(0.5, 0.3, 900); },
  boom: () => { noise(0.35, 0.6, 500); tone('sine', 120, 40, 0.35, 0.5); },
  capture: () => { tone('triangle', 523, 523, 0.12, 0.35); tone('triangle', 659, 659, 0.12, 0.35, 0.1); tone('triangle', 784, 784, 0.25, 0.35, 0.2); },
  lost: () => { tone('triangle', 440, 440, 0.14, 0.3); tone('triangle', 330, 330, 0.3, 0.3, 0.13); },
  down: () => tone('sawtooth', 400, 60, 0.45, 0.3),
  ui: () => tone('triangle', 700, 900, 0.07, 0.25),
  tick: () => tone('square', 1000, 1000, 0.05, 0.15),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.3, 0.35, i * 0.14)),
  lose: () => [392, 330, 262].forEach((f, i) => tone('triangle', f, f, 0.4, 0.35, i * 0.2)),
};
