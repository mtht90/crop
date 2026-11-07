import { loadContent, LocalMatchSession, type MatchSetup } from '../src/index';

export const content = loadContent();

export function botMatch(seed: number, bot0 = 'normal', bot1 = 'normal'): LocalMatchSession {
  const setup: MatchSetup = { seed, decks: [content.starterDeck, content.starterDeck], names: ['A', 'B'] };
  const s = new LocalMatchSession(setup, content.rules, content.cards, 0);
  s.setBot(0, content.bots.find((b) => b.id === bot0)!);
  s.setBot(1, content.bots.find((b) => b.id === bot1)!);
  return s;
}

export function runToEnd(s: LocalMatchSession, maxTicks = 20000): void {
  while (!s.simulation.isOver && s.simulation.tick < maxTicks) s.stepOnce();
}
