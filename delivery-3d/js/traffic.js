// 国道を走る他の車と信号機
import * as THREE from 'three';
import { T, NAT_Z, NS_X } from './town.js';
import { buildCar } from './van.js';

const CYCLE = [
  ['ew', 'g', 20], ['ew', 'y', 3], ['all', 'r', 2], ['ns', 'g', 11], ['ns', 'y', 3], ['all', 'r', 2],
];
const CYCLE_LEN = CYCLE.reduce((a, c) => a + c[2], 0);

export function signalState(sig, t) {
  let k = ((t + sig.offset) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
  for (const [grp, col, len] of CYCLE) {
    if (k < len) {
      if (grp === 'ew') return { ew: col, ns: 'r' };
      if (grp === 'ns') return { ew: 'r', ns: col };
      return { ew: 'r', ns: 'r' };
    }
    k -= len;
  }
  return { ew: 'g', ns: 'r' };
}

export function updateSignals(t) {
  for (const s of T.signals) {
    s.state = signalState(s, t);
    for (const grp of ['ew', 'ns']) for (const c of ['g', 'y', 'r']) s[grp][c].emissiveIntensity = s.state[grp] === c ? 3.2 : 0;
  }
}

const COLORS = [0xe8e8e8, 0x2b2b2b, 0x8a1c1c, 0x2d4a7a, 0x9aa0a6, 0xd8d2c0, 0x3e5a3a, 0xcfcfcf, 0x5a3a2a];
const KINDS = ['sedan', 'kei', 'kei', 'sedan', 'truck', 'kei'];

export class Traffic {
  constructor(scene) {
    this.cars = [];
    const lanes = [{ z: NAT_Z - 1.75, dir: 1 }, { z: NAT_Z + 1.75, dir: -1 }];
    let n = 0;
    for (const lane of lanes) {
      for (let i = 0; i < 7; i++) {
        const kind = KINDS[n % KINDS.length];
        const mesh = buildCar(COLORS[(n * 5) % COLORS.length], kind);
        scene.add(mesh);
        const car = {
          mesh, lane, x: -250 + i * 75 + (lane.dir < 0 ? 30 : 0), speed: 10, v0: 12 + (n % 4) * 0.8, len: mesh.userData.len,
          circles() { const r = 0.9, o = this.len / 2 - 0.9; return [{ x: this.x - o * this.lane.dir, z: this.lane.z, r }, { x: this.x, z: this.lane.z, r }, { x: this.x + o * this.lane.dir, z: this.lane.z, r }]; },
        };
        this.cars.push(car);
        n++;
      }
    }
  }

  update(dt, van, dark) {
    for (const car of this.cars) {
      const d = car.lane.dir;
      // 前方の障害物までの距離
      let gap = 1e9, leadV = 0;
      const front = car.x + d * car.len / 2;
      for (const o of this.cars) {
        if (o === car || o.lane !== car.lane) continue;
        const rel = (o.x - car.x) * d;
        if (rel > 0) { const g = rel - (o.len + car.len) / 2; if (g < gap) { gap = g; leadV = o.speed; } }
      }
      if (van && Math.abs(van.z - car.lane.z) < 2.2) {
        const rel = (van.x - car.x) * d;
        if (rel > 0) { const g = rel - car.len / 2 - 1.8; if (g < gap) { gap = g; leadV = Math.max(0, van.speed * (Math.sin(van.heading) * d)); } }
      }
      // 信号
      for (const s of T.signals) {
        const stopX = d > 0 ? s.x - 10.5 : s.x + 5;
        const dist = (stopX - front) * d;
        if (dist > -0.5 && dist < 60) {
          const col = s.state.ew;
          const mustStop = col === 'r' || (col === 'y' && dist > car.speed * 1.2);
          if (mustStop && dist < gap) { gap = Math.max(0.1, dist); leadV = 0; }
        }
      }
      // IDM（車間距離を保つ追従モデル）
      const a0 = 1.6, b = 3.0, s0 = 2.2, Th = 1.3, v = car.speed;
      const sStar = s0 + v * Th + v * (v - leadV) / (2 * Math.sqrt(a0 * b));
      let acc = a0 * (1 - Math.pow(v / car.v0, 4) - Math.pow(sStar / Math.max(gap, 0.1), 2));
      acc = Math.max(-8, acc);
      car.speed = Math.max(0, v + acc * dt);
      car.x += d * car.speed * dt;
      if (car.x > 275) car.x = -275;
      if (car.x < -275) car.x = 275;
      car.mesh.position.set(car.x, 0, car.lane.z);
      car.mesh.rotation.y = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.mesh.userData.tail.emissiveIntensity = acc < -1.2 ? 2 : (dark > 0.3 ? 0.7 : 0.15);
      car.mesh.userData.head.emissiveIntensity = dark > 0.3 ? 2 : 0.1;
    }
  }
}
export { NS_X };
