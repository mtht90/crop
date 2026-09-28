import type { Game } from '../core/game';
import { RESEARCH, RESEARCH_MAP, type ResearchDef } from '../data/research';

export function researchUnlocked(g: Game): boolean {
  return g.s.stats.snTotal > 0;
}

export function researchLevel(g: Game, id: string): number {
  return g.s.research.levels[id] ?? 0;
}

export function researchTime(g: Game, r: ResearchDef): number {
  return r.time(researchLevel(g, r.id)) / g.mods.researchSpeed;
}

export type ResearchStatus = 'done' | 'active' | 'queued' | 'available' | 'locked';

export function researchStatus(g: Game, r: ResearchDef): ResearchStatus {
  const s = g.s.research;
  if (s.current === r.id) return 'active';
  if (s.queue.includes(r.id)) return 'queued';
  if (researchLevel(g, r.id) >= r.max) return 'done';
  if (!prereqsMet(g, r)) return 'locked';
  return 'available';
}

export function prereqsMet(g: Game, r: ResearchDef): boolean {
  for (const req of r.requires) if (researchLevel(g, req) < 1) return false;
  if (r.cond && !r.cond(g)) return false;
  return true;
}

export function queueCapacity(g: Game): number {
  return Math.floor(g.mods.researchQueue);
}

export function startResearch(g: Game, id: string): boolean {
  const r = RESEARCH_MAP.get(id);
  if (!r || !researchUnlocked(g)) return false;
  if (researchStatus(g, r) !== 'available') return false;
  const s = g.s.research;
  if (!s.current) {
    s.current = id;
    s.progress = 0;
    return true;
  }
  if (s.queue.length < queueCapacity(g)) {
    s.queue.push(id);
    return true;
  }
  return false;
}

export function cancelResearch(g: Game, id: string): void {
  const s = g.s.research;
  if (s.current === id) {
    s.current = s.queue.shift() ?? null;
    s.progress = 0;
  } else {
    s.queue = s.queue.filter((q) => q !== id);
  }
}

/** 最も早く終わる研究を自動で選ぶ */
function autoPick(g: Game): void {
  let best: ResearchDef | null = null;
  let bestT = Infinity;
  for (const r of RESEARCH) {
    if (researchStatus(g, r) !== 'available') continue;
    const t = researchTime(g, r);
    if (t < bestT) {
      bestT = t;
      best = r;
    }
  }
  if (best) startResearch(g, best.id);
}

export function tickResearch(g: Game, dt: number): void {
  if (!researchUnlocked(g)) return;
  const s = g.s.research;
  if (!s.current && g.s.auto.research && researchLevel(g, 'r_autores') > 0) autoPick(g);
  let remaining = dt;
  let guard = 0;
  while (s.current && remaining > 0 && guard++ < 1000) {
    const r = RESEARCH_MAP.get(s.current);
    if (!r || researchLevel(g, r.id) >= r.max) {
      s.current = s.queue.shift() ?? null;
      s.progress = 0;
      continue;
    }
    const need = r.time(researchLevel(g, r.id));
    const speed = g.mods.researchSpeed;
    const toFinish = (need - s.progress) / speed;
    if (remaining < toFinish) {
      s.progress += remaining * speed;
      remaining = 0;
      break;
    }
    remaining -= toFinish;
    g.s.research.levels[r.id] = researchLevel(g, r.id) + 1;
    g.s.stats.researchDone++;
    s.current = s.queue.shift() ?? null;
    s.progress = 0;
    g.recalc();
    g.events.emit({ type: 'research-done', id: r.id });
    if (!s.current && g.s.auto.research && researchLevel(g, 'r_autores') > 0) autoPick(g);
  }
}
