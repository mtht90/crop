import { ACT1, ACT1_CHAPTERS } from './act1';
import { ACT2, ACT2_CHAPTERS } from './act2';
import { ACT3, ACT3_CHAPTERS } from './act3';
import { ACT4, ACT4_CHAPTERS } from './act4';
import { ACT5, ACT5_CHAPTERS } from './act5';
import { PROLOGUE } from './prologue';
import type { Act, Chapter } from './types';

export { CAST } from './cast';
export { PROLOGUE };
export type { Act, Beat, Chapter, Cast } from './types';

export const ACTS: Act[] = [ACT1, ACT2, ACT3, ACT4, ACT5];
export const CHAPTERS: Chapter[] = [...ACT1_CHAPTERS, ...ACT2_CHAPTERS, ...ACT3_CHAPTERS, ...ACT4_CHAPTERS, ...ACT5_CHAPTERS];
// key art per chapter (temporary until the scenario is rewritten)
const ART: Record<string, string> = {
  c01: 'story/p-great-tree', c02: 'story/p-voyage', c03: 'story/p-escape', c04: 'story/p-ambush',
  c05: 'story/p-storms', c06: 'story/p-ridge', c07: 'story/p-dark-pines', c08: 'story/p-midlands',
  c09: 'story/p-temple', c10: 'story/p-snow-hut', c11: 'story/p-fire-sky', c12: 'story/p-castle-winter',
  c13: 'story/p-bride', c14: 'story/p-mourning', c15: 'story/p-hooded', c16: 'story/p-remains',
  c17: 'story/p-frontier', c18: 'story/p-blade', c19: 'story/p-aftermath', c20: 'story/p-elf-wood', c21: 'story/p-hall',
};
for (const c of CHAPTERS) c.art ??= ART[c.id];

export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id);
export const chapterOfRival = (rivalId: string) => CHAPTERS.find((c) => c.rival === rivalId);
