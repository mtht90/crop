// 自己対戦シミュレーション: 各エンティティを「思い浮かべた」仮想プレイヤーに答えさせ、
// 当たる率・平均質問数を測る。  node test/simulate.mjs [サンプル数] [ノイズ率]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../lib/compile.mjs';
import { Engine } from '../public/engine.js';

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(p, r) {
  let c = 0;
  for (let a = 0; a < 5; a++) { c += p[a]; if (r < c) return a; }
  return 4;
}

/** 仮想プレイヤー: noise の確率でエンジンのモデル分布から回答をサンプル、それ以外は素直に答える */
export function play(engine, target, rng, noise) {
  const g = engine.newGame(rng);
  let guesses = 0;
  for (let step = 0; step < 60; step++) {
    const d = g.guessDecision();
    if (d) {
      guesses++;
      if (d.e === target) return { win: true, questions: g.history.length, guesses };
      if (guesses >= 3) return { win: false, questions: g.history.length, guesses };
      g.reject(d.e);
      continue;
    }
    const q = g.nextQuestion();
    if (q < 0) break;
    const p = engine.prob(target, q);
    let a;
    if (rng() < noise) a = sample(p, rng());
    else a = p.indexOf(Math.max(...p)); // 最尤の回答
    g.answer(q, a);
  }
  return { win: false, questions: g.history.length, guesses };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const db = compile(path.join(root, 'data'));
  const engine = new Engine(db);
  const n = +(process.argv[2] || 200);
  const noise = +(process.argv[3] || 0.15);
  const rng = mulberry32(42);
  let wins = 0, qs = 0, first = 0;
  const t0 = Date.now();
  const losses = [];
  for (let i = 0; i < n; i++) {
    const target = Math.floor(rng() * engine.E);
    const r = play(engine, target, rng, noise);
    if (r.win) { wins++; qs += r.questions; if (r.guesses === 1) first++; }
    else losses.push(engine.entities[target].n);
  }
  console.log(`entities=${engine.E} questions=${engine.Q} noise=${noise}`);
  console.log(`win ${(100 * wins / n).toFixed(1)}%  first-guess ${(100 * first / n).toFixed(1)}%  avg questions(win) ${(qs / Math.max(1, wins)).toFixed(1)}  ${((Date.now() - t0) / n).toFixed(0)}ms/game`);
  if (losses.length) console.log('lost:', losses.slice(0, 30).join(', '));
}
