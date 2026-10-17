import type { Clef } from './model.ts';

// 同梱音源 (MuseScore General SF3) から音質の良いプリセットを厳選して公開する。
export interface InstrumentDef {
  id: string;
  name: string;
  program: number; // General MIDI プログラム番号 (0 始まり)
  clefs: Clef[];
  range: [number, number]; // 実用音域 (MIDI)
  group: string;
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: 'piano', name: 'ピアノ', program: 0, clefs: ['treble', 'bass'], range: [21, 108], group: '鍵盤' },
  { id: 'harpsichord', name: 'チェンバロ', program: 6, clefs: ['treble', 'bass'], range: [29, 89], group: '鍵盤' },
  { id: 'organ', name: 'パイプオルガン', program: 19, clefs: ['treble', 'bass'], range: [24, 96], group: '鍵盤' },
  { id: 'celesta', name: 'チェレスタ', program: 8, clefs: ['treble'], range: [60, 108], group: '鍵盤' },
  { id: 'violin', name: 'ヴァイオリン', program: 40, clefs: ['treble'], range: [55, 103], group: '弦楽器' },
  { id: 'viola', name: 'ヴィオラ', program: 41, clefs: ['alto'], range: [48, 91], group: '弦楽器' },
  { id: 'cello', name: 'チェロ', program: 42, clefs: ['bass'], range: [36, 76], group: '弦楽器' },
  { id: 'contrabass', name: 'コントラバス', program: 43, clefs: ['bass'], range: [28, 67], group: '弦楽器' },
  { id: 'strings', name: '弦楽合奏', program: 48, clefs: ['treble'], range: [28, 103], group: '弦楽器' },
  { id: 'harp', name: 'ハープ', program: 46, clefs: ['treble', 'bass'], range: [24, 103], group: '弦楽器' },
  { id: 'guitar', name: 'クラシックギター', program: 24, clefs: ['treble'], range: [40, 88], group: '弦楽器' },
  { id: 'flute', name: 'フルート', program: 73, clefs: ['treble'], range: [60, 96], group: '木管楽器' },
  { id: 'oboe', name: 'オーボエ', program: 68, clefs: ['treble'], range: [58, 91], group: '木管楽器' },
  { id: 'clarinet', name: 'クラリネット', program: 71, clefs: ['treble'], range: [50, 94], group: '木管楽器' },
  { id: 'bassoon', name: 'ファゴット', program: 70, clefs: ['bass'], range: [34, 75], group: '木管楽器' },
  { id: 'trumpet', name: 'トランペット', program: 56, clefs: ['treble'], range: [54, 84], group: '金管楽器' },
  { id: 'horn', name: 'ホルン', program: 60, clefs: ['treble'], range: [34, 77], group: '金管楽器' },
  { id: 'trombone', name: 'トロンボーン', program: 57, clefs: ['bass'], range: [40, 72], group: '金管楽器' },
  { id: 'choir', name: '合唱 (Aah)', program: 52, clefs: ['treble'], range: [40, 84], group: '声楽' },
  { id: 'marimba', name: 'マリンバ', program: 12, clefs: ['treble', 'bass'], range: [45, 96], group: '打楽器' },
  { id: 'vibraphone', name: 'ヴィブラフォン', program: 11, clefs: ['treble'], range: [53, 89], group: '打楽器' },
];

export function instrumentById(id: string): InstrumentDef {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}
