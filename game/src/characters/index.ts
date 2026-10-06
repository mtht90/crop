import type { CharacterDef } from '../combat/types';
import { ameri } from './ameri';
import { arrowChar } from './arrow';
import { blaze } from './blaze';
import { don } from './don';
import { kagetsu } from './kagetsu';
import { lala } from './lala';
import { piko } from './piko';
import { rei } from './rei';
import { star } from './star';
import { trick } from './trick';
import { zip } from './zip';

export const characters: Record<string, CharacterDef> = { blaze, star, arrow: arrowChar, piko, kagetsu, lala, zip, ameri, don, trick, rei };

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
  { id: 'don', label: 'ドン', weapon: '腕キャノン' },
  { id: 'trick', label: 'トリック', weapon: 'トランプ' },
  { id: 'rei', label: 'レイ', weapon: '狙撃銃' },
];
