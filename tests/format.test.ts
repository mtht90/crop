import { describe, expect, it, afterEach } from 'vitest';
import { Decimal } from '../src/core/decimal';
import { fmt, fmtTime, setNotation } from '../src/core/format';

afterEach(() => setNotation('jp'));

describe('fmt', () => {
  it('小さな数はそのまま', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(999)).toBe('999');
    expect(fmt(1.5, 1)).toBe('1.5');
  });
  it('日本式の単位', () => {
    expect(fmt(12345)).toBe('1.23万');
    expect(fmt(1e8)).toBe('1.00億');
    expect(fmt(3.5e12)).toBe('3.50兆');
    expect(fmt(new Decimal('1e68'))).toBe('1.00無量大数');
    expect(fmt(new Decimal('1e72'))).toBe('1.00e72');
  });
  it('英語略記と指数表記', () => {
    setNotation('short');
    expect(fmt(1234567)).toBe('1.23M');
    setNotation('sci');
    expect(fmt(1234567)).toBe('1.23e6');
    expect(fmt(new Decimal('1e1234567'))).toBe('e1.23e6');
  });
  it('時間', () => {
    expect(fmtTime(59)).toBe('59秒');
    expect(fmtTime(3661)).toBe('1時間1分');
    expect(fmtTime(90000)).toBe('1日1時間');
    expect(fmtTime(Infinity)).toBe('∞');
  });
});
