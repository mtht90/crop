import { Assets, Texture } from 'pixi.js';
import { ALL_TRACKS, SCENE_TRACKS } from '../data/music';
import { Sound } from './Audio';
import { BOSSES, BOSS_POSES, bossAlias } from '../data/bosses';
import { CHARACTERS } from '../data/characters';
import { loadCharacterArt } from '../art/PieceArt';

const A = './assets';
const JUNGLE = ['topbar', 'band', 'plank', 'plank_s', 'barbg', 'barfill', 'clock', 'paper', 'wood', 'pause', 'play', 'restart', 'menu', 'close', 'settings', 'prize', 'shop', 'ok', 'sound', 'sound_off', 'music', 'music_off', 'next', 'prev', 'circle', 'star', 'heart', 'leaf', 'win', 'lose', 'stars3', 'lock', 'btn_green', 'btn_red', 'btn_yellow', 'btn_blue', 'btn_purple', 'btn_pink', 'off', 'on'];

const SFX = [
  'ui_tap', 'ui_back', 'ui_ok', 'ui_open', 'ui_error', 'tick', 'pluck1', 'drop', 'glass', 'bong', 'hit1', 'hit2', 'hit3', 'hitHeavy', 'bell', 'soft', 'rock', 'powerUp', 'powerUp2', 'phaserUp', 'zap', 'laser', 'highUp', 'lowDown', 'pep', 'cardShuffle', 'cardSlide', 'cardFan', 'chips', 'packOpen', 'diceShake', 'coins', 'switch', 'jWin', 'jLose', 'jFever', 'jStart', 'jSSR', 'jSR', 'jR', 'jN', 'jLevel', 'jTimeUp', 'ko', 'rollEnd',
];

export function tex(alias: string): Texture {
  return Assets.get<Texture>(alias) ?? Texture.WHITE;
}

export async function loadAll(onProgress: (p: number) => void): Promise<void> {
  const list: { alias: string; src: string }[] = [];
  for (const b of BOSSES) for (const p of BOSS_POSES) list.push({ alias: bossAlias(b.id, p), src: `${A}/boss/${b.id}_${p}.webp` });
  for (const n of JUNGLE) list.push({ alias: `jungle:${n}`, src: `${A}/jungle/${n}.png` });
  for (let i = 1; i <= 4; i++) list.push({ alias: `menubg:${i}`, src: `${A}/menubg/${i}.webp` });
  for (const n of ['heart', 'heart_empty', 'coins', 'star']) list.push({ alias: `ui:${n}`, src: `${A}/ui/${n}.webp` });
  for (const a of list) Assets.add(a);
  let texP = 0;
  let sndP = 0;
  const report = () => onProgress(texP * 0.5 + sndP * 0.5);
  const sounds: Record<string, string> = {};
  for (const n of SFX) sounds[n] = `${A}/sfx/${n}.mp3`;
  Sound.registerMusic({
    ...Object.fromEntries(ALL_TRACKS.map((n) => [n, `${A}/bgm/${n}.mp3`])),
    ...Object.fromEntries(Object.entries(SCENE_TRACKS).map(([k, n]) => [k, `${A}/bgm/${n}.mp3`])),
  });
  await Promise.all([
    Assets.load(list.map((a) => a.alias), (p) => {
      texP = p;
      report();
    }),
    Sound.loadAll(sounds, (p) => {
      sndP = p;
      report();
    }),
    loadCustomArt(),
  ]);
}

async function loadCustomArt(): Promise<void> {
  // portraits are small; colored strips load per scene
  await loadCharacterArt(CHARACTERS.map((c) => c.id), { portraits: true });
}

const FAIRY_LAYERS = ['background', 1, 2, 3, 4, 5, 6, 7];
function fairyAliases(set: number): { alias: string; src: string }[] {
  return FAIRY_LAYERS.map((l) => ({ alias: `fairy:${set}_${l}`, src: `${A}/fairy/${set}_${l}.webp` }));
}

// Reference counts: the next scene preloads before the previous one exits, so a
// set shared by both (e.g. retrying a battle) must not be unloaded under it.
const fairyRefs = new Map<number, number>();

/** Loads one Fairy-Tale background set (8 layers). */
export async function loadFairy(set: number): Promise<void> {
  fairyRefs.set(set, (fairyRefs.get(set) ?? 0) + 1);
  const list = fairyAliases(set);
  for (const a of list) if (!Assets.resolver.hasKey(a.alias)) Assets.add(a);
  await Assets.load(list.map((a) => a.alias));
}

/** Frees a background set's GPU memory. */
export async function unloadFairy(set: number): Promise<void> {
  const n = (fairyRefs.get(set) ?? 1) - 1;
  fairyRefs.set(set, Math.max(0, n));
  if (n > 0) return;
  await Assets.unload(fairyAliases(set).map((a) => a.alias)).catch(() => {});
}
