/* 麺屋インク — 経営シミュレーション（DOM非依存） */
(function (root) {
  const D = root.MENYA_DATA || require('./data.js');
  const S = {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  S.perk = (g, id) => (g.meta.perks && g.meta.perks[id]) || 0;
  S.city = (g) => D.CITIES[Math.min(g.meta.city, D.CITIES.length - 1)];
  S.mult = (g) => {
    const over = Math.max(0, g.meta.city - (D.CITIES.length - 1));
    return S.city(g).mult * Math.pow(8, over);
  };
  S.costF = (g) => S.mult(g) * Math.pow(0.96, S.perk(g, 'cost'));

  S.newGame = function (meta) {
    meta = meta || { city: 0, stars: 0, perks: {}, exits: 0 };
    const g = {
      v: 1, meta, day: 0, speed: 1, cash: 0, brand: 8, loan: 0, ipo: false,
      menu: {}, stores: [], dist: {}, cands: [], candDay: 0, nextId: 1,
      mkt: {}, lab: 0, rp: 0, tech: {}, event: null, nextEvent: 22,
      mission: 0, hist: [], seen: Date.now(), sold: {}, tut: 0,
    };
    for (const it of D.ITEMS) g.menu[it.id] = { on: it.id === 'ramen', price: it.ref, grade: 2 };
    for (const d of D.DISTRICTS) g.dist[d.id] = { open: d.unlock === 0, share: 0, heat: 0 };
    g.cash = 2e6 * S.mult(g) * Math.pow(2, S.perk(g, 'seed'));
    g.brand = 8 + 5 * S.perk(g, 'brand');
    S.rollCands(g);
    return g;
  };

  // ---------- 価格・コスト ----------
  S.unlockCost = (g, d) => d.unlock * S.costF(g);
  S.storeCost = (g, d, slot) => 7e5 * Math.pow(d.rent / 16000, 0.75) * Math.pow(1.7, slot) * S.costF(g);
  S.seatCost = (g, st) => 6e5 * Math.pow(2.3, st.seat) * Math.pow(D.DISTRICT[st.d].rent / 16000, 0.4) * S.costF(g);
  S.decorCost = (g, st) => 4e5 * Math.pow(2.4, st.decor) * S.costF(g);
  S.maxStaff = (st) => 3 + st.seat * 3;
  S.rerollCost = (g) => 2e5 * S.costF(g) * (1 + g.stores.length * 0.3);
  S.labRate = (g) => D.LAB[g.lab].rp * (1 + 0.3 * S.perk(g, 'lab'));
  S.loanMax = (g) => Math.max(3e6 * S.mult(g), 0.5 * S.valuation(g));

  S.quality = (g, id) => 0.7 + 0.15 * g.menu[id].grade + (id === 'ramen' && g.tech.tare ? 0.15 : 0);
  S.unitCost = (g, id) => {
    const ev = g.event && D.EVENT[g.event.id].cogs || 1;
    return D.ITEM[id].cost * (0.55 + 0.225 * g.menu[id].grade) * (g.tech.kitchen ? 0.85 : 1) * ev;
  };
  const buyMul = (v) => 2 / (1 + Math.exp(-5 * (v - 1)));

  S.districtPref = (g, d, id) => (id === 'ramen' ? 1 : (d.pref[id] || 1) * (S.city(g).pref[id] || 1));

  // ---------- 1日あたりの損益を計算（状態は変えない） ----------
  S.compute = function (g) {
    const M = S.mult(g), city = S.city(g), ev = g.event ? D.EVENT[g.event.id] : null;
    const sales = (1 + 0.1 * S.perk(g, 'sales')) * (1 + 0.03 * (g.kaizen || 0)), cf = Math.pow(0.96, S.perk(g, 'cost'));
    const brandF = 0.28 + 0.72 * Math.pow(clamp(g.brand, 0, 100) / 100, 0.8);
    const out = { stores: {}, dist: {}, items: {}, rev: 0, cogs: 0, rent: 0, wage: 0, mgr: 0, mkt: 0, lab: 0, hq: 0, interest: 0, div: 0, served: 0 };
    for (const it of D.ITEMS) out.items[it.id] = { sold: 0, rev: 0, vsum: 0, n: 0 };
    const onItems = D.ITEMS.filter((it) => g.menu[it.id].on);

    for (const d of D.DISTRICTS) {
      const ds = g.dist[d.id];
      const stores = g.stores.filter((s) => s.d === d.id);
      const local = ev && ev.local ? g.event.d === d.id : true;
      const traffic = d.T * (ev && ev.traffic && local ? ev.traffic : 1);
      let rival = d.rival * city.rival * (1 + 0.35 * ds.heat) * (ev && ev.rival && local ? ev.rival : 1);
      const info = { share: 0, pool: 0, traffic, rival };
      out.dist[d.id] = info;
      if (!stores.length) continue;

      const pre = stores.map((st) => {
        const m = st.mgr || { svc: 0, eff: 0, frugal: 0, sales: 0 };
        const W = Math.pow(d.w * city.w, 0.75) * (1 + 0.04 * st.decor);
        const vals = {};
        for (const it of onItems) vals[it.id] = S.quality(g, it.id) * it.ref * W / g.menu[it.id].price;
        const appeal = brandF * (0.3 + 0.7 * Math.pow(st.rep / 5, 1.5)) * buyMul(vals.ramen) *
          (g.tech.delivery ? 1.15 : 1) * (1 + 0.03 * st.decor) * (1 + 0.06 * m.sales);
        return { st, m, vals, appeal };
      });
      const our = pre.reduce((a, p) => a + p.appeal, 0);
      const share = our / (our + rival);
      info.share = share; info.pool = traffic * share;

      for (const p of pre) {
        const { st, m, vals } = p;
        const demand = traffic * share * (p.appeal / our);
        const turn = 9 * (g.tech.h24 ? 1.3 : 1);
        const seatCap = D.SEATS[st.seat] * turn;
        const staffCap = st.staff * 70 * (g.tech.kiosk ? 1.25 : 1) * (1 + 0.08 * m.eff);
        const cap = Math.min(seatCap, staffCap);
        const served = Math.min(demand, cap);
        let rev = 0, cogs = 0, vw = 0, vr = 0;
        for (const it of onItems) {
          const prob = it.id === 'ramen' ? 1 : clamp(it.attach * S.districtPref(g, d, it.id) * buyMul(vals[it.id]), 0, 0.95);
          const n = served * prob, r = n * g.menu[it.id].price * M * sales;
          rev += r; cogs += n * S.unitCost(g, it.id) * M * cf;
          vw += vals[it.id] * r; vr += r;
          const oi = out.items[it.id]; oi.sold += n; oi.rev += r; oi.vsum += vals[it.id] * n; oi.n += n;
        }
        const vAvg = vr > 0 ? vw / vr : vals.ramen;
        const crowd = demand > cap ? clamp(demand / cap - 1, 0, 1) : 0;
        const target = clamp(3 + 2.4 * (vAvg - 1) + 0.12 * st.decor + 0.15 * m.svc + (g.tech.train ? 0.3 : 0) - 1.3 * crowd, 0.5, 5);
        const frugal = 1 - 0.05 * m.frugal;
        const rent = d.rent * (1 + 0.35 * st.seat) * M * cf * frugal;
        const wage = st.staff * 7500 * (g.tech.robot ? 0.75 : 1) * M * cf * frugal;
        const mgr = st.mgr ? st.mgr.salary * M * cf : 0;
        out.stores[st.id] = { demand, cap, seatCap, staffCap, served, rev, cogs, rent, wage, mgr, target, vAvg, profit: rev - cogs - rent - wage - mgr };
        out.rev += rev; out.cogs += cogs; out.rent += rent; out.wage += wage; out.mgr += mgr; out.served += served;
      }
    }
    const n = g.stores.length;
    for (const ch of D.MARKETING) if (g.mkt[ch.id]) out.mkt += ch.cost * M * cf * Math.sqrt(Math.max(1, n));
    out.lab = D.LAB[g.lab].cost * M * cf;
    const managed = g.stores.filter((s) => s.mgr).length;
    out.hq = n > 1 ? 5000 * Math.pow(n - 0.5 * managed, 1.55) * M * cf : 0;
    out.interest = g.loan * 0.0008 + (g.cash < 0 ? -g.cash * 0.0015 : 0);
    const op = out.rev - out.cogs - out.rent - out.wage - out.mgr - out.mkt - out.lab - out.hq - out.interest;
    out.div = g.ipo && op > 0 ? op * 0.1 : 0;
    out.profit = op - out.div;
    return out;
  };

  S.brandTarget = function (g) {
    let t = 8 + 5 * S.perk(g, 'brand');
    for (const ch of D.MARKETING) if (g.mkt[ch.id]) t += ch.brand;
    if (g.stores.length) t += 4 * (g.stores.reduce((a, s) => a + s.rep, 0) / g.stores.length);
    t += Math.min(14, g.stores.length * 1.2);
    return clamp(t, 0, 100);
  };

  S.valuation = function (g) {
    const h = g.hist.slice(-30);
    const avg = h.length ? h.reduce((a, x) => a + x.p, 0) / h.length : 0;
    const assets = g.stores.reduce((a, s) => a + s.inv, 0) * 0.6;
    return Math.max(0, g.cash - g.loan + assets + Math.max(0, avg) * 60);
  };
  S.avgProfit = function (g, n) {
    const h = g.hist.slice(-(n || 7));
    return h.length ? h.reduce((a, x) => a + x.p, 0) / h.length : 0;
  };

  // ---------- 時間進行 ----------
  // dt: 日数。戻り値: その間に起きた出来事 [{type,...}]
  S.advance = function (g, dt, C) {
    const evs = [];
    C = C || S.compute(g);
    let left = dt;
    while (left > 1e-9) {
      const next = Math.floor(g.day + 1e-9) + 1;
      const toNext = next - g.day;
      const step = Math.min(left, toNext);
      g.cash += C.profit * step;
      left -= step;
      if (step >= toNext - 1e-12) {
        g.day = next;
        S.endDay(g, C, evs);
        C = S.compute(g);
      } else g.day += step;
    }
    return evs;
  };

  S.endDay = function (g, C, evs) {
    for (const st of g.stores) {
      const r = C.stores[st.id];
      if (!r) continue;
      st.rep += (r.target - st.rep) * 0.09;
      st.last = r.profit;
    }
    g.brand += (S.brandTarget(g) - g.brand) * 0.06;
    for (const d of D.DISTRICTS) {
      const ds = g.dist[d.id], sh = C.dist[d.id].share;
      ds.share += (sh - ds.share) * 0.2;
      ds.heat += (clamp((sh - 0.35) / 0.4, 0, 1) - ds.heat) * 0.03;
    }
    g.rp += S.labRate(g);
    for (const id in C.items) g.sold[id] = (g.sold[id] || 0) + C.items[id].sold;
    g.hist.push({ r: C.rev, p: C.profit });
    if (g.hist.length > 90) g.hist.shift();
    const day = Math.round(g.day);
    if (day - g.candDay >= 20) { S.rollCands(g); evs.push({ type: 'cands' }); }
    // イベント
    if (g.event) {
      if (--g.event.left <= 0) { evs.push({ type: 'eventEnd', id: g.event.id }); g.event = null; g.nextEvent = day + 14 + Math.floor(Math.random() * 22); }
    } else if (day >= g.nextEvent && g.stores.length) {
      const e = D.EVENTS[Math.floor(Math.random() * D.EVENTS.length)];
      g.event = { id: e.id, left: e.days };
      if (e.local) {
        const pool = D.DISTRICTS.filter((d) => g.stores.some((s) => s.d === d.id));
        g.event.d = pool[Math.floor(Math.random() * pool.length)].id;
      }
      if (e.brand) g.brand = Math.min(100, g.brand + e.brand);
      evs.push({ type: 'event', id: e.id, d: g.event.d });
    }
    evs.push({ type: 'day', C });
  };

  // ---------- プレイヤー操作（成功なら true） ----------
  const pay = (g, c) => (g.cash >= c ? ((g.cash -= c), true) : false);

  S.unlockDistrict = function (g, id) {
    const d = D.DISTRICT[id];
    if (g.dist[id].open || !pay(g, S.unlockCost(g, d))) return false;
    g.dist[id].open = true; return true;
  };
  S.openStore = function (g, id) {
    const d = D.DISTRICT[id], n = g.stores.filter((s) => s.d === id).length;
    if (!g.dist[id].open || n >= 3) return false;
    const c = S.storeCost(g, d, n);
    if (!pay(g, c)) return false;
    const st = { id: g.nextId++, d: id, seat: 0, decor: 0, staff: 2, rep: 2.6, mgr: null, inv: c, last: 0 };
    g.stores.push(st); return st;
  };
  S.closeStore = function (g, sid) {
    const i = g.stores.findIndex((s) => s.id === sid);
    if (i < 0) return false;
    g.cash += g.stores[i].inv * 0.3; g.stores.splice(i, 1); return true;
  };
  S.upSeat = function (g, st) {
    if (st.seat >= D.SEATS.length - 1) return false;
    const c = S.seatCost(g, st); if (!pay(g, c)) return false;
    st.seat++; st.inv += c; return true;
  };
  S.upDecor = function (g, st) {
    if (st.decor >= 5) return false;
    const c = S.decorCost(g, st); if (!pay(g, c)) return false;
    st.decor++; st.inv += c; return true;
  };
  S.setStaff = function (g, st, n) { st.staff = clamp(n, 1, S.maxStaff(st)); return true; };

  S.rollCands = function (g) {
    g.candDay = Math.round(g.day); g.cands = [];
    const used = new Set(g.stores.filter((s) => s.mgr).map((s) => s.mgr.face));
    const NF = D.FACE_COUNT;
    const lvl = Math.min(3, g.meta.city * 0.5 + g.stores.length * 0.12);
    while (g.cands.length < 3) {
      const fi = Math.floor(Math.random() * NF);
      if (used.has(fi) && used.size < NF) continue;
      used.add(fi);
      const r = Math.random() + lvl * 0.12;
      const rar = r > 1.02 ? 2 : r > 0.68 ? 1 : 0;
      let pts = [3, 5, 8][rar] + Math.floor(Math.random() * 2);
      const m = { face: fi, name: D.MGR_NAMES[fi], rar, svc: 0, eff: 0, frugal: 0, sales: 0 };
      const keys = ['svc', 'eff', 'frugal', 'sales'];
      while (pts > 0) { const k = keys[Math.floor(Math.random() * 4)]; if (m[k] < 3) { m[k]++; pts--; } }
      const tot = m.svc + m.eff + m.frugal + m.sales;
      m.salary = Math.round(2500 * Math.pow(1 + tot, 1.15) / 100) * 100;
      g.cands.push(m);
    }
  };
  S.hireFee = (g, m) => m.salary * 25 * S.costF(g);
  S.hire = function (g, ci, st) {
    const m = g.cands[ci]; if (!m || !pay(g, S.hireFee(g, m))) return false;
    st.mgr = m; g.cands[ci] = null; return true;
  };
  S.reroll = function (g) { if (!pay(g, S.rerollCost(g))) return false; S.rollCands(g); return true; };

  S.setLab = function (g, n) { g.lab = clamp(n, 0, D.LAB.length - 1); return true; };
  S.techState = function (g, t) {
    if (g.tech[t.id]) return 'done';
    if (t.req && !g.tech[t.req]) return 'locked';
    return 'open';
  };
  S.research = function (g, id) {
    const t = D.TECHS[id];
    if (S.techState(g, t) !== 'open' || g.rp < t.rp) return false;
    g.rp -= t.rp; g.tech[id] = true;
    if (g.menu[id]) g.menu[id].on = true;
    return true;
  };

  S.kaizenCost = (g) => Math.round(80 * Math.pow(1.45, g.kaizen || 0));
  S.doKaizen = function (g) {
    const c = S.kaizenCost(g); if (g.rp < c) return false;
    g.rp -= c; g.kaizen = (g.kaizen || 0) + 1; return true;
  };

  S.borrow = function (g, amt) {
    const room = S.loanMax(g) - g.loan;
    amt = Math.min(amt, room); if (amt <= 0) return false;
    g.loan += amt; g.cash += amt; return true;
  };
  S.repay = function (g, amt) {
    amt = Math.min(amt, g.loan, Math.max(0, g.cash)); if (amt <= 0) return false;
    g.loan -= amt; g.cash -= amt; return true;
  };
  S.canIPO = (g) => !g.ipo && S.valuation(g) >= D.IPO_VALUE * S.mult(g);
  S.doIPO = function (g) {
    if (!S.canIPO(g)) return false;
    const c = S.valuation(g) * 0.25; g.cash += c; g.ipo = true; return c;
  };

  // ---------- 転生（次の都市へ進出） ----------
  S.exitGoal = (g) => D.EXIT_VALUE * S.mult(g);
  S.starsOnExit = function (g) {
    const r = S.valuation(g) / S.exitGoal(g);
    if (r < 1) return 0;
    return Math.floor((6 + 6 * Math.sqrt(r)) * (1 + 0.5 * g.meta.city) * (g.ipo ? 1.25 : 1));
  };
  S.exit = function (g) {
    const n = S.starsOnExit(g); if (!n) return null;
    const meta = { city: g.meta.city + 1, stars: g.meta.stars + n, perks: g.meta.perks, exits: (g.meta.exits || 0) + 1 };
    return S.newGame(meta);
  };
  S.perkCost = (g, p) => Math.ceil(p.base * Math.pow(1.6, S.perk(g, p.id)));
  S.buyPerk = function (g, id) {
    const p = D.PERKS.find((x) => x.id === id), lv = S.perk(g, id);
    const c = S.perkCost(g, p);
    if (lv >= p.max || g.meta.stars < c) return false;
    g.meta.stars -= c; g.meta.perks[id] = lv + 1;
    if (id === 'brand') g.brand = Math.min(100, g.brand + 5);
    return true;
  };

  // ---------- ミッション ----------
  S.missionValue = function (g, m, C) {
    switch (m.kind) {
      case 'stores': return g.stores.length;
      case 'profit': return C.profit / S.mult(g);
      case 'rep': return g.stores.reduce((a, s) => Math.max(a, s.rep), 0);
      case 'brand': return g.brand;
      case 'lab': return g.lab;
      case 'tech': return Object.keys(g.tech).length;
      case 'mgr': return g.stores.filter((s) => s.mgr).length;
      case 'districts': return D.DISTRICTS.filter((d) => g.dist[d.id].open).length;
      case 'share': return Math.max(...D.DISTRICTS.map((d) => g.dist[d.id].share)) * 100;
      case 'value': return S.valuation(g) / S.mult(g);
      case 'items': return D.ITEMS.filter((i) => g.menu[i.id].on).length;
    }
    return 0;
  };
  S.claimMission = function (g, C) {
    const m = D.MISSIONS[g.mission];
    if (!m || S.missionValue(g, m, C) < m.n) return null;
    const cash = (m.cash || 0) * S.mult(g);
    g.cash += cash; g.rp += m.rp || 0; g.mission++;
    return { cash, rp: m.rp || 0 };
  };

  // ---------- 放置収益 ----------
  S.offline = function (g, now) {
    const sec = Math.max(0, (now - g.seen) / 1000);
    g.seen = now;
    if (sec < 60 || !g.stores.length) return null;
    const capH = 4 + 2 * S.perk(g, 'idle');
    const used = Math.min(sec, capH * 3600);
    const eff = g.tech.ai ? 0.6 : 0.25;
    const days = used / D.DAY_SEC * eff;
    const cash = Math.max(0, S.avgProfit(g, 7)) * days;
    const rp = S.labRate(g) * days * 0.2;
    g.cash += cash; g.rp += rp;
    return { sec, used, cash, rp, capped: sec > used, eff };
  };

  // POS分析: 利益が増える方向（-1/0/+1）
  S.priceHint = function (g, id) {
    const p0 = g.menu[id].price, base = S.compute(g).profit;
    g.menu[id].price = p0 * 1.06; const up = S.compute(g).profit;
    g.menu[id].price = p0 * 0.94; const dn = S.compute(g).profit;
    g.menu[id].price = p0;
    const eps = Math.abs(base) * 0.004 + 1;
    if (up > base + eps && up >= dn) return 1;
    if (dn > base + eps) return -1;
    return 0;
  };

  root.MENYA_SIM = S;
  if (typeof module !== 'undefined') module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
