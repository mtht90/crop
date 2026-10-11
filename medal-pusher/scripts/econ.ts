// 実際のゲームロジック（物理・スロット・クルーン・JP・払い出し）で還元率を測る。描画と音はダミー。
// node --experimental-strip-types scripts/econ.ts <計測秒数> <狙いの幅>
const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop, construct: () => noop }) as any;
(globalThis as any).document = { createElement: () => ({ getContext: () => noop, width: 0, height: 0 }) };
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).setTimeout = (f: () => void) => f();
const { initPhysics, PusherPhysics } = await import('../src/physics.ts');
const { SlotScreen } = await import('../src/slot.ts');
const { Game } = await import('../src/game.ts');
await initPhysics();
const game = new Game(new PusherPhysics(), new SlotScreen(), noop, noop);
game.start();
game.credit = 1e6;
const measure = Number(process.argv[2] ?? 900), aim = Number(process.argv[3] ?? 3);
let croons = 0, jps = 0;
const orig = game.croon.start.bind(game.croon);
game.croon.start = (p) => { croons++; if (p.holes.length === 3 && p.holes[2] === 6) jps++; return orig(p); };
const run = (sec: number) => { let f = 0; for (let t = 0; t < sec; t += 1 / 60) { f -= 1 / 60; if (f <= 0) { game.launcherX = (Math.random() * 2 - 1) * aim; game.insert(); f = 0.28; } game.physics.update(1 / 60); game.update(1 / 60); } };
const src = { slot: 0, croon: 0, pocket: 0, other: 0, spins: 0 };
const g = game as any;
const origAdd = g.addPayout.bind(g);
g.addPayout = (n: number) => { (n > 0 && g.croonReward === n ? (src.croon += n) : (src.slot += n)); return origAdd(n); };
const origPocket = game.physics.events.onPocket!;
game.physics.events.onPocket = (i: number) => { src.pocket += 2; origPocket(i); };
const origChecker = game.physics.events.onChecker!;
game.physics.events.onChecker = (c: any) => { src.spins++; origChecker(c); };
run(150);
for (const k of Object.keys(src)) (src as any)[k] = 0; // 最初は盤面に初期メダルが多いので捨てる
const a = { ins: game.stats.inserted, won: game.stats.won, c: croons, j: jps };
for (let t = 0; t < measure; t += 60) { run(60); process.stderr.write('.'); }
const ins = game.stats.inserted - a.ins, won = game.stats.won - a.won;
console.log(`\nreturn ${(won / ins * 100).toFixed(1)}%  inserted ${ins} won ${won} croons ${croons - a.c} JP ${jps - a.j} jackpotNow ${game.slot.jackpot}`, JSON.stringify(src));
