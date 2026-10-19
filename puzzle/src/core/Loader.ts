import { Assets, Texture } from 'pixi.js';
import { Sound } from './Audio';
import { bossTex } from '../data/bosses';
import { CHARACTERS } from '../data/characters';
import { COLORS, registerCustomArt } from '../art/PieceArt';

const A = './assets';

const SFX = [
  'ui_tap', 'ui_back', 'ui_ok', 'ui_open', 'ui_error', 'tick', 'pluck1', 'pluck2', 'drop', 'glass', 'bong',
  'hit1', 'hit2', 'hit3', 'hitHeavy', 'bell', 'soft', 'rock', 'plate', 'powerUp', 'powerUp2', 'phaserUp', 'zap',
  'laser', 'highUp', 'lowDown', 'pep', 'cardShuffle', 'cardSlide', 'cardFan', 'chips', 'chipsStack', 'packOpen',
  'diceShake', 'coins', 'coins2', 'switch', 'rollover', 'jWin', 'jLose', 'jFever', 'jStart', 'jSSR', 'jSR', 'jR',
  'jN', 'jLevel', 'jTimeUp',
];
const BGM = ['title', 'battle', 'battle2', 'result', 'gacha'];
const FX = ['circle_05', 'star_06', 'star_04', 'spark_05', 'spark_06', 'flare_01', 'light_01', 'light_03', 'magic_04', 'magic_02', 'smoke_04', 'twirl_02', 'trace_04', 'symbol_02', 'scorch_02', 'flame_04', 'muzzle_02'];
const BG = ['backgroundColorGrass', 'backgroundColorForest', 'backgroundColorFall', 'backgroundColorDesert', 'backgroundCastles'];
const DECO = ['cloud1', 'cloud3', 'cloud5', 'cloud7', 'sun', 'moon'];
const ICONS = ['gear', 'home', 'audioOn', 'audioOff', 'musicOn', 'musicOff', 'star', 'trophy', 'pause', 'return', 'cross', 'checkmark', 'question', 'information', 'plus', 'right', 'left', 'locked', 'fastForward'];
const EMOTES = ['emote_anger', 'emote_exclamation', 'emote_stars', 'emote_heart', 'emote_swirl', 'emote_drops', 'emote_laugh'];

export function tex(alias: string): Texture {
  return Assets.get<Texture>(alias) ?? Texture.WHITE;
}

export async function loadAll(onProgress: (p: number) => void): Promise<void> {
  const list: { alias: string; src: string }[] = [];
  for (const n of FX) list.push({ alias: `fx:${n}`, src: `${A}/fx/${n}.png` });
  for (const n of BG) list.push({ alias: `bg:${n}`, src: `${A}/bg/${n}.jpg` });
  for (const n of DECO) list.push({ alias: `deco:${n}`, src: `${A}/bg/${n}.png` });
  for (const n of ICONS) list.push({ alias: `icon:${n}`, src: `${A}/icons/${n}.png` });
  for (const n of EMOTES) list.push({ alias: `emote:${n}`, src: `${A}/emote/${n}.png` });
  for (const n of bossTex()) list.push({ alias: `mon:${n}`, src: `${A}/monster/${n}` });
  for (const a of list) Assets.add(a);
  let texP = 0;
  let sndP = 0;
  const report = () => onProgress(texP * 0.5 + sndP * 0.5);
  const sounds: Record<string, string> = {};
  for (const n of SFX) sounds[n] = `${A}/sfx/${n}.mp3`;
  for (const n of BGM) sounds[n] = `${A}/bgm/${n}.mp3`;
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

/** Loads optional user-supplied character art (see CharDef.customArt). */
async function loadCustomArt(): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const c of CHARACTERS) {
    if (!c.customArt) continue;
    COLORS.forEach((col, i) => {
      jobs.push(
        Assets.load<Texture>(`${A}/characters/${c.id}/${col.key}.png`)
          .then((t) => registerCustomArt(c.id, i, t))
          .catch(() => console.warn(`missing custom art for ${c.id}/${col.key}`)),
      );
    });
  }
  await Promise.all(jobs);
}
