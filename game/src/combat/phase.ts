import type { ActionDef } from './types';

export type Stage = 'windup' | 'strike' | 'recover';

export interface PhaseInfo {
  stage: Stage;
  /** 0..1 progress within the current stage. */
  t: number;
  firstActive: number;
  lastActive: number;
}

const cache = new WeakMap<ActionDef, [number, number]>();

/** Derives anticipation / active / recovery boundaries from hit and spawn timing. */
export function activeRange(def: ActionDef): [number, number] {
  const hit = cache.get(def);
  if (hit) return hit;
  let first = Infinity;
  let last = 0;
  for (const h of def.hits ?? []) {
    first = Math.min(first, h.start);
    last = Math.max(last, h.end);
  }
  for (const s of def.spawns ?? []) {
    first = Math.min(first, s.frame);
    last = Math.max(last, s.frame + 2);
  }
  if (!isFinite(first)) {
    first = Math.floor(def.total * 0.3);
    last = Math.floor(def.total * 0.6);
  }
  const r: [number, number] = [first, Math.min(def.total, Math.max(last, first + 1))];
  cache.set(def, r);
  return r;
}

export function phaseOf(def: ActionDef, frame: number): PhaseInfo {
  const [a, b] = activeRange(def);
  if (frame < a) return { stage: 'windup', t: a > 0 ? frame / a : 1, firstActive: a, lastActive: b };
  if (frame < b) return { stage: 'strike', t: (frame - a) / Math.max(1, b - a), firstActive: a, lastActive: b };
  return { stage: 'recover', t: Math.min(1, (frame - b) / Math.max(1, def.total - b)), firstActive: a, lastActive: b };
}

/** Maps an action frame to normalized clip time using the clip's markers (the speed curve). */
export function clipTime(def: ActionDef, frame: number, windup = 0.3, strike = 0.5) {
  const p = phaseOf(def, frame);
  if (p.stage === 'windup') return p.t * windup;
  if (p.stage === 'strike') return windup + (strike - windup) * p.t;
  return strike + (1 - strike) * p.t;
}
