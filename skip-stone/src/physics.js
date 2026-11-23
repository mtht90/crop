// 水切り石の物理。three.js に依存しない純粋なシミュレーション(テストしやすいように)。
// 座標系: +Y が上、-Z が沖(投げる方向)、水面は y = 0。

export const GRAVITY = 9.81;

// 調整用の定数。数値を変えると難易度と手応えが変わる。
export const TUNING = {
  launchElevationDeg: 4, // 腕を振ったときの初速の仰角(ほぼ水平に投げる)
  minSpeed: 2.0, // これより遅くなると跳ねずに沈む (m/s)
  maxFirstAngleDeg: 42, // 最初の入水角がこれより深いと「ドボン」
  idealAngleDeg: 20, // 最もよく跳ねる入水角
  curveAccel: 1.6, // 回転によるカーブの横加速度 (m/s^2, 回転量1のとき)
  airDrag: 0.03, // 空気抵抗 (1/s)
};

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * 投げた瞬間のパラメータから石の状態を作る。
 * @param {object} p
 * @param {{x:number,y:number,z:number}} p.pos 放した位置
 * @param {number} p.speed 水平方向の初速 (m/s)
 * @param {number} p.yaw 向き (rad, +で右)
 * @param {number} p.quality 石の傾きの良さ 0..1(リングのタイミングで決まる)
 * @param {number} p.spin 回転量 0..1.5(1 を超えると回しすぎ)
 * @param {number} p.spinDir +1 で右へカーブ、-1 で左へ
 */
export function createStone(p) {
  const el = TUNING.launchElevationDeg * DEG;
  const spin = clamp(p.spin, 0, 1);
  // 回しすぎ: 0..1。カーブが効きすぎ、石がぐらついて早く沈みやすい
  const over = clamp((p.spin - 1) / 0.5, 0, 1);
  return {
    pos: { ...p.pos },
    vel: {
      x: Math.sin(p.yaw) * p.speed,
      y: Math.tan(el) * p.speed,
      z: -Math.cos(p.yaw) * p.speed,
    },
    quality: clamp(p.quality, 0, 1),
    spin,
    over,
    spinDir: p.spinDir || 0,
    // 回転が弱いほど不安定。回しすぎも不安定
    wobble: (1 - clamp(p.quality, 0, 1)) * 0.25 + 0.12 * (1 - spin) + 0.45 * over,
    skips: 0,
    sunk: false,
    start: { ...p.pos },
    path: 0, // 水平方向に進んだ道のり
    lastContact: null,
    rand: p.rand || Math.random,
  };
}

export function horizontalSpeed(s) {
  return Math.hypot(s.vel.x, s.vel.z);
}

/**
 * dt 秒進める。発生したイベント(skip / sink)の配列を返す。
 */
export function stepStone(s, dt) {
  const events = [];
  if (s.sunk) return events;

  const vh = horizontalSpeed(s);
  // 回転によるカーブ(進行方向に垂直な横向きの力)
  if (vh > 0.01 && s.spinDir !== 0 && s.spin > 0) {
    const nx = -s.vel.z / vh;
    const nz = s.vel.x / vh;
    const a = TUNING.curveAccel * s.spin * (1 + 1.2 * s.over) * s.spinDir * Math.min(1, vh / 10);
    s.vel.x += nx * a * dt;
    s.vel.z += nz * a * dt;
  }
  // 空気抵抗
  const drag = Math.exp(-TUNING.airDrag * dt);
  s.vel.x *= drag;
  s.vel.z *= drag;
  s.vel.y -= GRAVITY * dt;

  const px = s.pos.x;
  const pz = s.pos.z;
  s.pos.x += s.vel.x * dt;
  s.pos.y += s.vel.y * dt;
  s.pos.z += s.vel.z * dt;
  s.path += Math.hypot(s.pos.x - px, s.pos.z - pz);

  if (s.pos.y <= 0 && s.vel.y < 0) {
    s.pos.y = 0;
    events.push(contact(s));
  }
  return events;
}

function contact(s) {
  const vh = horizontalSpeed(s);
  const vyIn = -s.vel.y;
  const angle = Math.atan2(vyIn, vh) / DEG;
  const at = { x: s.pos.x, y: 0, z: s.pos.z };
  const wobbleIn = s.wobble; // 着水した瞬間のぐらつき(判定に使う)
  s.lastContact = at;

  const sink = (reason) => {
    s.sunk = true;
    s.vel.x *= 0.15;
    s.vel.z *= 0.15;
    s.vel.y = -0.6;
    return { type: 'sink', reason, at, angle, speed: vh, skips: s.skips, wobble: wobbleIn };
  };

  if (s.skips === 0 && angle > TUNING.maxFirstAngleDeg) return sink('steep');
  if (vh < TUNING.minSpeed) return sink('slow');
  if (s.wobble >= 1) return sink('tumble');

  const q = s.quality;
  const over = Math.max(0, (angle - TUNING.idealAngleDeg) / 25);
  // 傾きも回転も完璧に近いと、ほとんど減速せずに跳ね続ける(ハマると長く続く)
  const perfect = Math.pow(q, 4) * s.spin * (1 - s.over);
  let loss = 0.055 + 0.15 * (1 - q) + 0.22 * over * over + 0.16 * s.wobble - 0.03 * s.spin - 0.022 * perfect;
  loss = clamp(loss, 0.022, 0.6);
  const vhNew = vh * (1 - loss);
  if (vhNew < TUNING.minSpeed) return sink('slow');

  // 跳ね返り: 速いほど石が揚力を得て高く跳ぶ
  const lift = vhNew * 0.11 * (0.65 + 0.35 * q);
  const vyOut = Math.max(vyIn * (0.5 + 0.15 * q), lift);

  // 進行方向のぶれ(ぐらつき)と回転によるそれ
  const jitter = (s.rand() - 0.5) * s.wobble * 0.14 + s.spinDir * s.spin * 0.015;
  const yaw = Math.atan2(s.vel.x, -s.vel.z) + jitter;
  s.vel.x = Math.sin(yaw) * vhNew;
  s.vel.z = -Math.cos(yaw) * vhNew;
  s.vel.y = vyOut;
  s.pos.y = 0.001;

  s.wobble = Math.max(0, s.wobble + 0.03 + 0.05 * (1 - q) - 0.028 * s.spin + 0.07 * s.over);
  s.spin *= 0.95;
  s.skips += 1;
  return { type: 'skip', index: s.skips, at, angle, speed: vhNew, impact: vyIn, wobble: wobbleIn };
}

/** 石が放たれた地点からの直線距離 (m) */
export function distanceFromStart(s, at = s.pos) {
  return Math.hypot(at.x - s.start.x, at.z - s.start.z);
}

/** 1投ぶんの点数を計算する */
/**
 * 最初の着水の出来。入水角が理想(20°)に近く、石がぐらついていないほど良い。
 * @returns {{judge: 'excellent'|'great'|'nice'|null, value: number}}
 */
export function judgeEntry(angle, wobble) {
  const angleScore = clamp(1 - Math.abs(angle - TUNING.idealAngleDeg) / 12, 0, 1);
  const stable = clamp(1 - wobble / 0.6, 0, 1);
  const value = 0.65 * angleScore + 0.35 * stable;
  const judge = value >= 0.84 ? 'excellent' : value >= 0.64 ? 'great' : value >= 0.4 ? 'nice' : null;
  return { judge, value };
}

export const JUDGE_MUL = { nice: 1.5, great: 2, excellent: 3 };

/** 回転量(0..1.5)からカーブの得点倍率。回しすぎても上がらない */
export function curveMultiplier(spin) {
  if (!spin) return 1;
  return Math.round((1 + 0.4 * Math.min(1, spin)) * 100) / 100;
}

/**
 * i 回目のスキップの点。1回目から毎回 SKIP_GROWTH 倍ずつなめらかに増える(上限なし)。
 */
export const SKIP_BASE = 15;
export const SKIP_GROWTH = 1.09;
export function skipPoint(i) {
  return Math.round(SKIP_BASE * Math.pow(SKIP_GROWTH, i - 1));
}

export function skipPoints(n) {
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += skipPoint(i);
  return sum;
}

/** 1投ぶんの点数を計算する */
export function scoreThrow({ skips, distance, judge, curveMul = 1, rings, streak }) {
  const skipPts = skipPoints(skips);
  const distPts = Math.round(distance * 6);
  const ringPts = rings * 250;
  const judgeMul = JUDGE_MUL[judge] || 1;
  const streakMul = judge === 'excellent' && streak > 1 ? 1 + 0.2 * (streak - 1) : 1;
  const base = skipPts + distPts + ringPts;
  const total = Math.round(base * judgeMul * curveMul * streakMul);
  return { skipPts, distPts, ringPts, judgeMul, curveMul, streakMul, base, total };
}
