// 道路を走る車（素材の車・バス・トラック）。交差点でときどき曲がる。左側通行。
import * as THREE from 'three';
import { DECOR_VISUALS } from '../config/buildings';
import type { CityLayout } from '../core/layout';
import { ModelLibrary, type InstancePool } from './models';

interface Car {
  pool: InstancePool;
  index: number;
  axis: 'x' | 'z';
  /** 走っている道路の座標（axis が 'x' なら z、'z' なら x） */
  line: number;
  pos: number;
  dir: 1 | -1;
  speed: number;
  scale: number;
}

export const TRAFFIC = {
  /** 1秒あたりに進む距離（区画単位） */
  speed: [0.35, 0.6] as [number, number],
  /** 交差点で曲がる確率 */
  turnChance: 0.35,
  /** 車線のずれ */
  laneOffset: 0.13,
  /** 車の大きさの倍率（素材のままだと小さいため） */
  scale: 1.6,
};

export class Traffic {
  private cars: Car[] = [];
  private pools: InstancePool[] = [];
  target = 12;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(private readonly layout: CityLayout, private readonly models: ModelLibrary) {}

  async init() {
    const ps = await Promise.all(DECOR_VISUALS.cars.map((c) => this.models.pool(c.model)));
    this.pools = ps.filter((p): p is InstancePool => !!p);
  }

  private spawn(): Car | null {
    if (!this.pools.length) return null;
    const pool = this.pools[Math.floor(Math.random() * this.pools.length)];
    const axis: 'x' | 'z' = Math.random() < 0.5 ? 'x' : 'z';
    const lines = axis === 'x' ? this.layout.roadLinesZ : this.layout.roadLinesX;
    const along = axis === 'x' ? this.layout.roadLinesX : this.layout.roadLinesZ;
    const line = lines[Math.floor(Math.random() * lines.length)];
    const min = Math.min(...along);
    const max = Math.max(...along);
    const car: Car = {
      pool, index: pool.add(new THREE.Matrix4().makeScale(0, 0, 0)), axis, line,
      pos: min + Math.random() * (max - min), dir: Math.random() < 0.5 ? 1 : -1,
      speed: TRAFFIC.speed[0] + Math.random() * (TRAFFIC.speed[1] - TRAFFIC.speed[0]), scale: TRAFFIC.scale,
    };
    return car;
  }

  /** dt 秒ぶん進める */
  update(dt: number) {
    // 台数を目標に近づける（少しずつ）
    if (this.cars.length < this.target && Math.random() < 0.3) {
      const c = this.spawn();
      if (c) this.cars.push(c);
    } else if (this.cars.length > this.target && Math.random() < 0.1) {
      const c = this.cars.pop()!;
      c.pool.remove(c.index);
    }
    for (const c of this.cars) this.move(c, Math.min(dt, 0.1));
  }

  private move(c: Car, dt: number) {
    const along = c.axis === 'x' ? this.layout.roadLinesX : this.layout.roadLinesZ;
    const cross = c.axis === 'x' ? this.layout.roadLinesZ : this.layout.roadLinesX;
    const min = Math.min(...along);
    const max = Math.max(...along);
    const prev = c.pos;
    c.pos += c.dir * c.speed * dt;
    // 交差点を通り過ぎたか
    for (const x of along) {
      if ((prev - x) * (c.pos - x) > 0 && c.pos !== x) continue;
      if (prev === x) continue;
      const atEnd = (c.dir > 0 && x >= max - 1e-6) || (c.dir < 0 && x <= min + 1e-6);
      if (atEnd || Math.random() < TRAFFIC.turnChance) {
        const crossMin = Math.min(...cross);
        const crossMax = Math.max(...cross);
        let dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
        if (c.line <= crossMin + 1e-6) dir = 1;
        if (c.line >= crossMax - 1e-6) dir = -1;
        const newLine = x;
        c.pos = c.line;
        c.line = newLine;
        c.axis = c.axis === 'x' ? 'z' : 'x';
        c.dir = dir;
      }
      break;
    }
    // 位置と向き
    const lane = TRAFFIC.laneOffset * c.dir;
    let x: number;
    let z: number;
    let rot: number;
    if (c.axis === 'x') {
      x = c.pos;
      z = c.line + lane;
      rot = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = c.line - lane;
      z = c.pos;
      rot = c.dir > 0 ? 0 : Math.PI;
    }
    this.q.setFromAxisAngle(this.up, rot);
    this.m.compose(new THREE.Vector3(x, 0, z), this.q, new THREE.Vector3(c.scale, c.scale, c.scale));
    c.pool.set(c.index, this.m);
  }

  clear() {
    for (const c of this.cars) c.pool.remove(c.index);
    this.cars = [];
  }
}

export { ModelLibrary };
