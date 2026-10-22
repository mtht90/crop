import { Save, type Stats } from '../core/Save';
import { CHAR_BY_ID, type Rarity } from './characters';
import { giveReward, type Reward } from './missions';

/**
 * Bingo cards (Tsum Tsum-style): 3x3 squares of missions. Every finished line pays out,
 * a full card pays more and opens the next card. Squares are either one-battle goals
 * ("in one battle…") or running totals, sometimes only counting a rarity or a character group.
 */
type Who = Rarity | 'SR+' | 'knight' | 'skeleton' | 'beard' | 'chibi';
type Stat = keyof Stats | 'score';

export interface Square {
  text: string;
  stat: Stat;
  goal: number;
  /** Goal must be reached within one battle. */
  once?: boolean;
  who?: Who;
}

export interface Card {
  squares: Square[];
  line: Reward;
  full: Reward;
}

const GROUPS: Record<Exclude<Who, Rarity | 'SR+'>, string[]> = {
  knight: ['kh_a', 'kh_b', 'kh_c', 'l_knight', 'knight', 'c_knight'],
  skeleton: ['skull', 'skel_minion', 'skel_warrior', 'skel_rogue'],
  beard: ['mh_a', 'mh_b', 'mh_c', 'bh_a', 'bh_b'],
  chibi: ['c_student', 'c_short', 'c_merchant', 'c_archer', 'c_ninja', 'c_knight', 'c_kuro', 'c_pony', 'c_maskbob', 'c_maskT', 'c_pumpkin'],
};

export const CARDS: Card[] = [
  {
    squares: [
      { text: 'バトルを3回あそぶ', stat: 'plays', goal: 3 },
      { text: 'ぷにを300こ消す', stat: 'pops', goal: 300 },
      { text: '1回で10こつなぐ', stat: 'maxChain', goal: 10, once: true },
      { text: 'フィーバーを3回', stat: 'fevers', goal: 3 },
      { text: 'Nキャラで必殺技を3回', stat: 'skills', goal: 3, who: 'N' },
      { text: 'ボムを10こつかう', stat: 'bombs', goal: 10 },
      { text: '1回のバトルで20万点', stat: 'score', goal: 200000, once: true },
      { text: '騎士キャラでぷにを200こ消す', stat: 'pops', goal: 200, who: 'knight' },
      { text: 'ボスを1回たおす', stat: 'defeats', goal: 1 },
    ],
    line: { coins: 3000 },
    full: { tickets: 2, lives: 3 },
  },
  {
    squares: [
      { text: '1回のバトルで40万点', stat: 'score', goal: 400000, once: true },
      { text: 'Rキャラでフィーバーを3回', stat: 'fevers', goal: 3, who: 'R' },
      { text: '1回で15こつなぐ', stat: 'maxChain', goal: 15, once: true },
      { text: '妨害を30こ消す', stat: 'broken', goal: 30 },
      { text: '1回のバトルで30コンボ', stat: 'maxCombo', goal: 30, once: true },
      { text: 'ホネキャラでボムを10こつかう', stat: 'bombs', goal: 10, who: 'skeleton' },
      { text: '7こ以上つなぐのを20回', stat: 'chains7', goal: 20 },
      { text: '1回のバトルで必殺技を3回', stat: 'skills', goal: 3, once: true },
      { text: 'ボスを3回たおす', stat: 'defeats', goal: 3 },
    ],
    line: { coins: 5000 },
    full: { tickets: 3 },
  },
  {
    squares: [
      { text: '1回のバトルで70万点', stat: 'score', goal: 700000, once: true },
      { text: 'ちびキャラでぷにを1000こ消す', stat: 'pops', goal: 1000, who: 'chibi' },
      { text: '1回で20こつなぐ', stat: 'maxChain', goal: 20, once: true },
      { text: 'SRキャラで必殺技を10回', stat: 'skills', goal: 10, who: 'SR' },
      { text: '1回のバトルでフィーバー3回', stat: 'fevers', goal: 3, once: true },
      { text: 'ひげキャラで7こ以上つなぐのを15回', stat: 'chains7', goal: 15, who: 'beard' },
      { text: '妨害を80こ消す', stat: 'broken', goal: 80 },
      { text: '1回のバトルで50コンボ', stat: 'maxCombo', goal: 50, once: true },
      { text: 'ボスを5回たおす', stat: 'defeats', goal: 5 },
    ],
    line: { coins: 8000 },
    full: { tickets: 4, skillTickets: 1 },
  },
  {
    squares: [
      { text: '1回のバトルで120万点', stat: 'score', goal: 1200000, once: true },
      { text: '1回で25こつなぐ', stat: 'maxChain', goal: 25, once: true },
      { text: 'SR以上のキャラでフィーバーを5回', stat: 'fevers', goal: 5, who: 'SR+' },
      { text: '1回のバトルで必殺技を5回', stat: 'skills', goal: 5, once: true },
      { text: '1回のバトルでボムを8こ', stat: 'bombs', goal: 8, once: true },
      { text: '騎士キャラで1回50万点', stat: 'score', goal: 500000, once: true, who: 'knight' },
      { text: 'ぷにを5000こ消す', stat: 'pops', goal: 5000 },
      { text: '1回のバトルで妨害を15こ消す', stat: 'broken', goal: 15, once: true },
      { text: 'ボスを8回たおす', stat: 'defeats', goal: 8 },
    ],
    line: { coins: 12000 },
    full: { tickets: 6 },
  },
  {
    squares: [
      { text: '1回のバトルで200万点', stat: 'score', goal: 2000000, once: true },
      { text: '1回で30こつなぐ', stat: 'maxChain', goal: 30, once: true },
      { text: '1回のバトルで80コンボ', stat: 'maxCombo', goal: 80, once: true },
      { text: 'ホネキャラで1回80万点', stat: 'score', goal: 800000, once: true, who: 'skeleton' },
      { text: 'ちびキャラでフィーバーを10回', stat: 'fevers', goal: 10, who: 'chibi' },
      { text: '1回のバトルでフィーバー4回', stat: 'fevers', goal: 4, once: true },
      { text: '7こ以上つなぐのを100回', stat: 'chains7', goal: 100 },
      { text: 'SR以上のキャラで必殺技を30回', stat: 'skills', goal: 30, who: 'SR+' },
      { text: 'ボスを12回たおす', stat: 'defeats', goal: 12 },
    ],
    line: { coins: 20000 },
    full: { tickets: 10, skillTickets: 2 },
  },
];

/** Rows, columns and both diagonals of the 3x3 card. */
export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export interface BingoState {
  card: number;
  prog: number[];
  /** Lines already paid out (indexes into LINES). */
  lines: number[];
  /** Squares whose stamp has been shown (so new ones animate once). */
  seen: boolean[];
}

export function newBingo(card = 0): BingoState {
  return { card, prog: Array(9).fill(0), lines: [], seen: Array(9).fill(false) };
}

export function currentCard(): Card | null {
  return CARDS[Save.data.bingo.card] ?? null;
}

export function squareDone(i: number): boolean {
  const c = currentCard();
  return !!c && Save.data.bingo.prog[i] >= c.squares[i].goal;
}

function matches(who: Who | undefined, charId: string): boolean {
  if (!who) return true;
  const def = CHAR_BY_ID[charId];
  if (!def) return false;
  if (who === 'SR+') return def.rarity === 'SR' || def.rarity === 'SSR';
  if (who === 'N' || who === 'R' || who === 'SR' || who === 'SSR') return def.rarity === who;
  return GROUPS[who].includes(charId);
}

/** Counts a finished battle toward the current card. */
export function recordBingo(round: Stats, charId: string, score: number): void {
  const card = currentCard();
  if (!card) return;
  const b = Save.data.bingo;
  card.squares.forEach((sq, i) => {
    if (!matches(sq.who, charId)) return;
    const v = sq.stat === 'score' ? score : round[sq.stat];
    b.prog[i] = sq.once ? Math.max(b.prog[i], v) : b.prog[i] + v;
  });
}

/** Lines finished but not yet paid out. */
export function pendingLines(): number[] {
  const b = Save.data.bingo;
  if (!currentCard()) return [];
  return LINES.map((_, i) => i).filter((i) => !b.lines.includes(i) && LINES[i].every(squareDone));
}

export function cardComplete(): boolean {
  return !!currentCard() && Array.from({ length: 9 }, (_, i) => i).every(squareDone);
}

/** Pays out finished lines (and the full-card bonus). Returns what was given. */
export function claimBingo(): { lines: number; full: boolean; got: string[] } {
  const card = currentCard();
  const b = Save.data.bingo;
  const got: string[] = [];
  if (!card) return { lines: 0, full: false, got };
  const lines = pendingLines();
  for (const i of lines) {
    b.lines.push(i);
    got.push(...giveReward(card.line));
  }
  const full = cardComplete() && lines.length > 0 && b.lines.length === LINES.length;
  if (full) got.push(...giveReward(card.full));
  Save.write();
  return { lines: lines.length, full, got };
}

/** Moves on to the next card once the current one is complete. */
export function nextCard(): void {
  if (!cardComplete()) return;
  Save.data.bingo = newBingo(Save.data.bingo.card + 1);
  Save.write();
}

export function bingoClaimable(): number {
  return pendingLines().length;
}
