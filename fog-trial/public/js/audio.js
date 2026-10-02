// 効果音。基本は外部素材 (Kenney, CC0) を使い、該当する素材が無い
// 心音とスキルチェック音だけ WebAudio で合成する。

let ctx = null;
let master = null;
const buffers = new Map();
let ambience = null;

const FILES = [
  'footstep',
  'land',
  'pallet_break',
  'gen_done',
  'swing',
  'hit',
  'down',
  'ambience',
  'pallet',
  'hook',
  'unhook',
  'ui',
  'stun',
  'dash',
  'gen_loop',
];

// ゲーム内イベント名 → 素材名と再生設定
const MAP = {
  swoosh: { file: 'swing', vol: 0.7 },
  dash: { file: 'dash', vol: 0.8 },
  hit: { file: 'hit', vol: 1 },
  down: { file: 'down', vol: 0.9 },
  pallet: { file: 'pallet', vol: 1, rate: 0.7 },
  crack: { file: 'pallet_break', vol: 1 },
  stun: { file: 'stun', vol: 1 },
  bonk: { file: 'stun', vol: 0.8, rate: 0.8 },
  kick: { file: 'pallet_break', vol: 0.7, rate: 0.6 },
  pickup: { file: 'land', vol: 0.8 },
  cage: { file: 'hook', vol: 1, rate: 0.8 },
  unhook: { file: 'unhook', vol: 1 },
  sacrifice: { file: 'down', vol: 1, rate: 0.6 },
  gen_done: { file: 'gen_done', vol: 0.9, rate: 0.6 },
  power: { file: 'gen_done', vol: 1, rate: 0.4 },
  gate: { file: 'unhook', vol: 1, rate: 0.7 },
  hatch: { file: 'pallet', vol: 0.8, rate: 0.5 },
  escape: { file: 'gen_done', vol: 0.8, rate: 1.2 },
  howl: { file: 'dash', vol: 1, rate: 0.5 },
  rustle: { file: 'land', vol: 0.8, rate: 0.7 },
  boing: { file: 'stun', vol: 0.7, rate: 1.4 },
  footstep: { file: 'footstep', vol: 0.35 },
  gen_hum: { file: 'gen_loop', vol: 1, rate: 0.6 },
  ui: { file: 'ui', vol: 0.6 },
};

let volume = 0.7;

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    loadAll();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

async function loadAll() {
  await Promise.all(
    FILES.map(async (name) => {
      try {
        const res = await fetch(`assets/sounds/${name}.mp3`);
        const data = await res.arrayBuffer();
        buffers.set(name, await ctx.decodeAudioData(data));
      } catch {
        /* デコードできない端末では無音 */
      }
    }),
  );
}

function playBuffer(name, vol = 1, rate = 1, loop = false) {
  const buf = buffers.get(name);
  if (!ctx || !buf) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate * (0.95 + Math.random() * 0.1);
  src.loop = loop;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start();
  return { src, gain: g };
}

function tone({ freq = 440, type = 'sine', dur = 0.2, vol = 0.3, slide = 0, delay = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const SYNTH = {
  heartbeat: (v) => {
    tone({ freq: 58, dur: 0.18, vol: 0.9 * v, slide: 0.6 });
    tone({ freq: 52, dur: 0.2, vol: 0.7 * v, slide: 0.6, delay: 0.2 });
  },
  skill_warn: () => tone({ freq: 1320, type: 'triangle', dur: 0.15, vol: 0.25 }),
  skill_great: () => {
    tone({ freq: 1568, type: 'triangle', dur: 0.12, vol: 0.25 });
    tone({ freq: 2093, type: 'triangle', dur: 0.2, vol: 0.25, delay: 0.08 });
  },
  skill_good: () => tone({ freq: 1046, type: 'triangle', dur: 0.15, vol: 0.2 }),
  skill_miss: () => tone({ freq: 160, type: 'square', dur: 0.4, vol: 0.18, slide: 0.5 }),
};

export function play(name, vol = 1) {
  if (!ctx || vol <= 0.01) return;
  if (SYNTH[name]) return SYNTH[name](vol);
  const m = MAP[name];
  if (m) playBuffer(m.file, m.vol * vol, m.rate || 1);
}

// 距離で音量を下げる
export function playAt(name, x, y, lx, ly, range = 20) {
  const d = Math.hypot(x - lx, y - ly);
  const v = Math.max(0, 1 - d / range);
  play(name, v * v);
}

export function startAmbience() {
  if (!ctx || ambience) return;
  if (!buffers.get('ambience')) {
    setTimeout(startAmbience, 500);
    return;
  }
  ambience = playBuffer('ambience', 0.25, 0.7, true);
}

export function stopAmbience() {
  if (ambience) {
    ambience.src.stop();
    ambience = null;
  }
}

// 追跡中の緊張感 (キラーが近いほど低音のうなりが強くなる)
let chase = null;
export function setChase(intensity) {
  if (!ctx) return;
  if (!chase) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.Q.value = 6;
    const oscs = [55, 55.6, 82.4].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.connect(filter);
      o.start();
      return o;
    });
    // ゆっくり揺れるフィルター
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.35;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    filter.connect(gain).connect(master);
    chase = { gain, filter, oscs };
  }
  const t = ctx.currentTime;
  chase.gain.gain.setTargetAtTime(Math.min(1, intensity) * 0.16, t, 0.5);
  chase.filter.frequency.setTargetAtTime(260 + intensity * 900, t, 0.5);
}

// ループ再生する環境音 (修理済み発電機のうなり等)
const loops = new Map();
export function setLoop(name, vol) {
  if (!ctx) return;
  let l = loops.get(name);
  if (!l) {
    if (vol <= 0.001 || !buffers.get(MAP[name]?.file || name)) return;
    l = playBuffer(MAP[name]?.file || name, 0, MAP[name]?.rate || 1, true);
    if (!l) return;
    loops.set(name, l);
  }
  l.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.3);
}

export function stopLoops() {
  for (const l of loops.values()) l.src.stop();
  loops.clear();
  setChase(0);
}
