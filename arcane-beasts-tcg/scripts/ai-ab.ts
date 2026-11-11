// new CPU vs old CPU (the engine at HEAD copied to OLD), same level, mirror decks
//   npx tsx scripts/ai-ab.ts OLD_SRC level games
import { aiAnswer, type AiLevel } from '../src/engine/ai';
import { deckById, expand } from '../src/engine/decks';
import { Game } from '../src/engine/game';

const OLD = process.argv[2];
const L = Number(process.argv[3] ?? 6) as AiLevel;
const N = Number(process.argv[4] ?? 40);
const DECKS = 'fire,water,lightning,dark,grass,psychic'.split(',');
const old = (await import(`${OLD}/engine/ai.ts`)) as { aiAnswer: typeof aiAnswer };
let wins = 0, games = 0, retreatsNew = 0, retreatsOld = 0;
for (let i = 0; i < N; i++) {
  const deck = expand(deckById(DECKS[i % DECKS.length])!.cards);
  const newSide = (i % 2) as 0 | 1;
  const g = Game.create([deck, deck], ['A', 'B'], 1000 + i);
  g.start();
  let steps = 0;
  const acts = [0, 0];
  let lastTurn = 0;
  while (g.pending && steps++ < 4000) {
    if (g.s.turn !== lastTurn) { lastTurn = g.s.turn; acts[0] = acts[1] = 0; }
    const pr = g.pending;
    const who = ('player' in pr ? (pr as { player: 0 | 1 }).player : g.s.current) as 0 | 1;
    if (pr.type === 'action') acts[who]++;
    const ans = who === newSide ? aiAnswer(g, L, acts[who]) : old.aiAnswer(g as never, L, acts[who]);
    if (ans.type === 'action' && ans.action.t === 'retreat') who === newSide ? retreatsNew++ : retreatsOld++;
    g.answer(ans);
  }
  if (g.s.winner === newSide) wins++;
  if (g.s.winner !== -1) games++;
}
console.log(`level ${L}: new wins ${wins}/${games} (${Math.round((wins / Math.max(1, games)) * 100)}%) · retreats new ${retreatsNew} old ${retreatsOld}`);
