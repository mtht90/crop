// Rough progression sim: an idle player who checks in every 30 min, auto-trains, pulls gacha with all gems,
// and prestiges when it pays off. Prints when each milestone is reached.
import { newSave, heroStats, stageLabel, fmt, soulsFor } from '../src/game/core.ts';
import * as L from '../src/game/logic.ts';

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const s = newSave(0);
const HOURS = Number(process.argv[2] ?? 72);
const CHECK = Number(process.env.CHECK ?? 0.5); // hours between check-ins
const usePrestige = process.argv[3] !== 'noprestige';
let t = 0; const marks = new Map<number, number>();
let lastDay = -1; let lastP = 0;
while (t < HOURS * 3600) {
  L.simulateOffline(s, CHECK * 3600, rnd);
  t += CHECK * 3600;
  const now = t * 1000;
  L.claimChest(s, now);
  const day = Math.floor(t / 86400);
  if (day !== lastDay) { lastDay = day; s.gems += 300; }
  while (L.claimGuide(s)) {}
  for (const b of ['char', 'char', 'equip', 'skill'] as const) {
    while (s.gems >= 1350 && b === 'char') L.pull(s, 'char', 10, rnd);
    if (s.gems >= 900) L.pull(s, b, 10, rnd);
  }
  L.openOrbs(s, rnd);
  L.autoGuardians(s);
  s.active = L.bestCharFor(s);
  for (const area of [1,2,3,4,5,6,8,10,12,13,15]) {
    const g = (area - 1) * 10;
    if (s.stats.bestG >= g && !marks.has(area)) { marks.set(area, t / 3600); }
  }
  if (usePrestige && soulsFor(s.maxG) >= Math.max(4, s.souls * 0.5) && s.farming && (t/3600 - lastP) > 3) {
    const gain = L.doPrestige(s); lastP = t/3600;
    console.log(`  [${(t/3600).toFixed(1)}h] prestige +${gain} souls (total ${s.souls})`);
  }
  if (process.env.V || (Math.round(t / 3600) % 6 === 0 && (t / 3600) % 6 < CHECK)) {
    const h = heroStats(s);
    console.log(`${(t/3600).toFixed(1)}h stage ${stageLabel(s.g)} best ${stageLabel(s.stats.bestG)} power ${fmt(h.power)} atk ${fmt(h.atk)} hp ${fmt(h.hp)} ${h.ally.name}★${h.ally.rarity}+${s.chars[h.ally.id].stars} train atk${s.train.atk} hp${s.train.hp} cr${s.train.crit} cd${s.train.critDmg} sp${s.train.speed} guards ${s.guardianSlots.filter(Boolean).length} souls ${s.souls} farming ${s.farming} coins ${fmt(s.coins)}`);
  }
}
console.log('area reached at hour:', [...marks].map(([a, h]) => `${a}:${h.toFixed(1)}h`).join('  '));
