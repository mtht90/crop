import { Decimal } from '../core/decimal';
import { fmt } from '../core/format';
import type { Game } from '../core/game';
import { DESTINATIONS, DEST_MAP, RELICS, RARITY_NAMES, type DestinationDef, type Rarity, type RelicDef } from '../data/relics';
import { gain } from './economy';
import { researchLevel } from './research';

export function expeditionsUnlocked(g: Game): boolean {
  return researchLevel(g, 'r_exp0') > 0;
}

export function destinationUnlocked(g: Game, d: DestinationDef): boolean {
  return g.s.stats.expeditionsDone >= d.unlockAt;
}

export function expeditionDuration(g: Game, d: DestinationDef): number {
  return d.seconds / g.mods.expSpeed;
}

export function syncSlots(g: Game): void {
  const want = Math.max(1, Math.floor(g.mods.expSlots));
  const slots = g.s.expeditions.slots;
  while (slots.length < want) slots.push(null);
}

export function launchExpedition(g: Game, slot: number, destId: string): boolean {
  const d = DEST_MAP.get(destId);
  if (!d || !expeditionsUnlocked(g) || !destinationUnlocked(g, d)) return false;
  syncSlots(g);
  const slots = g.s.expeditions.slots;
  if (slot < 0 || slot >= Math.floor(g.mods.expSlots) || slots[slot]) return false;
  const now = g.now();
  slots[slot] = { dest: d.id, start: now, end: now + expeditionDuration(g, d) * 1000 };
  g.s.expeditions.lastDest = d.id;
  return true;
}

export function rollRarity(weights: readonly number[], luck: number, rnd: () => number): Rarity {
  const w = weights.map((x, r) => (r === 0 ? x : x * (1 + luck) ** r));
  const total = w.reduce((a, b) => a + b, 0);
  let x = rnd() * total;
  for (let r = 0; r < w.length; r++) {
    x -= w[r];
    if (x < 0) return r as Rarity;
  }
  return 0;
}

function rollRelic(g: Game, d: DestinationDef): RelicDef {
  const rarity = rollRarity(d.weights, g.mods.expLuck, g.rnd);
  const pool = RELICS.filter((r) => r.rarity === rarity);
  return pool[Math.floor(g.rnd() * pool.length)];
}

function completeExpedition(g: Game, d: DestinationDef): string {
  const found: RelicDef[] = [];
  for (let i = 0; i < d.rolls; i++) {
    const r = rollRelic(g, d);
    g.s.expeditions.relics[r.id] = (g.s.expeditions.relics[r.id] ?? 0) + 1;
    found.push(r);
  }
  const dust = g.sps.mul(d.stardustSec * g.mods.expReward).max(new Decimal(100));
  gain(g, dust);
  g.s.stats.expeditionsDone++;
  const names = found.map((r) => `${r.icon}${r.name}(${RARITY_NAMES[r.rarity]})`).join('、');
  const text = `${d.icon}${d.name}から帰還: ${names} / 星屑 +${fmt(dust)}`;
  const log = g.s.expeditions.log;
  log.unshift(text);
  if (log.length > 30) log.length = 30;
  return text;
}

export function tickExpeditions(g: Game): void {
  if (!expeditionsUnlocked(g)) return;
  syncSlots(g);
  const now = g.now();
  const slots = g.s.expeditions.slots;
  let changed = false;
  for (let i = 0; i < slots.length; i++) {
    const sl = slots[i];
    if (!sl || now < sl.end) continue;
    const d = DEST_MAP.get(sl.dest) ?? DESTINATIONS[0];
    slots[i] = null;
    const text = completeExpedition(g, d);
    changed = true;
    g.events.emit({ type: 'expedition-done', text });
    if (g.s.auto.expeditions && researchLevel(g, 'r_exp4') > 0) launchExpedition(g, i, d.id);
  }
  if (changed) g.markDirty();
}
