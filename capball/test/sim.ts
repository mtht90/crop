// 守備・走塁ロジックの検証（描画なし）。ランダムな打球を大量に流して、結果の分布と異常を調べる。
import * as THREE from 'three';
import { TEAMS, type Player } from '../src/game/data';
import { GameState } from '../src/game/rules';
import { LivePlay, type Fielder, type Runner } from '../src/game/play';
import { BallSim } from '../src/game/flight';
import { POSITIONS, BASES } from '../src/game/geom';
import { resolveContact } from '../src/game/batting';
import { FIELDER_SPEED, RUNNER_SPEED } from '../src/game/play';

class StubChar {
  root = new THREE.Object3D();
  poseTarget = 0;
  pose: unknown = null;
  currentName = '';
  play(n: string) { this.currentName = n; }
  setPose(p: unknown) { this.pose = p; this.poseTarget = p ? 1 : 0; }
  handWorld(_s: string, out = new THREE.Vector3()) { return out.copy(this.root.position).setY(1); }
  faceTowards(x: number, z: number) { this.root.rotation.y = Math.atan2(x - this.root.position.x, z - this.root.position.z); this.root.updateMatrixWorld(); }
}

function setup(outs: number, bases: boolean[]) {
  const st = new GameState(TEAMS[0], TEAMS[1], 9);
  st.outs = outs;
  const bat = st.batting.team.players;
  st.bases = bases.map((b, i) => (b ? bat[(i + 3) % 9] : null));
  const fielders: Fielder[] = st.fielding.team.players.map((p) => {
    const c = new StubChar();
    const home = (p.pos === 'C' ? new THREE.Vector3(0, 0, 1.9) : POSITIONS[p.pos]).clone();
    c.root.position.copy(home);
    c.root.updateMatrixWorld();
    return { pos: p.pos, player: p, char: c as never, home, target: null, role: 'idle', coverBase: 0, hasBall: false, busy: 0, speed: FIELDER_SPEED(p.speed) };
  });
  const sp = (p: Player) => RUNNER_SPEED(p.speed);
  const batter = bat[0];
  const runners: Runner[] = [{ player: batter, char: new StubChar() as never, from: 0, to: 1, d: 0, state: 'run', isBatter: true, speed: sp(batter), forced: true, startDelay: 0.3 }];
  st.bases.forEach((p, i) => {
    if (!p) return;
    const c = new StubChar();
    c.root.position.copy(BASES[i + 1]);
    runners.push({ player: p, char: c as never, from: i + 1, to: i + 2, d: 0.6, state: 'hold', isBatter: false, speed: sp(p), forced: false, startDelay: 0 });
  });
  return { st, fielders, runners };
}

const stats: Record<string, number> = {};
const inc = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);
const problems: string[] = [];
const N = +((globalThis as unknown as { process: { argv: string[] } }).process.argv[2] || 3000);
for (let i = 0; i < N; i++) {
  const outs = Math.floor(Math.random() * 3);
  const bases = [Math.random() < 0.35, Math.random() < 0.25, Math.random() < 0.2];
  const { st, fielders, runners } = setup(outs, bases);
  const batter = st.batting.team.players[Math.floor(Math.random() * 9)];
  // 実際の打撃モデルから打球を作る（カーソルとタイミングのずれをランダムに）
  let r;
  for (let k = 0; k < 50; k++) {
    r = resolveContact({ batter, mode: Math.random() < 0.2 ? 'power' : 'meet', cursor: new THREE.Vector2(0, 0.65), timing: (Math.random() - 0.5) * 0.22, ball: new THREE.Vector2((Math.random() - 0.5) * 0.3, 0.65 + (Math.random() - 0.5) * 0.3), speedKmh: 140 });
    if (r.kind === 'hit') break;
  }
  if (!r || r.kind !== 'hit') continue;
  const ball = new BallSim(new THREE.Vector3(0, 0.7, 0), r.velocity, 0.6, Math.random() * 6);
  const runsBefore = 0;
  const outsBefore = st.outs;
  let catcher = '';
  let at = '';
  const play = new LivePlay(st, fielders, runners, ball, (e) => { if ((e.type === 'flyCatch' || e.type === 'field') && !catcher) { catcher = e.fielder.pos; at = `@(${e.fielder.char.root.position.x.toFixed(1)},${e.fielder.char.root.position.z.toFixed(1)}) t=${play.time.toFixed(2)} ${e.type}`; } });
  let t = 0;
  while (!play.done && t < 40) { play.update(1 / 60); t += 1 / 60; }
  if (!play.done) problems.push(`#${i} not done`);
  if (t > 21) problems.push(`#${i} long play ${t.toFixed(1)}s kind=${play.result.kind}`);
  const res = play.result;
  inc('kind:' + res.kind);
  if (res.kind === 'inPlay') {
    inc('hit:' + (res.hitType ?? (res.error ? 'error' : res.flyOut ? 'flyout' : 'out/fc')));
    if (res.outs >= 2) inc('double play');
    // 同じ塁に二人いないか
    const occ = runners.filter((r) => r.state === 'safe').map((r) => r.from);
    if (new Set(occ).size !== occ.length) problems.push(`#${i} two runners on a base ${occ}`);
    const onBase = runners.filter((r) => r.state === 'safe').length;
    const scored = runners.filter((r) => r.state === 'scored').length;
    const out = runners.filter((r) => r.state === 'out').length;
    if (st.outs < 3 && onBase + scored + out !== runners.length) problems.push(`#${i} runner left in state ${runners.map((r) => r.state)}`);
    if (st.outs - outsBefore !== out) problems.push(`#${i} outs mismatch ${st.outs - outsBefore} vs ${out}`);
    if (st.outs > 3) problems.push(`#${i} outs>3`);
    void runsBefore;
  }
  inc('time<' + Math.ceil(t / 2) * 2);
  inc('by:' + (catcher || '-'));
  if (i < 25) console.log(`exit=${r.exitKmh} launch=${r.launchDeg.toFixed(0)} spray=${r.sprayDeg.toFixed(0)} v=${r.velocity.length().toFixed(1)} land=${ball.firstLand ? Math.hypot(ball.firstLand.x, ball.firstLand.z).toFixed(1) : '-'} by=${catcher} ${at} -> ${play.result.hitType ?? (play.result.flyOut ? 'fly' : play.result.kind)}`);
}
console.log(Object.entries(stats).sort().map(([k, v]) => `${k.padEnd(18)} ${v} (${((v / N) * 100).toFixed(1)}%)`).join('\n'));
console.log('problems:', problems.length);
console.log(problems.slice(0, 25).join('\n'));
