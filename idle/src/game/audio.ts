// Sound effects (Kenney, CC0) and music (OpenGameArt, CC0) — files listed in src/data/assets.ts.
import { audioUrl, manifest } from '../render/sprites';

let ctx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
let seOn = true;
let musicOn = true;
const buffers = new Map<string, AudioBuffer | 'loading'>();
const last: Record<string, number> = {};
let bgm: HTMLAudioElement | null = null;
let bgmTrack = '';
let wantTrack = 'field';

export function setSound(on: boolean) {
  seOn = on;
}
export function setMusic(on: boolean) {
  musicOn = on;
  if (!on) bgm?.pause();
  else playMusic(wantTrack, true);
}

export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.55;
      sfxGain.connect(ctx.destination);
      for (const files of Object.values(manifest.sfx)) files.forEach(load);
    } catch {
      ctx = null;
    }
  } else if (ctx.state === 'suspended') ctx.resume();
  if (musicOn && (!bgm || bgm.paused)) playMusic(wantTrack, true);
}

function load(file: string) {
  if (!ctx || buffers.has(file)) return;
  buffers.set(file, 'loading');
  fetch(audioUrl(file))
    .then((r) => r.arrayBuffer())
    .then((b) => ctx!.decodeAudioData(b))
    .then((buf) => buffers.set(file, buf))
    .catch(() => buffers.delete(file));
}

function play(name: string, gapMs: number, vol = 1, rate = 1) {
  if (!seOn || !ctx || !sfxGain || document.hidden) return;
  const now = performance.now();
  if ((last[name] ?? 0) + gapMs > now) return;
  last[name] = now;
  const files = manifest.sfx[name];
  if (!files?.length) return;
  const buf = buffers.get(files[Math.floor(Math.random() * files.length)]);
  if (!buf || buf === 'loading') return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(sfxGain);
  src.start();
}

/** 'field' | 'boss' */
export function playMusic(track: string, force = false) {
  wantTrack = track;
  if (!musicOn || !ctx) return;
  if (bgmTrack === track && bgm && !bgm.paused && !force) return;
  const file = manifest.music[track];
  if (!file) return;
  if (bgmTrack !== track || !bgm) {
    bgm?.pause();
    bgm = new Audio(audioUrl(file));
    bgm.loop = true;
    bgm.volume = track === 'boss' ? 0.32 : 0.26;
    bgmTrack = track;
  }
  bgm.play().catch(() => {
    /* needs a user gesture first */
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) bgm?.pause();
  else if (musicOn && ctx) bgm?.play().catch(() => {});
});

export const sfx = {
  hit: () => play('hit', 80, 0.35),
  crit: () => play('crit', 100, 0.6),
  shoot: () => play('shoot', 110, 0.3),
  coin: () => play('coin', 160, 0.25),
  kill: () => play('kill', 90, 0.4),
  skill: () => play('skill', 160, 0.5),
  boom: () => play('boom', 140, 0.7),
  heal: () => play('heal', 300, 0.45),
  hurt: () => play('hurt', 180, 0.35),
  bossIntro: () => play('bossIntro', 1000, 0.7),
  win: () => play('win', 800, 0.7),
  lose: () => play('lose', 800, 0.7),
  click: () => play('click', 40, 0.5),
  levelUp: () => play('levelUp', 60, 0.4),
  orb: () => play('orb', 200, 0.5),
  gacha: (r: number) => (r >= 4 ? play('pullRare', 400, 0.7) : play('pull', 60, 0.4, 0.9 + r * 0.08)),
};
