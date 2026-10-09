// =====================================================================
//  玉の物理 (盤面の平面上の 2D)。DOM 非依存なので node で入賞率を検証できる
//   座標は盤面中心が原点、単位 m、y が上。
//   釘 = 小さな円、レール・ガイド = 線分、入賞口 = 上から入ると吸い込むセンサー
// =====================================================================
export const BALL_R = 0.0055;
export const NAIL_R = 0.0009;
export const FIELD_R = 0.215;

// 盤面のレイアウト
export function buildLayout() {
  const L = {
    lcd: { x: 0, y: 0.045, w: 0.212, h: 0.152 },    // 液晶の枠 (玉は外側を通る)
    heso: { x: 0, y: -0.074, hw: 0.0078 },           // スタートチャッカー
    denchu: { x: 0.104, y: -0.094, hwOpen: 0.014 },   // 電チュー (右打ち)
    gate: { x: 0.198, y: 0.0, hw: 0.013 },          // スルーチャッカー (普図)
    attacker: { x0: 0.044, x1: 0.098, y: -0.142 },    // アタッカー (大入賞口)
    pockets: [{ x: -0.128, y: -0.112, hw: 0.0055 }, { x: -0.07, y: -0.152, hw: 0.0055 }], // 一般入賞口
    windmills: [{ x: -0.142, y: 0.012, r: 0.0085 }, { x: 0.142, y: 0.105, r: 0.0085 }],
    nails: [],
    segs: [],
  };
  const N = (x, y) => L.nails.push({ x, y });
  const free = (x, y) => {
    const { lcd } = L;
    if (Math.hypot(x, y) > FIELD_R - 0.018) return false;
    if (Math.abs(x - lcd.x) < lcd.w / 2 + 0.014 && Math.abs(y - lcd.y) < lcd.h / 2 + 0.014) return false;
    for (const w of L.windmills) if (Math.hypot(x - w.x, y - w.y) < 0.022) return false;
    for (const p of L.pockets) if (Math.abs(x - p.x) < 0.02 && Math.abs(y - p.y) < 0.016) return false;
    if (Math.abs(x) < 0.03 && y < -0.05 && y > -0.1) return false;   // ヘソ周り (別に配置)
    if (Math.abs(x) < 0.14 && y < -0.02 && y > -0.066) return false;  // ステージと道釘
    if (x > 0.02 && y < -0.05) return false;                          // 右下の役物エリア
    if (x > 0.12 && y < 0.04 && y > -0.05) return false;             // 右ルート (ゲート)
    return true;
  };
  // 釘の森 (ずらし格子)
  const sp = 0.0215;
  for (let row = 0; row < 22; row++) {
    const y = 0.2 - row * sp * 0.866;
    for (let col = -11; col <= 11; col++) {
      const x = col * sp + (row % 2 ? sp / 2 : 0);
      if (x > 0.12 && y > 0.04 && y < 0.17) continue;   // 右上は打ち出しの通り道
      if (free(x, y)) N(x, y);
    }
  }
  // 命釘 (ヘソの両脇) と 道釘 (液晶下からヘソへ寄せる列)
  N(-0.0098, -0.068); N(0.0098, -0.068);
  for (let i = 0; i < 7; i++) { N(-0.125 + i * 0.0135, -0.06 - i * 0.0018); N(0.125 - i * 0.0135, -0.06 - i * 0.0018); }
  N(-0.022, -0.085); N(0.022, -0.085); N(-0.03, -0.098); N(0.03, -0.098);
  // ステージ (液晶の下端)。中央が少しくぼんでヘソへ落ちる
  L.segs.push({ a: [-0.115, -0.044], b: [-0.014, -0.052] }, { a: [0.014, -0.052], b: [0.115, -0.044] });
  // 右ルートのガイド: ゲート → 電チュー → アタッカー
  L.segs.push({ a: [0.207, -0.04], b: [0.122, -0.088] });                    // 電チューへ寄せる板
  L.segs.push({ a: [0.12, -0.112], b: [0.098, -0.12] });                    // アタッカー右の板
  L.segs.push({ a: [0.098, -0.12], b: [0.044, -0.14], door: 'attacker' });   // アタッカーの扉 (閉じているときだけ当たる)
  L.segs.push({ a: [0.044, -0.14], b: [0.02, -0.15] });
  L.segs.push({ a: [0.036, -0.075], b: [0.036, -0.128] });                    // 右ルートの仕切り (勢いのある玉を受け止める)
  L.segs.push({ a: [0.122, -0.088], b: [0.088, -0.094], door: 'denchu' });   // 電チューの羽 (閉じているときは屋根)
  return L;
}

// ------------------------------------------------------------
//  シミュレーション本体
// ------------------------------------------------------------
export class BallWorld {
  constructor(pcfg, layout = buildLayout(), rng = Math.random) {
    this.p = pcfg.physics;
    this.L = layout;
    this.rng = rng;
    this.balls = [];
    this.open = { attacker: false, denchu: false };
    this.events = [];       // { type, ball } を毎ステップ積む (呼び出し側が取り出す)
    this.windAngle = 0;
    // 釘の空間グリッド
    this.cell = 0.024;
    this.grid = new Map();
    layout.nails.forEach((n, i) => {
      const k = this.key(Math.floor(n.x / this.cell), Math.floor(n.y / this.cell));
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(i);
    });
  }

  key(i, j) { return i * 1000 + j; }

  // 発射。power 0..1 で盤面に入る位置が変わる (弱いと左、強いと右上まで回る)
  launch(power) {
    if (power < 0.06) { this.events.push({ type: 'foul' }); return null; }
    // 左打ち (0.4〜0.6) は左上、右打ち (0.9 以上) は右上まで回って盤面に入る
    const th = (165 - 135 * Math.pow(power, 1.6) + (this.rng() - 0.5) * 6) * Math.PI / 180;
    const R = FIELD_R - BALL_R - 0.002;
    const v = 0.55 + power * 0.55;
    const b = { x: Math.cos(th) * R, y: Math.sin(th) * R, vx: Math.sin(th) * v, vy: -Math.cos(th) * v, alive: true, age: 0, id: Math.random(), gate: false };
    this.balls.push(b);
    return b;
  }

  step(dt) {
    // フレームが重くても玉が板をすり抜けないよう、1 ステップは最大 4ms に刻む
    const n = Math.max(this.p.substeps, Math.ceil(dt / 0.004));
    const h = dt / n;
    for (let s = 0; s < n; s++) this.sub(h);
    this.windAngle += dt * 6;
    this.balls = this.balls.filter((b) => b.alive);
  }

  sub(h) {
    const g = this.p.gravity;
    const L = this.L;
    const rr = BALL_R + NAIL_R;
    for (const b of this.balls) {
      if (!b.alive) continue;
      b.age += h;
      b.vy -= g * h;
      b.vx *= 0.9995; b.vy *= 0.9995;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 1.6) { b.vx *= 1.6 / sp; b.vy *= 1.6 / sp; }
      const px = b.x, py = b.y;
      b.x += b.vx * h; b.y += b.vy * h;
      // 外周
      const d = Math.hypot(b.x, b.y), lim = FIELD_R - BALL_R;
      if (d > lim) {
        const nx = b.x / d, ny = b.y / d;
        b.x = nx * lim; b.y = ny * lim;
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny; }
      }
      // 釘
      const ci = Math.floor(b.x / this.cell), cj = Math.floor(b.y / this.cell);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const list = this.grid.get(this.key(i, j));
        if (!list) continue;
        for (const k of list) {
          const nl = L.nails[k];
          const dx = b.x - nl.x, dy = b.y - nl.y, dd = dx * dx + dy * dy;
          if (dd < rr * rr && dd > 1e-12) this.bounce(b, dx, dy, Math.sqrt(dd), rr, this.p.restitution, true);
        }
      }
      // 風車 (回転して玉を弾く)
      for (const w of L.windmills) {
        const dx = b.x - w.x, dy = b.y - w.y, dd = Math.hypot(dx, dy), r = w.r + BALL_R;
        if (dd < r && dd > 1e-9) {
          this.bounce(b, dx, dy, dd, r, 0.3, false);
          b.vx += (-dy / dd) * 0.25; b.vy += (dx / dd) * 0.25; // 回転方向に流す
        }
      }
      // 液晶の枠 (角丸の箱)
      const lc = L.lcd;
      const qx = Math.max(lc.x - lc.w / 2, Math.min(b.x, lc.x + lc.w / 2));
      const qy = Math.max(lc.y - lc.h / 2, Math.min(b.y, lc.y + lc.h / 2));
      { const dx = b.x - qx, dy = b.y - qy, dd = Math.hypot(dx, dy);
        if (dd < BALL_R) { if (dd < 1e-9) { b.y = lc.y + lc.h / 2 + BALL_R; b.vy = Math.abs(b.vy) * 0.3; } else this.bounce(b, dx, dy, dd, BALL_R, 0.25, false); } }
      // ガイド板・扉
      for (const sg of L.segs) {
        if (sg.door && this.open[sg.door]) continue;
        this.segHit(b, sg);
      }
      // センサー: 上から開口部を通過したら入賞
      const cross = (y) => py >= y && b.y < y;
      if (cross(L.heso.y) && Math.abs(b.x - L.heso.x) < L.heso.hw) { this.capture(b, 'heso'); continue; }
      if (this.open.denchu && cross(L.denchu.y) && Math.abs(b.x - L.denchu.x) < L.denchu.hwOpen) { this.capture(b, 'denchu'); continue; }
      if (this.open.attacker && b.y < L.attacker.y && py >= L.attacker.y - 0.004 && b.x > L.attacker.x0 && b.x < L.attacker.x1) { this.capture(b, 'attacker'); continue; }
      for (const pk of L.pockets) if (cross(pk.y) && Math.abs(b.x - pk.x) < pk.hw) { this.capture(b, 'general'); break; }
      if (!b.alive) continue;
      if (!b.gate && Math.abs(b.x - L.gate.x) < L.gate.hw && cross(L.gate.y)) { b.gate = true; this.events.push({ type: 'gate', ball: b }); }
      // アウト
      if (b.y < -FIELD_R + 0.03 || b.age > 20) { b.alive = false; this.events.push({ type: 'out', ball: b }); }
    }
  }

  bounce(b, dx, dy, dd, r, e, jitter) {
    const nx = dx / dd, ny = dy / dd;
    b.x += nx * (r - dd); b.y += ny * (r - dd);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
      if (jitter) {
        const j = this.p.jitter * (this.rng() - 0.5) * 2;
        b.vx += -ny * j; b.vy += nx * j;
        if (-vn > 0.25) this.events.push({ type: 'pin', ball: b, v: -vn });
      }
    }
  }

  segHit(b, sg) {
    const [ax, ay] = sg.a, [bx, by] = sg.b;
    const ex = bx - ax, ey = by - ay, ll = ex * ex + ey * ey;
    let t = ((b.x - ax) * ex + (b.y - ay) * ey) / ll;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + ex * t, qy = ay + ey * t;
    const dx = b.x - qx, dy = b.y - qy, dd = Math.hypot(dx, dy);
    if (dd < BALL_R + 0.0015 && dd > 1e-9) this.bounce(b, dx, dy, dd, BALL_R + 0.0015, 0.15, false);
  }

  capture(b, type) {
    b.alive = false;
    this.events.push({ type, ball: b });
  }
}
