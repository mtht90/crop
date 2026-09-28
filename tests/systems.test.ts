import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/core/decimal';
import { deserialize, exportSave, importSave, serialize } from '../src/core/save';
import { applyOffline } from '../src/logic/offline';
import { startResearch, tickResearch } from '../src/logic/research';
import { RESEARCH_MAP } from '../src/data/research';
import { launchExpedition, tickExpeditions } from '../src/logic/expeditions';
import { catchComet } from '../src/logic/comets';
import { checkAchievements } from '../src/logic/achievements';
import { makeGame } from './helpers';

describe('セーブ', () => {
  it('往復しても値が保たれる', () => {
    const { g } = makeGame();
    g.s.stardust = new Decimal('1.5e1234');
    g.s.sn.shop.sn_prod = 4;
    g.s.buildings[3] = 17;
    g.s.research.current = 'r_prod1';
    const back = deserialize(serialize(g.s));
    expect(back.stardust.eq(g.s.stardust)).toBe(true);
    expect(back.sn.shop.sn_prod).toBe(4);
    expect(back.buildings[3]).toBe(17);
    expect(back.sn.bestTime).toBe(Infinity);
    expect(back.research.current).toBe('r_prod1');
    expect(importSave(exportSave(g.s)).stardust.eq(g.s.stardust)).toBe(true);
  });
  it('欠けた項目は既定値で補われる', () => {
    const back = deserialize(JSON.stringify({ stardust: '#D:1e10', buildings: [3] }));
    expect(back.stardust.eq(1e10)).toBe(true);
    expect(back.buildings.length).toBe(40);
    expect(back.buildings[0]).toBe(3);
    expect(back.settings.notation).toBe('jp');
    expect(back.sn.cores.eq(0)).toBe(true);
  });
});

describe('放置報酬', () => {
  it('効率と上限に従って星屑を得る', () => {
    const { g, advance } = makeGame();
    g.s.buildings[0] = 10;
    g.recalc();
    const sps = g.sps;
    advance(3600);
    const rep = applyOffline(g)!;
    expect(rep).not.toBeNull();
    expect(rep.gained.div(sps.mul(3600 * 0.25)).toNumber()).toBeCloseTo(1);
    advance(100 * 3600);
    const rep2 = applyOffline(g)!;
    expect(rep2.effectiveSeconds).toBe(8 * 3600);
  });
  it('短い不在では何もしない', () => {
    const { g, advance } = makeGame();
    advance(10);
    expect(applyOffline(g)).toBeNull();
  });
});

describe('研究', () => {
  it('時間経過で完了し、余りは次の研究に持ち越す', () => {
    const { g } = makeGame();
    g.s.stats.snTotal = 1;
    expect(startResearch(g, 'r_prod1')).toBe(true);
    expect(startResearch(g, 'r_click1')).toBe(true); // キュー
    const t1 = RESEARCH_MAP.get('r_prod1')!.time(0);
    tickResearch(g, t1 + 10);
    expect(g.s.research.levels.r_prod1).toBe(1);
    expect(g.s.research.current).toBe('r_click1');
    expect(g.s.research.progress).toBeCloseTo(10);
    expect(g.mods.global.toNumber()).toBeCloseTo(2);
  });
});

describe('遠征', () => {
  it('帰還すると遺物と星屑を得る', () => {
    const { g, advance } = makeGame();
    g.s.research.levels.r_exp0 = 1;
    g.recalc();
    expect(launchExpedition(g, 0, 'e0')).toBe(true);
    expect(launchExpedition(g, 0, 'e0')).toBe(false);
    advance(601);
    tickExpeditions(g);
    expect(g.s.stats.expeditionsDone).toBe(1);
    expect(Object.values(g.s.expeditions.relics).reduce((a, b) => a + b, 0)).toBe(1);
    expect(g.s.expeditions.slots[0]).toBeNull();
    expect(g.s.stardust.gt(0)).toBe(true);
  });
});

describe('彗星と実績', () => {
  it('彗星をつかまえると効果が出る', () => {
    const { g } = makeGame();
    const text = catchComet(g);
    expect(text.length).toBeGreaterThan(0);
    expect(g.s.stats.comets).toBe(1);
  });
  it('条件を満たした実績が解除され、生産ボーナスになる', () => {
    const { g } = makeGame();
    g.s.stats.clicks = 1;
    checkAchievements(g);
    expect(g.achSet.has('cl1')).toBe(true);
    g.recalc();
    expect(g.mods.global.toNumber()).toBeCloseTo(1.01);
  });
});

describe('メインループ', () => {
  it('tick で生産が加算される', () => {
    const { g, advance } = makeGame();
    g.s.buildings[0] = 10;
    g.recalc();
    advance(2);
    expect(g.tick()).toBe(true);
    expect(g.s.stardust.toNumber()).toBeCloseTo(g.sps.toNumber() * 2);
  });
  it('長時間空くと tick は false を返す', () => {
    const { g, advance } = makeGame();
    advance(3600);
    expect(g.tick()).toBe(false);
  });
});
