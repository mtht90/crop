// 遠征（地図の陣取り）の本体。あなたとCPU3人の領主が、島の13の領地をカードバトルで奪い合う。
import { BATTLE, CAPITAL_HP, CARDS, HEROES, OWNED_REGION_HP, REGIONS, REGION_ADJ, STAGES, neutralMana, startDeck } from '../data/defs.ts';
import type { BattleSetup } from './battle.ts';
import { Rng } from './rng.ts';
import type { CampaignConfig, Lord, StageDef } from './types.ts';

export type Choice = { type: 'attack'; region: number } | { type: 'train' };
export type TrainPick = { kind: 'add'; index: number } | { kind: 'remove'; card: string } | null;

/** 1回のバトルの組み合わせ。defender が null なら中立の守り手（魔物）か竜 */
export interface Fight {
  attacker: Lord | 'dragon';
  defender: Lord | null;
  region: number;
  setup: BattleSetup;
}

export interface CampaignView {
  roundStart(round: number): Promise<void>;
  lordTurn(l: Lord): Promise<void>;
  declare(f: Fight): Promise<void>;
  result(f: Fight, attackerWon: boolean): Promise<void>;
  regionChange(region: number, from: number | null, to: number | null): Promise<void>;
  reward(l: Lord, card: string): Promise<void>;
  eliminated(l: Lord, by: Lord | null): Promise<void>;
  dragonRaid(region: number): Promise<void>;
  log(msg: string): void;
  sync(): void;
  finish(winner: Lord): Promise<void>;
}

export interface CampaignController {
  choose(c: Campaign, l: Lord): Promise<Choice>;
  reward(c: Campaign, l: Lord, offers: string[]): Promise<number>;
  train(c: Campaign, l: Lord, offers: string[]): Promise<TrainPick>;
}

/** バトルを実際に行う（人間が関わるなら画面で、CPU どうしなら画面なしで）。攻めた側が勝てば true */
export type BattleRunner = (c: Campaign, f: Fight) => Promise<boolean>;

const DRAGON_RAID_ROUNDS = [4, 8];

export class Campaign {
  cfg: CampaignConfig;
  stage: StageDef;
  lords: Lord[];
  owner: (number | null)[];
  round = 1;
  over = false;
  winner: number | null = null;
  rng: Rng;
  view: CampaignView;
  ctrl: CampaignController[];
  runBattle: BattleRunner;
  /** 竜の巣を落とした領主 */
  dragonSlayer: number | null = null;

  constructor(cfg: CampaignConfig, view: CampaignView, ctrl: CampaignController[], runBattle: BattleRunner) {
    this.cfg = cfg;
    this.stage = STAGES[cfg.stage];
    this.rng = new Rng(cfg.seed);
    this.view = view;
    this.ctrl = ctrl;
    this.runBattle = runBattle;
    const pers = ['careful', 'greedy', 'gambler'] as const;
    this.lords = cfg.heroes.map((hero, i) => ({
      id: i,
      name: cfg.names[i],
      hero,
      human: i === cfg.humanIndex,
      personality: pers[(i + cfg.seed) % 3],
      deck: startDeck(hero),
      alive: true,
      stats: { battlesWon: 0, battlesLost: 0, regionsTaken: 0, maxRegions: 1, capitalsTaken: 0, dragonSlain: false, cardsGained: 0, bestDamage: 0, lowestRankSeen: 0, flawless: 0 },
    }));
    this.owner = REGIONS.map((r) => r.start);
  }

  // ---------- 計算 ----------
  regionsOf(id: number) {
    return this.owner.map((o, i) => (o === id ? i : -1)).filter((i) => i >= 0);
  }
  capitalOf(id: number) {
    return REGIONS.findIndex((r) => r.kind === 'capital' && r.start === id);
  }
  /** 攻められる領地（自分の領地のとなりで、自分のものでない） */
  targets(l: Lord): number[] {
    const mine = this.regionsOf(l.id);
    const set = new Set<number>();
    for (const r of mine) for (const n of REGION_ADJ[r]) if (this.owner[n] !== l.id) set.add(n);
    return [...set].sort((a, b) => a - b);
  }
  ranking(): Lord[] {
    return [...this.lords].sort((a, b) => Number(b.alive) - Number(a.alive) || this.regionsOf(b.id).length - this.regionsOf(a.id).length || b.stats.battlesWon - a.stats.battlesWon);
  }
  rankOf(l: Lord) {
    return this.ranking().indexOf(l);
  }
  get alive() {
    return this.lords.filter((l) => l.alive);
  }
  /** 守りの城の体力 */
  defenseHp(region: number) {
    const r = REGIONS[region];
    const o = this.owner[region];
    if (o === null) return r.hp + this.stage.neutralBonus;
    return r.kind === 'capital' && r.start === o ? CAPITAL_HP : OWNED_REGION_HP;
  }
  /** 攻撃の組み合わせを作る */
  makeFight(attacker: Lord | 'dragon', region: number): Fight {
    const r = REGIONS[region];
    const o = this.owner[region];
    const defender = o === null ? null : this.lords[o];
    const dragon = REGIONS.find((x) => x.kind === 'dragon')!;
    const fewest = (l: Lord) => this.alive.every((x) => this.regionsOf(x.id).length >= this.regionsOf(l.id).length);
    const atk =
      attacker === 'dragon'
        ? { name: '竜', hero: null, hp: BATTLE.attackerHp + 4, deck: dragon.defenders, manaBonus: 1 }
        : { name: attacker.name, hero: attacker.hero, hp: BATTLE.attackerHp + (attacker.hero === 'barbarian' ? 4 : 0), deck: attacker.deck, extraCards: fewest(attacker) && this.round > 2 ? 1 : 0 };
    const def = defender
      ? { name: defender.name, hero: defender.hero, hp: this.defenseHp(region), deck: defender.deck, extraCards: fewest(defender) && this.round > 2 ? 1 : 0, manaBonus: r.kind === 'capital' ? 1 : 0 }
      : { name: r.name, hero: null, hp: this.defenseHp(region), deck: r.defenders, manaBonus: neutralMana(r) };
    return { attacker, defender, region, setup: { sides: [atk, def], seed: this.rng.int(1, 1e9) } };
  }
  /** 報酬の候補（その領地の特産＋開放済みカード） */
  rewardOffers(l: Lord, region: number): string[] {
    const r = REGIONS[region];
    const pool = this.cfg.cardPool.filter((c) => CARDS[c] && !CARDS[c].token);
    const n = 3;
    const out: string[] = [];
    const local = r.pool.filter((c) => pool.includes(c) || CARDS[c].monster);
    const defender = this.owner[region];
    if (defender !== null && defender !== l.id) local.push(HEROES[this.lords[defender].hero].signature);
    const w = (c: string) => ({ common: 6, rare: 3, epic: r.kind === 'dragon' ? 4 : 1 })[CARDS[c].rarity];
    for (let k = 0; k < n; k++) {
      const src = (k < 2 && local.length ? local : pool).filter((c) => !out.includes(c));
      if (!src.length) break;
      out.push(this.rng.weighted(src.map((c) => ({ item: c, w: w(c) }))));
    }
    return out;
  }

  // ---------- 進行 ----------
  async run() {
    this.view.sync();
    for (; this.round <= this.cfg.rounds && !this.over; this.round++) {
      await this.view.roundStart(this.round);
      if (DRAGON_RAID_ROUNDS.includes(this.round) && this.owner[REGIONS.findIndex((r) => r.kind === 'dragon')] === null) await this.dragonRaid();
      const start = (this.round - 1) % this.lords.length;
      for (let k = 0; k < this.lords.length && !this.over; k++) {
        const l = this.lords[(start + k) % this.lords.length];
        if (!l.alive) continue;
        await this.lordTurn(l);
      }
      if (this.round >= 3) for (const l of this.alive) l.stats.lowestRankSeen = Math.max(l.stats.lowestRankSeen, this.rankOf(l));
    }
    if (!this.over) await this.finish(this.ranking()[0]);
  }

  private async lordTurn(l: Lord) {
    await this.view.lordTurn(l);
    const choice = await this.ctrl[l.id].choose(this, l);
    if (choice.type === 'attack' && this.targets(l).includes(choice.region)) {
      await this.attack(l, choice.region);
    } else {
      // 訓練：3枚から1枚もらうか、デッキから1枚抜く
      const offers = this.rewardOffers(l, REGIONS.findIndex((r) => r.kind === 'capital' && r.start === l.id));
      const pick = await this.ctrl[l.id].train(this, l, offers);
      if (pick?.kind === 'add' && offers[pick.index]) {
        l.deck.push(offers[pick.index]);
        l.stats.cardsGained++;
        await this.view.reward(l, offers[pick.index]);
        // 商人は訓練でもう1枚もらえる
        if (l.hero === 'merchant') {
          const rest = offers.filter((_, i) => i !== pick.index);
          const j = await this.ctrl[l.id].reward(this, l, rest);
          if (rest[j]) {
            l.deck.push(rest[j]);
            l.stats.cardsGained++;
            await this.view.reward(l, rest[j]);
          }
        }
      } else if (pick?.kind === 'remove') {
        const k = l.deck.indexOf(pick.card);
        if (k >= 0 && l.deck.length > 8) {
          l.deck.splice(k, 1);
          this.view.log(`${l.name} はデッキから「${CARDS[pick.card].name}」を外した`);
        }
      }
    }
    this.view.sync();
  }

  private async attack(l: Lord, region: number) {
    const f = this.makeFight(l, region);
    await this.view.declare(f);
    const won = await this.runBattle(this, f);
    await this.view.result(f, won);
    if (won) {
      l.stats.battlesWon++;
      if (f.defender) f.defender.stats.battlesLost++;
      await this.take(l, region);
      if (this.over) return;
      const offers = this.rewardOffers(l, region);
      const i = await this.ctrl[l.id].reward(this, l, offers);
      if (offers[i]) {
        l.deck.push(offers[i]);
        l.stats.cardsGained++;
        await this.view.reward(l, offers[i]);
      }
    } else {
      l.stats.battlesLost++;
      if (f.defender) f.defender.stats.battlesWon++;
    }
  }

  /** 領地を奪う。王都なら、その領主は脱落し、ほかの領地は中立に戻る */
  private async take(l: Lord, region: number) {
    const prev = this.owner[region];
    this.owner[region] = l.id;
    l.stats.regionsTaken++;
    await this.view.regionChange(region, prev, l.id);
    if (REGIONS[region].kind === 'dragon') {
      l.stats.dragonSlain = true;
      this.dragonSlayer = l.id;
    }
    if (prev !== null && REGIONS[region].kind === 'capital' && REGIONS[region].start === prev) {
      const loser = this.lords[prev];
      loser.alive = false;
      l.stats.capitalsTaken++;
      // 王を失った領地は中立に戻る
      for (const r of this.regionsOf(prev)) {
        this.owner[r] = null;
        await this.view.regionChange(r, prev, null);
      }
      await this.view.eliminated(loser, l);
      if (this.alive.length === 1 || (loser.human && this.cfg.humanIndex >= 0)) {
        await this.finish(this.ranking()[0]);
        return;
      }
    }
    l.stats.maxRegions = Math.max(l.stats.maxRegions, this.regionsOf(l.id).length);
    this.view.sync();
  }

  /** 竜の襲撃：首位の領主の、王都以外の領地に竜が攻めてくる */
  private async dragonRaid() {
    const leader = this.ranking()[0];
    const lands = this.regionsOf(leader.id).filter((r) => REGIONS[r].kind !== 'capital');
    if (!lands.length) return;
    const region = this.rng.pick(lands);
    await this.view.dragonRaid(region);
    const f = this.makeFight('dragon', region);
    await this.view.declare(f);
    const won = await this.runBattle(this, f);
    await this.view.result(f, won);
    if (won) {
      this.owner[region] = null;
      leader.stats.battlesLost++;
      await this.view.regionChange(region, leader.id, null);
    } else leader.stats.battlesWon++;
    this.view.sync();
  }

  private async finish(w: Lord) {
    if (this.over) return;
    this.over = true;
    this.winner = w.id;
    this.view.sync();
    await this.view.finish(w);
  }
}
