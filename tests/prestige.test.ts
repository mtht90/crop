import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/core/decimal';
import { doPrestige, galaxyGain, layerGain, nextGainAt, snGain, SN_REQ, GALAXY_REQ } from '../src/logic/prestige';
import { enterChallenge, checkChallenge, challengeGoal } from '../src/logic/challenges';
import { CHALLENGE_MAP } from '../src/data/challenges';
import { makeGame } from './helpers';

describe('超新星', () => {
  it('必要量未満では獲得 0、到達で 1', () => {
    const { g } = makeGame();
    g.s.run.earned = SN_REQ.div(2);
    expect(snGain(g).toNumber()).toBe(0);
    g.s.run.earned = SN_REQ;
    expect(snGain(g).toNumber()).toBe(1);
  });
  it('転生で星核を得て周回がリセットされる', () => {
    const { g } = makeGame();
    g.s.run.earned = SN_REQ.mul(1e20);
    g.s.stardust = new Decimal(1e20);
    g.s.buildings[0] = 50;
    g.s.upgrades.push('t0_0');
    g.syncSets();
    const gain = snGain(g);
    expect(doPrestige(g, 'sn')).toBe(true);
    expect(g.s.sn.cores.eq(gain)).toBe(true);
    expect(g.s.buildings[0]).toBe(0);
    expect(g.s.upgrades.length).toBe(0);
    expect(g.s.stardust.eq(0)).toBe(true);
    expect(g.s.stats.snTotal).toBe(1);
    // 星核ボーナスが生産に乗る
    expect(g.mods.global.gt(1)).toBe(true);
  });
  it('nextGainAt の必要量に達すると獲得量が 1 増える', () => {
    const { g } = makeGame();
    g.s.run.earned = SN_REQ.mul(1e30);
    const now = snGain(g);
    const nx = nextGainAt(g, 'sn');
    g.s.run.earned = nx.need.mul(1.0001);
    expect(snGain(g).gte(now.add(1))).toBe(true);
  });
});

describe('銀河崩壊', () => {
  it('星核とショップがリセットされ、保持効果があれば残る', () => {
    const { g } = makeGame();
    g.s.sn.coresGalaxy = GALAXY_REQ.mul(100);
    g.s.sn.cores = new Decimal(123);
    g.s.sn.shop.sn_prod = 3;
    g.recalc();
    expect(galaxyGain(g).gte(1)).toBe(true);
    expect(doPrestige(g, 'galaxy')).toBe(true);
    expect(g.s.sn.cores.eq(0)).toBe(true);
    expect(g.s.sn.shop.sn_prod).toBeUndefined();
    expect(g.s.galaxy.dm.gt(0)).toBe(true);

    g.s.galaxy.shop.dm_keepsn = 1;
    g.s.sn.shop.sn_prod = 2;
    g.s.sn.coresGalaxy = GALAXY_REQ.mul(100);
    g.recalc();
    doPrestige(g, 'galaxy');
    expect(g.s.sn.shop.sn_prod).toBe(2);
  });
  it('研究・遺物・実績は失われない', () => {
    const { g } = makeGame();
    g.s.research.levels.r_prod1 = 1;
    g.s.expeditions.relics.rl_iron = 3;
    g.s.achievements.push('cl1');
    g.s.crunch.entMV = new Decimal(1e6);
    g.recalc();
    expect(layerGain(g, 'mv').gte(1)).toBe(true);
    doPrestige(g, 'mv');
    expect(g.s.research.levels.r_prod1).toBe(1);
    expect(g.s.expeditions.relics.rl_iron).toBe(3);
    expect(g.s.achievements).toContain('cl1');
  });
});

describe('チャレンジ', () => {
  it('目標達成で段階が進み、周回が終わる', () => {
    const { g } = makeGame();
    g.s.stats.galaxyTotal = 1;
    expect(enterChallenge(g, 'c4')).toBe(true);
    expect(g.s.challenges.active).toBe('c4');
    expect(g.mods.maxBuildingIndex).toBe(9);
    g.s.run.earned = challengeGoal(g, CHALLENGE_MAP.get('c4')!);
    checkChallenge(g);
    expect(g.s.challenges.completions.c4).toBe(1);
    expect(g.s.challenges.active).toBeNull();
    expect(g.mods.building[0].toNumber()).toBeCloseTo(1000);
  });
});
