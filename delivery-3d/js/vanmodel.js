// 軽バン（配送用・右ハンドル）の見た目：外装と運転席
// ローカル座標：+z が前、+x が車の左側（助手席・歩道側）、y が上。全長 3.4m・全幅 1.48m・全高 1.89m
// 外板は「横から見た形」の薄い板を左右に置き、窓とスライドドアの開口をくり抜いて作る（中は空洞）
import * as THREE from 'three';
import { A, Batch, textTexture, JP_FONT } from './assets.js';

export const WD = 1.48, WB = 2.4, WHEEL_R = 0.28;
const T = 0.022, BT = 0.006; // 外板の厚みと面取り
const WS_BASE = { z: 1.515, y: 1.10 }, WS_TOP = { z: 1.095, y: 1.835 }; // フロントガラスの下端・上端
const WS_ANG = Math.atan2(WS_BASE.z - WS_TOP.z, WS_TOP.y - WS_BASE.y); // 寝かせ角
const SLIDE = { z0: -0.50, z1: 0.36, y0: 0.42, y1: 1.82 };  // スライドドアの開口
const DRV = { x: -0.36 };                                     // 運転席の中心

// ---------------- 形を作る小道具 ----------------
function rrectShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape(), x0 = cx - w / 2, y0 = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
function rrectPath(w, h, r, cx, cy) {
  const p = new THREE.Path(), x0 = cx - w / 2, y0 = cy - h / 2;
  p.moveTo(x0 + r, y0); p.lineTo(x0 + w - r, y0); p.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  p.lineTo(x0 + w, y0 + h - r); p.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  p.lineTo(x0 + r, y0 + h); p.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}
function polyPath(pts, r = 0.035) {
  // 角を丸めた多角形
  const p = new THREE.Path(), n = pts.length;
  const at = (i) => pts[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1);
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k1 = Math.min(r, l1 / 2) / l1, k2 = Math.min(r, l2 / 2) / l2;
    const p1 = [b[0] + (a[0] - b[0]) * k1, b[1] + (a[1] - b[1]) * k1], p2 = [b[0] + (c[0] - b[0]) * k2, b[1] + (c[1] - b[1]) * k2];
    if (i === 0) p.moveTo(p1[0], p1[1]); else p.lineTo(p1[0], p1[1]);
    p.quadraticCurveTo(b[0], b[1], p2[0], p2[1]);
  }
  p.closePath();
  return p;
}
// 角の丸い箱（中心が原点）
const _rbCache = new Map();
export function rbox(w, h, d, r = 0.02) {
  const key = [w, h, d, r].map(v => v.toFixed(3)).join(',');
  if (_rbCache.has(key)) return _rbCache.get(key);
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(rrectShape(w - 2 * r, h - 2 * r, Math.min(r, 0.004)), { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  _rbCache.set(key, g);
  return g;
}
// 2点をつなぐ円柱（パイプ・腕）
const _up = new THREE.Vector3(0, 1, 0);
function placeBetween(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(_up, d.normalize());
  mesh.scale.set(1, len, 1);
}
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// ---------------- テクスチャ ----------------
// 側面：u = z（-1.75〜1.75m）、v = y（0.25〜1.95m）
const SIDE_U0 = -1.75, SIDE_U1 = 1.75, SIDE_V0 = 0.25, SIDE_V1 = 1.95;
function sideTexture(left) {
  const W = 2048, H = 1000;
  const t = textTexture(W, H, (c) => {
    const X = (z) => (z - SIDE_U0) / (SIDE_U1 - SIDE_U0) * W, Y = (y) => (1 - (y - SIDE_V0) / (SIDE_V1 - SIDE_V0)) * H;
    c.fillStyle = '#f2f2ef'; c.fillRect(0, 0, W, H);
    // ロッカー付近の汚れ
    const g = c.createLinearGradient(0, Y(0.62), 0, Y(0.28));
    g.addColorStop(0, 'rgba(120,115,105,0)'); g.addColorStop(1, 'rgba(110,104,92,0.35)');
    c.fillStyle = g; c.fillRect(0, Y(0.62), W, Y(0.28) - Y(0.62));
    // 社名の帯（緑と黄）
    c.fillStyle = '#2f7d4f'; c.fillRect(0, Y(0.66), W, Y(0.585) - Y(0.66));
    c.fillStyle = '#e0a92a'; c.fillRect(0, Y(0.575), W, Y(0.555) - Y(0.575));
    // 継ぎ目（パネルの合わせ目）
    c.strokeStyle = 'rgba(40,42,44,0.85)'; c.lineWidth = 3; c.lineJoin = 'round';
    const seam = (pts) => { c.beginPath(); pts.forEach(([z, y], i) => i ? c.lineTo(X(z), Y(y)) : c.moveTo(X(z), Y(y))); c.stroke(); };
    // 前のドア（前輪のアーチをよけて下がる）
    c.beginPath(); c.moveTo(X(0.40), Y(1.86)); c.lineTo(X(0.40), Y(0.42)); c.lineTo(X(0.80), Y(0.42));
    c.arc(X(1.2), Y(0.28), 0.42 / (SIDE_U1 - SIDE_U0) * W, Math.PI + 0.32, Math.PI * 1.62, false);
    c.lineTo(X(1.47), Y(0.68)); c.lineTo(X(1.47), Y(1.07)); c.stroke();
    if (!left) {
      // 右側：スライドドアの継ぎ目（開かない）
      seam([[SLIDE.z0, SLIDE.y0], [SLIDE.z1, SLIDE.y0], [SLIDE.z1, SLIDE.y1], [SLIDE.z0, SLIDE.y1], [SLIDE.z0, SLIDE.y0]]);
      // 給油口
      c.beginPath(); c.roundRect(X(-1.44), Y(1.0), X(-1.28) - X(-1.44), Y(0.88) - Y(1.0), 10); c.stroke();
    }
    // スライドレールのカバー
    c.lineWidth = 5; seam([[-1.62, 1.07], [-0.52, 1.07]]);
    // ドアの取っ手まわりのくぼみ
    for (const z of [0.56]) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.beginPath(); c.ellipse(X(z), Y(1.0), 26, 13, 0, 0, 7); c.fill(); }
    // 社名（荷室の後ろ側）
    c.save();
    if (left) { c.translate(W, 0); c.scale(-1, 1); }
    const cx = left ? W - X(-1.06) : X(-1.06);
    c.fillStyle = '#2f7d4f'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 84px ${JP_FONT}`; c.fillText('あおば運輸', cx, Y(0.86));
    c.font = `500 30px ${JP_FONT}`; c.fillStyle = '#56616b'; c.fillText('まちの宅配便', cx, Y(0.745));
    // 葉っぱのマーク
    c.fillStyle = '#e0a92a'; c.beginPath(); c.ellipse(cx - 270, Y(0.86), 30, 16, -0.6, 0, 7); c.fill();
    c.fillStyle = '#2f7d4f'; c.beginPath(); c.ellipse(cx - 248, Y(0.88), 30, 16, 0.5, 0, 7); c.fill();
    c.restore();
  });
  t.repeat.set(1 / (SIDE_U1 - SIDE_U0), 1 / (SIDE_V1 - SIDE_V0));
  t.offset.set(-SIDE_U0 / (SIDE_U1 - SIDE_U0), -SIDE_V0 / (SIDE_V1 - SIDE_V0));
  return t;
}
function hatchTexture() {
  const W = 1024, H = 1024, X0 = -0.7, X1 = 0.7, Y0 = 0.45, Y1 = 1.9;
  const t = textTexture(W, H, (c) => {
    const X = (x) => (x - X0) / (X1 - X0) * W, Y = (y) => (1 - (y - Y0) / (Y1 - Y0)) * H;
    c.fillStyle = '#f2f2ef'; c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, Y(0.8), 0, Y(0.5));
    g.addColorStop(0, 'rgba(110,104,92,0)'); g.addColorStop(1, 'rgba(110,104,92,0.3)');
    c.fillStyle = g; c.fillRect(0, Y(0.8), W, Y(0.5) - Y(0.8));
    // 背面から見ると左右反転するので、文字は反転して描く
    c.save(); c.translate(W, 0); c.scale(-1, 1);
    c.fillStyle = '#2f7d4f'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 70px ${JP_FONT}`; c.fillText('あおば運輸', W / 2, Y(1.02));
    c.restore();
    c.fillStyle = '#2f7d4f'; c.fillRect(0, Y(0.94), W, Y(0.915) - Y(0.94));
  });
  t.repeat.set(1 / (X1 - X0), 1 / (Y1 - Y0));
  t.offset.set(-X0 / (X1 - X0), -Y0 / (Y1 - Y0));
  return t;
}
function fabricTexture(base, stripe) {
  const t = textTexture(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const img = c.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const x = (i / 4) % w, y = Math.floor(i / 4 / w);
      const n = ((x * 7 + y * 13) % 5) * 2 + (Math.random() * 10 - 5) + ((x + y) % 2 ? 4 : -4);
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    c.putImageData(img, 0, 0);
    if (stripe) { c.fillStyle = stripe; for (let x = 96; x < 160; x += 12) c.fillRect(x, 0, 6, h); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function grainTexture(base, amp = 10) {
  const t = textTexture(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const img = c.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    c.putImageData(img, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
}
function wheelFaceTexture() {
  return textTexture(256, 256, (c, w) => {
    const C = w / 2;
    c.fillStyle = '#151515'; c.fillRect(0, 0, w, w);
    // 鉄ホイール
    c.fillStyle = '#5b5f62'; c.beginPath(); c.arc(C, C, 120, 0, 7); c.fill();
    c.fillStyle = '#6c7073'; c.beginPath(); c.arc(C, C, 100, 0, 7); c.fill();
    c.fillStyle = '#1d1f20';
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; c.beginPath(); c.ellipse(C + Math.cos(a) * 76, C + Math.sin(a) * 76, 18, 12, a, 0, 7); c.fill(); }
    // センターキャップ
    const g = c.createRadialGradient(C - 10, C - 10, 4, C, C, 46); g.addColorStop(0, '#e9ecee'); g.addColorStop(1, '#8d9397');
    c.fillStyle = g; c.beginPath(); c.arc(C, C, 44, 0, 7); c.fill();
    c.fillStyle = '#3a3d40'; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.78; c.beginPath(); c.arc(C + Math.cos(a) * 58, C + Math.sin(a) * 58, 6, 0, 7); c.fill(); }
  });
}
function dirtTexture() {
  // フロントガラスの薄い汚れ（ワイパーが拭いた扇形はきれい）
  const t = textTexture(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const edge = Math.min(x, w - x, h - y) < 50 || y < 40 ? 1 : 0.25;
      c.fillStyle = `rgba(160,150,130,${(Math.random() * 0.25 + 0.05) * edge})`;
      c.beginPath(); c.arc(x, y, Math.random() * 2.2 + 0.3, 0, 7); c.fill();
    }
    c.globalCompositeOperation = 'destination-out';
    for (const cx of [w * 0.24, w * 0.64]) {
      const g = c.createRadialGradient(cx, h, 40, cx, h, w * 0.4);
      g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.9, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(cx, h); c.arc(cx, h, w * 0.4, Math.PI * 1.02, Math.PI * 1.98); c.fill();
    }
  });
  return t;
}
function slipsTexture() {
  return textTexture(256, 340, (c, w, h) => {
    c.fillStyle = '#fbfaf4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2f7d4f'; c.fillRect(0, 0, w, 34);
    c.fillStyle = '#fff'; c.font = `bold 20px ${JP_FONT}`; c.fillText('配達リスト', 12, 24);
    c.strokeStyle = '#c9c6bb'; c.lineWidth = 2;
    for (let y = 60; y < h; y += 26) { c.beginPath(); c.moveTo(10, y); c.lineTo(w - 10, y); c.stroke(); }
    c.fillStyle = '#3c4148'; c.font = `16px ${JP_FONT}`;
    ['田中様 1-4-2', '森様 喫茶こもれび', '山本様 201', '鈴木様', '佐藤様 1-5-3'].forEach((s, i) => c.fillText(s, 14, 54 + 26 * (i + 1)));
  });
}

// =========================================================
// 組み立て
// =========================================================
export function buildVanModel(van) {
  const m = A.mats;
  const B = new Batch();           // 動かない部品はまとめて描く
  const body = van.body;
  const S = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, opts) => B.add(geo, mat, M4(x, y, z, rx, ry, rz), opts);
  const add = (mesh, parent = body, shadow = true) => { mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ---------------- 材質 ----------------
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf3f3f1, roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 });
  van.paint = paint;
  const paintL = paint.clone(); paintL.map = sideTexture(true);
  const paintR = paint.clone(); paintR.map = sideTexture(false);
  const paintH = paint.clone(); paintH.map = hatchTexture();
  const blackTrim = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.62, map: grainTexture('#ffffff', 18) });
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.7, map: grainTexture('#ffffff', 22) });
  const rubber = m.rubber, chrome = m.chrome;
  const glassFront = m.glassClear;
  const glassPrivacy = new THREE.MeshPhysicalMaterial({ color: 0x0f1416, roughness: 0.05, transparent: true, opacity: 0.78, envMapIntensity: 1.5, depthWrite: false });
  const dashUpper = new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.82, map: grainTexture('#ffffff', 26) });
  const dashLower = new THREE.MeshStandardMaterial({ color: 0x6a6e72, roughness: 0.75, map: grainTexture('#ffffff', 20) });
  const trimGray = new THREE.MeshStandardMaterial({ color: 0x7b7f83, roughness: 0.78, map: grainTexture('#ffffff', 16) });
  const headliner = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.95, map: fabricTexture('#ffffff'), side: THREE.DoubleSide });
  const seatFab = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.95, map: fabricTexture('#ffffff', 'rgba(0,0,0,0.12)') });
  const seatSide = new THREE.MeshStandardMaterial({ color: 0x3f444a, roughness: 0.9, map: fabricTexture('#ffffff') });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.95, map: grainTexture('#ffffff', 30) });
  const cargoFloor = new THREE.MeshStandardMaterial({ color: 0x55585b, roughness: 0.55, metalness: 0.35, map: grainTexture('#ffffff', 14) });
  const steelPaint = new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.45, metalness: 0.1 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x40444a, roughness: 0.95, map: fabricTexture('#ffffff') });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2f5a46, roughness: 0.9, map: fabricTexture('#ffffff') });
  const amberLens = (k = 0) => new THREE.MeshStandardMaterial({ color: 0x8a5a10, emissive: 0xffa020, emissiveIntensity: k, roughness: 0.25 });
  van.blinkMatL = amberLens(); van.blinkMatR = amberLens();

  // ---------------- 外板：左右の側面 ----------------
  function sideShape(left) {
    const s = new THREE.Shape();
    const ar = 0.365, ac = 0.27; // ホイールアーチ（半径・中心の高さ）
    const aa = Math.asin((0.30 - ac) / ar);
    s.moveTo(-1.70, 0.36);
    s.quadraticCurveTo(-1.70, 0.30, -1.64, 0.30);
    s.lineTo(-1.2 - ar * Math.cos(aa), 0.30);
    s.absarc(-1.2, ac, ar, Math.PI - aa, aa, true);
    s.lineTo(1.2 - ar * Math.cos(aa), 0.30);
    s.absarc(1.2, ac, ar, Math.PI - aa, aa, true);
    s.lineTo(1.64, 0.30);
    s.quadraticCurveTo(1.71, 0.30, 1.71, 0.40);
    s.lineTo(1.71, 0.84);
    s.quadraticCurveTo(1.71, 0.99, 1.62, 1.04);
    s.lineTo(WS_BASE.z, WS_BASE.y);
    s.lineTo(WS_TOP.z + 0.01, WS_TOP.y - 0.01);
    s.quadraticCurveTo(WS_TOP.z - 0.03, 1.885, WS_TOP.z - 0.10, 1.885);
    s.lineTo(-1.64, 1.885);
    s.quadraticCurveTo(-1.70, 1.885, -1.70, 1.82);
    s.lineTo(-1.70, 0.36);
    // 窓とドアの開口
    const k = (WS_BASE.z - WS_TOP.z) / (WS_TOP.y - WS_BASE.y);
    const fz = (y) => WS_BASE.z - (y - WS_BASE.y) * k - 0.085; // フロントガラスに沿った前ドア窓の前端
    s.holes.push(polyPath([[0.45, 1.115], [fz(1.115), 1.115], [fz(1.765), 1.765], [0.45, 1.765]], 0.04));
    s.holes.push(polyPath([[-1.60, 1.115], [-0.56, 1.115], [-0.56, 1.765], [-1.60, 1.765]], 0.045));
    if (left) s.holes.push(polyPath([[SLIDE.z0, SLIDE.y0], [SLIDE.z1, SLIDE.y0], [SLIDE.z1, SLIDE.y1], [SLIDE.z0, SLIDE.y1]], 0.03));
    else s.holes.push(polyPath([[-0.44, 1.115], [0.30, 1.115], [0.30, 1.765], [-0.44, 1.765]], 0.04));
    return s;
  }
  const extrudeOpts = { depth: T, bevelEnabled: true, bevelThickness: BT, bevelSize: BT, bevelSegments: 2, curveSegments: 14 };
  for (const side of [1, -1]) {
    const g = new THREE.ExtrudeGeometry(sideShape(side > 0), extrudeOpts);
    g.rotateY(-Math.PI / 2);
    g.translate(side > 0 ? WD / 2 - BT : -WD / 2 + T + BT, 0, 0);
    add(new THREE.Mesh(g, [side > 0 ? paintL : paintR, paint]));
  }
  // 窓ガラス（前ドアは透明、後ろはスモーク）
  const sideX = WD / 2 - T / 2 - BT;
  for (const s of [1, -1]) {
    const k = (WS_BASE.z - WS_TOP.z) / (WS_TOP.y - WS_BASE.y);
    const fsh = new THREE.Shape([[0.45, 1.115], [WS_BASE.z - 0.085 - 0.015 * k, 1.115], [WS_BASE.z - (1.765 - WS_BASE.y) * k - 0.085, 1.765], [0.45, 1.765]].map(([a, b]) => new THREE.Vector2(a, b)));
    const fg = new THREE.ShapeGeometry(fsh); fg.rotateY(-Math.PI / 2); fg.translate(s * sideX, 0, 0);
    const fgm = new THREE.Mesh(fg, glassFront); fgm.material.side = THREE.DoubleSide; body.add(fgm);
    const rq = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.66), glassPrivacy); rq.position.set(s * sideX, 1.44, -1.08); rq.rotation.y = Math.PI / 2; rq.material.side = THREE.DoubleSide; body.add(rq);
    if (s < 0) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.66), glassPrivacy); sw.position.set(s * sideX, 1.44, -0.07); sw.rotation.y = Math.PI / 2; body.add(sw); }
    // 窓まわりの黒いゴム
    S(box(0.012, 0.014, 0.95), blackTrim, s * (WD / 2 + 0.001), 1.112, 0.92);
    S(box(0.012, 0.014, 1.05), blackTrim, s * (WD / 2 + 0.001), 1.112, -1.08);
    // 前ドアの取っ手
    S(rbox(0.035, 0.032, 0.15, 0.012), blackTrim, s * (WD / 2 + 0.012), 1.0, 0.56);
    // サイドマーカー（前のフェンダー）
    const sm = new THREE.Mesh(rbox(0.016, 0.03, 0.07, 0.006), s > 0 ? van.blinkMatL : van.blinkMatR); sm.position.set(s * (WD / 2 + 0.006), 0.78, 1.47); body.add(sm);
    // 泥よけ
    for (const z of [-1.62, 0.78]) S(box(0.012, 0.16, 0.13), rubber, s * (WD / 2 - 0.08), 0.33, z);
  }

  // ---------------- 前まわり ----------------
  // 鼻先（短いボンネット）
  const nose = new THREE.Shape();
  nose.moveTo(1.40, 0.30); nose.lineTo(1.64, 0.30); nose.quadraticCurveTo(1.71, 0.30, 1.71, 0.40); nose.lineTo(1.71, 0.84);
  nose.quadraticCurveTo(1.71, 0.99, 1.62, 1.04); nose.lineTo(WS_BASE.z, WS_BASE.y); nose.lineTo(1.40, WS_BASE.y); nose.lineTo(1.40, 0.30);
  const ng = new THREE.ExtrudeGeometry(nose, { depth: WD - 2 * T - 0.02, bevelEnabled: false, curveSegments: 10 });
  ng.rotateY(-Math.PI / 2); ng.translate(WD / 2 - T - 0.01, 0, 0);
  S(ng, paint, 0, 0, 0);
  // カウル（ワイパーの根元の黒い樹脂）
  S(box(WD - 0.08, 0.02, 0.10), blackTrim, 0, WS_BASE.y + 0.005, WS_BASE.z + 0.04, -0.25);
  // フロントガラスと枠
  const wsLen = Math.hypot(WS_BASE.z - WS_TOP.z, WS_TOP.y - WS_BASE.y);
  const wsMid = { z: (WS_BASE.z + WS_TOP.z) / 2, y: (WS_BASE.y + WS_TOP.y) / 2 };
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(WD - 0.13, wsLen - 0.02), glassFront);
  ws.position.set(0, wsMid.y, wsMid.z); ws.rotation.x = -WS_ANG; body.add(ws);
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(WD - 0.14, wsLen - 0.03), new THREE.MeshBasicMaterial({ map: dirtTexture(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  dirt.position.set(0, wsMid.y - 0.004, wsMid.z - 0.011); dirt.rotation.set(-WS_ANG, 0, 0);
  body.add(dirt);
  for (const s of [1, -1]) {
    // Aピラー（前から見える面）とガラスのゴム
    S(box(0.07, wsLen + 0.02, 0.03), paint, s * (WD / 2 - 0.038), wsMid.y, wsMid.z + 0.005, -WS_ANG);
    S(box(0.012, wsLen, 0.012), blackTrim, s * (WD / 2 - 0.072), wsMid.y, wsMid.z + 0.012, -WS_ANG);
  }
  S(box(WD - 0.1, 0.03, 0.05), paint, 0, WS_TOP.y + 0.03, WS_TOP.z - 0.01); // ガラスの上の横桁
  S(box(WD - 0.13, 0.012, 0.012), blackTrim, 0, WS_TOP.y - 0.004, WS_TOP.z + 0.01);
  // 屋根（角の丸い板）と雨どい
  const roofG = new THREE.ExtrudeGeometry(rrectShape(WD - 0.02, 2.80, 0.06), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
  roofG.rotateX(Math.PI / 2); roofG.translate(0, 1.905, -0.31);
  S(roofG, paint, 0, 0, 0);
  for (const s of [1, -1]) S(box(0.012, 0.018, 2.74), paint, s * (WD / 2 + 0.004), 1.872, -0.31);
  // ヘッドライト（反射板・レンズ）とウインカー
  van.headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xfff2dc, emissiveIntensity: 0.05, roughness: 0.15 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.25, envMapIntensity: 2, depthWrite: false });
  for (const s of [1, -1]) {
    const hx = s * (WD / 2 - 0.2);
    S(rbox(0.30, 0.16, 0.05, 0.025), blackTrim, hx, 0.80, 1.69);
    for (const k of [-0.07, 0.065]) {
      const ref = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.03, 20).rotateX(Math.PI / 2), chrome); ref.position.set(hx + k * s, 0.80, 1.712); body.add(ref);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), van.headMat); lamp.position.set(hx + k * s, 0.80, 1.728); body.add(lamp);
    }
    const lens = new THREE.Mesh(rbox(0.29, 0.15, 0.012, 0.02), lensMat); lens.position.set(hx, 0.80, 1.722); body.add(lens);
    const fb = new THREE.Mesh(rbox(0.16, 0.05, 0.03, 0.012), s > 0 ? van.blinkMatL : van.blinkMatR); fb.position.set(s * (WD / 2 - 0.16), 0.66, 1.712); body.add(fb);
  }
  // グリルとエンブレム
  S(rbox(0.56, 0.12, 0.04, 0.02), blackTrim, 0, 0.80, 1.705);
  for (const y of [0.775, 0.80, 0.825]) S(box(0.52, 0.008, 0.012), m.frameDark, 0, y, 1.725);
  const emb = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), new THREE.MeshStandardMaterial({ map: textTexture(64, 64, (c) => { c.fillStyle = '#c9cfd3'; c.beginPath(); c.arc(32, 32, 31, 0, 7); c.fill(); c.fillStyle = '#2f7d4f'; c.beginPath(); c.arc(32, 32, 25, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = `900 34px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('あ', 32, 34); }), metalness: 0.6, roughness: 0.3 }));
  emb.position.set(0, 0.80, 1.729); body.add(emb);
  // バンパー
  S(rbox(WD + 0.03, 0.22, 0.12, 0.045), bumperMat, 0, 0.41, 1.69);
  S(rbox(WD - 0.3, 0.05, 0.03, 0.012), m.black, 0, 0.36, 1.751);
  // ナンバー（事業用の軽自動車は黒地に黄色）
  const plateMat = new THREE.MeshStandardMaterial({
    map: textTexture(330, 165, (c, w, h) => {
      c.fillStyle = '#16181a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#d8b440'; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10);
      c.fillStyle = '#e5c247'; c.textAlign = 'center';
      c.font = `bold 34px ${JP_FONT}`; c.fillText('あおば 480', w / 2, 52);
      c.font = `bold 30px ${JP_FONT}`; c.fillText('あ', 40, 128);
      c.font = `bold 78px ${JP_FONT}`; c.fillText('12-34', w / 2 + 22, 140);
    }), roughness: 0.4, metalness: 0.2,
  });
  const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.165), plateMat); fp.position.set(0, 0.47, 1.755); body.add(fp);

  // ---------------- 後ろまわり ----------------
  van.brakeMat = new THREE.MeshStandardMaterial({ color: 0x6a0c08, emissive: 0xff2010, emissiveIntensity: 0.15, roughness: 0.2 });
  van.reverseMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 });
  for (const s of [1, -1]) {
    // 角の柱（テールランプが付く）
    S(box(0.085, 1.56, 0.04), paint, s * (WD / 2 - 0.042), 1.08, -1.68);
    const tx = s * (WD / 2 - 0.042);
    const tl = new THREE.Mesh(rbox(0.07, 0.15, 0.03, 0.01), van.brakeMat); tl.position.set(tx, 0.92, -1.705); body.add(tl);
    const tb = new THREE.Mesh(rbox(0.07, 0.10, 0.03, 0.01), s > 0 ? van.blinkMatL : van.blinkMatR); tb.position.set(tx, 0.795, -1.705); body.add(tb);
    const tr = new THREE.Mesh(rbox(0.07, 0.07, 0.03, 0.01), van.reverseMat); tr.position.set(tx, 0.705, -1.705); body.add(tr);
    S(rbox(0.07, 0.05, 0.02, 0.01), new THREE.MeshStandardMaterial({ color: 0x8a0d0a, roughness: 0.3 }), s * 0.55, 0.42, -1.765); // 反射板
  }
  S(box(WD - 0.17, 0.2, 0.04), paint, 0, 0.40, -1.68); // ハッチの下の板
  S(rbox(WD + 0.02, 0.18, 0.13, 0.04), bumperMat, 0, 0.39, -1.70);
  S(box(0.6, 0.012, 0.09), m.frame, 0, 0.485, -1.73); // 荷物を載せるときのステップ
  // マフラー
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 12).rotateX(Math.PI / 2), m.frameDark); ex.position.set(-0.45, 0.27, -1.66); body.add(ex);

  // リアハッチ（上ヒンジ）
  van.hatch = new THREE.Group();
  van.hatch.position.set(0, 1.86, -1.70);
  const hs = rrectShape(1.31, 1.345, 0.035, 0, 1.18);
  hs.holes.push(rrectPath(1.17, 0.60, 0.045, 0, 1.47));
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.03, bevelEnabled: true, bevelThickness: BT, bevelSize: BT, bevelSegments: 2 });
  hg.translate(0, -1.86, BT);
  add(new THREE.Mesh(hg, [paintH, paint]), van.hatch);
  const hglass = new THREE.Mesh(new THREE.PlaneGeometry(1.17, 0.60), glassPrivacy); hglass.position.set(0, 1.47 - 1.86, 0.018); van.hatch.add(hglass);
  add(new THREE.Mesh(box(1.25, 0.55, 0.012), trimGray), van.hatch).position.set(0, 0.85 - 1.86, 0.045); // 内張り
  const hp = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.165), plateMat); hp.position.set(0, 0.70 - 1.86, -0.012); hp.rotation.y = Math.PI; van.hatch.add(hp);
  add(new THREE.Mesh(rbox(0.36, 0.05, 0.03, 0.01), m.chrome), van.hatch).position.set(0, 0.81 - 1.86, -0.01); // 取っ手のガーニッシュ
  const hm = new THREE.Mesh(rbox(0.22, 0.03, 0.025, 0.01), van.brakeMat); hm.position.set(0, 1.805 - 1.86, -0.012); van.hatch.add(hm); // ハイマウントストップランプ
  // リアワイパー
  const rw = new THREE.Group(); rw.position.set(0, 1.19 - 1.86, -0.012); van.hatch.add(rw);
  add(new THREE.Mesh(box(0.012, 0.012, 0.012), m.black), rw);
  const rwArm = add(new THREE.Mesh(box(0.012, 0.36, 0.008), m.black), rw); rwArm.position.set(0, 0.18, -0.006); rw.rotation.z = 1.35;
  body.add(van.hatch);

  // スライドドア（左）
  van.slide = new THREE.Group();
  const ss = polyPath([[SLIDE.z0 + 0.006, SLIDE.y0 + 0.006], [SLIDE.z1 - 0.006, SLIDE.y0 + 0.006], [SLIDE.z1 - 0.006, SLIDE.y1 - 0.006], [SLIDE.z0 + 0.006, SLIDE.y1 - 0.006]], 0.03);
  const sShape = new THREE.Shape(ss.getPoints(6));
  sShape.holes.push(polyPath([[-0.44, 1.115], [0.30, 1.115], [0.30, 1.765], [-0.44, 1.765]], 0.04));
  const sg = new THREE.ExtrudeGeometry(sShape, extrudeOpts);
  sg.rotateY(-Math.PI / 2); sg.translate(WD / 2 - BT, 0, 0);
  add(new THREE.Mesh(sg, [paintL, paint]), van.slide);
  const sgl = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.65), glassPrivacy); sgl.position.set(sideX, 1.44, -0.07); sgl.rotation.y = Math.PI / 2; van.slide.add(sgl);
  add(new THREE.Mesh(rbox(0.035, 0.032, 0.15, 0.012), blackTrim), van.slide).position.set(WD / 2 + 0.012, 1.0, 0.24);
  add(new THREE.Mesh(box(0.012, 0.6, 0.8), trimGray), van.slide).position.set(WD / 2 - 0.04, 0.78, -0.07);
  body.add(van.slide);

  // ---------------- ドアミラー（後ろ向きのカメラの映像を映す） ----------------
  van.mirrors = [];
  for (const s of [1, -1]) {
    S(rbox(0.12, 0.03, 0.05, 0.012), blackTrim, s * (WD / 2 + 0.04), 1.17, 1.30, 0, 0, s * 0.3);
    S(rbox(0.19, 0.155, 0.08, 0.035), blackTrim, s * (WD / 2 + 0.13), 1.22, 1.25);
    const rt = new THREE.WebGLRenderTarget(320, 232, { samples: 0 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.repeat.x = -1; rt.texture.offset.x = 1;
    const mcam = new THREE.PerspectiveCamera(30, 320 / 232, 0.3, 320);
    mcam.position.set(s * (WD / 2 + 0.13), 1.22, 1.2);
    mcam.lookAt(new THREE.Vector3(s * (WD / 2 + 1.6), 1.0, -12));
    body.add(mcam);
    const mg = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.115), new THREE.MeshBasicMaterial({ map: rt.texture }));
    mg.position.set(s * (WD / 2 + 0.13), 1.22, 1.208); mg.rotation.y = Math.PI; body.add(mg);
    van.mirrors.push({ rt, cam: mcam });
  }

  // ---------------- ワイパー ----------------
  van.wipers = [];
  const wq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-WS_ANG, 0, 0));
  for (const px of [-0.40, 0.14]) {
    const piv = new THREE.Group();
    piv.position.set(px, WS_BASE.y + 0.03, WS_BASE.z + 0.02);
    piv.quaternion.copy(wq);
    const sweep = new THREE.Group(); piv.add(sweep);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.025, 10).rotateX(Math.PI / 2), m.black), sweep, false);
    const arm = add(new THREE.Mesh(box(0.45, 0.012, 0.01), m.black), sweep, false); arm.position.set(0.225, 0, 0.012);
    const blade = add(new THREE.Mesh(box(0.42, 0.018, 0.012), m.black), sweep, false); blade.position.set(0.25, 0.015, 0.006);
    body.add(piv);
    van.wipers.push(sweep);
  }

  // ---------------- タイヤ ----------------
  van.wheels = [];
  const tireProfile = [];
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + i / 12 * Math.PI; tireProfile.push(new THREE.Vector2(0.19 + 0.09 * Math.cos(a), 0.075 * Math.sin(a))); }
  const tireG = new THREE.LatheGeometry(tireProfile, 32); tireG.rotateZ(Math.PI / 2);
  const faceMat = new THREE.MeshStandardMaterial({ map: wheelFaceTexture(), roughness: 0.45, metalness: 0.5 });
  const faceG = new THREE.CircleGeometry(0.19, 32);
  for (const z of [-WB / 2, WB / 2]) for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * (WD / 2 - 0.115), WHEEL_R, z);
    const spin = new THREE.Group();
    add(new THREE.Mesh(tireG, rubber), spin);
    const face = new THREE.Mesh(faceG, faceMat); face.position.x = s * 0.055; face.rotation.y = s * Math.PI / 2; spin.add(face);
    const back = new THREE.Mesh(faceG, m.black); back.position.x = -s * 0.03; back.rotation.y = -s * Math.PI / 2; spin.add(back);
    pivot.add(spin); van.group.add(pivot);
    van.wheels.push({ pivot, spin, front: z > 0 });
  }
  // 床下（低い視点から中が抜けて見えないように）
  S(box(WD - 0.1, 0.02, 3.2), m.black, 0, 0.30, 0, 0, 0, 0, { noShadow: true });

  // =========================================================
  // 室内
  // =========================================================
  // 荷室：床・壁（下半分）・棚
  S(box(WD - 0.06, 0.04, 2.05), cargoFloor, 0, 0.48, -0.66);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), trimGray); wall.position.set(s * (WD / 2 - 0.05), 0.8, -1.08); wall.rotation.y = -s * Math.PI / 2; body.add(wall);
    if (s < 0) { const w2 = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.6), trimGray); w2.position.set(s * (WD / 2 - 0.05), 0.8, -0.07); w2.rotation.y = -s * Math.PI / 2; body.add(w2); }
    S(box(0.56, 0.035, 1.95), m.frame, s * 0.42, 1.1, -0.67);
    for (const z of [-1.62, -1.0, -0.35, 0.28]) S(box(0.03, 0.62, 0.03), m.frame, s * 0.69, 0.8, z);
  }
  // 天井：荷室は鉄板、運転席は内張り
  const cargoCeil = new THREE.Mesh(new THREE.PlaneGeometry(WD - 0.06, 2.1), new THREE.MeshStandardMaterial({ color: 0xcfcfcb, roughness: 0.6, side: THREE.DoubleSide }));
  cargoCeil.rotation.x = Math.PI / 2; cargoCeil.position.set(0, 1.85, -0.65); body.add(cargoCeil);
  const cabCeil = new THREE.Mesh(new THREE.PlaneGeometry(WD - 0.06, 0.72), headliner); cabCeil.rotation.x = Math.PI / 2; cabCeil.position.set(0, 1.845, 0.74); body.add(cabCeil);
  // 運転席の後ろの仕切り（パイプ）
  for (const x of [-0.6, 0.6]) S(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 8), m.frameDark, x, 1.2, 0.38);
  for (const y of [1.25, 1.62]) S(new THREE.CylinderGeometry(0.014, 0.014, 1.2, 8).rotateZ(Math.PI / 2), m.frameDark, 0, y, 0.38);
  // 保冷ボックス（左・前寄り・床）
  const cooler = new THREE.Group();
  const cb = new THREE.Mesh(rbox(0.56, 0.5, 0.58, 0.03), new THREE.MeshStandardMaterial({ color: 0x3f7fa8, roughness: 0.55 })); cb.position.y = 0.25; cb.castShadow = true;
  const cl = new THREE.Mesh(rbox(0.58, 0.05, 0.6, 0.02), new THREE.MeshStandardMaterial({ color: 0xe8eef0, roughness: 0.5 })); cl.position.y = 0.52;
  cooler.add(cb, cl); cooler.position.set(0.4, 0.5, -0.03);
  body.add(cooler); van.coolerMesh = cooler;

  // 運転席の床とマット
  S(box(WD - 0.06, 0.03, 1.0), floorMat, 0, 0.52, 0.92);
  for (const s of [-1, 1]) S(box(0.46, 0.012, 0.5), new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 1 }), s * 0.36, 0.54, 1.12);

  // ---------------- 座席 ----------------
  for (const s of [-1, 1]) {
    const sx = s * 0.36;
    S(box(0.36, 0.3, 0.4), seatSide, sx, 0.69, 0.74);                              // 座席の台（エンジンの上）
    S(rbox(0.5, 0.13, 0.5, 0.05), seatFab, sx, 0.90, 0.75, -0.05);                  // 座面
    for (const k of [-1, 1]) S(rbox(0.07, 0.1, 0.46, 0.035), seatSide, sx + k * 0.22, 0.95, 0.75, -0.05);
    S(rbox(0.5, 0.66, 0.13, 0.05), seatFab, sx, 1.27, 0.48, 0.14);                  // 背もたれ
    for (const k of [-1, 1]) S(rbox(0.07, 0.6, 0.15, 0.035), seatSide, sx + k * 0.22, 1.27, 0.495, 0.14);
    S(rbox(0.27, 0.17, 0.1, 0.04), seatFab, sx, 1.72, 0.42, 0.1);                   // ヘッドレスト
    for (const k of [-1, 1]) S(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), chrome, sx + k * 0.07, 1.6, 0.43, 0.1);
    // シートベルト（巻き取られて柱に沿っている）
    S(box(0.005, 0.95, 0.045), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.9 }), s * (WD / 2 - 0.06), 1.25, 0.43);
  }
  // サイドブレーキのレバー（座席のあいだ）
  van.pbLever = new THREE.Group(); van.pbLever.position.set(0, 0.86, 0.66);
  add(new THREE.Mesh(box(0.035, 0.03, 0.3), m.frameDark), van.pbLever).position.set(0, 0, 0.14);
  add(new THREE.Mesh(rbox(0.045, 0.045, 0.12, 0.02), m.black), van.pbLever).position.set(0, 0, 0.3);
  S(box(0.08, 0.06, 0.16), m.black, 0, 0.83, 0.68);
  body.add(van.pbLever);

  // ---------------- ダッシュボード ----------------
  const dashS = new THREE.Shape();
  dashS.moveTo(WS_BASE.z - 0.02, WS_BASE.y + 0.005);
  dashS.lineTo(1.32, 1.125); dashS.quadraticCurveTo(1.26, 1.13, 1.255, 1.10);
  dashS.lineTo(1.30, 0.95); dashS.quadraticCurveTo(1.31, 0.91, 1.36, 0.90);
  dashS.lineTo(1.42, 0.88); dashS.lineTo(1.42, 1.0); dashS.lineTo(WS_BASE.z - 0.02, 1.0);
  const dg = new THREE.ExtrudeGeometry(dashS, { depth: WD - 0.08, bevelEnabled: false, curveSegments: 8 });
  dg.rotateY(-Math.PI / 2); dg.translate(WD / 2 - 0.04, 0, 0);
  S(dg, dashUpper, 0, 0, 0);
  // 下側（グレーの樹脂）と足元
  const lowS = new THREE.Shape();
  lowS.moveTo(1.36, 0.90); lowS.lineTo(1.42, 0.88); lowS.lineTo(1.48, 0.56); lowS.lineTo(1.40, 0.56); lowS.quadraticCurveTo(1.37, 0.72, 1.36, 0.90);
  const lg = new THREE.ExtrudeGeometry(lowS, { depth: WD - 0.08, bevelEnabled: false });
  lg.rotateY(-Math.PI / 2); lg.translate(WD / 2 - 0.04, 0, 0);
  S(lg, dashLower, 0, 0, 0);
  // メーターフード（運転席の前の庇）
  const hood = new THREE.Shape();
  hood.moveTo(-0.18, 0); hood.quadraticCurveTo(-0.17, 0.065, 0, 0.07); hood.quadraticCurveTo(0.17, 0.065, 0.18, 0); hood.lineTo(0.16, 0); hood.quadraticCurveTo(0.15, 0.05, 0, 0.055); hood.quadraticCurveTo(-0.15, 0.05, -0.16, 0);
  const hgeo = new THREE.ExtrudeGeometry(hood, { depth: 0.14, bevelEnabled: false, curveSegments: 10 });
  S(hgeo, dashUpper, DRV.x, 1.185, 1.17);
  // メーター（キャンバス）
  van.meterCanvas = document.createElement('canvas'); van.meterCanvas.width = 512; van.meterCanvas.height = 256;
  van.meterTex = new THREE.CanvasTexture(van.meterCanvas); van.meterTex.colorSpace = THREE.SRGBColorSpace; van.meterTex.anisotropy = 4;
  const meter = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.15), new THREE.MeshBasicMaterial({ map: van.meterTex }));
  meter.position.set(DRV.x, 1.115, 1.232); meter.rotation.set(0.3, Math.PI, 0); body.add(meter);
  S(rbox(0.34, 0.17, 0.03, 0.02), m.black, DRV.x, 1.115, 1.252, -0.3, 0, 0);
  // 吹き出し口
  for (const x of [-0.66, -0.12, 0.12, 0.62]) {
    S(rbox(0.12, 0.06, 0.03, 0.012), m.black, x, 1.05, 1.258, -0.25);
    for (let i = 0; i < 4; i++) S(box(0.11, 0.004, 0.02), m.frameDark, x, 1.032 + i * 0.012, 1.25, -0.25);
  }
  // 中央：エアコンの操作パネル・オーディオ・ハザード
  S(rbox(0.30, 0.2, 0.03, 0.01), m.plastic, 0, 0.92, 1.322, -0.3);
  for (const x of [-0.09, 0, 0.09]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.025, 20).rotateX(Math.PI / 2 - 0.3), m.frameDark); knob.position.set(x, 0.87, 1.31); body.add(knob);
  }
  S(box(0.22, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0x0c1418, emissive: 0x1d3a46, emissiveIntensity: 0.5 }), 0, 0.96, 1.305, -0.3);
  van.hazardMat = new THREE.MeshStandardMaterial({ color: 0x8a1410, emissive: 0xff3020, emissiveIntensity: 0, roughness: 0.4 });
  const hz = new THREE.Mesh(rbox(0.04, 0.03, 0.02, 0.006), van.hazardMat); hz.position.set(0, 1.02, 1.268); hz.rotation.x = -0.3; body.add(hz);
  // グローブボックス
  S(rbox(0.42, 0.16, 0.02, 0.015), dashLower, 0.44, 0.97, 1.29, -0.3);
  S(rbox(0.06, 0.02, 0.015, 0.006), m.black, 0.44, 1.03, 1.275, -0.3);
  // ダッシュボードに置いた配達リストとクリップボード
  S(box(0.24, 0.006, 0.32), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7 }), 0.42, 1.143, 1.36, 0.06, 0.35);
  const slip = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshStandardMaterial({ map: slipsTexture(), roughness: 0.9 }));
  slip.rotation.set(-Math.PI / 2 + 0.06, 0.35, 0, 'YXZ'); slip.position.set(0.42, 1.149, 1.36); body.add(slip);
  // ナビ（ダッシュボードの上に台座で固定）
  van.navCanvas = document.createElement('canvas'); van.navCanvas.width = 320; van.navCanvas.height = 200;
  van.navTex = new THREE.CanvasTexture(van.navCanvas); van.navTex.colorSpace = THREE.SRGBColorSpace;
  S(box(0.04, 0.06, 0.04), m.black, 0.10, 1.18, 1.33);
  S(rbox(0.25, 0.165, 0.03, 0.012), m.plastic, 0.10, 1.27, 1.325, -0.32);
  const nav = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.1375), new THREE.MeshBasicMaterial({ map: van.navTex }));
  nav.position.set(0.10, 1.27, 1.308); nav.rotation.set(0.32, Math.PI, 0); body.add(nav);

  // ---------------- ハンドルまわり ----------------
  van.column = new THREE.Group();
  van.column.position.set(DRV.x, 0.99, 1.05); van.column.rotation.x = -0.5;
  body.add(van.column);
  // コラムカバー
  add(new THREE.Mesh(rbox(0.11, 0.09, 0.2, 0.03), m.plastic), van.column).position.set(0, -0.06, 0.13);
  // ハンドル（3本スポーク＋エアバッグのパッド）
  van.wheel = new THREE.Group(); van.column.add(van.wheel);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.55, map: grainTexture('#ffffff', 24) });
  add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.017, 10, 48), wheelMat), van.wheel);
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const sp = add(new THREE.Mesh(box(0.13, 0.032, 0.016), m.plastic), van.wheel);
    sp.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.012); sp.rotation.z = a;
  }
  add(new THREE.Mesh(rbox(0.13, 0.11, 0.05, 0.03), m.plastic), van.wheel).position.set(0, -0.005, 0.02);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), new THREE.MeshStandardMaterial({ color: 0xb8bec2, metalness: 0.8, roughness: 0.3 }));
  badge.position.set(0, 0.0, -0.007); badge.rotation.y = Math.PI; van.wheel.add(badge);
  // レバー：右がウインカー・ライト、左がワイパー
  van.stalks = {};
  for (const [k, sx] of [['signal', -1], ['wiper', 1]]) {
    const g = new THREE.Group(); g.position.set(sx * 0.05, 0, 0.07); van.column.add(g);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.15, 8).rotateZ(Math.PI / 2), m.black), g).position.set(sx * 0.075, 0, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.045, 10).rotateZ(Math.PI / 2), m.frameDark), g).position.set(sx * 0.14, 0, 0);
    van.stalks[k] = g;
  }
  // シフトレバー（インパネシフト：P R N D 2 L）
  const gate = new THREE.Group(); gate.position.set(-0.11, 0.98, 1.278); gate.rotation.x = -0.3; body.add(gate);
  add(new THREE.Mesh(rbox(0.07, 0.16, 0.02, 0.01), m.plastic), gate);
  const gateTex = textTexture(64, 160, (c, w, h) => {
    c.fillStyle = '#1a1b1d'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d8dde0'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center';
    ['P', 'R', 'N', 'D', '2', 'L'].forEach((g, i) => c.fillText(g, 16, 24 + i * 24));
    c.fillStyle = '#000'; c.fillRect(36, 10, 10, h - 20);
  });
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.15), new THREE.MeshBasicMaterial({ map: gateTex })); gp.position.set(0, 0, -0.011); gp.rotation.y = Math.PI; gate.add(gp);
  van.shifter = new THREE.Group(); gate.add(van.shifter);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 8).rotateX(Math.PI / 2), chrome), van.shifter).position.set(0, 0, -0.05);
  add(new THREE.Mesh(rbox(0.035, 0.05, 0.04, 0.015), m.black), van.shifter).position.set(0, 0.0, -0.1);
  // ペダル（右がアクセル＝オルガン式、左がブレーキ）
  van.pedals = {};
  const acc = new THREE.Group(); acc.position.set(DRV.x - 0.1, 0.56, 1.36); body.add(acc);
  add(new THREE.Mesh(rbox(0.06, 0.2, 0.015, 0.006), m.black), acc).position.set(0, 0.1, 0);
  van.pedals.acc = acc;
  const brk = new THREE.Group(); brk.position.set(DRV.x + 0.06, 0.92, 1.34); body.add(brk);
  add(new THREE.Mesh(box(0.02, 0.3, 0.02), m.frameDark), brk).position.set(0, -0.15, 0);
  add(new THREE.Mesh(rbox(0.09, 0.07, 0.02, 0.008), m.black), brk).position.set(0, -0.3, -0.01);
  van.pedals.brk = brk;

  // ---------------- ドアの内張り・ピラー・サンバイザー ----------------
  for (const s of [-1, 1]) {
    const dx = s * (WD / 2 - 0.05);
    S(rbox(0.03, 0.58, 0.94, 0.012), trimGray, dx, 0.80, 0.92);
    S(rbox(0.07, 0.04, 0.34, 0.015), dashLower, dx - s * 0.03, 0.86, 0.80); // ひじ掛け
    S(rbox(0.02, 0.03, 0.08, 0.008), chrome, dx - s * 0.02, 0.98, 1.12);    // 内側の取っ手
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 20).rotateZ(Math.PI / 2), m.black); sp.position.set(dx - s * 0.016, 0.62, 1.12); body.add(sp);
    // 窓の開閉ハンドル（手回し）
    S(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8).rotateZ(Math.PI / 2), m.frameDark, dx - s * 0.03, 0.9, 1.0);
    S(box(0.012, 0.012, 0.1), m.frameDark, dx - s * 0.045, 0.9, 0.96);
    S(new THREE.CylinderGeometry(0.01, 0.01, 0.04, 8).rotateZ(Math.PI / 2), m.black, dx - s * 0.07, 0.9, 0.92);
    // Aピラー・Bピラーの内張り
    S(box(0.03, 0.80, 0.05), trimGray, s * (WD / 2 - 0.06), wsMid.y, wsMid.z - 0.03, -WS_ANG);
    S(box(0.03, 0.8, 0.07), trimGray, s * (WD / 2 - 0.05), 1.46, 0.40);
    // サンバイザー
    const vis = new THREE.Group(); vis.position.set(s * 0.36, 1.82, 1.0); vis.rotation.x = 0.12; body.add(vis);
    add(new THREE.Mesh(rbox(0.38, 0.012, 0.17, 0.006), headliner), vis).position.set(0, 0, -0.085);
    if (s < 0) { const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0xf3efe1 })); paper.rotation.x = Math.PI / 2; paper.position.set(0.08, -0.008, -0.08); vis.add(paper); }
  }
  // ルームランプとルームミラー
  S(rbox(0.16, 0.025, 0.08, 0.01), new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0xfff3d8, emissiveIntensity: 0.05 }), 0, 1.832, 0.82);
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 1, roughness: 0.05, envMapIntensity: 1.2 });
  S(box(0.02, 0.05, 0.02), m.plastic, 0.03, 1.80, 1.10);
  S(rbox(0.22, 0.06, 0.028, 0.015), m.plastic, 0.03, 1.75, 1.10);
  const rmg = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.045), mirrorMat); rmg.position.set(0.03, 1.75, 1.085); rmg.rotation.y = Math.PI; body.add(rmg);

  // ---------------- 運転手の腕（運転席視点だけで見せる） ----------------
  van.driver = new THREE.Group(); body.add(van.driver);
  const mkSeg = (mat, r) => { const g = new THREE.CylinderGeometry(r, r * 0.92, 1, 10); const mesh = new THREE.Mesh(g, mat); mesh.castShadow = false; van.driver.add(mesh); return mesh; };
  van.arms = [];
  for (const side of [1, -1]) {
    const upper = mkSeg(sleeve, 0.045), fore = mkSeg(sleeve, 0.038);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 8), sleeve); van.driver.add(elbow);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.9 })); van.driver.add(cuff);
    const hand = new THREE.Group(); van.driver.add(hand);
    const palm = new THREE.Mesh(rbox(0.085, 0.05, 0.1, 0.022), glove); hand.add(palm);
    const thumb = new THREE.Mesh(rbox(0.025, 0.025, 0.06, 0.012), glove); thumb.position.set(-side * 0.035, 0.02, -0.02); thumb.rotation.y = side * 0.5; hand.add(thumb);
    van.arms.push({ side, upper, fore, elbow, cuff, hand, shoulder: new THREE.Vector3(DRV.x + side * 0.2, 1.33, 0.60) });
  }
  van.driver.visible = false;

  // ヘッドライトの光（暗いとき）
  van.headLights = [];
  for (const s of [-1, 1]) {
    const l = new THREE.SpotLight(0xfff1dc, 0, 40, 0.5, 0.5, 1.5);
    l.position.set(s * 0.5, 0.8, 1.8); l.target.position.set(s * 0.6, 0, 12);
    body.add(l, l.target); van.headLights.push(l);
  }

  B.build(body);
}

// ---------------- 毎フレーム：運転手の腕を、ハンドルを握る位置に合わせる ----------------
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
export function poseArms(van) {
  if (!van.driver.visible) return;
  van.column.updateMatrix(); van.wheel.updateMatrix();
  const wm = new THREE.Matrix4().multiplyMatrices(van.column.matrix, van.wheel.matrix);
  const spin = van.wheel.rotation.z;
  for (const a of van.arms) {
    // 握る位置：基本は 9時と3時。大きく回したら手は持ち替えたことにして、回転を途中で止める
    const lim = 1.7;
    const ang = a.side > 0 ? 0.12 : Math.PI - 0.12;
    const grip = new THREE.Vector3(Math.cos(ang) * 0.185, Math.sin(ang) * 0.185, 0);
    // ハンドルと一緒に回るが、限度を超えた分は戻す
    const extra = spin - THREE.MathUtils.clamp(spin, -lim, lim);
    grip.applyAxisAngle(new THREE.Vector3(0, 0, 1), -extra);
    const H = grip.applyMatrix4(wm);
    const S0 = a.shoulder;
    const L1 = 0.31, L2 = 0.31;
    const d = Math.min(_v1.subVectors(H, S0).length(), L1 + L2 - 0.005);
    const dir = _v1.normalize();
    const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
    // ひじは外側・下に逃がす
    const pole = _v2.set(a.side * 0.8, -1, -0.2);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = _v3.copy(S0).addScaledVector(dir, x).addScaledVector(pole, h);
    const Hc = S0.clone().addScaledVector(dir, d);
    placeBetween(a.upper, S0, E);
    placeBetween(a.fore, E, Hc);
    a.elbow.position.copy(E);
    a.cuff.position.copy(Hc).addScaledVector(dir, -0.02); a.cuff.quaternion.setFromUnitVectors(_up, dir);
    a.hand.position.copy(Hc).addScaledVector(dir, 0.03);
    _q.setFromRotationMatrix(wm); a.hand.quaternion.copy(_q);
    a.hand.rotateZ(ang - extra);
  }
}
