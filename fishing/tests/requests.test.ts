import { describe, expect, it } from 'vitest';
import { newSave } from '../src/core/save';
import { currentRequest, deliver, makeRequest, matchingFish } from '../src/core/requests';
import { NPCS, NPC_BY_ID } from '../src/data/npcs';
import { SPECIES_BY_ID } from '../src/data/species';

const fishOf = (species: string, length: number, uid: string) => ({
  uid,
  speciesId: species,
  length,
  weight: 100,
  iv: { power: 10, stamina: 10, speed: 10, build: 10 },
  grade: 'B' as const,
  colorId: null,
  patternId: null,
  record: {} as never,
});

describe('納品依頼', () => {
  it('依頼の魚はすべて実在する魚種で、同じ日なら同じ依頼', () => {
    for (const n of NPCS) {
      for (const p of n.pool) expect(SPECIES_BY_ID[p.species], `${n.id}:${p.species}`).toBeTruthy();
      for (let d = 1; d < 30; d++) expect(makeRequest(n, d, 0)).toEqual(makeRequest(n, d, 0));
    }
  });
  it('揃っていれば渡せて報酬が入り、魚はクーラーから消える', () => {
    const save = newSave();
    const npc = NPC_BY_ID['hide'];
    const st = currentRequest(save, npc, 3);
    expect(deliver(save, npc, 3)).toBeNull();
    for (let i = 0; i < st.req.count; i++) save.cooler.push(fishOf(st.req.species, st.req.minLength + 5, `f${i}`));
    save.cooler.push(fishOf('aji', 1, 'other'));
    expect(matchingFish(save, st.req).length).toBe(st.req.count);
    const money = save.money;
    expect(deliver(save, npc, 3)).toBe(st.req.reward);
    expect(save.money).toBe(money + st.req.reward);
    expect(save.cooler.map((f) => f.uid)).toEqual(['other']);
    // 同じ日は済み、次の日は新しい依頼
    expect(currentRequest(save, npc, 3).done).toBe(true);
    expect(currentRequest(save, npc, 4).done).toBe(false);
  });
  it('大きさ指定に足りない魚は数えない', () => {
    const save = newSave();
    const req = { species: 'kurodai', count: 1, minLength: 35, reward: 1000 };
    save.cooler.push(fishOf('kurodai', 30, 'a'));
    expect(matchingFish(save, req).length).toBe(0);
    save.cooler.push(fishOf('kurodai', 36, 'b'));
    expect(matchingFish(save, req).map((f) => f.uid)).toEqual(['b']);
  });
});
