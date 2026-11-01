import { describe, expect, it } from 'vitest';
import { aiAnswer, chooseAction, CPU_LEVELS, PROFILES, profileOf } from '../ai';
import { deckById, expand } from '../decks';
import { Game } from '../game';
import { CPU_FIRST_GEMS, CPU_REWARD, cpuTier } from '../../state/progress';

/** a started game, brought to the first main-phase decision */
function started(seed: number) {
  const g = Game.create([expand(deckById('fire').cards), expand(deckById('water').cards)], ['A', 'B'], seed);
  g.start();
  let n = 0;
  while (g.pending && g.pending.type !== 'action' && n++ < 60) g.answer(aiAnswer(g, 5, 0));
  return g;
}

describe('CPU levels', () => {
  it('has nine levels with names, and the profiles only get sharper', () => {
    expect(CPU_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const l of CPU_LEVELS) expect(l.name && l.blurb).toBeTruthy();
    for (let i = 2; i <= 9; i++) {
      const a = PROFILES[(i - 1) as 1];
      const b = PROFILES[i as 2];
      expect(b.noise, `noise ${i}`).toBeLessThanOrEqual(a.noise);
      expect(b.slip, `slip ${i}`).toBeLessThanOrEqual(a.slip);
      expect(b.depth, `depth ${i}`).toBeGreaterThanOrEqual(a.depth);
    }
    expect(PROFILES[9].budgetMs).toBeLessThanOrEqual(1500); // it must never keep the player waiting long
  });
  it('story difficulties map onto the levels', () => {
    expect(profileOf('easy')).toBe(PROFILES[2]);
    expect(profileOf('normal')).toBe(PROFILES[5]);
    expect(profileOf('hard')).toBe(PROFILES[6]);
    expect(profileOf(99)).toBe(PROFILES[9]);
    expect(profileOf(-3)).toBe(PROFILES[1]);
  });
  it('every level picks a legal action', () => {
    for (let level = 1; level <= 9; level++) {
      const g = started(40 + level);
      const pr = g.pending!;
      expect(pr.type).toBe('action');
      const a = chooseAction(g, (pr as { player: 0 | 1 }).player, level, 0);
      const legal = g.legalActions((pr as { player: 0 | 1 }).player);
      expect(legal.some((l) => JSON.stringify(l) === JSON.stringify(a)), `level ${level}`).toBe(true);
    }
  }, 60000);
  it('has rewards for every level, growing with it', () => {
    expect(CPU_REWARD.length).toBe(9);
    expect(CPU_FIRST_GEMS.length).toBe(9);
    for (let i = 1; i < 9; i++) {
      expect(CPU_REWARD[i]).toBeGreaterThan(CPU_REWARD[i - 1]);
      expect(CPU_FIRST_GEMS[i]).toBeGreaterThanOrEqual(CPU_FIRST_GEMS[i - 1]);
    }
    expect([1, 3, 4, 6, 7, 9].map(cpuTier)).toEqual(['easy', 'easy', 'normal', 'normal', 'hard', 'hard']);
  });
});
