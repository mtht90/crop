// Audio: Wesnoth SFX/music via Howler + recorded foley (CC0) via Web Audio
import { Howl, Howler } from 'howler';
import { asset } from '../lib/assets';
import type { EType, MonsterCard } from '../engine/types';

export type MusicKey = 'title' | 'menu' | 'shop' | 'packs' | 'opening' | 'workshop' | 'online' | 'battle1' | 'battle2' | 'battle3' | 'boss' | 'victory' | 'defeat' | 'sad' | 'revelation' | 'suspense' | 'shadows' | 'journey' | 'love' | 'transience' | 'elegy' | 'silence' | 'legends' | 'knolls' | 'revenge';

const vol = { master: 0.8, music: 0.5, sfx: 0.8 };
const sfxCache = new Map<string, Howl>();
let musicKey: MusicKey | null = null;

// ---------------------------------------------------------------------------
// Music: one <audio> element, reused for every track, played through Web Audio.
// Streaming keeps memory low (tracks are several MB), and the gain node is what
// makes the volume and fades work on iPhone / iPad, where an <audio> element's
// own volume is read-only. (A new player per screen used to pile up there
// until the browser's pool ran out.)
// ---------------------------------------------------------------------------
interface Deck {
  el: HTMLAudioElement;
  gain: GainNode | null;
}
/** two players, so one track can fade out while the next fades in */
const decks: Deck[] = [];
let cur = 0;
/** the deck playing now (what the rest of this file controls) */
let musicEl: HTMLAudioElement | null = null;
let wantPlay = false;
function makeDeck(): Deck {
  const el = new Audio();
  el.preload = 'auto';
  (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  let gain: GainNode | null = null;
  // make sure the audio context exists: without it the volume cannot be set on iPhone / iPad
  if (!(Howler as unknown as { ctx?: AudioContext }).ctx) Howler.volume(Howler.volume());
  const c = (Howler as unknown as { ctx?: AudioContext }).ctx;
  if (c) {
    try {
      const src = c.createMediaElementSource(el);
      gain = c.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(c.destination);
    } catch {
      gain = null;
    }
  }
  // whenever the current track actually starts (perhaps only after the first tap), bring it up
  el.addEventListener('playing', () => wantPlay && el === musicEl && musicFade(1, CROSS_MS));
  return { el, gain };
}
function musicNodes() {
  if (musicEl) return musicEl;
  decks.push(makeDeck(), makeDeck());
  musicEl = decks[0].el;
  // the first touch anywhere may be what the browser needs before it lets music play
  const kick = () => {
    const ac = (Howler as unknown as { ctx?: AudioContext }).ctx;
    if (ac?.state === 'suspended') void ac.resume();
    if (wantPlay && musicEl?.paused) void musicEl.play().catch(() => {});
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, kick, { passive: true });
  return musicEl;
}
/** how long one track takes to hand over to the next */
const CROSS_MS = 1400;
function fadeDeck(d: Deck, to: number, ms: number) {
  const level = to * vol.music * vol.master;
  // volume 0 really is silent, even where the element's own volume cannot be changed
  d.el.muted = vol.music * vol.master <= 0.001;
  if (d.gain) {
    const g = d.gain.gain;
    const t = d.gain.context.currentTime;
    const from = g.value;
    // hold wherever a fade in progress has got to (no jump), then go on from there
    const hold = (g as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam }).cancelAndHoldAtTime;
    if (hold) hold.call(g, t);
    else g.cancelScheduledValues(t);
    if (ms <= 0) return void g.setValueAtTime(level, t + 0.005);
    // an S-shaped ramp sounds smoother than a straight line
    const n = 24;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = from + (level - from) * (0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)));
    try {
      g.setValueCurveAtTime(curve, t + 0.01, ms / 1000);
    } catch {
      g.setValueAtTime(from, t);
      g.linearRampToValueAtTime(level, t + ms / 1000);
    }
  } else d.el.volume = Math.min(1, level);
}
/** fade the music to a level (0–1 of the music volume) over ms */
function musicFade(to: number, ms: number) {
  const d = decks[cur];
  if (d) fadeDeck(d, to, ms);
}

export function setVolumes(v: Partial<typeof vol>) {
  Object.assign(vol, v);
  Howler.volume(vol.master);
  if (musicEl && !musicEl.paused) musicFade(1, 150);
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

/**
 * a track as a blob URL: the file is fetched whole (so the service worker caches
 * it and later visits never download it again). An <audio> element pointed at
 * the file itself streams it with range requests, which no cache keeps.
 */
const trackUrls = new Map<MusicKey, string>();
async function trackSrc(key: MusicKey): Promise<string> {
  const have = trackUrls.get(key);
  if (have) return have;
  const url = asset(`music/${key}.mp3`);
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = URL.createObjectURL(await res.blob());
    trackUrls.set(key, blob);
    // keep a few tracks in memory; the rest come back from the cache when needed
    while (trackUrls.size > 4) {
      const [old, u] = trackUrls.entries().next().value as [MusicKey, string];
      if (old === musicKey) break;
      trackUrls.delete(old);
      URL.revokeObjectURL(u);
    }
    return blob;
  } catch {
    return url;
  }
}

export function playMusic(key: MusicKey, loop = true) {
  const el = musicNodes();
  wantPlay = true;
  if (musicKey === key) {
    // same track: only make sure it is going (it may still be waiting for a first tap)
    if (el.paused) void el.play().catch(() => {});
    return;
  }
  musicKey = key;
  void (async () => {
    const src = await trackSrc(key);
    if (musicKey !== key) return;
    // the old track fades out on its deck while the new one fades in on the other
    const old = decks[cur];
    const playing = !old.el.paused && !!old.el.src;
    if (playing) {
      cur = 1 - cur;
      fadeDeck(old, 0, CROSS_MS);
      const oldEl = old.el;
      setTimeout(() => {
        if (oldEl !== decks[cur].el) oldEl.pause();
      }, CROSS_MS + 80);
    }
    const d = decks[cur];
    musicEl = d.el;
    d.el.src = src;
    d.el.loop = loop;
    d.el.currentTime = 0;
    fadeDeck(d, 0, 0);
    void d.el.play().catch(() => {});
    if (!d.gain) fadeDeck(d, 1, 0);
  })();
}

export function stopMusic() {
  wantPlay = false;
  musicKey = null;
  if (!musicEl) return;
  const el = musicEl;
  musicFade(0, 900);
  setTimeout(() => {
    if (!wantPlay) el.pause();
  }, 950);
}

// ---------------------------------------------------------------------------
// Foley: card, interface and pack sounds, all recorded files (CC0: Kenney,
// OpenGameArt — see CREDITS.md), decoded once and played through Web Audio so
// they can overlap, be pitched and be looped. Nothing is synthesised.
// ---------------------------------------------------------------------------
function ctx(): AudioContext | null {
  return (Howler as unknown as { ctx?: AudioContext }).ctx ?? null;
}
const FOLEY = [
  'slide1', 'slide2', 'slide3', 'slide4', 'slide5', 'slide6', 'place1', 'place2', 'place3', 'place4', 'flip1', 'flip2', 'flip3', 'flip4',
  'shuffle', 'packopen', 'tick', 'hover', 'chime1', 'chime2', 'chime3', 'chime4', 'sparkle1', 'sparkle2', 'pop', 'scratch',
  'impact', 'blast', 'boom', 'grip', 'thud', 'swell', 'build', 'rumble', 'wind', 'gong1', 'gong2', 'paper1', 'paper2', 'paper3', 'paper4', 'rush', 'whoosh', 'swipe',
] as const;
type FoleyName = (typeof FOLEY)[number];
const bufs = new Map<FoleyName, AudioBuffer>();
const loading = new Map<FoleyName, Promise<AudioBuffer | null>>();
function load(name: FoleyName): Promise<AudioBuffer | null> {
  const have = bufs.get(name);
  if (have) return Promise.resolve(have);
  let p = loading.get(name);
  if (!p) {
    const c = ctx();
    p = fetch(asset(`sfx/foley/${name}.mp3`))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => (c ?? new AudioContext()).decodeAudioData(ab))
      .then((b) => {
        bufs.set(name, b);
        return b;
      })
      .catch(() => null);
    loading.set(name, p);
  }
  return p;
}
let preloaded = false;
function preloadFoley() {
  if (preloaded || !ctx()) return;
  preloaded = true;
  for (const n of FOLEY) void load(n);
}
const level = () => vol.sfx * vol.master;
interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}
/** play a sound now (or, if it is still loading, as soon as it arrives — unless that is too late to matter) */
function play(name: FoleyName, volume = 1, rate = 1, delay = 0, loop = false): Voice | null {
  const c = ctx();
  if (!c) return null;
  preloadFoley();
  const b = bufs.get(name);
  if (!b) {
    const asked = performance.now();
    void load(name).then((got) => got && performance.now() - asked < 250 && play(name, volume, rate, delay, loop));
    return null;
  }
  const src = c.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate;
  src.loop = loop;
  if (loop) {
    // skip the encoder's silence at either end so the loop has no gap
    src.loopStart = Math.min(0.06, b.duration / 4);
    src.loopEnd = Math.max(src.loopStart + 0.1, b.duration - 0.06);
  }
  const gain = c.createGain();
  gain.gain.value = volume * level();
  src.connect(gain).connect(c.destination);
  src.start(c.currentTime + delay, loop ? src.loopStart : 0);
  return { src, gain };
}
const pickN = <T extends string>(base: string, n: number) => `${base}${1 + Math.floor(Math.random() * n)}` as T;
const vary = (r = 0.06) => 1 - r + Math.random() * r * 2;

export const foley = {
  slide: () => play(pickN('slide', 6), 0.55, vary()),
  place: () => play(pickN('place', 4), 0.7, vary()),
  flip: () => play(pickN('flip', 4), 0.55, vary()),
  shuffle: () => play('shuffle', 0.7),
  hover: () => play('hover', 0.12, vary(0.1)),
  /** a soft confirmation; `n` picks one of four */
  chime: (n = 0) => play(`chime${(Math.abs(Math.round(n)) % 4) + 1}` as FoleyName, 0.45),
  sparkle: () => play(pickN('sparkle', 2), 0.35, vary(0.1)),
  whoosh: () => play('whoosh', 0.45, vary()),
  /** the pack tearing: quick swipes are short and bright, slow pulls lower */
  rip: (speed = 0.6) => {
    const s = Math.min(1, Math.max(0, speed));
    play(pickN('paper', 4), 0.65 + s * 0.35, 0.85 + s * 0.35);
    play('thud', 0.25, 1.2, 0.03);
  },
  scratch: () => play('scratch', 0.2, vary(0.12)),
  pop: () => play('pop', 0.45, vary()),
  tick: () => play('tick', 0.35, vary(0.04)),
  swipe: () => play('swipe', 0.45, vary()),
  /** a build-up before a rare card turns over */
  charge: () => play('build', 0.55),
  impact: () => play('impact', 0.95),
  /** a rare card arriving: a bell, deeper and with a boom for the rarest */
  rarity: (lv: number) => {
    if (lv >= 5) {
      play('gong2', 0.7, 0.9);
      play('boom', 0.5);
    } else if (lv >= 4) play('gong1', 0.6);
    else play('gong1', 0.35, 1.25);
  },
  /** a distant low boom */
  boom: (weight = 1) => play('boom', Math.min(1, 0.55 * weight), 1.05 - Math.min(0.25, weight * 0.08)),
  /** a deep swell (the pack diving toward you) */
  swell: () => play('swell', 0.7, 0.8),
  /** a low, wide rush of air */
  rush: () => play('rush', 0.5, 0.75),
  /** a deep, wide blast: the charged pack let go */
  blast: () => play('blast', 0.9),
  /** the best packs: a second, deeper blast */
  gong: () => play('boom', 0.7, 0.85),
  /** a heavy thud as the pack is gripped */
  grip: () => play('impact', 0.5, 1.15),
};

/** load the foley up front (call on the first tap, when sound is allowed) */
export function warmFoley() {
  preloadFoley();
}

// ---------------------------------------------------------------------------
// Semantic game sounds
// ---------------------------------------------------------------------------
/**
 * The pack being charged: a low engine rumble that swells, with a rush of
 * wind drawn in as it nears full. `update(c)` with the charge 0…1 raises its
 * weight and pitch; `stop()` lets it die away.
 */
export function chargeLoop() {
  const c = ctx();
  if (!c) return null;
  const hum = play('rumble', 0, 0.85, 0, true);
  const air = play('wind', 0, 0.7, 0, true);
  if (!hum || !air) {
    hum?.src.stop();
    air?.src.stop();
    return null;
  }
  const t0 = c.currentTime;
  hum.gain.gain.setTargetAtTime(0.45 * level(), t0, 0.12);
  let stopped = false;
  return {
    update(charge: number) {
      if (stopped) return;
      const t = c.currentTime;
      const k = Math.min(1, Math.max(0, charge));
      hum.src.playbackRate.setTargetAtTime(0.85 + k * 0.45, t, 0.1);
      hum.gain.gain.setTargetAtTime((0.45 + k * 0.55) * level(), t, 0.1);
      air.src.playbackRate.setTargetAtTime(0.7 + k * 0.5, t, 0.1);
      air.gain.gain.setTargetAtTime(k * k * 0.35 * level(), t, 0.1);
    },
    stop(fade = 0.25) {
      if (stopped) return;
      stopped = true;
      const t = c.currentTime;
      for (const v of [hum, air]) {
        v.gain.gain.setTargetAtTime(0.0001, t, fade / 3);
        v.src.stop(t + fade + 0.3);
      }
    },
  };
}

/**
 * The tear while the finger cuts: bursts of paper that come faster and louder
 * with the finger speed.
 */
export function tearLoop() {
  if (!ctx()) return null;
  let last = 0;
  let stopped = false;
  return {
    /** speed: 0 (still) … 1 (a fast swipe) */
    update(speed: number) {
      if (stopped) return;
      const s = Math.min(1, Math.max(0, speed));
      const now = performance.now();
      if (s < 0.08 || now - last < 170 - s * 110) return;
      last = now;
      play(pickN('paper', 4), 0.25 + s * 0.6, 0.9 + s * 0.3);
    },
    idle() {},
    stop() {
      stopped = true;
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
  preloadFoley();
}

// ----------------------------------------------------------------------------
// The app put away (home button, another app, the phone sleeping): silence
// everything at once, and bring the music back when it returns.
// ----------------------------------------------------------------------------
let asleep = false;
function sleepAudio() {
  if (asleep) return;
  asleep = true;
  try {
    for (const d of decks) d.el.pause();
  } catch {
    /* nothing playing */
  }
  const c = ctx();
  if (c && c.state === 'running') void c.suspend();
  Howler.mute(true);
}
function wakeAudio() {
  if (!asleep) return;
  asleep = false;
  Howler.mute(false);
  const c = ctx();
  if (c && c.state === 'suspended') void c.resume();
  if (wantPlay && musicEl?.paused) {
    fadeDeck(decks[cur], 0, 0);
    void musicEl
      .play()
      .then(() => musicFade(1, 900))
      .catch(() => {});
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => (document.hidden ? sleepAudio() : wakeAudio()));
  // iOS home-screen apps sometimes only send pagehide / freeze when put away
  window.addEventListener('pagehide', sleepAudio);
  document.addEventListener('freeze', sleepAudio);
  window.addEventListener('pageshow', () => !document.hidden && wakeAudio());
  document.addEventListener('resume', () => !document.hidden && wakeAudio());
}

// ----------------------------------------------------------------------------
// Sharing the speaker with other apps. As an ordinary player the game takes the
// phone's audio over, which pauses whatever else is playing (a YouTube video in
// picture-in-picture stops). As "ambient" sound it plays alongside instead.
// (Safari 16.4+; elsewhere this does nothing.)
// ----------------------------------------------------------------------------
export function setAudioMix(mix: boolean) {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (!nav.audioSession) return;
  try {
    nav.audioSession.type = mix ? 'ambient' : 'auto';
  } catch {
    /* not allowed here */
  }
}
