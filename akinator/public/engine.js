// 推論エンジン（ブラウザ・Node 共通）
//
// ベイズ推定:
//   P(対象 | 回答列) ∝ P(対象) × Π P(回答 | 対象, 質問)
// 質問選択:
//   回答後の候補分布のエントロピー期待値が最小になる質問を選ぶ（情報利得最大）
// 学習:
//   プレイ結果から (対象, 質問) ごとの回答回数を貯め、ディリクレ事後で確率を補正する

export const ANSWERS = ['はい', 'たぶんそう', 'わからない', 'たぶん違う', 'いいえ'];
export const A = { YES: 0, PROB: 1, DUNNO: 2, PROBNOT: 3, NO: 4 };

// 答えのモデル: タグ情報から見た「その対象を思い浮かべた人がどう答えるか」
const C_EXCL = 0; // スコープ外・排他・明示的に否定
const C_ABSENT = 1; // タグがない（たぶん違う）
const C_MAYBE = 2; // ?タグ（場合による）
const C_YES = 3; // タグがある
const C_UNKNOWN = 4; // 学習でしか知らない対象の未学習質問
const MODEL = [
  [0.02, 0.02, 0.05, 0.11, 0.8],
  [0.06, 0.07, 0.15, 0.22, 0.5],
  [0.3, 0.3, 0.2, 0.12, 0.08],
  [0.78, 0.12, 0.04, 0.03, 0.03],
  [0.2, 0.15, 0.3, 0.15, 0.2],
];
const PRIOR_STRENGTH = 5; // 学習データに対するタグ由来分布の重み（仮想回答数）
const MAX_CANDIDATES = 1500; // 質問選択時に考慮する上位候補数
const MASS_CUTOFF = 0.9995;

export function normName(s) {
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・･.\-_ー〜~!?！？「」『』()（）]/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export class Engine {
  /**
   * @param db       compile() の結果
   * @param learned  { entities: { [name]: { d?, votes, wins, counts: { [tag]: number[5] } } } }
   * @param opts     { minVotes: 新規エンティティを候補に加える最低投稿数 }
   */
  constructor(db, learned = {}, opts = {}) {
    const minVotes = opts.minVotes ?? 1;
    this.questions = db.questions;
    this.Q = this.questions.length;
    this.qIndex = new Map(this.questions.map((q, i) => [q.tag, i]));

    const groupOf = new Map();
    for (const g of db.groups) for (const t of g) groupOf.set(t, g);

    // エンティティ一覧（DB + 学習で追加されたもの）
    this.entities = db.entities.map((e) => ({ ...e, learnedOnly: false }));
    this.byName = new Map();
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      for (const n of [e.n, ...(e.a || [])]) {
        const k = normName(n);
        if (!this.byName.has(k)) this.byName.set(k, i);
      }
    }
    const lent = (learned && learned.entities) || {};
    for (const [name, rec] of Object.entries(lent)) {
      if (this.byName.has(normName(name))) continue;
      if ((rec.votes || 0) < minVotes) continue;
      const d = rec.d || null;
      this.byName.set(normName(name), this.entities.length);
      this.entities.push({ n: name, a: [], d, w: 1, t: d ? ['D:' + d] : [], m: [], x: [], learnedOnly: true });
    }
    this.E = this.entities.length;

    // 対象×質問 のコード表
    const codes = new Uint8Array(this.E * this.Q);
    for (let e = 0; e < this.E; e++) {
      const ent = this.entities[e];
      const ts = new Set(ent.t);
      const ms = new Set(ent.m);
      const xs = new Set(ent.x);
      for (let q = 0; q < this.Q; q++) {
        const qq = this.questions[q];
        let c;
        if (ent.d && qq.scope && !qq.scope.includes(ent.d)) c = C_EXCL;
        else if (ts.has(qq.tag)) c = C_YES;
        else if (ms.has(qq.tag)) c = C_MAYBE;
        else if (xs.has(qq.tag)) c = C_EXCL;
        else {
          const g = groupOf.get(qq.tag);
          if (g && g.some((t) => t !== qq.tag && ts.has(t))) c = C_EXCL;
          else c = ent.learnedOnly ? C_UNKNOWN : C_ABSENT;
        }
        codes[e * this.Q + q] = c;
      }
    }
    this.codes = codes;

    // 学習による補正: 対象ごとに Map<q, Float64Array(5)>
    this.override = new Array(this.E).fill(null);
    this.prior = new Float64Array(this.E);
    for (let e = 0; e < this.E; e++) {
      const ent = this.entities[e];
      let rec = lent[ent.n];
      if (!rec) for (const a of ent.a || []) if (lent[a]) { rec = lent[a]; break; }
      const wins = rec ? rec.wins || 0 : 0;
      this.prior[e] = (ent.w || 1) * Math.sqrt(1 + wins + (rec ? rec.votes || 0 : 0));
      if (!rec || !rec.counts) continue;
      const ov = new Map();
      for (const [tag, cnt] of Object.entries(rec.counts)) {
        const q = this.qIndex.get(tag);
        if (q === undefined || !Array.isArray(cnt)) continue;
        const base = MODEL[codes[e * this.Q + q]];
        const tot = cnt.reduce((s, x) => s + (+x || 0), 0);
        const p = new Float64Array(5);
        for (let a = 0; a < 5; a++) p[a] = (base[a] * PRIOR_STRENGTH + (+cnt[a] || 0)) / (PRIOR_STRENGTH + tot);
        ov.set(q, p);
      }
      if (ov.size) this.override[e] = ov;
    }

    // タグごとの全体頻度（匂わせの「意外さ」計算用）
    this.tagFreq = new Float64Array(this.Q);
    for (let q = 0; q < this.Q; q++) {
      let n = 0;
      for (let e = 0; e < this.E; e++) if (codes[e * this.Q + q] === C_YES) n++;
      this.tagFreq[q] = n / Math.max(1, this.E);
    }
  }

  prob(e, q) {
    const ov = this.override[e];
    if (ov) {
      const p = ov.get(q);
      if (p) return p;
    }
    return MODEL[this.codes[e * this.Q + q]];
  }

  findByName(name) {
    const i = this.byName.get(normName(name));
    return i === undefined ? -1 : i;
  }

  /** 名前の部分一致検索（学習時の候補表示） */
  search(text, limit = 8) {
    const k = normName(text);
    if (!k) return [];
    const res = [];
    for (let e = 0; e < this.E && res.length < limit; e++) {
      const ent = this.entities[e];
      if ([ent.n, ...(ent.a || [])].some((n) => normName(n).includes(k))) res.push(e);
    }
    return res;
  }

  newGame(rng = Math.random) {
    return new Game(this, rng);
  }
}

export class Game {
  constructor(engine, rng) {
    this.en = engine;
    this.rng = rng;
    this.history = []; // {q, a}
    this.rejected = new Set();
    this.hinted = new Set();
    this.reset();
  }

  reset() {
    const { E, prior } = this.en;
    this.logw = new Float64Array(E);
    for (let e = 0; e < E; e++) this.logw[e] = this.rejected.has(e) ? -Infinity : Math.log(prior[e]);
    this.asked = new Set();
    for (const h of this.history) this._apply(h.q, h.a);
  }

  _apply(q, a) {
    const { E } = this.en;
    for (let e = 0; e < E; e++) {
      if (this.logw[e] === -Infinity) continue;
      this.logw[e] += Math.log(this.en.prob(e, q)[a]);
    }
    this.asked.add(q);
  }

  answer(q, a) {
    this.history.push({ q, a });
    this._apply(q, a);
  }

  undo() {
    if (!this.history.length) return false;
    this.history.pop();
    this.reset();
    return true;
  }

  reject(e) {
    this.rejected.add(e);
    this.logw[e] = -Infinity;
  }

  /** 事後分布の上位 (正規化済み確率付き) */
  ranking(limit = MAX_CANDIDATES) {
    const { E } = this.en;
    let max = -Infinity;
    for (let e = 0; e < E; e++) if (this.logw[e] > max) max = this.logw[e];
    if (max === -Infinity) return [];
    const ws = [];
    let total = 0;
    for (let e = 0; e < E; e++) {
      const w = Math.exp(this.logw[e] - max);
      if (w > 1e-12) { ws.push([e, w]); total += w; }
    }
    ws.sort((x, y) => y[1] - x[1]);
    const out = [];
    let cum = 0;
    for (const [e, w] of ws) {
      const p = w / total;
      out.push({ e, p });
      cum += p;
      if (out.length >= limit || (cum >= MASS_CUTOFF && out.length >= 2)) break;
    }
    return out;
  }

  /** 情報利得最大の質問を返す（同程度の候補からはランダムに選んで毎回同じ流れにならないようにする） */
  nextQuestion() {
    const { Q } = this.en;
    const cands = this.ranking();
    if (!cands.length) return -1;
    let sum = 0;
    for (const c of cands) sum += c.p;
    const ws = cands.map((c) => c.p / sum);
    const lws = ws.map((w) => Math.log(w));

    const scored = [];
    const pa = new Float64Array(5);
    const S = new Float64Array(5);
    for (let q = 0; q < Q; q++) {
      if (this.asked.has(q)) continue;
      pa.fill(0);
      S.fill(0);
      for (let i = 0; i < cands.length; i++) {
        const p = this.en.prob(cands[i].e, q);
        const w = ws[i];
        const lw = lws[i];
        for (let a = 0; a < 5; a++) {
          const x = w * p[a];
          pa[a] += x;
          S[a] += x * (lw + Math.log(p[a]));
        }
      }
      // 期待事後エントロピー = Σ_a ( -S_a + pa_a log pa_a )
      let h = 0;
      for (let a = 0; a < 5; a++) if (pa[a] > 0) h += -S[a] + pa[a] * Math.log(pa[a]);
      scored.push([q, h]);
    }
    if (!scored.length) return -1;
    scored.sort((x, y) => x[1] - y[1]);
    const best = scored[0][1];
    // 序盤は幅を持たせて多様性を出し、終盤は厳密に最良を選ぶ
    const slack = this.history.length < 3 ? 0.04 : 0.008;
    const pool = scored.filter((s) => s[1] <= best + slack + Math.abs(best) * slack).slice(0, 4);
    return pool[Math.floor(this.rng() * pool.length)][0];
  }

  /** 今ここで当てに行くべきか */
  guessDecision() {
    const r = this.ranking(3);
    if (!r.length) return null;
    const n = this.history.length;
    const p1 = r[0].p;
    const p2 = r[1] ? r[1].p : 0;
    if (n >= 4 && p1 >= 0.93) return { e: r[0].e, p: p1, early: n < 12 };
    if (n >= 8 && p1 >= 0.82 && p1 >= p2 * 6) return { e: r[0].e, p: p1, early: false };
    if (n >= 20 && p1 >= 0.5) return { e: r[0].e, p: p1, early: false };
    if (n >= 30) return { e: r[0].e, p: p1, early: false };
    return null;
  }

  confidence() {
    const r = this.ranking(1);
    return r.length ? r[0].p : 0;
  }

  /**
   * 匂わせ: 候補のほとんどが共有していて、全体では珍しい特徴を見つけたら返す。
   * まだ直接「はい」と答えていない特徴に限る（＝言い当てられた感が出る）
   */
  hint() {
    const cands = this.ranking(400);
    if (cands.length < 1) return null;
    const { Q, questions, codes, tagFreq } = this.en;
    let best = null;
    for (let q = 0; q < Q; q++) {
      const qq = questions[q];
      if (!qq.label || this.hinted.has(q) || this.asked.has(q)) continue;
      let m = 0;
      for (const c of cands) if (codes[c.e * Q + q] === 3) m += c.p;
      if (m < 0.85) continue;
      const surprise = m / Math.max(0.002, tagFreq[q]);
      if (!best || surprise > best.s) best = { q, s: surprise, m };
    }
    if (!best || best.s < 4) return null;
    this.hinted.add(best.q);
    return { q: best.q, label: questions[best.q].label, mass: best.m };
  }

  /** 学習用: 回答列を {tag: answerIndex} にする */
  answersByTag() {
    const out = {};
    for (const h of this.history) out[this.en.questions[h.q].tag] = h.a;
    return out;
  }

  /** ユーザーが答えたドメイン（新規エンティティ用） */
  inferredDomain() {
    for (const h of this.history) {
      const tag = this.en.questions[h.q].tag;
      if (tag.startsWith('D:') && h.a === A.YES) return tag.slice(2);
    }
    return null;
  }
}

/** 学習データへの記録（サーバー・ローカル共通） */
export function recordLearning(learned, { name, answers, domain, win }) {
  learned.entities ||= {};
  learned.plays = (learned.plays || 0) + 1;
  const rec = (learned.entities[name] ||= { votes: 0, wins: 0, counts: {} });
  if (win) rec.wins = (rec.wins || 0) + 1;
  else rec.votes = (rec.votes || 0) + 1;
  if (domain && !rec.d) rec.d = domain;
  for (const [tag, a] of Object.entries(answers)) {
    const c = (rec.counts[tag] ||= [0, 0, 0, 0, 0]);
    c[a]++;
  }
  return learned;
}
