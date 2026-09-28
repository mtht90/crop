import { Decimal, D0 } from '../core/decimal';
import type { Game } from '../core/game';
import type { LayerId } from '../core/state';
import { BUILDINGS } from '../data/buildings';

import { BALANCE } from '../data/balance';

export const SN_REQ = BALANCE.sn.req;
export const GALAXY_REQ = BALANCE.galaxy.req;
export const CRUNCH_REQ = BALANCE.crunch.req;
export const MV_REQ = BALANCE.mv.req;

interface GainParams {
  req: Decimal;
  root: number;
  soft?: { at: Decimal; root: number };
}

/** 獲得量の log10 (倍率適用前)。soft 以降は指数の伸びを変える */
function gainLog(x: Decimal, p: GainParams): number {
  const L = x.log10() - p.req.log10();
  if (!p.soft) return L / p.root;
  const Ls = p.soft.at.log10() - p.req.log10();
  if (L <= Ls) return L / p.root;
  return Ls / p.root + (L - Ls) / p.soft.root;
}

function rootGain(x: Decimal, p: GainParams, mult: Decimal): Decimal {
  if (x.lt(p.req)) return D0;
  return Decimal.floor(Decimal.pow(10, gainLog(x, p)).mul(mult));
}

/** rootGain が target 以上になる最小の x */
function rootNeed(target: Decimal, p: GainParams, mult: Decimal): Decimal {
  const want = target.div(mult).max(1).log10();
  let L: number;
  if (!p.soft) {
    L = want * p.root;
  } else {
    const Ls = p.soft.at.log10() - p.req.log10();
    L = want * p.root <= Ls ? want * p.root : Ls + (want - Ls / p.root) * p.soft.root;
  }
  return p.req.mul(Decimal.pow(10, L)).max(p.req);
}

export const LAYER_ORDER: LayerId[] = ['sn', 'galaxy', 'crunch', 'mv'];

export const LAYER_INFO: Record<LayerId, { name: string; currency: string; icon: string; verb: string }> = {
  sn: { name: '超新星', currency: '星核', icon: '💥', verb: '超新星を起こす' },
  galaxy: { name: '銀河崩壊', currency: 'ダークマター', icon: '🌌', verb: '銀河を崩壊させる' },
  crunch: { name: 'ビッグクランチ', currency: 'エントロピー', icon: '🌀', verb: '宇宙を収縮させる' },
  mv: { name: '多元宇宙転生', currency: '次元の欠片', icon: '♾️', verb: '別の宇宙へ渡る' },
};

export function snGain(g: Game): Decimal {
  return rootGain(g.s.run.earned, BALANCE.sn, g.mods.snGain);
}

export function galaxyGain(g: Game): Decimal {
  return rootGain(g.s.sn.coresGalaxy, BALANCE.galaxy, g.mods.dmGain);
}

export function crunchGain(g: Game): Decimal {
  return rootGain(g.s.galaxy.dmCrunch, BALANCE.crunch, g.mods.entGain);
}

export function mvGain(g: Game): Decimal {
  return rootGain(g.s.crunch.entMV, BALANCE.mv, g.mods.shardGain);
}

export function layerGain(g: Game, layer: LayerId): Decimal {
  switch (layer) {
    case 'sn': return snGain(g);
    case 'galaxy': return galaxyGain(g);
    case 'crunch': return crunchGain(g);
    case 'mv': return mvGain(g);
  }
}

/** 次の 1 個を得るのに必要な量 (表示用) */
export function nextGainAt(g: Game, layer: LayerId): { have: Decimal; need: Decimal; label: string } {
  const gainNow = layerGain(g, layer);
  const next = gainNow.add(1);
  switch (layer) {
    case 'sn':
      return { have: g.s.run.earned, need: rootNeed(next, BALANCE.sn, g.mods.snGain), label: 'この周回の獲得星屑' };
    case 'galaxy':
      return { have: g.s.sn.coresGalaxy, need: rootNeed(next, BALANCE.galaxy, g.mods.dmGain), label: 'この銀河で得た星核' };
    case 'crunch':
      return { have: g.s.galaxy.dmCrunch, need: rootNeed(next, BALANCE.crunch, g.mods.entGain), label: 'この宇宙で得たダークマター' };
    case 'mv':
      return { have: g.s.crunch.entMV, need: rootNeed(next, BALANCE.mv, g.mods.shardGain), label: 'この多元宇宙で得たエントロピー' };
  }
}

/** 周回 (超新星相当) のリセット。転生通貨は変化しない */
export function resetRun(g: Game): void {
  const s = g.s;
  const now = g.now();
  g.recalc();
  s.stardust = g.mods.startStardust;
  s.run = { earned: new Decimal(0), clickEarned: new Decimal(0), clicks: 0, start: now };
  s.buildings = new Array(BUILDINGS.length).fill(0);
  const startB = g.mods.startBuildings;
  if (startB > 0) for (let i = 0; i < 10; i++) s.buildings[i] = startB;
  s.upgrades = [];
  g.upgradeSet.clear();
  g.recalc();
}

/** layer 未満の層を全てリセットする */
function resetBelow(g: Game, layer: LayerId): void {
  const s = g.s;
  const now = g.now();
  const idx = LAYER_ORDER.indexOf(layer);
  if (idx >= 3) {
    s.crunch.ent = new Decimal(0);
    s.crunch.entMV = new Decimal(0);
    s.crunch.count = 0;
    s.crunch.start = now;
    if (!(s.mv.shop.mv_keepent > 0)) s.crunch.shop = {};
  }
  if (idx >= 2) {
    s.galaxy.dm = new Decimal(0);
    s.galaxy.dmCrunch = new Decimal(0);
    s.galaxy.count = 0;
    s.galaxy.start = now;
    if (!(s.crunch.shop.ent_keepdm > 0)) s.galaxy.shop = {};
  }
  if (idx >= 1) {
    s.sn.cores = new Decimal(0);
    s.sn.coresGalaxy = new Decimal(0);
    s.sn.count = 0;
    s.challenges.active = null;
    if (!(s.galaxy.shop.dm_keepsn > 0)) s.sn.shop = {};
  }
  g.recalc();
  const m = g.mods;
  if (idx >= 3 && m.startEnt.gt(0)) {
    s.crunch.ent = s.crunch.ent.add(m.startEnt);
    s.crunch.entMV = s.crunch.entMV.add(m.startEnt);
  }
  if (idx >= 2 && m.startDm.gt(0)) {
    s.galaxy.dm = s.galaxy.dm.add(m.startDm);
    s.galaxy.dmCrunch = s.galaxy.dmCrunch.add(m.startDm);
  }
  if (idx >= 1 && m.startCores.gt(0)) {
    s.sn.cores = s.sn.cores.add(m.startCores);
    s.sn.coresGalaxy = s.sn.coresGalaxy.add(m.startCores);
  }
  resetRun(g);
}

export function canPrestige(g: Game, layer: LayerId): boolean {
  return layerGain(g, layer).gte(1);
}

export function doPrestige(g: Game, layer: LayerId): boolean {
  const gainAmt = layerGain(g, layer);
  if (gainAmt.lt(1)) return false;
  const s = g.s;
  const now = g.now();
  switch (layer) {
    case 'sn': {
      s.sn.cores = s.sn.cores.add(gainAmt);
      s.sn.coresGalaxy = s.sn.coresGalaxy.add(gainAmt);
      s.sn.coresTotal = s.sn.coresTotal.add(gainAmt);
      s.sn.lastGain = gainAmt;
      s.sn.count++;
      s.stats.snTotal++;
      s.sn.bestTime = Math.min(s.sn.bestTime, (now - s.run.start) / 1000);
      if (s.run.earned.gt(s.stats.bestRunEarned)) s.stats.bestRunEarned = s.run.earned;
      s.challenges.active = null;
      resetRun(g);
      break;
    }
    case 'galaxy': {
      s.galaxy.dm = s.galaxy.dm.add(gainAmt);
      s.galaxy.dmCrunch = s.galaxy.dmCrunch.add(gainAmt);
      s.galaxy.dmTotal = s.galaxy.dmTotal.add(gainAmt);
      s.galaxy.count++;
      s.stats.galaxyTotal++;
      s.galaxy.bestTime = Math.min(s.galaxy.bestTime, (now - s.galaxy.start) / 1000);
      s.galaxy.start = now;
      resetBelow(g, 'galaxy');
      break;
    }
    case 'crunch': {
      s.crunch.ent = s.crunch.ent.add(gainAmt);
      s.crunch.entMV = s.crunch.entMV.add(gainAmt);
      s.crunch.entTotal = s.crunch.entTotal.add(gainAmt);
      s.crunch.count++;
      s.stats.crunchTotal++;
      s.crunch.bestTime = Math.min(s.crunch.bestTime, (now - s.crunch.start) / 1000);
      s.crunch.start = now;
      resetBelow(g, 'crunch');
      break;
    }
    case 'mv': {
      s.mv.shards = s.mv.shards.add(gainAmt);
      s.mv.shardsTotal = s.mv.shardsTotal.add(gainAmt);
      s.mv.count++;
      s.stats.mvTotal++;
      s.mv.bestTime = Math.min(s.mv.bestTime, (now - s.mv.start) / 1000);
      s.mv.start = now;
      resetBelow(g, 'mv');
      break;
    }
  }
  g.events.emit({ type: 'prestige', layer });
  return true;
}

export function layerUnlocked(g: Game, layer: LayerId): boolean {
  const s = g.s;
  switch (layer) {
    case 'sn': return s.stats.snTotal > 0 || s.run.earned.gte(SN_REQ.div(1000));
    case 'galaxy': return s.stats.galaxyTotal > 0 || s.sn.coresGalaxy.gte(GALAXY_REQ.div(100));
    case 'crunch': return s.stats.crunchTotal > 0 || s.galaxy.dmCrunch.gte(CRUNCH_REQ.div(10));
    case 'mv': return s.stats.mvTotal > 0 || s.crunch.entMV.gte(MV_REQ.div(10));
  }
}

export function layerCurrency(g: Game, layer: LayerId): Decimal {
  switch (layer) {
    case 'sn': return g.s.sn.cores;
    case 'galaxy': return g.s.galaxy.dm;
    case 'crunch': return g.s.crunch.ent;
    case 'mv': return g.s.mv.shards;
  }
}

export function layerShop(g: Game, layer: LayerId): Record<string, number> {
  switch (layer) {
    case 'sn': return g.s.sn.shop;
    case 'galaxy': return g.s.galaxy.shop;
    case 'crunch': return g.s.crunch.shop;
    case 'mv': return g.s.mv.shop;
  }
}

function setLayerCurrency(g: Game, layer: LayerId, v: Decimal): void {
  switch (layer) {
    case 'sn': g.s.sn.cores = v; break;
    case 'galaxy': g.s.galaxy.dm = v; break;
    case 'crunch': g.s.crunch.ent = v; break;
    case 'mv': g.s.mv.shards = v; break;
  }
}

export function buyShopItem(g: Game, layer: LayerId, id: string, cost: Decimal, max: number): boolean {
  const shop = layerShop(g, layer);
  const lvl = shop[id] ?? 0;
  if (lvl >= max) return false;
  const cur = layerCurrency(g, layer);
  if (cur.lt(cost)) return false;
  setLayerCurrency(g, layer, cur.sub(cost));
  shop[id] = lvl + 1;
  g.markDirty();
  return true;
}
