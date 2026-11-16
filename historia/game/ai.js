// HISTORIA CPU player. level: 1=やさしい 2=ふつう 3=つよい
(function () {
  'use strict';
  const { C, top, fxList, isBasic, isEnergy } = window.HE;

  function slotScore(g, s) { return (top(s).stage * 40) + s.energy.length * 25 + g.hpLeft(s) / 4; }

  // answer engine questions for the CPU
  function makeAsk(level) {
    return async function ask(g, pi, req) {
      const opts = req.options || []; if (!opts.length) return null;
      const p = g.P(pi);
      switch (req.kind) {
        case 'setupActive': {
          const best = opts.slice().sort((a, b) => C(b.card).hp - C(a.card).hp)[0]; return best.value;
        }
        case 'setupBench': return p.bench.length < (level >= 2 ? 4 : 3) ? opts[0].value : null;
        case 'pick': {
          if (req.optional && level === 1 && Math.random() < 0.2) return null;
          // prefer evolutions we can use, then basics, then supporters, then energy
          const sc = o => { const c = C(o.card.id || o.card); if (!c) return 0; if (c.kind === 'person') return 50 + c.stage * 10 + (c.hp || 0) / 10; if (c.kind === 'support') return 40; if (c.kind === 'energy') return 30; return 20; };
          return opts.slice().sort((a, b) => sc(b) - sc(a))[0].value;
        }
        case 'target': {
          if (req.side === 'opp') {
            // pull the weakest / most damaged target so we can knock it out
            const best = opts.slice().sort((a, b) => g.hpLeft(a.slot) - g.hpLeft(b.slot))[0]; return best.value;
          }
          if (/回復/.test(req.prompt)) return opts.slice().sort((a, b) => b.slot.damage - a.slot.damage)[0].value;
          if (/エネルギーをつける/.test(req.prompt)) return opts.slice().sort((a, b) => slotScore(g, b.slot) - slotScore(g, a.slot))[0].value;
          // promote / switch: healthiest attacker that can attack soonest
          return opts.slice().sort((a, b) => slotScore(g, b.slot) - slotScore(g, a.slot))[0].value;
        }
        default: return opts[0].value;
      }
    };
  }

  function bestAttack(g, pi) {
    const p = g.P(pi), o = g.opp(pi); if (!p.active || !o.active) return null;
    let best = null;
    top(p.active).atks.forEach((a, i) => {
      if (!g.canAttack(pi, i)) return;
      let est = a.dmg; for (const t of fxList(a.fx)) { const [k, x] = t.split(':'); if (k === 'bench') est += +x * p.bench.length; if (k === 'coin') est += +x / 2; if (k === 'coins') est += +x; if (k === 'eper') est += +x * p.active.energy.length; if (k === 'dmgd' && o.active.damage) est += +x; if (k === 'self') est -= +x / 3; }
      est = g.damageTo(p.active, p, o.active, est, true);
      const ko = est >= g.hpLeft(o.active);
      const score = est + (ko ? 1000 : 0) + (a.fx ? 8 : 0);
      if (!best || score > best.score) best = { i, score, ko };
    });
    return best;
  }

  async function playTurn(g, pi, level, step) {
    const p = g.P(pi), o = g.opp(pi);
    const wait = step || (() => Promise.resolve());
    const done = () => g.winner != null || g.cur !== pi;
    // 1. benches
    for (const c of p.hand.filter(isBasic)) { if (done() || p.bench.length >= (level === 1 ? 3 : 5)) break; await g.playBasic(pi, c.uid); await wait(); }
    // 2. evolve
    for (let k = 0; k < 6 && !done(); k++) {
      const pl = g.playable(pi).find(a => a.type === 'evolve'); if (!pl) break;
      const t = pl.targets.sort((a, b) => (b === p.active) - (a === p.active))[0];
      await g.evolve(pi, pl.card.uid, t.uid); await wait();
    }
    // 3. trainers: draw supporters when hand is thin, gust when it gives a KO, items
    for (let k = 0; k < 8 && !done(); k++) {
      const pls = g.playable(pi).filter(a => a.type === 'trainer');
      const pick = pls.find(a => {
        const fx = C(a.card).fx;
        if (/gust/.test(fx)) return o.bench.some(s => g.hpLeft(s) <= 60) || level === 1;
        if (/switch/.test(fx) && !/draw/.test(fx)) return p.active && !top(p.active).atks.some(x => g.energyOk(p.active, x.cost)) && p.bench.some(s => top(s).atks.some(x => g.energyOk(s, x.cost)));
        if (/heal/.test(fx) && !/draw/.test(fx)) return g.allSlots(p).some(s => s.damage >= 40);
        if (/redraw/.test(fx)) return p.hand.length <= 4;
        if (/oppredraw/.test(fx) && !/redraw:/.test(fx.replace('oppredraw', ''))) return o.hand.length >= 5;
        if (/snipe/.test(fx)) return true;
        if (/atkbuff/.test(fx)) { const b = bestAttack(g, pi); return !!b; }
        return true;
      });
      if (!pick) break; await g.playTrainer(pi, pick.card.uid); await wait();
    }
    // stadium
    const sp = g.playable(pi).find(a => a.type === 'stadium'); if (sp && !done() && level >= 2) { await g.playStadium(pi, sp.card.uid); await wait(); }
    // 4. energy: to the active if it still needs energy, else to the bench slot closest to attacking
    const ep = g.playable(pi).find(a => a.type === 'energy');
    if (ep && !done()) {
      const etype = C(ep.card).type;
      const need = s => { const atks = top(s).atks; const want = Math.max(...atks.map(a => a.cost.length)); return want - s.energy.length + (top(s).type === etype ? 0.5 : 0); };
      let target = p.active && need(p.active) > 0 ? p.active : null;
      if (!target) target = p.bench.filter(s => need(s) > 0).sort((a, b) => slotScore(g, b) - slotScore(g, a))[0] || p.active;
      if (level === 1 && Math.random() < 0.25) target = g.allSlots(p)[Math.floor(Math.random() * g.allSlots(p).length)];
      await g.attachEnergy(pi, ep.card.uid, target.uid); await wait();
    }
    // 5. tools
    for (const t of g.playable(pi).filter(a => a.type === 'tool')) { if (done()) break; await g.attachTool(pi, t.card.uid, (p.active && !p.active.tool ? p.active : t.targets[0]).uid); await wait(); }
    // 6. retreat if active can't attack but a bench member can
    if (!done() && level >= 2 && p.active && !bestAttack(g, pi) && g.canRetreat(pi)) {
      const ready = p.bench.find(s => top(s).atks.some(a => g.energyOk(s, a.cost)));
      if (ready && g.retreatCost(p.active) <= 1) { await g.retreat(pi); await wait(); }
    }
    if (done()) return;
    // 7. attack or pass
    const b = bestAttack(g, pi);
    if (b) await g.attack(pi, b.i); else await g.endTurn();
  }

  window.HAI = { makeAsk, playTurn, bestAttack };
})();
