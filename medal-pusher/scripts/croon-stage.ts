// 1段ずつのチューニング用: node --experimental-strip-types scripts/croon-stage.ts <段番号0-2> <回数>
import RAPIER from '@dimforge/rapier3d-compat';
import { CroonPhysics } from '../src/croon.ts';
await RAPIER.init();
const c = new CroonPhysics();
const stage = Number(process.argv[2] ?? 0), N = Number(process.argv[3] ?? 60);
let center = 0, t = 0, tense = 0, maxT = 0;
for (let k = 0; k < N; k++) {
  (c as any).result = null;
  (c as any).launch(stage);
  let s = 0, tt = 0;
  while (c.state === 'rolling' && s < 120 * 60) { c.step(); s++; if (c.tension > 0.5) tt++; }
  t += s / 120; maxT = Math.max(maxT, s / 120); tense += tt / 120;
  if (c.lastHole?.hole === 6) center++;
  c.finish(); for (let i = 0; i < 20; i++) c.step();
}
console.log(`stage${stage + 1} center ${(center / N).toFixed(2)}  avg ${(t / N).toFixed(1)}s  max ${maxT.toFixed(1)}s  tension>0.5 avg ${(tense / N).toFixed(2)}s`);
