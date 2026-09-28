import { Decimal } from '../core/decimal';
import { fmt, fmtTime } from '../core/format';
import type { Game } from '../core/game';
import { gain } from './economy';

export const COMET_LIFETIME = 13; // 秒

export function scheduleNextComet(g: Game): void {
  const base = 60 + g.rnd() * 120;
  g.s.nextComet = g.now() + (base / g.mods.cometFreq) * 1000;
}

function addBuff(g: Game, id: string, seconds: number, mult: number): void {
  const end = g.now() + seconds * 1000;
  const existing = g.s.buffs.find((b) => b.id === id);
  if (existing) {
    existing.end = Math.max(existing.end, end);
    existing.mult = Math.max(existing.mult, mult);
  } else {
    g.s.buffs.push({ id, end, mult });
  }
}

export const BUFF_INFO: Record<string, { name: string; icon: string; kind: 'prod' | 'click' | 'cost' }> = {
  rush: { name: 'スターラッシュ', icon: '🌟', kind: 'prod' },
  fever: { name: '超新星フィーバー', icon: '🔥', kind: 'click' },
  lens: { name: '重力レンズ', icon: '🔍', kind: 'cost' },
};

/** 彗星をつかまえたときの効果。表示用テキストを返す */
export function catchComet(g: Game): string {
  const m = g.mods;
  g.s.stats.comets++;
  const r = g.rnd() * 100;
  let text: string;
  if (r < 45) {
    const sec = 77 * m.cometDur;
    const mult = 7 * m.cometPower;
    addBuff(g, 'rush', sec, mult);
    text = `🌟 スターラッシュ! ${fmtTime(sec)} の間 生産 ×${mult.toFixed(1)}`;
  } else if (r < 80) {
    const amount = Decimal.min(g.s.stardust.mul(0.15), g.sps.mul(900)).add(g.sps.mul(15)).add(13).mul(m.cometPower);
    gain(g, amount);
    text = `☄️ 流星雨! 星屑 +${fmt(amount)}`;
  } else if (r < 92) {
    const sec = 13 * m.cometDur;
    const mult = 777 * m.cometPower;
    addBuff(g, 'fever', sec, mult);
    text = `🔥 超新星フィーバー! ${fmtTime(sec)} の間 クリック ×${fmt(mult)}`;
  } else if (r < 97) {
    const sec = 30 * m.cometDur;
    addBuff(g, 'lens', sec, 0.5);
    text = `🔍 重力レンズ! ${fmtTime(sec)} の間 施設が半額`;
  } else {
    const amount = g.sps.mul(600 * m.cometPower).add(100);
    gain(g, amount);
    text = `⏩ 時間跳躍! 10分ぶんの生産 +${fmt(amount)}`;
  }
  g.markDirty();
  return text;
}

export function tickBuffs(g: Game): void {
  const now = g.now();
  const before = g.s.buffs.length;
  g.s.buffs = g.s.buffs.filter((b) => b.end > now);
  if (g.s.buffs.length !== before) g.markDirty();
}

export function tickComets(g: Game): void {
  if (g.now() < g.s.nextComet) return;
  scheduleNextComet(g);
  if (g.visible) g.events.emit({ type: 'comet-spawn' });
}
