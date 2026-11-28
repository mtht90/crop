// バトルだけのシミュレーション：初期デッキどうし、初期デッキ vs 中立の領地
// 使い方: npm run bsim -- [回数]
import { HERO_ORDER, REGIONS, neutralMana, startDeck } from '../src/data/defs.ts';
import { Battle, noopBattleView } from '../src/game/battle.ts';
import { BattleAI } from '../src/game/battleAi.ts';
import type { HeroId } from '../src/game/types.ts';

const N = Number(process.argv[2] ?? 400);
const deckOf = (h: HeroId) => startDeck(h);
async function duel(a: { hero: HeroId | null; deck: string[]; hp: number }, d: { hero: HeroId | null; deck: string[]; hp: number; manaBonus?: number }, seed: number) {
  const b = new Battle({ sides: [{ name: 'A', ...a }, { name: 'D', ...d }], seed }, noopBattleView, [new BattleAI(0.7), new BattleAI(0.7)]);
  const w = await b.run();
  return { w, turns: b.sides[0].turns, hpLeft: b.sides[w].hp };
}

// 1) 初期デッキどうし（先攻＝攻める側 20、守る側 14）
const heroWins: Record<string, number> = {};
let atkWins = 0, turns = 0;
for (let k = 0; k < N; k++) {
  const h1 = HERO_ORDER[k % 6], h2 = HERO_ORDER[Math.floor(k / 6) % 6];
  const r = await duel({ hero: h1, deck: deckOf(h1), hp: 20 }, { hero: h2, deck: deckOf(h2), hp: 18 }, 100 + k);
  if (r.w === 0) atkWins++;
  heroWins[r.w === 0 ? h1 : h2] = (heroWins[r.w === 0 ? h1 : h2] ?? 0) + 1;
  turns += r.turns;
}
console.log(`初期デッキどうし（攻め20 vs 守り18）：攻める側の勝率 ${((atkWins / N) * 100).toFixed(0)}%  平均ターン ${(turns / N).toFixed(1)}`);
console.log('キャラ別勝利', heroWins);

// 2) 初期デッキ vs 中立
for (const r of REGIONS.filter((x) => x.start === null)) {
  let w = 0, t = 0;
  for (let k = 0; k < N / 2; k++) {
    const h = HERO_ORDER[k % 6];
    const res = await duel({ hero: h, deck: deckOf(h), hp: 20 }, { hero: null, deck: r.defenders, hp: r.hp, manaBonus: neutralMana(r) }, 500 + k);
    if (res.w === 0) w++;
    t += res.turns;
  }
  console.log(`vs ${r.name}（城${r.hp}）：勝率 ${((w / (N / 2)) * 100).toFixed(0)}%  平均ターン ${(t / (N / 2)).toFixed(1)}`);
}
