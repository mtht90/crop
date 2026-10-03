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
  elder: '#c4a4ff',
};

/** looks the player can choose for their character */
export const HERO_LOOKS: { id: string; label: string; look: Record<string, string> }[] = [
  { id: 'konrad', label: '若き剣士', look: { normal: 'camp/konrad', glad: 'camp/konrad-glad', mad: 'camp/konrad-mad', worry: 'camp/konrad-concerned' } },
  { id: 'lady', label: 'エルフの姫', look: { normal: 'elves/lady' } },
];
export const DEFAULT_HERO = { name: 'あなた', look: 'konrad' };

/** every character who can appear in a scene */
export const CAST: Record<string, Cast> = {
  hero: { id: 'hero', name: DEFAULT_HERO.name, color: '#8fd0ff', look: HERO_LOOKS[0].look },
  liese: {
    id: 'liese',
    name: 'リーゼ',
    color: '#ffd27a',
    look: { normal: 'camp/lisar', glad: 'camp/lisar-glad', mad: 'camp/lisar-mad', hurt: 'camp/lisar-defeat' },
  },
  olden: {
    id: 'olden',
    name: 'オルデン',
    color: '#c4a4ff',
    look: { normal: 'camp/delfador', mad: 'camp/delfador-mad', teach: 'camp/delfador-mentoring', young: 'humans/mage-silver' },
  },
  berta: { id: 'berta', name: 'パン屋のベルタ', color: '#ffc9a0', look: { normal: 'humans/mage-white+female' } },
  bandit: { id: 'bandit', name: '野盗', color: '#c9b49a', look: { normal: 'humans/footpad' } },
  agent: { id: 'agent', name: '黒衣の女', color: '#ff7a9c', look: { normal: 'humans/assassin+female' } },
  cultist: { id: 'cultist', name: '信徒', color: '#a8b8ff', look: { normal: 'humans/dark-adept' } },
};

for (const r of RIVALS) {
  if (!CAST[r.id]) CAST[r.id] = { id: r.id, name: r.name, color: TYPE_COLOR[r.deck] ?? '#e8ecff', look: { normal: r.portrait } };
}

/** the cast with the player's own character filled in */
export function castFor(hero?: { name: string; look: string }): Record<string, Cast> {
  const h = hero ?? DEFAULT_HERO;
  const look = (HERO_LOOKS.find((x) => x.id === h.look) ?? HERO_LOOKS[0]).look;
  return { ...CAST, hero: { ...CAST.hero, name: h.name, look } };
}
