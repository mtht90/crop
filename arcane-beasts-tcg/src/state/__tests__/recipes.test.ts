import { describe, expect, test } from 'vitest';
import { decodeDeck } from '../../engine/deckcode';
import { validateDeck } from '../../engine/decks';
import { allRecipes, pickRecipe, recipeById } from '../recipes';

describe('デッキレシピ', () => {
  test('a few hundred recipes, all legal 60-card decks with working codes, all different', () => {
    const all = allRecipes();
    expect(all.length).toBeGreaterThanOrEqual(300);
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    expect(new Set(all.map((r) => r.code)).size).toBe(all.length);
    for (const r of all) {
      expect(validateDeck(r.cards)).toEqual([]);
      const d = decodeDeck(r.code)!;
      expect(d.cards.reduce((n, e) => n + e.n, 0)).toBe(60);
    }
  });

  test('a reward is always one the player does not have; the preferred one when it is new', () => {
    const all = allRecipes();
    const have = all.slice(0, all.length - 1).map((r) => r.id);
    expect(pickRecipe(have)!.id).toBe(all[all.length - 1].id);
    expect(pickRecipe([], 'pre:fire')!.id).toBe('pre:fire');
    expect(pickRecipe(['pre:fire'], 'pre:fire')!.id).not.toBe('pre:fire');
    expect(pickRecipe(all.map((r) => r.id))).toBeNull();
    expect(recipeById('nope')).toBeNull();
  });
});
