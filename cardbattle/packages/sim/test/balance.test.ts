import { describe, expect, it } from 'vitest';
import { MATCHUPS } from './matchups';

describe('カードの相性（じゃんけん）', () => {
  const r = Object.fromEntries(MATCHUPS().map((m) => [m.name, m]));
  it('タンク → 建物で止める', () => {
    expect(r['巨兵 → 砲台で止める'].towerDamage).toBeLessThan(500);
    expect(r['巨兵（守りなし）'].towerDamage).toBeGreaterThan(1500);
  });
  it('群れ → 範囲攻撃で倒す', () => {
    expect(r['骨の軍団 → 雷撃'].attackerAlive).toBe(0);
    expect(r['骨の軍団 → 翼竜'].defenderAlive).toBeGreaterThanOrEqual(0);
    expect(r['骨の軍団 → 翼竜'].towerDamage).toBe(0);
  });
  it('空中 → 遠距離で落とす', () => {
    expect(r['翼竜 → 弓兵'].towerDamage).toBeLessThan(r['翼竜（守りなし）'].towerDamage);
  });
});
