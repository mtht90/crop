// ゲームのルール本体（v2：カードで動く陣取りすごろく）。
// 描画（View）と判断（Controller）は外から差し込むので、画面なしのシミュレーションでも同じコードで動く。
import { CARDS, ECON, GROUPS, HEROES, MAX_LEVEL, RARITY_WEIGHT, STAGES, TILES, baseId, card, isUp, upRef } from '../data/defs.ts';
import { Rng } from './rng.ts';
import type { CardId, CardRef, GameConfig, GameState, Player, StageDef } from './types.ts';

export const N_TILES = TILES.length;
export const FINAL_ROUNDS = 3;
export const TERRITORIES = TILES.map((t, i) => (t.kind === 'prop' ? i : -1)).filter((i) => i >= 0);

export type Question =
  | { kind: 'claim'; tile: number; cost: number }
  | { kind: 'fortify'; tile: number; cost: number; level: number }
  | { kind: 'steal'; tile: number; cost: number };

export type TilePurpose = 'portal' | 'card';

export type BannerKind =
  | 'claim' | 'steal' | 'lost' | 'set' | 'conquest-warn' | 'conquest' | 'jackpot' | 'final' | 'fort'
  | 'event-good' | 'event-bad' | 'event' | 'dungeon' | 'trap' | 'round' | 'win';

/** カード屋での選択：買う（もらう）か、デッキのカードを強化するか */
export type ShopPick = { kind: 'buy'; index: number } | { kind: 'upgrade'; card: CardId } | null;
export interface UpgradeOffer {
  card: CardId;
  cost: number; // 0 = 無料
}

/** あなたや CPU が手番で取る行動 */
export type Action = { type: 'play'; index: number; target?: number } | { type: 'end' };

export interface View {
  turnStart(p: Player): Promise<void>;
  draw(p: Player, cards: CardRef[]): Promise<void>;
  /** ターン終了：使わなかった手札を捨て札へ */
  discardHand(p: Player, cards: CardRef[]): Promise<void>;
  dice(p: Player, values: number[]): Promise<void>;
  move(p: Player, path: number[]): Promise<void>;
  warp(p: Player, to: number): Promise<void>;
  cash(from: Player | null, to: Player | null, amount: number, reason: string): Promise<void>;
  tile(tile: number, reason: string, by?: Player): Promise<void>;
  banner(kind: BannerKind, text: string, sub?: string, p?: Player): Promise<void>;
  cardUsed(p: Player, card: CardRef, target?: number): Promise<void>;
  cardGained(p: Player, card: CardRef, upgraded?: boolean): Promise<void>;
  log(msg: string): void;
  sync(): void;
}

export interface Controller {
  /** 手番中に1つずつ行動を決める。'end' でターン終了 */
  turn(g: Game, p: Player): Promise<Action>;
  confirm(g: Game, p: Player, q: Question): Promise<boolean>;
  /** 歩数を選ぶ（狙い撃ち・疾風・引き返す・狩人の±1） */
  steps(g: Game, p: Player, options: number[], reason: string): Promise<number>;
  chooseTile(g: Game, p: Player, purpose: TilePurpose, options: number[]): Promise<number>;
  /** カード屋。新しいカードを買う（もらう）か、デッキのカードを強化する。null なら見送り */
  shop(g: Game, p: Player, offers: CardId[], free: boolean, upgrades: UpgradeOffer[]): Promise<ShopPick>;
  dungeon(g: Game, p: Player): Promise<'pay' | 'roll'>;
  tavern(g: Game, p: Player): Promise<number>;
}

const r5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

export class Game {
  s: GameState;
  rng: Rng;
  view: View;
  ctrl: Controller[];
  stage: StageDef;
  private conquestWarned = new Set<number>();

  constructor(cfg: GameConfig, view: View, ctrl: Controller[]) {
    this.rng = new Rng(cfg.seed);
    this.view = view;
    this.ctrl = ctrl;
    this.stage = STAGES[cfg.stage];
    const personalities = ['careful', 'greedy', 'gambler'] as const;
    this.s = {
      cfg,
      players: cfg.heroes.map((hero, i) => ({
        id: i,
        name: cfg.names[i],
        hero,
        color: '',
        human: i === cfg.humanIndex,
        personality: personalities[(i + cfg.seed) % 3],
        cash: this.stage.startCash,
        pos: 0,
        deck: this.shuffle([...HEROES[hero].deck]),
        hand: [],
        discard: [],
        exhausted: [],
        energy: 0,
        moved: false,
        jail: 0,
        bankrupt: false,
        stats: { claims: 0, takeovers: 0, lost: 0, maxTerritories: 0, jackpots: 0, maxJackpot: 0, forts: 0, cardsUsed: 0, cardsBought: 0, upgrades: 0, tollsEarned: 0, maxToll: 0, lowestRankSeen: 0 },
      })),
      tiles: TILES.map(() => ({ owner: null, level: 0, guard: 0, trap: null, trapMul: 1 })),
      round: 1,
      turn: 0,
      jackpot: this.jackpotBase(),
      over: false,
      winner: null,
      winReason: null,
    };
  }

  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- 計算 ----------
  jackpotBase() {
    return r5(100 * this.stage.jackpotMul);
  }
  get alive() {
    return this.s.players.filter((p) => !p.bankrupt);
  }
  isFinal() {
    return this.s.round > this.s.cfg.rounds - FINAL_ROUNDS;
  }
  handLimit(p: Player) {
    return p.hero === 'mage' ? ECON.hand + 1 : ECON.hand;
  }
  price(i: number) {
    return r5((TILES[i].price ?? 0) * this.stage.tollMul);
  }
  claimCost(i: number, p: Player) {
    return r5(this.price(i) * (p.hero === 'merchant' ? 0.9 : 1));
  }
  fortCost(i: number) {
    return r5(this.price(i) * ECON.fort);
  }
  stealCost(i: number, p: Player) {
    const t = this.s.tiles[i];
    let c = this.price(i) * (ECON.steal + ECON.stealPerLevel * t.level);
    if (t.owner !== null && this.s.players[t.owner].hero === 'knight') c *= 1.3;
    if (this.isFinal()) c *= p.hero === 'barbarian' ? 0.6 : 0.7; // 最終決戦は奪いやすい（略奪王はさらに）
    return r5(c);
  }
  toll(i: number, payer?: Player) {
    const t = this.s.tiles[i];
    if (t.owner === null) return 0;
    let v = this.price(i) * ECON.toll * (1 + t.level);
    if (this.ownsGroup(t.owner, TILES[i].group!)) v *= 1.5;
    if (payer?.hero === 'knight') v *= 0.5;
    return r5(v);
  }
  income(p: Player) {
    let v = 0;
    for (const i of TERRITORIES) {
      const t = this.s.tiles[i];
      if (t.owner !== p.id) continue;
      v += this.price(i) * ECON.income * (1 + t.level) * (this.ownsGroup(p.id, TILES[i].group!) ? ECON.setIncome : 1);
    }
    return r5(v);
  }
  cardPrice(c: CardId, p: Player) {
    return r5(CARDS[c].price * (p.hero === 'merchant' ? 0.9 : 1));
  }
  upgradeCost(c: CardId, _p: Player) {
    return Math.max(40, r5(CARDS[c].price * 0.6));
  }
  /** デッキ全体（山札・手札・捨て札） */
  allCards(p: Player): CardRef[] {
    return [...p.deck, ...p.hand, ...p.discard];
  }
  /** 強化できるカードの種類（まだ + でない1枚がある） */
  upgradable(p: Player): CardId[] {
    const ids = new Set<CardId>();
    for (const r of this.allCards(p)) if (!isUp(r)) ids.add(baseId(r));
    return [...ids];
  }
  groupTiles(g: number) {
    return TERRITORIES.filter((i) => TILES[i].group === g);
  }
  ownsGroup(pid: number, g: number) {
    return this.groupTiles(g).every((i) => this.s.tiles[i].owner === pid);
  }
  sets(pid: number) {
    return GROUPS.map((_, g) => g).filter((g) => this.ownsGroup(pid, g));
  }
  territories(p: Player) {
    return TERRITORIES.filter((i) => this.s.tiles[i].owner === p.id);
  }
  /** 順位の基準：陣の数 → 砦の段階の合計 → 所持金 */
  score(p: Player) {
    const mine = this.territories(p);
    const levels = mine.reduce((a, i) => a + this.s.tiles[i].level, 0);
    return mine.length * 1e7 + levels * 1e5 + p.cash;
  }
  ranking(): Player[] {
    return [...this.s.players].sort((a, b) => this.score(b) - this.score(a));
  }
  rankOf(p: Player) {
    return this.ranking().indexOf(p);
  }
  isLast(p: Player) {
    const r = this.ranking();
    return r.length > 1 && r[r.length - 1] === p;
  }
  /** カードを使えるか（⚡、移動は1回、対象があるか） */
  canPlay(p: Player, ref: CardRef): boolean {
    const c = card(ref);
    if (c.cost > p.energy) return false;
    if (c.move && p.moved) return false;
    if (c.target === 'ownTile' || c.target === 'enemyTile' || c.target === 'emptyTile') return this.cardTargets(p, ref).length > 0;
    if (c.id === 'thieves') return this.alive.some((o) => o !== p && o.cash > 0);
    if (c.id === 'scheme') return p.deck.length + p.discard.length > 0;
    return true;
  }
  /** 旗手の値段（強化で2割引） */
  bannerCost(i: number, p: Player, up: boolean) {
    return r5(this.claimCost(i, p) * (up ? 0.8 : 1));
  }
  /** 進軍・勅命の値段 */
  cardStealCost(i: number, p: Player, ref: CardRef) {
    const c = card(ref);
    if (c.id === 'march') return r5(this.stealCost(i, p) / 2);
    return r5(this.stealCost(i, p) * (c.up ? 0.8 : 1));
  }
  cardTargets(p: Player, ref: CardRef): number[] {
    const tiles = this.s.tiles;
    const up = isUp(ref);
    const card = baseId(ref);
    const near = (i: number, d: number) => {
      const k = Math.abs(i - p.pos);
      return Math.min(k, N_TILES - k) <= d;
    };
    switch (card) {
      case 'fortify':
        return TERRITORIES.filter((i) => tiles[i].owner === p.id && tiles[i].level < MAX_LEVEL && p.cash >= this.fortCost(i));
      case 'guard':
        return TERRITORIES.filter((i) => tiles[i].owner === p.id && tiles[i].guard === 0);
      case 'banner':
        return TERRITORIES.filter((i) => tiles[i].owner === null && near(i, up ? 5 : 3) && p.cash >= this.bannerCost(i, p, up));
      case 'march':
        return TERRITORIES.filter((i) => tiles[i].owner !== null && tiles[i].owner !== p.id && tiles[i].guard === 0 && near(i, up ? 2 : 1) && p.cash >= this.cardStealCost(i, p, ref));
      case 'edict':
        return TERRITORIES.filter((i) => tiles[i].owner !== null && tiles[i].owner !== p.id && tiles[i].guard === 0 && p.cash >= this.cardStealCost(i, p, ref));
      case 'quake':
      case 'dragon':
        return TERRITORIES.filter((i) => tiles[i].owner !== null && tiles[i].owner !== p.id && (card === 'dragon' || tiles[i].guard === 0));
      case 'trap':
        return TILES.map((_, i) => i).filter((i) => tiles[i].trap === null && i !== p.pos);
      case 'teleport':
        return TILES.map((_, i) => i).filter((i) => i !== p.pos && TILES[i].kind !== 'jackpot');
      default:
        return [];
    }
  }

  // ---------- 実行 ----------
  async run(): Promise<void> {
    this.view.sync();
    while (!this.s.over) {
      const p = this.s.players[this.s.turn];
      if (!p.bankrupt) await this.takeTurn(p);
      if (this.s.over) break;
      await this.advanceTurn();
    }
    this.view.sync();
  }

  private async advanceTurn() {
    let next = this.s.turn;
    do {
      next = (next + 1) % this.s.players.length;
      if (next === 0) await this.endRound();
      if (this.s.over) return;
    } while (this.s.players[next].bankrupt);
    this.s.turn = next;
  }

  private async endRound() {
    for (const t of this.s.tiles) if (t.guard > 0) t.guard--;
    this.s.jackpot += r5(15 * this.stage.jackpotMul);
    if (this.s.round >= this.s.cfg.rounds / 3) for (const p of this.alive) p.stats.lowestRankSeen = Math.max(p.stats.lowestRankSeen, this.rankOf(p));
    if (this.s.round >= this.s.cfg.rounds) {
      await this.finish(this.ranking()[0], 'rounds');
      return;
    }
    this.s.round++;
    this.view.sync();
    if (this.s.round === this.s.cfg.rounds - FINAL_ROUNDS + 1) await this.view.banner('final', '最終決戦', `残り${FINAL_ROUNDS}ラウンド！ 陣を奪う値段が3割引`);
    else await this.view.banner('round', `ラウンド ${this.s.round}`, `/ ${this.s.cfg.rounds}`);
  }

  private async finish(w: Player, reason: 'rounds' | 'conquest' | 'bankrupt') {
    if (this.s.over) return;
    this.s.over = true;
    this.s.winner = w.id;
    this.s.winReason = reason;
    this.view.sync();
    await this.view.banner('win', `${w.name} の勝利！`, reason === 'conquest' ? '全ての陣を制圧' : `陣 ${this.territories(w).length} 個で天下統一`);
  }

  /** 山札から n 枚引く（尽きたら捨て札を混ぜ直す） */
  async drawCards(p: Player, n: number) {
    const got: CardRef[] = [];
    for (let k = 0; k < n; k++) {
      if (!p.deck.length) {
        if (!p.discard.length) break;
        p.deck = this.shuffle(p.discard);
        p.discard = [];
      }
      const c = p.deck.pop()!;
      p.hand.push(c);
      got.push(c);
    }
    if (got.length) await this.view.draw(p, got);
    this.view.sync();
  }

  private async takeTurn(p: Player) {
    p.moved = false;
    p.energy = ECON.energy + (p.hero === 'mage' ? 1 : 0);
    await this.view.turnStart(p);
    // 税収
    const inc = this.income(p);
    if (inc > 0) await this.transfer(null, p, inc, '税収');
    // 毎ターン、新しい手札を引く
    await this.drawCards(p, this.handLimit(p));
    if (p.jail > 0) {
      const freed = await this.handleJail(p);
      if (!freed) {
        p.moved = true; // 地下牢では移動できない（他のカードは使える）
      }
    }
    // 行動
    for (let guard = 0; guard < 40 && !this.s.over; guard++) {
      const act = await this.ctrl[p.id].turn(this, p);
      if (act.type === 'end') break;
      const ref = p.hand[act.index];
      if (!ref || !this.canPlay(p, ref)) continue;
      const def = card(ref);
      if (act.target === undefined && (def.target === 'ownTile' || def.target === 'enemyTile' || def.target === 'emptyTile' || def.target === 'anyTile')) continue;
      if (act.target !== undefined && def.target !== 'none' && def.target !== 'steps' && !this.cardTargets(p, ref).includes(act.target)) continue;
      p.hand.splice(act.index, 1);
      if (def.exhaust) p.exhausted.push(ref);
      else p.discard.push(ref);
      p.energy -= def.cost;
      p.stats.cardsUsed++;
      await this.view.cardUsed(p, ref, act.target);
      await this.applyCard(p, ref, act.target);
      this.view.sync();
    }
    // 使わなかった手札は捨て札へ
    if (p.hand.length && !this.s.over) {
      const left = p.hand;
      p.hand = [];
      p.discard.push(...left);
      await this.view.discardHand(p, left);
      this.view.sync();
    }
  }

  private async handleJail(p: Player): Promise<boolean> {
    const fee = r5(50 * this.stage.tollMul);
    const choice = p.cash >= fee ? await this.ctrl[p.id].dungeon(this, p) : 'roll';
    if (choice === 'pay') {
      await this.pay(p, null, fee, '保釈金', true);
      p.jail = 0;
      return true;
    }
    const d = [this.rng.int(1, 6), this.rng.int(1, 6)];
    await this.view.dice(p, d);
    if (d[0] === d[1]) {
      p.jail = 0;
      await this.view.banner('event-good', '脱獄成功！', 'ゾロ目で地下牢を抜け出した', p);
      return true;
    }
    p.jail--;
    this.view.log(`${p.name} は脱出に失敗した`);
    return p.jail === 0;
  }

  async sendToJail(p: Player) {
    const jail = TILES.findIndex((t) => t.kind === 'dungeon');
    p.pos = jail;
    p.jail = 2;
    await this.view.warp(p, jail);
    this.view.sync();
  }

  // ---------- カードの効果 ----------
  private async applyCard(p: Player, ref: CardRef, target?: number) {
    const def = card(ref);
    const up = def.up;
    const id = def.id;
    if (def.move) p.moved = true;
    switch (id) {
      case 'walk':
        return this.go(p, up ? 2 : 1);
      case 'dice':
      case 'twin': {
        const d = Array.from({ length: id === 'twin' ? 2 : 1 }, () => this.rng.int(1, 6));
        await this.view.dice(p, d);
        let steps = d.reduce((a, b) => a + b, 0) + (id === 'dice' && up ? 1 : 0);
        if (p.hero === 'ranger') steps = await this.ctrl[p.id].steps(this, p, [steps - 1, steps, steps + 1].filter((x) => x > 0), 'ranger');
        if (id === 'twin' && d[0] === d[1]) {
          await this.view.banner('event-good', 'ゾロ目！', 'カードを1枚引く', p);
          await this.drawCards(p, 1);
        }
        return this.go(p, steps);
      }
      case 'aim':
      case 'gale':
      case 'retreat':
        return this.go(p, await this.ctrl[p.id].steps(this, p, def.steps!, id));
      case 'teleport':
        if (target === undefined) return;
        return this.go(p, (target - p.pos + N_TILES) % N_TILES, true);
      case 'banner':
        if (target !== undefined) await this.claim(p, target, this.bannerCost(target, p, up));
        return;
      case 'march':
      case 'edict':
        if (target !== undefined) await this.steal(p, target, this.cardStealCost(target, p, ref));
        return;
      case 'fortify':
        if (target !== undefined) {
          await this.fortify(p, target);
          if (up) await this.fortify(p, target);
        }
        return;
      case 'guard':
        if (target !== undefined) {
          this.s.tiles[target].guard = up ? 5 : 3;
          await this.view.tile(target, 'guard', p);
        }
        return;
      case 'purse':
        return this.transfer(null, p, r5((up ? 140 : 80) * this.stage.tollMul), '金貨の袋');
      case 'levy':
        return this.transfer(null, p, r5(this.income(p) * (up ? 1.5 : 1)), '徴税');
      case 'scheme':
        return this.drawCards(p, up ? 3 : 2);
      case 'thieves': {
        const victim = this.alive.filter((o) => o !== p).sort((a, b) => b.cash - a.cash)[0];
        if (victim) await this.transfer(victim, p, Math.min(r5((up ? 450 : 300) * this.stage.tollMul), r5(victim.cash * (up ? 0.3 : 0.2))), '盗賊団');
        return;
      }
      case 'trap':
        if (target !== undefined) {
          this.s.tiles[target].trap = p.id;
          this.s.tiles[target].trapMul = up ? 2 : 1;
          await this.view.tile(target, 'trap', p);
        }
        return;
      case 'quake':
        if (target !== undefined) {
          const t = this.s.tiles[target];
          const owner = this.s.players[t.owner!];
          const hits = up ? 2 : 1;
          if (t.level >= hits) t.level -= hits;
          else {
            t.level = 0;
            t.owner = null;
            owner.stats.lost++;
          }
          await this.view.tile(target, 'quake', p);
        }
        return;
      case 'dragon':
        if (target !== undefined) {
          const t = this.s.tiles[target];
          this.s.players[t.owner!].stats.lost++;
          t.owner = null;
          t.level = 0;
          t.guard = 0;
          await this.view.tile(target, 'dragon', p);
        }
        return;
    }
  }

  // ---------- 移動とマス ----------
  /** steps マス進む（負なら戻る）。止まったマスの効果まで処理する */
  async go(p: Player, steps: number, warp = false) {
    if (steps === 0) return;
    const start = p.pos;
    if (warp) {
      p.pos = (start + steps) % N_TILES;
      await this.view.warp(p, p.pos);
    } else {
      const dir = steps > 0 ? 1 : -1;
      const path: number[] = [];
      let pos = start;
      for (let k = 0; k < Math.abs(steps); k++) {
        pos = (pos + dir + N_TILES) % N_TILES;
        path.push(pos);
      }
      await this.view.move(p, path);
      p.pos = pos;
    }
    if (steps > 0 && start + steps >= N_TILES) await this.passStart(p);
    this.view.sync();
    if (!this.s.over) await this.resolve(p);
  }

  private async passStart(p: Player) {
    let s = this.stage.salary;
    if (p.pos === 0) s += 50;
    if (this.isLast(p)) s *= 1.5;
    await this.transfer(null, p, r5(s), '給料');
    await this.offerShop(p, true);
  }

  /** カード屋。free なら3枚から1枚もらえる */
  async offerShop(p: Player, free: boolean) {
    const pool = this.s.cfg.cardPool.filter((c) => c !== 'walk');
    if (!pool.length) return;
    const rank = this.s.players.length > 1 ? this.rankOf(p) / (this.s.players.length - 1) : 0;
    const w = { common: RARITY_WEIGHT.common * (1 - rank * 0.3), rare: RARITY_WEIGHT.rare * (1 + rank * 0.4), epic: RARITY_WEIGHT.epic * (1 + rank) };
    const offers: CardId[] = [];
    for (let k = 0; k < 3; k++) {
      const left = pool.filter((c) => !offers.includes(c));
      if (!left.length) break;
      offers.push(this.rng.weighted(left.map((c) => ({ item: c, w: w[CARDS[c].rarity] }))));
    }
    const upgrades = this.upgradable(p).map((c) => ({ card: c, cost: free ? 0 : this.upgradeCost(c, p) }));
    const pick = await this.ctrl[p.id].shop(this, p, offers, free, upgrades);
    if (!pick) return;
    if (pick.kind === 'upgrade') {
      const u = upgrades.find((x) => x.card === pick.card);
      if (!u || p.cash < u.cost) return;
      if (u.cost) await this.pay(p, null, u.cost, 'カード強化');
      // 捨て札 → 山札 → 手札の順に、+ でない1枚を強化する
      for (const pile of [p.discard, p.deck, p.hand]) {
        const k = pile.indexOf(u.card);
        if (k >= 0) {
          pile[k] = upRef(u.card);
          break;
        }
      }
      p.stats.upgrades++;
      await this.view.cardGained(p, upRef(u.card), true);
      return;
    }
    if (pick.index < 0 || pick.index >= offers.length) return;
    const c = offers[pick.index];
    if (!free) {
      const cost = this.cardPrice(c, p);
      if (p.cash < cost) return;
      await this.pay(p, null, cost, 'カード購入');
    }
    p.discard.push(c);
    p.stats.cardsBought++;
    await this.view.cardGained(p, c);
  }

  async resolve(p: Player): Promise<void> {
    const i = p.pos;
    const t = this.s.tiles[i];
    // 罠
    if (t.trap !== null && t.trap !== p.id) {
      const owner = this.s.players[t.trap];
      const amount = r5(ECON.trap * (t.trapMul ?? 1) * this.stage.tollMul * (owner.hero === 'assassin' ? 2 : 1));
      t.trap = null;
      t.trapMul = 1;
      await this.view.tile(i, 'trap-sprung', p);
      await this.view.banner('trap', '落とし穴！', `${owner.name} の罠にかかった`, p);
      await this.transfer(p, owner, amount, '落とし穴');
    }
    const def = TILES[i];
    switch (def.kind) {
      case 'prop':
        return this.resolveTerritory(p, i);
      case 'shrine':
        return this.offerShop(p, false);
      case 'event':
        return this.fateEvent(p);
      case 'tax': {
        const tax = Math.max(r5(30 * this.stage.tollMul), r5(p.cash * 0.1));
        await this.view.banner('event-bad', '竜の関所', `通行税 ${tax}G は黄金の泉へ`, p);
        return this.pay(p, null, tax, '通行税', true);
      }
      case 'dungeon':
        await this.view.banner('dungeon', '地下牢に捕まった！', '次のターンは移動できない', p);
        p.jail = 1;
        return;
      case 'jackpot': {
        const amount = this.s.jackpot;
        this.s.jackpot = this.jackpotBase();
        p.stats.jackpots++;
        p.stats.maxJackpot = Math.max(p.stats.maxJackpot, amount);
        await this.view.banner('jackpot', 'JACKPOT!!', `${amount}G を獲得！`, p);
        return this.transfer(null, p, amount, 'ジャックポット');
      }
      case 'portal': {
        const opts = TILES.map((_, k) => k).filter((k) => k !== i && TILES[k].kind !== 'portal' && TILES[k].kind !== 'jackpot');
        const to = await this.ctrl[p.id].chooseTile(this, p, 'portal', opts);
        if (!opts.includes(to)) return;
        return this.go(p, (to - p.pos + N_TILES) % N_TILES, true);
      }
      case 'tavern':
        return this.tavern(p);
      case 'cathedral': {
        const gift = r5((this.isLast(p) ? 150 : 80) * this.stage.tollMul);
        await this.view.banner('event-good', '大聖堂の祝福', `${gift}G とカード1枚`, p);
        await this.transfer(null, p, gift, '祝福');
        return this.drawCards(p, 1);
      }
      case 'start':
        return;
    }
  }

  private async resolveTerritory(p: Player, i: number) {
    const t = this.s.tiles[i];
    if (t.owner === null) {
      const cost = this.claimCost(i, p);
      if (p.cash >= cost && (await this.ctrl[p.id].confirm(this, p, { kind: 'claim', tile: i, cost }))) await this.claim(p, i, cost);
      return;
    }
    if (t.owner === p.id) {
      if (t.level < MAX_LEVEL && p.cash >= this.fortCost(i) && (await this.ctrl[p.id].confirm(this, p, { kind: 'fortify', tile: i, cost: this.fortCost(i), level: t.level + 1 }))) await this.fortify(p, i);
      return;
    }
    const owner = this.s.players[t.owner];
    const toll = this.toll(i, p);
    if (toll > 0) {
      const before = owner.cash;
      await this.pay(p, owner, toll, `${TILES[i].name} の通行税`);
      const paid = owner.cash - before;
      owner.stats.tollsEarned += paid;
      owner.stats.maxToll = Math.max(owner.stats.maxToll, paid);
    }
    if (t.guard === 0) {
      const cost = this.stealCost(i, p);
      if (p.cash >= cost && (await this.ctrl[p.id].confirm(this, p, { kind: 'steal', tile: i, cost }))) await this.steal(p, i, cost);
    }
  }

  async claim(p: Player, i: number, cost: number) {
    const t = this.s.tiles[i];
    if (t.owner !== null || p.cash < cost) return;
    await this.pay(p, null, cost, '旗を立てる');
    t.owner = p.id;
    t.level = 0;
    p.stats.claims++;
    await this.view.tile(i, 'claim', p);
    await this.afterOwnership(p, i);
  }

  async steal(p: Player, i: number, cost: number) {
    const t = this.s.tiles[i];
    if (t.owner === null || t.owner === p.id || t.guard > 0 || p.cash < cost) return;
    const prev = this.s.players[t.owner];
    await this.pay(p, null, cost, '陣を奪う');
    t.owner = p.id;
    t.level = Math.max(0, t.level - 1); // 攻め落とすと砦は1段階崩れる
    t.trap = null;
    p.stats.takeovers++;
    prev.stats.lost++;
    await this.view.banner('steal', '陣を奪った！', `${prev.name} から ${TILES[i].name} を奪取`, p);
    await this.view.tile(i, 'steal', p);
    await this.afterOwnership(p, i);
  }

  async fortify(p: Player, i: number) {
    const t = this.s.tiles[i];
    const cost = this.fortCost(i);
    if (t.owner !== p.id || t.level >= MAX_LEVEL || p.cash < cost) return;
    await this.pay(p, null, cost, '築城');
    t.level++;
    await this.view.tile(i, 'build', p);
    if (t.level === MAX_LEVEL) {
      p.stats.forts++;
      await this.view.banner('fort', '王城 完成！', `${TILES[i].name} の守りは鉄壁`, p);
    }
  }

  private async afterOwnership(p: Player, i: number) {
    const n = this.territories(p).length;
    p.stats.maxTerritories = Math.max(p.stats.maxTerritories, n);
    const g = TILES[i].group!;
    if (this.ownsGroup(p.id, g)) await this.view.banner('set', `${GROUPS[g].name} を統一！`, '税収2倍・通行税1.5倍', p);
    if (n === TERRITORIES.length) {
      await this.view.banner('conquest', '全陣制圧！！', `${p.name} が王国のすべてを手にした`, p);
      await this.finish(p, 'conquest');
    } else if (n >= TERRITORIES.length - 3 && !this.conquestWarned.has(p.id)) {
      this.conquestWarned.add(p.id);
      await this.view.banner('conquest-warn', `全陣制圧まであと${TERRITORIES.length - n}！`, `${p.name} を止めろ！`, p);
    }
  }

  private async tavern(p: Player) {
    const bet = await this.ctrl[p.id].tavern(this, p);
    if (!bet || p.cash < bet) return;
    await this.pay(p, null, bet, '酒場の賭け');
    const d = this.rng.int(1, 6);
    await this.view.dice(p, [d]);
    const mul = d === 6 ? 3 : d >= 4 ? 2 : 0;
    if (mul) {
      await this.view.banner('event-good', mul === 3 ? '大当たり！' : '勝ち！', `${bet * mul}G を受け取った`, p);
      await this.transfer(null, p, bet * mul, '酒場の賭け');
    } else await this.view.banner('event-bad', 'はずれ…', `${bet}G は酒場のものに`, p);
  }

  // ---------- お金 ----------
  /** from から to へ（null は王国）。払えるだけ払う */
  async transfer(from: Player | null, to: Player | null, amount: number, reason: string) {
    amount = r5(amount);
    if (amount <= 0) return;
    if (from) amount = Math.min(amount, from.cash);
    if (amount <= 0) return;
    if (from) from.cash -= amount;
    if (to) to.cash += amount;
    await this.view.cash(from, to, amount, reason);
    this.view.sync();
  }
  async pay(p: Player, to: Player | null, amount: number, reason: string, toJackpot = false) {
    const paid = Math.min(p.cash, r5(amount));
    if (paid <= 0) return;
    p.cash -= paid;
    if (to) to.cash += paid;
    else if (toJackpot) this.s.jackpot += paid;
    await this.view.cash(p, to, paid, reason);
    this.view.sync();
  }

  // ---------- 運命の巻物 ----------
  private async fateEvent(p: Player) {
    const n = this.alive.length;
    const rank = n > 1 ? this.rankOf(p) / (n - 1) : 0.5; // 0 = 首位, 1 = 最下位
    const good = 0.7 + rank * 0.9;
    const bad = 1.2 - rank * 0.9;
    const leader = this.ranking()[0];
    const leaderLand = this.territories(leader).sort((a, b) => this.price(b) - this.price(a));
    const mine = this.territories(p).filter((i) => this.s.tiles[i].level < MAX_LEVEL);
    const events: { item: () => Promise<void>; w: number }[] = [
      { w: 1.2 * good, item: async () => {
        const v = r5((80 + this.s.round * 6) * this.stage.tollMul);
        await this.view.banner('event-good', '王の褒美', `${v}G を賜った`, p);
        await this.transfer(null, p, v, '王の褒美');
      } },
      { w: 1 * good, item: async () => {
        await this.view.banner('event-good', '旅の商人', 'カードを1枚選んでもらえる', p);
        await this.offerShop(p, true);
      } },
      { w: 0.8 * good, item: async () => {
        await this.view.banner('event-good', '援軍', 'カードを2枚引く', p);
        await this.drawCards(p, 2);
      } },
      { w: mine.length ? 0.8 * good : 0, item: async () => {
        const i = this.rng.pick(mine);
        this.s.tiles[i].level++;
        await this.view.banner('event-good', '職人の恩返し', `${TILES[i].name} の砦が無料で強くなった`, p);
        await this.view.tile(i, 'build', p);
      } },
      { w: 0.5 * good, item: async () => {
        await this.view.banner('event-good', '追い風', '黄金の泉へ飛んでいく！', p);
        const jp = TILES.findIndex((t) => t.kind === 'jackpot');
        await this.go(p, (jp - p.pos + N_TILES) % N_TILES, true);
      } },
      { w: 1 * bad, item: async () => {
        await this.view.banner('event-bad', '盗賊に襲われた', '所持金の15%を失う', p);
        await this.pay(p, null, r5(p.cash * 0.15), '盗賊', true);
      } },
      { w: p.hand.length ? 0.8 * bad : 0, item: async () => {
        const k = this.rng.int(0, p.hand.length - 1);
        const c = p.hand.splice(k, 1)[0];
        p.discard.push(c);
        await this.view.banner('event-bad', '手札を落とした', `「${card(c).name}」を捨てた`, p);
      } },
      { w: 0.5 * bad, item: async () => {
        await this.view.banner('dungeon', '衛兵に捕まった', '地下牢へ', p);
        await this.sendToJail(p);
      } },
      { w: leaderLand.length && leader !== p ? 1 : 0, item: async () => {
        const i = leaderLand[0];
        const t = this.s.tiles[i];
        if (t.level > 0) t.level--;
        else {
          t.owner = null;
          leader.stats.lost++;
        }
        await this.view.banner('event', '竜の襲撃！', `首位 ${leader.name} の ${TILES[i].name} が焼かれた`, p);
        await this.view.tile(i, 'raid', p);
      } },
    ];
    await this.rng.weighted(events)();
  }
}
