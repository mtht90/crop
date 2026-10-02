// ============================================================================
// Story scripting: a scene is a list of beats. Non-blocking beats (background,
// weather, music, entrances…) run immediately; `say`, `choice` and `title`
// wait for the player.
// ============================================================================
export type Slot = 'FL' | 'L' | 'C' | 'R' | 'FR';
export type Pan = 'in' | 'out' | 'left' | 'right' | 'up' | 'down' | 'still';
export type Weather = 'none' | 'rain' | 'storm' | 'snow' | 'embers' | 'ash' | 'petals' | 'stars' | 'fog' | 'motes';
export type FxName = 'shake' | 'flash' | 'flashRed' | 'fadeBlack' | 'fadeWhite' | 'unfade' | 'zoomPunch' | 'quake';
export type Style = 'normal' | 'shout' | 'whisper' | 'think';
export type MusicKey = 'title' | 'menu' | 'shop' | 'battle1' | 'battle2' | 'battle3' | 'boss' | 'victory' | 'defeat' | 'stop' | 'sad' | 'revelation' | 'suspense' | 'shadows' | 'journey' | 'love' | 'transience' | 'elegy' | 'silence' | 'legends' | 'knolls' | 'revenge';

export type Beat =
  | { t: 'bg'; key: string; pan?: Pan; fade?: number; tint?: string }
  | { t: 'show'; id: string; at: Slot; mood?: string; enter?: 'slide' | 'fade' | 'drop' | 'rise' }
  | { t: 'hide'; id: string }
  | { t: 'move'; id: string; at: Slot }
  | { t: 'mood'; id: string; mood: string }
  | { t: 'say'; who: string | null; text: string; mood?: string; style?: Style; as?: string }
  | { t: 'fx'; fx: FxName }
  | { t: 'weather'; kind: Weather }
  | { t: 'bgm'; key: MusicKey }
  | { t: 'sfx'; name: string; vol?: number }
  | { t: 'title'; main: string; sub?: string; kicker?: string }
  | { t: 'bars'; on: boolean }
  | { t: 'wait'; ms: number }
  | { t: 'cg'; key: string | null; pan?: Pan; caption?: string }
  | { t: 'cutin'; id: string; mood?: string; line?: string }
  | { t: 'place'; name: string; sub?: string }
  | { t: 'choice'; prompt?: string; options: { label: string; then: Beat[] }[] };

export interface Cast {
  id: string;
  name: string;
  color: string;
  /** mood → art key; "normal" is required */
  look: Record<string, string>;
  /** which way the portrait looks (default: right) — used to make characters face the middle */
  faces?: 'left' | 'right';
}

export interface Chapter {
  id: string;
  act: number;
  /** rival id (decks.ts) the player duels */
  rival: string;
  title: string;
  /** one line shown on the map */
  summary: string;
  /** key art for the chapter select (a painted story image) */
  art?: string;
  before: Beat[];
  after: Beat[];
  /** short scene on the first defeat */
  lose?: Beat[];
}

export interface Act {
  no: number;
  title: string;
  sub: string;
  bg: string;
}
