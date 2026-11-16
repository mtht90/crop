import { describe, expect, it } from 'vitest';
import { BUILDINGS, JOBS, PERKS, RESEARCH, RIVALS, UNITS } from '../src/core/data';
import { fmt } from '../src/core/format';
import { Game, costAt, maxAffordable } from '../src/core/sim';
import { exportSave, importSave } from '../src/core/state';

describe('format', () => {
  it('uses Japanese units', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(1234)).toBe('1,234');
    expect(fmt(12345)).toBe('1.234万');
    expect(fmt(1e8)).toBe('1億');
    expect(fmt(123456789)).toBe('1.234億');
    expect(fmt(9.999e15)).toBe('9999兆');
    expect(fmt(1e16)).toBe('1京');
    expect(fmt(1e7)).toBe('1000万');
    expect(fmt(1.2e9)).toBe('12億');
    expect(fmt(5.5e10)).toBe('550億');
    expect(fmt(1.5, { decimals: true })).toBe('1.5');
  });
});

describe('costs', () => {
  it('bulk cost equals sum of singles', () => {
    const one = [0, 1, 2, 3, 4].reduce((a, i) => a + (costAt({ gold: 10 }, 1.15, i).gold ?? 0), 0);
    expect(costAt({ gold: 10 }, 1.15, 0, 5).gold).toBeCloseTo(one, 6);
  });
  it('maxAffordable is consistent', () => {
    const have = { gold: 1000, wood: 0, meat: 0 };
    const n = maxAffordable({ gold: 10 }, 1.15, 3, have);
    expect(costAt({ gold: 10 }, 1.15, 3, n).gold!).toBeLessThanOrEqual(1000);
    expect(costAt({ gold: 10 }, 1.15, 3, n + 1).gold!).toBeGreaterThan(1000);
  });
});

describe('game', () => {
  it('click gives gold and save roundtrips', () => {
    const g = new Game();
    g.rng = () => 0.5;
    g.click();
    expect(g.s.res.gold).toBeGreaterThan(0);
    const g2 = new Game(importSave(exportSave(g.s)));
    expect(g2.s.res.gold).toBeCloseTo(g.s.res.gold);
  });
  it('offline progress is applied at reduced efficiency', () => {
    const g = new Game();
    g.s.jobs.miner = 10;
    g.recompute();
    g.s.lastSave = Date.now() - 3600 * 1000;
    const before = g.s.res.gold;
    const rep = g.applyOffline()!;
    expect(rep.efficiency).toBe(0.5);
    expect(g.s.res.gold - before).toBeCloseTo(g.d.baseRates.gold * 3600 * 0.5, 3);
  });
  it('construction finishes over time', () => {
    const g = new Game();
    g.s.res.gold = 1e6; g.s.res.wood = 1e6; g.s.reignGold = 1e6;
    expect(g.build('house')).toBe(true);
    for (let i = 0; i < 100; i++) g.tick(0.1);
    expect(g.s.buildings.house).toBe(1);
    expect(g.s.placed.length).toBe(1);
  });
});

/**
 * 自動プレイによるバランス確認。クリック 4回/秒 + 貪欲に「費用対効果が最も良いもの」を買う。
 * 各マイルストーンへの到達時間を出力し、ゆるい範囲で検査する。
 */
describe('balance bot', () => {
  it('reaches milestones at a sensible pace', () => {
    const g = new Game();
    let seed = 42;
    g.rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const log: Record<string, number> = {};
    const mark = (k: string) => { if (log[k] === undefined) log[k] = g.s.time; };
    const dt = 0.25;
    let clickAcc = 0;
    const value = (gold: number, wood: number, meat: number) => gold + wood * 3 + meat * 8;
    let reigns: string[] = [];
    let reignStart = 0;
    for (let step = 0; step < (12 * 3600) / dt; step++) {
      clickAcc += dt * 4;
      while (clickAcc >= 1) { clickAcc--; g.click(); }
      g.tick(dt);
      if (step % 4 !== 0) continue;
      // research first (cheap & permanent)
      for (const r of g.researchAvailable()) if (g.canAfford(r.cost)) g.doResearch(r.id);
      // buildings
      for (const b of BUILDINGS) {
        if (!b.unlock(g.unlockCtx()) || !g.buildingAvailable(b)) continue;
        const c = g.buildingCost(b);
        const room = g.d.popCap - g.d.pawns;
        if (b.id === 'house' && room > 3) continue;
        if (g.canAfford(c)) g.build(b.id);
      }
      // jobs: buy the one with best production value per cost
      let best: { id: (typeof JOBS)[number]['id']; score: number } | null = null;
      for (const j of JOBS) {
        if (!j.unlock(g.unlockCtx())) continue;
        const c = g.jobCost(j);
        if (!g.canAfford(c) || g.d.pawns >= g.d.popCap) continue;
        const gain = j.produces ? g.d.jobRate[j.id] * (j.produces === 'gold' ? 1 : j.produces === 'wood' ? 3 : 8) : g.d.rates.gold * 0.03;
        const score = gain / value(c.gold ?? 0, c.wood ?? 0, c.meat ?? 0);
        if (!best || score > best.score) best = { id: j.id, score };
      }
      if (best) g.hire(best.id);
      // army
      for (const u of [...UNITS].reverse()) if (g.s.buildings[u.requires] && g.canAfford(g.unitCost(u)) && g.s.res.gold > (g.unitCost(u).gold ?? 0) * 3) g.train(u.id);
      for (const r of RIVALS) {
        if (!g.battle && g.rivalUnlocked(r) && g.s.forts[r.id] < 5 && g.winChance(g.d.armyPower, g.fortRequirement(r, g.s.forts[r.id])) > 0.8) g.startBattle(r.id);
      }
      const want = Math.max(3, Math.ceil(g.s.crownsTotal * 0.6));
      if (g.crownsOnPrestige() >= want && g.s.time - reignStart > 600) {
        reigns.push(`${((g.s.time - reignStart) / 60).toFixed(0)}分→王冠${g.crownsOnPrestige()}`);
        reignStart = g.s.time;
        g.prestige();
        for (const p of PERKS) if (g.s.crownsTotal - g.s.crownsSpent >= p.cost) g.buyPerk(p.id);
      }
      const b = g.s.buildings;
      if (b.house >= 1) mark('house1');
      if (b.house >= 5) mark('house5');
      if (b.barracks) mark('barracks');
      if (b.castle >= 1) mark('castle1');
      if (g.fortsTotal >= 1) mark('fort1');
      if (g.fortsTotal >= 10) mark('rival2');
      if (g.fortsTotal >= 20) mark('allRivals');
      if (g.fortsTotal >= 5) mark('rival1');
      if (b.archery) mark('archery');
      if (b.monastery) mark('monastery');
      if (g.s.reignGold >= 1e7) mark('prestigeReady');
      if (g.crownsOnPrestige() >= 5) mark('crowns5');
    }
    const out = Object.entries(log).map(([k, v]) => `${k}: ${(v / 60).toFixed(1)}分`).join('\n');
    console.log(out + `\nfinal gold/s=${fmt(g.d.rates.gold)} pawns=${g.d.pawns} army=${fmt(g.d.armyPower)} forts=${g.fortsTotal} research=${g.s.research.length}/${RESEARCH.length}\nreigns: ${reigns.join(' | ')}\ncrowns=${g.s.crownsTotal} perks=${g.s.perks.length} rivalsForts=${JSON.stringify(g.s.forts)}`);
    expect(log.house1).toBeLessThan(120);
    expect(log.barracks).toBeLessThan(25 * 60);
    expect(log.prestigeReady).toBeDefined();
  });
});
