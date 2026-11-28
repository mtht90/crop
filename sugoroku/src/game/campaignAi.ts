// 遠征の CPU（どこを攻めるか、報酬に何を取るか）
import { CARDS, REGIONS, startDeck } from '../data/defs.ts';
import type { Campaign, CampaignController, Choice, TrainPick } from './campaign.ts';
import type { Lord } from './types.ts';

const RARITY = { common: 1, rare: 1.7, epic: 2.6 };
/** デッキの強さのめやす（カードの質の平均） */
export function deckPower(deck: string[]) {
  const v = deck.map((c) => {
    const d = CARDS[c];
    const base = RARITY[d.rarity] + (d.type === 'unit' ? ((d.atk ?? 0) + (d.hp ?? 0)) / Math.max(1, d.cost) / 3 : 0.3);
    return base;
  });
  return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
}
/** 初期デッキ相手の勝率のめやす（scripts/battle-sim の結果から） */
const BASE_WIN: Record<string, number> = { forest: 0.8, mine: 0.68, harbor: 0.8, grave: 0.78, goblin: 0.56, spider: 0.53, tower: 0.54, fort: 0.46, dragon: 0.05 };

export class CampaignAI implements CampaignController {
  skill: number;
  constructor(skill: number) {
    this.skill = skill;
  }

  winChance(c: Campaign, l: Lord, region: number) {
    const r = REGIONS[region];
    const o = c.owner[region];
    const mine = deckPower(l.deck);
    const base = deckPower(startDeck(l.hero));
    let p: number;
    if (o === null) p = BASE_WIN[r.kind] + (mine - base) * 0.9 + (r.kind === 'dragon' ? (mine - base) * 0.6 : 0);
    else {
      const d = c.lords[o];
      p = (r.kind === 'capital' ? 0.3 : 0.5) + (mine - deckPower(d.deck)) * 0.8;
    }
    return Math.max(0.03, Math.min(0.95, p));
  }

  regionValue(c: Campaign, _l: Lord, region: number) {
    const r = REGIONS[region];
    const o = c.owner[region];
    let v = 1;
    if (r.kind === 'dragon') v += 1.5;
    if (o !== null) {
      v += 0.6; // 相手から奪うと差が2つ縮まる
      if (r.kind === 'capital') v += 0.6 + c.regionsOf(o).length * 0.15; // 王都を落とせば脱落させられる
      if (c.rankOf(c.lords[o]) === 0) v += 0.4;
    }
    // 島の内側の領地は、となりが多く次の手が広がる
    if (['goblin', 'spider', 'tower', 'fort'].includes(r.kind)) v += 0.3;
    return v;
  }

  async choose(c: Campaign, l: Lord): Promise<Choice> {
    const risk = { careful: 0.8, greedy: 1.0, gambler: 1.2 }[l.personality];
    let best: Choice = { type: 'train' };
    let bv = 0.36 + (l.deck.length < 14 ? 0.08 : 0);
    for (const t of c.targets(l)) {
      const p = this.winChance(c, l, t);
      if (REGIONS[t].kind === 'capital' && p < 0.38) continue; // 勝ち目の薄い王都攻めはしない
      let v = p * this.regionValue(c, l, t) * risk;
      if (c.rng.chance((1 - this.skill) * 0.3)) v += c.rng.next() * 0.4;
      if (v > bv) {
        bv = v;
        best = { type: 'attack', region: t };
      }
    }
    return best;
  }

  async reward(_c: Campaign, l: Lord, offers: string[]): Promise<number> {
    let best = 0;
    let bv = -1;
    offers.forEach((id, i) => {
      const d = CARDS[id];
      let v = RARITY[d.rarity] + d.cost * 0.15 + (d.type === 'unit' ? ((d.atk ?? 0) + (d.hp ?? 0)) / Math.max(1, d.cost) * 0.4 : 0.4);
      if (l.hero === 'mage' && d.type === 'spell') v += 0.4;
      if (l.hero === 'ranger' && d.kw?.includes('ranged')) v += 0.5;
      if (l.hero === 'assassin' && d.kw?.includes('rush')) v += 0.5;
      if (l.hero === 'knight' && d.kw?.includes('guard')) v += 0.4;
      if (v > bv) {
        bv = v;
        best = i;
      }
    });
    return best;
  }

  async train(c: Campaign, l: Lord, offers: string[]): Promise<TrainPick> {
    // デッキが大きくなったら、弱いカードを抜く
    if (l.deck.length >= 16) {
      const weak = ['recruit', 'spear', 'wolf', 'goblin'].find((x) => l.deck.includes(x));
      if (weak) return { kind: 'remove', card: weak };
    }
    return { kind: 'add', index: await this.reward(c, l, offers) };
  }
}
