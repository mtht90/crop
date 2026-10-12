// 日本の住宅を細部まで組み立てる：一戸建て・木造アパート・マンション・店舗・倉庫
// 建物ごとにローカル座標（x = 正面の横方向、z = 奥行き、正面は -z 側）で作り、
// まとめ描画（Batch）に入れる。遠くの建物用に、簡単な形（LOD）も作れる。
import * as THREE from 'three';
import { A, box, textTexture, tintOf, JP_FONT } from './assets.js';

// ---------------- 乱数（建物ごとに決まった値） ----------------
export function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pickR = (r, a) => a[Math.floor(r() * a.length)];

// ---------------- 行列 ----------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}

// =========================================================
// 材質とテクスチャ（最初に一度だけ作る）
// =========================================================
let K = null;
function canvasTex(w, h, draw, repeat) {
  const t = textTexture(w, h, draw);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
// 高さの絵から法線マップを作る
function normalFrom(heightCanvasDraw, w, h, strength = 2, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); heightCanvasDraw(g, w, h);
  const src = g.getImageData(0, 0, w, h).data, out = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out.data[i] = (dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
const noise = (g, w, h, amp, alpha = 1) => {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; d[i + 3] = d[i + 3] * alpha + (1 - alpha) * 255; }
  g.putImageData(img, 0, 0);
};

export function initHouseKit() {
  if (K) return K;
  const m = A.mats;
  // 外壁のサイディング：模様（明るさ）と凹凸（法線）。UV はメートル
  const sidingPatterns = {
    // 横張り（約 0.2m ごとの板）
    lap: { size: [1, 1], draw: (g, w, h, hm) => { g.fillStyle = hm ? '#bbb' : '#fff'; g.fillRect(0, 0, w, h); for (let k = 0; k < 5; k++) { const y = k * h / 5; const gr = g.createLinearGradient(0, y, 0, y + h / 5); gr.addColorStop(0, hm ? '#555' : '#d8d8d8'); gr.addColorStop(0.08, hm ? '#ddd' : '#fff'); gr.addColorStop(1, hm ? '#999' : '#f1f1f1'); g.fillStyle = gr; g.fillRect(0, y, w, h / 5); } } },
    // タイル調（45cm角の目地）
    tile: { size: [0.91, 0.455], draw: (g, w, h, hm) => { g.fillStyle = hm ? '#ccc' : '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = hm ? '#444' : '#cfcfcf'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h / 2); g.fillRect(w / 2, h / 2, 3, h / 2); g.fillRect(0, h / 2, w, 3); if (!hm) noise(g, w, h, 18); } },
    // 縦張り（ガルバリウムの角波）
    vert: { size: [0.6, 1], draw: (g, w, h, hm) => { for (let x = 0; x < w; x++) { const v = Math.sin(x / w * Math.PI * 2 * 4) * 0.5 + 0.5; const c = Math.round((hm ? 90 : 210) + v * (hm ? 140 : 45)); g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(x, 0, 1, h); } } },
    // 石積み調
    stone: { size: [1.2, 0.6], draw: (g, w, h, hm) => { g.fillStyle = hm ? '#333' : '#bdbdbd'; g.fillRect(0, 0, w, h); for (let r = 0; r < 3; r++) for (let c = -1; c < 5; c++) { const bw = w / 4, x = c * bw + (r % 2) * bw / 2, y = r * h / 3; g.fillStyle = hm ? `rgb(${170 + Math.random() * 70|0},0,0)` : `rgb(${215 + Math.random() * 35 | 0},${212 + Math.random() * 35 | 0},${205 + Math.random() * 35 | 0})`; g.fillRect(x + 2, y + 2, bw - 4, h / 3 - 4); } if (!hm) noise(g, w, h, 14); } },
  };
  const siding = {};
  for (const [k, p] of Object.entries(sidingPatterns)) {
    const rep = [1 / p.size[0], 1 / p.size[1]];
    siding[k] = { map: canvasTex(256, 256, (g, w, h) => p.draw(g, w, h, false), rep), nor: normalFrom((g, w, h) => p.draw(g, w, h, true), 256, 256, 3, rep) };
  }
  // 色違いは頂点の色で表す（素材は模様ごとに1つ）
  const tints = new Map();
  const tint = (base, color) => { const key = base.uuid + ':' + color; if (!tints.has(key)) tints.set(key, tintOf(base, color)); return tints.get(key); };
  const wallBase = {};
  const wallMat = (pattern, color) => {
    if (!wallBase[pattern]) {
      if (pattern === 'plaster') { wallBase[pattern] = m.plaster.clone(); wallBase[pattern].color = new THREE.Color(1.05, 1.05, 1.05); }
      else wallBase[pattern] = new THREE.MeshStandardMaterial({ map: siding[pattern].map, normalMap: siding[pattern].nor, normalScale: new THREE.Vector2(0.9, 0.9), roughness: pattern === 'vert' ? 0.45 : 0.75, metalness: pattern === 'vert' ? 0.4 : 0 });
      wallBase[pattern].vertexColors = true;
    }
    return tint(wallBase[pattern], color);
  };
  // 屋根：いぶし瓦・陶器瓦（波の形）、化粧スレート、金属（立平葺き）
  const roofTex = {
    kawara: { size: [0.3, 0.25], draw: (g, w, h, hm) => { for (let x = 0; x < w; x++) { const v = Math.pow(Math.sin(x / w * Math.PI), 0.6); const c = Math.round(hm ? 40 + v * 200 : 140 + v * 100); g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(x, 0, 1, h); } g.fillStyle = hm ? 'rgba(0,0,0,0.9)' : 'rgba(40,40,40,0.55)'; g.fillRect(0, h - 10, w, 10); if (!hm) noise(g, w, h, 10); } },
    slate: { size: [0.91, 0.22], draw: (g, w, h, hm) => { g.fillStyle = hm ? '#bbb' : '#e6e6e6'; g.fillRect(0, 0, w, h); g.fillStyle = hm ? '#222' : '#9a9a9a'; g.fillRect(0, h - 5, w, 5); g.fillRect(w * 0.5, 0, 2, h); if (!hm) noise(g, w, h, 16); } },
    metal: { size: [0.45, 1], draw: (g, w, h, hm) => { g.fillStyle = hm ? '#888' : '#e3e3e3'; g.fillRect(0, 0, w, h); g.fillStyle = hm ? '#fff' : '#fafafa'; g.fillRect(0, 0, 8, h); g.fillStyle = hm ? '#333' : '#bdbdbd'; g.fillRect(8, 0, 3, h); } },
  };
  const roofT = {};
  for (const [k, p] of Object.entries(roofTex)) {
    const rep = [1 / p.size[0], 1 / p.size[1]];
    roofT[k] = { map: canvasTex(256, 128, (g, w, h) => p.draw(g, w, h, false), rep), nor: normalFrom((g, w, h) => p.draw(g, w, h, true), 256, 128, 4, rep) };
  }
  const roofBase = {};
  const roofMat = (kind, color) => {
    if (!roofBase[kind]) roofBase[kind] = new THREE.MeshStandardMaterial({ vertexColors: true, map: roofT[kind].map, normalMap: roofT[kind].nor, roughness: kind === 'metal' ? 0.4 : kind === 'kawara' ? 0.45 : 0.7, metalness: kind === 'metal' ? 0.55 : kind === 'kawara' ? 0.25 : 0.05, side: THREE.DoubleSide });
    return tint(roofBase[kind], color);
  };
  // 窓（引き違い・浴室・掃き出し・シャッター・格子・台所）。夜の明かり用の画像も
  const WS = 256, WC = 4, WR = 2;
  const winDraw = (lit) => (g) => {
    g.fillStyle = lit ? '#000' : '#7b8a93'; g.fillRect(0, 0, WS * WC, WS * WR);
    const cell = (i, f) => { g.save(); g.translate((i % WC) * WS, Math.floor(i / WC) * WS); f(); g.restore(); };
    const pane = (x, y, w, h, curtain) => {
      if (lit) { g.fillStyle = curtain === 'none' ? '#d8b070' : '#f0cf96'; g.fillRect(x, y, w, h); if (curtain && curtain !== 'none' && curtain !== 'lace') { g.fillStyle = 'rgba(80,40,10,0.25)'; g.fillRect(x, y, w * 0.4, h); } return; }
      const gr = g.createLinearGradient(x, y, x + w * 0.6, y + h); gr.addColorStop(0, '#a9bcc8'); gr.addColorStop(0.5, '#56697a'); gr.addColorStop(1, '#2f3b46'); g.fillStyle = gr; g.fillRect(x, y, w, h);
      if (curtain === 'lace') { g.fillStyle = 'rgba(240,238,230,0.78)'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,255,255,0.25)'; for (let k = 0; k < w; k += 9) g.fillRect(x + k, y, 3, h); }
      else if (curtain && curtain !== 'none') { g.fillStyle = curtain; g.fillRect(x, y, w * 0.32, h); g.fillRect(x + w * 0.7, y, w * 0.3, h); g.fillStyle = 'rgba(240,238,230,0.6)'; g.fillRect(x + w * 0.32, y, w * 0.38, h); }
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.moveTo(x + w * 0.15, y); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.1, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h * 0.4); g.fill();
    };
    const sash = (col = '#c4c8cb') => { if (lit) return; g.fillStyle = col; g.fillRect(0, 0, WS, 10); g.fillRect(0, WS - 10, WS, 10); g.fillRect(0, 0, 10, WS); g.fillRect(WS - 10, 0, 10, WS); g.fillRect(WS / 2 - 5, 0, 10, WS); };
    cell(0, () => { pane(10, 10, 118, 236, 'lace'); pane(128, 10, 118, 236, 'lace'); sash(); });
    cell(1, () => { pane(10, 10, 118, 236, '#8f7a5e'); pane(128, 10, 118, 236, '#8f7a5e'); sash(); });
    cell(2, () => { if (lit) { g.fillStyle = '#e8d6aa'; g.fillRect(10, 10, 236, 236); return; } g.fillStyle = '#dfe3e5'; g.fillRect(10, 10, 236, 236); g.fillStyle = 'rgba(0,0,0,0.05)'; for (let k = 10; k < 246; k += 5) g.fillRect(10, k, 236, 2); sash(); });
    cell(3, () => { pane(10, 10, 118, 236, 'lace'); pane(128, 10, 118, 236, '#6d7f8c'); sash(); });
    cell(4, () => { if (lit) return; g.fillStyle = '#c6c3bb'; g.fillRect(0, 0, WS, WS); g.fillStyle = 'rgba(0,0,0,0.2)'; for (let k = 0; k < WS; k += 14) g.fillRect(0, k, WS, 3); g.fillStyle = 'rgba(255,255,255,0.25)'; for (let k = 4; k < WS; k += 14) g.fillRect(0, k, WS, 2); });
    cell(5, () => { pane(10, 10, 236, 236, 'none'); sash('#3a3a3a'); });
    cell(6, () => { if (lit) { g.fillStyle = '#e8d6aa'; g.fillRect(10, 10, 236, 236); return; } g.fillStyle = '#d8dcde'; g.fillRect(10, 10, 236, 236); sash(); g.fillStyle = '#b4b8bb'; for (let k = 24; k < WS; k += 26) g.fillRect(k, 0, 7, WS); });
    cell(7, () => { if (lit) { g.fillStyle = '#efd9a6'; g.fillRect(10, 10, 236, 236); return; } g.fillStyle = '#e8e6df'; g.fillRect(10, 10, 236, 236); g.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 10; k < 246; k += 12) g.fillRect(10, k, 236, 4); sash(); });
  };
  const winMap = textTexture(WS * WC, WS * WR, winDraw(false)), winLitMap = textTexture(WS * WC, WS * WR, winDraw(true));
  const glass = new THREE.MeshStandardMaterial({ map: winMap, roughness: 0.15, metalness: 0.2, envMapIntensity: 1.6 });
  const glassLit = new THREE.MeshStandardMaterial({ map: winMap, roughness: 0.15, metalness: 0.2, envMapIntensity: 1.6, emissive: 0xffffff, emissiveMap: winLitMap, emissiveIntensity: 0 });
  // 玄関ドア（アルミのスリット・木目・アパートの鉄扉・和風の格子戸）
  const DS = 256;
  const doorDraw = (lit) => (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, DS * 4, DS * 2);
    const cell = (i, f) => { g.save(); g.translate(i * DS, 0); f(); g.restore(); };
    cell(0, () => { if (lit) { g.fillStyle = '#e3c58c'; g.fillRect(150, 30, 26, 440); return; } g.fillStyle = '#4b4f52'; g.fillRect(0, 0, DS, DS * 2); g.fillStyle = '#5c6165'; g.fillRect(14, 14, DS - 28, DS * 2 - 14); g.fillStyle = '#93a7b3'; g.fillRect(150, 30, 26, 440); g.fillStyle = '#c9cdd0'; g.fillRect(40, 220, 12, 90); });
    cell(1, () => { if (lit) return; g.fillStyle = '#6b4c33'; g.fillRect(0, 0, DS, DS * 2); g.strokeStyle = 'rgba(0,0,0,0.18)'; for (let k = 8; k < DS; k += 9) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 4, DS * 2); g.stroke(); } g.fillStyle = '#d9c9a8'; g.fillRect(36, 200, 10, 110); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 0, DS, 8); });
    cell(2, () => { if (lit) return; g.fillStyle = '#7f8a92'; g.fillRect(0, 0, DS, DS * 2); g.fillStyle = '#8c979f'; g.fillRect(16, 16, DS - 32, DS * 2 - 32); g.fillStyle = '#2b2f32'; g.beginPath(); g.arc(DS / 2, 170, 6, 0, 7); g.fill(); g.fillStyle = '#c4c9cc'; g.fillRect(36, 240, 46, 14); g.fillRect(70, 300, 12, 30); });
    cell(3, () => { if (lit) { g.fillStyle = '#e8cc90'; g.fillRect(20, 20, DS - 40, DS * 2 - 40); return; } g.fillStyle = '#5e4632'; g.fillRect(0, 0, DS, DS * 2); g.fillStyle = '#d7d2c4'; g.fillRect(20, 20, DS - 40, DS * 2 - 40); g.fillStyle = '#5e4632'; for (let k = 20; k < DS - 20; k += 22) g.fillRect(k, 20, 6, DS * 2 - 40); for (let k = 60; k < DS * 2; k += 110) g.fillRect(20, k, DS - 40, 6); });
  };
  const doorMap = textTexture(DS * 4, DS * 2, doorDraw(false)), doorLitMap = textTexture(DS * 4, DS * 2, doorDraw(true));
  const door = new THREE.MeshStandardMaterial({ map: doorMap, roughness: 0.45, metalness: 0.3, emissive: 0xffffff, emissiveMap: doorLitMap, emissiveIntensity: 0 });
  const solar = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#16223a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7f8ea8'; g.lineWidth = 2; for (let k = 0; k <= w; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); } }, [1 / 1.0, 1 / 1.6]), roughness: 0.15, metalness: 0.6 });
  const porchTile = new THREE.MeshStandardMaterial({ color: 0x9c8f82, map: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#d9d2c8'; g.fillRect(0, 0, w, h); g.fillStyle = '#9b948b'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); noise(g, w, h, 20); }, [1 / 0.3, 1 / 0.3]), roughness: 0.6 });
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const laundryCols = [0xf2f2ee, 0x6a8bb5, 0xd9a7a7, 0x8aa77a, 0xe8d38a, 0x55595e].map(c => tint(cloth, c));
  const slats = (() => {
    const t = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h); g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); });
    const base = new THREE.MeshStandardMaterial({ vertexColors: true, map: t, alphaTest: 0.5, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
    return (col) => tint(base, col);
  })();
  // 模様のない素材：つやの具合ごとに1つ
  const plainBase = new Map();
  const plain = (c, r = 0.6, mt = 0) => { const key = r + ':' + mt; if (!plainBase.has(key)) plainBase.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: mt })); return tint(plainBase.get(key), c); };
  const tentBase = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  K = {
    wallMat, roofMat, glass, glassLit, door, solar, porchTile, laundryCols, WC, WR,
    alu: plain(0xc0c4c7, 0.35, 0.7), aluDark: plain(0x3b3a38, 0.4, 0.6), aluBronze: plain(0x5b4a3b, 0.4, 0.5),
    trimWhite: plain(0xf0efea, 0.5), trimBrown: plain(0x5a4535, 0.6), trimBlack: plain(0x2a2b2c, 0.55),
    gutterIvory: plain(0xe5e0d2, 0.5), gutterBrown: plain(0x5b4a3c, 0.5), gutterBlack: plain(0x2d2d2d, 0.5),
    foundation: m.concrete, concrete: m.concrete, ac: plain(0xe8e8e2, 0.55), acDark: plain(0x2c2f31, 0.7), ecocute: plain(0xeceae4, 0.4, 0.1),
    meter: plain(0xd2d4d0, 0.5), meterDark: plain(0x3b4246, 0.5), pipe: plain(0xd8d6ce, 0.6),
    steel: plain(0x4c5358, 0.5, 0.5), steelGreen: plain(0x5f6f62, 0.55, 0.4), railAlu: slats(0xb5b8ba), railDark: slats(0x3b3c3d),
    polycarb: new THREE.MeshStandardMaterial({ color: 0xbfd6dc, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf3efe3, emissive: 0xffe2b0, emissiveIntensity: 0 }),
    leaf: m.leaf, cedar: m.cedar, cedarDark: m.cedarDark, black: m.black, frame: m.frame, block: m.block, stucco: m.stucco,
    tent: (c) => tint(tentBase, c), tint, plain,
  };
  return K;
}
export function houseLampMats() { initHouseKit(); return [{ mat: K.glassLit, on: 0.95 }, { mat: K.door, on: 0.7 }, { mat: K.lamp, on: 2.2 }]; }

// 窓・ドアの絵の切り出し
function atlasUV(g, i, cols, rows) {
  const u0 = (i % cols) / cols, v1 = 1 - Math.floor(i / cols) / rows, uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / cols, v1 - (1 - uv.getY(k)) / rows);
  return g;
}

// =========================================================
// 組み立て用の道具：建物のローカル座標 → 世界座標
// =========================================================
class Builder {
  constructor(out, base) { this.out = out; this.base = base; }
  add(geo, material, local, opts) { this.out.B.add(geo, material, this.base.clone().multiply(local), opts); }
  box(w, h, d, material, x, y, z, ry = 0, rx = 0, rz = 0, opts) { this.add(box(w, h, d), material, mat(x, y, z, rx, ry, rz), opts); }
  plane(g, material, x, y, z, ry = 0, rx = 0, opts) { this.add(g, material, mat(x, y, z, rx, ry, 0), opts); }
  world(x, z) { const v = new THREE.Vector3(x, 0, z).applyMatrix4(this.base); return [v.x, v.z]; }
}
// 外壁の面（ローカル）：正面 -z、背面 +z、左 -x、右 +x
function facades(X, Z) {
  return {
    front: { a: [-X, -Z], u: [1, 0], n: [0, -1], len: 2 * X },
    back: { a: [X, Z], u: [-1, 0], n: [0, 1], len: 2 * X },
    left: { a: [-X, Z], u: [0, -1], n: [-1, 0], len: 2 * Z },
    right: { a: [X, -Z], u: [0, 1], n: [1, 0], len: 2 * Z },
  };
}
const faceRot = (n) => Math.atan2(n[0], n[1]);
const at = (f, t, off = 0) => [f.a[0] + f.u[0] * t + f.n[0] * off, f.a[1] + f.u[1] * t + f.n[1] * off];

// 窓1つ（サッシの枠・ガラス・水切り・シャッターボックス・面格子）
function windowUnit(b, f, t, y, w, h, opt = {}) {
  const k = initHouseKit(), r = faceRot(f.n), [x, z] = at(f, t, 0.035);
  const type = opt.type ?? 0;
  const g = atlasUV(new THREE.PlaneGeometry(w, h), type, k.WC, k.WR);
  b.plane(g, opt.lit ? k.glassLit : k.glass, x, y, z, r, 0, { noShadow: true });
  const frameM = opt.frame || k.alu;
  if (type !== 4) {
    const [fx, fz] = at(f, t, 0.05);
    b.box(w + 0.08, 0.05, 0.07, frameM, fx, y + h / 2 + 0.025, fz, r);
    b.box(w + 0.08, 0.05, 0.07, frameM, fx, y - h / 2 - 0.025, fz, r);
    b.box(0.05, h, 0.07, frameM, ...rel(f, t - w / 2 - 0.015, y, 0.05), r);
    b.box(0.05, h, 0.07, frameM, ...rel(f, t + w / 2 + 0.015, y, 0.05), r);
  }
  // 水切り
  const [sx, sz] = at(f, t, 0.08);
  b.box(w + 0.14, 0.03, 0.12, k.alu, sx, y - h / 2 - 0.07, sz, r);
  // シャッターボックス（大きな窓の上）
  if (opt.shutterBox) { const [bx, bz] = at(f, t, 0.13); b.box(w + 0.16, 0.26, 0.24, opt.shutterCol || k.alu, bx, y + h / 2 + 0.17, bz, r); }
  // 雨戸の戸袋（古い家：窓の横）
  if (opt.tobukuro) { const s = opt.tobukuro; const [bx, bz] = at(f, t + s * (w / 2 + 0.42), 0.14); b.box(0.78, h + 0.1, 0.22, opt.tobukuroMat || k.trimBrown, bx, y, bz, r); }
  // 面格子（1階の小窓）
  if (opt.grille) {
    for (let i = 0; i <= 6; i++) { const [gx, gz] = at(f, t - w / 2 + i * w / 6, 0.12); b.box(0.025, h + 0.05, 0.025, k.alu, gx, y, gz, r); }
    const [gx, gz] = at(f, t, 0.12); b.box(w + 0.05, 0.03, 0.04, k.alu, gx, y + h / 2, gz, r); b.box(w + 0.05, 0.03, 0.04, k.alu, gx, y - h / 2, gz, r);
  }
}
function rel(f, t, y, off) { const [x, z] = at(f, t, off); return [x, y, z]; }

// =========================================================
// 一戸建て
// =========================================================
// spec: { base(Matrix4), W(正面の幅), D(奥行き), floors, seed, style?, doorT?(正面での玄関の位置), lit, wantDoor(動く扉を外で作る), garden:'back'|'front' }
export function buildDetachedHouse(out, spec) {
  const k = initHouseKit(), r = seeded(spec.seed);
  const b = new Builder(out, spec.base);
  const W = spec.W, D = spec.D, X = W / 2, Z = D / 2;
  const old = spec.style === 'wa' || (spec.style == null && r() < 0.16);
  const floors = spec.floors;
  const FH = 2.85, BASE = 0.45;
  const H = BASE + floors * FH - 0.15; // 軒の高さ
  // ---- 外観の組み合わせ ----
  const wallPal = old
    ? [['plaster', 0xe9e3d3], ['plaster', 0xd9d2c0], ['lap', 0x8a7660]]
    : [['lap', 0xf1efe8], ['lap', 0xe6dccb], ['tile', 0xece7dc], ['tile', 0xd4d0c8], ['tile', 0x9a9389], ['vert', 0x3d3f42], ['vert', 0xc7c9c8], ['stone', 0xd8d0c2], ['plaster', 0xf2efe6], ['lap', 0x6b7b8c], ['tile', 0x7a6a5c], ['lap', 0xc9b79a]];
  const [wp, wc] = pickR(r, wallPal);
  const wall = k.wallMat(wp, wc);
  const accent = !old && r() < 0.35 ? k.wallMat(pickR(r, ['vert', 'tile', 'lap']), pickR(r, [0x3d3f42, 0x5b4a3c, 0x8c8f91, 0xece7dc])) : null;
  const roofKind = old ? 'kawara' : pickR(r, ['slate', 'slate', 'slate', 'kawara', 'metal', 'metal']);
  const roofCol = roofKind === 'kawara' ? pickR(r, [0x6d7073, 0x5e6266, 0x7a4f3c, 0x3f4a5a]) : roofKind === 'slate' ? pickR(r, [0x3c3f44, 0x4b4038, 0x34404f, 0x5a5e5f, 0x6c5244]) : pickR(r, [0x2c2e30, 0x8e9294, 0x4d3f35, 0x3b4651]);
  const roofM = k.roofMat(roofKind, roofCol);
  const shape = old ? (r() < 0.6 ? 'hip' : 'gable') : roofKind === 'metal' && r() < 0.6 ? 'shed' : pickR(r, ['gable', 'gable', 'hip', 'hip']);
  const trim = old ? k.trimBrown : pickR(r, [k.trimWhite, k.trimWhite, k.trimBlack, k.trimBrown]);
  const gutter = trim === k.trimBlack ? k.gutterBlack : trim === k.trimBrown ? k.gutterBrown : k.gutterIvory;
  const sashM = old ? k.alu : pickR(r, [k.alu, k.alu, k.aluDark, k.aluBronze]);
  const F = facades(X, Z);
  const lit = () => r() < (spec.lit ?? 0.45);

  // ---- 基礎と外壁 ----
  for (const f of Object.values(F)) {
    const mid = at(f, f.len / 2, 0.015);
    b.box(f.len + 0.03, BASE, 0.03, k.foundation, mid[0], BASE / 2, mid[1], faceRot(f.n));
    // 基礎の換気口
    for (let t = 1.2; t < f.len - 0.8; t += 2.7) { const v = at(f, t, 0.035); b.box(0.3, 0.08, 0.01, k.black, v[0], 0.26, v[1], faceRot(f.n), 0, 0, { noShadow: true }); }
  }
  const wallTop = { front: H, back: H, left: H, right: H };
  let shedHigh = 0;
  if (shape === 'shed') { shedHigh = Math.min(2.2, D * 0.18); wallTop.back = H + shedHigh; }
  for (const [name, f] of Object.entries(F)) {
    // 片流れ屋根の妻側の壁は台形
    const y0 = BASE, y1a = name === 'left' ? (shape === 'shed' ? H + shedHigh : H) : name === 'right' ? H : wallTop[name];
    const y1b = name === 'left' ? H : name === 'right' ? (shape === 'shed' ? H + shedHigh : H) : wallTop[name];
    const g = new THREE.BufferGeometry();
    const p0 = f.a, p1 = at(f, f.len, 0);
    const pos = [p0[0], y0, p0[1], p1[0], y0, p1[1], p1[0], y1b, p1[1], p0[0], y0, p0[1], p1[0], y1b, p1[1], p0[0], y1a, p0[1]];
    const uv = [0, y0, f.len, y0, f.len, y1b, 0, y0, f.len, y1b, 0, y1a];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    // 外向きでなければ裏返す
    const nz = g.attributes.normal.getZ(0), nx = g.attributes.normal.getX(0);
    if (nx * f.n[0] + nz * f.n[1] < 0) { g.index = null; const p = g.attributes.position.array; for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; } const u = g.attributes.uv.array; for (let i = 0; i < u.length; i += 6) for (let c = 0; c < 2; c++) { const t = u[i + 2 + c]; u[i + 2 + c] = u[i + 4 + c]; u[i + 4 + c] = t; } g.computeVertexNormals(); }
    b.add(g, accent && (name === 'front') && r() < 0.5 ? accent : wall, new THREE.Matrix4());
  }
  // コーナー材
  if (wp !== 'plaster') for (const [x, z] of [[-X, -Z], [X, -Z], [X, Z], [-X, Z]]) b.box(0.07, H - BASE + (shape === 'shed' && z > 0 ? shedHigh : 0), 0.07, trim, x, BASE + (H - BASE) / 2, z);
  // 1階と2階の境の帯（幕板）
  if (floors >= 2 && r() < 0.5) for (const f of Object.values(F)) { const m = at(f, f.len / 2, 0.03); b.box(f.len + 0.06, 0.12, 0.05, trim, m[0], BASE + FH - 0.05, m[1], faceRot(f.n)); }

  // ---- 屋根 ----
  const o = old ? 0.75 : 0.5;
  const ridgeAlongX = W >= D;
  const RL = ridgeAlongX ? W : D, RW = ridgeAlongX ? D : W; // 棟の長さ・奥行き
  const rise = Math.min(2.8, RW / 2 * (roofKind === 'kawara' ? 0.5 : 0.42));
  const ryRoof = ridgeAlongX ? 0 : Math.PI / 2;
  const R = (x, z) => ridgeAlongX ? [x, z] : [z, -x]; // 屋根座標 → 建物座標
  const fasciaM = trim, th = 0.12;
  if (shape === 'gable' || shape === 'hip') {
    const slope = Math.hypot(RW / 2 + o, rise + o * rise / (RW / 2)), ang = Math.atan2(rise, RW / 2);
    if (shape === 'gable') {
      for (const s of [-1, 1]) {
        const cz = s * (RW / 2 + o) / 2, cy = H + rise / 2 - (o * rise / (RW / 2)) / 2;
        const [x, z] = R(0, cz);
        b.add(box(RL + 2 * 0.45, th, slope), roofM, mat(x, cy + 0.06, z, -s * ang, ryRoof, 0, 1, 1, 1).premultiply(new THREE.Matrix4()).multiply(new THREE.Matrix4()), undefined);
        // 鼻隠し（軒先の板）と雨樋
        const [ex, ez] = R(0, s * (RW / 2 + o));
        const ey = H - o * rise / (RW / 2);
        b.box(RL + 0.95, 0.18, 0.05, fasciaM, ex, ey, ez, ryRoof);
        const [gx, gz] = R(0, s * (RW / 2 + o + 0.06));
        b.box(RL + 0.9, 0.1, 0.11, gutter, gx, ey - 0.08, gz, ryRoof);
      }
      // 妻壁（三角）と破風板
      for (const s of [-1, 1]) {
        const g = new THREE.BufferGeometry();
        const ex = s * RL / 2;
        const pts = [[ex, H, -RW / 2], [ex, H, RW / 2], [ex, H + rise, 0]].map(([x, y, z]) => { const [a, c] = R(x, z); return [a, y, c]; });
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, H, RW, H, RW / 2, H + rise], 2));
        g.computeVertexNormals();
        const n = g.attributes.normal; const want = R(s, 0);
        if (n.getX(0) * want[0] + n.getZ(0) * want[1] < 0) { const p = g.attributes.position.array; for (let c = 0; c < 3; c++) { const t = p[3 + c]; p[3 + c] = p[6 + c]; p[6 + c] = t; } const u = g.attributes.uv.array; [u[2], u[4]] = [u[4], u[2]]; [u[3], u[5]] = [u[5], u[3]]; g.computeVertexNormals(); }
        b.add(g, wall, new THREE.Matrix4());
        for (const t of [-1, 1]) {
          const [px, pz] = R(s * (RL / 2 + 0.47), t * (RW / 2 + o) / 2);
          b.add(box(0.05, 0.22, slope + 0.05), fasciaM, mat(px, H + rise / 2 - (o * rise / (RW / 2)) / 2 + 0.02, pz, -t * ang, ryRoof, 0));
        }
        // 換気の小窓（妻の上）
        const [vx, vz] = R(s * (RL / 2 + 0.03), 0);
        b.box(0.04, 0.35, 0.5, k.alu, vx, H + rise * 0.45, vz, ryRoof);
      }
    } else {
      // 寄棟
      const g = hipGeo(RL, RW, rise, o);
      b.add(g, roofM, mat(0, H + 0.05, 0, 0, ryRoof, 0));
      const ey = H - o * rise / (RW / 2);
      for (const [cx, cz, len, ry] of [[0, -(RW / 2 + o), RL + 2 * o, 0], [0, RW / 2 + o, RL + 2 * o, 0], [-(RL / 2 + o), 0, RW + 2 * o, Math.PI / 2], [RL / 2 + o, 0, RW + 2 * o, Math.PI / 2]]) {
        const [x, z] = R(cx, cz);
        b.box(len, 0.18, 0.05, fasciaM, x, ey + 0.04, z, ry + ryRoof);
        const [gx, gz] = R(cx * (1 + 0.06 / (Math.abs(cx) || 1)), cz * (1 + 0.06 / (Math.abs(cz) || 1)));
        b.box(len - 0.1, 0.1, 0.11, gutter, gx, ey - 0.05, gz, ry + ryRoof);
      }
      // 隅棟（瓦屋根のとき）
      if (roofKind === 'kawara') {
        const rr = Math.max(0, (RL - RW) / 2);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const a3 = [sx * rr, H + rise + 0.05, 0], b3 = [sx * (RL / 2 + o * 0.9), H + 0.05 - o * rise / (RW / 2) * 0.9, sz * (RW / 2 + o * 0.9)];
          const [ax, az] = R(a3[0], a3[2]), [bx, bz] = R(b3[0], b3[2]);
          const dx = bx - ax, dy = b3[1] - a3[1], dz = bz - az, L = Math.hypot(dx, dy, dz);
          const mm = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0));
          mm.setPosition((ax + bx) / 2, (a3[1] + b3[1]) / 2 + 0.06, (az + bz) / 2);
          b.add(box(0.2, 0.14, L), roofM, mm);
        }
      }
    }
    // 棟
    const ridgeL = shape === 'gable' ? RL + 0.9 : Math.max(0.3, RL - RW);
    b.add(box(ridgeL, roofKind === 'kawara' ? 0.22 : 0.12, roofKind === 'kawara' ? 0.3 : 0.2), roofKind === 'kawara' ? roofM : k.roofMat(roofKind, roofCol), mat(0, H + rise + 0.1, 0, 0, ryRoof, 0));
    if (roofKind === 'kawara' && shape === 'gable') for (const s of [-1, 1]) { const [x, z] = R(s * (RL / 2 + 0.45), 0); b.box(0.12, 0.42, 0.36, roofM, x, H + rise + 0.12, z, ryRoof); } // 鬼瓦
    // テレビアンテナ
    if (r() < (old ? 0.6 : 0.2)) {
      const [ax, az] = R(RL * 0.2, 0);
      b.box(0.04, 1.8, 0.04, k.alu, ax, H + rise + 1.0, az);
      for (let i = 0; i < 6; i++) { const [ex, ez] = R(RL * 0.2 + (i - 2.5) * 0.15, 0); b.box(0.02, 0.02, 0.9 - i * 0.08, k.alu, ex, H + rise + 1.7, ez, ryRoof); }
    }
    // 太陽光パネル（片側の屋根面）
    if (!old && r() < 0.25) {
      const s = r() < 0.5 ? -1 : 1, pw = Math.min(RL - 1.2, 6), pd = Math.min(RW / 2 - 0.4, 2.6);
      const cz = s * (RW / 4), cy = H + rise / 2 + 0.18;
      const [x, z] = R(0, cz);
      const g = new THREE.PlaneGeometry(pw, pd); g.rotateX(-Math.PI / 2);
      b.add(g, k.solar, mat(x, cy, z, -s * ang, ryRoof, 0), { noShadow: true });
    }
  } else if (shape === 'shed') {
    // 片流れ（正面が低く、背面が高い）
    const slope = Math.hypot(D + 2 * 0.4, shedHigh), ang = Math.atan2(shedHigh, D);
    b.add(box(W + 0.8, 0.1, slope), roofM, mat(0, H + shedHigh / 2 + 0.06, 0, ang, 0, 0));
    b.box(W + 0.85, 0.22, 0.06, fasciaM, 0, H - 0.04, -Z - 0.42);
    b.box(W + 0.85, 0.22, 0.06, fasciaM, 0, H + shedHigh + 0.08, Z + 0.42);
    b.box(W + 0.8, 0.1, 0.11, gutter, 0, H - 0.14, -Z - 0.48);
    for (const s of [-1, 1]) b.add(box(0.06, 0.22, slope), fasciaM, mat(s * (X + 0.42), H + shedHigh / 2 + 0.04, 0, ang, 0, 0));
  }
  // 竪樋（雨水を下ろす管）
  for (const [x, z] of [[-X - 0.12, -Z - 0.12], [X + 0.12, Z + 0.12]]) b.box(0.07, H - 0.15, 0.07, gutter, x, (H - 0.15) / 2, z);

  // ---- 開口部：玄関・窓・ベランダ ----
  const front = F.front;
  const doorW = 0.92;
  let doorT = spec.doorT ?? (r() < 0.5 ? 1.2 + r() * 0.6 : W - 1.2 - r() * 0.6);
  doorT = Math.max(0.9, Math.min(W - 0.9, doorT));
  const doorY = BASE + 1.05;
  const dType = old ? 3 : pickR(r, [0, 0, 1]);
  const doorWorld = (() => { const [x, z] = at(front, doorT, 0); return { x, z }; })();
  if (!spec.wantDoor) {
    const g = atlasUV(new THREE.PlaneGeometry(old ? 1.7 : doorW, 2.1), dType, 4, 2);
    // ドアの絵は縦長：アトラスの1列＝縦2段分を使う
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) === 1 || uv.getY(i) > 0.75 ? 1 : 0);
    const [x, z] = at(front, doorT, 0.03);
    b.plane(g, k.door, x, doorY, z, faceRot(front.n), 0, { noShadow: true });
  } else {
    // 動く扉は外で作る。開けたときに見える玄関の中（暗い土間）
    const [x, z] = at(front, doorT, 0.02);
    b.plane(new THREE.PlaneGeometry(doorW, 2.1), k.black, x, doorY, z, faceRot(front.n), 0, { noShadow: true });
  }
  // 玄関の枠・庇・ポーチ・照明
  {
    const [x, z] = at(front, doorT, 0.05);
    const fw = old ? 1.8 : 1.1;
    b.box(fw + 0.1, 0.08, 0.1, sashM, x, doorY + 1.09, z, faceRot(front.n));
    const [cx, cz] = at(front, doorT, 0.45);
    b.box(fw + 0.6, 0.1, 0.85, old ? roofM : k.concrete, cx, BASE + 2.45, cz, faceRot(front.n));
    const [px, pz] = at(front, doorT, 0.55);
    b.box(fw + 0.8, BASE - 0.15, 1.1, k.porchTile, px, (BASE - 0.15) / 2, pz, faceRot(front.n));
    const [sx2, sz2] = at(front, doorT, 1.25);
    b.box(fw + 0.4, 0.15, 0.35, k.porchTile, sx2, 0.075, sz2, faceRot(front.n));
    const [lx, lz] = at(front, doorT + (doorT < W / 2 ? 1 : -1) * (fw / 2 + 0.35), 0.06);
    b.box(0.12, 0.2, 0.08, k.lamp, lx, BASE + 1.95, lz, faceRot(front.n), 0, 0, { noShadow: true });
  }
  // ベランダ（2階・正面か背面）
  let balconyFace = null;
  if (floors >= 2 && r() < 0.8) {
    balconyFace = spec.balcony || (r() < 0.55 ? 'back' : 'front');
    const f = F[balconyFace];
    const bw = Math.min(f.len - 1.0, 3.6 + r() * 2.5), bt = balconyFace === 'front' ? Math.min(Math.max(bw / 2 + 0.5, doorT > W / 2 ? 0.5 + bw / 2 : W - 0.5 - bw / 2), f.len - bw / 2 - 0.5) : f.len / 2 + (r() - 0.5) * (f.len - bw - 1);
    const y = BASE + FH;
    const depth = 0.95;
    const [cx, cz] = at(f, bt, depth / 2);
    b.box(bw, 0.18, depth, k.concrete, cx, y - 0.09, cz, faceRot(f.n));
    const solid = r() < 0.5;
    const [rx, rz] = at(f, bt, depth);
    if (solid) {
      b.box(bw, 1.05, 0.1, accent || wall, rx, y + 0.5, rz, faceRot(f.n));
      b.box(bw + 0.05, 0.05, 0.14, trim, rx, y + 1.05, rz, faceRot(f.n));
      for (const s of [-1, 1]) { const [ex, ez] = at(f, bt + s * bw / 2, depth / 2); b.box(0.1, 1.05, depth, accent || wall, ex, y + 0.5, ez, faceRot(f.n)); }
    } else {
      const rg = new THREE.PlaneGeometry(bw, 0.95); const uv = rg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * bw * 5);
      b.plane(rg, sashM === k.aluDark ? k.railDark : k.railAlu, rx, y + 0.55, rz, faceRot(f.n));
      b.box(bw, 0.05, 0.06, sashM, rx, y + 1.05, rz, faceRot(f.n));
      for (const s of [-1, 1]) { const [ex, ez] = at(f, bt + s * bw / 2, depth / 2); const sg = new THREE.PlaneGeometry(depth, 0.95); const su = sg.attributes.uv; for (let i = 0; i < su.count; i++) su.setX(i, su.getX(i) * depth * 5); b.plane(sg, sashM === k.aluDark ? k.railDark : k.railAlu, ex, y + 0.55, ez, faceRot(f.n) + Math.PI / 2); }
    }
    // 物干し竿と洗濯物
    const [p1x, p1z] = at(f, bt - bw / 2 + 0.2, depth - 0.1), [p2x, p2z] = at(f, bt + bw / 2 - 0.2, depth - 0.1);
    for (const [px, pz] of [[p1x, p1z], [p2x, p2z]]) b.box(0.04, 0.5, 0.04, k.alu, px, y + 1.3, pz);
    b.box(bw - 0.4, 0.035, 0.035, k.alu, (p1x + p2x) / 2, y + 1.52, (p1z + p2z) / 2, faceRot(f.n));
    if (r() < 0.4) {
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const t = bt - bw / 2 + 0.5 + (bw - 1) * (i + 0.5) / n;
        const [lx, lz] = at(f, t, depth - 0.1);
        const h = 0.4 + r() * 0.4;
        b.plane(new THREE.PlaneGeometry(0.35 + r() * 0.25, h), pickR(r, k.laundryCols), lx, y + 1.5 - h / 2, lz, faceRot(f.n), 0, { noShadow: false });
      }
    }
    // ベランダの掃き出し窓
    windowUnit(b, f, bt, y + 1.0, Math.min(1.7, bw - 0.6), 1.9, { type: 3, lit: lit(), frame: sashM, shutterBox: !old });
  }
  // 窓：各面・各階
  for (const [name, f] of Object.entries(F)) {
    for (let fl = 0; fl < floors; fl++) {
      const y0 = BASE + fl * FH;
      const busy = [];
      if (name === 'front' && fl === 0) busy.push([doorT - (old ? 1.3 : 0.9), doorT + (old ? 1.3 : 0.9)]);
      if (balconyFace === name && fl === 1) busy.push([0, f.len]); // ベランダの面は掃き出し窓だけ
      const slots = [];
      let t = 0.7;
      while (t < f.len - 0.7) {
        const big = fl === 0 && (name === 'back' || name === 'front') && r() < 0.35;
        const side = name === 'left' || name === 'right';
        let w = big ? 1.7 : side ? pickR(r, [0.6, 0.75, 1.2]) : pickR(r, [1.2, 1.65, 0.75, 1.65]);
        const h = big ? 1.95 : w <= 0.75 ? pickR(r, [0.6, 0.9]) : pickR(r, [1.1, 1.3]);
        if (t + w > f.len - 0.5) break;
        const c = t + w / 2;
        if (!busy.some(([a2, b2]) => c + w / 2 > a2 && c - w / 2 < b2) && r() < 0.78) slots.push({ c, w, h, big });
        t += w + 0.8 + r() * 1.2;
      }
      for (const s of slots) {
        const small = s.w <= 0.75;
        const type = s.big ? 3 : small ? pickR(r, [2, 6, 7]) : pickR(r, [0, 0, 1, 5, 4]);
        const y = s.big ? y0 + 1.0 : y0 + (small ? 1.6 : 1.45);
        windowUnit(b, f, s.c, y, s.w, s.h, {
          type, lit: lit(), frame: sashM,
          shutterBox: !old && (s.big || (!small && r() < 0.5)), grille: small && fl === 0 && r() < 0.6,
          tobukuro: old && !small ? (r() < 0.5 ? -1 : 1) : 0,
        });
      }
    }
  }

  // ---- 設備：室外機・給湯器・メーター・換気フード ----
  const sideF = r() < 0.5 ? F.left : F.right, backF = F.back;
  const acCount = 1 + Math.floor(r() * (floors + 1));
  for (let i = 0; i < acCount; i++) {
    const f = i % 2 ? backF : sideF, t = 0.8 + r() * (f.len - 1.6);
    const [x, z] = at(f, t, 0.35);
    acUnit(b, x, z, faceRot(f.n));
    // 配管カバー（壁を上る）
    const [px, pz] = at(f, t + 0.3, 0.05);
    const ph = i === 0 ? 0.4 : FH * Math.min(floors - 1, 1) + 0.3;
    b.box(0.1, ph, 0.08, k.pipe, px, 0.6 + ph / 2, pz, faceRot(f.n));
  }
  if (r() < 0.55) {
    // エコキュート（貯湯タンクとヒートポンプ）
    const f = r() < 0.5 ? sideF : backF, t = f.len - 1.0;
    const [x, z] = at(f, t, 0.42);
    b.box(0.64, 1.8, 0.64, k.ecocute, x, 0.92, z, faceRot(f.n));
    const [x2, z2] = at(f, t - 1.0, 0.33);
    acUnit(b, x2, z2, faceRot(f.n), 1.05);
  } else {
    // ガス給湯器（壁掛け）とガスメーター
    const f = sideF, [x, z] = at(f, f.len * 0.65, 0.12);
    b.box(0.45, 0.6, 0.22, k.ecocute, x, 1.6, z, faceRot(f.n));
    const [x2, z2] = at(f, f.len * 0.65 + 0.7, 0.1);
    b.box(0.25, 0.3, 0.15, k.meterDark, x2, 1.05, z2, faceRot(f.n));
  }
  // 電気メーター（正面の近くの側面）
  { const f = doorT < W / 2 ? F.left : F.right; const [x, z] = at(f, f === F.left ? f.len - 0.6 : 0.6, 0.08); b.box(0.22, 0.32, 0.12, k.meter, x, 1.5, z, faceRot(f.n)); }
  // 換気フード
  for (let i = 0; i < 2; i++) { const f = pickR(r, [F.left, F.right, F.back]); const [x, z] = at(f, 0.6 + r() * (f.len - 1.2), 0.08); b.box(0.2, 0.18, 0.14, k.alu, x, BASE + FH * Math.floor(r() * floors) + 2.1, z, faceRot(f.n)); }

  return { door: { t: doorT, x: doorWorld.x, z: doorWorld.z, y: BASE, w: doorW, old }, H, base: BASE };
}

// 室外機（白い箱・ファンの格子・脚）
export function acUnit(b, x, z, ry, s = 1) {
  const k = initHouseKit();
  b.box(0.8 * s, 0.58 * s, 0.28 * s, k.ac, x, 0.36 * s, z, ry);
  const fan = new THREE.CircleGeometry(0.21 * s, 18);
  const off = 0.141 * s;
  b.plane(fan, k.acDark, x + Math.sin(ry) * off - Math.cos(ry) * 0.12 * s, 0.37 * s, z + Math.cos(ry) * off + Math.sin(ry) * 0.12 * s, ry, 0, { noShadow: true });
  b.box(0.82 * s, 0.06, 0.32 * s, k.acDark, x, 0.04, z, ry);
}

// 寄棟屋根の形（L：棟方向、W：奥行き、h：高さ、o：軒の出）
function hipGeo(L, W, h, o) {
  const X = L / 2 + o, Z = W / 2 + o, r = Math.max(0, (L - W) / 2);
  const y0 = -(o * h) / (W / 2);
  const pos = [], uv = [];
  const tri = (a, b, c) => { pos.push(...a, ...b, ...c); uv.push(a[0], a[2] + a[1], b[0], b[2] + b[1], c[0], c[2] + c[1]); };
  const A0 = [-X, y0, Z], B0 = [X, y0, Z], C0 = [X, y0, -Z], D0 = [-X, y0, -Z], R0 = [-r, h, 0], R1 = [r, h, 0];
  tri(A0, B0, R1); tri(A0, R1, R0); tri(C0, D0, R0); tri(C0, R0, R1); tri(B0, C0, R1); tri(D0, A0, R0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// =========================================================
// 木造アパート（2階建て・外廊下・鉄骨階段）
// =========================================================
export function buildApartment(out, spec) {
  const k = initHouseKit(), r = seeded(spec.seed), b = new Builder(out, spec.base);
  const W = spec.W, D = spec.D, X = W / 2, Z = D / 2, floors = spec.floors || 2;
  const FH = 2.8, BASE = 0.3, H = BASE + floors * FH;
  const wall = k.wallMat(pickR(r, ['lap', 'tile', 'tile']), pickR(r, [0xe9e4d8, 0xd8d3c8, 0xc9c1b2, 0xf0ede6, 0x9aa2a8]));
  const roofM = k.roofMat('slate', pickR(r, [0x3c3f44, 0x4b4038, 0x34404f]));
  const F = facades(X, Z);
  for (const f of Object.values(F)) {
    const mid = at(f, f.len / 2, 0);
    b.box(f.len, H, 0.02, wall, mid[0], H / 2, mid[1], faceRot(f.n));
  }
  // 屋根（緩い切妻）
  const rise = Math.min(1.6, D * 0.12), ang = Math.atan2(rise, D / 2), slope = Math.hypot(D / 2 + 0.5, rise + 0.1);
  for (const s of [-1, 1]) b.add(box(W + 0.8, 0.1, slope), roofM, mat(0, H + rise / 2, s * (D / 4 + 0.25), -s * ang, 0, 0));
  for (const s of [-1, 1]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([s * X, H, -Z, s * X, H, Z, s * X, H + rise, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, D, 0, D / 2, rise], 2)); g.computeVertexNormals(); if (g.attributes.normal.getX(0) * s < 0) { const p = g.attributes.position.array; [p[3], p[6]] = [p[6], p[3]]; [p[4], p[7]] = [p[7], p[4]]; [p[5], p[8]] = [p[8], p[5]]; g.computeVertexNormals(); } b.add(g, wall, new THREE.Matrix4()); }
  // 外廊下（正面・2階以上）と手すり
  const units = Math.max(2, Math.round(W / 6));
  const uw = (W - 0.4) / units;
  const rooms = [];
  for (let fl = 1; fl < floors; fl++) {
    const y = BASE + fl * FH;
    b.box(W + 1.4, 0.18, 1.3, k.concrete, 0.7, y - 0.09, -Z - 0.65);
    b.box(W + 1.4, 1.05, 0.06, k.steelGreen, 0.7, y + 0.5, -Z - 1.27);
    b.box(W + 1.4, 0.06, 0.12, k.steel, 0.7, y + 1.05, -Z - 1.27);
  }
  for (let i = 0; i <= units; i++) b.box(0.15, BASE + (floors - 1) * FH, 0.15, k.steel, -X + 0.1 + i * (W - 0.2) / units, (BASE + (floors - 1) * FH) / 2, -Z - 1.22);
  // 鉄骨階段（右端、奥へ向かって上る）
  if (floors >= 2) {
    const sx = X + 0.7, top = BASE + FH;
    const n = 14;
    // 側桁
    for (const s of [-0.5, 0.5]) {
      const a = [sx + s, 0, -Z + 3.6], c = [sx + s, top, -Z - 0.9];
      const L = Math.hypot(c[1] - a[1], c[2] - a[2]), mm = mat(sx + s, top / 2, (a[2] + c[2]) / 2, Math.atan2(top, a[2] - c[2]), 0, 0);
      b.add(box(0.06, 0.2, L), k.steel, mm);
    }
    for (let i = 0; i < n; i++) b.box(1.0, 0.04, 0.3, k.steel, sx, (i + 0.5) * top / n, -Z + 3.6 - (i + 0.5) * 4.5 / n);
  }
  // 各部屋：玄関ドア・メーターボックス・台所の窓（面格子）・表札
  for (let fl = 0; fl < floors; fl++) {
    const y = BASE + fl * FH;
    for (let u = 0; u < units; u++) {
      const cx = -X + 0.2 + uw * (u + 0.3);
      const g = atlasUV(new THREE.PlaneGeometry(0.85, 2.0), 2, 4, 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.75 ? 1 : 0);
      b.plane(g, k.door, cx, y + 1.0, -Z - 0.02, Math.PI, 0, { noShadow: true });
      b.box(0.55, 1.4, 0.12, k.meter, cx + 0.95, y + 0.9, -Z - 0.07, Math.PI);
      windowUnit(b, F.front, X + (cx + uw * 0.55), y + 1.6, 0.8, 0.6, { type: 6, lit: r() < 0.4, grille: true });
      rooms.push({ room: `${fl + 1}0${u + 1}`, floor: fl, x: cx, y: fl ? y : 0, z: -Z, meterX: cx + 0.95 });
      // 背面：ベランダと掃き出し窓、隔て板、室外機
      const bx = -X + 0.2 + uw * (u + 0.5);
      if (fl >= 1) {
        b.box(uw - 0.1, 0.15, 0.9, k.concrete, bx, y - 0.07, Z + 0.45);
        const rg = new THREE.PlaneGeometry(uw - 0.1, 0.95); const ru = rg.attributes.uv; for (let i = 0; i < ru.count; i++) ru.setX(i, ru.getX(i) * uw * 5);
        b.plane(rg, k.railAlu, bx, y + 0.5, Z + 0.9, 0);
        b.box(0.04, 1.6, 0.9, k.ac, bx + uw / 2 - 0.05, y + 0.8, Z + 0.45);
        acUnit(b, bx - uw / 2 + 0.6, Z + 0.45, 0, 0.9);
      } else acUnit(b, bx - uw / 2 + 0.6, Z + 0.4, 0, 0.9);
      windowUnit(b, F.back, X - (bx + 0.2), y + 1.0, 1.6, 1.85, { type: pickR(r, [0, 1, 3]), lit: r() < 0.45, shutterBox: true });
    }
  }
  return { rooms, H, stairs: { x: X + 0.7, zBottom: -Z + 4.1, zTop: -Z - 0.7, top: BASE + FH }, corridor: { x0: -X, x1: X + 0.5, z0: -Z - 1.25, z1: -Z - 0.15 } };
}

// =========================================================
// マンション（鉄筋コンクリート・各階のバルコニー）
// =========================================================
export function buildMansion(out, spec) {
  const k = initHouseKit(), r = seeded(spec.seed), b = new Builder(out, spec.base);
  const W = spec.W, D = spec.D, X = W / 2, Z = D / 2, floors = spec.floors;
  const FH = 2.95, H = 0.3 + floors * FH;
  const wall = k.wallMat(pickR(r, ['tile', 'tile', 'plaster']), pickR(r, [0xe8e2d4, 0xd6cdbd, 0xbfb6a6, 0xeeeae2, 0x9c8f80]));
  const F = facades(X, Z);
  for (const f of Object.values(F)) { const mid = at(f, f.len / 2, 0); b.box(f.len, H + 0.9, 0.02, wall, mid[0], (H + 0.9) / 2, mid[1], faceRot(f.n)); }
  b.box(W, 0.1, D, k.concrete, 0, H + 0.2, 0);
  // バルコニー（背面）と共用廊下（正面）
  const units = Math.max(2, Math.round(W / 6.5)), uw = W / units;
  for (let fl = 0; fl < floors; fl++) {
    const y = 0.3 + fl * FH;
    if (fl >= 1) {
      b.box(W + 0.2, 0.2, 1.4, k.concrete, 0, y - 0.1, Z + 0.7);
      b.box(W + 0.2, 1.1, 0.15, wall, 0, y + 0.55, Z + 1.35);
      b.box(W + 0.2, 0.2, 1.3, k.concrete, 0, y - 0.1, -Z - 0.65);
      b.box(W + 0.2, 1.1, 0.15, wall, 0, y + 0.55, -Z - 1.25);
    }
    for (let u = 0; u < units; u++) {
      const cx = -X + uw * (u + 0.5);
      windowUnit(b, F.back, X - cx, y + 1.0, Math.min(2.4, uw - 1), 1.9, { type: pickR(r, [0, 1, 3, 5]), lit: r() < 0.5, frame: k.aluDark });
      if (fl >= 1) b.box(0.05, 1.8, 1.3, k.ac, cx + uw / 2, y + 0.9, Z + 0.7);
      if (fl >= 1 && r() < 0.6) acUnit(b, cx - uw / 2 + 0.7, Z + 0.7, 0, 0.9);
      windowUnit(b, F.front, X + cx + 1.0, y + 1.6, 0.8, 0.6, { type: 6, lit: r() < 0.4, grille: true });
      if (fl >= 1) { const g = atlasUV(new THREE.PlaneGeometry(0.9, 2.0), 2, 4, 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.75 ? 1 : 0); b.plane(g, k.door, cx - 0.4, y + 1.0, -Z - 0.02, Math.PI, 0, { noShadow: true }); }
    }
  }
  return { H };
}

// =========================================================
// 店舗（1階が店・2階が住まい／コンビニ）と、倉庫・工場
// =========================================================
export function buildShop(out, spec) {
  const k = initHouseKit(), r = seeded(spec.seed), b = new Builder(out, spec.base);
  const W = spec.W, D = spec.D, X = W / 2, Z = D / 2;
  const conbini = spec.kind === 'conbini';
  const floors = conbini ? 1 : spec.floors || 2;
  const H = conbini ? 4.4 : 0.3 + floors * 3.0;
  const wall = conbini ? k.wallMat('plaster', 0xf3f1ea) : k.wallMat(pickR(r, ['tile', 'lap', 'plaster']), pickR(r, [0xe9e4d8, 0xd8cfc0, 0xc2b8a8, 0xf0ede6]));
  const F = facades(X, Z);
  for (const f of Object.values(F)) { const mid = at(f, f.len / 2, 0); b.box(f.len, H + 0.6, 0.02, wall, mid[0], (H + 0.6) / 2, mid[1], faceRot(f.n)); }
  b.box(W, 0.1, D, k.concrete, 0, H + 0.05, 0);
  // ガラスの店先
  const gw = W - 1.2;
  const g = atlasUV(new THREE.PlaneGeometry(gw, 2.4), 5, k.WC, k.WR);
  b.plane(g, k.glassLit, 0, 1.35, -Z - 0.03, Math.PI, 0, { noShadow: true });
  for (let i = 0; i <= Math.round(gw / 1.8); i++) b.box(0.07, 2.5, 0.1, k.alu, -gw / 2 + i * gw / Math.round(gw / 1.8), 1.35, -Z - 0.06);
  b.box(gw + 0.1, 0.08, 0.1, k.alu, 0, 2.6, -Z - 0.06);
  if (conbini) {
    // 帯の看板（白地に緑と黄色）
    b.box(W + 0.2, 0.9, 0.12, k.wallMat('plaster', 0xf6f6f2), 0, 3.6, -Z - 0.08);
    b.box(W + 0.2, 0.16, 0.13, k.tent(0x2f7d4f), 0, 3.25, -Z - 0.09);
    b.box(W + 0.2, 0.08, 0.13, k.tent(0xe0a92a), 0, 3.12, -Z - 0.09);
  } else {
    // テント（日よけ）
    const tg = new THREE.PlaneGeometry(gw + 0.4, 1.2); tg.rotateX(-Math.PI / 2 + 0.5);
    b.plane(tg, k.tent(spec.color || pickR(r, [0x2f6b4f, 0x8a2f2a, 0x2d4a7a, 0x7a5a2a])), 0, 2.8, -Z - 0.55, Math.PI);
    for (let fl = 1; fl < floors; fl++) for (let t = 1.2; t < W - 1; t += 2.4) windowUnit(b, F.front, t, 0.3 + fl * 3 + 1.45, 1.5, 1.2, { type: pickR(r, [0, 1, 5]), lit: r() < 0.5, shutterBox: true });
  }
  // 室外機と換気
  for (let i = 0; i < 3; i++) acUnit(b, -X + 1 + i * 1.1, Z + 0.4, 0);
  return { H };
}
export function buildWarehouse(out, spec) {
  const k = initHouseKit(), r = seeded(spec.seed), b = new Builder(out, spec.base);
  const W = spec.W, D = spec.D, X = W / 2, Z = D / 2, H = Math.min(9, 5 + W * 0.05);
  const wall = k.wallMat('vert', pickR(r, [0xc9cccd, 0xb7bdbf, 0xd9d6cf, 0x8f9aa1]));
  const F = facades(X, Z);
  for (const f of Object.values(F)) { const mid = at(f, f.len / 2, 0); b.box(f.len, H, 0.02, wall, mid[0], H / 2, mid[1], faceRot(f.n)); }
  const rise = Math.min(2, D * 0.06), ang = Math.atan2(rise, D / 2), slope = Math.hypot(D / 2 + 0.4, rise);
  const roofM = k.roofMat('metal', pickR(r, [0x8e9294, 0x4f6a80, 0x6d7a6a]));
  for (const s of [-1, 1]) b.add(box(W + 0.6, 0.1, slope), roofM, mat(0, H + rise / 2, s * D / 4, -s * ang, 0, 0));
  for (const s of [-1, 1]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([s * X, H, -Z, s * X, H, Z, s * X, H + rise, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, D, 0, D / 2, rise], 2)); g.computeVertexNormals(); if (g.attributes.normal.getX(0) * s < 0) { const p = g.attributes.position.array; [p[3], p[6]] = [p[6], p[3]]; [p[4], p[7]] = [p[7], p[4]]; [p[5], p[8]] = [p[8], p[5]]; g.computeVertexNormals(); } b.add(g, wall, new THREE.Matrix4()); }
  // シャッターと高窓
  const sh = Math.min(5, H - 1.5);
  for (let t = 3; t < W - 3; t += 8) { const [x, z] = at(F.front, t, 0.04); const g = atlasUV(new THREE.PlaneGeometry(4, sh), 4, k.WC, k.WR); b.plane(g, k.glass, x, sh / 2, z, Math.PI, 0, { noShadow: true }); b.box(4.3, 0.5, 0.4, k.alu, x, sh + 0.25, z - 0.15, Math.PI); }
  for (const f of [F.left, F.right, F.back]) for (let t = 2; t < f.len - 1.5; t += 4) windowUnit(b, f, t, H - 1.2, 1.6, 0.7, { type: 5, lit: false });
  return { H };
}

// =========================================================
// 遠くの建物（簡単な形）：壁の箱と屋根の色だけ
// =========================================================
export function buildLOD(out, spec) {
  const k = initHouseKit(), r = seeded(spec.seed), b = new Builder(out, spec.base);
  const W = spec.W, D = spec.D, H = spec.H;
  const colors = [0xece8de, 0xe2d8c8, 0xd6d1c8, 0xb9b2a6, 0xf2f0ea, 0x8f9399];
  if (!K._lodWall) { const base = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); K._lodWall = colors.map(c => k.tint(base, c)); }
  if (!K._lodRoof) { const base = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }); K._lodRoof = [0x3c3f44, 0x5e6266, 0x4b4038, 0x34404f, 0x7a4f3c, 0x6f7376].map(c => k.tint(base, c)); }
  b.box(W, H, D, pickR(r, K._lodWall), 0, H / 2, 0);
  if (spec.pitched) {
    const rise = Math.min(2.4, Math.min(W, D) * 0.22);
    const along = W >= D;
    b.add(hipGeo(along ? W : D, along ? D : W, rise, 0.4), pickR(r, K._lodRoof), mat(0, H, 0, 0, along ? 0 : Math.PI / 2, 0), { noShadow: true });
  }
}
