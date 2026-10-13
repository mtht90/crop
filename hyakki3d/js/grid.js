// 一様グリッドによる空間分割（毎フレーム counting sort で再構築）。
// プレイヤー中心の固定サイズ領域を覆い、領域外の要素は端のセルに入る。
export class Grid {
  constructor(cellSize, cols, rows, maxItems) {
    this.cs = cellSize;
    this.inv = 1 / cellSize;
    this.cols = cols;
    this.rows = rows;
    this.n = cols * rows;
    this.start = new Int32Array(this.n + 1);
    this.cursor = new Int32Array(this.n);
    this.items = new Int32Array(maxItems);
    this.cellOf = new Int32Array(maxItems);
    this.out = new Int32Array(maxItems);
    this.out2 = new Int32Array(maxItems);
    this.ox = 0;
    this.oy = 0;
  }

  cellX(x) {
    let c = ((x - this.ox) * this.inv) | 0;
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  cellY(y) {
    let c = ((y - this.oy) * this.inv) | 0;
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  // list[0..len) の要素（x, y を持つ）を登録。インデックスで参照する
  build(list, len, cx, cy) {
    this.ox = cx - (this.cols * this.cs) / 2;
    this.oy = cy - (this.rows * this.cs) / 2;
    const cur = this.cursor, start = this.start, cellOf = this.cellOf, items = this.items;
    cur.fill(0);
    for (let i = 0; i < len; i++) {
      const e = list[i];
      const c = this.cellY(e.y) * this.cols + this.cellX(e.x);
      cellOf[i] = c;
      cur[c]++;
    }
    start[0] = 0;
    for (let c = 0; c < this.n; c++) {
      start[c + 1] = start[c] + cur[c];
      cur[c] = start[c];
    }
    for (let i = 0; i < len; i++) items[cur[cellOf[i]]++] = i;
  }

  // (x,y) から半径 r の矩形範囲に入るセルの要素インデックスを out に詰めて個数を返す
  query(x, y, r, out = this.out) {
    const x0 = this.cellX(x - r), x1 = this.cellX(x + r);
    const y0 = this.cellY(y - r), y1 = this.cellY(y + r);
    const start = this.start, items = this.items, cols = this.cols;
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * cols;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        for (let k = start[c], e = start[c + 1]; k < e; k++) out[n++] = items[k];
      }
    }
    return n;
  }
}
