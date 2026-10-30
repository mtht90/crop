import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeSaveCode, RateLimit, SAVE_TTL_MS, SaveTransfers } from '../saves';

const save = JSON.stringify({ coins: 120, collection: { 'AB1-001': 2 }, decks: [] });

describe('save transfer', () => {
  it('hands a save over once, by its code in any spelling', () => {
    const st = new SaveTransfers(null);
    const r = st.create(save);
    if ('error' in r) throw new Error(r.error);
    expect(r.code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    const typed = `${r.code.slice(0, 4).toLowerCase()}-${r.code.slice(4)}`;
    expect(normalizeSaveCode(typed)).toBe(r.code);
    expect(st.take(typed)).toBe(save);
    expect(st.take(r.code)).toBeNull();
  });
  it('forgets a code after an hour', () => {
    let t = 1_000;
    const st = new SaveTransfers(null, () => t);
    const r = st.create(save);
    if ('error' in r) throw new Error(r.error);
    t += SAVE_TTL_MS + 1;
    expect(st.take(r.code)).toBeNull();
  });
  it('refuses things that are not a save, or too big', () => {
    const st = new SaveTransfers(null);
    expect('error' in st.create('not json')).toBe(true);
    expect('error' in st.create(JSON.stringify({ hello: 1 }))).toBe(true);
    expect('error' in st.create(JSON.stringify({ coins: 1, collection: {}, pad: 'x'.repeat(700_000) }))).toBe(true);
  });
  it('keeps pending codes across a restart', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ab-saves-')), 'x.json');
    const a = new SaveTransfers(file);
    const r = a.create(save);
    if ('error' in r) throw new Error(r.error);
    expect(new SaveTransfers(file).take(r.code)).toBe(save);
  });
  it('rate-limits one address', () => {
    let t = 0;
    const rl = new RateLimit(3, 1000, () => t);
    expect([rl.allow('a'), rl.allow('a'), rl.allow('a'), rl.allow('a')]).toEqual([true, true, true, false]);
    expect(rl.allow('b')).toBe(true);
    t += 1001;
    expect(rl.allow('a')).toBe(true);
  });
});
