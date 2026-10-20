import { charAtk, type CharDef, type Growth, type Rarity } from './characters';
import type { ItemId } from './play';

/**
 * Battle rank is relative: the score is compared with what this setup "should" get.
 * The expectation blends the character's strength (attack incl. level, rarity, skill level)
 * with the boss's defeat line, so a weak character can still earn S, and harder bosses raise the bar
 * a little (the line is only a nudge: it grows much faster than any character does).
 */
const RARITY_MUL: Record<Rarity, number> = { N: 1, R: 1.05, SR: 1.35, SSR: 1.6 };
/** Score per attack point for a typical round (calibrated with the casual-player bot). */
const PER_ATK = 4200;
const ITEM_MUL: Partial<Record<ItemId, number>> = { score: 1.1, time: 1.05, five4: 1.2 };

export function expectedScore(def: CharDef, g: Growth, defeatLine: number, items: ItemId[]): number {
  const base = PER_ATK * charAtk(def, g) * RARITY_MUL[def.rarity] * (1 + (g.skill - 1) * 0.08);
  const withItems = items.reduce((k, id) => k * (ITEM_MUL[id] ?? 1), 1);
  // defeat line far above (or below) the character's level moves the bar by at most +38% / -13%
  const nudge = Math.pow(Math.min(5, Math.max(0.5, defeatLine / base)), 0.2);
  return Math.round(base * nudge * withItems);
}

/** Strict thresholds on score / expected. */
const RANKS: [number, string, number][] = [
  [2.5, 'S', 0xff4fd8],
  [1.8, 'A', 0xffb020],
  [1.3, 'B', 0x4fc3ff],
  [1.0, 'C', 0x5fd068],
  [0.6, 'D', 0x9aa7b8],
];

export function rankFor(score: number, expected: number): { rank: string; color: number } {
  const k = score / Math.max(1, expected);
  for (const [min, rank, color] of RANKS) if (k >= min) return { rank, color };
  return { rank: 'E', color: 0x7a7f90 };
}
