// Self-play tuning of the board evaluation (src/engine/ai.ts, W).
// Coordinate search: nudge one weight up or down; keep the change if the new
// weights beat the current ones clearly over mirror matches at Lv5 (one-ply,
// fast). Prints the best weights so far after every accepted change.
//   npx tsx scripts/ai-tune.ts rounds gamesPerTest
import { aiAnswer, setWeights, W0, type Weights } from '../src/engine/ai';
import { ALL_DECKS, expand } from '../src/engine/decks';
import { Game } from '../src/engine/game';
import { writeFileSync } from 'node:fs';

const ROUNDS = Number(process.argv[2] ?? 3);
const M = Number(process.argv[3] ?? 80);
const OUT = process.argv[4] ?? 'tuned-weights.json';
const decks = ALL_DECKS.slice(0, 14).map((d) => expand(d.cards));

function play(wa: Weights, wb: Weights, deck: string[], seed: number, aFirst: boolean): number {
  const g = Game.create([deck, deck], ['A', 'B'], seed);
  g.start();
  const wOf = (who: 0 | 1) => ((who === 0) === aFirst ? wa : wb);
  let steps = 0;
  const acts = [0, 0];
  let last = 0;
  while (g.pending && steps++ < 4000) {
    if (g.s.turn !== last) {
      last = g.s.turn;
      acts[0] = acts[1] = 0;
    }
    const pr = g.pending;
    const who = ('player' in pr ? (pr as { player: 0 | 1 }).player : g.s.current) as 0 | 1;
    if (pr.type === 'action') acts[who]++;
    setWeights(wOf(who));
    g.answer(aiAnswer(g, 5, acts[who]));
  }
  if (g.s.winner === -1 || g.s.winner === null) return 0.5;
  return (g.s.winner === 0) === aFirst ? 1 : 0;
}

let seedBase = 1;
function match(wa: Weights, wb: Weights, n: number) {
  let score = 0;
  for (let i = 0; i < n; i++) {
    const deck = decks[i % decks.length];
    score += play(wa, wb, deck, seedBase + i, i % 2 === 0);
  }
  seedBase += n;
  return score / n;
}

let best: Weights = { ...W0 };
const keys = Object.keys(W0) as (keyof Weights)[];
for (let r = 0; r < ROUNDS; r++) {
  for (const k of keys) {
    for (const f of [1.5, 0.6]) {
      const cand = { ...best };
      cand[k] = k === 'bench' && best[k] === 0 ? (f > 1 ? 8 : -8) : +(best[k] * f).toFixed(3);
      if (cand[k] === best[k]) continue;
      const rate = match(cand, best, M);
      console.log(`r${r} ${k} ${best[k]} -> ${cand[k]}: ${(rate * 100).toFixed(0)}%`);
      if (rate >= 0.58) {
        best = cand;
        writeFileSync(OUT, JSON.stringify(best, null, 2));
        console.log('  accepted');
        break;
      }
    }
  }
}
console.log('FINAL', JSON.stringify(best));
