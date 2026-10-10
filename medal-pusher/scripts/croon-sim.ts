// クルーンの所要時間と出目の偏りを確認: node --experimental-strip-types scripts/croon-sim.ts 100
import RAPIER from '@dimforge/rapier3d-compat';
import { CroonPhysics } from '../src/croon.ts';
await RAPIER.init();
const c = new CroonPhysics();
const counts = new Array(10).fill(0); let to = 0; let sumLeave = 0, sumSettle = 0; const N = Number(process.argv[2] ?? 40);
for (let k = 0; k < N; k++) {
  c.start(); let steps = 0; let leave = -1;
  while (c.state === 'spinning') { c.step(); steps++; if (leave < 0 && !c.rolling) leave = steps / 120; }
  if (steps / 120 > 24.9) { to++; const p = c.ballPosition!; console.log('timeout at r', Math.hypot(p.x, p.z).toFixed(2)); }
  sumLeave += leave; sumSettle += steps / 120; counts[c.result!.index]++;
  c.finish(); for (let i = 0; i < 30; i++) c.step();
}
console.log('avg leave rail', (sumLeave / N).toFixed(1), 'avg settle', (sumSettle / N).toFixed(1), 'timeouts', to, 'counts', counts.join(' '));
