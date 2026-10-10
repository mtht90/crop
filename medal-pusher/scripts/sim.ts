// ヘッドレスで物理挙動を確認するスクリプト: node --experimental-strip-types scripts/sim.ts
import { initPhysics, PusherPhysics } from '../src/physics.ts';
import { BOARD, GAME } from '../src/config.ts';

await initPhysics();
const sim = new PusherPhysics();
let t0 = performance.now();
sim.fillField(GAME.initialFieldCoins);
sim.settle(4);
console.log('settled coins', sim.coins.size, 'in', Math.round(performance.now() - t0), 'ms');

let half = { launched: 0, win: 0, lost: 0, checker: 0 };
let win = 0, lost = 0, checker = 0, launched = 0;
sim.events = {
  onCoinGone: (_c, o) => (o === 'win' ? win++ : lost++),
  onChecker: () => checker++,
};
const seconds = Number(process.argv[2] ?? 120);
t0 = performance.now();
const steps = seconds * 120;
for (let i = 0; i < steps; i++) {
  if (i % 34 === 0) { const x = (Math.random() * 2 - 1) * Number(process.env.AIM ?? BOARD.launcherRange); if (sim.canLaunch(x)) { sim.launchCoin(x); launched++; } }
  sim.step();
  if (i === steps / 2) { half = { launched, win, lost, checker }; }
}
console.log('2nd half', { launched: launched - half.launched, win: win - half.win, lost: lost - half.lost, checker: checker - half.checker });
const ms = performance.now() - t0;
let stuck = 0;
for (const c of sim.coins.values()) if (c.inBoard) stuck++;
console.log({ seconds, launched, win, lost, checker, coins: sim.coins.size, stuckInBoard: stuck, msPerStep: (ms / steps).toFixed(3) });
let standing = 0;
for (const c of sim.coins.values()) {
  if (c.inBoard) continue;
  const r = c.body.rotation();
  // ローカルy軸のワールドy成分
  const upY = 1 - 2 * (r.x * r.x + r.z * r.z);
  if (Math.abs(upY) < 0.5) { standing++; const p = c.body.translation(); if (standing < 12) console.log('  standing at', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)); }
}
console.log('standing coins', standing);
const stuckList = [...sim.coins.values()].filter((c) => c.inBoard).map((c) => { const p = c.body.translation(); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; });
console.log('inBoard positions', stuckList.join(' '));
