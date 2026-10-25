import { describe, expect, it } from 'vitest';
import { SPECIES, SPECIES_BY_ID } from '../src/data/species';
import { LINE_BY_ID, REEL_BY_ID, ROD_BY_ID, LB_TO_KG } from '../src/data/tackle';
import type { Conditions } from '../src/data/types';
import { GameClock } from '../src/sim/environment';
import { Fight, type FightOutcome } from '../src/sim/fight';
import { generateFish, gradeOf, priceOf, type IVs } from '../src/sim/individual';
import { Rng } from '../src/sim/rng';
import { biteChancePerSecond, pickSpecies, speciesWeight } from '../src/sim/spawn';

const baseCond: Conditions = {
  time: 'dawn',
  weather: 'cloudy',
  season: 'spring',
  layer: 'bottom',
  structure: 'weeds',
  lure: 'baitWorm',
  motion: 'still',
};

/** 上手なプレイヤー：ドラグはライン強度の7割、テンションがドラグに近づいたら巻くのをやめ、魚と逆に竿を倒す */
function simulate(
  speciesId: string,
  lengthCm: number,
  gear: { rod: string; reel: string; line: string },
  seed: number,
  skill = 1,
  oppose = skill > 0.5,
): { outcome: FightOutcome | null; time: number } {
  const s = SPECIES_BY_ID[speciesId];
  const iv: IVs = { power: 16, stamina: 16, speed: 16, build: 16 };
  const weightKg = (s.k * lengthCm ** 3) / 100 / 1000;
  const rod = ROD_BY_ID[gear.rod];
  const reel = REEL_BY_ID[gear.reel];
  const line = LINE_BY_ID[gear.line];
  const rng = new Rng(seed);
  const f = new Fight(
    { species: s, weightKg, iv, rod, reel, line, drag: line.lb * LB_TO_KG * 0.7, distance: 25, waterDepth: 4, depth: 2 },
    rng,
  );
  const dt = 1 / 60;
  // ポンピング：張力に余裕があれば竿を立てて寄せ、立てきったら倒しながら巻く。
  // 走られたら竿を寝かせて耐え、ジャンプでは竿を下げ、横走りには逆へ倒す
  let lift = 0.4;
  let pumpingUp = true;
  while (!f.outcome && f.elapsed < 600) {
    const ok = f.tension < f.drag * 0.75;
    if (f.behavior === 'jump' || f.dragSlipping) lift = Math.max(0.15, lift - 2 * dt);
    else if (pumpingUp) {
      if (ok) lift = Math.min(1, lift + 0.7 * dt);
      if (lift >= 0.95 || !ok) pumpingUp = false;
    } else {
      lift = Math.max(0.15, lift - 0.32 * dt);
      if (lift <= 0.2) pumpingUp = true;
    }
    const reeling = skill > 0.5 ? (!pumpingUp && f.tension < f.drag * 0.9) || f.slack > 0.1 : f.tension < f.drag * 1.2;
    f.step({ reeling, rodSide: oppose ? -Math.sign(f.side) : 0, rodLift: lift }, dt);
    if (f.outcome === 'landed') break;
  }
  return { outcome: f.outcome, time: f.elapsed };
}

function rate(speciesId: string, len: number, gear: { rod: string; reel: string; line: string }, n = 60) {
  let landed = 0;
  let time = 0;
  const outcomes: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = simulate(speciesId, len, gear, 1000 + i);
    outcomes[r.outcome ?? 'timeout'] = (outcomes[r.outcome ?? 'timeout'] ?? 0) + 1;
    if (r.outcome === 'landed') {
      landed++;
      time += r.time;
    }
  }
  return { rate: landed / n, avgTime: landed ? time / landed : 0, outcomes };
}

const beginner = { rod: 'rod_beginner', reel: 'reel_small', line: 'nylon6' };
const carpGear = { rod: 'rod_carp', reel: 'reel_large', line: 'fluoro16' };
const monster = { rod: 'rod_monster', reel: 'reel_big', line: 'pe8' };

describe('ファイト', () => {
  it('上手に操作すれば初期装備で平均的なブラックバスは7割以上獲れ、10〜75秒で決着する', () => {
    const r = rate('largemouth', 35, beginner);
    console.log('bass35 beginner', r);
    expect(r.rate).toBeGreaterThan(0.7);
    expect(r.avgTime).toBeGreaterThan(8);
    expect(r.avgTime).toBeLessThan(75);
  });

  it('魚と逆へ竿を倒すと早く弱り、倒さないと長引いてバラしやすい', () => {
    let tOpp = 0;
    let tNone = 0;
    let lostNone = 0;
    for (let i = 0; i < 30; i++) {
      const a = simulate('largemouth', 50, beginner, 2000 + i, 1, true);
      const b = simulate('largemouth', 50, beginner, 2000 + i, 1, false);
      tOpp += a.time;
      tNone += b.time;
      if (b.outcome !== 'landed') lostNone++;
    }
    expect(tNone).toBeGreaterThan(tOpp * 1.25);
    expect(lostNone).toBeGreaterThan(0);
  });

  it('大物ほどファイトが長い', () => {
    const small = rate('largemouth', 25, beginner);
    const big = rate('koi', 80, carpGear);
    expect(big.avgTime).toBeGreaterThan(small.avgTime * 1.4);
  });

  it('初期装備で80cmのコイは厳しいが、鯉用タックルなら獲れる', () => {
    const weak = rate('koi', 80, beginner);
    const strong = rate('koi', 80, carpGear);
    console.log('koi80', weak, strong);
    expect(weak.rate).toBeLessThan(0.5);
    expect(strong.rate).toBeGreaterThan(0.75);
  });

  it('伝説の魚は専用装備でないと獲れない', () => {
    const weak = rate('nushi', 230, carpGear, 30);
    const strong = rate('nushi', 230, monster, 30);
    console.log('nushi', weak, strong);
    expect(weak.rate).toBeLessThan(0.1);
    expect(strong.rate).toBeGreaterThan(0.4);
    expect(strong.avgTime).toBeGreaterThan(60);
  });

  it('ドラグを締めすぎると切られる', () => {
    const s = SPECIES_BY_ID.koi;
    const line = LINE_BY_ID.nylon6;
    let breaks = 0;
    for (let i = 0; i < 30; i++) {
      const f = new Fight(
        {
          species: s,
          weightKg: 4,
          iv: { power: 16, stamina: 16, speed: 16, build: 16 },
          rod: ROD_BY_ID.rod_beginner,
          reel: REEL_BY_ID.reel_mid,
          line,
          drag: 6,
          distance: 20,
          waterDepth: 3,
          depth: 2,
        },
        new Rng(i),
      );
      while (!f.outcome && f.elapsed < 300) f.step({ reeling: true, rodSide: 0, rodLift: 0.4 }, 1 / 60);
      if (f.outcome === 'lineBreak') breaks++;
    }
    expect(breaks).toBeGreaterThan(25);
  });

  it('ジャンプ中に竿を立てたままだとバレやすい', () => {
    const run = (lowerOnJump: boolean) => {
      let out = 0;
      for (let i = 0; i < 40; i++) {
        const f = new Fight(
          { species: SPECIES_BY_ID.largemouth, weightKg: 0.8, iv: { power: 16, stamina: 16, speed: 16, build: 16 }, rod: ROD_BY_ID.rod_beginner, reel: REEL_BY_ID.reel_small, line: LINE_BY_ID.nylon6, drag: 1.9, distance: 20, waterDepth: 3, depth: 1 },
          new Rng(500 + i),
        );
        while (!f.outcome && f.elapsed < 120) f.step({ reeling: f.tension < 1.4, rodSide: 0, rodLift: lowerOnJump && f.behavior === 'jump' ? 0.2 : 0.85 }, 1 / 60);
        if (f.outcome === 'hookOut') out++;
      }
      return out;
    };
    expect(run(false)).toBeGreaterThan(run(true) + 5);
  });

  it('ずっとたるませているとフックアウトする', () => {
    const s = SPECIES_BY_ID.largemouth;
    const f = new Fight(
      {
        species: s,
        weightKg: 0.8,
        iv: { power: 16, stamina: 16, speed: 16, build: 16 },
        rod: ROD_BY_ID.rod_beginner,
        reel: REEL_BY_ID.reel_small,
        line: LINE_BY_ID.nylon6,
        drag: 2,
        distance: 20,
        waterDepth: 3,
        depth: 1,
      },
      new Rng(3),
    );
    f.lineOut = f.distance + 3;
    while (!f.outcome && f.elapsed < 30) f.step({ reeling: false, rodSide: 0, rodLift: 0.4 }, 1 / 60);
    expect(f.outcome).toBe('hookOut');
  });
});

describe('出現', () => {
  it('ルアー相性が無い魚は出ない', () => {
    const c = { ...baseCond, lure: 'baitDough' as const };
    expect(speciesWeight(SPECIES_BY_ID.largemouth, c)).toBe(0);
    expect(speciesWeight(SPECIES_BY_ID.koi, c)).toBeGreaterThan(0);
  });

  it('アタリは数秒〜数十秒に1回の頻度', () => {
    const lake = SPECIES.filter((s) => s.spot === 'lake');
    const p = biteChancePerSecond(lake, baseCond, { activity: 1.2, lineVisibility: 1, spook: 0 });
    expect(p).toBeGreaterThan(0.03);
    expect(p).toBeLessThan(0.35);
  });

  it('伝説の魚は嵐の夜でも稀にしか出ない', () => {
    const lake = SPECIES.filter((s) => s.spot === 'lake');
    const rng = new Rng(7);
    const stormy: Conditions = { ...baseCond, time: 'night', weather: 'storm', layer: 'bottom', structure: 'open', lure: 'baitLive', motion: 'slow' };
    const calm: Conditions = { ...stormy, time: 'day', weather: 'sunny' };
    let stormHits = 0;
    let calmHits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      if (pickSpecies(lake, stormy, rng)?.id === 'nushi') stormHits++;
      if (pickSpecies(lake, calm, rng)?.id === 'nushi') calmHits++;
    }
    console.log('nushi share storm/calm', stormHits / n, calmHits / n);
    expect(stormHits / n).toBeGreaterThan(0.002);
    expect(stormHits / n).toBeLessThan(0.05);
    expect(calmHits).toBeLessThan(stormHits / 10);
  });

  it('各魚種に出現しうる条件がある', () => {
    for (const s of SPECIES) {
      const anyLure = Object.keys(s.lures).length > 0;
      expect(anyLure, s.id).toBe(true);
    }
  });
});

describe('個体', () => {
  it('Sグレードは約1%、サイズは範囲内', () => {
    const rng = new Rng(11);
    const s = SPECIES_BY_ID.largemouth;
    let sCount = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const f = generateFish(s, baseCond, rng);
      expect(f.length).toBeGreaterThanOrEqual(s.length.min);
      expect(f.length).toBeLessThanOrEqual(s.length.max);
      if (f.grade === 'S') sCount++;
    }
    expect(sCount / n).toBeGreaterThan(0.004);
    expect(sCount / n).toBeLessThan(0.02);
  });

  it('グレード境界', () => {
    expect(gradeOf({ power: 31, stamina: 31, speed: 31, build: 12 })).toBe('S');
    expect(gradeOf({ power: 0, stamina: 0, speed: 0, build: 0 })).toBe('D');
  });

  it('色違いは出現率アップ条件で増える', () => {
    const s = SPECIES_BY_ID.oikawa;
    const rng = new Rng(5);
    let fog = 0;
    let sunny = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) {
      if (generateFish(s, { ...baseCond, weather: 'fog' }, rng).colorId === 'albino') fog++;
      if (generateFish(s, { ...baseCond, weather: 'sunny' }, rng).colorId === 'albino') sunny++;
    }
    expect(fog).toBeGreaterThan(sunny * 2);
  });

  it('大きい・高グレード・色違いほど高く売れる', () => {
    const s = SPECIES_BY_ID.koi;
    const base = { uid: 'x', speciesId: 'koi', iv: { power: 10, stamina: 10, speed: 10, build: 10 }, grade: 'C' as const, colorId: null, patternId: null };
    const small = priceOf(s, { ...base, length: 40, weight: 1000 });
    const big = priceOf(s, { ...base, length: 80, weight: 8000 });
    const ogon = priceOf(s, { ...base, length: 40, weight: 1000, colorId: 'ogon' });
    expect(big).toBeGreaterThan(small);
    expect(ogon).toBeGreaterThan(small * 5);
  });
});

describe('時計', () => {
  it('24分で1日進み、寝ると朝5時になる', () => {
    const c = new GameClock({ day: 1, minutes: 600, weather: 'sunny' }, new Rng(1));
    c.advance(24 * 60);
    expect(c.day).toBe(2);
    expect(Math.round(c.minutes)).toBe(600);
    c.sleep();
    expect(c.day).toBe(3);
    expect(Math.round(c.minutes)).toBe(300);
  });
});

describe('出現頻度の目安', () => {
  it('print', () => {
    const lake = SPECIES.filter((s) => s.spot === 'lake');
    const conds: Conditions[] = [
      baseCond,
      { ...baseCond, time: 'day', weather: 'sunny', season: 'summer', lure: 'crank', motion: 'fast', layer: 'mid', structure: 'open' },
      { ...baseCond, time: 'night', lure: 'topwater', motion: 'slow', layer: 'surface' },
      { ...baseCond, season: 'winter', lure: 'jig', motion: 'slow', layer: 'mid', structure: 'open', time: 'day' },
    ];
    for (const c of conds) {
      const p = biteChancePerSecond(lake, c, { activity: 1, lineVisibility: 1, spook: 0 });
      const top = lake
        .map((s) => [s.name, speciesWeight(s, c)] as const)
        .filter((x) => x[1] > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map((x) => `${x[0]}:${x[1].toFixed(2)}`);
      console.log(c.lure, c.time, p.toFixed(3), top.join(' '));
    }
  });
});
