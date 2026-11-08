// ============================================================================
// デッキレシピ: deck codes given as rewards. A recipe is only the list — the
// cards still have to be owned (missing ones show dark when it is built).
//   • every strong monster as the core of a deck, in three styles
//     (標準 / 速攻 / 堅守), plus every prebuilt deck: a few hundred in all
//   • rewards hand out one the player does not have yet
// ============================================================================
import { aceCandidates, buildDeck, type DeckStyle } from '../engine/autodeck';
import { byName } from '../engine/cards';
import { encodeDeck } from '../engine/deckcode';
import { ALL_DECKS, expand, validateDeck } from '../engine/decks';

export interface Recipe {
  id: string;
  name: string;
  /** the card shown on its box */
  cover: string;
  cards: string[];
  code: string;
}

const STYLE_NAME: Record<DeckStyle, string> = { std: 'デッキ', rush: '・速攻', guard: '・堅守' };

let cache: Recipe[] | null = null;
let byId: Map<string, Recipe> | null = null;

/** every recipe there is (built once, the same on every device) */
export function allRecipes(): Recipe[] {
  if (cache) return cache;
  const out: Recipe[] = [];
  const seen = new Set<string>();
  const add = (r: Omit<Recipe, 'code'>) => {
    if (validateDeck(r.cards).length) return;
    const code = encodeDeck(r.cards);
    if (seen.has(code)) return;
    seen.add(code);
    out.push({ ...r, code });
  };
  for (const d of ALL_DECKS) add({ id: `pre:${d.id}`, name: d.name, cover: byName(d.cover).id, cards: expand(d.cards) });
  const all = () => 4;
  for (const ace of aceCandidates(all)) {
    for (const style of ['std', 'rush', 'guard'] as DeckStyle[]) {
      const d = buildDeck(ace.name, all, style);
      add({ id: `${ace.name}:${style}`, name: `${ace.name}${STYLE_NAME[style]}`, cover: ace.id, cards: d.cards });
    }
  }
  cache = out;
  byId = new Map(out.map((r) => [r.id, r]));
  return out;
}

export const recipeById = (id: string) => (allRecipes(), byId!.get(id) ?? null);

/** a recipe the player does not have yet: `prefer` if it is new to them, else one at random */
export function pickRecipe(have: string[], prefer?: string, rnd = Math.random): Recipe | null {
  const own = new Set(have);
  if (prefer) {
    const p = recipeById(prefer);
    if (p && !own.has(p.id)) return p;
  }
  const left = allRecipes().filter((r) => !own.has(r.id));
  return left.length ? left[Math.floor(rnd() * left.length)] : null;
}
