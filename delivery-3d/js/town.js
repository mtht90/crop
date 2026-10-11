// あおば町の生成：道路・家・アパート・店・営業所・電柱・信号・畑
import * as THREE from 'three';
import { A, box, flat, gableRoof, gableWall, Batch, Instancer, Atlas, model, textTexture, JP_FONT } from './assets.js';
import { RESIDENTS, EXTRA_SURNAMES } from './data.js';

export const NAT_Z = 160, NAT_HALF = 5, NAT_X0 = -260, NAT_X1 = 260;
export const NS_X = [-110, -30, 50, 130];
export const EW_Z = [16, 64, 112];
const STREET_HALF = 3;
const COLS = [[-107, -33], [-27, 47], [53, 127]];
// 行：z範囲, 正面の向き（-1=北向き, +1=南向き）, 住所の「番」
const ROWS = {
  D: { z0: -8, z1: 12, face: 1, ban: 1 },
  C1: { z0: 20, z1: 39, face: -1, ban: 2 },
  C2: { z0: 41, z1: 60, face: 1, ban: 3 },
  B1: { z0: 68, z1: 87, face: -1, ban: 4 },
  B2: { z0: 89, z1: 108, face: 1, ban: 5 },
  A: { z0: 116, z1: 134, face: -1, ban: 6 },
  S: { z0: 135, z1: 151, face: 1, ban: 7 },
};

// 特別な区画
const SPECIAL = {
  '1-C2-0': { kind: 'mansion', span: 2, name: 'グランあおば' },
  '2-B2-1': { kind: 'apart', span: 2, name: 'メゾンあおば' },
  '1-S-0': { kind: 'conbini', span: 2, name: 'あおばマート' },
  '1-S-2': { kind: 'shop', name: '喫茶こもれび', sign: '喫茶 こもれび', color: '#5b4632' },
  '1-S-3': { kind: 'shop', name: 'ベーカリー松本', sign: 'ベーカリー松本', color: '#9a5a2c' },
  '2-S-0': { kind: 'shop', name: '花屋はなまる', sign: '花屋 はなまる', color: '#4f7a45' },
  '2-S-1': { kind: 'parking', name: 'コインパーキング' },
  '2-S-2': { kind: 'shop', name: '中島書店', sign: '中島書店', color: '#2f4a6e' },
  '3-S-0': { kind: 'shop', name: 'クリーニング白鳥', sign: 'クリーニング白鳥', color: '#3d6c8c' },
  '3-S-3': { kind: 'parking', name: '月極駐車場' },
  '3-C1-3': { kind: 'park', name: 'あおば児童公園' },
  '2-D-3': { kind: 'field', name: '畑' },
  '3-D-3': { kind: 'farmhouse' },
};

let rngState = 12345;
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };
const rpick = (a) => a[Math.floor(rnd() * a.length)];

export const T = {
  colliders: [], circles: [], lots: {}, lotList: [], signals: [], depot: null, roads: [], segments: [], graph: null,
  dynamic: [], lampMats: [], windowMats: [],
};

function addBox(x0, x1, z0, z1, h = 3) { T.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h }); }
function addCircle(x, z, r) { T.circles.push({ x, z, r }); }

let I = null, AT = null, BB = null, btnMat = null; // インスタンス描画・文字の板・まとめ描画
function placeAt(geo, mat, pos, rotY = 0) { BB.add(geo, mat, M(pos.x, pos.y, pos.z, rotY)); }
function inst(name, pos, rotY = 0, part, s = 1) { I.add(name, M(pos.x, pos.y, pos.z, rotY, s, s, s), part); }

// ローカル→ワールド変換用
function lotMatrix(cx, cz, rot) {
  return new THREE.Matrix4().makeRotationY(rot).setPosition(cx, 0, cz);
}
function M(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().makeRotationY(ry);
  m.scale(new THREE.Vector3(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
}
function localToWorld(base, x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(base); }
// ローカルの矩形（x0..x1, z0..z1）をワールドの当たり判定に
function addLocalBox(base, x0, x1, z0, z1, h = 3) {
  const a = localToWorld(base, x0, 0, z0), b = localToWorld(base, x1, 0, z1);
  addBox(a.x, b.x, a.z, b.z, h);
}

// =========================================================
export function buildTown(scene) {
  rngState = 12345;
  const root = new THREE.Group();
  scene.add(root);
  const B = new Batch();
  BB = B; I = new Instancer(); AT = new Atlas(2048, 256, 128);
  btnMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0x88aaff, emissiveIntensity: 0.4 });
  const mats = A.mats;

  // ---- 地面 ----
  // 地面は少し下げ、道路や敷地の面とちらつかないようにする
  const groundMat = mats.grass.clone();
  groundMat.polygonOffset = true; groundMat.polygonOffsetFactor = 2; groundMat.polygonOffsetUnits = 4;
  const ground = new THREE.Mesh(flat(1400, 1400), groundMat);
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  root.add(ground);

  buildRoads(B, mats);
  buildLots(B, mats, root);
  buildDepot(B, mats, root);
  buildFields(B, mats, root);
  buildPoles(B, mats, root);
  buildSignals(root);
  buildRoadSigns(root);
  buildGraph();

  B.build(root);
  I.build(root);
  for (const d of T.dynamic) root.add(d);
  return root;
}

// =========================================================
// 道路
// =========================================================
function buildRoads(B, m) {
  const I = new THREE.Matrix4();
  const y = 0.02;
  const road = (x0, x1, z0, z1, kind) => {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B.add(flat(w, d, cx, cz), m.asphalt, M(cx, y, cz), { noShadow: true });
    T.roads.push({ x0, x1, z0, z1, kind });
  };
  // 国道
  road(NAT_X0, NAT_X1, NAT_Z - NAT_HALF, NAT_Z + NAT_HALF, 'national');
  // 生活道路
  for (const z of EW_Z) road(-113, 133, z - STREET_HALF, z + STREET_HALF, 'street');
  for (const x of NS_X) road(x - STREET_HALF, x + STREET_HALF, 13, NAT_Z - NAT_HALF, 'street');
  // 農道
  road(133, 242.5, 16 - 2.5, 16 + 2.5, 'farm');
  road(237.5, 242.5, 18.5, NAT_Z - NAT_HALF, 'farm');
  // 営業所の出入口
  road(-65, -55, NAT_Z + NAT_HALF, 172, 'drive');

  // ---- 国道の歩道（縁石つき）----
  const sidewalk = (x0, x1, z0, z1) => {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B.add(box(w, 0.14, d), m.sidewalk, M(cx, 0.07, cz));
  };
  const gapsN = NS_X.map(x => [x - STREET_HALF - 1, x + STREET_HALF + 1]).concat([[236.5, 243.5]]);
  const gapsS = [[-66, -54]];
  const spans = (gaps) => {
    const out = []; let s = NAT_X0;
    for (const [a, b] of gaps.sort((p, q) => p[0] - q[0])) { out.push([s, a]); s = b; }
    out.push([s, NAT_X1]); return out;
  };
  for (const [a, b] of spans(gapsN)) sidewalk(a, b, NAT_Z - NAT_HALF - 3, NAT_Z - NAT_HALF);
  for (const [a, b] of spans(gapsS)) sidewalk(a, b, NAT_Z + NAT_HALF, NAT_Z + NAT_HALF + 3);

  // ---- 区画線 ----
  const line = (x0, x1, z0, z1, mat = m.lineWhite) => {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B.add(flat(w, d, cx, cz), mat, M(cx, 0.035, cz), { noShadow: true });
  };
  const junctionsX = NS_X.concat([240]);
  const inJunction = (x, pad) => junctionsX.some(j => Math.abs(x - j) < STREET_HALF + pad);
  // 国道：中央線（黄色の実線）、外側線
  for (let x = NAT_X0; x < NAT_X1; x += 1) {
    if (inJunction(x + 0.5, 9)) continue;
    line(x, x + 1, NAT_Z - 0.08, NAT_Z + 0.08, m.lineYellow);
  }
  for (let x = NAT_X0; x < NAT_X1; x += 1) {
    if (!inJunction(x + 0.5, 1) && !(x > -66 && x < -54)) line(x, x + 1, NAT_Z + NAT_HALF - 0.45, NAT_Z + NAT_HALF - 0.3);
    if (!inJunction(x + 0.5, 1)) line(x, x + 1, NAT_Z - NAT_HALF + 0.3, NAT_Z - NAT_HALF + 0.45);
  }
  // 横断歩道（交差点の西側）と停止線
  for (const X of NS_X) {
    for (let z = NAT_Z - NAT_HALF + 0.4; z < NAT_Z + NAT_HALF - 0.4; z += 0.9) line(X - 8.5, X - 4.5, z, z + 0.45);
    line(X - 10.2, X - 9.7, NAT_Z - NAT_HALF + 0.3, NAT_Z - 0.1); // 東行き停止線
    line(X + 4.2, X + 4.7, NAT_Z + 0.1, NAT_Z + NAT_HALF - 0.3);  // 西行き停止線
    line(X + 0.05, X + STREET_HALF - 0.3, 150.2, 150.7);           // 生活道路側の停止線
  }
  // 生活道路：外側線
  for (const z of EW_Z) {
    for (let x = -113; x < 133; x += 1) {
      if (NS_X.some(j => Math.abs(x + 0.5 - j) < STREET_HALF + 0.2)) continue;
      line(x, x + 1, z - STREET_HALF + 0.25, z - STREET_HALF + 0.38);
      line(x, x + 1, z + STREET_HALF - 0.38, z + STREET_HALF - 0.25);
    }
  }
  for (const X of NS_X) {
    for (let z = 13; z < 155; z += 1) {
      if (EW_Z.some(j => Math.abs(z + 0.5 - j) < STREET_HALF + 0.2)) continue;
      line(X - STREET_HALF + 0.25, X - STREET_HALF + 0.38, z, z + 1);
      line(X + STREET_HALF - 0.38, X + STREET_HALF - 0.25, z, z + 1);
    }
    // 生活道路の交差点：縦の道に停止線と「止まれ」
    for (const Z of EW_Z) {
      line(X - STREET_HALF + 0.3, X, Z + STREET_HALF + 0.8, Z + STREET_HALF + 1.25);
      if (Z !== 16) line(X, X + STREET_HALF - 0.3, Z - STREET_HALF - 1.25, Z - STREET_HALF - 0.8);
      if (Z !== 16) stopText(B, X + 1.5, Z - STREET_HALF - 3.5, Math.PI);
      stopText(B, X + 1.5, Z + STREET_HALF + 3.5, 0);
    }
  }
  // 側溝（コンクリートの帯）
  const gutter = (x0, x1, z0, z1) => B.add(box(x1 - x0, 0.05, z1 - z0), m.curb, M((x0 + x1) / 2, 0.03, (z0 + z1) / 2), { noShadow: true });
  for (const z of EW_Z) {
    gutter(-113, 133, z - STREET_HALF - 0.45, z - STREET_HALF);
    gutter(-113, 133, z + STREET_HALF, z + STREET_HALF + 0.45);
  }
  for (const X of NS_X) {
    gutter(X - STREET_HALF - 0.45, X - STREET_HALF, 19, 152);
    gutter(X + STREET_HALF, X + STREET_HALF + 0.45, 19, 152);
  }
}

let stopTex = null;
function stopText(B, x, z, rot) {
  if (!stopTex) {
    stopTex = new THREE.MeshStandardMaterial({
      map: textTexture(256, 512, (c, w, h) => {
        c.fillStyle = '#fff'; c.font = `bold 200px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.save(); c.scale(1, 1.2); c.fillText('止', w / 2, h * 0.27 / 1.2 + 20); c.fillText('まれ', w / 2, h * 0.75 / 1.2 + 10); c.restore();
      }), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false,
    });
    stopTex.map.anisotropy = 8;
  }
  const g = new THREE.PlaneGeometry(1.4, 2.8); g.rotateX(-Math.PI / 2);
  B.add(g, stopTex, M(x, 0.04, z, rot), { noShadow: true });
}

// =========================================================
// 区画
// =========================================================
function buildLots(B, m, root) {
  const resByLot = {};
  for (const r of RESIDENTS) (resByLot[r.lot] = resByLot[r.lot] || []).push(r);
  const usedNames = new Set(RESIDENTS.map(r => r.name.split(' ')[0]));
  const extra = EXTRA_SURNAMES.filter(n => !usedNames.has(n));
  let ei = 0;
  const skip = new Set();
  for (let c = 0; c < 3; c++) {
    for (const rowId of Object.keys(ROWS)) {
      const row = ROWS[rowId];
      for (let i = 0; i < 4; i++) {
        const id = `${c + 1}-${rowId}-${i}`;
        if (skip.has(id)) continue;
        const sp = SPECIAL[id] || { kind: rowId === 'S' ? 'house' : 'house' };
        const span = sp.span || 1;
        for (let k = 1; k < span; k++) skip.add(`${c + 1}-${rowId}-${i + k}`);
        const x0 = COLS[c][0] + 7 + 15 * i, x1 = x0 + 15 * span;
        const cx = (x0 + x1) / 2, cz = (row.z0 + row.z1) / 2;
        const rot = row.face < 0 ? 0 : Math.PI; // ローカル -z が正面
        const lot = {
          id, col: c + 1, row: rowId, idx: i, kind: sp.kind, name: sp.name || null, span,
          cx, cz, w: x1 - x0, d: row.z1 - row.z0, rot, face: row.face,
          address: `あおば町${c + 1}-${row.ban}-${i + 1}`,
          residents: resByLot[id] || [],
          points: {}, doors: [],
        };
        lot.base = lotMatrix(cx, cz, rot);
        lot.surname = lot.residents.length && !['apart', 'mansion'].includes(sp.kind) ? lot.residents[0].name.split(' ')[0] : extra[ei++ % extra.length];
        if (sp.kind === 'house' && rowId === 'S') lot.kind = 'house';
        T.lots[id] = lot; T.lotList.push(lot);
        const builder = { house: buildHouse, apart: buildApart, mansion: buildMansion, shop: buildShop, conbini: buildShop, parking: buildParking, park: buildPark, field: buildSmallField, farmhouse: buildHouse }[lot.kind] || buildHouse;
        builder(B, m, root, lot, sp);
      }
    }
  }
}

function plateDraw(text, sub) {
  return (c, w, h) => {
      c.fillStyle = '#e9e4d8'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#8c8270'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
      c.fillStyle = '#222'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `bold 64px ${JP_FONT}`; c.fillText(text, w / 2, sub ? 52 : h / 2);
      if (sub) { c.font = `26px ${JP_FONT}`; c.fillText(sub, w / 2, 102); }
  };
}
function plateGeo(w, h, text) { return AT.plane(w, h, plateDraw(text)); }
function addrGeo(text) {
  return AT.plane(0.3, 0.15, (c, w, h) => {
    c.fillStyle = '#20508a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold 40px ${JP_FONT}`; c.fillText(text, w / 2, h / 2 + 2);
  });
}
function nameplate(lot, text, sub) {
  return new THREE.MeshStandardMaterial({
    map: textTexture(256, 128, (c, w, h) => {
      c.fillStyle = '#e9e4d8'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#8c8270'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
      c.fillStyle = '#222'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `bold 64px ${JP_FONT}`; c.fillText(text, w / 2, sub ? 52 : h / 2);
      if (sub) { c.font = `26px ${JP_FONT}`; c.fillText(sub, w / 2, 102); }
    }), roughness: 0.5,
  });
}
// 住居表示（青いプレート）
function addressPlate(text) {
  return new THREE.MeshStandardMaterial({
    map: textTexture(256, 96, (c, w, h) => {
      c.fillStyle = '#20508a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `bold 40px ${JP_FONT}`; c.fillText(text, w / 2, h / 2 + 2);
    }), roughness: 0.4,
  });
}

function windowAt(B, m, base, x, y, z, w, h, face = -1) {
  // face: -1 は -z 向きの壁
  const glassG = new THREE.PlaneGeometry(w, h);
  if (face < 0) glassG.rotateY(Math.PI);
  B.add(glassG, m.glass, base.clone().multiply(M(x, y, z + 0.06 * face)), { noShadow: true });
  const t = 0.06;
  B.add(box(w + 2 * t, t, 0.1), m.frame, base.clone().multiply(M(x, y + h / 2, z + 0.03 * face)));
  B.add(box(w + 2 * t, t, 0.1), m.frame, base.clone().multiply(M(x, y - h / 2, z + 0.03 * face)));
  B.add(box(t, h, 0.1), m.frame, base.clone().multiply(M(x - w / 2, y, z + 0.03 * face)));
  B.add(box(t, h, 0.1), m.frame, base.clone().multiply(M(x + w / 2, y, z + 0.03 * face)));
  B.add(box(0.035, h, 0.08), m.frame, base.clone().multiply(M(x, y, z + 0.035 * face)));
  // 夜に明かりがつく窓
  if (rnd() < 0.5) {
    if (!T._litMat) T._litMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false });
    B.add(new THREE.PlaneGeometry(w * 0.96, h * 0.96), T._litMat, base.clone().multiply(M(x, y, z + 0.075 * face, face < 0 ? Math.PI : 0)), { noShadow: true });
  }
}

// 一戸建て
function buildHouse(B, m, root, lot) {
  const base = lot.base;
  const W = lot.w, D = lot.d;
  const z0 = -D / 2, zBack = D / 2;
  const farm = lot.kind === 'farmhouse';
  const wallMat = farm ? m.cedarDark : rpick([m.plaster, m.plasterCream, m.beige, m.siding, m.stucco, m.plasterGray, m.sidingDark]);
  const roofMat = farm ? m.roof : rpick([m.roof, m.roof, m.roofBrown, m.roofBlue]);
  const L = (geo, mat, x, y, z, ry = 0, opts) => B.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  const res = lot.residents[0];

  // 敷地の舗装
  L(flat(3.6, 6.5), m.concrete, -5, 0.025, z0 + 3.25, 0, { noShadow: true });
  L(flat(1.3, 6.5), m.concrete, 0.6, 0.025, z0 + 3.25, 0, { noShadow: true });
  L(flat(W - 1, 6), m.gravel, 0, 0.012, z0 + 3.5, 0, { noShadow: true });

  // ブロック塀（正面：車庫と門のすき間をあける）
  const wallH = 1.2, wt = 0.15;
  const wallSeg = (x0, x1, z) => { L(box(x1 - x0, wallH, wt), m.block, (x0 + x1) / 2, wallH / 2, z); addLocalBox(base, x0, x1, z - wt, z + wt, wallH); };
  const wallSegZ = (x, za, zb) => { L(box(wt, wallH, zb - za), m.block, x, wallH / 2, (za + zb) / 2); addLocalBox(base, x - wt, x + wt, za, zb, wallH); };
  const hw = W / 2 - 0.2;
  const ss = lot.rot === 0 ? 1 : -1; // ワールドの東側になるローカルx の符号
  if (farm) {
    // 正面は閉じた木戸。入口は東側の勝手口
    wallSeg(-hw, -3.3, z0 + 0.1); wallSeg(-0.1, hw, z0 + 0.1);
    const gate = new THREE.Mesh(box(3.2, 1.6, 0.08), m.cedarDark);
    gate.position.copy(localToWorld(base, -1.7, 0.8, z0 + 0.1)); gate.rotation.y = lot.rot; gate.castShadow = true;
    root.add(gate); addLocalBox(base, -3.3, -0.1, z0, z0 + 0.2, 1.6);
    wallSegZ(-ss * hw, z0 + 0.1, zBack - 0.1);
    wallSegZ(ss * hw, z0 + 0.1, zBack - 9.5); wallSegZ(ss * hw, zBack - 7.5, zBack - 0.1);
    wallSeg(-hw, hw, zBack - 0.1);
    lot.points.frontGate = localToWorld(base, -1.7, 1.2, z0 - 0.4);
  } else {
    wallSeg(-hw, -6.9, z0 + 0.1); wallSeg(-3.1, -0.15, z0 + 0.1); wallSeg(1.35, hw, z0 + 0.1);
    wallSegZ(-hw, z0 + 0.1, zBack - 0.1); wallSegZ(hw, z0 + 0.1, zBack - 0.1);
    wallSeg(-hw, hw, zBack - 0.1);
  }

  // 門柱・表札・インターホン・郵便受け
  const post = (x, z) => { L(box(0.32, 1.45, 0.32), m.stucco, x, 0.725, z); addLocalBox(base, x - 0.16, x + 0.16, z - 0.16, z + 0.16, 1.45); };
  if (farm) {
    post(ss * hw, zBack - 9.6); post(ss * hw, zBack - 7.4);
  } else { post(-0.3, z0 + 0.1); post(1.5, z0 + 0.1); }
  const plate = { g: plateGeo(0.26, 0.13, lot.surname), m: AT.mat };
  const ic = { g: box(0.11, 0.16, 0.04), m: m.frameDark };
  const btn = { g: new THREE.CircleGeometry(0.018, 12), m: btnMat };
  const mbox = { g: box(0.34, 0.3, 0.14), m: m.frameDark };
  const addrP = { g: addrGeo(lot.address), m: AT.mat };
  if (farm) {
    // 勝手口：東側の壁の門柱（外側を向く）
    // 東を向ける（ワールドの +x 方向）
    const face = (o, x, y, z) => placeAt(o.g, o.m, localToWorld(base, x, y, z), Math.PI / 2);
    face(plate, ss * (hw + 0.17), 1.2, zBack - 9.6);
    face(ic, ss * (hw + 0.18), 1.0, zBack - 9.6); face(btn, ss * (hw + 0.205), 0.98, zBack - 9.6);
    face(mbox, ss * (hw + 0.25), 0.9, zBack - 7.4);
    face(addrP, ss * (hw + 0.17), 1.2, zBack - 7.4);
    lot.points.intercom = localToWorld(base, ss * (hw + 0.6), 1.0, zBack - 9.6);
    lot.points.mailbox = localToWorld(base, ss * (hw + 0.6), 0.9, zBack - 7.4);
  } else {
    const front = (o, x, y, z) => placeAt(o.g, o.m, localToWorld(base, x, y, z), lot.rot + Math.PI);
    front(plate, -0.3, 1.2, z0 - 0.07);
    front(ic, -0.3, 0.98, z0 - 0.08); front(btn, -0.3, 0.96, z0 - 0.105);
    front(mbox, 1.5, 1.05, z0 - 0.13);
    front(addrP, 1.5, 1.32, z0 - 0.07);
    lot.points.intercom = localToWorld(base, -0.3, 1.0, z0 - 0.35);
    lot.points.mailbox = localToWorld(base, 1.5, 1.0, z0 - 0.35);
  }

  // 家の本体
  const hx0 = farm ? -6.5 : -3, hx1 = farm ? 6.5 : 6.5, hz0 = z0 + 6.5, hz1 = farm ? z0 + 17 : z0 + 15.5;
  const hw2 = hx1 - hx0, hd = hz1 - hz0, hcx = (hx0 + hx1) / 2, hcz = (hz0 + hz1) / 2;
  const floors = farm ? 1 : 2;
  const H = floors === 2 ? 5.8 : 3.4;
  L(box(hw2, H, hd), wallMat, hcx, H / 2, hcz);
  addLocalBox(base, hx0, hx1, hz0, hz1, H);
  // 基礎
  L(box(hw2 + 0.04, 0.35, hd + 0.04), m.concrete, hcx, 0.17, hcz);
  // 屋根と妻壁
  const rh = farm ? 2.6 : 2.0;
  L(gableRoof(hw2, hd, rh, 0.55), roofMat, hcx, H, hcz);
  L(gableWall(hd, rh), wallMat, hx0, H, hcz);
  L(gableWall(hd, rh), wallMat, hx1, H, hcz, Math.PI);
  // 棟
  L(box(hw2 + 1.1, 0.16, 0.22), m.roof, hcx, H + rh + 0.02, hcz);

  // 玄関
  const doorX = farm ? 0 : 1.5;
  const door = new THREE.Group();
  const leaf = new THREE.Mesh(box(0.95, 2.05, 0.06), farm ? m.cedar : m.cedarDark);
  leaf.position.set(0.475, 1.025, 0); leaf.castShadow = true;
  const knob = new THREE.Mesh(box(0.04, 0.2, 0.05), m.chrome); knob.position.set(0.85, 1.0, -0.05);
  door.add(leaf, knob);
  door.position.copy(localToWorld(base, doorX - 0.475, 0, hz0 - 0.02));
  door.rotation.y = lot.rot;
  root.add(door);
  lot.doors.push({ obj: door, open: 0, target: 0, sign: -1 });
  L(box(1.2, 2.25, 0.1), m.frameDark, doorX, 1.12, hz0 + 0.0);
  L(box(1.7, 0.08, 1.0), m.concrete, doorX, 2.45, hz0 - 0.45); // 庇
  L(box(1.8, 0.18, 1.1), m.concrete, doorX, 0.09, hz0 - 0.55); // ポーチ
  lot.points.door = localToWorld(base, doorX, 1.2, hz0 - 1.1);
  lot.points.porch = localToWorld(base, doorX + 0.6, 0.18, hz0 - 0.6);

  // 窓
  if (farm) {
    windowAt(B, m, base, -3.8, 1.5, hz0, 2.6, 1.6);
    windowAt(B, m, base, 3.8, 1.5, hz0, 2.6, 1.6);
  } else {
    windowAt(B, m, base, 4.4, 1.5, hz0, 2.4, 1.8);
    windowAt(B, m, base, -1.6, 1.7, hz0, 1.2, 1.0);
    windowAt(B, m, base, -1.5, 4.25, hz0, 1.8, 1.2);
    windowAt(B, m, base, 4.5, 4.25, hz0, 2.0, 1.4);
    // ベランダ
    L(box(3.6, 0.15, 1.0), m.concrete, 4.5, 3.05, hz0 - 0.5);
    L(box(3.6, 0.05, 0.05), m.frame, 4.5, 4.05, hz0 - 1.0);
    for (let k = 0; k <= 12; k++) L(box(0.025, 1.0, 0.025), m.frame, 2.7 + k * 0.3, 3.55, hz0 - 1.0);
  }
  // 室外機
  inst('exterior_aircon_unit', localToWorld(base, hx0 - 0.35, 0, hz0 + 2), lot.rot - Math.PI / 2, 'exterior_aircon_unit');
  // 車
  if (!farm && rnd() < 0.55) {
    inst('covered_car', localToWorld(base, -5, 0, z0 + 3.6), lot.rot + (rnd() < 0.5 ? 0 : Math.PI));
    addLocalBox(base, -5.9, -4.1, z0 + 1.4, z0 + 5.8, 1.6);
  }
  // 宅配ボックス
  if (res && res.okihai === '宅配ボックス' || (!res && rnd() < 0.3)) {
    L(box(0.5, 0.95, 0.45), m.metalBlue, 2.3, 0.475, z0 + 0.6);
    L(box(0.12, 0.08, 0.02), m.frameDark, 2.3, 0.7, z0 + 0.37);
    addLocalBox(base, 2.05, 2.55, z0 + 0.37, z0 + 0.83, 1);
    lot.points.box = localToWorld(base, 2.3, 0.9, z0 + 0.1);
  }
  // 物置
  if (farm || (res && res.okihai === '物置') || (!res && rnd() < 0.25)) {
    const sx = farm ? 4.5 : 5.4, sz = farm ? z0 + 2 : z0 + 2.0;
    L(box(1.8, 1.9, 0.95), m.metal, sx, 0.95, sz);
    L(box(1.9, 0.06, 1.05), m.frameDark, sx, 1.93, sz);
    addLocalBox(base, sx - 0.9, sx + 0.9, sz - 0.48, sz + 0.48, 1.9);
    lot.points.shed = localToWorld(base, sx, 0.9, sz - 0.9);
  }
  // 植木鉢
  if (rnd() < 0.7) {
    inst('planter_box_01', localToWorld(base, 3.5, 0, hz0 - 0.4), lot.rot);
  }
  if (rnd() < 0.8) {
    inst('shrub_02', localToWorld(base, hw - 1.2, 0, z0 + 1.2), rnd() * 6, 'shrub_02_b', 0.9 + rnd() * 0.5);
  }
  lot.points.front = localToWorld(base, 0.6, 0, z0 - 1.6); // 道路側
}

// アパート（2階建て、外廊下）
function buildApart(B, m, root, lot) {
  const base = lot.base;
  const W = lot.w, D = lot.d, z0 = -D / 2;
  const L = (geo, mat, x, y, z, ry = 0, opts) => B.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  const bx0 = -12, bx1 = 12, bz0 = z0 + 7, bz1 = z0 + 15;
  L(flat(W - 1, 7), m.concrete, 0, 0.025, z0 + 3.5, 0, { noShadow: true });
  L(box(24, 6, 8), m.siding, 0, 3, (bz0 + bz1) / 2);
  addLocalBox(base, bx0, bx1, bz0, bz1, 6);
  L(box(25, 0.3, 9.5), m.frameDark, 0, 6.15, (bz0 + bz1) / 2 - 0.5);
  // 2階の外廊下
  L(box(24, 0.2, 1.4), m.concrete, 0, 2.9, bz0 - 0.7);
  L(box(24, 1.0, 0.08), m.siding, 0, 3.5, bz0 - 1.38);
  for (const x of [-11.8, -4, 4, 11.8]) { L(box(0.2, 2.9, 0.2), m.concrete, x, 1.45, bz0 - 1.3); addLocalBox(base, x - 0.1, x + 0.1, bz0 - 1.4, bz0 - 1.2, 3); }
  // 階段（右端）
  for (let k = 0; k < 14; k++) L(box(1.0, 0.18, 0.28), m.concrete, 12.6, 0.1 + k * 0.205, bz0 + 6.5 - k * 0.42);
  L(box(0.05, 1.0, 6.2), m.frame, 13.15, 2.0, bz0 + 3.6);
  // 部屋
  const rooms = [];
  for (let f = 0; f < 2; f++) {
    for (let r = 0; r < 4; r++) {
      const room = `${f + 1}0${r + 1}`;
      const x = -9 + r * 6, y = f * 3;
      L(box(0.9, 2.0, 0.06), m.metalBlue, x, y + 1.0 + (f ? 0.2 : 0), bz0 - 0.03);
      L(box(0.6, 1.3, 0.08), m.frameDark, x + 1.2, y + 0.85 + (f ? 0.2 : 0), bz0 - 0.04); // メーターボックス
      windowAt(B, m, base, x + 2.6, y + 1.7 + (f ? 0.2 : 0), bz0, 1.4, 0.9);
      placeAt(plateGeo(0.22, 0.11, room), AT.mat, localToWorld(base, x - 0.65, y + 1.6 + (f ? 0.2 : 0), bz0 - 0.05), lot.rot + Math.PI);
      const yy = f ? 3.0 : 0;
      rooms.push({
        room, floor: f,
        door: localToWorld(base, x, yy + 1.2, bz0 - (f ? 0.8 : 1.0)),
        intercom: localToWorld(base, x - 0.65, yy + 1.2, bz0 - (f ? 0.8 : 1.0)),
        meter: localToWorld(base, x + 1.2, yy + 0.9, bz0 - (f ? 0.8 : 0.9)),
        porch: localToWorld(base, x + 0.4, yy + 0.05, bz0 - 0.5),
      });
    }
  }
  lot.rooms = rooms;
  lot.points.stairs = localToWorld(base, 12.6, 0.5, bz0 + 7.2);
  lot.points.stairsTop = localToWorld(base, 11.2, 3.0, bz0 - 0.7);
  lot.corridor = { a: localToWorld(base, -11.9, 0, bz0 - 1.3), b: localToWorld(base, 11.9, 0, bz0 - 0.05) };
  // 集合ポスト
  L(box(1.6, 1.1, 0.35), m.frame, -13.4, 0.75, z0 + 1.2);
  addLocalBox(base, -14.2, -12.6, z0 + 1, z0 + 1.4, 1.3);
  lot.points.mailbox = localToWorld(base, -13.4, 1.0, z0 + 0.6);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), nameplate(lot, 'メゾンあおば'));
  sign.position.copy(localToWorld(base, -13.4, 1.6, z0 + 1.02)); sign.rotation.y = lot.rot + Math.PI; root.add(sign);
  placeAt(addrGeo(lot.address), AT.mat, localToWorld(base, -13.4, 1.1, z0 + 1.02), lot.rot + Math.PI);
  lot.points.front = localToWorld(base, -10, 0, z0 - 1.6);
  for (const x of [-14, 14]) inst('shrub_02', localToWorld(base, x, 0, z0 + 4), rnd() * 6, 'shrub_02_b', 1.2);
}

// マンション（5階建て、オートロック）
function buildMansion(B, m, root, lot) {
  const base = lot.base;
  const W = lot.w, D = lot.d, z0 = -D / 2;
  const L = (geo, mat, x, y, z, ry = 0, opts) => B.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  const bz0 = z0 + 5, bz1 = z0 + 17;
  L(flat(W - 1, 5), m.sidewalk, 0, 0.03, z0 + 2.5, 0, { noShadow: true });
  L(box(26, 15.5, 12), m.stucco, 0, 7.75, (bz0 + bz1) / 2);
  addLocalBox(base, -13, 13, bz0, bz1, 15.5);
  for (let f = 1; f < 5; f++) {
    L(box(26.4, 0.2, 1.4), m.concrete, 0, f * 3.1, bz0 - 0.7);
    L(box(26.4, 1.05, 0.1), m.glassClear, 0, f * 3.1 + 0.6, bz0 - 1.35, 0, { noShadow: true });
    for (let k = 0; k < 4; k++) windowAt(B, m, base, -9.75 + k * 6.5, f * 3.1 + 1.25, bz0, 2.8, 2.0);
  }
  // エントランス
  L(box(6, 3.2, 0.2), m.sidingDark, 0, 1.6, bz0 - 0.1);
  windowAt(B, m, base, -1.4, 1.3, bz0 - 0.2, 1.6, 2.4);
  windowAt(B, m, base, 1.4, 1.3, bz0 - 0.2, 1.6, 2.4);
  L(box(7, 0.25, 3), m.concrete, 0, 3.2, bz0 - 1.5);
  // オートロック操作盤
  L(box(0.35, 1.25, 0.25), m.frameDark, -3.5, 0.62, bz0 - 2);
  L(box(0.28, 0.4, 0.02), m.glass, -3.5, 1.15, bz0 - 2.13, 0, { noShadow: true });
  addLocalBox(base, -3.7, -3.3, bz0 - 2.15, bz0 - 1.85, 1.3);
  lot.points.intercom = localToWorld(base, -3.5, 1.1, bz0 - 2.6);
  // 宅配ボックス（ロッカー）と集合ポスト
  L(box(2.4, 1.9, 0.5), m.metalBlue, -6.2, 0.95, bz0 - 0.3);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) L(box(0.52, 0.55, 0.02), m.frame, -7.05 + c * 0.57, 0.4 + r * 0.6, bz0 - 0.56);
  lot.points.box = localToWorld(base, -6.2, 1.0, bz0 - 1.1);
  L(box(2.0, 1.2, 0.4), m.frame, 6, 0.9, bz0 - 0.25);
  lot.points.mailbox = localToWorld(base, 6, 1.0, bz0 - 1.0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), nameplate(lot, 'グランあおば'));
  sign.position.copy(localToWorld(base, 0, 3.6, bz0 - 0.21)); sign.rotation.y = lot.rot + Math.PI; root.add(sign);
  placeAt(addrGeo(lot.address), AT.mat, localToWorld(base, -3.5, 1.45, bz0 - 2.13), lot.rot + Math.PI);
  lot.points.door = lot.points.intercom;
  lot.points.porch = localToWorld(base, -2.6, 0.05, bz0 - 2.4);
  lot.points.front = localToWorld(base, -4, 0, z0 - 1.6);
}

// 店
function buildShop(B, m, root, lot, sp) {
  const base = lot.base;
  const W = lot.w, D = lot.d, z0 = -D / 2;
  const L = (geo, mat, x, y, z, ry = 0, opts) => B.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  const conbini = lot.kind === 'conbini';
  const bw = W - 3, bz0 = z0 + (conbini ? 8 : 3.5), bz1 = D / 2 - 0.5, bh = conbini ? 4.2 : 6;
  L(flat(W - 1, bz0 - z0), conbini ? m.asphalt : m.sidewalk, 0, 0.025, (z0 + bz0) / 2, 0, { noShadow: true });
  L(box(bw, bh, bz1 - bz0), conbini ? m.white : rpick([m.plaster, m.siding, m.beige]), 0, bh / 2, (bz0 + bz1) / 2);
  addLocalBox(base, -bw / 2, bw / 2, bz0, bz1, bh);
  // ガラス張りの店先
  const gw = bw - 2;
  L(new THREE.PlaneGeometry(gw, 2.4), m.glass, 0, 1.35, bz0 - 0.03, Math.PI, { noShadow: true });
  for (let k = 0; k <= Math.round(gw / 2); k++) L(box(0.08, 2.5, 0.12), m.frame, -gw / 2 + k * (gw / Math.round(gw / 2)), 1.35, bz0 - 0.05);
  L(box(gw + 0.1, 0.1, 0.12), m.frame, 0, 2.6, bz0 - 0.05);
  // 看板
  const color = conbini ? '#2f7d4f' : sp.color;
  const signMat = new THREE.MeshStandardMaterial({
    map: textTexture(1024, 160, (c, w, h) => {
      c.fillStyle = color; c.fillRect(0, 0, w, h);
      if (conbini) { c.fillStyle = '#e0a92a'; c.fillRect(0, h - 26, w, 14); }
      c.fillStyle = '#fff'; c.font = `bold 92px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(conbini ? 'あおばマート' : sp.sign, w / 2, h / 2 - (conbini ? 8 : 0));
    }), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0,
  });
  signMat.emissiveMap = signMat.map;
  T.lampMats.push({ mat: signMat, on: 0.6 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(bw, 12), Math.min(bw, 12) * 0.156), signMat);
  sign.position.copy(localToWorld(base, 0, conbini ? 3.4 : 3.3, bz0 - 0.08)); sign.rotation.y = lot.rot + Math.PI;
  root.add(sign);
  if (!conbini) {
    // 2階は住居
    windowAt(B, m, base, -2.5, 4.6, bz0, 2.0, 1.2);
    windowAt(B, m, base, 2.5, 4.6, bz0, 2.0, 1.2);
    // 日よけ
    const aw = new THREE.MeshStandardMaterial({ color: new THREE.Color(sp.color).lerp(new THREE.Color('#ffffff'), 0.25), roughness: 0.9, side: THREE.DoubleSide });
    const g = new THREE.PlaneGeometry(gw, 1.2); g.rotateX(-Math.PI / 2 + 0.45);
    L(g, aw, 0, 2.75, bz0 - 0.55);
  } else {
    // 駐車場の白線と自販機
    for (let k = -3; k <= 3; k++) L(flat(0.12, 5), m.lineWhite, k * 2.6, 0.04, z0 + 3.5, 0, { noShadow: true });
  }
  // 自販機
  const vend = new THREE.Group();
  const vb = new THREE.Mesh(box(1.0, 1.83, 0.7), m.white);
  vb.position.y = 0.915; vb.castShadow = true;
  const vf = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.0), T._vendMat || (T._vendMat = new THREE.MeshStandardMaterial({
    map: textTexture(256, 300, (c, w, h) => {
      c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, w, h);
      const cols = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#e67e22', '#8e44ad', '#34495e', '#d35400'];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) {
        c.fillStyle = cols[(r * 3 + k) % cols.length]; c.fillRect(12 + k * 40, 20 + r * 92, 28, 60);
        c.fillStyle = '#333'; c.fillRect(12 + k * 40, 84 + r * 92, 28, 6);
      }
    }), emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.3,
  })));
  T._vendMat.emissiveMap = T._vendMat.map;
  vf.position.set(0, 1.25, 0.351);
  vend.add(vb, vf);
  vend.position.copy(localToWorld(base, bw / 2 - 0.2, 0, bz0 - 0.6)); vend.rotation.y = lot.rot + Math.PI;
  root.add(vend);
  addLocalBox(base, bw / 2 - 0.7, bw / 2 + 0.3, bz0 - 0.95, bz0 - 0.25, 1.8);
  const doorX = conbini ? 0 : -gw / 2 + 1.2;
  lot.points.door = localToWorld(base, doorX, 1.2, bz0 - 0.9);
  lot.points.intercom = lot.points.door;
  lot.points.porch = localToWorld(base, doorX + 0.8, 0.05, bz0 - 0.6);
  lot.points.front = localToWorld(base, doorX, 0, z0 - 1.6);
}

function buildParking(B, m, root, lot) {
  const base = lot.base;
  const L = (geo, mat, x, y, z, ry = 0, opts) => B.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  L(flat(lot.w - 1, lot.d - 1), m.asphalt, 0, 0.022, 0, 0, { noShadow: true });
  for (let k = -2; k <= 2; k++) L(flat(0.12, 5), m.lineWhite, k * 2.6, 0.04, lot.d / 2 - 3.5, 0, { noShadow: true });
  for (let k = -1; k <= 1; k += 2) {
    inst('covered_car', localToWorld(lot.base, k * 1.3, 0, lot.d / 2 - 3.5), lot.rot);
    const a = localToWorld(lot.base, k * 1.3 - 0.9, 0, lot.d / 2 - 5.7), b = localToWorld(lot.base, k * 1.3 + 0.9, 0, lot.d / 2 - 1.3);
    addBox(a.x, b.x, a.z, b.z, 1.6);
  }
  lot.points.front = localToWorld(base, 0, 0, -lot.d / 2 - 1.6);
}

function buildPark(B, m, root, lot) {
  const base = lot.base;
  const L = (geo, mat, x, y, z, ry = 0, opts) => B.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  L(flat(lot.w - 2, lot.d - 2), m.gravel, 0, 0.02, 0, 0, { noShadow: true });
  // ベンチ・砂場・木
  L(box(1.6, 0.45, 0.45), m.cedar, -3, 0.225, 2); addLocalBox(base, -3.8, -2.2, 1.8, 2.2, 0.5);
  L(box(3, 0.3, 3), m.cedar, 3, 0.15, -2); addLocalBox(base, 1.5, 4.5, -3.5, -0.5, 0.3);
  for (const [x, z] of [[-5.5, -6], [5.5, 6], [-5.5, 6]]) tree(root, localToWorld(base, x, 0, z), 1);
  lot.points.front = localToWorld(base, 0, 0, -lot.d / 2 - 1.6);
}

function buildSmallField(B, m, root, lot) {
  const base = lot.base;
  const L = (geo, mat, x, y, z, ry = 0, opts) => B.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  L(flat(lot.w - 2, lot.d - 2), m.soil, 0, 0.02, 0, 0, { noShadow: true });
  for (let k = -5; k <= 5; k++) L(box(0.5, 0.18, lot.d - 4), m.soil, k * 1.2, 0.08, 0);
  lot.points.front = localToWorld(base, 0, 0, -lot.d / 2 - 1.6);
}

// 簡易な木（幹＋葉のかたまり）
const _treeGeo = { trunk: null, leaf: null };
function tree(root, pos, s = 1) {
  if (!_treeGeo.trunk) { _treeGeo.trunk = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 8); _treeGeo.leaf = new THREE.IcosahedronGeometry(1.4, 1); }
  BB.add(_treeGeo.trunk, A.mats.trunk, M(pos.x, 1.2 * s, pos.z, 0, s, s, s));
  for (let k = 0; k < 4; k++) {
    const k2 = (0.7 + rnd() * 0.5) * s;
    BB.add(_treeGeo.leaf, A.mats.leaf, M(pos.x + (rnd() - 0.5) * 1.4 * s, (2.8 + rnd() * 1.2) * s, pos.z + (rnd() - 0.5) * 1.4 * s, rnd() * 6, k2, k2, k2));
  }
  addCircle(pos.x, pos.z, 0.3);
}

// =========================================================
// 営業所
// =========================================================
function buildDepot(B, m, root) {
  const x0 = -95, x1 = -25, z0 = NAT_Z + NAT_HALF + 3, z1 = 235;
  const L = (geo, mat, x, y, z, ry = 0, opts) => B.add(geo, mat, M(x, y, z, ry), opts);
  L(flat(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2), m.concrete, (x0 + x1) / 2, 0.021, (z0 + z1) / 2, 0, { noShadow: true });
  // 外周のフェンス（ブロック塀）
  const wallH = 1.6;
  const seg = (a, b, z) => { L(box(b - a, wallH, 0.2), m.block, (a + b) / 2, wallH / 2, z); addBox(a, b, z - 0.15, z + 0.15, wallH); };
  const segZ = (x, a, b) => { L(box(0.2, wallH, b - a), m.block, x, wallH / 2, (a + b) / 2); addBox(x - 0.15, x + 0.15, a, b, wallH); };
  seg(x0, -66, z0); seg(-54, x1, z0); segZ(x0, z0, z1); segZ(x1, z0, z1); seg(x0, x1, z1);
  // 倉庫
  const wx0 = -88, wx1 = -48, wz0 = 198, wz1 = 228, wh = 7.5;
  const shell = (a, b, c, d, h, mat) => { L(box(b - a, h, d - c), mat, (a + b) / 2, h / 2, (c + d) / 2); addBox(a, b, c, d, h); };
  shell(wx0, wx1, wz1 - 0.3, wz1, wh, m.metal);          // 奥の壁
  shell(wx0, wx0 + 0.3, wz0, wz1, wh, m.metal);          // 西
  shell(wx1 - 0.3, wx1, wz0, wz1, wh, m.metal);          // 東
  // 正面：シャッター開口部 2か所
  const front = [[wx0, -80], [-72, -64], [-56, wx1]];
  for (const [a, b] of front) shell(a, b, wz0, wz0 + 0.3, wh, m.metal);
  for (const [a, b] of [[-80, -72], [-64, -56]]) {
    L(box(b - a, wh - 4.2, 0.3), m.metal, (a + b) / 2, 4.2 + (wh - 4.2) / 2, wz0 + 0.15);
    L(box(b - a, 0.6, 0.6), m.shutter, (a + b) / 2, 4.0, wz0 + 0.3); // 巻き上げたシャッター
  }
  // 屋根
  L(box(wx1 - wx0 + 1, 0.3, wz1 - wz0 + 1), m.metalBlue, (wx0 + wx1) / 2, wh + 0.15, (wz0 + wz1) / 2);
  // 床
  L(flat(wx1 - wx0 - 0.6, wz1 - wz0 - 0.6, (wx0 + wx1) / 2, (wz0 + wz1) / 2), m.concrete, (wx0 + wx1) / 2, 0.03, (wz0 + wz1) / 2, 0, { noShadow: true });
  // 看板
  const signMat = new THREE.MeshStandardMaterial({
    map: textTexture(1024, 128, (c, w, h) => {
      c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2f7d4f'; c.fillRect(0, 0, 120, h);
      c.fillStyle = '#fff'; c.font = `bold 70px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('あ', 60, h / 2 + 4);
      c.fillStyle = '#2b3440'; c.font = `bold 60px ${JP_FONT}`; c.fillText('あおば運輸　あおば町営業所', 570, h / 2 + 4);
    }), roughness: 0.5,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), signMat);
  sign.position.set(-68, 5.9, wz0 - 0.02); sign.rotation.y = Math.PI;
  root.add(sign);
  // 作業台と荷物置き場
  const tables = [];
  for (let k = 0; k < 3; k++) {
    const tx = -84 + k * 3.4, tz = 210;
    L(box(3.0, 0.06, 1.2), m.frame, tx, 0.85, tz);
    for (const [dx, dz] of [[-1.4, -0.5], [1.4, -0.5], [-1.4, 0.5], [1.4, 0.5]]) L(box(0.06, 0.85, 0.06), m.frame, tx + dx, 0.425, tz + dz);
    L(box(3.0, 0.04, 1.2), m.frame, tx, 0.25, tz);
    addBox(tx - 1.5, tx + 1.5, tz - 0.6, tz + 0.6, 0.9);
    tables.push({ x: tx, z: tz, y: 0.88 });
  }
  for (let k = 0; k < 2; k++) {
    const tx = -84 + k * 3.4, tz = 215;
    L(box(3.0, 0.06, 1.2), m.frame, tx, 0.85, tz);
    for (const [dx, dz] of [[-1.4, -0.5], [1.4, -0.5], [-1.4, 0.5], [1.4, 0.5]]) L(box(0.06, 0.85, 0.06), m.frame, tx + dx, 0.425, tz + dz);
    addBox(tx - 1.5, tx + 1.5, tz - 0.6, tz + 0.6, 0.9);
    tables.push({ x: tx, z: tz, y: 0.88 });
  }
  // 仕分け戻しのカゴ
  const crate = new THREE.Group();
  for (let k = 0; k < 2; k++) { const c = model('plastic_crate_01'); c.scale.setScalar(2.2); c.position.set(k * 0.7, 0, 0); crate.add(c); }
  crate.position.set(-73, 0, 214.5); root.add(crate);
  addBox(-73.4, -71.9, 214, 215, 0.6);
  const crateSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), nameplate({}, '仕分け戻し'));
  crateSign.position.set(-72.65, 1.15, 214.0); crateSign.rotation.y = Math.PI; root.add(crateSign);
  L(box(0.04, 1.2, 0.04), m.frame, -72.65, 0.6, 214.05);
  // ホワイトボードと事務机
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  wb.position.set(-60, 1.7, wz1 - 0.35); wb.rotation.y = Math.PI;
  root.add(wb);
  L(box(3.4, 1.8, 0.05), m.frame, -60, 1.7, wz1 - 0.32);
  L(box(1.6, 0.05, 0.8), m.cedar, -55, 0.74, 224);
  for (const [dx, dz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) L(box(0.05, 0.74, 0.05), m.frame, -55 + dx, 0.37, 224 + dz);
  addBox(-55.8, -54.2, 223.6, 224.4, 0.8);
  const clip = model('cardboard_box_01'); clip.scale.set(0.8, 0.25, 0.6); clip.position.set(-55, 0.77, 224); root.add(clip);
  // 台車
  const hand = model('hand_truck'); hand.position.set(-50, 0, 222); hand.rotation.y = -0.6; root.add(hand);
  // 倉庫の照明
  for (const x of [-80, -64]) {
    const pl = new THREE.PointLight(0xfff2dd, 30, 22, 1.6); pl.position.set(x, 6.5, 212); root.add(pl);
    L(box(1.2, 0.08, 0.3), m.white, x, 7.1, 212, 0, { noShadow: true });
  }
  // 停めてある別の配送車（飾り）
  T.depot = {
    tables, whiteboard: wb, crate: new THREE.Vector3(-72.65, 0.9, 214.5), desk: new THREE.Vector3(-55, 1.0, 223.3),
    vanSpawn: { x: -76, z: 191.5, heading: Math.PI }, playerSpawn: { x: -80.6, z: 207.6, yaw: Math.PI },
    gateZ: NAT_Z + NAT_HALF + 2, area: { x0, x1, z0, z1 },
  };
}

// =========================================================
// 畑・田んぼ・遠景
// =========================================================
function buildFields(B, m, root) {
  const L = (geo, mat, x, y, z, ry = 0, opts) => B.add(geo, mat, M(x, y, z, ry), opts);
  // 東の畑
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x0 = 138 + i * 24, z0 = 24 + j * 31;
    L(flat(21, 27, x0 + 10.5, z0 + 13.5), m.soil, x0 + 10.5, 0.02, z0 + 13.5, 0, { noShadow: true });
    if ((i + j) % 2 === 0) for (let k = 0; k < 13; k++) L(box(21, 0.22, 0.55), m.soil, x0 + 10.5, 0.1, z0 + 1.5 + k * 2);
  }
  // 北の田んぼ（水を張った田）
  for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) {
    const x0 = -130 + i * 31, z0 = -70 + j * 30;
    L(flat(28, 26, x0 + 14, z0 + 13), m.soil, x0 + 14, 0.015, z0 + 13, 0, { noShadow: true });
    L(flat(27, 25, x0 + 14, z0 + 13), m.water, x0 + 14, 0.06, z0 + 13, 0, { noShadow: true });
  }
  // 遠くの林
  for (let k = 0; k < 70; k++) {
    const x = -300 + k * 9 + rnd() * 5, z = -95 - rnd() * 25;
    tree(root, new THREE.Vector3(x, 0, z), 1.6 + rnd() * 1.4);
  }
  for (let k = 0; k < 30; k++) tree(root, new THREE.Vector3(260 + rnd() * 30, 0, -60 + k * 9), 1.5 + rnd());
  // 国道の南側の家並み（遠景）
  for (let k = 0; k < 14; k++) {
    const x = -250 + k * 36; if (x > -110 && x < -10) continue;
    const z = NAT_Z + NAT_HALF + 12 + rnd() * 8;
    L(box(9, 5.6, 8), rpick([m.plaster, m.beige, m.siding]), x, 2.8, z);
    L(gableRoof(9, 8, 1.8, 0.5), rpick([m.roof, m.roofBrown]), x, 5.6, z);
    L(gableWall(8, 1.8), m.plaster, x - 4.5, 5.6, z); L(gableWall(8, 1.8), m.plaster, x + 4.5, 5.6, z, Math.PI);
    addBox(x - 4.5, x + 4.5, z - 4, z + 4, 6);
  }
}

// =========================================================
// 電柱と電線・街灯
// =========================================================
function buildPoles(B, m, root) {
  const poles = [];
  const poleGeo = new THREE.CylinderGeometry(0.13, 0.2, 11, 10);
  const add = (x, z, trans) => {
    B.add(poleGeo, m.poleConcrete, M(x, 5.5, z));
    B.add(box(1.8, 0.1, 0.1), m.frameDark, M(x, 9.8, z));
    B.add(box(1.2, 0.08, 0.08), m.frameDark, M(x, 8.6, z));
    if (trans) B.add(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10), m.frame, M(x + 0.45, 7.6, z));
    addCircle(x, z, 0.25);
    poles.push({ x, z });
    return { x, z };
  };
  const lines = [];
  const wire = (a, b, ha, dx) => {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const sag = (t) => 0.45 * Math.sin(Math.PI * t);
      lines.push(a.x + (b.x - a.x) * t0 + dx, ha - sag(t0), a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1 + dx, ha - sag(t1), a.z + (b.z - a.z) * t1);
    }
  };
  const run = (pts) => {
    let prev = null, k = 0;
    for (const [x, z] of pts) {
      const p = add(x, z, k++ % 3 === 1);
      if (prev) { for (const [h, dx] of [[9.85, -0.8], [9.85, 0.8], [8.65, -0.5], [8.65, 0.5]]) wire(prev, p, h, dx); }
      prev = p;
    }
  };
  for (const Z of EW_Z) {
    const pts = []; for (let x = -104; x <= 126; x += 23) if (!NS_X.some(j => Math.abs(x - j) < 6)) pts.push([x, Z - STREET_HALF - 0.9]);
    run(pts);
  }
  for (const X of NS_X) {
    const pts = []; for (let z = 24; z <= 148; z += 24) if (!EW_Z.some(j => Math.abs(z - j) < 6)) pts.push([X + STREET_HALF + 0.9, z]);
    run(pts);
  }
  { const pts = []; for (let x = 140; x <= 232; x += 26) pts.push([x, 16 - 3.4]); run(pts); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  root.add(new THREE.LineSegments(g, m.wire));

  // 国道の街灯
  const lampHead = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, emissive: 0xfff1d0, emissiveIntensity: 0 });
  T.lampMats.push({ mat: lampHead, on: 2.5 });
  for (let x = NAT_X0 + 10; x < NAT_X1; x += 32) {
    for (const side of [-1, 1]) {
      const z = NAT_Z + side * (NAT_HALF + 1.2);
      if (NS_X.some(j => Math.abs(x - j) < 8) || (side > 0 && x > -70 && x < -50)) continue;
      B.add(new THREE.CylinderGeometry(0.08, 0.12, 8, 8), m.frame, M(x, 4, z));
      B.add(box(0.08, 0.08, 1.6), m.frame, M(x, 7.95, z - side * 0.8));
      const head = new THREE.Mesh(box(0.5, 0.14, 0.28), lampHead);
      head.position.set(x, 7.85, z - side * 1.55); root.add(head);
      addCircle(x, z, 0.2);
    }
  }
}

// =========================================================
// 信号機（国道との交差点）
// =========================================================
function buildSignals(root) {
  const lampGeo = new THREE.CircleGeometry(0.13, 20);
  const head = (mats, pos, rotY) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(box(1.25, 0.42, 0.25), A.mats.frame); g.add(b); b.castShadow = true;
    const order = ['g', 'y', 'r'];
    order.forEach((k, i) => {
      const l = new THREE.Mesh(lampGeo, mats[k]); l.position.set(-0.4 + i * 0.4, 0, 0.13); g.add(l);
      const hood = new THREE.Mesh(box(0.34, 0.04, 0.16), A.mats.frame); hood.position.set(-0.4 + i * 0.4, 0.16, 0.2); g.add(hood);
    });
    g.position.copy(pos); g.rotation.y = rotY;
    root.add(g);
  };
  const mk = (c) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0, roughness: 0.3 });
  NS_X.forEach((X, idx) => {
    const ew = { g: mk(0x30d0b0), y: mk(0xffb020), r: mk(0xff3020) };
    const ns = { g: mk(0x30d0b0), y: mk(0xffb020), r: mk(0xff3020) };
    // 東行き用（交差点の東側、北車線の上）：西向き
    pole(root, X + 5, NAT_Z - NAT_HALF - 1.2, 5.6);
    armX(root, X + 5, NAT_Z - NAT_HALF - 1.2, NAT_Z - 2.2);
    head(ew, new THREE.Vector3(X + 5, 5.3, NAT_Z - 2.2), -Math.PI / 2);
    // 西行き用（交差点の西側、南車線の上）：東向き
    pole(root, X - 5, NAT_Z + NAT_HALF + 1.2, 5.6);
    armX(root, X - 5, NAT_Z + NAT_HALF + 1.2, NAT_Z + 2.2);
    head(ew, new THREE.Vector3(X - 5, 5.3, NAT_Z + 2.2), Math.PI / 2);
    // 生活道路から出る車用（国道の南側）：北向き
    pole(root, X + 2, NAT_Z + NAT_HALF + 1.2, 5.6);
    head(ns, new THREE.Vector3(X + 2, 5.3, NAT_Z + NAT_HALF + 1.0), Math.PI);
    T.signals.push({ x: X, ew, ns, offset: idx * 7, state: { ew: 'g', ns: 'r' } });
  });
}
function pole(root, x, z, h) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, h, 10), A.mats.frame);
  p.position.set(x, h / 2, z); p.castShadow = true; root.add(p);
  addCircle(x, z, 0.2);
}
function armX(root, x, z0, z1) {
  const len = Math.abs(z1 - z0);
  const a = new THREE.Mesh(box(0.1, 0.1, len + 0.3), A.mats.frame);
  a.position.set(x, 5.5, (z0 + z1) / 2); a.castShadow = true; root.add(a);
}

// 規制標識
function buildRoadSigns(root) {
  const disc = (txt) => new THREE.MeshStandardMaterial({
    map: textTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(128, 128, 124, 0, 7); c.fill();
      c.strokeStyle = '#c8281e'; c.lineWidth = 30; c.beginPath(); c.arc(128, 128, 104, 0, 7); c.stroke();
      c.fillStyle = '#1d4fa0'; c.font = `bold 120px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 128, 136);
    }), transparent: true, roughness: 0.4,
  });
  const tri = new THREE.MeshStandardMaterial({
    map: textTexture(256, 256, (c) => {
      c.fillStyle = '#c8281e'; c.beginPath(); c.moveTo(8, 20); c.lineTo(248, 20); c.lineTo(128, 236); c.closePath(); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 8; c.stroke();
      c.fillStyle = '#fff'; c.font = `bold 58px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('止まれ', 128, 84);
    }), transparent: true, roughness: 0.4,
  });
  const m30 = disc('30'), m50 = disc('50');
  const sign = (mat, x, z, rotY, size = 0.6) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), A.mats.frame);
    p.position.set(x, 1.3, z); root.add(p);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    s.position.set(x, 2.35, z); s.rotation.y = rotY; root.add(s);
    addCircle(x, z, 0.1);
  };
  for (const X of NS_X) {
    sign(m30, X - STREET_HALF - 0.6, 146, 0);           // 国道から入る車へ（北向きに走る車が見る）
    sign(tri, X + STREET_HALF + 0.6, 151.5, Math.PI);   // 国道へ出る車へ
    for (const Z of EW_Z) {
      sign(tri, X - STREET_HALF - 0.6, Z + STREET_HALF + 1.5, 0, 0.7);
      if (Z !== 16) sign(tri, X + STREET_HALF + 0.6, Z - STREET_HALF - 1.5, Math.PI, 0.7);
    }
  }
  sign(m50, -120, NAT_Z - NAT_HALF - 1.0, -Math.PI / 2);
  sign(m50, 120, NAT_Z + NAT_HALF + 1.0, Math.PI / 2);
}

// =========================================================
// 道路網（ナビ用のグラフ）
// =========================================================
function buildGraph() {
  const segs = [];
  segs.push([NAT_X0, NAT_Z, NAT_X1, NAT_Z]);
  for (const z of EW_Z) segs.push([-110, z, 130, z]);
  for (const x of NS_X) segs.push([x, 16, x, NAT_Z]);
  segs.push([130, 16, 240, 16]);
  segs.push([240, 16, 240, NAT_Z]);
  segs.push([-60, NAT_Z, -60, 190]);
  T.segments = segs;
  const nodes = new Map();
  const key = (x, z) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
  const node = (x, z) => { const k = key(x, z); if (!nodes.has(k)) nodes.set(k, { k, x, z, edges: [] }); return nodes.get(k); };
  for (const s of segs) {
    const pts = [[s[0], s[1]], [s[2], s[3]]];
    for (const o of segs) {
      if (o === s) continue;
      const hS = s[1] === s[3], hO = o[1] === o[3];
      if (hS === hO) continue;
      const [h, v] = hS ? [s, o] : [o, s];
      const x = v[0], z = h[1];
      if (x >= Math.min(h[0], h[2]) - 0.01 && x <= Math.max(h[0], h[2]) + 0.01 && z >= Math.min(v[1], v[3]) - 0.01 && z <= Math.max(v[1], v[3]) + 0.01) pts.push([x, z]);
    }
    pts.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    for (let i = 1; i < pts.length; i++) {
      const a = node(...pts[i - 1]), b = node(...pts[i]);
      if (a === b) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      a.edges.push({ to: b, d }); b.edges.push({ to: a, d });
    }
  }
  T.graph = { nodes: [...nodes.values()] };
}

// 線分上の最寄り点
export function nearestOnRoads(x, z) {
  let best = null;
  for (const s of T.segments) {
    const [x0, z0, x1, z1] = s;
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2));
    const px = x0 + dx * t, pz = z0 + dz * t, d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { x: px, z: pz, d, s };
  }
  return best;
}

// 道路網上の経路（座標の配列）
export function routePath(from, to) {
  const a = nearestOnRoads(from.x, from.z), b = nearestOnRoads(to.x, to.z);
  const nodes = T.graph.nodes;
  const tmpA = { x: a.x, z: a.z, edges: [] }, tmpB = { x: b.x, z: b.z, edges: [] };
  const attach = (tmp, s) => {
    for (const n of nodes) {
      const onSeg = s[1] === s[3] ? (Math.abs(n.z - s[1]) < 0.01 && n.x >= Math.min(s[0], s[2]) - 0.01 && n.x <= Math.max(s[0], s[2]) + 0.01)
        : (Math.abs(n.x - s[0]) < 0.01 && n.z >= Math.min(s[1], s[3]) - 0.01 && n.z <= Math.max(s[1], s[3]) + 0.01);
      if (onSeg) tmp.edges.push({ to: n, d: Math.hypot(n.x - tmp.x, n.z - tmp.z) });
    }
  };
  attach(tmpA, a.s); attach(tmpB, b.s);
  // tmpB への辺は逆向きにも張る
  const extra = new Map();
  for (const e of tmpB.edges) extra.set(e.to, { to: tmpB, d: e.d });
  if (a.s === b.s) tmpA.edges.push({ to: tmpB, d: Math.hypot(a.x - b.x, a.z - b.z) });
  const dist = new Map([[tmpA, 0]]), prev = new Map();
  const open = [tmpA];
  while (open.length) {
    open.sort((p, q) => dist.get(p) - dist.get(q));
    const u = open.shift();
    if (u === tmpB) break;
    const edges = u.edges.concat(extra.has(u) ? [extra.get(u)] : []);
    for (const e of edges) {
      const nd = dist.get(u) + e.d;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, u); open.push(e.to); }
    }
  }
  const out = [];
  let n = tmpB;
  while (n) { out.push({ x: n.x, z: n.z }); n = prev.get(n); }
  out.reverse();
  return { points: out, length: dist.get(tmpB) ?? Infinity };
}

export function speedLimitAt(x, z) {
  if (Math.abs(z - NAT_Z) < NAT_HALF + 0.5 && x > NAT_X0 && x < NAT_X1) return 50;
  return 30;
}

// 当たり判定の検索（単純な全探索だが数百個なので十分）
export function queryColliders(x, z, r) {
  const out = [];
  for (const b of T.colliders) if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) out.push(b);
  return out;
}

// 円と当たり判定の押し出し。戻り値は押し出した量
export function resolveCircle(p, r, maxH = 99) {
  let hit = 0;
  for (const b of T.colliders) {
    if (b.h < 0.3 && maxH < 99) continue;
    if (p.x + r <= b.x0 || p.x - r >= b.x1 || p.z + r <= b.z0 || p.z - r >= b.z1) continue;
    const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
    let dx = p.x - cx, dz = p.z - cz;
    const d = Math.hypot(dx, dz);
    if (d > 0.0001) {
      if (d < r) { const k = (r - d) / d; p.x += dx * k; p.z += dz * k; hit = Math.max(hit, r - d); }
    } else {
      // 中心が箱の中：一番近い辺へ押し出す
      const pen = [p.x - b.x0 + r, b.x1 - p.x + r, p.z - b.z0 + r, b.z1 - p.z + r];
      const i = pen.indexOf(Math.min(...pen));
      if (i === 0) p.x = b.x0 - r; else if (i === 1) p.x = b.x1 + r; else if (i === 2) p.z = b.z0 - r; else p.z = b.z1 + r;
      hit = Math.max(hit, pen[i]);
    }
  }
  for (const c of T.circles) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), R = r + c.r;
    if (d < R && d > 0.0001) { const k = (R - d) / d; p.x += dx * k; p.z += dz * k; hit = Math.max(hit, R - d); }
  }
  return hit;
}

// 時刻による明かり（窓・看板・街灯）
export function updateLights(hour) {
  const dark = Math.max(0, Math.min(1, (hour - 17.3) / 1.4));
  for (const l of T.lampMats) l.mat.emissiveIntensity = l.on * dark;
  if (T._litMat) T._litMat.opacity = 0.85 * dark;
  return dark;
}
