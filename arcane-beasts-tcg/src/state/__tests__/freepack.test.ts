import { describe, expect, it } from 'vitest';
import { dayKey } from '../progress';
import { FREE_PACK_GAP_MS, freePackState } from '../store';

describe('無料パック', () => {
  it('2 a day, the second a few hours after the first, both back the next day', () => {
    const t0 = new Date(2026, 10, 6, 9, 0, 0).getTime();
    expect(freePackState({}, t0)).toEqual({ left: 2, ready: true, readyAt: null });
    const after1 = { freePacks: { day: dayKey(new Date(t0)), used: 1, last: t0 } };
    expect(freePackState(after1, t0 + 1000)).toEqual({ left: 1, ready: false, readyAt: t0 + FREE_PACK_GAP_MS });
    expect(freePackState(after1, t0 + FREE_PACK_GAP_MS).ready).toBe(true);
    expect(FREE_PACK_GAP_MS).toBeGreaterThanOrEqual(2 * 3600_000);
    expect(FREE_PACK_GAP_MS).toBeLessThanOrEqual(6 * 3600_000);
    const t2 = t0 + FREE_PACK_GAP_MS + 60_000;
    const after2 = { freePacks: { day: dayKey(new Date(t0)), used: 2, last: t2 } };
    expect(freePackState(after2, t2 + 1000)).toEqual({ left: 0, ready: false, readyAt: null });
    // the next day both are back
    const next = new Date(2026, 10, 7, 0, 0, 5).getTime();
    expect(freePackState(after2, next)).toEqual({ left: 2, ready: true, readyAt: null });
  });
});
