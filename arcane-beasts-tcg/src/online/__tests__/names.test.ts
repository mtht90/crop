import { describe, expect, it } from 'vitest';
import { judgeName, normalizeName } from '../names';

const ok = (n: string) => judgeName(n).ok;

describe('player names', () => {
  it('lets ordinary names through', () => {
    for (const n of ['ユウ', 'ティム', 'hero', 'Hero99', 'ドラゴンマスター', 'きつねさん', 'Cinema', 'essex', 'grape', 'Dickens', 'cocktail', 'ヒーロー', '勇者']) expect(ok(n), n).toBe(true);
  });
  it('refuses insults, sexual and discriminatory words, however they are written', () => {
    for (const n of ['しね', 'シネ', 'し ね', 'し.ね', 'fuck', 'F U C K', 'ｓｈｉｔ', 'sh1t', 'sh1ttt', 'ちんこ', 'チンコマン', 'ＮＩＧＧＥＲ', 'きちがい', 'rape', 'killyourself', 'KYS', 'ころしてやる']) expect(ok(n), n).toBe(false);
  });
  it('refuses names that pose as the staff', () => {
    for (const n of ['運営', 'うんえい', '運営さん', 'admin', 'Admin01', 'ＧＭ', '公式', 'Claude']) expect(ok(n), n).toBe(false);
    expect(ok('ecosystem')).toBe(true);
  });
  it('trims and cuts to 12 characters, and refuses an empty name', () => {
    const v = judgeName('  あいうえおかきくけこさしすせそ  ');
    expect(v.ok && v.name).toBe('あいうえおかきくけこさし');
    expect(judgeName('   ').ok).toBe(false);
    expect(judgeName('<>').ok).toBe(false);
  });
  it('normalises look-alikes', () => {
    expect(normalizeName('Ｓｈ１ｔ')).toBe('shit');
    expect(normalizeName('シ・ネ')).toBe('しね');
  });
});
