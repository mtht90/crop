// Small builders so scripts read like a screenplay.
import type { Beat, Pan, Slot, Style, Weather, FxName, MusicKey } from './types';

export const bg = (key: string, pan: Pan = 'in', o: { fade?: number; tint?: string } = {}): Beat => ({ t: 'bg', key, pan, ...o });
export const show = (id: string, at: Slot, mood?: string, enter: 'slide' | 'fade' | 'drop' | 'rise' = 'slide'): Beat => ({ t: 'show', id, at, mood, enter });
export const hide = (id: string): Beat => ({ t: 'hide', id });
export const move = (id: string, at: Slot): Beat => ({ t: 'move', id, at });
export const mood = (id: string, m: string): Beat => ({ t: 'mood', id, mood: m });
export const say = (who: string, text: string, m?: string, style?: Style, as?: string): Beat => ({ t: 'say', who, text, mood: m, style, as });
export const shout = (who: string, text: string, m?: string): Beat => say(who, text, m, 'shout');
export const whisper = (who: string, text: string, m?: string): Beat => say(who, text, m, 'whisper');
export const think = (who: string, text: string, m?: string): Beat => say(who, text, m, 'think');
export const narr = (text: string): Beat => ({ t: 'say', who: null, text });
export const fx = (name: FxName): Beat => ({ t: 'fx', fx: name });
export const weather = (kind: Weather): Beat => ({ t: 'weather', kind });
export const bgm = (key: MusicKey): Beat => ({ t: 'bgm', key });
export const sfx = (name: string, vol?: number): Beat => ({ t: 'sfx', name, vol });
export const title = (main: string, sub?: string, kicker?: string): Beat => ({ t: 'title', main, sub, kicker });
export const bars = (on: boolean): Beat => ({ t: 'bars', on });
export const wait = (ms: number): Beat => ({ t: 'wait', ms });
export const choice = (prompt: string, options: { label: string; then: Beat[] }[]): Beat => ({ t: 'choice', prompt, options });
