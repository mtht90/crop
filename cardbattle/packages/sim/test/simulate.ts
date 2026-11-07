/** BOT同士を大量に戦わせて勝率・カード使用数を出す（バランス調整用）。 npm run simulate -- 50 hard normal */
import { botMatch, runToEnd } from './helpers';

const n = Number(process.argv[2] ?? 30);
const b0 = process.argv[3] ?? 'normal';
const b1 = process.argv[4] ?? 'normal';
const wins = [0, 0, 0];
const reasons: Record<string, number> = {};
const plays: Record<string, number> = {};
let ticks = 0;
for (let seed = 1; seed <= n; seed++) {
  const s = botMatch(seed, b0, b1);
  runToEnd(s);
  const sim = s.simulation;
  wins[sim.winner === -1 ? 2 : sim.winner]++;
  reasons[sim.endReason] = (reasons[sim.endReason] ?? 0) + 1;
  for (const c of sim.acceptedLog) plays[c.command.cardId] = (plays[c.command.cardId] ?? 0) + 1;
  ticks += sim.tick;
}
console.log(`${b0} vs ${b1}  x${n}`);
console.log(`P0 wins ${wins[0]}, P1 wins ${wins[1]}, draws ${wins[2]}`);
console.log('end reasons', reasons);
console.log('avg length', (ticks / n / 20).toFixed(1), 's');
console.log('card plays', plays);
