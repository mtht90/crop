// CPU 4人で自動対戦を繰り返し、バランスを確認する。
// 使い方: npm run sim -- [回数] [ステージ]
import { CARDS, HERO_ORDER, STAGES } from '../src/data/defs.ts';
import { AIController } from '../src/game/ai.ts';
import { Game, type View } from '../src/game/engine.ts';
import type { CardId, StageId } from '../src/game/types.ts';

const N = Number(process.argv[2] ?? 300);
const stage = (process.argv[3] ?? 'meadow') as StageId;
const noop = async () => {};
const view: View = { turnStart: noop, dice: noop, move: noop, warp: noop, cash: noop, tile: noop, banner: noop, cardGained: noop, cardUsed: noop, log: () => {}, sync: () => {} };
const pool = Object.keys(CARDS) as CardId[];

const reasons: Record<string, number> = {};
const heroWins: Record<string, number> = {};
const persWins: Record<string, number> = {};
let reach2 = 0, anySet = 0;
let unownedEnd = 0, levelsEnd = 0, cashEnd = 0;
let rounds = 0, bankrupts = 0, monopolies = 0, jackpots = 0, takeovers = 0, comebacks = 0, landmarks = 0, maxToll = 0, turnsWithTollOver300 = 0;
const spread: number[] = [];
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
  rounds += g.s.round;
  bankrupts += g.s.players.filter((p) => p.bankrupt).length;
  for (const p of g.s.players) {
    monopolies += p.stats.monopoliesMax;
    jackpots += p.stats.jackpots;
    takeovers += p.stats.takeovers;
    landmarks += p.stats.landmarks;
    maxToll = Math.max(maxToll, p.stats.maxToll);
    if (p.stats.maxToll >= 300) turnsWithTollOver300++;
  }
  if (w.stats.lowestRankSeen >= 2) comebacks++;
  const mm = Math.max(...g.s.players.map((p) => p.stats.monopoliesMax));
  if (mm >= 2) reach2++;
  if (mm >= 1) anySet++;
  unownedEnd += g.s.tiles.filter((t, i) => g.price(i) > 0 && t.owner === null).length;
  levelsEnd += g.s.tiles.reduce((a, t) => a + (t.owner !== null ? t.level : 0), 0);
  cashEnd += g.s.players.reduce((a, p) => a + p.cash, 0) / 4;
  const assets = g.ranking().map((p) => g.assets(p));
  spread.push(assets[0] - assets[1]);
}
const pct = (n: number) => `${((n / N) * 100).toFixed(0)}%`;
spread.sort((a, b) => a - b);
console.log(`ステージ ${stage} / ${N}試合 (${((Date.now() - t0) / 1000).toFixed(1)}秒)`);
console.log('勝ち方', Object.fromEntries(Object.entries(reasons).map(([k, v]) => [k, pct(v)])));
console.log('平均ラウンド', (rounds / N).toFixed(1), ' 1試合の破産人数', (bankrupts / N).toFixed(2));
console.log('1人あたり 領地制覇', (monopolies / N / 4).toFixed(2), ' ジャックポット', (jackpots / N / 4).toFixed(2), ' 買収', (takeovers / N / 4).toFixed(2), ' 象徴', (landmarks / N / 4).toFixed(2));
console.log('最大通行料', maxToll, ' 300G以上を取った人の割合', pct(turnsWithTollOver300 / 4));
console.log('逆転勝ち（一度3位以下から優勝）', pct(comebacks));
console.log('1位と2位の差 中央値', spread[Math.floor(N / 2)], ' 25%', spread[Math.floor(N / 4)], ' 75%', spread[Math.floor((N * 3) / 4)]);
console.log('終了時 空き地', (unownedEnd / N).toFixed(1), '/18  建物段階の合計', (levelsEnd / N).toFixed(1), '  平均現金', Math.round(cashEnd / N));
console.log('誰かが領地制覇した試合', pct(anySet), ' 2色に達した試合（統一の王手）', pct(reach2));
console.log('キャラ別勝利', heroWins);
console.log('性格別勝利', persWins);
