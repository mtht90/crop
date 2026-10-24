import { describe, expect, it } from 'vitest';
import { addToCooler, completion, registerCatch, release, sellFromCooler } from '../src/core/progress';
import { newSave, type CatchRecord } from '../src/core/save';
import { SPECIES, SPECIES_BY_ID } from '../src/data/species';
import type { FishInstance } from '../src/sim/individual';

function fish(speciesId: string, over: Partial<FishInstance> = {}): FishInstance {
  return {
    uid: Math.random().toString(36),
    speciesId,
    length: 30,
    weight: 500,
    iv: { power: 10, stamina: 10, speed: 10, build: 10 },
    grade: 'C',
    colorId: null,
    patternId: null,
    ...over,
  };
}

function rec(f: FishInstance): CatchRecord {
  return {
    day: 1,
    clock: '05:00',
    time: 'dawn',
    weather: 'sunny',
    season: 'spring',
    structure: 'weeds',
    layer: 'bottom',
    rod: 'rod_beginner',
    reel: 'reel_small',
    line: 'nylon6',
    lure: 'bait_worm',
    length: f.length,
    weight: f.weight,
    grade: f.grade,
    colorId: f.colorId,
    patternId: f.patternId,
  };
}

describe('図鑑と経済', () => {
  it('初回は新種、記録更新・色違いを判定する', () => {
    const save = newSave();
    const a = fish('koi');
    const r1 = registerCatch(save, a, SPECIES_BY_ID.koi, rec(a));
    expect(r1.newSpecies).toBe(true);
    const b = fish('koi', { length: 50, weight: 2000, grade: 'A', colorId: 'ogon' });
    const r2 = registerCatch(save, b, SPECIES_BY_ID.koi, rec(b));
    expect(r2.newSpecies).toBe(false);
    expect(r2.bestLength && r2.bestWeight && r2.bestGrade && r2.newColor).toBe(true);
    expect(save.dex.koi.count).toBe(2);
    expect(save.dex.koi.colors).toEqual(['normal', 'ogon']);
  });

  it('節目で達成報酬が入る（重複しない）', () => {
    const save = newSave();
    const money0 = save.money;
    for (const s of SPECIES.slice(0, 5)) {
      const f = fish(s.id);
      registerCatch(save, f, s, rec(f));
    }
    expect(save.money).toBe(money0 + 2000);
    const f = fish(SPECIES[0].id);
    registerCatch(save, f, SPECIES[0], rec(f));
    expect(save.money).toBe(money0 + 2000);
    expect(completion(save).species).toBe(5);
  });

  it('クーラーは容量まで、売却とリリースでお金が増える', () => {
    const save = newSave();
    for (let i = 0; i < 8; i++) {
      const f = fish('bluegill');
      expect(addToCooler(save, f, rec(f))).toBe(true);
    }
    const extra = fish('bluegill');
    expect(addToCooler(save, extra, rec(extra))).toBe(false);
    const m0 = save.money;
    const total = sellFromCooler(save, save.cooler.map((f) => f.uid));
    expect(total).toBeGreaterThan(0);
    expect(save.money).toBe(m0 + total);
    expect(save.cooler.length).toBe(0);
    expect(release(save, fish('koi'))).toBeGreaterThan(0);
  });
});
