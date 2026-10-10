// クルーンの出目が偏っていないか確認: node --experimental-strip-types scripts/croon-sim.ts 200
import RAPIER from '@dimforge/rapier3d-compat';
import { CroonPhysics } from '../src/croon.ts';
await RAPIER.init();
const c = new CroonPhysics();
const n = Number(process.argv[2] ?? 100);
const counts = new Array(10).fill(0);
let totalTime = 0, timeouts = 0;
for (let i = 0; i < n; i++) {
  c.start();
  let steps = 0;
  while (c.state === 'spinning') { c.step(); steps++; }
  totalTime += steps / 120;
  if (steps / 120 > 17.9) { timeouts++; if (timeouts < 5) console.log('timeout', c.debug); }
  counts[c.result!.index]++;
  c.finish();
  for (let k = 0; k < 60; k++) c.step();
}
console.log('counts', counts.join(' '), 'avg sec', (totalTime / n).toFixed(1), 'timeouts', timeouts);
