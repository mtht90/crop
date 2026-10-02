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
export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id);
export const chapterOfRival = (rivalId: string) => CHAPTERS.find((c) => c.rival === rivalId);
