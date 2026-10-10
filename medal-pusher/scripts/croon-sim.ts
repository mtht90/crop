// 多段クルーンの所要時間と穴ごとの確率を確認: node --experimental-strip-types scripts/croon-sim.ts 100
import RAPIER from '@dimforge/rapier3d-compat';
import { CroonPhysics } from '../src/croon.ts';
import { CROON } from '../src/config.ts';
await RAPIER.init();
const c = new CroonPhysics();
const N = Number(process.argv[2] ?? 100);
// 段ごとに、各穴（0〜5 周り、6 中央）に入った回数
const counts = CROON.stages.map(() => new Array(7).fill(0));
const reached = CROON.stages.map(() => 0);
let totalTime = 0, prizeSum = 0, jp = 0, maxTime = 0;
for (let k = 0; k < N; k++) {
  c.start();
  let steps = 0, last = -1;
  c.onNext = () => {};
  while (c.state !== 'settled' && steps < 120 * 120) {
    if (c.state === 'rolling' && c.stageIndex !== last) { last = c.stageIndex; reached[last]++; }
    const before = c.lastHole;
    c.step(); steps++;
    if (c.lastHole && c.lastHole !== before) counts[c.lastHole.stage][c.lastHole.hole]++;
  }
  const t = steps / 120; totalTime += t; maxTime = Math.max(maxTime, t);
  const p = c.result?.prize;
  if (p === 'JP') jp++; else if (typeof p === 'number') prizeSum += p;
  c.finish();
  for (let i = 0; i < 30; i++) c.step();
}
CROON.stages.forEach((s, i) => console.log(`stage${i + 1} reached ${reached[i]} holes`, counts[i].slice(0, 6).join(' '), 'center', counts[i][6]));
console.log({ avgSec: (totalTime / N).toFixed(1), maxSec: maxTime.toFixed(1), jpRate: (jp / N).toFixed(3), avgMedals: (prizeSum / N).toFixed(1) });
