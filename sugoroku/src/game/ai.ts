// CPU の判断。性格（慎重・強欲・博打）とステージの強さで振る舞いが変わる。
import { CARDS, TILES } from '../data/defs.ts';
import { N_TILES, UNIFY_SETS, type Controller, type Game, type Question, type TilePurpose } from './engine.ts';
import type { CardId, Player } from './types.ts';

const DIST2 = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map((n) => n / 36); // 2d6 の確率

export class AIController implements Controller {
  skill: number;
  constructor(skill: number) {
    this.skill = skill;
  }

  private reserve(g: Game, p: Player) {
    const base = { careful: 320, greedy: 120, gambler: 220 }[p.personality];
    const late = g.s.round / g.s.cfg.rounds;
    return base * g.stage.tollMul * (1 - late * 0.5);
  }
  /** たまに判断を間違える（弱いCPUほど） */
  private blunder(g: Game) {
    return g.rng.chance((1 - this.skill) * 0.18);
  }

  /** 相手の誰かが、この土地を取ればその色を独占できるか */
  private blocks(g: Game, p: Player, i: number) {
    const grp = TILES[i].group;
    if (grp === undefined) return false;
    const others = g.groupTiles(grp).filter((k) => k !== i).map((k) => g.s.tiles[k].owner);
    return others[0] !== null && others[0] !== p.id && others.every((o) => o === others[0]);
  }
  private completes(g: Game, p: Player, i: number) {
    const grp = TILES[i].group;
    if (grp === undefined) return false;
    return g.groupTiles(grp).every((k) => k === i || g.s.tiles[k].owner === p.id);
  }
  /** 三国統一に王手をかけている相手 */
  private threat(g: Game, p: Player) {
    return g.alive.find((o) => o !== p && g.monopolies(o.id).length >= UNIFY_SETS - 1);
  }

  /** マス i に止まったときの嬉しさ */
  landScore(g: Game, p: Player, i: number): number {
    const def = TILES[i];
    const t = g.s.tiles[i];
    switch (def.kind) {
      case 'prop': {
        if (t.owner === null) {
          if (p.cash < g.buyCost(i, p)) return 0;
          return 40 + (this.completes(g, p, i) ? 140 : 0) + (this.blocks(g, p, i) ? 60 : 0) + g.price(i) * 0.1;
        }
        if (t.owner === p.id) return g.canBuild(i) && p.cash >= g.buildCost(i, p) ? 30 + t.level * 15 : 5;
        const toll = g.toll(i, p);
        return -toll * (1 + toll / Math.max(p.cash, 50));
      }
      case 'shrine': return 30;
      case 'cathedral': return 70;
      case 'event': return 15;
      case 'tax': return -Math.max(50, p.cash * 0.1);
      case 'dungeon': return g.s.round > g.s.cfg.rounds * 0.6 ? 10 : -60;
      case 'jackpot': return g.s.jackpot * 0.8;
      case 'start': return 50;
      case 'portal': return 60;
      case 'tavern': return 10;
    }
  }
  private expected(g: Game, p: Player, bonus: number, three = false) {
    let sum = 0;
    if (three) {
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) sum += this.landScore(g, p, (p.pos + a + b + c + bonus) % N_TILES) / 216;
      return sum;
    }
    for (let t = 2; t <= 12; t++) sum += DIST2[t] * this.landScore(g, p, (p.pos + t + bonus) % N_TILES);
    return sum;
  }

  async waitRoll() {}

  async pickCard(g: Game, p: Player): Promise<{ card: CardId; target?: number } | null> {
    if (this.blunder(g) && g.rng.chance(0.5)) return null;
    const usable = [...new Set(p.hand)].filter((c) => g.cardUsable(p, c));
    if (!usable.length) return null;
    const full = p.hand.length >= g.handLimit(p);
    const base = this.expected(g, p, 0);
    const opts: { card: CardId; target?: number; v: number }[] = [];
    for (const c of usable) {
      switch (c) {
        case 'purse':
          opts.push({ card: c, v: p.cash < 300 ? 80 : full ? 30 : 0 });
          break;
        case 'boots':
          opts.push({ card: c, v: this.expected(g, p, 3) - base });
          break;
        case 'twin':
          opts.push({ card: c, v: this.expected(g, p, 0, true) - base });
          break;
        case 'precise': {
          let best = -Infinity;
          let bt = 7;
          for (let t = 2; t <= 12; t++) {
            const v = this.landScore(g, p, (p.pos + t) % N_TILES);
            if (v > best) { best = v; bt = t; }
          }
          opts.push({ card: c, target: bt, v: best - base - 40 });
          break;
        }
        case 'teleport': {
          const ts = g.cardTargets(p, c);
          const bt = ts.reduce((a, b) => (this.landScore(g, p, b) > this.landScore(g, p, a) ? b : a), ts[0]);
          opts.push({ card: c, target: bt, v: this.landScore(g, p, bt) - base - 60 });
          break;
        }
        case 'thieves': {
          const rich = Math.max(...g.alive.filter((o) => o !== p).map((o) => o.cash));
          opts.push({ card: c, v: Math.min(400, rich * 0.15) - 60 });
          break;
        }
        case 'festival': {
          const ts = g.cardTargets(p, c);
          const bt = ts.reduce((a, b) => (g.toll(b) > g.toll(a) ? b : a), ts[0]);
          opts.push({ card: c, target: bt, v: g.toll(bt) - 80 });
          break;
        }
        case 'goldrain': {
          const sum = g.s.tiles.reduce((a, t, i) => a + (t.owner === p.id ? g.toll(i) : 0), 0);
          opts.push({ card: c, v: sum * 0.4 - 100 });
          break;
        }
        case 'quake':
        case 'dragon':
        case 'edict': {
          const ts = g.cardTargets(p, c);
          const th = this.threat(g, p);
          const score = (i: number) => {
            let v = g.toll(i) * (c === 'dragon' ? 1.5 : 1);
            if (c === 'edict') v = (this.completes(g, p, i) ? 400 : 0) + g.value(i) * 0.4;
            if (th && g.s.tiles[i].owner === th.id) v += 250;
            return v;
          };
          const bt = ts.reduce((a, b) => (score(b) > score(a) ? b : a), ts[0]);
          const threshold = c === 'quake' ? 90 : c === 'dragon' ? 200 : 220;
          opts.push({ card: c, target: bt, v: score(bt) - threshold });
          break;
        }
        default:
          break;
      }
    }
    const gamble = p.personality === 'gambler' ? -15 : 0;
    const best = opts.sort((a, b) => b.v - a.v)[0];
    if (!best || best.v <= 20 + gamble - (full ? 25 : 0)) return null;
    return { card: best.card, target: best.target };
  }

  async confirm(g: Game, p: Player, q: Question): Promise<boolean> {
    const res = this.reserve(g, p);
    const flip = this.blunder(g);
    let yes = false;
    switch (q.kind) {
      case 'buy': {
        const important = this.completes(g, p, q.tile) || this.blocks(g, p, q.tile);
        yes = p.cash - q.cost >= res * (important ? 0.2 : 0.6);
        if (p.personality === 'greedy') yes = p.cash - q.cost >= 40;
        break;
      }
      case 'build': {
        const mono = g.ownsGroup(p.id, TILES[q.tile].group!);
        yes = p.cash - q.cost >= res * (mono ? 0.25 : 0.6);
        break;
      }
      case 'takeover': {
        const t = g.s.tiles[q.tile];
        const th = this.threat(g, p);
        const blockUnify = th && t.owner === th.id && g.ownsGroup(th.id, TILES[q.tile].group!);
        const completes = this.completes(g, p, q.tile);
        const left = p.cash - q.cost;
        if (blockUnify) yes = left >= 0;
        else if (completes) yes = left >= res * 0.1;
        else if (p.personality === 'gambler') yes = left >= res * 1.2 && g.toll(q.tile) > 50;
        else yes = left >= res * 2 && g.ownsGroup(t.owner!, TILES[q.tile].group!);
        return yes; // 買収は迷わない
      }
      case 'shield':
        return q.toll >= Math.max(90, p.cash * 0.15) || q.toll > p.cash;
    }
    return flip ? !yes : yes;
  }

  async chooseTile(g: Game, p: Player, purpose: TilePurpose, options: number[]): Promise<number> {
    if (purpose === 'portal' || purpose === 'teleport') {
      return options.reduce((a, b) => (this.landScore(g, p, b) > this.landScore(g, p, a) ? b : a), options[0]);
    }
    if (purpose === 'royal-build') {
      const score = (i: number) => g.toll(i) * (g.ownsGroup(p.id, TILES[i].group!) ? 2 : 1) - g.buildCost(i, p) * 0.3;
      const best = options.reduce((a, b) => (score(b) > score(a) ? b : a), options[0]);
      return p.cash - g.buildCost(best, p) >= this.reserve(g, p) * 0.6 ? best : -1;
    }
    if (purpose === 'festival') return options.reduce((a, b) => (g.toll(b) > g.toll(a) ? b : a), options[0]);
    return options.reduce((a, b) => (g.toll(b) > g.toll(a) ? b : a), options[0]);
  }

  async dungeon(g: Game, p: Player): Promise<'pay' | 'roll'> {
    const late = g.s.round > g.s.cfg.rounds * 0.65;
    const dangerous = g.s.tiles.filter((t) => t.owner !== null && t.owner !== p.id && t.level >= 2).length >= 5;
    if (late && dangerous) return 'roll';
    return p.cash > this.reserve(g, p) * 0.5 + 60 ? 'pay' : 'roll';
  }

  async tavern(g: Game, p: Player): Promise<number> {
    if (p.personality === 'gambler' && p.cash > 700) return 150;
    if (p.personality !== 'careful' && p.cash > 500 && g.rng.chance(0.5)) return 50;
    return 0;
  }

  async discard(_g: Game, p: Player, incoming: CardId): Promise<number> {
    const rank = { common: 0, rare: 1, epic: 2 };
    const all = [...p.hand, incoming];
    let worst = 0;
    all.forEach((c, i) => {
      if (rank[CARDS[c].rarity] < rank[CARDS[all[worst]].rarity]) worst = i;
    });
    return worst; // p.hand.length なら新しいカードを捨てる
  }
}

