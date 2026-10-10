// =====================================================================
//  DARKNIGHT のゲーム進行 (DOM 非依存。node でシミュレーションできる)
//   お金・戦績はジャグラー型の Machine をそのまま使い、抽選・リール制御・精算だけ差し替える
//   状態: normal → zen (前兆) → cz (DARK GATE) → battle → at (DARKNIGHT RUSH) ⇄ lb (LIMIT BREAK)
// =====================================================================
import { Machine } from '../machine.js';

const REEL = { L: 0, C: 1, R: 2 };

export class DarkMachine extends Machine {
  constructor(config, rng = Math.random) {
    super(config, rng);
    this.resetAt();
  }

  newDay() {
    super.newDay();
    this.resetAt?.();
  }

  resetAt() {
    this.at = {
      state: 'normal', mode: this.pickMode(), sinceAt: 0, next: null, zenLeft: 0,
      czLeft: 0, czWin: false, battleLeft: 0, atLeft: 0, lbLeft: 0, net: 0, total: 0,
      sevenPending: false, stage: 0, enemy: 0,
    };
    this.stats.at = this.stats.at || 0;
    this.stats.cz = this.stats.cz || 0;
    this.stats.atHistory = this.stats.atHistory || [];
  }

  pickW(table) {
    const ent = Object.entries(table);
    let r = this.rng() * ent.reduce((a, [, w]) => a + w, 0);
    for (const [k, w] of ent) { r -= w; if (r < 0) return k; }
    return ent[0][0];
  }

  pickMode() { return this.pickW(this.cfg.at.modes); }

  get inAt() { return this.at.state === 'at' || this.at.state === 'lb'; }
  get support() { return this.inAt; } // 押し順ナビあり

  // ---------------- 内部抽選 ----------------
  drawSmall(forced) {
    const P = this.cfg.smallProb;
    if (forced && forced !== 'CZ' && forced !== 'AT' && forced !== 'LB') return forced;
    let r = this.rng();
    const t = [['REPLAY', 1 / P.REPLAY], ['NAVI', 1 / P.NAVI], ['W_CHERRY', 1 / P.W_CHERRY], ['S_CHERRY', 1 / P.S_CHERRY], ['SUIKA', 1 / P.SUIKA], ['CHANCE', 1 / P.CHANCE]];
    for (const [k, p] of t) {
      if (r < p) return k === 'NAVI' ? 'N_' + this.cfg.naviOrders[Math.floor(this.rng() * 6)] : k;
      r -= p;
    }
    return null;
  }

  start(forced = null) {
    if (this.credit < this.cfg.bet) return null;
    const wasReplay = this.replayPending;
    this.replayPending = false;
    const A = this.at;
    let small = A.sevenPending ? 'SEVEN' : this.drawSmall(forced);
    const navi = small && small.startsWith('N_') ? small.slice(2) : null;
    this.order = [];
    this.raw = small;
    this.navi = navi;
    const ev = this.atLever(small, forced);
    this.flag = { small, bonus: null, navi, naviShow: navi && this.inAt ? navi : null, ev, atState: A.state };
    this.stats.games++;
    if (!this.inAt && A.state !== 'battle') { this.stats.sinceBonus++; A.sinceAt++; this.stats.normalGames = (this.stats.normalGames || 0) + 1; }
    this.stats.maxHamari = Math.max(this.stats.maxHamari || 0, A.sinceAt);
    return { ...this.flag, wasReplay };
  }

  // 押した順に応じて、いま揃えてよい役を決める
  effRole(reel) {
    const s = this.raw;
    if (!s) return null;
    if (s.startsWith('N_')) {
      const ord = [...this.order];
      if (!ord.includes(reel)) ord.push(reel);
      for (let i = 0; i < Math.min(2, ord.length); i++) if (REEL[this.navi[i]] !== ord[i]) return null;
      return 'BELL';
    }
    return this.cfg.flagRole[s] || null;
  }

  decideStop(reel, press, stops) {
    const role = this.effRole(reel);
    this.order.push(reel);
    return this.logic.decideStop(reel, press, stops, { small: role, bonus: null }, 'normal', {});
  }

  // ---------------- AT 抽選 (レバー ON) ----------------
  atLever(small, forced) {
    const A = this.at, C = this.cfg.at, rng = this.rng;
    const ev = [];
    const rareKey = small === 'W_CHERRY' || small === 'S_CHERRY' || small === 'SUIKA' || small === 'CHANCE' ? small : null;
    if (A.state === 'normal') {
      let next = null;
      if (forced === 'AT') next = 'at';
      else if (forced === 'CZ') next = 'cz';
      else if (A.sinceAt >= C.ceiling) { next = 'at'; ev.push({ type: 'ceiling' }); }
      else if (rareKey && rng() < (C.rareAt[rareKey] || 0)) next = 'at';
      else if (rareKey && rng() < (C.rareCz[rareKey] || 0)) next = 'cz';
      else if (rng() < 1 / C.czDirect[this.setting][A.mode]) next = 'cz';
      if (next) {
        A.state = 'zen'; A.next = next;
        const [a, b] = C.zenchou;
        A.zenLeft = next === 'at' && rareKey === 'S_CHERRY' ? 1 : a + Math.floor(rng() * (b - a + 1));
        A.enemy = next === 'at' ? 3 : Math.floor(rng() * 3);
        ev.push({ type: 'zen', next });
      }
      // 背景 (モード示唆): レア役で変わりやすい
      if (rareKey || rng() < 0.03) {
        const hint = { A: [70, 20, 8, 2], B: [40, 40, 15, 5], C: [25, 30, 35, 10], HEAVEN: [10, 20, 30, 40] }[A.mode];
        A.stage = +this.pickW({ 0: hint[0], 1: hint[1], 2: hint[2], 3: hint[3] });
        ev.push({ type: 'stage', stage: A.stage });
      }
    } else if (A.state === 'cz') {
      if (rareKey && !A.czWin && rng() < 0.5) { A.czWin = true; ev.push({ type: 'czUp' }); }
    } else if (A.state === 'at' || A.state === 'lb') {
      if (forced === 'LB' || (A.state === 'at' && rng() < (rareKey ? (C.lbRate[rareKey] || 0) : C.lbRate.normal))) {
        A.state = 'lb'; A.lbLeft = C.lbGames; ev.push({ type: 'lbStart' });
      } else if (rareKey && rng() < (C.addRate[rareKey] || 0)) {
        const g = +this.pickW(C.addTable);
        A.atLeft += g; ev.push({ type: 'add', g, by: rareKey });
      }
      if (A.state === 'lb') {
        const g = +this.pickW(C.lbAdd);
        A.atLeft += g; ev.push({ type: 'add', g, by: 'LB' });
      }
    }
    return ev;
  }

  // ---------------- 精算 ----------------
  settle(stops) {
    const wins = this.logic.evaluate(stops, 'normal');
    const res = { wins, pay: 0, replay: false, roleNames: [], at: [] };
    const seen = new Set();
    for (const w of wins) {
      if (seen.has(w.role)) continue;
      seen.add(w.role);
      res.roleNames.push(w.role);
      const r = this.cfg.roles[w.role];
      res.pay += r.pay || 0;
      if (r.replay) res.replay = true;
    }
    this.credit = 0;
    this.medals += res.pay;
    this.stats.out += res.pay;
    if (res.replay) this.replayPending = true;
    const A = this.at;
    if (this.inAt) A.net += res.pay - (this.lastBetReplay ? 0 : this.cfg.bet);
    if (this.stats.games % 10 === 0) {
      this.stats.graph = this.stats.graph || [0];
      this.stats.graph.push(this.stats.out - this.stats.in);
      if (this.stats.graph.length > 400) this.stats.graph = this.stats.graph.filter((_, i) => i % 2 === 0);
    }
    res.at = this.atSettle(res);
    return res;
  }

  atSettle() {
    const A = this.at, C = this.cfg.at, ev = [];
    if (A.state === 'zen') {
      if (--A.zenLeft <= 0) {
        if (A.next === 'cz') {
          A.state = 'cz'; A.czLeft = C.czGames; A.czWin = this.rng() < C.czWin[this.setting];
          this.stats.cz++; this.stats.reg = this.stats.cz;
          ev.push({ type: 'czStart' });
        } else this.startAt(ev);
      }
    } else if (A.state === 'cz') {
      if (--A.czLeft <= 0) { A.state = 'battle'; A.battleLeft = 3; ev.push({ type: 'battleStart', win: A.czWin }); }
    } else if (A.state === 'battle') {
      if (--A.battleLeft <= 0) {
        if (A.czWin) { ev.push({ type: 'battleWin' }); this.startAt(ev); }
        else { A.state = 'normal'; ev.push({ type: 'battleLose' }); }
      }
    } else if (A.state === 'at' || A.state === 'lb') {
      if (A.sevenPending) { A.sevenPending = false; ev.push({ type: 'seven' }); return ev; }
      if (A.state === 'lb' && --A.lbLeft <= 0) { A.state = 'at'; ev.push({ type: 'lbEnd' }); }
      A.atLeft--;
      if (A.net >= C.cap || A.atLeft <= 0) {
        const full = A.net >= C.cap;
        ev.push({ type: 'atEnd', net: A.net, total: A.total, full });
        this.stats.atHistory.unshift({ net: A.net, games: A.total });
        this.stats.atHistory = this.stats.atHistory.slice(0, 20);
        A.state = 'normal'; A.mode = this.pickMode(); A.sinceAt = 0; this.stats.sinceBonus = 0;
      } else A.total++;
    }
    return ev;
  }

  startAt(ev) {
    const A = this.at, C = this.cfg.at;
    A.state = 'at';
    A.atLeft = C.atGames + +this.pickW(C.atFirstAdd);
    A.net = 0; A.total = 0;
    A.sevenPending = true;
    this.stats.at++;
    this.stats.big = this.stats.at;   // データカウンターの「BIG」欄に AT 回数を出す
    this.stats.reg = this.stats.cz;
    ev.push({ type: 'atStart', games: A.atLeft });
  }

  bet() {
    const was = this.replayPending;
    const ok = super.bet();
    if (ok) this.lastBetReplay = was;
    return ok;
  }

  serialize() {
    const d = JSON.parse(super.serialize());
    d.at = this.at;
    return JSON.stringify(d);
  }

  restore(json) {
    super.restore(json);
    try { const d = JSON.parse(json); if (d.at) this.at = { ...this.at, ...d.at }; } catch { /* noop */ }
  }
}
