import { aiAnswer } from '../src/engine/ai';
import { expand, STARTER_DECKS } from '../src/engine/decks';
import { Game } from '../src/engine/game';

const N = Number(process.argv[2] ?? 4);
const wins: Record<string, number> = {};
const games: Record<string, number> = {};
const reasons: Record<string, number> = {};
let turns = 0, total = 0, attacks = 0;
let seed = 100;
for (const a of STARTER_DECKS) for (const b of STARTER_DECKS) {
  if (a.id === b.id) continue;
  for (let k = 0; k < N; k++) {
    const g = Game.create([expand(a.cards), expand(b.cards)], [a.id, b.id], seed++);
    g.start();
    let acts = 0, last = 0, steps = 0;
    while (g.pending && steps++ < 5000) {
      if (g.s.turn !== last) { last = g.s.turn; acts = 0; }
      if (g.pending.type === 'action') acts++;
      const ans = aiAnswer(g, 'normal', acts);
      if (ans.type === 'action' && ans.action.t === 'attack') attacks++;
      g.answer(ans);
    }
    total++; turns += g.s.turn;
    const w = g.s.winner;
    games[a.id] = (games[a.id] ?? 0) + 1; games[b.id] = (games[b.id] ?? 0) + 1;
    if (w === 0) wins[a.id] = (wins[a.id] ?? 0) + 1;
    if (w === 1) wins[b.id] = (wins[b.id] ?? 0) + 1;
    const r = g.s.winReason.replace(/^\S+?(が|の|は)/, '');
    reasons[r] = (reasons[r] ?? 0) + 1;
  }
}
console.log('avg turns', (turns / total).toFixed(1), 'attacks/game', (attacks / total).toFixed(1));
for (const d of STARTER_DECKS) console.log(d.id.padEnd(10), ((wins[d.id] ?? 0) / games[d.id] * 100).toFixed(0) + '%');
console.log(reasons);
