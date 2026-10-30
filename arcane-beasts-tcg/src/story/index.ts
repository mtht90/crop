import { ACT1_CHAPTERS } from './act1';
import { ACT2_CHAPTERS } from './act2';
import { ACT3_CHAPTERS } from './act3';
import { ACT4_CHAPTERS } from './act4';
import { PROLOGUE } from './prologue';
import type { Chapter } from './types';

export { CAST, castFor, HERO_LOOKS, DEFAULT_HERO } from './cast';
export { PROLOGUE };
export type { Beat, Chapter, Cast } from './types';

/** the chapters (章) of the story; each is twelve episodes (話) */
export const PARTS: { no: number; name: string; title: string }[] = [{ no: 1, name: '第一章', title: '十二枚の伝説' }];
/** every episode, in order */
export const CHAPTERS: Chapter[] = [...ACT1_CHAPTERS, ...ACT2_CHAPTERS, ...ACT3_CHAPTERS, ...ACT4_CHAPTERS];

export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id);
export const chapterOfRival = (rivalId: string) => CHAPTERS.find((c) => c.rival === rivalId);
/** episode number within its chapter (1–12) */
export const episodeNo = (c: Chapter) => CHAPTERS.filter((x) => x.part === c.part).indexOf(c) + 1;
/** "第一章 第3話" */
export const episodeLabel = (c: Chapter) => `${PARTS[c.part - 1].name} 第${episodeNo(c)}話`;
