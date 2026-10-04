import type { CharacterDef } from '../combat/types';
import { arrowChar } from './arrow';
import { blaze } from './blaze';
import { piko } from './piko';
import { star } from './star';

export const characters: Record<string, CharacterDef> = { blaze, star, arrow: arrowChar, piko };

/** Roster slots shown on the select screen; null = not implemented yet. */
export const roster: { id: string | null; label: string; weapon: string }[] = [
  { id: 'blaze', label: 'ブレイズ', weapon: '拳' },
  { id: 'star', label: 'スター', weapon: '二丁拳銃' },
  { id: 'arrow', label: 'アロー', weapon: '弓' },
  { id: 'piko', label: 'ピコ', weapon: 'ハンマー' },
  { id: null, label: '???', weapon: '剣' },
  { id: null, label: '???', weapon: 'ショットガン' },
  { id: null, label: '???', weapon: 'ブーメラン' },
  { id: null, label: '???', weapon: '杖' },
];
