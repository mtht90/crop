// 結果を先に決めたときに、狙いどおりの穴に入るか・時間を確認: node --experimental-strip-types scripts/croon-plan.ts 30
import RAPIER from '@dimforge/rapier3d-compat';
import { CroonPhysics, type CroonPlan } from '../src/croon.ts';
await RAPIER.init();
const c = new CroonPhysics();
const N = Number(process.argv[2] ?? 30);
let ok = 0, tsum = 0, tmax = 0;
const stageTimes: number[] = [];
for (let k = 0; k < N; k++) {
  // いろいろなパターン：1段目で周り / 2段目まで / 3段目で中央 / 復活
  const kind = k % 4;
  const plan: CroonPlan =
    kind === 0 ? { holes: [k % 6], revive: -1, reviveHole: 0, ballColor: 'white' }
    : kind === 1 ? { holes: [6, (k * 7) % 6], revive: -1, reviveHole: 0, ballColor: 'blue' }
    : kind === 2 ? { holes: [6, 6, 6], revive: -1, reviveHole: 0, ballColor: 'gold' }
    : { holes: [6, 6, k % 6], revive: 1, reviveHole: (k * 5) % 6, ballColor: 'red' };
  c.start(plan);
  let steps = 0, stageStart = 0, cur = -1;
  const visited: number[] = [];
  while (c.state !== 'settled' && steps < 120 * 120) {
    if (c.state === 'rolling' && c.stageIndex !== cur) { if (cur >= 0) stageTimes.push((steps - stageStart) / 120); cur = c.stageIndex; stageStart = steps; }
    const before = c.lastHole;
    c.step(); steps++;
    if (c.lastHole && c.lastHole !== before) visited.push(c.lastHole.stage * 10 + c.lastHole.hole);
  }
  stageTimes.push((steps - stageStart) / 120);
  const t = steps / 120; tsum += t; tmax = Math.max(tmax, t);
  const final = c.result;
  const expectStage = plan.holes.length - 1;
  const good = final && final.stage === expectStage && final.hole === plan.holes[expectStage];
  if (good) ok++; else console.log('MISS', kind, JSON.stringify(plan.holes), '->', JSON.stringify(final), 'visited', visited.join(','));
  c.finish(); for (let i = 0; i < 20; i++) c.step();
}
stageTimes.sort((a, b) => a - b);
console.log({ ok: `${ok}/${N}`, avgTotal: (tsum / N).toFixed(1), maxTotal: tmax.toFixed(1), stageMedian: stageTimes[stageTimes.length >> 1].toFixed(1), stageMax: stageTimes[stageTimes.length - 1].toFixed(1) });
