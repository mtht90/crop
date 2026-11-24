// 打球判定の検証（描画なし）。ランダムな打球を流して、結果の割合と異常を調べる。
import * as THREE from 'three';
import { TEAMS } from '../src/game/data';
import { Judge, FIELDER_SPEED, type Fielder } from '../src/game/judge';
import { BallSim } from '../src/game/flight';
import { POSITIONS } from '../src/game/geom';
import { resolveContact } from '../src/game/batting';

class StubChar {
  root = new THREE.Object3D();
  play() {}
  setPose() {}
  handWorld(_s: string, out = new THREE.Vector3()) { return out.copy(this.root.position).setY(1); }
  faceTowards() {}
}
const stats: Record<string, number> = {};
const inc = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);
const N = +((globalThis as unknown as { process: { argv: string[] } }).process.argv[2] || 3000);
let stuck = 0, n = 0;
for (let i = 0; i < N; i++) {
  const team = TEAMS[i % 2];
  const fielders: Fielder[] = team.players.filter((p) => p.pos !== 'DH').map((p) => {
    const c = new StubChar();
    const home = POSITIONS[p.pos as keyof typeof POSITIONS].clone();
    c.root.position.copy(home);
    return { pos: p.pos, player: p, char: c as never, home, target: null, busy: 0, speed: FIELDER_SPEED(p.speed) };
  });
  const batter = TEAMS[(i + 1) % 2].players[i % 5];
  const r = resolveContact({ batter, mode: Math.random() < 0.2 ? 'power' : 'meet', cursor: new THREE.Vector2(0, 0.65), timing: (Math.random() - 0.5) * 0.2, ball: new THREE.Vector2((Math.random() - 0.5) * 0.25, 0.65 + (Math.random() - 0.5) * 0.25), speedKmh: 85 });
  if (r.kind !== 'hit') { inc('swing:' + r.kind); continue; }
  n++;
  const j = new Judge(new BallSim(new THREE.Vector3(0, 0.7, 0), r.velocity, 0.6, Math.random() * 6), fielders, () => {});
  let t = 0;
  while (!j.done && t < 20) { j.update(1 / 60); t += 1 / 60; }
  if (!j.done) stuck++;
  inc(j.kind ?? 'none');
}
const fair = n - (stats.foul ?? 0);
for (const [k, v] of Object.entries(stats).sort()) console.log(k.padEnd(14), v, `${((v / n) * 100).toFixed(1)}% of contact`, k.startsWith('swing') ? '' : `${((v / fair) * 100).toFixed(1)}% of fair`);
console.log('stuck', stuck);
