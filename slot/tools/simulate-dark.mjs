// DARKNIGHT の検証: 機械割・初当たり・CZ・AT 平均獲得・制御破綻・押し順ベル
//   node slot/tools/simulate-dark.mjs [games=300000]
import { DCONFIG } from '../src/dark/config.js';
import { DarkMachine } from '../src/dark/machine.js';

const GAMES = +(process.argv[2] || 300000);
const R = { L: 0, C: 1, R: 2 };
for (let s = 1; s <= 6; s++) {
  const cfg = structuredClone(DCONFIG);
  const m = new DarkMachine(cfg);
  cfg.setting = s;
  m.medals = 1e9;
  const N = m.logic.N;
  let broken = 0, bellOk = 0, bellAt = 0, atGames = 0, ceil = 0, full = 0;
  const atNets = [];
  for (let g = 0; g < GAMES; g++) {
    m.bet();
    const f = m.start();
    // 通常時は順押し、AT 中はナビどおり
    const order = f.naviShow ? f.naviShow.split('').map((c) => R[c]) : [0, 1, 2];
    const stops = [null, null, null];
    const wasAt = m.inAt;
    for (const r of order) stops[r] = m.decideStop(r, Math.floor(Math.random() * N), stops);
    const res = m.settle(stops);
    if (wasAt) atGames++;
    const allowed = new Set([m.effRole(order[2])].filter(Boolean));
    for (const n of res.roleNames) if (!allowed.has(n)) broken++;
    if (f.naviShow) { bellAt++; if (res.roleNames.includes('BELL')) bellOk++; }
    for (const e of res.at) {
      if (e.type === 'atEnd') { atNets.push(e.net); if (e.full) full++; }
    }
    for (const e of f.ev) if (e.type === 'ceiling') ceil++;
  }
  const S = m.stats;
  const avg = atNets.reduce((a, b) => a + b, 0) / (atNets.length || 1);
  console.log(`設定${s}: 機械割 ${(S.out / S.in * 100).toFixed(1)}%  AT 1/${(S.normalGames / S.at).toFixed(0)}  CZ 1/${(S.normalGames / S.cz).toFixed(0)}  AT平均 ${avg.toFixed(0)}枚 (${(atGames / (atNets.length || 1)).toFixed(0)}G)  完走 ${full}  天井 ${ceil}  ナビ成功 ${(bellOk / bellAt * 100).toFixed(1)}%  制御破綻 ${broken}`);
}
