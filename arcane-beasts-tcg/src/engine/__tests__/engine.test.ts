import { describe, expect, it } from 'vitest';
import { aiAnswer } from '../ai';
import { ALL_DECKS, deckById, expand, validateDeck } from '../decks';
import { canPay, Game, maxHp } from '../game';
import { ALL_CARDS, byName, card } from '../cards';
import { aceCandidates, buildDeck } from '../autodeck';
import { applyRanked, DAN, freshRank, MEIJIN, RANKS } from '../../state/ranked';

function playOut(d0: string, d1: string, seed: number) {
  const a = ALL_DECKS.find((d) => d.id === d0)!;
  const b = ALL_DECKS.find((d) => d.id === d1)!;
  const g = Game.create([expand(a.cards), expand(b.cards)], ['A', 'B'], seed);
  g.start();
  let steps = 0;
  let actions = 0;
  let lastTurn = 0;
  while (g.pending && steps++ < 5000) {
    if (g.s.turn !== lastTurn) {
      lastTurn = g.s.turn;
      actions = 0;
    }
    const pr = g.pending;
    if (pr.type === 'action') actions++;
    g.answer(aiAnswer(g, 'normal', actions));
  }
  return g;
}

describe('cards', () => {
  it('all starter decks are legal', () => {
    for (const d of ALL_DECKS) expect(validateDeck(expand(d.cards)), d.name).toEqual([]);
  });
  it('card ids unique', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('evolution chains resolve', () => {
    const names = new Set(ALL_CARDS.map((c) => c.name));
    for (const c of ALL_CARDS) if (c.kind === 'monster' && c.evolvesFrom) expect(names.has(c.evolvesFrom), c.name).toBe(true);
  });
});

describe('cost payment', () => {
  it('handles colored + colorless', () => {
    expect(canPay([['fire'], ['fire']], ['fire', 'colorless'])).toBe(true);
    expect(canPay([['water'], ['fire']], ['fire', 'fire'])).toBe(false);
    expect(canPay([['colorless'], ['colorless'], ['fire']], ['fire', 'colorless', 'colorless'])).toBe(true);
    expect(canPay([['fire', 'water'], ['water']], ['water', 'fire'])).toBe(true);
  });
});

describe('AI vs AI', () => {
  const ids = ALL_DECKS.map((d) => d.id);
  let seed = 1;
  for (const a of ids) {
    for (const b of ids) {
      if (a > b) continue;
      it(`${a} vs ${b}`, () => {
        for (let k = 0; k < 2; k++) {
          const g = playOut(a, b, seed++);
          expect(g.over, `game did not finish (turn ${g.s.turn})`).toBe(true);
        }
      }, 60000);
    }
  }
});

describe('第2弾 rules', () => {
  function started(seed = 7) {
    const g = Game.create([expand(deckById('dragoon').cards), expand(deckById('lich').cards)], ['A', 'B'], seed);
    g.start();
    // answer setup/mulligan prompts until the first main-phase decision
    let n = 0;
    while (g.pending && g.pending.type !== 'action' && n++ < 50) g.answer(aiAnswer(g, 'normal', 0));
    return g;
  }
  const inst = (g: Game, cid: string, owner: 0 | 1) => ({ uid: 90000 + Math.floor(Math.random() * 9999), cid, owner });

  it('EX knocked out gives 3 prizes, Ω gives 2', () => {
    for (const [name, want] of [['ドラグーン', 3], ['トリトン', 2], ['ドレイクファイター', 1]] as const) {
      const g = started();
      const victim = g.s.players[1];
      const slot = g.newSlot(inst(g, byName(name).id, 1));
      slot.damage = 999;
      victim.bench.push(slot);
      const before = g.s.players[0].prizes.length;
      const it = g.resolveKOs();
      it.next();
      expect(before - g.s.players[0].prizes.length, name).toBe(want);
    }
  });

  it('亡者の港 raises HP only for monsters without a rule box', () => {
    const g = started();
    const plain = g.newSlot(inst(g, byName('ドレイクファイター').id, 0));
    const ex = g.newSlot(inst(g, byName('ドラグーン').id, 0));
    g.s.stadium = inst(g, byName('亡者の港').id, 0);
    expect(maxHp(g.s, plain)).toBe(130);
    expect(maxHp(g.s, ex)).toBe(310);
  });

  it('EX cards carry their flag and rarity', () => {
    const exs = ALL_CARDS.filter((c) => c.kind === 'monster' && c.ex && !c.variant);
    expect(exs.length).toBe(5);
    for (const c of exs) expect(c.rarity).toBe('RR');
  });
});

describe('おすすめ編成', () => {
  const all = () => 4; // own 4 of every printing
  it('builds a legal deck around every ace candidate', () => {
    const aces = aceCandidates(all);
    expect(aces.length).toBeGreaterThan(20);
    for (const a of aces) {
      const d = buildDeck(a.name, all);
      expect(validateDeck(d.cards), a.name).toEqual([]);
      expect(d.cards.some((id) => card(id).name === a.name), a.name).toBe(true);
    }
  });
  it('only uses cards you own', () => {
    const mine: Record<string, number> = {};
    for (const [n, k] of deckById('dragoon').cards) mine[byName(n).id] = k;
    const own = (id: string) => mine[id] ?? 0;
    const d = buildDeck('ドラグーン', own);
    expect(validateDeck(d.cards)).toEqual([]);
    const used = new Map<string, number>();
    for (const id of d.cards) used.set(id, (used.get(id) ?? 0) + 1);
    for (const [id, n] of used) {
      const c = card(id);
      if (!(c.kind === 'energy' && c.basic)) expect(n, c.name).toBeLessThanOrEqual(own(id));
    }
  });
  it('auto decks can play a full game', () => {
    const a = buildDeck('リッチロード', all).cards;
    const b = buildDeck('ヴォルカリオン', all).cards;
    const g = Game.create([a, b], ['A', 'B'], 5);
    g.start();
    let steps = 0;
    let acts = 0;
    let turn = 0;
    while (g.pending && steps++ < 5000) {
      if (g.s.turn !== turn) {
        turn = g.s.turn;
        acts = 0;
      }
      if (g.pending.type === 'action') acts++;
      g.answer(aiAnswer(g, 'normal', acts));
    }
    expect(g.over).toBe(true);
  }, 60000);
});

describe('ランクマッチ', () => {
  it('級 never demotes; 100pt promotes and pays a reward once', () => {
    const r = freshRank();
    expect(applyRanked(r, false).after).toEqual({ rank: 0, pts: 0 });
    applyRanked(r, true);
    const c = applyRanked(r, true);
    expect(c.after.rank).toBe(1);
    expect(c.rewards.map((x) => x.rank)).toEqual([1]);
  });
  it('段 loses points and demotes below 0, never below 初段', () => {
    const r = { ...freshRank(), rank: DAN + 1, pts: 10 };
    const c = applyRanked(r, false);
    expect(c.demoted).toBe(true);
    expect(c.after.rank).toBe(DAN);
    const d = applyRanked({ ...freshRank(), rank: DAN, pts: 0 }, false);
    expect(d.after).toEqual({ rank: DAN, pts: 0 });
  });
  it('rank names run 10級 … 1級, 初段 … 十段, 名人', () => {
    expect(RANKS[0]).toBe('10級');
    expect(RANKS[9]).toBe('1級');
    expect(RANKS[DAN]).toBe('初段');
    expect(RANKS[19]).toBe('十段');
    expect(RANKS[MEIJIN]).toBe('名人');
  });
});
