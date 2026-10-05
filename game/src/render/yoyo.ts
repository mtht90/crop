import type { Fighter } from '../combat/fighter';

export type YoyoPose =
  | { mode: 'hand' }
  | { mode: 'line'; dist: number }
  | { mode: 'orbit'; angle: number; radius: number; height: number };

const RETURN_FRAMES = 8;

/**
 * Where Lala's yo-yo is right now, derived from the same hit windows the
 * simulation uses (so the visual matches the hitbox).
 */
export function yoyoPose(f: Fighter): YoyoPose {
  const a = f.state === 'action' ? f.action : null;
  if (!a) return { mode: 'hand' };
  const fr = a.frame;
  const anim = a.def.anim;
  if (anim === 'aroundWorld' && fr >= 5 && fr < 24) return { mode: 'orbit', angle: ((fr - 5) / 19) * Math.PI * 2.2, radius: 2.5, height: 0.9 };
  if (anim === 'loopUp' && fr < 22) return { mode: 'orbit', angle: (fr / 22) * Math.PI * 4, radius: 1.1, height: 2.0 };
  const reach = (a.def.hits ?? []).filter((h) => h.reach);
  if (!reach.length) return { mode: 'hand' };
  for (const h of reach) {
    if (fr >= h.start && fr < h.end) {
      const u = (fr - h.start) / Math.max(1, h.end - h.start - 1);
      return { mode: 'line', dist: h.reach![0] + (h.reach![1] - h.reach![0]) * Math.min(1, u) };
    }
  }
  const last = reach.reduce((m, h) => (h.end > m.end ? h : m));
  const out = last.reach![1];
  if (fr >= last.end && out > 1.2 && fr < last.end + RETURN_FRAMES) {
    return { mode: 'line', dist: out + (0.9 - out) * ((fr - last.end) / RETURN_FRAMES) };
  }
  return { mode: 'hand' };
}

/** Yo-yo size multiplier (the ult grows it). */
export function yoyoScale(f: Fighter) {
  const a = f.state === 'action' ? f.action : null;
  if (a?.def.anim !== 'giantYoyo') return 1;
  const fr = a.frame;
  if (fr < 6) return 1;
  if (fr < 20) return 1 + 3 * ((fr - 6) / 14);
  if (fr < 58) return 4;
  return Math.max(1, 4 - 3 * ((fr - 58) / 10));
}
