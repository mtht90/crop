// Round robin of every prebuilt deck at Lv5 (both seats); prints decks by win rate.
import { aiAnswer } from '../src/engine/ai';
import { ALL_DECKS, expand } from '../src/engine/decks';
import { Game } from '../src/engine/game';

const R = Number(process.argv[2] ?? 2);
const decks = ALL_DECKS.map((d) => ({ id: d.id, cards: expand(d.cards), w: 0, n: 0 }));
let seed = 31000;
for (let i = 0; i < decks.length; i++)
  for (let j = i + 1; j < decks.length; j++)
    for (let r = 0; r < R; r++) {
      const [a, b] = r % 2 ? [decks[j], decks[i]] : [decks[i], decks[j]];
      const g = Game.create([a.cards, b.cards], ['A', 'B'], seed++);
      g.start();
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
        g.answer(aiAnswer(g, 5, acts[who]));
      }
      a.n++;
      b.n++;
      if (g.s.winner === 0) a.w++;
      else if (g.s.winner === 1) b.w++;
    }
decks.sort((x, y) => y.w / y.n - x.w / x.n);
console.log(JSON.stringify(decks.map((d) => [d.id, Math.round((100 * d.w) / d.n)])));
