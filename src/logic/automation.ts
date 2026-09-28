import type { Game } from '../core/game';
import { BUILDINGS } from '../data/buildings';
import { autoClickValue, buyAllUpgrades, buyBuilding, buildingVisible, gain } from './economy';
import { doPrestige, galaxyGain, crunchGain, snGain } from './prestige';

export function autoUnlocked(g: Game, key: 'click' | 'buildings' | 'upgrades' | 'sn' | 'galaxy' | 'crunch' | 'research' | 'expeditions'): boolean {
  const s = g.s;
  switch (key) {
    case 'click': return g.mods.autoClick > 0;
    case 'buildings': return (s.sn.shop.sn_autobuy ?? 0) > 0;
    case 'upgrades': return (s.sn.shop.sn_autoupg ?? 0) > 0;
    case 'sn': return (s.galaxy.shop.dm_autosn ?? 0) > 0;
    case 'galaxy': return (s.crunch.shop.ent_autogal ?? 0) > 0;
    case 'crunch': return (s.mv.shop.mv_autocrunch ?? 0) > 0;
    case 'research': return (s.research.levels.r_autores ?? 0) > 0;
    case 'expeditions': return (s.research.levels.r_exp4 ?? 0) > 0;
  }
}

let clickAccum = 0;

export function tickAutoClick(g: Game, dt: number): void {
  if (!g.s.auto.click || !autoUnlocked(g, 'click') || g.mods.noClick) return;
  clickAccum += g.mods.autoClick * dt;
  const n = Math.floor(clickAccum);
  if (n <= 0) return;
  clickAccum -= n;
  const v = autoClickValue(g).mul(n);
  gain(g, v);
  g.s.stats.autoClicks += n;
  g.s.stats.clickEarned = g.s.stats.clickEarned.add(v);
}

/** 施設・アップグレード・転生の自動化 (数百 ms ごとに呼ぶ) */
export function tickAutomation(g: Game): void {
  const s = g.s;
  if (s.auto.upgrades && autoUnlocked(g, 'upgrades')) {
    if (buyAllUpgrades(g) > 0) g.recalcIfDirty();
  }
  if (s.auto.buildings && autoUnlocked(g, 'buildings')) {
    let bought = false;
    for (let i = BUILDINGS.length - 1; i >= 0; i--) {
      if (!buildingVisible(g, i)) continue;
      if (buyBuilding(g, i, -1) > 0) bought = true;
    }
    if (bought) g.recalcIfDirty();
  }
  if (s.auto.crunch && autoUnlocked(g, 'crunch') && crunchGain(g).gte(Math.max(1, s.auto.crunchValue))) {
    doPrestige(g, 'crunch');
    return;
  }
  if (s.auto.galaxy && autoUnlocked(g, 'galaxy') && galaxyGain(g).gte(Math.max(1, s.auto.galaxyValue))) {
    doPrestige(g, 'galaxy');
    return;
  }
  if (s.auto.sn && autoUnlocked(g, 'sn') && !s.challenges.active) {
    const gainNow = snGain(g);
    if (gainNow.lt(1)) return;
    const ok = s.auto.snMode === 'gain'
      ? gainNow.gte(Math.max(1, s.auto.snValue))
      : (g.now() - s.run.start) / 1000 >= s.auto.snValue;
    if (ok) doPrestige(g, 'sn');
  }
}
