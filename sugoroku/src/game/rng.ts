// 再現可能な乱数（mulberry32）。シミュレーションでのバランス調整にも使う。
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: readonly { item: T; w: number }[]): T {
    const total = items.reduce((a, b) => a + Math.max(0, b.w), 0);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, it.w);
      if (r <= 0) return it.item;
    }
    return items[items.length - 1].item;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
