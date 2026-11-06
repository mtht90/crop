// tuned weights (json) vs the defaults, at a level, on fresh seeds and all decks
import { readFileSync } from 'node:fs';
import { aiAnswer, setWeights, W0, type Weights } from '../src/engine/ai';
import { ALL_DECKS, expand } from '../src/engine/decks';
import { Game } from '../src/engine/game';
const tuned = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Weights;
const LV = Number(process.argv[3] ?? 5);
const N = Number(process.argv[4] ?? 200);
const decks = ALL_DECKS.map((d) => expand(d.cards));
let w = 0, n = 0;
for (let i = 0; i < N; i++) {
  const deck = decks[(i * 7) % decks.length];
  const tFirst = i % 2 === 0;
  const g = Game.create([deck, deck], ['A', 'B'], 777000 + i);
  g.start();
  let steps = 0; const acts = [0, 0]; let last = 0;
  while (g.pending && steps++ < 4000) {
    if (g.s.turn !== last) { last = g.s.turn; acts[0] = acts[1] = 0; }
    const pr = g.pending;
    const who = ('player' in pr ? (pr as { player: 0 | 1 }).player : g.s.current) as 0 | 1;
    if (pr.type === 'action') acts[who]++;
    setWeights((who === 0) === tFirst ? tuned : W0);
    g.answer(aiAnswer(g, LV, acts[who]));
  }
  if (g.s.winner === 0 || g.s.winner === 1) { n++; if ((g.s.winner === 0) === tFirst) w++; }
}
console.log(`Lv${LV} tuned vs default: ${w}/${n} (${Math.round((100 * w) / n)}%)`);
