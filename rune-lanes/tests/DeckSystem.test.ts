import { describe, expect, it } from 'vitest';
import { DeckSystem } from '../src/systems/DeckSystem';
import { Rng } from '../src/core/Rng';

const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
const cfg = { initialHand: 4, handLimit: 6, drawInterval: 4 };

function make(seed = 1, cards = ids, c = cfg) {
  return new DeckSystem(cards, c, new Rng(seed));
}

describe('DeckSystem', () => {
  it('試合開始時に初期手札を引く', () => {
    const d = make();
    const ev = d.start();
    expect(d.hand).toHaveLength(4);
    expect(d.drawPile).toHaveLength(8);
    expect(d.discard).toHaveLength(0);
    expect(ev.filter((e) => e.type === 'draw')).toHaveLength(4);
  });

  it('同じシードなら同じ順番にシャッフルされる', () => {
    const a = make(42);
    const b = make(42);
    a.start();
    b.start();
    expect(a.hand.map((c) => c.cardId)).toEqual(b.hand.map((c) => c.cardId));
    expect(a.drawPile.map((c) => c.cardId)).toEqual(b.drawPile.map((c) => c.cardId));
  });

  it('一定間隔で自動ドローする', () => {
    const d = make();
    d.start();
    expect(d.update(3.9)).toHaveLength(0);
    const ev = d.update(0.2);
    expect(ev).toEqual([{ type: 'draw', card: d.hand[4] }]);
    expect(d.hand).toHaveLength(5);
  });

  it('手札上限に達するとドローが止まり、ゲージも止まる', () => {
    const d = make();
    d.start();
    d.update(4);
    d.update(4);
    expect(d.hand).toHaveLength(6);
    expect(d.isDrawPaused).toBe(true);
    const timer = d.drawTimer;
    expect(d.update(100)).toHaveLength(0);
    expect(d.hand).toHaveLength(6);
    expect(d.drawTimer).toBe(timer);
  });

  it('手札を使って上限を下回るとドローが再開する', () => {
    const d = make();
    d.start();
    d.update(4);
    d.update(4);
    d.play(d.hand[0].uid);
    expect(d.isDrawPaused).toBe(false);
    d.update(4);
    expect(d.hand).toHaveLength(6);
  });

  it('使ったカードは捨て札へ行く', () => {
    const d = make();
    d.start();
    const card = d.hand[1];
    expect(d.play(card.uid)).toBe(card);
    expect(d.discard).toEqual([card]);
    expect(d.hand).not.toContain(card);
    expect(d.play(9999)).toBeNull();
  });

  it('山札が尽きたら捨て札をシャッフルして山札に戻す', () => {
    const d = make(7, ids, { initialHand: 4, handLimit: 20, drawInterval: 1 });
    d.start();
    // 山札を引き切る
    for (let i = 0; i < 8; i++) d.update(1);
    expect(d.drawPile).toHaveLength(0);
    expect(d.hand).toHaveLength(12);
    // 3枚使う
    const used = d.hand.slice(0, 3);
    for (const c of used) d.play(c.uid);
    expect(d.discard).toHaveLength(3);
    const ev = d.update(1);
    expect(ev[0]).toEqual({ type: 'shuffle', count: 3 });
    expect(ev[1].type).toBe('draw');
    expect(d.discard).toHaveLength(0);
    expect(d.drawPile).toHaveLength(2);
    expect(used.map((c) => c.uid)).toContain((ev[1] as { card: { uid: number } }).card.uid);
  });

  it('山札・捨て札がともに空ならドローしない', () => {
    const d = make(3, ['a', 'b'], { initialHand: 4, handLimit: 6, drawInterval: 1 });
    d.start();
    expect(d.hand).toHaveLength(2);
    expect(d.update(1)).toHaveLength(0);
    expect(d.update(1)).toHaveLength(0);
    // 1枚使えば、その札がシャッフルされて戻ってくる
    d.play(d.hand[0].uid);
    const ev = d.update(0.01);
    expect(ev.map((e) => e.type)).toEqual(['shuffle', 'draw']);
  });

  it('同名カードの複数枚投入を区別できる', () => {
    const d = make(1, ['knight', 'knight', 'knight'], { initialHand: 3, handLimit: 6, drawInterval: 4 });
    d.start();
    const uids = new Set(d.hand.map((c) => c.uid));
    expect(uids.size).toBe(3);
    d.play(d.hand[0].uid);
    expect(d.hand).toHaveLength(2);
    expect(d.discard).toHaveLength(1);
  });

  it('カードの総数は常に保たれる', () => {
    const d = make(11, ids, { initialHand: 4, handLimit: 6, drawInterval: 0.5 });
    d.start();
    const rng = new Rng(5);
    for (let i = 0; i < 500; i++) {
      d.update(0.3);
      if (d.hand.length && rng.next() < 0.5) d.play(d.hand[rng.int(d.hand.length)].uid);
      expect(d.hand.length + d.drawPile.length + d.discard.length).toBe(12);
      expect(d.hand.length).toBeLessThanOrEqual(6);
    }
  });
});
