// ゲームのルール本体。描画（View）と判断（Controller）は外から差し込むので、
// 画面なしのシミュレーションでも同じコードで動く。
import {
  BUILD_MUL, CARDS, FESTIVAL_MUL, GROUPS, MAX_LEVEL, RARITY_WEIGHT, SET_BONUS, STAGES,
  TAKEOVER_MUL, TILES, TOLL_MUL,
} from '../data/defs.ts';
import { Rng } from './rng.ts';
import type { CardId, GameConfig, GameState, Player, StageDef } from './types.ts';

export const N_TILES = TILES.length;
export const FINAL_ROUNDS = 3;
export const UNIFY_SETS = 3;

export type Question =
  | { kind: 'buy'; tile: number; cost: number; build: boolean }
  | { kind: 'build'; tile: number; cost: number; level: number }
  | { kind: 'takeover'; tile: number; cost: number }
  | { kind: 'shield'; tile: number; toll: number };

export type TilePurpose = 'portal' | 'teleport' | 'festival' | 'quake' | 'dragon' | 'edict' | 'royal-build';

export type BannerKind =
  | 'monopoly' | 'unify-warn' | 'unify' | 'jackpot' | 'final' | 'bankrupt' | 'landmark'
  | 'takeover' | 'event-good' | 'event-bad' | 'event' | 'dungeon' | 'doubles' | 'round' | 'win';

export interface View {
  turnStart(p: Player): Promise<void>;
  dice(p: Player, values: number[]): Promise<void>;
  move(p: Player, path: number[]): Promise<void>;
  warp(p: Player, to: number): Promise<void>;
  cash(from: Player | null, to: Player | null, amount: number, reason: string): Promise<void>;
  tile(tile: number, reason: string, by?: Player): Promise<void>;
  banner(kind: BannerKind, text: string, sub?: string, p?: Player): Promise<void>;
  cardGained(p: Player, card: CardId): Promise<void>;
  cardUsed(p: Player, card: CardId, target?: number): Promise<void>;
  log(msg: string): void;
  sync(): void;
}

export interface Controller {
  waitRoll(g: Game, p: Player): Promise<void>;
  pickCard(g: Game, p: Player): Promise<{ card: CardId; target?: number } | null>;
  confirm(g: Game, p: Player, q: Question): Promise<boolean>;
  chooseTile(g: Game, p: Player, purpose: TilePurpose, options: number[]): Promise<number>;
  dungeon(g: Game, p: Player): Promise<'pay' | 'roll'>;
  tavern(g: Game, p: Player): Promise<number>;
  discard(g: Game, p: Player, incoming: CardId): Promise<number>;
}

const r5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

export class Game {
  s: GameState;
  rng: Rng;
  view: View;
  ctrl: Controller[];
  stage: StageDef;
  private doublesInRow = 0;
  private unifyWarned = new Set<number>();
  events: { t: string; p?: number }[] = [];

  constructor(cfg: GameConfig, view: View, ctrl: Controller[]) {
    this.rng = new Rng(cfg.seed);
    this.view = view;
    this.ctrl = ctrl;
    this.stage = STAGES[cfg.stage];
    const personalities = ['careful', 'greedy', 'gambler'] as const;
    const players: Player[] = cfg.heroes.map((hero, i) => ({
      id: i,
      name: cfg.names[i],
      hero,
      color: '',
      human: i === cfg.humanIndex,
      personality: personalities[(i + cfg.seed) % 3],
      cash: this.stage.startCash,
      pos: 0,
      hand: [],
      jail: 0,
      bankrupt: false,
      boots: 0,
      goldRain: 0,
      stats: { tollsPaid: 0, tollsEarned: 0, maxToll: 0, takeovers: 0, jackpots: 0, landmarks: 0, cardsUsed: 0, monopoliesMax: 0, lowestRankSeen: 0, maxJackpot: 0 },
    }));
    this.s = {
      cfg,
      players,
      tiles: TILES.map(() => ({ owner: null, level: 0, festival: 0, dragon: 0 })),
      round: 1,
      turn: 0,
      jackpot: this.jackpotBase(),
      over: false,
      winner: null,
      winReason: null,
    };
    for (const p of players) if (p.hero === 'mage') p.hand.push(this.drawCard(p), this.drawCard(p));
  }

  // ---------- 計算 ----------
  jackpotBase() {
    return r5(200 * this.stage.jackpotMul);
  }
  get alive() {
    return this.s.players.filter((p) => !p.bankrupt);
  }
  isFinal() {
    return this.s.round > this.s.cfg.rounds - FINAL_ROUNDS;
  }
  handLimit(p: Player) {
    return p.hero === 'mage' ? 4 : 3;
  }
  price(i: number) {
    return TILES[i].price ?? 0;
  }
  buildCost(i: number, p?: Player) {
    let c = this.price(i) * BUILD_MUL;
    if (p?.hero === 'merchant') c *= 0.9;
    return r5(c);
  }
  buyCost(i: number, p: Player) {
    return r5(this.price(i) * (p.hero === 'merchant' ? 0.9 : 1));
  }
  /** 土地の価値（価格＋建設費の合計） */
  value(i: number) {
    const t = this.s.tiles[i];
    if (t.owner === null) return 0;
    return this.price(i) + t.level * r5(this.price(i) * BUILD_MUL);
  }
  takeoverCost(i: number, p: Player) {
    return r5(this.value(i) * (p.hero === 'barbarian' ? 1.0 : TAKEOVER_MUL));
  }
  groupTiles(g: number) {
    return TILES.map((t, i) => (t.group === g ? i : -1)).filter((i) => i >= 0);
  }
  ownsGroup(pid: number, g: number) {
    return this.groupTiles(g).every((i) => this.s.tiles[i].owner === pid);
  }
  monopolies(pid: number) {
    return GROUPS.map((_, g) => g).filter((g) => this.ownsGroup(pid, g));
  }
  canBuild(i: number) {
    const t = this.s.tiles[i];
    if (t.owner === null || t.level >= MAX_LEVEL) return false;
    if (t.level === MAX_LEVEL - 1) return this.ownsGroup(t.owner, TILES[i].group!);
    return true;
  }
  /** payer が i に止まったときの通行料（盾などは考えない） */
  toll(i: number, payer?: Player) {
    const t = this.s.tiles[i];
    if (t.owner === null || t.dragon > 0) return 0;
    const owner = this.s.players[t.owner];
    let v = this.price(i) * TOLL_MUL[t.level] * this.stage.tollMul;
    if (this.ownsGroup(t.owner, TILES[i].group!)) v *= SET_BONUS;
    if (t.festival > 0) v *= FESTIVAL_MUL;
    if (owner.goldRain > 0) v *= 1.5;
    if (this.isFinal()) v *= 1.5;
    if (payer?.hero === 'knight') v *= 0.8;
    return r5(v);
  }
  assets(p: Player) {
    if (p.bankrupt) return 0;
    let v = p.cash;
    this.s.tiles.forEach((t, i) => {
      if (t.owner === p.id) v += this.value(i);
    });
    return v;
  }
  ranking(): Player[] {
    return [...this.s.players].sort((a, b) => (a.bankrupt ? 1 : 0) - (b.bankrupt ? 1 : 0) || this.assets(b) - this.assets(a));
  }
  rankOf(p: Player) {
    return this.ranking().indexOf(p);
  }
  isLast(p: Player) {
    const alive = this.ranking().filter((x) => !x.bankrupt);
    return alive.length > 1 && alive[alive.length - 1] === p;
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
    for (const t of this.s.tiles) {
      if (t.festival > 0) t.festival--;
      if (t.dragon > 0) t.dragon--;
    }
    for (const p of this.s.players) if (p.goldRain > 0) p.goldRain--;
    this.s.jackpot += r5(20 * this.stage.jackpotMul);
    if (this.s.round >= this.s.cfg.rounds / 3) for (const p of this.alive) p.stats.lowestRankSeen = Math.max(p.stats.lowestRankSeen, this.rankOf(p));
    if (this.s.round >= this.s.cfg.rounds) {
      const w = this.ranking()[0];
      await this.finish(w, 'rounds');
      return;
    }
    this.s.round++;
    this.view.sync();
    if (this.s.round === this.s.cfg.rounds - FINAL_ROUNDS + 1) {
      await this.view.banner('final', '最終局面', `残り${FINAL_ROUNDS}ラウンド！ 通行料が1.5倍`);
    } else {
      await this.view.banner('round', `ラウンド ${this.s.round}`, `/ ${this.s.cfg.rounds}`);
    }
  }

  private async finish(w: Player, reason: 'rounds' | 'unify' | 'bankrupt') {
    if (this.s.over) return;
    this.s.over = true;
    this.s.winner = w.id;
    this.s.winReason = reason;
    this.view.sync();
    await this.view.banner('win', `${w.name} の勝利！`, reason === 'unify' ? '三国統一' : reason === 'bankrupt' ? '最後の生き残り' : '総資産1位');
  }

  private async takeTurn(p: Player) {
    this.doublesInRow = 0;
    p.boots = 0;
    await this.view.turnStart(p);
    this.view.sync();

    if (p.jail > 0) {
      const freed = await this.handleJail(p);
      if (!freed || this.s.over) return;
    }

    // カード
    const pick = await this.ctrl[p.id].pickCard(this, p);
    let forcedTotal: number | null = null;
    let diceCount = 2;
    if (pick) {
      const res = await this.useCard(p, pick.card, pick.target);
      if (this.s.over || p.bankrupt) return;
      if (res === 'turn-done') return;
      if (res === 'twin') diceCount = 3;
      if (typeof res === 'number') forcedTotal = res;
    }

    for (;;) {
      await this.ctrl[p.id].waitRoll(this, p);
      const dice = this.rollDice(p, diceCount, forcedTotal);
      forcedTotal = null;
      diceCount = 2;
      await this.view.dice(p, dice);
      const doubles = dice.length === 2 && dice[0] === dice[1];
      if (doubles) {
        this.doublesInRow++;
        if (this.doublesInRow >= 3) {
          await this.view.banner('dungeon', '3連続ゾロ目！', '地下牢へ連行', p);
          await this.sendToJail(p);
          return;
        }
      }
      const steps = dice.reduce((a, b) => a + b, 0) + p.boots;
      p.boots = 0;
      await this.moveSteps(p, steps);
      if (this.s.over || p.bankrupt) return;
      await this.resolve(p);
      if (this.s.over || p.bankrupt || p.jail > 0) return;
      if (!doubles) return;
      await this.view.banner('doubles', 'ゾロ目！', 'もう一度振れる', p);
    }
  }

  rollDice(p: Player, n: number, forcedTotal: number | null): number[] {
    if (forcedTotal !== null) {
      const a = this.rng.int(Math.max(1, forcedTotal - 6), Math.min(6, forcedTotal - 1));
      return [a, forcedTotal - a];
    }
    const d = Array.from({ length: n }, () => this.rng.int(1, 6));
    if (n === 2 && p.hero === 'ranger' && d[0] !== d[1] && this.rng.chance(0.2)) d[1] = d[0];
    return d;
  }

  private async handleJail(p: Player): Promise<boolean> {
    const fee = r5(50 * this.stage.tollMul);
    const choice = p.cash >= fee ? await this.ctrl[p.id].dungeon(this, p) : 'roll';
    if (choice === 'pay') {
      await this.pay(p, null, fee, '保釈金', true);
      p.jail = 0;
      return !p.bankrupt;
    }
    await this.ctrl[p.id].waitRoll(this, p);
    const d = this.rollDice(p, 2, null);
    await this.view.dice(p, d);
    if (d[0] === d[1]) {
      p.jail = 0;
      await this.view.banner('event-good', '脱獄成功！', 'ゾロ目で地下牢を抜け出した', p);
      await this.moveSteps(p, d[0] + d[1]);
      if (!this.s.over && !p.bankrupt) await this.resolve(p);
      return false;
    }
    p.jail--;
    this.view.log(`${p.name} は脱出に失敗した`);
    this.view.sync();
    return false;
  }

  async sendToJail(p: Player) {
    p.pos = 10;
    p.jail = 2;
    await this.view.warp(p, 10);
    this.view.sync();
  }

  /** steps マス進む。通過ボーナスや追い越しも処理する */
  async moveSteps(p: Player, steps: number) {
    const path: number[] = [];
    let pos = p.pos;
    const dir = steps >= 0 ? 1 : -1;
    for (let k = 0; k < Math.abs(steps); k++) {
      pos = (pos + dir + N_TILES) % N_TILES;
      path.push(pos);
    }
    if (!path.length) return;
    await this.view.move(p, path);
    const start = p.pos;
    p.pos = pos;
    if (dir > 0) {
      // 追い越し（暗殺者）
      if (p.hero === 'assassin') {
        for (const o of this.alive) {
          if (o === p) continue;
          const d = (o.pos - start + N_TILES) % N_TILES;
          if (d > 0 && d < steps) await this.transfer(o, p, 40, '追い越しの一撃');
        }
      }
      // スタート通過
      const passes = Math.floor((start + steps) / N_TILES);
      for (let k = 0; k < passes; k++) await this.salary(p);
    }
    this.view.sync();
  }

  private async salary(p: Player) {
    let s = this.stage.salary;
    if (p.pos === 0) s += 100;
    if (this.isLast(p)) s *= 1.5; // 逆境の加護
    await this.transfer(null, p, r5(s), '給料');
    // 王都の門を通るたびに、好きな自分の土地を1段階建てられる（-1 で見送り）
    const options = this.s.tiles.map((_, i) => i).filter((i) => this.s.tiles[i].owner === p.id && this.canBuild(i) && p.cash >= this.buildCost(i, p));
    if (options.length) {
      const pick = await this.ctrl[p.id].chooseTile(this, p, 'royal-build', options);
      if (pick >= 0 && options.includes(pick)) {
        await this.pay(p, null, this.buildCost(pick, p), '建設');
        const t = this.s.tiles[pick];
        t.level++;
        await this.view.tile(pick, 'build', p);
        if (t.level === MAX_LEVEL) {
          p.stats.landmarks++;
          await this.view.banner('landmark', '王国の象徴 完成！', `${TILES[pick].name} は誰にも奪えない`, p);
        }
      }
    }
    if (this.isLast(p) && this.s.players.filter((x) => !x.bankrupt).length > 1) {
      this.view.log(`逆境の加護：${p.name} はカードを受け取った`);
      await this.giveCard(p, this.drawCard(p, true));
    }
  }

  // ---------- お金 ----------
  /** from から to へ移す（null は銀行）。足りなければ売却・破産処理 */
  async transfer(from: Player | null, to: Player | null, amount: number, reason: string) {
    amount = r5(amount);
    if (amount <= 0) return;
    if (from) {
      const paid = await this.collect(from, amount, to);
      if (to && paid > 0) to.cash += paid;
      await this.view.cash(from, to, paid, reason);
    } else if (to) {
      to.cash += amount;
      await this.view.cash(null, to, amount, reason);
    }
    this.view.sync();
  }

  /** 支払い。toJackpot なら泉に貯まる */
  async pay(p: Player, to: Player | null, amount: number, reason: string, toJackpot = false) {
    amount = r5(amount);
    if (amount <= 0) return;
    const paid = await this.collect(p, amount, to);
    if (to) to.cash += paid;
    else if (toJackpot) this.s.jackpot += paid;
    await this.view.cash(p, to, paid, reason);
    this.view.sync();
  }

  /** p から amount を集める。払えなければ土地を売り、それでも無理なら破産。実際に払えた額を返す */
  private async collect(p: Player, amount: number, creditor: Player | null): Promise<number> {
    if (p.cash < amount) await this.liquidate(p, amount);
    if (p.cash >= amount) {
      p.cash -= amount;
      return amount;
    }
    const paid = p.cash;
    p.cash = 0;
    await this.bankrupt(p, creditor);
    return paid;
  }

  private async liquidate(p: Player, need: number) {
    const owned = this.s.tiles.map((t, i) => ({ t, i })).filter((x) => x.t.owner === p.id).sort((a, b) => this.value(a.i) - this.value(b.i));
    for (const { t, i } of owned) {
      if (p.cash >= need) break;
      const gain = r5(this.value(i) * 0.6);
      p.cash += gain;
      t.owner = null;
      t.level = 0;
      t.festival = 0;
      t.dragon = 0;
      this.view.log(`${p.name} は ${TILES[i].name} を ${gain}G で手放した`);
      await this.view.tile(i, 'sold', p);
    }
    this.view.sync();
  }

  private async bankrupt(p: Player, creditor: Player | null) {
    p.bankrupt = true;
    p.hand = [];
    for (const [i, t] of this.s.tiles.entries()) {
      if (t.owner === p.id) {
        t.owner = null;
        t.level = 0;
        t.festival = 0;
        t.dragon = 0;
        await this.view.tile(i, 'sold', p);
      }
    }
    await this.view.banner('bankrupt', `${p.name} 破産！`, creditor ? `${creditor.name} に追い詰められた` : '王国から退場', p);
    this.events.push({ t: 'bankrupt', p: creditor?.id });
    const alive = this.alive;
    if (alive.length === 1) await this.finish(alive[0], 'bankrupt');
  }

  // ---------- マスの効果 ----------
  async resolve(p: Player): Promise<void> {
    const i = p.pos;
    const def = TILES[i];
    switch (def.kind) {
      case 'prop':
        return this.resolveProp(p, i);
      case 'shrine':
        await this.giveCard(p, this.drawCard(p));
        if (p.hero === 'mage' && this.rng.chance(0.4)) await this.giveCard(p, this.drawCard(p));
        return;
      case 'event':
        return this.fateEvent(p);
      case 'tax': {
        const tax = Math.max(r5(50 * this.stage.tollMul), r5(p.cash * 0.1));
        await this.view.banner('event-bad', '竜の関所', `通行税 ${tax}G は黄金の泉へ`, p);
        return this.pay(p, null, tax, '通行税', true);
      }
      case 'dungeon':
        await this.view.banner('dungeon', '地下牢に捕まった！', '50G払うかゾロ目で脱出', p);
        p.jail = 2;
        this.view.sync();
        return;
      case 'jackpot': {
        const amount = this.s.jackpot;
        this.s.jackpot = this.jackpotBase();
        p.stats.jackpots++;
        p.stats.maxJackpot = Math.max(p.stats.maxJackpot, amount);
        this.events.push({ t: 'jackpot', p: p.id });
        await this.view.banner('jackpot', 'JACKPOT!!', `${amount}G を獲得！`, p);
        return this.transfer(null, p, amount, 'ジャックポット');
      }
      case 'portal': {
        const to = await this.ctrl[p.id].chooseTile(this, p, 'portal', TILES.map((_, k) => k).filter((k) => k !== i && TILES[k].kind !== 'portal' && TILES[k].kind !== 'jackpot'));
        const steps = (to - p.pos + N_TILES) % N_TILES;
        await this.moveSteps(p, steps);
        if (!this.s.over && !p.bankrupt) return this.resolve(p);
        return;
      }
      case 'tavern':
        return this.tavern(p);
      case 'cathedral': {
        const gift = r5((this.isLast(p) ? 200 : 100) * this.stage.tollMul);
        await this.view.banner('event-good', '大聖堂の祝福', `${gift}G とカード1枚`, p);
        await this.transfer(null, p, gift, '祝福');
        return this.giveCard(p, this.drawCard(p));
      }
      case 'start':
        return;
    }
  }

  private async resolveProp(p: Player, i: number) {
    const t = this.s.tiles[i];
    if (t.owner === null) {
      const cost = this.buyCost(i, p);
      if (p.cash < cost) return;
      const withBuild = p.cash >= cost + this.buildCost(i, p);
      const ok = await this.ctrl[p.id].confirm(this, p, { kind: 'buy', tile: i, cost, build: false });
      if (!ok) return;
      await this.pay(p, null, cost, '土地購入');
      t.owner = p.id;
      t.level = 0;
      this.view.log(`${p.name} が ${TILES[i].name} を購入`);
      await this.view.tile(i, 'buy', p);
      await this.checkMonopoly(p, i);
      if (this.s.over) return;
      if (withBuild && this.canBuild(i)) await this.offerBuild(p, i);
      return;
    }
    if (t.owner === p.id) {
      // 領地交渉：同じ色の相手の土地を買収できる
      for (const k of this.groupTiles(TILES[i].group!)) {
        const o = this.s.tiles[k];
        if (k === i || o.owner === null || o.owner === p.id || o.level >= MAX_LEVEL || o.dragon > 0) continue;
        const cost = this.takeoverCost(k, p);
        if (p.cash < cost) continue;
        if (await this.ctrl[p.id].confirm(this, p, { kind: 'takeover', tile: k, cost })) await this.doTakeover(p, k, cost);
        if (this.s.over || p.bankrupt) return;
      }
      // 自分の土地では2段階まで続けて建てられる
      for (let k = 0; k < 2 && this.canBuild(i); k++) {
        if (!(await this.offerBuild(p, i))) break;
      }
      return;
    }
    // 相手の土地
    const owner = this.s.players[t.owner];
    const toll = this.toll(i, p);
    if (toll > 0) {
      let shielded = false;
      if (p.hand.includes('shield')) {
        shielded = await this.ctrl[p.id].confirm(this, p, { kind: 'shield', tile: i, toll });
        if (shielded) {
          p.hand.splice(p.hand.indexOf('shield'), 1);
          p.stats.cardsUsed++;
          await this.view.cardUsed(p, 'shield', i);
        }
      }
      if (!shielded) {
        const before = owner.cash;
        await this.pay(p, owner, toll, `${TILES[i].name} の通行料`);
        const paid = owner.cash - before;
        p.stats.tollsPaid += paid;
        owner.stats.tollsEarned += paid;
        owner.stats.maxToll = Math.max(owner.stats.maxToll, paid);
        this.events.push({ t: 'toll', p: owner.id });
        if (this.s.over || p.bankrupt) return;
      }
    }
    // 買収
    if (t.owner !== p.id && t.level < MAX_LEVEL && t.dragon === 0) {
      const cost = this.takeoverCost(i, p);
      if (p.cash >= cost) {
        const ok = await this.ctrl[p.id].confirm(this, p, { kind: 'takeover', tile: i, cost });
        if (ok) await this.doTakeover(p, i, cost);
      }
    }
  }

  async doTakeover(p: Player, i: number, cost: number) {
    const t = this.s.tiles[i];
    const prev = this.s.players[t.owner!];
    await this.pay(p, prev, cost, '買収');
    if (p.bankrupt) return;
    t.owner = p.id;
    t.festival = 0;
    if (p.hero === 'barbarian' && t.level < MAX_LEVEL - 1) t.level++; // 略奪王：奪った土地がすぐ育つ
    p.stats.takeovers++;
    this.events.push({ t: 'takeover', p: p.id });
    await this.view.banner('takeover', '買収成立！', `${p.name} が ${TILES[i].name} を奪った`, p);
    await this.view.tile(i, 'takeover', p);
    await this.checkMonopoly(p, i);
  }

  private async offerBuild(p: Player, i: number): Promise<boolean> {
    const t = this.s.tiles[i];
    const cost = this.buildCost(i, p);
    if (p.cash < cost) return false;
    const ok = await this.ctrl[p.id].confirm(this, p, { kind: 'build', tile: i, cost, level: t.level + 1 });
    if (!ok) return false;
    await this.pay(p, null, cost, '建設');
    t.level++;
    await this.view.tile(i, 'build', p);
    if (t.level === MAX_LEVEL) {
      p.stats.landmarks++;
      await this.view.banner('landmark', '王国の象徴 完成！', `${TILES[i].name} は誰にも奪えない`, p);
    }
    return true;
  }

  private async checkMonopoly(p: Player, i: number) {
    const g = TILES[i].group!;
    if (!this.ownsGroup(p.id, g)) return;
    const n = this.monopolies(p.id).length;
    p.stats.monopoliesMax = Math.max(p.stats.monopoliesMax, n);
    this.events.push({ t: 'monopoly', p: p.id });
    for (const k of this.groupTiles(g)) {
      if (this.s.tiles[k].level === 0) {
        this.s.tiles[k].level = 1;
        await this.view.tile(k, 'build', p);
      }
    }
    await this.view.banner('monopoly', '領地制覇！', `${GROUPS[g].name} の通行料が2倍に`, p);
    if (n >= UNIFY_SETS) {
      await this.view.banner('unify', '三国統一！！', `${p.name} が王国を統べた`, p);
      await this.finish(p, 'unify');
    } else if (n === UNIFY_SETS - 1 && !this.unifyWarned.has(p.id)) {
      this.unifyWarned.add(p.id);
      await this.view.banner('unify-warn', '三国統一まであと1つ！', `${p.name} を止めろ！`, p);
    }
  }

  private async tavern(p: Player) {
    const bet = await this.ctrl[p.id].tavern(this, p);
    if (!bet || p.cash < bet) return;
    await this.pay(p, null, bet, '酒場の賭け');
    await this.ctrl[p.id].waitRoll(this, p);
    const d = this.rng.int(1, 6);
    await this.view.dice(p, [d]);
    const mul = d === 6 ? 3 : d >= 4 ? 2 : 0;
    if (mul) {
      await this.view.banner('event-good', mul === 3 ? '大当たり！' : '勝ち！', `${bet * mul}G を受け取った`, p);
      await this.transfer(null, p, bet * mul, '酒場の賭け');
    } else {
      await this.view.banner('event-bad', 'はずれ…', `${bet}G は酒場のものに`, p);
    }
  }

  // ---------- カード ----------
  cardPool(): CardId[] {
    return this.s.cfg.cardPool;
  }
  drawCard(p: Player, boosted = false): CardId {
    const rank = this.s.players.length > 1 ? this.rankOf(p) / (this.s.players.length - 1) : 0;
    let { common, rare, epic } = RARITY_WEIGHT;
    const boost = rank * 0.6 + (boosted ? 0.3 : 0) + (p.hero === 'ranger' ? 0.4 : 0);
    common *= 1 - boost * 0.4;
    rare *= 1 + boost * 0.4;
    epic *= 1 + boost * 0.9;
    const pool = this.cardPool();
    const items = pool.map((id) => ({ item: id, w: { common, rare, epic }[CARDS[id].rarity] }));
    return this.rng.weighted(items);
  }
  async giveCard(p: Player, card: CardId) {
    if (p.hand.length >= this.handLimit(p)) {
      const idx = await this.ctrl[p.id].discard(this, p, card);
      if (idx >= p.hand.length) {
        this.view.log(`${p.name} は ${CARDS[card].name} を捨てた`);
        return;
      }
      p.hand.splice(idx, 1);
    }
    p.hand.push(card);
    await this.view.cardGained(p, card);
    this.view.sync();
  }

  /** カードを使う。戻り値：'turn-done'（移動済み）/'twin'/数値（精密ダイスの出目）/undefined */
  private async useCard(p: Player, card: CardId, target?: number): Promise<'turn-done' | 'twin' | number | undefined> {
    const idx = p.hand.indexOf(card);
    if (idx < 0) return;
    p.hand.splice(idx, 1);
    p.stats.cardsUsed++;
    await this.view.cardUsed(p, card, target);
    switch (card) {
      case 'boots':
        p.boots = 3;
        return;
      case 'twin':
        return 'twin';
      case 'purse':
        await this.transfer(null, p, 150, '金貨の袋');
        return;
      case 'precise':
        return Math.max(2, Math.min(12, target ?? 7));
      case 'quake':
        if (target !== undefined && this.s.tiles[target].owner !== null && this.s.tiles[target].level > 0 && this.s.tiles[target].level < MAX_LEVEL) {
          this.s.tiles[target].level--;
          await this.view.tile(target, 'quake', p);
        }
        return;
      case 'thieves': {
        const victim = this.alive.filter((o) => o !== p).sort((a, b) => b.cash - a.cash)[0];
        if (victim) await this.transfer(victim, p, Math.min(400, r5(victim.cash * 0.15)), '盗賊団');
        return;
      }
      case 'festival':
        if (target !== undefined) {
          this.s.tiles[target].festival = 3;
          await this.view.tile(target, 'festival', p);
        }
        return;
      case 'teleport':
        if (target !== undefined) {
          await this.moveSteps(p, (target - p.pos + N_TILES) % N_TILES);
          if (!this.s.over && !p.bankrupt) await this.resolve(p);
        }
        return 'turn-done';
      case 'dragon':
        if (target !== undefined) {
          this.s.tiles[target].dragon = 3;
          await this.view.tile(target, 'dragon', p);
        }
        return;
      case 'edict':
        if (target !== undefined) {
          const t = this.s.tiles[target];
          if (t.owner !== null && t.owner !== p.id && t.level < MAX_LEVEL) {
            const cost = r5(this.value(target) * 1.3);
            if (p.cash >= cost) await this.doTakeover(p, target, cost);
          }
        }
        return;
      case 'goldrain':
        p.goldRain = 3;
        return;
      case 'shield':
        return;
    }
  }

  /** カードの対象として選べるマス */
  cardTargets(p: Player, card: CardId): number[] {
    const tiles = this.s.tiles;
    const all = TILES.map((_, i) => i);
    switch (CARDS[card].target) {
      case 'ownTile':
        return all.filter((i) => tiles[i].owner === p.id);
      case 'enemyTile':
        return all.filter((i) => {
          const t = tiles[i];
          if (t.owner === null || t.owner === p.id) return false;
          if (card === 'quake') return t.level > 0 && t.level < MAX_LEVEL;
          if (card === 'edict') return t.level < MAX_LEVEL && p.cash >= r5(this.value(i) * 1.3);
          if (card === 'dragon') return t.dragon === 0;
          return true;
        });
      case 'anyTile':
        return all.filter((i) => i !== p.pos && TILES[i].kind !== 'jackpot');
      default:
        return [];
    }
  }
  cardUsable(p: Player, card: CardId): boolean {
    const def = CARDS[card];
    if (!def.active) return false;
    if (def.target === 'ownTile' || def.target === 'enemyTile') return this.cardTargets(p, card).length > 0;
    if (card === 'thieves') return this.alive.some((o) => o !== p && o.cash > 0);
    return true;
  }

  // ---------- 運命の巻物 ----------
  private async fateEvent(p: Player) {
    const n = this.alive.length;
    const rank = n > 1 ? this.rankOf(p) / (n - 1) : 0.5; // 0 = 首位, 1 = 最下位
    const good = 0.7 + rank * 0.9;
    const bad = 1.2 - rank * 0.9;
    type Ev = () => Promise<void>;
    const owned = this.s.tiles.map((t, i) => ({ t, i })).filter((x) => x.t.owner === p.id && this.canBuild(x.i));
    const leader = this.ranking()[0];
    const leaderBuildings = this.s.tiles.map((t, i) => ({ t, i })).filter((x) => x.t.owner === leader.id && x.t.level > 0 && x.t.level < MAX_LEVEL);
    const events: { item: Ev; w: number }[] = [
      { w: 1.2 * good, item: async () => {
        const v = r5((120 + this.s.round * 8) * this.stage.tollMul);
        await this.view.banner('event-good', '王の褒美', `${v}G を賜った`, p);
        await this.transfer(null, p, v, '王の褒美');
      } },
      { w: 1 * good, item: async () => {
        const v = r5(this.rng.int(60, 320) * this.stage.tollMul);
        await this.view.banner('event-good', '宝箱を発見！', `中には ${v}G`, p);
        await this.transfer(null, p, v, '宝箱');
      } },
      { w: 0.8 * good, item: async () => {
        await this.view.banner('event-good', '民の寄付', '全員から 40G ずつ', p);
        for (const o of this.alive) if (o !== p) await this.transfer(o, p, 40, '民の寄付');
      } },
      { w: 0.5 * good, item: async () => {
        await this.view.banner('event-good', '追い風', '黄金の泉へ飛んでいく！', p);
        await this.moveSteps(p, (15 - p.pos + N_TILES) % N_TILES);
        if (!this.s.over && !p.bankrupt) await this.resolve(p);
      } },
      { w: owned.length ? 0.8 * good : 0, item: async () => {
        const x = this.rng.pick(owned);
        x.t.level++;
        await this.view.banner('event-good', '職人の恩返し', `${TILES[x.i].name} に無料で建設`, p);
        await this.view.tile(x.i, 'build', p);
        if (x.t.level === MAX_LEVEL) p.stats.landmarks++;
      } },
      { w: 0.9 * good, item: async () => {
        await this.view.banner('event-good', '旅人の贈り物', 'カードを1枚', p);
        await this.giveCard(p, this.drawCard(p));
      } },
      { w: 1 * bad, item: async () => {
        await this.view.banner('event-bad', '盗賊に襲われた', '所持金の10%を失う', p);
        await this.pay(p, null, r5(p.cash * 0.1), '盗賊', true);
      } },
      { w: 0.8 * bad, item: async () => {
        await this.view.banner('event-bad', '嵐', '3マス押し戻される', p);
        await this.moveSteps(p, -3);
        if (!this.s.over && !p.bankrupt) await this.resolve(p);
      } },
      { w: 0.5 * bad, item: async () => {
        await this.view.banner('dungeon', '衛兵に捕まった', '地下牢へ', p);
        await this.sendToJail(p);
      } },
      { w: 0.8 * bad, item: async () => {
        const levels = this.s.tiles.reduce((a, t) => a + (t.owner === p.id ? t.level : 0), 0);
        const v = r5(levels * 25 * this.stage.tollMul);
        await this.view.banner('event-bad', '税務官の訪問', v ? `建物1段階ごとに25G、合計 ${v}G` : '建物がないので見逃してもらえた', p);
        if (v) await this.pay(p, null, v, '固定資産税', true);
      } },
      { w: leaderBuildings.length ? 0.9 : 0, item: async () => {
        const x = leaderBuildings.sort((a, b) => this.value(b.i) - this.value(a.i))[0];
        x.t.level--;
        await this.view.banner('event', '竜の襲撃！', `首位 ${leader.name} の ${TILES[x.i].name} が崩れた`, p);
        await this.view.tile(x.i, 'quake', p);
      } },
    ];
    const ev = this.rng.weighted(events);
    await ev();
  }
}
