// =====================================================================
//  ゲーム進行 (メダル・ボーナス状態・持ち越し・履歴)。DOM非依存
// =====================================================================
import { SlotLogic } from './logic.js';

export class Machine {
  constructor(config, rng = Math.random) {
    this.cfg = config;
    this.logic = new SlotLogic(config, rng);
    this.rng = rng;
    this.medals = config.play.startMedals;
    this.credit = 0;          // 投入済みベット
    this.replayPending = false;
    this.mode = 'normal';     // 'normal' | 'BIG' | 'REG'
    this.carried = null;      // 持ち越しボーナス
    this.noticed = false;     // 告知済み
    this.bonusPaid = 0;
    this.bonusGames = 0;
    this.flag = null;
    this.records = [];        // 過去の日の戦績
    this.newDay();
  }

  // ------------------------------------------------------------
  //  お金: 1日 = 所持金を持って台に座り、換金して帰るまで
  // ------------------------------------------------------------
  newDay() {
    const M = this.cfg.money;
    this.wallet = M.wallet;
    this.invested = 0;
    this.medals = this.cfg.play.startMedals;
    this.balls = 0;           // パチンコの持ち玉
    this.pach = null;         // パチンコの状態 (保留・ST など)
    this.credit = 0;
    this.replayPending = false;
    this.mode = 'normal';
    this.carried = null;
    this.noticed = false;
    this.bonusPaid = 0;
    this.bonusGames = 0;
    this.stats = { games: 0, big: 0, reg: 0, in: 0, out: 0, sinceBonus: 0, history: [], graph: [0], normalGames: 0, grape: 0, cherry: 0, maxHamari: 0 };
    this.zone = 0;          // 連チャンゾーン残り G
    this.chain = 0;         // 現在の連チャン数
    // 本日の設定 (隠し設定)。換金時に答え合わせ
    const odds = this.cfg.settingOdds;
    const tot = Object.values(odds).reduce((a, b) => a + b, 0);
    let r = this.rng() * tot;
    this.daySetting = 1;
    for (const [k, w] of Object.entries(odds)) { r -= w; if (r < 0) { this.daySetting = +k; break; } }
    this.cfg.setting = this.daySetting;
  }

  canLend() { return this.wallet >= this.cfg.money.lendYen; }

  lend() {
    const M = this.cfg.money;
    if (!this.canLend()) return false;
    this.wallet -= M.lendYen;
    this.invested += M.lendYen;
    this.medals += M.lendMedals;
    return true;
  }

  // 今換金したらいくらになるか (円)
  cashValue() { return Math.floor(this.medals * this.cfg.money.exchangeYen + (this.balls || 0) * (this.cfg.money.ballYen || 0)); }
  balance() { return this.cashValue() - this.invested; }

  cashout() {
    const rec = {
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      invested: this.invested, cash: this.cashValue(), balance: this.balance(),
      games: this.stats.games, big: this.stats.big, reg: this.stats.reg, setting: this.daySetting, medals: this.medals, balls: this.balls || 0,
    };
    this.records.unshift(rec);
    this.records = this.records.slice(0, 30);
    this.newDay();
    return rec;
  }

  get setting() { return this.cfg.setting; }

  canBet() { return this.replayPending || this.medals >= this.cfg.bet; }

  bet() {
    if (this.credit >= this.cfg.bet) return false;
    if (this.replayPending) { this.credit = this.cfg.bet; return true; }
    if (this.medals < this.cfg.bet) return false;
    this.medals -= this.cfg.bet;
    this.credit = this.cfg.bet;
    this.stats.in += this.cfg.bet;
    return true;
  }

  // レバーON: 内部抽選
  start(forced = null) {
    if (this.credit < this.cfg.bet) return null;
    const wasReplay = this.replayPending;
    this.replayPending = false;
    const boost = this.zone > 0 ? (this.cfg.chain?.boost || 1) : 1;
    const flag = this.logic.draw(this.mode, this.carried, this.setting, forced, boost);
    if (flag.newBonus) { this.carried = flag.newBonus; this.noticed = false; }
    this.flag = { small: flag.small, bonus: this.mode === 'normal' ? this.carried : null, newBonus: flag.newBonus };
    this.stats.games++;
    if (this.mode === 'normal') {
      this.stats.sinceBonus++;
      this.stats.normalGames = (this.stats.normalGames || 0) + 1;
      if (this.zone > 0) this.zone--;
      this.stats.maxHamari = Math.max(this.stats.maxHamari || 0, this.stats.sinceBonus);
    }
    return { ...this.flag, wasReplay };
  }

  decideStop(reel, press, stops) {
    return this.logic.decideStop(reel, press, stops, this.flag, this.mode, {
      assistBonus: this.cfg.play.assistAlignAfterNotice && this.noticed,
    });
  }

  // 全リール停止後の精算
  settle(stops) {
    const wins = this.logic.evaluate(stops, this.mode);
    const roles = this.cfg.roles;
    const res = { wins, pay: 0, replay: false, bonusStart: null, bonusEnd: null, roleNames: [] };
    const seen = new Set();
    for (const w of wins) {
      if (seen.has(w.role)) continue; // 同一役の複数ライン成立は 1 回分
      seen.add(w.role);
      res.roleNames.push(w.role);
      const r = roles[w.role];
      res.pay += r.pay || 0;
      if (r.replay) res.replay = true;
      if (r.bonus) res.bonusStart = r.bonus;
    }
    this.credit = 0;
    if (this.mode === 'normal') {
      if (res.roleNames.includes('GRAPE')) this.stats.grape = (this.stats.grape || 0) + 1;
      if (res.roleNames.includes('CHERRY')) this.stats.cherry = (this.stats.cherry || 0) + 1;
    }
    this.medals += res.pay;
    this.stats.out += res.pay;
    if (res.replay) this.replayPending = true;

    // スランプグラフ用 (差枚推移を 10G ごとに記録)
    if (this.stats.games % 10 === 0) {
      this.stats.graph = this.stats.graph || [0];
      this.stats.graph.push(this.stats.out - this.stats.in);
      if (this.stats.graph.length > 400) this.stats.graph = this.stats.graph.filter((_, i) => i % 2 === 0);
    }
    if (this.mode !== 'normal') {
      this.bonusPaid += res.pay;
      this.bonusGames++;
      const b = this.cfg.bonus[this.mode];
      if (this.bonusPaid >= b.maxPay || this.bonusGames >= b.maxGames) {
        res.bonusEnd = { type: this.mode, paid: this.bonusPaid, games: this.bonusGames };
        this.stats.history.unshift({ type: this.mode, at: this.stats.sinceBonusAtStart, paid: this.bonusPaid });
        this.stats.history = this.stats.history.slice(0, 20);
        this.mode = 'normal';
        this.zone = this.cfg.chain?.zoneGames || 100;
      }
    } else if (res.bonusStart) {
      // 連チャン判定 (前回ボーナスから 100G 以内) とスペシャル BGM の条件
      const C = this.cfg.chain || {};
      const hadBonus = this.stats.big + this.stats.reg > 0;
      const g = this.stats.sinceBonus;
      this.chain = hadBonus && g <= (C.zoneGames || 100) ? this.chain + 1 : 1;
      res.chain = this.chain;
      res.sinceBonus = g;
      res.sp = res.bonusStart !== 'BIG' || !hadBonus ? null
        : g <= (C.sp1Within || 3) ? 'sp1'
        : g <= (C.zoneGames || 100) && g >= 11 && g % 11 === 0 ? 'sp2' : null;
      this.zone = 0;
      this.mode = res.bonusStart;
      this.carried = null;
      this.noticed = false;
      this.bonusPaid = 0;
      this.bonusGames = 0;
      this.stats[res.bonusStart === 'BIG' ? 'big' : 'reg']++;
      this.stats.sinceBonusAtStart = this.stats.sinceBonus;
      this.stats.sinceBonus = 0;
    }
    return res;
  }

  serialize() {
    return JSON.stringify({ medals: this.medals, stats: this.stats, carried: this.carried, noticed: this.noticed, mode: this.mode, bonusPaid: this.bonusPaid, bonusGames: this.bonusGames, replayPending: this.replayPending, zone: this.zone, chain: this.chain, balls: this.balls, pach: this.pach, wallet: this.wallet, invested: this.invested, daySetting: this.daySetting, records: this.records });
  }

  restore(json) {
    try {
      const d = JSON.parse(json);
      Object.assign(this, {
        medals: d.medals ?? this.medals, stats: { ...this.stats, ...d.stats }, carried: d.carried ?? null,
        noticed: !!d.noticed, mode: d.mode || 'normal', bonusPaid: d.bonusPaid || 0, bonusGames: d.bonusGames || 0,
        replayPending: !!d.replayPending, zone: d.zone || 0, chain: d.chain || 0, balls: d.balls || 0, pach: d.pach || null,
        wallet: d.wallet ?? this.wallet, invested: d.invested ?? 0, daySetting: d.daySetting ?? this.daySetting, records: d.records || [],
      });
      this.cfg.setting = this.daySetting;
    } catch { /* 破損データは無視 */ }
  }
}
