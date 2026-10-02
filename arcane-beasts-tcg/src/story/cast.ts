import { RIVALS } from '../engine/decks';
import type { Cast } from './types';

const TYPE_COLOR: Record<string, string> = {
  grass: '#8be26c',
  water: '#6cc4ff',
  lightning: '#ffe066',
  fighting: '#e3a36a',
  fire: '#ff8a5c',
  wolf: '#c9ced9',
  psychic: '#d79cff',
  dark: '#b79cff',
  swarm: '#a5e06c',
  troll: '#e3a36a',
  naga: '#5fe0cf',
  dragoon: '#ffc245',
  lich: '#b79cff',
  frost: '#a8e6ff',
  wyrm: '#8be26c',
  night: '#ff7a9c',
  sunfolk: '#ffb36c',
  mine: '#9cc4ff',
  horde: '#e3a36a',
  highelf: '#9be27c',
  shadow: '#d99cff',
};

/** every character who can appear in a scene */
export const CAST: Record<string, Cast> = {
  alto: {
    id: 'alto',
    name: 'アルト',
    color: '#8fd0ff',
    look: { normal: 'camp/konrad', glad: 'camp/konrad-glad', mad: 'camp/konrad-mad', worry: 'camp/konrad-concerned' },
  },
  olden: {
    id: 'olden',
    name: 'オルデン',
    color: '#c4a4ff',
    look: { normal: 'camp/delfador', mad: 'camp/delfador-mad', teach: 'camp/delfador-mentoring' },
  },
  liese: {
    id: 'liese',
    name: 'リーゼ',
    color: '#ffd27a',
    look: { normal: 'camp/lisar', glad: 'camp/lisar-glad', mad: 'camp/lisar-mad', hurt: 'camp/lisar-defeat' },
  },
  asha: {
    id: 'asha',
    name: '影の女王',
    color: '#d99cff',
    look: { normal: 'camp/asheviere', mad: 'camp/asheviere-mad', defeated: 'camp/asheviere-defeated' },
  },
};

for (const r of RIVALS) {
  if (!CAST[r.id]) CAST[r.id] = { id: r.id, name: r.name, color: TYPE_COLOR[r.deck] ?? '#e8ecff', look: { normal: r.portrait } };
}
