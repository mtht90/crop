// =====================================================================
//  内部抽選 → 引き込み制御 (DOM非依存。node でもシミュレーション可能)
// =====================================================================

export class SlotLogic {
  constructor(config, rng = Math.random) {
    this.cfg = config;
    this.rng = rng;
    this.strips = config.reels.strips.map((s) => s.split(''));
    this.N = this.strips[0].length;
    this.lines = config.lines;
  }

  sym(reel, pos) {
    const n = this.N;
    return this.strips[reel][((pos % n) + n) % n];
  }

  // 枠内 3x3: rows[reel][row] row 0=下段 1=中段 2=上段
  window(stops) {
    return stops.map((c, r) => (c == null ? null : [this.sym(r, c - 1), this.sym(r, c), this.sym(r, c + 1)]));
  }

  // ---------------------------------------------------------------
  // 内部抽選
  //   mode: 'normal' | 'BIG' | 'REG'
  //   carried: 持ち越し中のボーナス ('BIG' | 'REG' | null)
  //   forced: デバッグ用強制フラグ
  // 戻り値: { small, bonus, newBonus }
  // ---------------------------------------------------------------
  draw(mode, carried, setting, forced = null) {
    if (mode !== 'normal') {
      const t = this.cfg.bonusTable;
      let r = this.rng(), acc = 0;
      for (const [k, w] of Object.entries(t)) {
        acc += w;
        if (r < acc) return { small: k === 'NONE' ? null : k, bonus: null, newBonus: null };
      }
      return { small: null, bonus: null, newBonus: null };
    }
    let key = forced;
    if (!key) {
      const table = this.cfg.probability[setting];
      let r = this.rng(), acc = 0;
      key = 'NONE';
      for (const [k, denom] of Object.entries(table)) {
        acc += 1 / denom;
        if (r < acc) { key = k; break; }
      }
    }
    let small = null, bonus = null;
    for (const part of key.split('+')) {
      if (part === 'BIG' || part === 'REG') bonus = part;
      else if (part !== 'NONE') small = part;
    }
    // 持ち越し中はボーナス再抽選なし (成立済みフラグを優先)
    let newBonus = null;
    if (carried) bonus = carried;
    else if (bonus) newBonus = bonus;
    return { small, bonus, newBonus };
  }

  roleSet(mode) {
    const r = this.cfg.roles;
    const names = mode === 'normal'
      ? ['BIG', 'REG', 'SUIKA', 'BELL', 'REPLAY', 'CHERRY']
      : ['BONUS_BELL', 'REPLAY', 'SUIKA', 'CHERRY', 'BIG', 'REG'];
    return names.map((n) => ({ name: n, ...r[n] }));
  }

  // 停止済みリールのみで成立役を判定
  evaluate(stops, mode) {
    const win = this.window(stops);
    const res = [];
    const roles = this.roleSet(mode);
    for (const role of roles) {
      if (role.leftAny) {
        if (win[0] && win[0].includes(role.leftAny)) {
          res.push({ role: role.name, line: -1, rows: [win[0].indexOf(role.leftAny), null, null] });
        }
        continue;
      }
      if (win.some((w) => w == null)) continue;
      this.lines.forEach((ln, li) => {
        const s = win[0][ln[0]] + win[1][ln[1]] + win[2][ln[2]];
        if (role.combos.includes(s)) res.push({ role: role.name, line: li, rows: ln, combo: s });
      });
    }
    return res;
  }

  // ボーナス図柄のテンパイライン (2リール停止時)
  tenpai(stops) {
    const win = this.window(stops);
    const stopped = stops.map((s) => s != null);
    if (stopped.filter(Boolean).length !== 2) return [];
    const open = stopped.indexOf(false);
    const combos = [...this.cfg.roles.BIG.combos, ...this.cfg.roles.REG.combos];
    const out = [];
    this.lines.forEach((ln, li) => {
      for (const combo of combos) {
        let ok = true;
        for (let r = 0; r < 3; r++) {
          if (r === open) continue;
          if (win[r][ln[r]] !== combo[r]) { ok = false; break; }
        }
        if (ok) { out.push({ line: li, combo, open, row: ln[open], need: combo[open] }); }
      }
    });
    return out;
  }

  // ---------------------------------------------------------------
  // 引き込み制御
  //   reel: 停止するリール, press: ボタン押下時の中段位置 (整数)
  //   stops: 現在の停止状態 (未停止は null)
  //   flag: { small, bonus }  mode: 'normal'|'BIG'|'REG'
  //   opts.assistBonus: true ならボーナス図柄を全コマ引き込み
  // ---------------------------------------------------------------
  decideStop(reel, press, stops, flag, mode, opts = {}) {
    const ctx = this.context(flag, mode, opts);
    return this.choose(stops, reel, press, ctx).cand;
  }

  // 制御コンテキスト (フラグ毎に期待値テーブルをメモ化)
  context(flag, mode, opts = {}) {
    const assist = !!(opts.assistBonus && flag.bonus && !flag.small);
    const key = `${mode}|${flag.small}|${flag.bonus}|${assist}`;
    this._ctx ??= new Map();
    if (this._ctx.has(key)) return this._ctx.get(key);
    const roles = this.cfg.roles;
    const bit = (n) => (n ? this.roleBit(mode, n) : 0);
    const small = flag.small && !roles[flag.small].leftAny ? flag.small : null;
    const cherry = flag.small && roles[flag.small].leftAny ? flag.small : null;
    const ctx = {
      mode, flag, assist,
      arr: this.masks(mode).arr,
      allowMask: bit(flag.small) | bit(flag.bonus),
      sBit: bit(small), cBit: bit(cherry), bBit: bit(flag.bonus),
      maxSlip: assist ? this.N - 1 : this.cfg.reels.maxSlip,
      memo: new Map(),
    };
    this._ctx.set(key, ctx);
    return ctx;
  }

  // 停止候補の中から最良の 1 コマを選ぶ (滑りコマ数 0..maxSlip)
  choose(stops, reel, press, ctx) {
    const N = this.N;
    let best = null;
    for (let k = 0; k <= ctx.maxSlip; k++) {
      const cand = (press + k) % N;
      const st = stops.slice();
      st[reel] = cand;
      const v = this.value(st, ctx);
      const tp = this.tenpaiPref(st, ctx);
      // 優先: 制御破綻回避 > 非成立テンパイ禁止 > 小役 > チェリー > ボーナス > テンパイ演出 > 少ない滑り
      const score = [v[0], tp < 0 ? -1 : 0, v[1], v[2], v[3], tp > 0 ? 1 : 0, -k];
      if (!best || cmp(score, best.score) > 0) best = { cand, score, v };
    }
    return best;
  }

  // 期待値ベクトル [破綻なし率, 小役成立率, チェリー成立率, ボーナス成立率]
  // 残りリールは「ランダムな押し順・タイミング + 同じ制御」で停止すると仮定
  value(st, ctx) {
    const N = this.N;
    const key = (st[0] ?? N) * 484 + (st[1] ?? N) * 22 + (st[2] ?? N);
    const hit = ctx.memo.get(key);
    if (hit) return hit;
    let out;
    const rem = [0, 1, 2].filter((r) => st[r] == null);
    if (rem.length === 0) {
      const m = ctx.arr[(st[0] * N + st[1]) * N + st[2]];
      const ok = (m & ~ctx.allowMask) === 0 ? 1 : 0;
      out = [ok, ok && m & ctx.sBit ? 1 : 0, ok && m & ctx.cBit ? 1 : 0, ok && m & ctx.bBit ? 1 : 0];
    } else {
      out = [0, 0, 0, 0];
      const w = 1 / (rem.length * N);
      for (const r of rem) {
        for (let p = 0; p < N; p++) {
          const v = this.choose(st, r, p, ctx).v;
          for (let i = 0; i < 4; i++) out[i] += v[i] * w;
        }
      }
    }
    ctx.memo.set(key, out);
    return out;
  }

  tenpaiPref(st, ctx) {
    if (ctx.mode !== 'normal') return 0;
    const tp = this.tenpai(st).some((t) => t.combo[0] === t.combo[1]);
    if (!tp) return 0;
    if (!ctx.flag.bonus) return -1;
    return ctx.flag.small ? 0 : 1;
  }

  // 全停止パターン (N^3) の成立役ビットマスクを前計算
  masks(mode) {
    this._masks ??= {};
    const key = mode === 'normal' ? 'normal' : 'bonus';
    if (this._masks[key]) return this._masks[key];
    const N = this.N, roles = this.roleSet(mode);
    const arr = new Uint16Array(N * N * N);
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) for (let c = 0; c < N; c++) {
      let m = 0;
      for (const w of this.evaluate([a, b, c], mode)) m |= 1 << roles.findIndex((r) => r.name === w.role);
      arr[(a * N + b) * N + c] = m;
    }
    this._masks[key] = { arr, roles: roles.map((r) => r.name) };
    return this._masks[key];
  }

  roleBit(mode, name) {
    const i = this.masks(mode).roles.indexOf(name);
    return i < 0 ? 0 : 1 << i;
  }

  // ボーナス揃いの最短ターゲット (フリーズ演出の自動停止用)
  bonusStopPositions(bonus) {
    const combo = this.cfg.roles[bonus].combos[0];
    // 中段揃い
    return combo.split('').map((s, r) => this.strips[r].indexOf(s));
  }
}

function cmp(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}
