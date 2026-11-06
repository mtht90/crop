import { describe, expect, it } from 'vitest';
import { currentStageEvent, isBossStage, modsText, rollShards, STAGE_COUNT, STAGE_EVENTS, shopOf, stageNow, stagesOf } from '../stages';
import { card } from '../../engine/cards';
import { deckById } from '../../engine/decks';
import { artUrl } from '../../lib/assets';

describe('ステージイベント', () => {
  it('runs two weeks, Monday to Monday, and rotates through the events', () => {
    const a = currentStageEvent(new Date(2026, 10, 3));
    const b = currentStageEvent(new Date(2026, 10, 15));
    const c = currentStageEvent(new Date(2026, 10, 17));
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
    expect(a.ends.getDay()).toBe(1);
    expect(a.ends.getTime()).toBe(new Date(2026, 10, 16).getTime());
  });
  it('every event has 15 stages, bosses at 5 / 10 / 15, decks and cards that exist', () => {
    for (const ev of STAGE_EVENTS) {
      const st = stagesOf(ev);
      expect(st.length).toBe(STAGE_COUNT);
      expect(st.filter((s) => s.boss).map((s) => s.label)).toEqual(['1-5', '2-5', '3-5']);
      for (const s of st) {
        expect(deckById(s.deck), s.deck).toBeTruthy();
        expect(s.rules.length).toBeGreaterThan(0);
        expect(artUrl(s.portrait)).toContain('/');
      }
      expect(card(ev.card).name).toBeTruthy();
      expect(shopOf(ev)[0].card).toBe(ev.card);
      // a run of first clears pays about 500 gems
      expect(st.reduce((n, s) => n + s.gems, 0)).toBeGreaterThan(400);
    }
  });
  it('bosses always drop shards; ordinary stages only sometimes', () => {
    expect(rollShards(4, () => 0.99)).toBeGreaterThan(0);
    expect(rollShards(14, () => 0)).toBeGreaterThanOrEqual(30);
    expect(rollShards(1, () => 0.99)).toBe(0);
    expect(rollShards(1, () => 0.1)).toBeGreaterThan(0);
    expect(isBossStage(9)).toBe(true);
  });
  it('rule text reads naturally', () => {
    expect(modsText({ prizes: 3, hp: [0, -20] })).toEqual(['サイド3枚で勝負', '相手のモンスターのHP-20']);
    expect(modsText({})).toEqual(['ふつうのルール']);
  });
  it('a new event starts a fresh save', () => {
    const s = stageNow({ key: 'old:1', cleared: 9, shards: 300, bought: { card: 1 } });
    expect(s.cleared).toBe(0);
    expect(s.shards).toBe(0);
  });
});
