// Audio: Wesnoth SFX/music via Howler + procedural card foley via WebAudio
import { Howl, Howler } from 'howler';
import { asset } from '../lib/assets';
import type { EType, MonsterCard } from '../engine/types';

export type MusicKey = 'title' | 'menu' | 'shop' | 'battle1' | 'battle2' | 'battle3' | 'boss' | 'victory' | 'defeat' | 'sad' | 'revelation' | 'suspense' | 'shadows' | 'journey' | 'love' | 'transience' | 'elegy' | 'silence' | 'legends' | 'knolls' | 'revenge';

const vol = { master: 0.8, music: 0.5, sfx: 0.8 };
const sfxCache = new Map<string, Howl>();
let musicKey: MusicKey | null = null;
let music: Howl | null = null;

export function setVolumes(v: Partial<typeof vol>) {
  Object.assign(vol, v);
  Howler.volume(vol.master);
  if (music) music.volume(vol.music);
}

export function sfx(name: string, volume = 1, rate = 1) {
  let h = sfxCache.get(name);
  if (!h) {
    h = new Howl({ src: [asset(`sfx/${name}.mp3`)], preload: true });
    sfxCache.set(name, h);
  }
  const id = h.play();
  h.volume(Math.min(1, volume * vol.sfx), id);
  if (rate !== 1) h.rate(rate, id);
}

export function playMusic(key: MusicKey, loop = true) {
  if (musicKey === key && music?.playing()) return;
  const old = music;
  if (old) {
    old.fade(old.volume(), 0, 700);
    setTimeout(() => old.unload(), 800);
  }
  musicKey = key;
  music = new Howl({ src: [asset(`music/${key}.mp3`)], loop, html5: true, volume: 0 });
  music.play();
  music.fade(0, vol.music, 1200);
}

export function stopMusic() {
  if (music) {
    const m = music;
    m.fade(m.volume(), 0, 600);
    setTimeout(() => m.unload(), 700);
  }
  music = null;
  musicKey = null;
}

// ---------------------------------------------------------------------------
// Procedural foley (card slides, flips, shuffles)
// ---------------------------------------------------------------------------
let noiseBuf: AudioBuffer | null = null;
function ctx(): AudioContext | null {
  const c = (Howler as unknown as { ctx: AudioContext }).ctx;
  if (!c) return null;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return c;
}

function noise(dur: number, f0: number, f1: number, gain: number, q = 0.8, delay = 0) {
  const c = ctx();
  if (!c || !noiseBuf) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  const peak = gain * vol.sfx * vol.master;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t, Math.random() * 0.2, dur + 0.05);
}

function tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0, slide = 1) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * vol.sfx * vol.master, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const foley = {
  slide: () => noise(0.16, 2400, 900, 0.35, 0.7),
  place: () => {
    noise(0.07, 1800, 600, 0.5, 1.2);
    tone(140, 0.08, 0.12, 'sine', 0, 0.6);
  },
  flip: () => {
    noise(0.05, 3000, 1500, 0.3, 1);
    noise(0.06, 2000, 1000, 0.25, 1, 0.05);
  },
  shuffle: () => {
    for (let i = 0; i < 7; i++) noise(0.05, 2600, 1400, 0.22, 1, i * 0.045);
  },
  hover: () => noise(0.04, 4000, 3000, 0.08, 2),
  chime: (n = 0) => {
    const base = 660 * Math.pow(2, n / 12);
    tone(base, 0.35, 0.12, 'triangle');
    tone(base * 1.5, 0.45, 0.08, 'sine', 0.06);
  },
  sparkle: () => {
    for (let i = 0; i < 6; i++) tone(1200 + Math.random() * 1800, 0.2, 0.05, 'sine', i * 0.05);
  },
  whoosh: () => noise(0.35, 400, 2600, 0.3, 0.6),
  /**
   * paper/foil tear: a bright noise sweep with crackles. `speed` (0 slow … 1
   * fast) shapes it: a quick swipe is a short bright "shak!", a slow pull a
   * longer, lower "shaaa…".
   */
  rip: (speed = 0.6) => {
    const s = Math.min(1, Math.max(0, speed));
    const dur = 0.2 + (1 - s) * 0.38;
    noise(dur, 4200 + s * 2200, 700 + s * 500, 0.45 + s * 0.2, 0.9);
    const n = Math.round(6 + (1 - s) * 8);
    for (let i = 0; i < n; i++) noise(0.03, 3000 + Math.random() * 3000, 1500, 0.22, 2, 0.02 + (i * dur) / n);
    tone(90, 0.25, 0.1 + s * 0.1, 'sine', 0.03, 0.5);
  },
  /** short scrape while the finger drags along the tear line */
  scratch: () => noise(0.05, 4200, 2600, 0.12, 1.5),
  pop: () => {
    tone(520, 0.12, 0.14, 'sine', 0, 1.8);
    noise(0.05, 2500, 1200, 0.15, 1.2);
  },
  tick: () => tone(1400, 0.035, 0.05, 'square', 0, 0.9),
  swipe: () => noise(0.22, 900, 3400, 0.32, 0.7),
  /** rising shimmer that builds suspense before a rare flip */
  charge: () => {
    for (let i = 0; i < 10; i++) tone(400 * Math.pow(2, i / 6), 0.18, 0.04, 'triangle', i * 0.06);
  },
  impact: () => {
    tone(70, 0.5, 0.35, 'sine', 0, 0.4);
    noise(0.3, 1800, 200, 0.4, 0.6);
  },
  rarity: (level: number) => {
    const notes = [0, 4, 7, 12, 16, 19];
    for (let i = 0; i < Math.min(notes.length, 2 + level); i++) tone(523 * Math.pow(2, notes[i] / 12), 0.5, 0.09, 'triangle', i * 0.07);
  },
};

// ---------------------------------------------------------------------------
// Semantic game sounds
// ---------------------------------------------------------------------------
/**
 * Continuous tear sound while the finger cuts the pack: filtered noise whose
 * brightness and loudness follow the finger speed, with crackles.
 */
export function tearLoop() {
  const c = ctx();
  if (!c || !noiseBuf) return null;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.value = 2200;
  const g = c.createGain();
  g.gain.value = 0.0001;
  src.connect(hp).connect(bp).connect(g).connect(c.destination);
  src.start();
  let stopped = false;
  return {
    /** speed: 0 (still) … 1 (a fast swipe) */
    update(speed: number) {
      if (stopped) return;
      const t = c.currentTime;
      const s = Math.min(1, Math.max(0, speed));
      bp.frequency.setTargetAtTime(1500 + s * 4300, t, 0.03);
      g.gain.setTargetAtTime(Math.max(0.0001, (0.03 + s * 0.28) * vol.sfx * vol.master), t, 0.03);
      if (Math.random() < 0.2 + s * 0.5) noise(0.02, 2500 + Math.random() * 3500, 1500, 0.08 + s * 0.18, 2.5);
    },
    idle() {
      if (!stopped) g.gain.setTargetAtTime(0.0001, c.currentTime, 0.05);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = c.currentTime;
      g.gain.setTargetAtTime(0.0001, t, 0.04);
      src.stop(t + 0.3);
    },
  };
}

export const ATTACK_SFX: Record<EType, string[]> = {
  fire: ['flame-big', 'fire', 'melee-fire'],
  water: ['water-blast', 'ink'],
  grass: ['magic-thorns-1', 'magic-thorns-2', 'wose-attack'],
  lightning: ['lightning'],
  psychic: ['magic-faeriefire', 'magic-missile-2', 'wail'],
  fighting: ['fist', 'club', 'mace', 'mud-fist'],
  dark: ['magic-dark', 'claws', 'bite'],
  colorless: ['claws', 'bite', 'tusker-charge', 'tail'],
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function attackSound(t: EType, heavy = false) {
  if (t === 'dark' && heavy) return sfx('magic-dark-big', 0.9);
  sfx(pick(ATTACK_SFX[t]), 0.9);
}

const CRY_RULES: [RegExp, string, string][] = [
  // [art pattern, cry, death]
  [/wolf/, 'wolf-growl-1', 'wolf-die-1'],
  [/gryphon|roc|falcon|herald|raven|harbinger/, 'gryphon-shriek-1', 'gryphon-die-1'],
  [/drakes|dragon|wyvern/, 'drake-hit-1', 'drake-die'],
  [/troll/, 'troll-hit-2', 'troll-die-1'],
  [/ogre/, 'ugg', 'troll-die-1'],
  [/ghost|spectre|wraith|shadow|nightgaunt|jinn|lich/, 'wail-sml', 'lich-die'],
  [/skeleton|revenant|death-knight/, 'skeleton-hit-1', 'skeleton-big-die'],
  [/ghoul/, 'ghoul-hit', 'skeleton-big-die'],
  [/bat/, 'bat-hit-1', 'hiss-die'],
  [/serpent|seahorse|naga|crocodile|kraken|cuttlefish|tentacle/, 'hiss', 'hiss-die'],
  [/wose/, 'wose-hit', 'wose-die'],
  [/yeti|bear|icemonax/, 'yeti-hit', 'troll-die-1'],
  [/horse|nightmare/, 'horse-hit-1', 'horse-die'],
  [/boar|piglet/, 'tusker-hit', 'horse-die'],
  [/mud/, 'mud-glob', 'mud-glob'],
  [/naiad|merfolk/, 'mermaid-hit', 'mermen-die'],
  [/ant|spider|scorpion|scarab|dragonfly/, 'pincers', 'hiss-die'],
  [/fire_/, 'torch', 'fire'],
  [/cat|stoat|rat/, 'bite', 'wolf-die-1'],
  [/caribe|nibbler/, 'bite', 'hiss-die'],
  [/saurian/, 'hiss', 'hiss-die'],
];

export function cry(mc: MonsterCard, death = false) {
  for (const [re, c, d] of CRY_RULES) {
    if (re.test(mc.art)) {
      sfx(death ? d : c, 0.6);
      return;
    }
  }
  sfx(death ? 'squishy-hit' : 'bite', 0.5);
}

export function unlockAudio() {
  const c = ctx();
  if (c && c.state === 'suspended') void c.resume();
}
