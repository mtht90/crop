// 町を走る他の車と信号機（道路網のグラフの上を走る）
import { T, edgeAt } from './town.js';
import { buildCar } from './van.js';

// 信号の周期：A（主な道）→ B（交差する道）
const CYCLE = [['A', 'g', 24], ['A', 'y', 3], ['all', 'r', 2], ['B', 'g', 14], ['B', 'y', 3], ['all', 'r', 2]];
const CYCLE_LEN = CYCLE.reduce((a, c) => a + c[2], 0);

export function signalState(sig, t) {
  let k = ((t + sig.offset) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
  for (const [grp, col, len] of CYCLE) {
    if (k < len) {
      if (grp === 'A') return { A: col, B: 'r' };
      if (grp === 'B') return { A: 'r', B: col };
      return { A: 'r', B: 'r' };
    }
    k -= len;
  }
  return { A: 'g', B: 'r' };
}
export function updateSignals(t) {
  for (const s of T.signals) {
    s.state = signalState(s, t);
    for (const grp of ['A', 'B']) for (const c of ['g', 'y', 'r']) s.mats[grp][c].emissiveIntensity = s.state[grp] === c ? 3.2 : 0;
  }
}

const COLORS = [0xe8e8e8, 0x2b2b2b, 0x8a1c1c, 0x2d4a7a, 0x9aa0a6, 0xd8d2c0, 0x3e5a3a, 0xcfcfcf, 0x5a3a2a];
const KINDS = ['sedan', 'kei', 'kei', 'sedan', 'truck', 'kei'];

export class Traffic {
  constructor(scene) {
    this.cars = [];
    this.scene = scene;
    // 信号・一時停止の場所を「辺と、どちらの端へ向かうか」で引けるように
    this.approach = new Map();
    for (const s of T.signals) for (const ap of s.approaches) this.approach.set(ap.e.id + ap.end, { sig: s, ap });
    this.stops = new Map();
    for (const n of T.nodes) if (n.stops) for (const st of n.stops) {
      const end = st.e.a === n.id ? 'a' : 'b';
      this.stops.set(st.e.id + end, st);
    }
    this.major = T.edges.filter(e => e.rank >= 3 && e.len > 30);
    this.minor = T.edges.filter(e => e.rank === 2 && e.len > 30);
    const N = 18;
    for (let i = 0; i < N; i++) {
      const kind = KINDS[i % KINDS.length];
      const mesh = buildCar(COLORS[(i * 5) % COLORS.length], kind);
      scene.add(mesh);
      const car = { mesh, len: mesh.userData.len, speed: 6, heading: 0, x: 0, z: 0, stopT: 0 };
      car.circles = function () { const r = 0.9, o = this.len / 2 - 0.9, sx = Math.sin(this.heading), cz = Math.cos(this.heading); return [-o, 0, o].map(k => ({ x: this.x + sx * k, z: this.z + cz * k, r })); };
      this.spawn(car, null, i);
      this.cars.push(car);
    }
  }
  spawn(car, van, i = Math.random() * 100) {
    for (let tries = 0; tries < 30; tries++) {
      const list = (i % 3 === 2 && this.minor.length) ? this.minor : this.major;
      const e = list[Math.floor(Math.random() * list.length)];
      const dir = e.ow ? 1 : (Math.random() < 0.5 ? 1 : -1);
      const s = 10 + Math.random() * Math.max(1, e.len - 20);
      const p = edgeAt(e, s);
      if (van && Math.hypot(p.p[0] - van.x, p.p[1] - van.z) < 70) continue;
      if (this.cars.some(c => c !== car && Math.hypot(c.x - p.p[0], c.z - p.p[1]) < 14)) continue;
      Object.assign(car, { e, s, dir, speed: 5, stopT: 0, stopDone: null });
      this.place(car, 1);
      return;
    }
  }
  laneOffset(e) { return e.ow ? 0 : e.w / 4; }
  place(car, k) {
    const at = edgeAt(car.e, car.s);
    const d = car.dir > 0 ? at.d : [-at.d[0], -at.d[1]];
    const left = [d[1], -d[0]], off = this.laneOffset(car.e);
    car.x = at.p[0] + left[0] * off; car.z = at.p[1] + left[1] * off;
    const h = Math.atan2(d[0], d[1]);
    let dh = h - car.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    car.heading += dh * Math.min(1, k);
    car.d = d;
  }
  // 次の辺を選ぶ（Uターンはしない。行き止まりなら別の場所から出直す）
  next(car, van) {
    const node = T.nodes[car.dir > 0 ? car.e.b : car.e.a];
    const opts = [];
    for (const { e, end } of node.ends) {
      if (e === car.e) continue;
      if (e.ow && end === 'b') continue;
      if (e.rank < 2 && Math.random() < 0.8) continue;
      opts.push({ e, end, w: e.rank >= 3 ? 3 : 1 });
    }
    if (!opts.length) { this.spawn(car, van); return false; }
    let r = Math.random() * opts.reduce((a, o) => a + o.w, 0), pick = opts[0];
    for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
    car.e = pick.e; car.dir = pick.end === 'a' ? 1 : -1; car.s = pick.end === 'a' ? 0 : pick.e.len; car.stopDone = null;
    return true;
  }
  update(dt, van, dark) {
    for (const car of this.cars) {
      const e = car.e, d = car.d || [0, 1];
      const toEnd = car.dir > 0 ? e.len - car.s : car.s;
      const v0 = (e.rank >= 3 ? 11 : 7.5) * (toEnd < 14 ? 0.7 : 1);
      // 前方の車
      let gap = 1e9, leadV = 0;
      const left = [d[1], -d[0]];
      const look = (x, z, len, v) => {
        const rx = x - car.x, rz = z - car.z;
        const along = rx * d[0] + rz * d[1], lat = Math.abs(rx * left[0] + rz * left[1]);
        if (along > 0 && along < 45 && lat < 1.7) { const g = along - (len + car.len) / 2; if (g < gap) { gap = g; leadV = v; } }
      };
      for (const o of this.cars) if (o !== car) look(o.x, o.z, o.len, o.speed);
      if (van) look(van.x, van.z, 3.4, Math.max(0, van.speed));
      // 信号と一時停止
      const key = e.id + (car.dir > 0 ? 'b' : 'a');
      const sg = this.approach.get(key);
      if (sg) {
        const dist = (sg.ap.stop.x - car.x) * d[0] + (sg.ap.stop.z - car.z) * d[1] - car.len / 2;
        const col = sg.sig.state[sg.ap.group];
        if (dist > -0.5 && dist < 70 && (col === 'r' || (col === 'y' && dist > car.speed * 1.3)) && dist < gap) { gap = Math.max(0.1, dist); leadV = 0; }
      }
      const st = this.stops.get(key);
      if (st && car.stopDone !== key) {
        const dist = (st.p[0] - car.x) * d[0] + (st.p[1] - car.z) * d[1] - car.len / 2;
        if (dist < 40 && dist > -1) {
          if (car.speed < 0.3 && dist < 2.5) { car.stopT += dt; if (car.stopT > 1.2) { car.stopDone = key; car.stopT = 0; } }
          if (dist < gap) { gap = Math.max(0.1, dist); leadV = 0; }
        }
      }
      // 車間距離を保つ追従モデル（IDM）
      const a0 = 1.6, b = 3.0, s0 = 2.2, Th = 1.3, v = car.speed;
      const sStar = s0 + v * Th + v * (v - leadV) / (2 * Math.sqrt(a0 * b));
      let acc = a0 * (1 - Math.pow(v / v0, 4) - Math.pow(sStar / Math.max(gap, 0.1), 2));
      acc = Math.max(-8, acc);
      car.speed = Math.max(0, v + acc * dt);
      car.s += car.dir * car.speed * dt;
      if (car.s > e.len || car.s < 0) {
        const over = car.s > e.len ? car.s - e.len : -car.s;
        if (this.next(car, van)) car.s += car.dir * over;
      }
      this.place(car, dt * 6);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      car.mesh.userData.tail.emissiveIntensity = acc < -1.2 ? 2 : (dark > 0.3 ? 0.7 : 0.15);
      car.mesh.userData.head.emissiveIntensity = dark > 0.3 ? 2 : 0.1;
    }
  }
}
