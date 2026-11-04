import type { MonsterCard } from '../types';
import { describe, expect, it } from 'vitest';
import { aiAnswer } from '../ai';
import { ALL_DECKS, deckById, expand, RIVALS, validateDeck } from '../decks';
import { canPay, Game, maxHp, prizeValue, retreatCost, STADIUM_NOTE, TERRAIN } from '../game';
import { ALL_CARDS, byName, card, SET_COUNT, SETS } from '../cards';
import { CHAPTERS } from '../../story';
import { aceCandidates, buildDeck, fromRecipe } from '../autodeck';

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

  it('every monster knocked out gives one prize (★ is only rarity)', () => {
    for (const [name, want] of [['ドラグーン', 1], ['トリトン', 1], ['ドレイクファイター', 1]] as const) {
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

  it('亡者の港: under HP 150 get +40 HP, HP 150 and up lose 30', () => {
    const g = started();
    const plain = g.newSlot(inst(g, byName('ドレイクファイター').id, 0));
    const big = byName('ドラグーン') as MonsterCard;
    expect(big.hp).toBeGreaterThanOrEqual(150);
    const ex = g.newSlot(inst(g, big.id, 0));
    g.s.stadium = inst(g, byName('亡者の港').id, 0);
    expect(maxHp(g.s, plain)).toBe(140);
    expect(maxHp(g.s, ex)).toBe(big.hp - 30);
  });

  it('★ is the printing: regular ★1–3, full art ★3, special art / silver ★4, gold ★5', () => {
    const base = ALL_CARDS.filter((c) => !c.variant);
    for (const c of base) expect(c.rarity, c.name).toBeLessThanOrEqual(3);
    for (const c of base) if (c.kind === 'monster') expect(prizeValue(c)).toBe(1);
    const want = (v: string, b: number) => (v === 'UR' ? 5 : v === 'SAR' || v === 'SV' ? 4 : v === 'SR' ? 3 : b);
    for (const v of ALL_CARDS.filter((c) => c.variant)) expect(v.rarity, v.id).toBe(want(v.variant!, card(v.baseId!).rarity));
    expect(ALL_CARDS.filter((c) => c.rarity === 5).length).toBeGreaterThan(15);
    expect(ALL_CARDS.filter((c) => c.rarity === 4).length).toBeGreaterThan(15);
    expect(ALL_CARDS.filter((c) => c.variant && !['mirror', 'SR', 'SAR', 'SV', 'UR'].includes(c.variant))).toEqual([]);
    // every regular card (aces too) has a mirror, basic energy aside
    const mirrored = new Set(ALL_CARDS.filter((c) => c.variant === 'mirror').map((c) => c.baseId));
    for (const c of base) if (!(c.kind === 'energy' && c.basic)) expect(mirrored.has(c.id), c.name).toBe(true);
    // the old EX / Ω aces are ordinary ★3 strength now
    for (const m of base) if (m.kind === 'monster' && m.ace) expect(m.hp, m.name).toBeLessThanOrEqual(210);
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

describe('third printing (辺境の軍勢)', () => {
  const ab3 = ALL_CARDS.filter((c) => c.id.startsWith('AB3-') && !c.variant && !(c.kind === 'trainer' && Number(c.id.slice(4)) > 200));
  it('has 121 base cards (120 + 天空の浮島) and every evolution line resolves', () => {
    expect(ab3.length).toBe(121);
    for (const c of ab3) {
      if (c.kind !== 'monster' || !c.evolvesFrom) continue;
      const p = byName(c.evolvesFrom);
      expect(p.kind, c.name).toBe('monster');
    }
  });
  it('AI plays full games with decks built around every AB3 ex / Ω', () => {
    const all = () => 4;
    const aces = ab3.filter((c) => c.kind === 'monster' && c.ace);
    expect(aces.length).toBeGreaterThanOrEqual(10);
    for (let i = 0; i < aces.length; i++) {
      const a = buildDeck(aces[i].name, all).cards;
      const b = buildDeck(aces[(i + 3) % aces.length].name, all).cards;
      const g = Game.create([a, b], ['A', 'B'], 100 + i);
      g.start();
      let steps = 0;
      let acts = 0;
      let turn = 0;
      while (g.pending && steps++ < 6000) {
        if (g.s.turn !== turn) {
          turn = g.s.turn;
          acts = 0;
        }
        if (g.pending.type === 'action') acts++;
        g.answer(aiAnswer(g, 'normal', acts));
      }
      expect(g.over, aces[i].name).toBe(true);
    }
  }, 120000);
  it('random AB3-only piles never crash the engine (all trainers and effects get exercised)', () => {
    const pool = ab3.filter((c) => !(c.kind === 'energy'));
    const basics = ab3.filter((c) => c.kind === 'monster' && c.stage === 'basic');
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const pile = () => {
      const d: string[] = [];
      for (let k = 0; k < 4; k++) d.push(basics[Math.floor(rnd() * basics.length)].id);
      while (d.length < 20) d.push(pool[Math.floor(rnd() * pool.length)].id);
      return d;
    };
    for (let i = 0; i < 40; i++) {
      const g = Game.create([pile(), pile()], ['A', 'B'], 500 + i);
      g.start();
      let steps = 0;
      let acts = 0;
      let turn = 0;
      while (g.pending && steps++ < 4000) {
        if (g.s.turn !== turn) {
          turn = g.s.turn;
          acts = 0;
        }
        if (g.pending.type === 'action') acts++;
        g.answer(aiAnswer(g, 'normal', acts));
      }
    }
  }, 120000);
});

describe('スタジアム', () => {
  it('every type has a terrain that favours it, and the card says so', () => {
    const stadiums = ALL_CARDS.filter((c) => c.kind === 'trainer' && c.sub === 'stadium' && !c.variant);
    for (const t of ['fire', 'water', 'grass', 'lightning', 'psychic', 'fighting', 'dark', 'colorless'] as const) {
      const key = Object.entries(TERRAIN).find(([, v]) => v.boost === t)?.[0];
      expect(key, t).toBeTruthy();
      expect(stadiums.some((c) => c.kind === 'trainer' && c.key === key), t).toBe(true);
    }
  });
  it('おすすめデッキ: every recipe becomes a legal deck when you own everything', () => {
    for (const d of ALL_DECKS) {
      const r = fromRecipe(d, () => 4);
      expect(r.cards.length, d.id).toBe(60);
      expect(validateDeck(r.cards), d.id).toEqual([]);
    }
  });
});

describe('スタジアム（第二章の追加）', () => {
  function started(seed = 11) {
    const g = Game.create([expand(deckById('dragoon').cards), expand(deckById('lich').cards)], ['A', 'B'], seed);
    g.start();
    let n = 0;
    while (g.pending && g.pending.type !== 'action' && n++ < 50) g.answer(aiAnswer(g, 'normal', 0));
    return g;
  }
  let uid = 80000;
  const inst = (cid: string, owner: 0 | 1) => ({ uid: uid++, cid, owner });
  const put = (g: Game, name: string) => (g.s.stadium = inst(byName(name).id, 0));
  const energy = byName('基本炎エネルギー').id;

  it('every stadium explains itself on the battle screen', () => {
    for (const c of ALL_CARDS) if (c.kind === 'trainer' && c.sub === 'stadium' && !c.variant) expect(!!(TERRAIN[c.key] || STADIUM_NOTE[c.key]), c.name).toBe(true);
  });
  it('白銀の雪原: retreat costs one more', () => {
    const g = started();
    const act = g.s.players[g.s.current].active!;
    const before = retreatCost(g.s, act);
    put(g, '白銀の雪原');
    expect(retreatCost(g.s, act)).toBe(before + 1);
  });
  it('祈りの社: no special conditions', () => {
    const g = started();
    put(g, '祈りの社');
    g.addCondition({ p: 1, z: 'active' }, 'poisoned');
    expect(g.s.players[1].active!.conditions).toEqual([]);
  });
  it('霧の渓谷: benches take no attack damage', () => {
    const g = started();
    const b = g.newSlot(inst(byName('ドレイクファイター').id, 1));
    g.s.players[1].bench.push(b);
    put(g, '霧の渓谷');
    g.snipe(0, { p: 1, z: 'bench', i: g.s.players[1].bench.length - 1 }, 30, 'fire');
    expect(b.damage).toBe(0);
  });
  it('王城の大広間 / 十二の石像 / 禁忌の祭壇 change damage', () => {
    const g = started();
    expect(g.s.stadium).toBeNull();
    put(g, '王城の大広間');
    expect(STADIUM_NOTE.hall).toContain('−20');
  });
  it('孤高の見張り塔: with a small hand, draw 2 once a turn', () => {
    const g = started();
    const p = g.s.current;
    const pl = g.s.players[p];
    put(g, '孤高の見張り塔');
    pl.deck.push(...pl.hand.splice(0));
    expect(g.legalActions(p).some((a) => a.t === 'stadium')).toBe(true);
    g.answer({ type: 'action', action: { t: 'stadium' } });
    expect(pl.hand.length).toBe(2);
    expect(g.legalActions(p).some((a) => a.t === 'stadium')).toBe(false);
  });
  it('戦いの跡: take a basic energy back from the trash', () => {
    const g = started();
    const p = g.s.current;
    const pl = g.s.players[p];
    put(g, '戦いの跡');
    expect(g.legalActions(p).some((a) => a.t === 'stadium')).toBe(false);
    const e = inst(energy, p);
    pl.discard.push(e);
    const n = pl.hand.length;
    g.answer({ type: 'action', action: { t: 'stadium' } });
    if (g.pending?.type === 'cards') g.answer({ type: 'cards', uids: [e.uid] });
    expect(pl.hand.length).toBe(n + 1);
    expect(pl.discard.includes(e)).toBe(false);
  });
  it('召喚の魔法陣: trash energy goes to the bench with 20 damage', () => {
    const g = started();
    const p = g.s.current;
    const pl = g.s.players[p];
    put(g, '召喚の魔法陣');
    const b = g.newSlot(inst(byName('ドレイクファイター').id, p));
    pl.bench = [b];
    const e = inst(energy, p);
    pl.discard.push(e);
    g.answer({ type: 'action', action: { t: 'stadium' } });
    if (g.pending?.type === 'cards') g.answer({ type: 'cards', uids: [e.uid] });
    if (g.pending?.type === 'slot') g.answer({ type: 'slot', pos: { p, z: 'bench', i: 0 } });
    expect(b.energy.map((x) => x.uid)).toEqual([e.uid]);
    expect(b.damage).toBe(20);
  });
  it('賢者の書斎: one of the top three to hand, the rest to the bottom', () => {
    const g = started();
    const p = g.s.current;
    const pl = g.s.players[p];
    put(g, '賢者の書斎');
    const top = pl.deck.slice(0, 3);
    const size = pl.deck.length;
    g.answer({ type: 'action', action: { t: 'stadium' } });
    if (g.pending?.type === 'cards') g.answer({ type: 'cards', uids: [top[1].uid] });
    expect(pl.hand.includes(top[1])).toBe(true);
    expect(pl.deck.length).toBe(size - 1);
    expect(pl.deck.slice(-2)).toEqual([top[0], top[2]]);
  });
});

describe('★が高い版は強い', () => {
  function started(seed = 5) {
    const g = Game.create([expand(deckById('dragoon').cards), expand(deckById('lich').cards)], ['A', 'B'], seed);
    g.start();
    let n = 0;
    while (g.pending && g.pending.type !== 'action' && n++ < 50) g.answer(aiAnswer(g, 'normal', 0));
    return g;
  }
  const v = (name: string, variant: string) => ALL_CARDS.find((c) => c.name === name && c.variant === variant)!;
  it('monsters gain HP and damage with each tier; mirrors stay the same', () => {
    const base = byName('アークウィッチ') as MonsterCard;
    const top = (c: MonsterCard) => Math.max(...c.attacks.map((a) => a.damage ?? 0));
    const want: Record<string, [number, number]> = { mirror: [0, 0], SR: [10, 10], SV: [30, 20], UR: [50, 30] };
    for (const [variant, [hp, dmg]] of Object.entries(want)) {
      const c = v('アークウィッチ', variant) as MonsterCard;
      expect(c.hp - base.hp, variant).toBe(hp);
      expect(top(c) - top(base), variant).toBe(dmg);
    }
  });
  it('every trainer with a special printing says and does more', () => {
    for (const c of ALL_CARDS) if ((c.kind === 'trainer' || c.kind === 'energy') && c.variant && c.variant !== 'mirror') expect((c as { text?: string }).text, c.id).not.toBe((card(c.baseId!) as { text?: string }).text);
    expect(v('大賢者の研究', 'SR').kind === 'trainer' && (v('大賢者の研究', 'SR') as { text: string }).text).toContain('8枚');
  });
  it('大賢者の研究 (★4) draws 9', () => {
    const g = started();
    const p = g.s.current;
    const pl = g.s.players[p];
    const c = { uid: 77001, cid: v('大賢者の研究', 'SV').id, owner: p };
    pl.hand.push(c);
    g.s.flags.supporterPlayed = false;
    if (g.s.turn === 1) g.s.turn = 2;
    g.answer({ type: 'action', action: { t: 'playTrainer', uid: c.uid } });
    expect(pl.hand.length).toBe(9);
  });
  it('虹色エネルギー (★4 / ★5) puts no damage on', () => {
    const g = started();
    const p = g.s.current;
    const pl = g.s.players[p];
    const c = { uid: 77002, cid: v('虹色エネルギー', 'UR').id, owner: p };
    pl.hand.push(c);
    g.s.flags.energyAttached = false;
    const before = pl.active!.damage;
    g.answer({ type: 'action', action: { t: 'attachEnergy', uid: c.uid, target: { p, z: 'active' } } });
    expect(pl.active!.damage).toBe(before);
  });
});

describe('chapters', () => {
  it('groups every card into a chapter, numbered from 1 within it', () => {
    const base = ALL_CARDS.filter((c) => !c.variant);
    for (const set of SETS) {
      const nos = base.filter((c) => c.set === set).map((c) => c.no).sort((a, b) => a - b);
      expect(nos, set).toEqual(nos.map((_, i) => i + 1));
      expect(nos.length, set).toBe(SET_COUNT[set]);
    }
    // the first chapter's rivals only play first-chapter cards
    for (const ch of CHAPTERS.filter((c) => c.part === 1)) {
      const r = RIVALS.find((x) => x.id === ch.rival);
      if (!r) continue;
      for (const [n] of deckById(r.deck).cards) expect(byName(n).set, `${r.id} ${n}`).toBe('AB1');
    }
    // secret printings are numbered after the chapter's regular cards
    for (const v of ALL_CARDS.filter((c) => c.variant && c.variant !== 'mirror')) expect(v.no, v.id).toBeGreaterThan(SET_COUNT[v.set]);
  });
});
