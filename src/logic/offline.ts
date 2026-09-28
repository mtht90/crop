import { Decimal } from '../core/decimal';
import type { Game } from '../core/game';
import { gain } from './economy';
import { tickResearch } from './research';

export interface OfflineReport {
  seconds: number;
  effectiveSeconds: number;
  efficiency: number;
  gained: Decimal;
  researchDone: number;
}

/** 前回の記録から一定以上時間が経っていれば放置報酬を与える */
export function applyOffline(g: Game, minSeconds = 60): OfflineReport | null {
  const now = g.now();
  const seconds = (now - g.s.lastTick) / 1000;
  if (!(seconds >= minSeconds)) return null;
  g.recalc();
  const m = g.mods;
  const efficiency = Math.min(1, m.offlineEff);
  const effectiveSeconds = Math.min(seconds, m.offlineCapH * 3600);
  const gained = g.sps.mul(efficiency * effectiveSeconds);
  gain(g, gained);
  const before = g.s.stats.researchDone;
  tickResearch(g, seconds);
  g.s.stats.offlineTime += seconds;
  g.s.stats.offlineReturns++;
  g.s.lastTick = now;
  // 放置中に切れたバフは消える
  g.s.buffs = g.s.buffs.filter((b) => b.end > now);
  if (g.s.nextComet < now) g.s.nextComet = now + 30_000;
  g.recalc();
  return { seconds, effectiveSeconds, efficiency, gained, researchDone: g.s.stats.researchDone - before };
}
