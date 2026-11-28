// すべての3Dモデルはコードで組み立てる(外部モデル素材は使わない)。
// ローポリ + 頂点カラー + フラットシェーディングで統一した見た目にする。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

// geo を色付きで変形してパーツ化
export function part(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], jitter = 0 } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _s.set(s[0], s[1], s[2]);
  _p.set(p[0], p[1], p[2]);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i += 3) {
    // 面ごとに少しだけ明るさを揺らして手作り感を出す
    const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = _c.r * j;
      col[(i + k) * 3 + 1] = _c.g * j;
      col[(i + k) * 3 + 2] = _c.b * j;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'color' && key !== 'normal') g.deleteAttribute(key);
  return g;
}
export function merge(parts) {
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const box = (w = 1, h = 1, d = 1) => new THREE.BoxGeometry(w, h, d);
const ico = (r = 1, d = 0) => new THREE.IcosahedronGeometry(r, d);
const oct = (r = 1) => new THREE.OctahedronGeometry(r, 0);
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg, 1);
const sph = (r, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h);
const dodec = (r) => new THREE.DodecahedronGeometry(r, 0);
const tor = (r, t, rs = 5, ts = 10) => new THREE.TorusGeometry(r, t, rs, ts);

// ===== 敵 =====
export function enemyGeometry(kind) {
  const P = [];
  switch (kind) {
    case 'slime':
      P.push(part(sph(0.55, 8, 6), '#6fd36b', { p: [0, 0.4, 0], s: [1, 0.75, 1], jitter: 0.12 }));
      P.push(part(sph(0.1, 5, 4), '#ffffff', { p: [0.18, 0.55, 0.42] }), part(sph(0.1, 5, 4), '#ffffff', { p: [-0.18, 0.55, 0.42] }));
      P.push(part(sph(0.05, 4, 3), '#111', { p: [0.18, 0.55, 0.51] }), part(sph(0.05, 4, 3), '#111', { p: [-0.18, 0.55, 0.51] }));
      break;
    case 'bat':
      P.push(part(ico(0.3, 0), '#4b3a6b', { p: [0, 0.9, 0], jitter: 0.2 }));
      P.push(part(box(0.7, 0.05, 0.35), '#6a4f94', { p: [0.45, 0.95, 0], r: [0, 0, 0.35] }));
      P.push(part(box(0.7, 0.05, 0.35), '#6a4f94', { p: [-0.45, 0.95, 0], r: [0, 0, -0.35] }));
      P.push(part(box(0.08, 0.08, 0.05), '#ff4040', { p: [0.1, 0.98, 0.27] }), part(box(0.08, 0.08, 0.05), '#ff4040', { p: [-0.1, 0.98, 0.27] }));
      break;
    case 'goblin':
      P.push(part(box(0.55, 0.6, 0.4), '#7b5a3a', { p: [0, 0.55, 0] }));
      P.push(part(box(0.5, 0.45, 0.45), '#6aa84f', { p: [0, 1.05, 0], jitter: 0.1 }));
      P.push(part(cone(0.12, 0.4, 4), '#6aa84f', { p: [0.32, 1.1, 0], r: [0, 0, -1.4] }), part(cone(0.12, 0.4, 4), '#6aa84f', { p: [-0.32, 1.1, 0], r: [0, 0, 1.4] }));
      P.push(part(box(0.1, 0.1, 0.05), '#ffe14d', { p: [0.12, 1.1, 0.23] }), part(box(0.1, 0.1, 0.05), '#ffe14d', { p: [-0.12, 1.1, 0.23] }));
      P.push(part(box(0.18, 0.3, 0.18), '#4a3423', { p: [0.15, 0.15, 0] }), part(box(0.18, 0.3, 0.18), '#4a3423', { p: [-0.15, 0.15, 0] }));
      P.push(part(box(0.08, 0.7, 0.08), '#8b6b4a', { p: [0.4, 0.7, 0.2], r: [0.6, 0, 0] }));
      break;
    case 'skeleton':
      P.push(part(box(0.4, 0.55, 0.25), '#e8e2cf', { p: [0, 0.75, 0], jitter: 0.1 }));
      for (let i = 0; i < 3; i++) P.push(part(box(0.5, 0.05, 0.3), '#cfc7b0', { p: [0, 0.6 + i * 0.13, 0] }));
      P.push(part(box(0.42, 0.4, 0.4), '#f2ecd9', { p: [0, 1.25, 0] }));
      P.push(part(box(0.1, 0.1, 0.05), '#1a1a1a', { p: [0.1, 1.27, 0.2] }), part(box(0.1, 0.1, 0.05), '#1a1a1a', { p: [-0.1, 1.27, 0.2] }));
      P.push(part(box(0.12, 0.5, 0.12), '#d8d0b8', { p: [0.13, 0.25, 0] }), part(box(0.12, 0.5, 0.12), '#d8d0b8', { p: [-0.13, 0.25, 0] }));
      P.push(part(box(0.06, 0.8, 0.06), '#9aa0a8', { p: [0.35, 0.8, 0.25], r: [0.9, 0, 0] }));
      break;
    case 'wolf':
      P.push(part(box(0.5, 0.45, 1.0), '#9aa6b8', { p: [0, 0.55, 0], jitter: 0.12 }));
      P.push(part(box(0.42, 0.4, 0.45), '#b8c2d1', { p: [0, 0.75, 0.62] }));
      P.push(part(box(0.22, 0.2, 0.3), '#b8c2d1', { p: [0, 0.65, 0.95] }));
      P.push(part(cone(0.09, 0.22, 4), '#7d889a', { p: [0.13, 1.03, 0.6] }), part(cone(0.09, 0.22, 4), '#7d889a', { p: [-0.13, 1.03, 0.6] }));
      P.push(part(box(0.08, 0.08, 0.04), '#64d9ff', { p: [0.12, 0.82, 0.86] }), part(box(0.08, 0.08, 0.04), '#64d9ff', { p: [-0.12, 0.82, 0.86] }));
      for (const [x, z] of [[0.17, 0.35], [-0.17, 0.35], [0.17, -0.35], [-0.17, -0.35]]) P.push(part(box(0.13, 0.35, 0.13), '#7d889a', { p: [x, 0.17, z] }));
      P.push(part(box(0.12, 0.12, 0.5), '#9aa6b8', { p: [0, 0.7, -0.7], r: [0.5, 0, 0] }));
      break;
    case 'beetle':
      P.push(part(sph(0.6, 8, 5), '#2f6f8f', { p: [0, 0.45, 0], s: [1, 0.6, 1.25], jitter: 0.15 }));
      P.push(part(box(0.04, 0.3, 1.3), '#163a4a', { p: [0, 0.75, 0] }));
      P.push(part(sph(0.3, 6, 4), '#163a4a', { p: [0, 0.4, 0.7] }));
      P.push(part(cone(0.07, 0.4, 4), '#d9b44a', { p: [0.15, 0.5, 1.0], r: [1.3, 0, 0] }), part(cone(0.07, 0.4, 4), '#d9b44a', { p: [-0.15, 0.5, 1.0], r: [1.3, 0, 0] }));
      for (let i = -1; i <= 1; i++) { P.push(part(box(0.9, 0.06, 0.06), '#163a4a', { p: [0, 0.15, i * 0.3] })); }
      break;
    case 'eye':
      P.push(part(ico(0.5, 1), '#f4e8f0', { p: [0, 1.1, 0], jitter: 0.08 }));
      P.push(part(cyl(0.25, 0.25, 0.1, 8), '#c0306a', { p: [0, 1.1, 0.45], r: [Math.PI / 2, 0, 0] }));
      P.push(part(cyl(0.11, 0.11, 0.12, 6), '#120814', { p: [0, 1.1, 0.5], r: [Math.PI / 2, 0, 0] }));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; P.push(part(cone(0.07, 0.5, 4), '#8a2a5c', { p: [Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3 - 0.1], r: [Math.PI, 0, 0] })); }
      break;
    case 'ghost':
      P.push(part(sph(0.45, 8, 6), '#cfe8ff', { p: [0, 1.15, 0], jitter: 0.06 }));
      P.push(part(cone(0.45, 0.9, 8), '#b5d5f5', { p: [0, 0.55, 0], r: [Math.PI, 0, 0] }));
      P.push(part(box(0.1, 0.16, 0.05), '#1b2a4a', { p: [0.14, 1.2, 0.42] }), part(box(0.1, 0.16, 0.05), '#1b2a4a', { p: [-0.14, 1.2, 0.42] }));
      break;
    case 'golem':
      P.push(part(dodec(0.75), '#4a3b36', { p: [0, 1.1, 0], s: [1.1, 1, 0.9], jitter: 0.2 }));
      P.push(part(dodec(0.4), '#3a2d29', { p: [0, 1.9, 0.1], jitter: 0.2 }));
      P.push(part(box(0.15, 0.08, 0.05), '#ff7a1a', { p: [0.14, 1.95, 0.45] }), part(box(0.15, 0.08, 0.05), '#ff7a1a', { p: [-0.14, 1.95, 0.45] }));
      P.push(part(box(0.5, 0.2, 0.5), '#ff5a00', { p: [0, 1.15, 0.55], s: [1, 1, 0.3] }));
      P.push(part(dodec(0.38), '#3a2d29', { p: [0.95, 1.1, 0], jitter: 0.2 }), part(dodec(0.38), '#3a2d29', { p: [-0.95, 1.1, 0], jitter: 0.2 }));
      P.push(part(box(0.35, 0.6, 0.35), '#3a2d29', { p: [0.35, 0.3, 0] }), part(box(0.35, 0.6, 0.35), '#3a2d29', { p: [-0.35, 0.3, 0] }));
      break;
    case 'crystal':
      P.push(part(oct(0.45), '#c78bff', { p: [0, 0.8, 0], s: [0.8, 1.5, 0.8], jitter: 0.2 }));
      P.push(part(oct(0.22), '#e9cfff', { p: [0.35, 0.5, 0], s: [0.8, 1.4, 0.8] }), part(oct(0.22), '#e9cfff', { p: [-0.35, 0.5, 0], s: [0.8, 1.4, 0.8] }));
      P.push(part(box(0.08, 0.08, 0.05), '#ffffff', { p: [0.1, 0.95, 0.33] }), part(box(0.08, 0.08, 0.05), '#ffffff', { p: [-0.1, 0.95, 0.33] }));
      break;
    case 'imp':
      P.push(part(box(0.45, 0.5, 0.35), '#b8322a', { p: [0, 0.6, 0], jitter: 0.12 }));
      P.push(part(box(0.42, 0.38, 0.38), '#d4463b', { p: [0, 1.05, 0] }));
      P.push(part(cone(0.07, 0.3, 4), '#2b1410', { p: [0.14, 1.35, 0] }), part(cone(0.07, 0.3, 4), '#2b1410', { p: [-0.14, 1.35, 0] }));
      P.push(part(box(0.09, 0.09, 0.05), '#ffe600', { p: [0.1, 1.08, 0.2] }), part(box(0.09, 0.09, 0.05), '#ffe600', { p: [-0.1, 1.08, 0.2] }));
      P.push(part(box(0.6, 0.04, 0.3), '#7a1d18', { p: [0.4, 0.8, -0.15], r: [0, 0.4, 0.4] }), part(box(0.6, 0.04, 0.3), '#7a1d18', { p: [-0.4, 0.8, -0.15], r: [0, -0.4, -0.4] }));
      break;
    // ===== ボス =====
    case 'treant':
      P.push(part(cyl(0.7, 1.0, 2.2, 7), '#5b3d25', { p: [0, 1.1, 0], jitter: 0.15 }));
      P.push(part(ico(1.5, 0), '#2f7d32', { p: [0, 3.0, 0], jitter: 0.25 }));
      P.push(part(ico(0.9, 0), '#3f9a3f', { p: [1.0, 2.6, 0.3], jitter: 0.25 }), part(ico(0.9, 0), '#3f9a3f', { p: [-1.0, 2.7, -0.2], jitter: 0.25 }));
      P.push(part(box(0.25, 0.15, 0.1), '#ffd84a', { p: [0.3, 1.7, 0.75] }), part(box(0.25, 0.15, 0.1), '#ffd84a', { p: [-0.3, 1.7, 0.75] }));
      P.push(part(box(0.3, 1.6, 0.3), '#5b3d25', { p: [1.1, 1.3, 0], r: [0, 0, -0.6] }), part(box(0.3, 1.6, 0.3), '#5b3d25', { p: [-1.1, 1.3, 0], r: [0, 0, 0.6] }));
      break;
    case 'witch':
      P.push(part(cone(0.9, 2.0, 8), '#3a5c9a', { p: [0, 1.0, 0], jitter: 0.1 }));
      P.push(part(sph(0.45, 7, 5), '#dfe8ff', { p: [0, 2.2, 0] }));
      P.push(part(cone(0.6, 1.4, 8), '#24406e', { p: [0, 3.0, 0], r: [-0.15, 0, 0] }));
      P.push(part(cyl(0.9, 0.9, 0.06, 10), '#24406e', { p: [0, 2.45, 0] }));
      P.push(part(box(0.12, 0.08, 0.05), '#7ff3ff', { p: [0.15, 2.25, 0.42] }), part(box(0.12, 0.08, 0.05), '#7ff3ff', { p: [-0.15, 2.25, 0.42] }));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.push(part(oct(0.22), '#aef4ff', { p: [Math.cos(a) * 1.4, 1.5, Math.sin(a) * 1.4], s: [0.6, 1.4, 0.6] })); }
      break;
    case 'wyrm':
      P.push(part(box(1.4, 1.0, 2.2), '#c9973f', { p: [0, 1.0, 0], jitter: 0.15 }));
      P.push(part(box(1.2, 0.8, 1.2), '#d8aa52', { p: [0, 1.3, 1.5] }));
      P.push(part(box(0.9, 0.3, 0.9), '#a87a2c', { p: [0, 0.9, 1.9] }));
      for (let i = 0; i < 4; i++) P.push(part(cone(0.18, 0.6, 4), '#7a5520', { p: [0, 1.6 - i * 0.05, 0.9 - i * 0.6], r: [-0.4, 0, 0] }));
      P.push(part(box(0.2, 0.15, 0.1), '#ff3a2a', { p: [0.35, 1.5, 2.1] }), part(box(0.2, 0.15, 0.1), '#ff3a2a', { p: [-0.35, 1.5, 2.1] }));
      P.push(part(box(1.0, 0.7, 1.5), '#b8883a', { p: [0, 0.8, -1.6] }), part(box(0.6, 0.5, 1.2), '#a87a2c', { p: [0, 0.6, -2.8] }));
      break;
    case 'voidking':
      P.push(part(cone(1.1, 2.6, 8), '#1d1030', { p: [0, 1.3, 0], jitter: 0.1 }));
      P.push(part(dodec(0.6), '#2a1747', { p: [0, 2.9, 0] }));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; P.push(part(cone(0.12, 0.6, 4), '#ffcc33', { p: [Math.cos(a) * 0.4, 3.5, Math.sin(a) * 0.4] })); }
      P.push(part(cyl(0.5, 0.5, 0.15, 8), '#ffcc33', { p: [0, 3.2, 0] }));
      P.push(part(box(0.25, 0.1, 0.1), '#ff2bd6', { p: [0.2, 2.95, 0.55] }), part(box(0.25, 0.1, 0.1), '#ff2bd6', { p: [-0.2, 2.95, 0.55] }));
      P.push(part(tor(1.6, 0.06, 4, 16), '#b04dff', { p: [0, 1.6, 0], r: [Math.PI / 2, 0, 0] }));
      P.push(part(box(0.3, 1.8, 0.3), '#2a1747', { p: [1.2, 1.7, 0], r: [0, 0, -0.5] }), part(box(0.3, 1.8, 0.3), '#2a1747', { p: [-1.2, 1.7, 0], r: [0, 0, 0.5] }));
      break;
    default:
      P.push(part(box(1, 1, 1), '#ff00ff', { p: [0, 0.5, 0] }));
  }
  return merge(P);
}

// ===== プレイヤー(パーツごとに動かせるようグループで作る) =====
export const HEROES_LOOK = {
  knight: { body: '#3c6fd6', trim: '#ffd34d', skin: '#f2c9a0', hat: 'helm', cape: '#c23b3b' },
  mage: { body: '#7a3fc7', trim: '#5df2ff', skin: '#f6d3b3', hat: 'wizard', cape: '#3a1f6e' },
  ranger: { body: '#3f8f4a', trim: '#d8b26a', skin: '#e6b48d', hat: 'hood', cape: '#2b5e33' },
  alchemist: { body: '#c76a2b', trim: '#9cff6b', skin: '#f1c7a6', hat: 'goggles', cape: '#6b3a1a' },
};
export function buildHero(look, material) {
  const L = HEROES_LOOK[look];
  const g = new THREE.Group();
  const mk = (geo) => new THREE.Mesh(geo, material);
  const torso = mk(merge([
    part(box(0.6, 0.65, 0.4), L.body, { p: [0, 0, 0] }),
    part(box(0.64, 0.12, 0.44), L.trim, { p: [0, -0.2, 0] }),
    part(box(0.12, 0.5, 0.02), L.trim, { p: [0, 0.05, 0.21] }),
  ]));
  torso.position.y = 0.85;
  const headParts = [part(box(0.5, 0.48, 0.48), L.skin, { p: [0, 0, 0] }),
    part(box(0.08, 0.1, 0.03), '#222', { p: [0.12, 0.02, 0.25] }), part(box(0.08, 0.1, 0.03), '#222', { p: [-0.12, 0.02, 0.25] })];
  if (L.hat === 'helm') headParts.push(part(box(0.56, 0.28, 0.54), '#c9d3e6', { p: [0, 0.2, 0] }), part(box(0.1, 0.3, 0.1), L.cape, { p: [0, 0.45, -0.05] }));
  if (L.hat === 'wizard') headParts.push(part(cyl(0.45, 0.45, 0.05, 10), L.cape, { p: [0, 0.24, 0] }), part(cone(0.28, 0.7, 8), L.cape, { p: [0, 0.6, -0.05], r: [-0.25, 0, 0] }), part(box(0.1, 0.1, 0.1), L.trim, { p: [0, 0.85, -0.2] }));
  if (L.hat === 'hood') headParts.push(part(box(0.58, 0.32, 0.56), L.cape, { p: [0, 0.18, -0.03] }), part(box(0.58, 0.4, 0.15), L.cape, { p: [0, 0.0, -0.24] }), part(box(0.12, 0.08, 0.05), L.trim, { p: [0, 0.3, 0.29] }));
  if (L.hat === 'goggles') headParts.push(part(box(0.54, 0.12, 0.08), '#5a3a20', { p: [0, 0.08, 0.24] }), part(cyl(0.08, 0.08, 0.06, 8), L.trim, { p: [0.12, 0.08, 0.28], r: [Math.PI / 2, 0, 0] }), part(cyl(0.08, 0.08, 0.06, 8), L.trim, { p: [-0.12, 0.08, 0.28], r: [Math.PI / 2, 0, 0] }), part(box(0.52, 0.12, 0.5), '#5a3a20', { p: [0, 0.27, 0] }));
  const head = mk(merge(headParts));
  head.position.y = 1.43;
  const legGeo = merge([part(box(0.2, 0.5, 0.22), '#3a3040', { p: [0, -0.2, 0] }), part(box(0.22, 0.12, 0.3), '#2a2030', { p: [0, -0.42, 0.04] })]);
  const legL = mk(legGeo), legR = mk(legGeo);
  legL.position.set(0.15, 0.55, 0); legR.position.set(-0.15, 0.55, 0);
  const armGeo = merge([part(box(0.16, 0.5, 0.18), L.body, { p: [0, -0.2, 0] }), part(box(0.16, 0.14, 0.18), L.skin, { p: [0, -0.48, 0] })]);
  const armL = mk(armGeo), armR = mk(armGeo);
  armL.position.set(0.4, 1.12, 0); armR.position.set(-0.4, 1.12, 0);
  const cape = mk(merge([part(box(0.56, 0.75, 0.05), L.cape, { p: [0, -0.37, 0] })]));
  cape.position.set(0, 1.15, -0.23);
  g.add(torso, head, legL, legR, armL, armR, cape);
  g.userData = { torso, head, legL, legR, armL, armR, cape };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// ===== 景観 =====
export function decorGeometry(kind, rng) {
  const r = rng || Math.random;
  const P = [];
  const v = (a, b) => a + (b - a) * r();
  switch (kind) {
    case 'tree': {
      const h = v(1.2, 2.0);
      P.push(part(cyl(0.18, 0.26, h, 5), '#6b4a2f', { p: [0, h / 2, 0] }));
      const c = ['#3f9a3f', '#4caf50', '#58b84a', '#2f8a3a'][Math.floor(r() * 4)];
      P.push(part(ico(v(0.9, 1.25), 0), c, { p: [0, h + 0.6, 0], jitter: 0.25, r: [r(), r(), r()] }));
      if (r() < 0.6) P.push(part(ico(v(0.5, 0.8), 0), c, { p: [v(-0.5, 0.5), h + 1.2, v(-0.5, 0.5)], jitter: 0.25 }));
      break;
    }
    case 'pine': {
      const snow = kind === 'snowpine';
      P.push(part(cyl(0.15, 0.2, 0.8, 5), '#5a3d28', { p: [0, 0.4, 0] }));
      const c = '#2d6b3e';
      P.push(part(cone(1.1, 1.4, 6), c, { p: [0, 1.3, 0], jitter: 0.2 }), part(cone(0.85, 1.2, 6), c, { p: [0, 2.0, 0], jitter: 0.2 }), part(cone(0.55, 1.0, 6), c, { p: [0, 2.6, 0], jitter: 0.2 }));
      break;
    }
    case 'snowpine': {
      P.push(part(cyl(0.15, 0.2, 0.8, 5), '#5a3d28', { p: [0, 0.4, 0] }));
      P.push(part(cone(1.1, 1.4, 6), '#2a5a48', { p: [0, 1.3, 0], jitter: 0.2 }), part(cone(0.85, 1.2, 6), '#eef6ff', { p: [0, 2.0, 0], jitter: 0.1 }), part(cone(0.55, 1.0, 6), '#ffffff', { p: [0, 2.6, 0] }));
      break;
    }
    case 'deadtree': {
      P.push(part(cyl(0.1, 0.2, 2.2, 5), '#3b2f2a', { p: [0, 1.1, 0], r: [v(-0.1, 0.1), 0, v(-0.1, 0.1)] }));
      P.push(part(cyl(0.05, 0.09, 1.0, 4), '#3b2f2a', { p: [0.35, 1.6, 0], r: [0, 0, -0.9] }), part(cyl(0.05, 0.08, 0.8, 4), '#3b2f2a', { p: [-0.3, 1.9, 0.1], r: [0.2, 0, 0.8] }));
      break;
    }
    case 'rock': {
      const c = ['#8a8f98', '#9aa0a8', '#7b8088'][Math.floor(r() * 3)];
      P.push(part(dodec(v(0.4, 0.9)), c, { p: [0, 0.2, 0], s: [1, v(0.5, 0.9), 1], r: [r(), r(), r()], jitter: 0.2 }));
      if (r() < 0.5) P.push(part(dodec(v(0.2, 0.4)), c, { p: [v(0.5, 0.9), 0.1, v(-0.4, 0.4)], jitter: 0.2 }));
      break;
    }
    case 'sandrock': {
      P.push(part(dodec(v(0.6, 1.2)), '#c9a46a', { p: [0, 0.3, 0], s: [1, v(0.6, 1.4), 1], r: [r(), r(), r()], jitter: 0.2 }));
      break;
    }
    case 'bush': {
      const c = ['#3d8f3a', '#4ea84a', '#367d33'][Math.floor(r() * 3)];
      P.push(part(ico(v(0.4, 0.6), 0), c, { p: [0, 0.3, 0], jitter: 0.3 }), part(ico(v(0.3, 0.45), 0), c, { p: [v(0.2, 0.5), 0.25, v(-0.3, 0.3)], jitter: 0.3 }));
      if (r() < 0.4) for (let i = 0; i < 3; i++) P.push(part(box(0.1, 0.1, 0.1), '#ff5577', { p: [v(-0.4, 0.4), v(0.3, 0.6), v(-0.4, 0.4)] }));
      break;
    }
    case 'grass': {
      const c = ['#5fbf4a', '#6ccf55', '#4fae3f'][Math.floor(r() * 3)];
      for (let i = 0; i < 4; i++) P.push(part(cone(0.06, v(0.35, 0.6), 3), c, { p: [v(-0.3, 0.3), 0.2, v(-0.3, 0.3)], r: [v(-0.3, 0.3), 0, v(-0.3, 0.3)] }));
      break;
    }
    case 'flower': {
      const c = ['#ff6b8a', '#ffd34d', '#ffffff', '#b98bff', '#ff9a3c'][Math.floor(r() * 5)];
      for (let i = 0; i < 3; i++) {
        const x = v(-0.4, 0.4), z = v(-0.4, 0.4);
        P.push(part(cyl(0.02, 0.02, 0.3, 3), '#3f8f3a', { p: [x, 0.15, z] }), part(oct(0.09), c, { p: [x, 0.33, z] }));
      }
      break;
    }
    case 'cactus': {
      const h = v(1.2, 2.2);
      P.push(part(cyl(0.25, 0.28, h, 6), '#4f9a4a', { p: [0, h / 2, 0], jitter: 0.1 }));
      P.push(part(cyl(0.14, 0.14, 0.6, 6), '#4f9a4a', { p: [0.38, h * 0.55, 0] }), part(cyl(0.14, 0.14, 0.4, 6), '#4f9a4a', { p: [0.38, h * 0.55 + 0.4, 0] }));
      if (r() < 0.6) P.push(part(cyl(0.12, 0.12, 0.5, 6), '#4f9a4a', { p: [-0.35, h * 0.4, 0] }));
      if (r() < 0.4) P.push(part(oct(0.12), '#ff6bb0', { p: [0, h + 0.05, 0] }));
      break;
    }
    case 'bones': {
      P.push(part(box(0.7, 0.08, 0.08), '#eee6d0', { p: [0, 0.05, 0], r: [0, r() * 3, 0] }), part(box(0.5, 0.08, 0.08), '#eee6d0', { p: [0.1, 0.05, 0.2], r: [0, r() * 3, 0] }));
      P.push(part(box(0.25, 0.22, 0.25), '#f2ecd9', { p: [-0.3, 0.11, -0.1] }));
      break;
    }
    case 'iceshard': {
      for (let i = 0; i < 3; i++) P.push(part(oct(v(0.25, 0.5)), '#bfefff', { p: [v(-0.4, 0.4), v(0.4, 0.8), v(-0.4, 0.4)], s: [0.6, v(1.5, 2.5), 0.6], r: [v(-0.3, 0.3), 0, v(-0.3, 0.3)] }));
      break;
    }
    case 'snowrock': {
      P.push(part(dodec(v(0.5, 0.9)), '#8a96a8', { p: [0, 0.2, 0], s: [1, 0.7, 1], r: [r(), r(), r()] }), part(dodec(v(0.45, 0.8)), '#ffffff', { p: [0, 0.4, 0], s: [1, 0.35, 1] }));
      break;
    }
    case 'lavarock': {
      P.push(part(dodec(v(0.5, 1.0)), '#2b2224', { p: [0, 0.3, 0], s: [1, v(0.6, 1.3), 1], r: [r(), r(), r()], jitter: 0.25 }));
      P.push(part(box(0.15, 0.6, 0.15), '#ff6a1a', { p: [0, 0.35, 0], r: [r(), r(), r()] }));
      break;
    }
    case 'crystalcluster': {
      const c = ['#b98bff', '#7ff3ff', '#ff8bd8'][Math.floor(r() * 3)];
      for (let i = 0; i < 4; i++) P.push(part(oct(v(0.2, 0.45)), c, { p: [v(-0.5, 0.5), v(0.4, 0.9), v(-0.5, 0.5)], s: [0.5, v(1.8, 3), 0.5], r: [v(-0.4, 0.4), 0, v(-0.4, 0.4)] }));
      break;
    }
    case 'pillar': {
      const h = v(1.5, 3.2);
      P.push(part(box(0.7, h, 0.7), '#b8b1a0', { p: [0, h / 2, 0], jitter: 0.1, r: [v(-0.08, 0.08), r(), v(-0.08, 0.08)] }), part(box(0.95, 0.25, 0.95), '#a39c8a', { p: [0, 0.12, 0] }));
      if (r() < 0.5) P.push(part(box(0.9, 0.25, 0.9), '#a39c8a', { p: [0, h, 0] }));
      break;
    }
    case 'mushroom': {
      const c = ['#e2453a', '#c78bff', '#ffb33a'][Math.floor(r() * 3)];
      for (let i = 0; i < 3; i++) {
        const x = v(-0.4, 0.4), z = v(-0.4, 0.4), s = v(0.6, 1.3);
        P.push(part(cyl(0.06 * s, 0.08 * s, 0.35 * s, 5), '#f2ead6', { p: [x, 0.17 * s, z] }), part(sph(0.22 * s, 6, 3), c, { p: [x, 0.36 * s, z], s: [1, 0.6, 1] }));
      }
      break;
    }
    default:
      P.push(part(box(0.5, 0.5, 0.5), '#f0f', { p: [0, 0.25, 0] }));
  }
  return merge(P);
}

// ===== 拾得物・オブジェクト =====
export function itemGeometry(kind) {
  const P = [];
  switch (kind) {
    case 'gem': P.push(part(oct(0.22), '#ffffff', { s: [0.8, 1.2, 0.8] })); break;
    case 'coin': P.push(part(cyl(0.22, 0.22, 0.06, 10), '#ffd24a', { r: [Math.PI / 2, 0, 0] }), part(cyl(0.13, 0.13, 0.08, 6), '#ffb300', { r: [Math.PI / 2, 0, 0] })); break;
    case 'meat': P.push(part(sph(0.25, 6, 5), '#b5512c', { p: [0.1, 0, 0], s: [1.2, 0.9, 0.9] }), part(cyl(0.05, 0.05, 0.4, 5), '#f4ecd8', { p: [-0.22, 0, 0], r: [0, 0, Math.PI / 2] }), part(sph(0.08, 5, 4), '#f4ecd8', { p: [-0.42, 0, 0] })); break;
    case 'magnet': P.push(part(tor(0.22, 0.08, 4, 8), '#e33b3b', { r: [0, 0, 0] }), part(box(0.12, 0.12, 0.16), '#dde3ee', { p: [0.22, -0.08, 0] }), part(box(0.12, 0.12, 0.16), '#dde3ee', { p: [-0.22, -0.08, 0] })); break;
    case 'bomb': P.push(part(sph(0.26, 8, 6), '#2a2a36'), part(cyl(0.05, 0.05, 0.15, 5), '#8b6b4a', { p: [0, 0.3, 0] }), part(oct(0.08), '#ffcc33', { p: [0, 0.42, 0] })); break;
    case 'chest':
      P.push(part(box(1.1, 0.6, 0.75), '#a0632a', { p: [0, 0.3, 0], jitter: 0.08 }), part(box(1.14, 0.35, 0.79), '#b8743a', { p: [0, 0.78, 0] }));
      P.push(part(box(1.16, 0.1, 0.81), '#ffd24a', { p: [0, 0.6, 0] }), part(box(0.18, 0.25, 0.05), '#ffd24a', { p: [0, 0.55, 0.4] }));
      P.push(part(box(0.1, 0.95, 0.8), '#ffd24a', { p: [0.42, 0.48, 0] }), part(box(0.1, 0.95, 0.8), '#ffd24a', { p: [-0.42, 0.48, 0] }));
      break;
    case 'crate':
      P.push(part(box(0.8, 0.8, 0.8), '#a77b4a', { p: [0, 0.4, 0], jitter: 0.1 }), part(box(0.84, 0.1, 0.84), '#6b4a2a', { p: [0, 0.75, 0] }), part(box(0.84, 0.1, 0.84), '#6b4a2a', { p: [0, 0.05, 0] }));
      P.push(part(box(0.1, 0.8, 0.84), '#6b4a2a', { p: [0, 0.4, 0], r: [0, 0, 0.78] }));
      break;
    case 'vase':
      P.push(part(sph(0.35, 7, 5), '#5d7fb0', { p: [0, 0.35, 0], s: [1, 1.1, 1], jitter: 0.1 }), part(cyl(0.16, 0.22, 0.25, 7), '#4a6a96', { p: [0, 0.78, 0] }), part(cyl(0.38, 0.38, 0.06, 7), '#ffd24a', { p: [0, 0.4, 0] }));
      break;
    case 'shrine':
      P.push(part(cyl(2.2, 2.4, 0.25, 8), '#a7b0c0', { p: [0, 0.12, 0], jitter: 0.08 }));
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; P.push(part(box(0.35, 2.2, 0.35), '#d8dde8', { p: [Math.cos(a) * 1.8, 1.2, Math.sin(a) * 1.8] }), part(oct(0.25), '#7ff3ff', { p: [Math.cos(a) * 1.8, 2.55, Math.sin(a) * 1.8] })); }
      P.push(part(cyl(0.5, 0.7, 0.9, 6), '#c0c7d4', { p: [0, 0.7, 0] }));
      break;
    case 'obelisk':
      P.push(part(box(1.0, 4.2, 1.0), '#251a30', { p: [0, 2.1, 0], jitter: 0.12 }), part(cone(0.72, 1.0, 4), '#251a30', { p: [0, 4.7, 0], r: [0, Math.PI / 4, 0] }));
      P.push(part(box(0.15, 2.6, 1.05), '#ff3a6a', { p: [0, 2.2, 0] }), part(box(1.05, 2.6, 0.15), '#ff3a6a', { p: [0, 2.2, 0] }));
      P.push(part(cyl(1.6, 1.8, 0.3, 6), '#3a2d40', { p: [0, 0.15, 0] }));
      break;
    case 'seal':
      P.push(part(cyl(3.2, 3.6, 0.5, 10), '#4a4560', { p: [0, 0.25, 0], jitter: 0.08 }));
      P.push(part(box(1.4, 7.5, 1.4), '#2c2840', { p: [0, 4.0, 0], jitter: 0.1 }));
      P.push(part(oct(1.0), '#ffcc33', { p: [0, 8.6, 0], s: [1, 1.6, 1] }));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.push(part(box(0.5, 2.5, 0.5), '#3d3858', { p: [Math.cos(a) * 3.0, 1.5, Math.sin(a) * 3.0], r: [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15] })); }
      P.push(part(box(0.2, 6.0, 1.45), '#ffcc33', { p: [0, 4.0, 0] }));
      break;
    case 'spring':
      P.push(part(cyl(2.0, 2.2, 0.3, 10), '#8a8f98', { p: [0, 0.15, 0], jitter: 0.1 }), part(cyl(1.7, 1.7, 0.05, 12), '#5df2c0', { p: [0, 0.3, 0] }));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.push(part(dodec(0.35), '#9aa0a8', { p: [Math.cos(a) * 2.1, 0.35, Math.sin(a) * 2.1] })); }
      break;
    case 'portal':
      P.push(part(tor(1.6, 0.25, 5, 14), '#ffcc33', { p: [0, 1.9, 0] }), part(cyl(2.0, 2.2, 0.25, 10), '#4a4560', { p: [0, 0.12, 0] }));
      break;
  }
  return merge(P);
}

export function projectileGeometry(kind) {
  const P = [];
  switch (kind) {
    case 'bolt': P.push(part(ico(0.22, 0), '#9ef7ff')); break;
    case 'star': P.push(part(oct(0.3), '#fff1a8', { s: [1, 1, 0.4] })); break;
    case 'blade': P.push(part(box(1.1, 0.06, 0.28), '#e8f0ff', { p: [0.3, 0, 0] }), part(box(0.2, 0.1, 0.36), '#ffd24a', { p: [-0.3, 0, 0] })); break;
    case 'arrow': P.push(part(box(0.06, 0.06, 1.0), '#e6d3a8'), part(cone(0.1, 0.25, 4), '#d8e4ff', { p: [0, 0, 0.6], r: [Math.PI / 2, 0, 0] }), part(box(0.2, 0.02, 0.2), '#ff5a5a', { p: [0, 0, -0.45] })); break;
    case 'flask': P.push(part(sph(0.2, 6, 5), '#9cff6b'), part(cyl(0.07, 0.07, 0.2, 5), '#d8e4ff', { p: [0, 0.22, 0] })); break;
    case 'boomerang': P.push(part(box(0.8, 0.08, 0.2), '#ff9a3c', { p: [0.25, 0, 0.12], r: [0, 0.7, 0] }), part(box(0.8, 0.08, 0.2), '#ff9a3c', { p: [-0.25, 0, 0.12], r: [0, -0.7, 0] })); break;
    case 'meteor': P.push(part(dodec(0.8), '#ff7a2a', { jitter: 0.3 })); break;
    case 'orb': P.push(part(ico(0.26, 1), '#ff4fd8')); break;
    case 'spirit': P.push(part(ico(0.3, 1), '#fff8c8'), part(oct(0.18), '#ffffff', { p: [0, 0.4, 0] })); break;
  }
  return merge(P);
}
