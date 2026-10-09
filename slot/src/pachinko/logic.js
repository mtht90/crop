// =====================================================================
//  パチンコの抽選と状態遷移 (DOM 非依存。node でも動く)
//   入賞の瞬間に大当たりを判定して保留に積む (先読みの色もここで決める)。
//   保留を 1 個ずつ消化して変動 → 大当たりならラウンド → ST / 時短 → 通常
// =====================================================================
export class PachinkoLogic {
  constructor(pcfg, rng = Math.random) {
    this.p = pcfg;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.mode = 'normal';     // normal | st | jitan
    this.modeLeft = 0;        // ST / 時短の残り回数
    this.holds = { heso: [], denchu: [] };
    this.current = null;      // 変動中の保留
    this.round = null;        // 大当たり中 { rounds, kakuhen, n, count, t }
    this.stats = { spins: 0, hits: 0, stHits: 0, firstHits: 0, chain: 0, maxChain: 0, sinceHit: 0, maxHamari: 0, heso: 0, ballsIn: 0, ballsOut: 0, history: [] };
  }

  get support() { return this.mode === 'st' || this.mode === 'jitan'; }

  pick(table, hit) {
    const col = hit ? 0 : 1;
    const ent = Object.entries(table).filter(([, w]) => w[col] > 0);
    let r = this.rng() * ent.reduce((a, [, w]) => a + w[col], 0);
    for (const [k, w] of ent) { r -= w[col]; if (r < 0) return k; }
    return ent[ent.length - 1][0];
  }

  // 入賞 → 保留。満タンなら null (賞球だけ)
  enter(kind) {
    const P = this.p.spec;
    const q = this.holds[kind];
    if (q.length >= P.holdMax) return null;
    const denom = this.mode === 'st' ? P.st : P.normal;
    const hit = this.rng() < 1 / denom;
    const h = { kind, hit, color: this.pick(this.p.holdColor, hit) };
    if (hit) {
      const table = kind === 'denchu' ? P.denchuTable : P.hesoTable;
      let r = this.rng() * table.reduce((a, t) => a + t[2], 0);
      for (const t of table) { r -= t[2]; if (r < 0) { h.rounds = t[0]; h.kakuhen = t[1]; break; } }
      if (!h.rounds) { h.rounds = table[0][0]; h.kakuhen = table[0][1]; }
    }
    q.push(h);
    if (kind === 'heso') this.stats.heso++;
    return h;
  }

  // 次の変動を始める (変動中・大当たり中・保留なしなら null)
  nextVariation() {
    if (this.current || this.round) return null;
    const h = this.holds.denchu.shift() || this.holds.heso.shift();
    if (!h) return null;
    const T = this.p.timing;
    const v = { ...h };
    const holdsLeft = this.holds.heso.length + this.holds.denchu.length;
    v.reach = h.hit || this.rng() < this.p.reachRateMiss ? this.pick(this.p.reachTable, h.hit) : null;
    if (this.support && !h.hit && v.reach && this.rng() < 0.7) v.reach = null; // 電サポ中はリーチが少ない
    v.stepUp = +this.pick(this.p.stepUp, h.hit && !!v.reach);
    v.gijiren = v.reach ? +this.pick(this.p.gijiren, h.hit) : 0;
    v.cutin = v.reach && v.reach !== 'normal' ? this.pick(this.p.cutin, h.hit) : 'none';
    if (v.reach === 'zenkaiten') { v.stepUp = 0; v.gijiren = 0; v.cutin = 'none'; }
    // 停止出目 (左・中・右)。確変図柄は奇数
    const d = () => 1 + Math.floor(this.rng() * 9);
    if (h.hit) {
      let n = d();
      if (h.kakuhen && n % 2 === 0) n = n === 8 ? 7 : n + 1;
      if (!h.kakuhen && n % 2 === 1) n = n === 9 ? 8 : n + 1;
      v.digits = [n, n, n];
    } else if (v.reach) {
      const n = d();
      let c = this.rng() < 0.6 ? ((n % 9) + 1) : d(); // 6 割は 1 コマずれ (惜しい)
      if (c === n) c = (n % 9) + 1;
      v.digits = [n, c, n];
    } else {
      const a = d(); let b = d(); if (b === a) b = (a % 9) + 1;
      v.digits = [a, d(), b];
    }
    v.time = this.support && !v.reach ? T.hazureSupport
      : v.reach ? T.reach[v.reach] + v.gijiren * 2.5
      : holdsLeft >= 2 ? T.hazureShort : T.hazure;
    v.time += v.stepUp * 0.6;
    this.current = v;
    this.stats.spins++;
    this.stats.sinceHit++;
    this.stats.maxHamari = Math.max(this.stats.maxHamari, this.stats.sinceHit);
    return v;
  }

  // 変動終了。当たりならラウンドを返す
  endVariation() {
    const v = this.current;
    if (!v) return null;
    this.current = null;
    // ST / 時短の消化は変動終了で 1 回
    if (this.support && !v.hit) {
      this.modeLeft--;
      if (this.modeLeft <= 0) {
        const wasSt = this.mode === 'st';
        this.mode = 'normal';
        if (wasSt) { this.stats.history.unshift({ chain: this.stats.chain }); this.stats.history = this.stats.history.slice(0, 20); }
        this.stats.chain = 0;
        return { modeEnd: wasSt ? 'st' : 'jitan' };
      }
    }
    if (!v.hit) return null;
    this.stats.hits++;
    if (this.mode === 'normal') { this.stats.firstHits++; this.stats.chain = 1; }
    else { this.stats.stHits++; this.stats.chain++; }
    this.stats.maxChain = Math.max(this.stats.maxChain, this.stats.chain);
    this.stats.sinceHit = 0;
    this.round = { rounds: v.rounds, kakuhen: v.kakuhen, n: 1, count: 0, t: 0, paid: 0, digits: v.digits, chain: this.stats.chain };
    this.mode = 'normal'; // 大当たり中は電サポなし
    return { round: this.round };
  }

  // アタッカー入賞 (ラウンド中)。ラウンドが進んだら true
  attackerIn() {
    const r = this.round;
    if (!r) return false;
    r.count++;
    r.paid += this.p.payout.attacker;
    if (r.count >= this.p.spec.roundCount) return this.nextRound();
    return false;
  }

  tickRound(dt) {
    const r = this.round;
    if (!r) return false;
    r.t += dt;
    if (r.t >= this.p.spec.roundSec) return this.nextRound();
    return false;
  }

  nextRound() {
    const r = this.round;
    r.n++; r.count = 0; r.t = 0;
    if (r.n > r.rounds) {
      this.round = null;
      this.mode = r.kakuhen ? 'st' : 'jitan';
      this.modeLeft = r.kakuhen ? this.p.spec.stGames : this.p.spec.jitanGames;
      r.done = true;
    }
    return true;
  }

  serialize() {
    return { mode: this.mode, modeLeft: this.modeLeft, holds: this.holds, round: this.round, stats: this.stats };
  }

  restore(d) {
    if (!d) return;
    Object.assign(this, { mode: d.mode || 'normal', modeLeft: d.modeLeft || 0, holds: d.holds || { heso: [], denchu: [] }, round: d.round || null });
    this.stats = { ...this.stats, ...(d.stats || {}) };
  }
}
