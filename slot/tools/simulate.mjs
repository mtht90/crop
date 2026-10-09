// 機械割・引き込み率・制御破綻をモンテカルロ検証する
//   node slot/tools/simulate.mjs [games=200000] [aim=0.0]
//   aim: ボーナス成立中にプレイヤーが 7 を狙える確率 (0..1)
import { CONFIG } from '../src/config.js';
import { Machine } from '../src/machine.js';

const GAMES = +(process.argv[2] || 200000);
const AIM = +(process.argv[3] || 0.6);

function run(setting) {
  const cfg = structuredClone(CONFIG);
  cfg.setting = setting;
  cfg.play.assistAlignAfterNotice = false;
  const m = new Machine(cfg);
  cfg.setting = setting; // newDay() の隠し設定を上書き
  m.medals = 1e9;
  const N = m.logic.N;
  const flagCount = {}, hitCount = {};
  let broken = 0, tenpaiNoBonus = 0;
  for (let g = 0; g < GAMES; g++) {
    m.bet();
    const flag = m.start();
    const key = (flag.small || '-') + '/' + (flag.bonus || '-');
    flagCount[key] = (flagCount[key] || 0) + 1;
    const order = Math.random() < 0.85 ? [0, 1, 2] : [0, 2, 1];
    const stops = [null, null, null];
    for (const r of order) {
      let press = Math.floor(Math.random() * N);
      // 狙い打ち: ボーナス成立中、一定確率で 7 の手前を狙う
      if (flag.bonus && !flag.small && Math.random() < AIM) {
        const idx = m.logic.strips[r].indexOf('R');
        press = (idx - Math.floor(Math.random() * 4) + N) % N;
      }
      stops[r] = m.decideStop(r, press, stops);
      if (m.logic.tenpai(stops).length && !flag.bonus && m.mode === 'normal') tenpaiNoBonus++;
    }
    const allowed = new Set([flag.small, flag.bonus].filter(Boolean));
    const res = m.settle(stops);
    for (const n of res.roleNames) {
      if (!allowed.has(n)) broken++;
      hitCount[n] = (hitCount[n] || 0) + 1;
    }
  }
  return { setting, rate: m.stats.out / m.stats.in, big: m.stats.big, reg: m.stats.reg, games: m.stats.games, broken, tenpaiNoBonus, flagCount, hitCount };
}

for (let s = 1; s <= 6; s++) {
  const r = run(s);
  console.log(`設定${s}: 機械割 ${(r.rate * 100).toFixed(1)}%  BIG 1/${(r.games / r.big).toFixed(0)}  REG 1/${(r.games / r.reg).toFixed(0)}  制御破綻 ${r.broken}  非成立テンパイ ${r.tenpaiNoBonus}`);
  if (s === 1 || s === 6) {
    const f = r.flagCount, h = r.hitCount;
    const pull = (fl, role) => {
      const n = Object.entries(f).filter(([k]) => k.startsWith(fl + '/')).reduce((a, [, v]) => a + v, 0);
      return n ? ((h[role] || 0) / n * 100).toFixed(1) + '%' : '-';
    };
    console.log('   引き込み率 ぶどう', pull('GRAPE', 'GRAPE'), 'REPLAY', pull('REPLAY', 'REPLAY'), 'ベル', pull('BELL', 'BELL'), 'ピエロ', pull('CLOWN', 'CLOWN'), 'CHERRY', pull('CHERRY', 'CHERRY'), 'BONUS', pull('BONUS_GRAPE', 'BONUS_GRAPE'));
  }
}
