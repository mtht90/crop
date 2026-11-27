// CPU 4人で自動対戦を繰り返し、バランスを確認する（v2：カードで動く陣取り）。
// 使い方: npm run sim -- [回数] [ステージ]
import { CARDS, HERO_ORDER, STAGES } from '../src/data/defs.ts';
import { AIController } from '../src/game/ai.ts';
import { Game, TERRITORIES, type View } from '../src/game/engine.ts';
import type { CardId, StageId } from '../src/game/types.ts';

const N = Number(process.argv[2] ?? 300);
const stage = (process.argv[3] ?? 'meadow') as StageId;
const noop = async () => {};
const view: View = { turnStart: noop, draw: noop, discardHand: noop, dice: noop, move: noop, warp: noop, cash: noop, tile: noop, banner: noop, cardUsed: noop, cardGained: noop, log: () => {}, sync: () => {} };
const pool = (Object.keys(CARDS) as CardId[]).filter((c) => c !== 'walk');

const reasons: Record<string, number> = {};
const heroWins: Record<string, number> = {};
const persWins: Record<string, number> = {};
let ups = 0, exh = 0, claims = 0, steals = 0, lost = 0, bought = 0, used = 0, forts = 0, jackpots = 0, comebacks = 0, emptyEnd = 0, cashEnd = 0;
const winTerr: number[] = [];
const margin: number[] = [];
const t0 = Date.now();
for (let k = 0; k < N; k++) {
  const heroes = [...HERO_ORDER].sort(() => Math.random() - 0.5).slice(0, 4);
  const g = new Game(
    { stage, rounds: 20, heroes, names: ['A', 'B', 'C', 'D'], humanIndex: -1, cardPool: pool, seed: 1000 + k },
    view,
    heroes.map(() => new AIController(STAGES[stage].aiSkill)),
  );
  await g.run();
  const w = g.s.players[g.s.winner!];
  reasons[g.s.winReason!] = (reasons[g.s.winReason!] ?? 0) + 1;
  heroWins[w.hero] = (heroWins[w.hero] ?? 0) + 1;
  persWins[w.personality] = (persWins[w.personality] ?? 0) + 1;
  for (const p of g.s.players) {
    claims += p.stats.claims;
    steals += p.stats.takeovers;
    lost += p.stats.lost;
    bought += p.stats.cardsBought;
    ups += p.stats.upgrades;
    exh += p.exhausted.length;
    used += p.stats.cardsUsed;
    forts += p.stats.forts;
    jackpots += p.stats.jackpots;
    cashEnd += p.cash / 4;
  }
  if (w.stats.lowestRankSeen >= 2) comebacks++;
  emptyEnd += TERRITORIES.filter((i) => g.s.tiles[i].owner === null).length;
  const r = g.ranking();
  winTerr.push(g.territories(r[0]).length);
  margin.push(g.territories(r[0]).length - g.territories(r[1]).length);
}
const pct = (n: number) => `${((n / N) * 100).toFixed(0)}%`;
const per = (n: number) => (n / N / 4).toFixed(2);
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`ステージ ${stage} / ${N}試合 (${((Date.now() - t0) / 1000).toFixed(1)}秒)`);
console.log('勝ち方', Object.fromEntries(Object.entries(reasons).map(([k, v]) => [k, pct(v)])));
console.log('1人あたり 旗', per(claims), ' 奪取', per(steals), ' 失陣', per(lost), ' カード購入', per(bought), ' カード使用', per(used), ' 強化', per(ups), ' 消耗', per(exh), ' 王城', per(forts), ' JP', per(jackpots));
console.log('優勝者の陣 中央値', med(winTerr), '/', TERRITORIES.length, ' 1位と2位の陣の差 中央値', med(margin), ' 終了時の空き陣', (emptyEnd / N).toFixed(1), ' 平均所持金', Math.round(cashEnd / N));
console.log('逆転勝ち（一度3位以下から優勝）', pct(comebacks));
console.log('キャラ別勝利', heroWins);
console.log('性格別勝利', persWins);
