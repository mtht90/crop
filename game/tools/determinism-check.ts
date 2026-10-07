// Lockstep sanity check: two independent simulations fed the same seed and the
// same (packed) input streams must end in the identical state. Run with:
//   npx tsx tools/determinism-check.ts
import { CpuController } from '../src/ai/cpu';
import { characters } from '../src/characters';
import { Match } from '../src/game/match';
import { packIntent, unpackIntent } from '../src/net/protocol';

const ids = Object.keys(characters);
let failed = 0;
for (let round = 0; round < ids.length; round++) {
  const a = ids[round];
  const b = ids[(round * 5 + 3) % ids.length];
  const seed = 1234 + round;
  // Machine 1 records both players' inputs (two CPUs stand in for the players).
  const m1 = new Match(characters[a], characters[b], 'hard', seed);
  const p1 = new CpuController(m1.player, m1.cpu, m1.world, 'hard');
  const q1 = new CpuController(m1.cpu, m1.player, m1.world, 'hard');
  const log: [ReturnType<typeof packIntent>, ReturnType<typeof packIntent>][] = [];
  m1.start();
  for (let f = 0; f < 60 * 40 && !m1.finished; f++) {
    const x = packIntent(p1.think(m1.phase === 'fight'));
    const y = packIntent(q1.think(m1.phase === 'fight'));
    log.push([x, y]);
    m1.step(unpackIntent(x), unpackIntent(y));
  }
  // Machine 2 only replays the input log.
  const m2 = new Match(characters[a], characters[b], 'hard', seed);
  m2.start();
  for (const [x, y] of log) m2.step(unpackIntent(x), unpackIntent(y));
  const hash = (m: Match) => [m.player, m.cpu].map((f) => [f.pos.x, f.pos.y, f.pos.z, f.hp, f.state].map((v) => (typeof v === 'number' ? v.toFixed(6) : v)).join(',')).join('|') + `|${m.wins}|${m.round}`;
  const ok = hash(m1) === hash(m2);
  if (!ok) failed++;
  console.log(`${a} vs ${b}: ${log.length} frames ${ok ? 'OK' : 'DESYNC'}`);
}
process.exit(failed ? 1 : 0);
