// CPU 4人で遠征（地図の陣取り）を最後まで繰り返し、バランスを確認する（v4）
// 使い方: npm run sim -- [回数] [ステージ]
import { CARDS, HERO_ORDER, REGIONS, STAGES } from '../src/data/defs.ts';
import { Battle, noopBattleView } from '../src/game/battle.ts';
import { BattleAI } from '../src/game/battleAi.ts';
import { Campaign, type CampaignView } from '../src/game/campaign.ts';
import { CampaignAI } from '../src/game/campaignAi.ts';
import type { StageId } from '../src/game/types.ts';

const N = Number(process.argv[2] ?? 200);
const stage = (process.argv[3] ?? 'meadow') as StageId;
const noop = async () => {};
const view: CampaignView = { roundStart: noop, lordTurn: noop, declare: noop, result: noop, regionChange: noop, reward: noop, eliminated: noop, dragonRaid: noop, finish: noop, log: () => {}, sync: () => {} };
const pool = Object.values(CARDS).filter((c) => !c.token && c.unlockLevel <= 10).map((c) => c.id);

const heroWins: Record<string, number> = {};
const persWins: Record<string, number> = {};
let battles = 0, elim = 0, early = 0, dragon = 0, comeback = 0, raids = 0;
const winRegions: number[] = [];
const margin: number[] = [];
const attacks: Record<string, [number, number]> = {};
const t0 = Date.now();
for (let k = 0; k < N; k++) {
  const heroes = [...HERO_ORDER].sort(() => Math.random() - 0.5).slice(0, 4);
  const skill = STAGES[stage].aiSkill;
  const c = new Campaign(
    { stage, rounds: 8, heroes, names: ['A', 'B', 'C', 'D'], humanIndex: -1, cardPool: pool, seed: 1000 + k },
    view,
    heroes.map(() => new CampaignAI(skill)),
    async (_c, f) => {
      battles++;
      if (f.attacker === 'dragon') raids++;
      const b = new Battle(f.setup, noopBattleView, [new BattleAI(skill), new BattleAI(skill)]);
      const won = (await b.run()) === 0;
      const key = f.defender ? (REGIONS[f.region].kind === 'capital' ? 'capital' : 'lordland') : REGIONS[f.region].kind;
      attacks[key] ??= [0, 0];
      attacks[key][0]++;
      if (won) attacks[key][1]++;
      return won;
    },
  );
  await c.run();
  const w = c.lords[c.winner!];
  heroWins[w.hero] = (heroWins[w.hero] ?? 0) + 1;
  persWins[w.personality] = (persWins[w.personality] ?? 0) + 1;
  elim += c.lords.filter((l) => !l.alive).length;
  if (c.round <= 8 && c.alive.length === 1) early++;
  if (c.dragonSlayer !== null) dragon++;
  if (w.stats.lowestRankSeen >= 2) comeback++;
  const r = c.ranking();
  winRegions.push(c.regionsOf(r[0].id).length);
  margin.push(c.regionsOf(r[0].id).length - c.regionsOf(r[1].id).length);
}
const pct = (n: number) => `${((n / N) * 100).toFixed(0)}%`;
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`ステージ ${stage} / ${N}試合 (${((Date.now() - t0) / 1000).toFixed(1)}秒)  1試合のバトル ${(battles / N).toFixed(1)}（竜の襲撃 ${(raids / N).toFixed(1)}）`);
console.log('優勝者の領地 中央値', med(winRegions), '/ 13  2位との差 中央値', med(margin), ' 脱落した領主/試合', (elim / N).toFixed(2), ' 1人勝ち残り', pct(early), ' 竜を倒した', pct(dragon), ' 逆転勝ち', pct(comeback));
console.log('攻めた先ごとの 回数/試合・勝率', Object.fromEntries(Object.entries(attacks).map(([k, [n, w]]) => [k, `${(n / N).toFixed(1)} / ${((w / n) * 100).toFixed(0)}%`])));
console.log('キャラ別勝利', heroWins);
console.log('性格別勝利', persWins);
