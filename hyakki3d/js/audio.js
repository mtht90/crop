// 効果音・BGM（Ninja Adventure Asset Pack の音源 / CC0）
const SFX_FILES = [
  'hit', 'hit2', 'kill', 'gem', 'shoot', 'arrow', 'slash', 'summon', 'magic', 'thunder', 'slam', 'boom', 'fire',
  'hurt', 'alarm', 'chest', 'heal', 'select', 'move', 'levelup', 'gameover', 'success', 'wings',
];
const BGM = { title: 'bgm_title', stage: 'bgm_stage', wave: 'bgm_wave', boss: 'bgm_boss' };

let ac = null, master = null, sfxBus = null;
let muted = false;
const raw = {};      // name -> ArrayBuffer（先読み）
const buf = {};      // name -> AudioBuffer
const last = {};
const tracks = {};
let curTrack = null;

// 起動直後に音声ファイルを先読みしておく（デコードは AudioContext 生成後）
export function preloadAudio() {
  for (const n of SFX_FILES) {
    fetch(`assets/audio/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => { raw[n] = b; decode(n); }).catch(() => {});
  }
  for (const [k, f] of Object.entries(BGM)) {
    const a = new Audio(`assets/audio/${f}.mp3`);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    tracks[k] = a;
  }
}

function decode(n) {
  if (!ac || !raw[n] || buf[n]) return;
  const b = raw[n];
  raw[n] = null;
  ac.decodeAudioData(b).then((d) => { buf[n] = d; }).catch(() => {});
}

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 5;
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(comp).connect(ac.destination);
  sfxBus = ac.createGain();
  sfxBus.gain.value = 0.7;
  sfxBus.connect(master);
  for (const n of SFX_FILES) decode(n);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.02);
  for (const t of Object.values(tracks)) t.muted = m;
}
export function isMuted() { return muted; }

function play(name, { vol = 1, rate = 1, gap = 0, key = name, delay = 0 } = {}) {
  if (!ac || muted || !buf[name]) return;
  const t = ac.currentTime;
  if (gap && last[key] !== undefined && t - last[key] < gap) return;
  last[key] = t;
  const s = ac.createBufferSource();
  s.buffer = buf[name];
  s.playbackRate.value = rate;
  const g = ac.createGain();
  g.gain.value = vol;
  s.connect(g).connect(sfxBus);
  s.start(t + delay);
}
const jitter = (k = 0.08) => 1 + (Math.random() - 0.5) * k * 2;

export const sfx = {
  shoot() { play('shoot', { vol: 0.25, rate: jitter(0.1) * 1.3, gap: 0.08 }); },
  arrow() { play('arrow', { vol: 0.35, rate: jitter(), gap: 0.1 }); },
  hit() { play(Math.random() < 0.5 ? 'hit' : 'hit2', { vol: 0.22, rate: jitter(0.15), gap: 0.04, key: 'hit' }); },
  kill() { play('kill', { vol: 0.28, rate: jitter(0.2) * 1.2, gap: 0.035 }); },
  gem(chain) { play('gem', { vol: 0.25, rate: Math.min(2.2, 0.9 + chain * 0.06), gap: 0.03 }); },
  level() { play('levelup', { vol: 0.8 }); play('magic', { vol: 0.5 }); },
  summon(kind) { play(kind === 'karasu' ? 'wings' : 'summon', { vol: 0.5, rate: jitter(), gap: 0.12, key: 'summon' }); },
  thunder() { play('thunder', { vol: 0.55, rate: jitter(0.12) * 1.2, gap: 0.08 }); },
  slam() { play('slam', { vol: 0.55, rate: jitter(0.1), gap: 0.08 }); },
  slash() { play('slash', { vol: 0.3, rate: jitter(0.15), gap: 0.06 }); },
  hurt() { play('hurt', { vol: 0.7, gap: 0.12 }); },
  fire() { play('fire', { vol: 0.35, gap: 0.15 }); },
  alarm() { play('alarm', { vol: 0.7 }); play('boom', { vol: 0.35, rate: 0.6, delay: 0.05 }); },
  boom() { play('boom', { vol: 0.8 }); },
  chest() { play('chest', { vol: 0.8 }); play('success', { vol: 0.5, delay: 0.15 }); },
  select() { play('select', { vol: 0.6 }); },
  tick(k = 1) { play('move', { vol: 0.22, rate: 0.9 + k * 0.5, gap: 0.035 }); },
  reelStop(k = 0) { play('gem', { vol: 0.5, rate: 1 + k * 0.15 }); play('slam', { vol: 0.25, rate: 1.6 }); },
  move() { play('move', { vol: 0.4, gap: 0.05 }); },
  heal() { play('heal', { vol: 0.6 }); },
  gameover() { play('gameover', { vol: 0.8 }); },
  win() { play('success', { vol: 0.9 }); },
};

// ---- BGM：場面ごとにフェードで切り替え ----
let fadeTimer = null;
function crossfade(name) {
  if (curTrack === name) return;
  const next = tracks[name], prev = curTrack && tracks[curTrack];
  curTrack = name;
  if (!next) return;
  next.currentTime = 0;
  next.muted = muted;
  next.play().catch(() => {});
  clearInterval(fadeTimer);
  let k = 0;
  fadeTimer = setInterval(() => {
    k = Math.min(1, k + 0.08);
    next.volume = 0.45 * k;
    if (prev) prev.volume = 0.45 * (1 - k);
    if (k >= 1) { clearInterval(fadeTimer); if (prev) prev.pause(); }
  }, 50);
}

let intensity = 0;
export const music = {
  get intensity() { return intensity; },
  set intensity(v) {
    intensity = v;
    if (curTrack === 'boss') return;
    crossfade(v >= 1 ? 'wave' : 'stage');
  },
  start() { intensity = 0; crossfade('stage'); },
  title() { crossfade('title'); },
  boss() { crossfade('boss'); },
  stop() {
    const t = curTrack && tracks[curTrack];
    curTrack = null;
    if (t) t.pause();
  },
};
