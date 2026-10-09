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
    this.stats = { games: 0, big: 0, reg: 0, in: 0, out: 0, sinceBonus: 0, history: [] };
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
    const flag = this.logic.draw(this.mode, this.carried, this.setting, forced);
    if (flag.newBonus) { this.carried = flag.newBonus; this.noticed = false; }
    this.flag = { small: flag.small, bonus: this.mode === 'normal' ? this.carried : null, newBonus: flag.newBonus };
    this.stats.games++;
    if (this.mode === 'normal') this.stats.sinceBonus++;
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
    this.medals += res.pay;
    this.stats.out += res.pay;
    if (res.replay) this.replayPending = true;

    if (this.mode !== 'normal') {
      this.bonusPaid += res.pay;
      this.bonusGames++;
      const b = this.cfg.bonus[this.mode];
      if (this.bonusPaid >= b.maxPay || this.bonusGames >= b.maxGames) {
        res.bonusEnd = { type: this.mode, paid: this.bonusPaid, games: this.bonusGames };
        this.stats.history.unshift({ type: this.mode, at: this.stats.sinceBonusAtStart, paid: this.bonusPaid });
        this.stats.history = this.stats.history.slice(0, 20);
        this.mode = 'normal';
      }
    } else if (res.bonusStart) {
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
    return JSON.stringify({ medals: this.medals, stats: this.stats, carried: this.carried, noticed: this.noticed, mode: this.mode, bonusPaid: this.bonusPaid, bonusGames: this.bonusGames, replayPending: this.replayPending });
  }

  restore(json) {
    try {
      const d = JSON.parse(json);
      Object.assign(this, {
        medals: d.medals ?? this.medals, stats: { ...this.stats, ...d.stats }, carried: d.carried ?? null,
        noticed: !!d.noticed, mode: d.mode || 'normal', bonusPaid: d.bonusPaid || 0, bonusGames: d.bonusGames || 0,
        replayPending: !!d.replayPending,
      });
    } catch { /* 破損データは無視 */ }
  }
}
