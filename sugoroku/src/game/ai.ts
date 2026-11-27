// CPU の判断（v2：カードで動く陣取り）。性格とステージの強さで振る舞いが変わる。
import { CARDS, MAX_LEVEL, TILES, baseId, card } from '../data/defs.ts';
import { N_TILES, TERRITORIES, type Action, type Controller, type Game, type Question, type ShopPick, type TilePurpose, type UpgradeOffer } from './engine.ts';
import type { CardId, CardRef, Player } from './types.ts';

/** カードの「欲しさ」（カード屋で選ぶとき） */
const CARD_VALUE: Record<CardId, number> = {
  walk: 1, dice: 5, twin: 7, aim: 6, gale: 7, retreat: 4, teleport: 8,
  banner: 7, march: 8, fortify: 5, guard: 5, edict: 9,
  purse: 3, levy: 6, scheme: 5, thieves: 6,
  trap: 5, quake: 6, dragon: 9,
};

export class AIController implements Controller {
  skill: number;
  constructor(skill: number) {
    this.skill = skill;
  }

  private reserve(g: Game, p: Player) {
    const base = { careful: 220, greedy: 60, gambler: 120 }[p.personality];
    return base * g.stage.tollMul * (1 - (g.s.round / g.s.cfg.rounds) * 0.6);
  }
  private blunder(g: Game) {
    return g.rng.chance((1 - this.skill) * 0.15);
  }
  private completes(g: Game, p: Player, i: number) {
    const grp = TILES[i].group;
    return grp !== undefined && g.groupTiles(grp).every((k) => k === i || g.s.tiles[k].owner === p.id);
  }

  /** マス i に止まったときの嬉しさ */
  landScore(g: Game, p: Player, i: number): number {
    const t = g.s.tiles[i];
    let v = 0;
    if (t.trap !== null && t.trap !== p.id) v -= 100 * g.stage.tollMul;
    switch (TILES[i].kind) {
      case 'prop':
        if (t.owner === null) v += p.cash >= g.claimCost(i, p) ? 70 + (this.completes(g, p, i) ? 40 : 0) : 5;
        else if (t.owner === p.id) v += t.level < MAX_LEVEL && p.cash >= g.fortCost(i) ? 18 : 2;
        else v += -g.toll(i, p) + (t.guard === 0 && p.cash >= g.stealCost(i, p) + g.toll(i, p) ? 55 + (this.completes(g, p, i) ? 30 : 0) : 0);
        break;
      case 'shrine': v += p.cash >= 70 ? 32 : 5; break;
      case 'start': v += 40; break;
      case 'cathedral': v += 50; break;
      case 'jackpot': v += g.s.jackpot * 0.6; break;
      case 'event': v += 15; break;
      case 'tax': v -= Math.max(30, p.cash * 0.1); break;
      case 'dungeon': v -= 60; break;
      case 'portal': v += 45; break;
      case 'tavern': v += 5; break;
    }
    return v;
  }
  private avg(g: Game, p: Player, steps: number[]) {
    return steps.reduce((a, s) => a + this.landScore(g, p, (p.pos + s + N_TILES * 2) % N_TILES), 0) / steps.length;
  }
  private best(g: Game, p: Player, steps: number[]) {
    return steps.reduce((a, b) => (this.landScore(g, p, (p.pos + b + N_TILES) % N_TILES) > this.landScore(g, p, (p.pos + a + N_TILES) % N_TILES) ? b : a), steps[0]);
  }
  /** 移動カードの期待値 */
  private moveValue(g: Game, p: Player, c: CardRef): { v: number; target?: number } {
    const d = card(c);
    switch (d.id) {
      case 'walk': return { v: this.landScore(g, p, (p.pos + (d.up ? 2 : 1)) % N_TILES) - 10 };
      case 'dice': return { v: this.avg(g, p, d.up ? [2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6]) };
      case 'twin': {
        const s: number[] = [];
        for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) s.push(a + b);
        return { v: this.avg(g, p, s) + 5 };
      }
      case 'teleport': {
        const ts = g.cardTargets(p, c);
        const t = ts.reduce((a, b) => (this.landScore(g, p, b) > this.landScore(g, p, a) ? b : a), ts[0]);
        return { v: this.landScore(g, p, t) - (d.up ? 15 : 25), target: t };
      }
      default: {
        const b = this.best(g, p, d.steps!);
        return { v: this.landScore(g, p, (p.pos + b + N_TILES) % N_TILES) - d.cost * 6 };
      }
    }
  }
  /** 攻撃の対象としての価値（首位・王手の相手を優先） */
  private attackValue(g: Game, p: Player, i: number) {
    const t = g.s.tiles[i];
    const owner = g.s.players[t.owner!];
    const rank = g.rankOf(owner);
    let v = 40 + g.price(i) * 0.15 + t.level * 20;
    if (rank === 0) v += 40;
    if (g.territories(owner).length >= TERRITORIES.length - 4) v += 200;
    if (this.completes(g, p, i)) v += 50;
    return v;
  }

  async turn(g: Game, p: Player): Promise<Action> {
    const hand = p.hand.map((c, index) => ({ c, index })).filter((x) => g.canPlay(p, x.c));
    if (!hand.length) return { type: 'end' };
    const res = this.reserve(g, p);
    const moveCards = hand.filter((x) => card(x.c).move);
    const minMove = moveCards.length ? Math.min(...moveCards.map((x) => card(x.c).cost)) : 0;
    const spare = p.moved ? p.energy : p.energy - minMove; // 移動用に残す⚡
    // 同じ種類なら強化版を優先
    const find = (id: CardId) => hand.filter((x) => baseId(x.c) === id).sort((a, b) => (card(b.c).up ? 1 : 0) - (card(a.c).up ? 1 : 0))[0];
    const ok = (id: CardId) => !!find(id) && card(find(id)!.c).cost <= spare;
    const ref = (id: CardId) => find(id)!.c;

    if (find('purse')) return { type: 'play', index: find('purse')!.index };
    if (ok('scheme') && p.hand.length <= 4) return { type: 'play', index: find('scheme')!.index };
    if (ok('levy') && g.income(p) >= 60) return { type: 'play', index: find('levy')!.index };
    // 攻撃
    for (const id of ['dragon', 'edict', 'march', 'quake'] as CardId[]) {
      if (!ok(id) || this.blunder(g)) continue;
      const ts = g.cardTargets(p, ref(id));
      if (!ts.length) continue;
      const tgt = ts.reduce((a, b) => (this.attackValue(g, p, b) > this.attackValue(g, p, a) ? b : a), ts[0]);
      const cost = id === 'edict' || id === 'march' ? g.cardStealCost(tgt, p, ref(id)) : 0;
      if (p.cash - cost < res * 0.3) continue;
      if (this.attackValue(g, p, tgt) >= (id === 'quake' ? 70 : 60)) return { type: 'play', index: find(id)!.index, target: tgt };
    }
    // 旗手
    if (ok('banner')) {
      const ts = g.cardTargets(p, ref('banner'));
      if (ts.length && p.cash - g.claimCost(ts[0], p) >= res * 0.3) return { type: 'play', index: find('banner')!.index, target: ts.reduce((a, b) => (g.price(b) > g.price(a) ? b : a), ts[0]) };
    }
    // 守り：奪われそうな高い陣
    if (ok('guard')) {
      const rich = Math.max(0, ...g.alive.filter((o) => o !== p).map((o) => o.cash));
      const ts = g.cardTargets(p, ref('guard')).filter((i) => rich >= g.stealCost(i, g.s.players[(p.id + 1) % g.s.players.length]));
      if (ts.length) return { type: 'play', index: find('guard')!.index, target: ts.reduce((a, b) => (g.price(b) > g.price(a) ? b : a), ts[0]) };
    }
    // 罠：首位の少し先へ
    if (ok('trap') && g.rng.chance(0.7)) {
      const leader = g.ranking().find((o) => o !== p)!;
      const opts = g.cardTargets(p, ref('trap')).filter((i) => {
        const d = (i - leader.pos + N_TILES) % N_TILES;
        return d >= 3 && d <= 8;
      });
      if (opts.length) return { type: 'play', index: find('trap')!.index, target: g.rng.pick(opts) };
    }
    if (ok('thieves')) {
      const rich = Math.max(0, ...g.alive.filter((o) => o !== p).map((o) => o.cash));
      if (rich >= 400) return { type: 'play', index: find('thieves')!.index };
    }
    // 移動
    if (!p.moved && moveCards.length) {
      let best = moveCards[0];
      let bv = -Infinity;
      let bt: number | undefined;
      for (const m of moveCards) {
        const r = this.moveValue(g, p, m.c);
        const v = r.v + (this.blunder(g) ? g.rng.int(-40, 40) : 0);
        if (v > bv) {
          bv = v;
          best = m;
          bt = r.target;
        }
      }
      return { type: 'play', index: best.index, target: bt };
    }
    // 移動後の築城
    if (find('fortify') && card(ref('fortify')).cost <= p.energy) {
      const ts = g.cardTargets(p, ref('fortify'));
      if (ts.length) {
        const tgt = ts.reduce((a, b) => (g.price(b) > g.price(a) ? b : a), ts[0]);
        if (p.cash - g.fortCost(tgt) >= res) return { type: 'play', index: find('fortify')!.index, target: tgt };
      }
    }
    return { type: 'end' };
  }

  async confirm(g: Game, p: Player, q: Question): Promise<boolean> {
    const res = this.reserve(g, p);
    const left = p.cash - q.cost;
    switch (q.kind) {
      case 'claim':
        return left >= res * 0.25 || this.completes(g, p, q.tile);
      case 'fortify':
        return left >= res * 1.2;
      case 'steal':
        return left >= res * (this.completes(g, p, q.tile) ? 0.2 : 0.6);
    }
  }

  async steps(g: Game, p: Player, options: number[]): Promise<number> {
    return this.best(g, p, options);
  }

  async chooseTile(g: Game, p: Player, _purpose: TilePurpose, options: number[]): Promise<number> {
    return options.reduce((a, b) => (this.landScore(g, p, b) > this.landScore(g, p, a) ? b : a), options[0]);
  }

  async shop(g: Game, p: Player, offers: CardId[], free: boolean, upgrades: UpgradeOffer[]): Promise<ShopPick> {
    let best: ShopPick = null;
    let bv = 0;
    const deckSize = g.allCards(p).length;
    offers.forEach((c, i) => {
      // デッキが大きいほど新しいカードの価値は下がる
      const v = CARD_VALUE[c] + (p.personality === 'gambler' && CARDS[c].rarity !== 'common' ? 1 : 0) - Math.max(0, deckSize - 12) * 0.4;
      if (!free && p.cash - g.cardPrice(c, p) < this.reserve(g, p) * 1.3) return;
      if (v > bv) {
        bv = v;
        best = { kind: 'buy', index: i };
      }
    });
    for (const u of upgrades) {
      const copies = g.allCards(p).filter((r) => r === u.card).length;
      const v = CARD_VALUE[u.card] * 0.7 + Math.min(copies, 3) * 1.2 + (p.personality === 'careful' ? 0.6 : 0);
      if (u.cost && p.cash - u.cost < this.reserve(g, p) * 1.3) continue;
      if (v > bv) {
        bv = v;
        best = { kind: 'upgrade', card: u.card };
      }
    }
    return free || bv >= 6 ? best : null;
  }

  async dungeon(g: Game, p: Player): Promise<'pay' | 'roll'> {
    return p.cash > this.reserve(g, p) * 0.5 + 60 ? 'pay' : 'roll';
  }

  async tavern(g: Game, p: Player): Promise<number> {
    if (p.personality === 'gambler' && p.cash > 500) return 150;
    if (p.personality !== 'careful' && p.cash > 350 && g.rng.chance(0.5)) return 50;
    return 0;
  }
}
