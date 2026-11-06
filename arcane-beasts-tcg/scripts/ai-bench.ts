// CPU strength bench: level A vs level B, mirror matches (same deck both sides,
// sides swapped every other game), several decks. Prints A's win rate.
//   npx tsx scripts/ai-bench.ts A B games [deck,deck,...]
import { aiAnswer, type AiLevel } from '../src/engine/ai';
import { deckById, expand, upgradeDeck } from '../src/engine/decks';
import { Game } from '../src/engine/game';

const A = Number(process.argv[2] ?? 9);
const B = Number(process.argv[3] ?? 5);
const N = Number(process.argv[4] ?? 20);
const DECKS = (process.argv[5] ?? 'fire,water,lightning,dark,grass,psychic').split(',');
const TA = Number(process.argv[6] ?? 0);
const TB = Number(process.argv[7] ?? 0);

function play(deckA: string[], deckB: string[], la: AiLevel, lb: AiLevel, seed: number): 0 | 1 | -1 {
  const g = Game.create([deckA, deckB], ['A', 'B'], seed);
  g.start();
  let steps = 0;
  const acts = [0, 0];
  let lastTurn = 0;
  while (g.pending && steps++ < 4000) {
    if (g.s.turn !== lastTurn) {
      lastTurn = g.s.turn;
      acts[0] = acts[1] = 0;
    }
    const pr = g.pending;
    const who = 'player' in pr ? (pr as { player: 0 | 1 }).player : g.s.current;
    if (pr.type === 'action') acts[who]++;
    g.answer(aiAnswer(g, who === 0 ? la : lb, acts[who]));
  }
  return g.s.winner === 0 ? 0 : g.s.winner === 1 ? 1 : -1;
}

let wins = 0;
let games = 0;
let draws = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const d = DECKS[i % DECKS.length];
  const deck = expand(deckById(d)!.cards);
  const da = upgradeDeck(deck, TA);
  const db = upgradeDeck(deck, TB);
  const aFirst = i % 2 === 0;
  const r = aFirst ? play(da, db, A, B, 1000 + i) : play(db, da, B, A, 1000 + i);
  games++;
  if (r === -1) draws++;
  else if ((r === 0) === aFirst) wins++;
}
console.log(`Lv${A}(t${TA}) vs Lv${B}(t${TB}): ${wins}/${games} (${Math.round((100 * wins) / games)}%) draws ${draws}  ${Math.round((Date.now() - t0) / games)}ms/game`);
