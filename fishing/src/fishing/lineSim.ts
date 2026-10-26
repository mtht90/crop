/**
 * 道糸の物理（ベルレ積分の質点の鎖）。
 * 両端（竿先とルアー・魚）を固定し、空中は重力でたるみ、水中は水の抵抗で遅れて膨らみ、ゆっくり沈む。
 * 糸の長さ（restTotal）より両端が離れれば一直線に張る。
 */
export class LineSim {
  readonly n: number;
  readonly pos: Float32Array;
  private prev: Float32Array;
  private a = [0, 0, 0];
  private b = [0, 0, 0];
  private ready = false;

  constructor(n = 48) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
  }

  /** 両端を結ぶ直線に並べ直す（投げ直し・場面の切り替え） */
  reset(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      this.pos.set([x, y, z], i * 3);
      this.prev.set([x, y, z], i * 3);
    }
    this.a = [ax, ay, az];
    this.b = [bx, by, bz];
    this.ready = true;
  }

  /**
   * restTotal = 糸の長さ (m)。floor = 水底の高さ（糸が底より下へ行かない）。
   * flow = 水中の糸を押す水の流れ (m/s)
   */
  step(
    dt: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    restTotal: number,
    floor?: (x: number, z: number) => number,
  ): void {
    const jump = Math.hypot(bx - this.b[0], by - this.b[1], bz - this.b[2]) + Math.hypot(ax - this.a[0], ay - this.a[1], az - this.a[2]);
    if (!this.ready || jump > 6) this.reset(ax, ay, az, bx, by, bz);
    const n = this.n;
    const p = this.pos;
    const q = this.prev;
    const straight = Math.hypot(bx - ax, by - ay, bz - az);
    const seg = Math.max(straight, restTotal) / (n - 1);
    const steps = Math.min(4, Math.max(1, Math.ceil(dt * 120)));
    const h = Math.min(dt, 1 / 20) / steps;
    const a0 = this.a;
    const b0 = this.b;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      // 端点は前のフレームから補間して動かす（速い竿の動きでも糸が飛ばない）
      const pax = a0[0] + (ax - a0[0]) * t, pay = a0[1] + (ay - a0[1]) * t, paz = a0[2] + (az - a0[2]) * t;
      const pbx = b0[0] + (bx - b0[0]) * t, pby = b0[1] + (by - b0[1]) * t, pbz = b0[2] + (bz - b0[2]) * t;
      for (let i = 1; i < n - 1; i++) {
        const k = i * 3;
        const y = p[k + 1];
        const wet = y < 0;
        // 空中は軽い空気抵抗と重力、水中は強い抵抗とゆっくりした沈下
        const damp = Math.exp(-h * (wet ? 9 : 1.2));
        const g = wet ? -0.7 : -9.8;
        const vx = (p[k] - q[k]) * damp;
        const vy = (y - q[k + 1]) * damp;
        const vz = (p[k + 2] - q[k + 2]) * damp;
        q[k] = p[k];
        q[k + 1] = y;
        q[k + 2] = p[k + 2];
        p[k] += vx;
        p[k + 1] += vy + g * h * h;
        p[k + 2] += vz;
      }
      p[0] = pax; p[1] = pay; p[2] = paz;
      const e = (n - 1) * 3;
      p[e] = pbx; p[e + 1] = pby; p[e + 2] = pbz;
      // 長さの拘束：両方向から交互に解いて、長い糸でも伸びにくくする
      for (let it = 0; it < 12; it++) {
        const fwd = (it & 1) === 0;
        for (let j = 0; j < n - 1; j++) {
          const i = fwd ? j : n - 2 - j;
          const k0 = i * 3;
          const k1 = k0 + 3;
          const dx = p[k1] - p[k0];
          const dy = p[k1 + 1] - p[k0 + 1];
          const dz = p[k1 + 2] - p[k0 + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          // 糸は縮まない（たるむだけ）ので、伸びた時だけ引き戻す
          if (d <= seg) continue;
          const diff = (d - seg) / d;
          const w0 = i === 0 ? 0 : i + 1 === n - 1 ? 1 : 0.5;
          const w1 = i + 1 === n - 1 ? 0 : i === 0 ? 1 : 0.5;
          p[k0] += dx * diff * w0;
          p[k0 + 1] += dy * diff * w0;
          p[k0 + 2] += dz * diff * w0;
          p[k1] -= dx * diff * w1;
          p[k1 + 1] -= dy * diff * w1;
          p[k1 + 2] -= dz * diff * w1;
        }
      }
      if (floor) {
        for (let i = 1; i < n - 1; i++) {
          const k = i * 3;
          const f = floor(p[k], p[k + 2]);
          if (p[k + 1] < f) {
            p[k + 1] = f;
            q[k + 1] = f;
          }
        }
      }
    }
    // 張っている時は Gauss-Seidel が収束しきらず重く垂れるので、直線へ寄せる
    const taut = straight / Math.max(1e-3, restTotal);
    if (taut > 0.97) {
      const k = Math.min(1, (taut - 0.97) / 0.03) * 0.6;
      for (let i = 1; i < n - 1; i++) {
        const t = i / (n - 1);
        const j = i * 3;
        const sx = ax + (bx - ax) * t, sy = ay + (by - ay) * t, sz = az + (bz - az) * t;
        // 水中の部分は抵抗で膨らんだ形を少し残す
        const kk = p[j + 1] < 0 ? k * 0.5 : k;
        const nx = p[j] + (sx - p[j]) * kk;
        const ny = p[j + 1] + (sy - p[j + 1]) * kk;
        const nz = p[j + 2] + (sz - p[j + 2]) * kk;
        q[j] += nx - p[j];
        q[j + 1] += ny - p[j + 1];
        q[j + 2] += nz - p[j + 2];
        p[j] = nx;
        p[j + 1] = ny;
        p[j + 2] = nz;
      }
    }
    this.a = [ax, ay, az];
    this.b = [bx, by, bz];
  }

  /** 糸が最初に水面に入る点（無ければ null） */
  entry(): [number, number] | null {
    const p = this.pos;
    for (let i = 1; i < this.n; i++) {
      if (p[i * 3 + 1] < 0 && p[(i - 1) * 3 + 1] >= 0) return [p[i * 3], p[i * 3 + 2]];
    }
    return null;
  }

  /** 竿先から少し先の糸の向き（竿のしなる向き） */
  pullDir(): [number, number, number] {
    const p = this.pos;
    const i = Math.min(this.n - 1, 3);
    const dx = p[i * 3] - p[0], dy = p[i * 3 + 1] - p[1], dz = p[i * 3 + 2] - p[2];
    const d = Math.hypot(dx, dy, dz) || 1;
    return [dx / d, dy / d, dz / d];
  }
}
