import { describe, expect, it } from 'vitest';
import { LineSim } from '../src/fishing/lineSim';

const sagOf = (l: LineSim, a: number[], b: number[]) => {
  let m = 0;
  for (let i = 0; i < l.n; i++) {
    const t = i / (l.n - 1);
    const y = a[1] + (b[1] - a[1]) * t;
    m = Math.max(m, y - l.pos[i * 3 + 1]);
  }
  return m;
};
const run = (rest: number, sec = 3) => {
  const l = new LineSim();
  const a = [0, 2, 0], b = [0, -1, 20];
  for (let i = 0; i < sec * 60; i++) l.step(1 / 60, a[0], a[1], a[2], b[0], b[1], b[2], rest);
  return { l, sag: sagOf(l, a, b), a, b };
};

describe('道糸', () => {
  it('張っていればほぼ一直線', () => {
    const straight = Math.hypot(3, 20);
    expect(run(straight).sag).toBeLessThan(0.15);
  });
  it('たるませると垂れて水に入る', () => {
    const straight = Math.hypot(3, 20);
    const { sag, l } = run(straight + 3, 6);
    expect(sag).toBeGreaterThan(1);
    expect(l.entry()).not.toBeNull();
    // 長さ（伸びすぎていない）
    let len = 0;
    for (let i = 1; i < l.n; i++) len += Math.hypot(l.pos[i * 3] - l.pos[i * 3 - 3], l.pos[i * 3 + 1] - l.pos[i * 3 - 2], l.pos[i * 3 + 2] - l.pos[i * 3 - 1]);
    expect(len).toBeLessThan((straight + 3) * 1.08);
  });
  it('魚が横へ走ると水中の糸が遅れて膨らむ', () => {
    const l = new LineSim();
    const straight = Math.hypot(3, 20);
    for (let i = 0; i < 120; i++) l.step(1 / 60, 0, 2, 0, 0, -1, 20, straight + 0.5);
    for (let i = 0; i < 60; i++) l.step(1 / 60, 0, 2, 0, i * 0.05, -1, 20, straight + 0.5);
    // 中ほどの水中の点は直線より手前（元の側）に残る
    const mid = l.pos[40 * 3];
    expect(mid).toBeLessThan((40 / 47) * 3 - 0.05);
  });
});
