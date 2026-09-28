import { test } from 'vitest';
import { Game } from '../src/core/game';
import { defaultState } from '../src/core/state';
import { BUILDINGS } from '../src/data/buildings';
import { buildingCost, buyAllUpgrades, buyBuilding, buildingVisible, clickValue, gain, maxAffordable } from '../src/logic/economy';
import { doPrestige, snGain, galaxyGain, crunchGain, mvGain, buyShopItem, layerShop, layerCurrency } from '../src/logic/prestige';
import { SHOP_ITEMS } from '../src/data/shops';
import { startResearch } from '../src/logic/research';
import { RESEARCH } from '../src/data/research';
import { fmt, fmtTime } from '../src/core/format';

/**
 * バランス確認用の簡易ボット。
 * 効率の良い施設を買い、アップグレード・研究・ショップは買えるだけ買い、条件を満たしたら転生する。
 *   SIM_DAYS=60 npx vitest run --config vitest.sim.config.ts
 */
test('balance simulation', () => {
  let t = 0;
  const g = new Game(defaultState(0), () => t, () => 0.5);
  const DAYS = Number(process.env.SIM_DAYS ?? 30);
  const CPS = Number(process.env.SIM_CPS ?? 2);
  const WALL = Number(process.env.SIM_WALL ?? 500) * 1000;
  const end = DAYS * 86400;
  const lines: string[] = [];
  const mark = (label: string) => lines.push(`${fmtTime(t / 1000)}\t${label}`);
  let nextReport = 3600;
  const wall = performance.now();

  while (t / 1000 < end) {
    if (performance.now() - wall > WALL) { mark('WALL TIMEOUT'); break; }
    const sec = t / 1000;
    const dt = sec < 3600 ? 2 : sec < 86400 ? 10 : sec < 7 * 86400 ? 30 : sec < 30 * 86400 ? 120 : 300;
    t += dt * 1000;
    g.s.lastTick = t;
    g.step(dt);
    if (CPS > 0) {
      const v = clickValue(g).mul(CPS * dt);
      gain(g, v);
      g.s.run.clicks += CPS * dt;
      g.s.stats.clicks += CPS * dt;
    }
    g.recalcIfDirty();

    buyAllUpgrades(g);
    for (let k = 0; k < 12; k++) {
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < BUILDINGS.length; i++) {
        if (!buildingVisible(g, i)) continue;
        const cost = buildingCost(g, i, 1);
        const per = g.s.buildings[i] > 0 ? g.bldSps[i].div(g.s.buildings[i]) : BUILDINGS[i].baseProd.mul(g.mods.building[i]).mul(g.mods.global);
        if (per.lte(0)) continue;
        const score = cost.div(per).toNumber() + cost.div(g.sps.add(1)).toNumber();
        if (score < bestScore) { bestScore = score; best = i; }
      }
      if (best < 0 || buildingCost(g, best, 1).gt(g.s.stardust)) break;
      buyBuilding(g, best, Math.max(1, Math.floor(maxAffordable(g, best) / 3)));
      g.recalcIfDirty();
    }
    for (const r of RESEARCH) startResearch(g, r.id);
    for (const layer of ['mv', 'crunch', 'galaxy', 'sn'] as const) {
      for (let k = 0; k < 20; k++) {
        const items = SHOP_ITEMS.filter((it) => it.layer === layer && (layerShop(g, layer)[it.id] ?? 0) < it.max)
          .map((it) => ({ it, cost: it.cost(layerShop(g, layer)[it.id] ?? 0) }))
          .sort((a, b) => a.cost.cmp(b.cost));
        const first = items[0];
        if (!first || layerCurrency(g, layer).lt(first.cost)) break;
        buyShopItem(g, layer, first.it.id, first.cost, first.it.max);
      }
    }
    g.recalcIfDirty();

    const mg = mvGain(g);
    if (mg.gte(1) && mg.gte(g.s.mv.shardsTotal.mul(0.5))) { doPrestige(g, 'mv'); mark(`MV #${g.s.stats.mvTotal} +${fmt(mg)}`); continue; }
    const cg = crunchGain(g);
    if (cg.gte(1) && cg.gte(g.s.crunch.entMV.mul(0.5))) { doPrestige(g, 'crunch'); mark(`CRUNCH #${g.s.stats.crunchTotal} +${fmt(cg)}`); continue; }
    const gg = galaxyGain(g);
    if (gg.gte(1) && gg.gte(g.s.galaxy.dmCrunch.mul(0.5))) { doPrestige(g, 'galaxy'); mark(`GALAXY #${g.s.stats.galaxyTotal} +${fmt(gg)} DM`); continue; }
    const sg = snGain(g);
    const runSec = (t - g.s.run.start) / 1000;
    if (sg.gte(1) && (sg.gte(g.s.sn.coresGalaxy) || (runSec > 4 * 3600 && sg.gte(g.s.sn.coresGalaxy.mul(0.2))))) {
      if (g.s.stats.snTotal < 5) mark(`SN #${g.s.stats.snTotal + 1} +${fmt(sg)} cores (run ${fmtTime(runSec)})`);
      doPrestige(g, 'sn');
      continue;
    }
    if (sec >= nextReport) {
      nextReport = nextReport < 86400 ? nextReport + 3600 * 6 : nextReport + 86400 * 5;
      mark(`sps=${fmt(g.sps)} cores=${fmt(g.s.sn.coresGalaxy)} dm=${fmt(g.s.galaxy.dmCrunch)} ent=${fmt(g.s.crunch.entMV)} sh=${fmt(g.s.mv.shardsTotal)} SN=${g.s.stats.snTotal} GA=${g.s.stats.galaxyTotal} ach=${g.s.achievements.length} res=${g.s.stats.researchDone} relics=${Object.keys(g.s.expeditions.relics).length}`);
    }
  }
  console.log(lines.filter((l, i, arr) => !/GALAXY #\d*[1-9] /.test(l) || i === arr.length - 1).join('\n'));
}, 3_600_000);
