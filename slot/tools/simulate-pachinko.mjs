// パチンコの検証
//   node slot/tools/simulate-pachinko.mjs balls   … 打ち出しの強さごとの入賞率 (物理)
//   node slot/tools/simulate-pachinko.mjs spec [千円あたり回転数=18] [日数=2000] … 出玉率 (抽選のみ)
import { PCONFIG } from '../src/pachinko/config.js';
import { BallWorld } from '../src/pachinko/physics.js';
import { PachinkoLogic } from '../src/pachinko/logic.js';

const mode = process.argv[2] || 'balls';

function shoot(power, n, open = {}) {
  const w = new BallWorld(PCONFIG);
  Object.assign(w.open, open);
  const c = { heso: 0, denchu: 0, attacker: 0, general: 0, gate: 0, out: 0, foul: 0 };
  let fired = 0, t = 0;
  while (fired < n || w.balls.length) {
    if (fired < n && t >= fired * 0.6) { w.launch(power); fired++; }
    w.step(1 / 60);
    t += 1 / 60;
    for (const e of w.events) c[e.type] = (c[e.type] || 0) + 1;
    w.events.length = 0;
  }
  return c;
}

if (mode === 'balls') {
  const N = +(process.argv[3] || 1500);
  for (const p of (process.env.PW || '0.3,0.4,0.45,0.5,0.55,0.6,0.7,0.8,0.9,0.95,1.0').split(',').map(Number)) {
    const c = shoot(p, N);
    const pct = (k) => (c[k] / N * 100).toFixed(1).padStart(5) + '%';
    console.log(`power ${p.toFixed(2)}  ヘソ ${pct('heso')} (千円 ${(c.heso / N * 250).toFixed(1)} 回)  一般 ${pct('general')}  ゲート ${pct('gate')}  アウト ${pct('out')}`);
  }
  const r = shoot(0.97, N, { denchu: true, attacker: true });
  console.log(`右打ち (電チュー・アタッカー開放) 電チュー ${(r.denchu / N * 100).toFixed(1)}%  アタッカー ${(r.attacker / N * 100).toFixed(1)}%  ゲート ${(r.gate / N * 100).toFixed(1)}%`);
} else if (mode === 'spec') {
  // 抽選だけの出玉率。1 日 = 通常時 N 回転をこなすまで、電サポ中は玉が減らない前提
  const perK = +(process.argv[3] || 18);
  const days = +(process.argv[4] || 2000);
  const P = PCONFIG;
  let inBalls = 0, outBalls = 0, hits = 0, first = 0;
  for (let d = 0; d < days; d++) {
    const L = new PachinkoLogic(P);
    let normalSpins = 0;
    while (normalSpins < 2000) {
      if (L.round) {
        const r = L.round;
        outBalls += P.payout.attacker * P.spec.roundCount * r.rounds;
        inBalls += P.spec.roundCount * r.rounds; // 打ち込んだ分
        r.n = r.rounds; L.nextRound();
        continue;
      }
      if (!L.current) {
        if (!L.holds.heso.length && !L.holds.denchu.length) {
          if (L.support) L.enter('denchu'); else { L.enter('heso'); inBalls += 250 / perK; outBalls += P.payout.heso; normalSpins++; }
        }
        L.nextVariation();
      }
      const res = L.endVariation();
      if (res?.round) { hits++; if (res.round.chain === 1) first++; }
    }
  }
  console.log(`千円 ${perK} 回転: 出玉率 ${(outBalls / inBalls * 100).toFixed(1)}%  初当たり 1/${(days * 2000 / first).toFixed(0)}  平均連チャン ${(hits / first).toFixed(2)}`);
}
if (mode === 'right') {
  const N = +(process.argv[3] || 600);
  for (const [name, open] of [['電チュー開', { denchu: true }], ['アタッカー開', { attacker: true }], ['両方閉', {}]]) {
    const r = shoot(0.97, N, open);
    console.log(`右打ち ${name}: 電チュー ${(r.denchu / N * 100).toFixed(1)}%  アタッカー ${(r.attacker / N * 100).toFixed(1)}%  ヘソ ${(r.heso / N * 100).toFixed(1)}%  アウト ${(r.out / N * 100).toFixed(1)}%`);
  }
}
