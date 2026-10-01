// ボット同士で 1 試合をヘッドレスで回すデバッグ用スクリプト
// 使い方: node scripts/simulate.js [seed] [verbose]
import { Game } from '../server/game.js';
import { createBrain } from '../server/bots.js';
import { mulberry32 } from '../shared/map.js';
import { TICK_RATE } from '../shared/constants.js';

export function simulate(seed, { verbose = false, maxMinutes = 20, killerLevel = 1, survivorLevel = 1 } = {}) {
  const roster = [
    { id: 'h', name: 'スカル', role: 'killer', bot: true },
    { id: 's1', name: 'アレン', role: 'survivor', character: 'barbarian', bot: true },
    { id: 's2', name: 'ベル', role: 'survivor', character: 'rogue', bot: true },
    { id: 's3', name: 'クロエ', role: 'survivor', character: 'knight', bot: true },
    { id: 's4', name: 'ダン', role: 'survivor', character: 'mage', bot: true },
  ];
  const game = new Game(roster, { seed });
  const rng = mulberry32(seed);
  const brains = new Map([...game.players.values()].map((p) => [p.id, createBrain(game, p, rng, p.role === 'killer' ? killerLevel : survivorLevel)]));
  const seqs = new Map();
  const log = [];
  const maxTicks = maxMinutes * 60 * TICK_RATE;
  while (!game.over && game.tick < maxTicks) {
    for (const [id, b] of brains) {
      const cmd = b.think();
      if (!cmd) continue;
      const seq = (seqs.get(id) || 0) + 1;
      seqs.set(id, seq);
      game.queueInput(id, { seq, ...cmd });
    }
    game.update();
    for (const e of game.events) {
      for (const [id, b] of brains) {
        const p = game.players.get(id);
        if (e.to === 'all' || e.to === id || (e.to === 'survivors' && p.role === 'survivor') || (e.to === 'killer' && p.role === 'killer'))
          b.onEvent(e);
      }
      if (e.kind === 'toast' && (e.to === 'all' || e.to === 'survivors')) {
        const line = `[${game.time.toFixed(1).padStart(6)}s] ${e.text}`;
        if (!log.includes(line)) log.push(line);
        if (verbose) console.log(line);
      }
    }
    game.events = [];
  }
  return { game, log };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === 'many') {
    const tally = {};
    let gens = 0;
    let stuns = 0;
    let time = 0;
    const N = Number(process.argv[3]) || 20;
    const killerLevel = Number(process.argv[4] ?? 1);
    const survivorLevel = Number(process.argv[5] ?? 1);
    for (let seed = 1; seed <= N; seed++) {
      const { game } = simulate(seed, { killerLevel, survivorLevel });
      const w = game.result ? game.result.winner : 'timeout';
      tally[w] = (tally[w] || 0) + 1;
      gens += game.gensDone();
      time += game.time;
      for (const p of game.players.values()) stuns += p.stats.stuns;
    }
    console.log(tally, 'avg gens', (gens / N).toFixed(2), 'avg stuns', (stuns / N).toFixed(2), 'avg time', (time / N).toFixed(0));
    process.exit(0);
  }
  const seed = Number(process.argv[2]) || 1;
  const { game } = simulate(seed, { verbose: true });
  console.log('over:', game.over, 'time:', game.time.toFixed(0), 'gens:', game.gensDone(), game.gens.map((g) => g.progress.toFixed(2)).join(' '));
  console.log(JSON.stringify(game.result && { winner: game.result.winner, escaped: game.result.escaped, dead: game.result.dead }));
  for (const p of game.players.values()) console.log(p.name, p.role, p.health ?? '', JSON.stringify(p.stats));
}
