import type { CharacterDef } from '../combat/types';
import { ameri } from './ameri';
import { arrowChar } from './arrow';
import { blaze } from './blaze';
import { kagetsu } from './kagetsu';
import { lala } from './lala';
import { piko } from './piko';
import { star } from './star';
import { zip } from './zip';

export const characters: Record<string, CharacterDef> = { blaze, star, arrow: arrowChar, piko, kagetsu, lala, zip, ameri };

/** Roster order on the select screen. */
export const roster: { id: string; label: string; weapon: string }[] = [
  { id: 'blaze', label: 'ブレイズ', weapon: '拳' },
  { id: 'star', label: 'スター', weapon: '二丁拳銃' },
  { id: 'arrow', label: 'アロー', weapon: '弓' },
  { id: 'piko', label: 'ピコ', weapon: 'ハンマー' },
  { id: 'kagetsu', label: 'カゲツ', weapon: '日本刀' },
  { id: 'lala', label: 'ララ', weapon: 'ヨーヨー' },
  { id: 'zip', label: 'ジップ', weapon: 'グラップラー' },
  { id: 'ameri', label: 'アメリ', weapon: '傘' },
];
