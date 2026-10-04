// 尖った頂点が上下（z方向）を向く六角形グリッドの座標計算（axial座標 q, r）。
// KayKit のヘックスタイルは平らな辺どうしの幅が 2.0 なので、外接円の半径は 2/√3。

export const HEX_SIZE = 2 / Math.sqrt(3);

export interface Hex {
  q: number;
  r: number;
}

const DIRS: Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const hexKey = (h: Hex) => `${h.q},${h.r}`;

export function hexDistance(a: Hex, b: Hex): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function hexToWorld(h: Hex): { x: number; z: number } {
  return {
    x: HEX_SIZE * Math.sqrt(3) * (h.q + h.r / 2),
    z: HEX_SIZE * 1.5 * h.r,
  };
}

export function worldToHex(x: number, z: number): Hex {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * z) / HEX_SIZE;
  const r = ((2 / 3) * z) / HEX_SIZE;
  return hexRound(q, r);
}

function hexRound(fq: number, fr: number): Hex {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}

/** 中心から外側へ渦巻き状に並べたヘックス列。畑を買い足す順番になる。 */
export function spiral(maxRing: number): Hex[] {
  const out: Hex[] = [{ q: 0, r: 0 }];
  for (let ring = 1; ring <= maxRing; ring++) {
    let h: Hex = { q: DIRS[4].q * ring, r: DIRS[4].r * ring };
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        out.push(h);
        h = { q: h.q + DIRS[side].q, r: h.r + DIRS[side].r };
      }
    }
  }
  return out;
}

/** 指定した環のヘックスだけを返す */
export function ring(radius: number): Hex[] {
  return spiral(radius).filter((h) => hexDistance(h, { q: 0, r: 0 }) === radius);
}
