import * as THREE from 'three';
import { DEFAULT_CAP, type CapBrand } from '../game/caps';

/** ペットボトルのキャップ（ギザギザの側面・天面のラベル）。実物より大きめにして見やすくする */
export const CAP_VIS_R = 0.062;

/** 天面のラベルを描く（ゲーム内のキャップと、選択画面の見本で共通） */
export function drawCapTop(c: CanvasRenderingContext2D, S: number, b: CapBrand) {
  const h = S / 2;
  c.save();
  c.clearRect(0, 0, S, S);
  c.beginPath(); c.arc(h, h, h, 0, Math.PI * 2); c.clip();
  c.fillStyle = b.label;
  c.fillRect(0, 0, S, S);
  // ほんのりした光沢
  const g = c.createRadialGradient(h * 0.8, h * 0.7, S * 0.05, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0.08)');
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  c.fillStyle = b.accent;
  c.strokeStyle = b.accent;
  const u = S / 256;
  switch (b.pattern) {
    case 'band':
      c.fillRect(0, h - 46 * u, S, 92 * u);
      break;
    case 'dots':
      for (let y = 18; y < 256; y += 44) for (let x = (y / 44) % 2 ? 40 : 18; x < 256; x += 44) { c.beginPath(); c.arc(x * u, y * u, 9 * u, 0, Math.PI * 2); c.fill(); }
      break;
    case 'stripe':
      c.lineWidth = 16 * u;
      for (let k = -256; k < 512; k += 48) { c.beginPath(); c.moveTo(k * u, 0); c.lineTo((k + 256) * u, S); c.stroke(); }
      break;
    case 'wave':
      c.lineWidth = 12 * u;
      for (let r = 0; r < 3; r++) {
        c.beginPath();
        for (let x = 0; x <= 256; x += 4) c.lineTo(x * u, (190 + r * 24 + Math.sin(x / 22 + r) * 8) * u);
        c.stroke();
      }
      break;
    case 'leaf':
      c.beginPath();
      c.ellipse(h + 62 * u, h - 62 * u, 46 * u, 20 * u, -0.8, 0, Math.PI * 2);
      c.ellipse(h - 64 * u, h + 66 * u, 40 * u, 17 * u, -0.8, 0, Math.PI * 2);
      c.fill();
      break;
    case 'star':
    case 'sun': {
      const n = b.pattern === 'star' ? 5 : 16;
      c.beginPath();
      for (let k = 0; k < n * 2; k++) {
        const a = (k / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = (k % 2 ? (b.pattern === 'star' ? 52 : 100) : 124) * u;
        c.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r);
      }
      c.closePath();
      c.globalAlpha = b.pattern === 'star' ? 0.35 : 0.5;
      c.fill();
      c.globalAlpha = 1;
      break;
    }
    case 'bolt':
      c.beginPath();
      [[150, 10], [70, 140], [126, 140], [96, 250], [190, 104], [134, 104], [176, 10]].forEach(([x, y]) => c.lineTo(x * u, y * u));
      c.closePath();
      c.globalAlpha = 0.45;
      c.fill();
      c.globalAlpha = 1;
      break;
    case 'drop':
      c.beginPath();
      c.moveTo(h, 22 * u);
      c.bezierCurveTo(h + 90 * u, 130 * u, h + 70 * u, 236 * u, h, 236 * u);
      c.bezierCurveTo(h - 70 * u, 236 * u, h - 90 * u, 130 * u, h, 22 * u);
      c.globalAlpha = 0.3;
      c.fill();
      c.globalAlpha = 1;
      break;
    case 'check':
      c.globalAlpha = 0.22;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) c.fillRect(x * 32 * u, y * 32 * u, 32 * u, 32 * u);
      c.globalAlpha = 1;
      break;
    case 'heart':
      for (const [x, y, r] of [[60, 66, 18], [196, 70, 14], [70, 196, 14], [194, 192, 18]]) {
        c.beginPath();
        c.moveTo(x * u, (y + r) * u);
        c.bezierCurveTo((x - r * 1.6) * u, (y - r * 0.2) * u, (x - r * 0.5) * u, (y - r * 1.3) * u, x * u, (y - r * 0.4) * u);
        c.bezierCurveTo((x + r * 0.5) * u, (y - r * 1.3) * u, (x + r * 1.6) * u, (y - r * 0.2) * u, x * u, (y + r) * u);
        c.fill();
      }
      break;
    case 'ring':
      break;
  }
  // 縁取りの輪
  c.lineWidth = 14 * u;
  c.strokeStyle = b.accent;
  c.beginPath(); c.arc(h, h, 106 * u, 0, Math.PI * 2); c.stroke();
  // 縁の細かい印字（大きく描くときだけ）
  if (S >= 256) {
    const txt = `${b.name}・${b.genre}・CAP STADIUM・`;
    const chars = [...txt + txt];
    c.font = `bold ${15 * u}px "M PLUS Rounded 1c", sans-serif`;
    c.fillStyle = b.ink;
    c.globalAlpha = 0.75;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const rr = 86 * u;
    for (let k = 0; k < chars.length; k++) {
      const a = (k / chars.length) * Math.PI * 2 - Math.PI / 2;
      c.save();
      c.translate(h + Math.cos(a) * rr, h + Math.sin(a) * rr);
      c.rotate(a + Math.PI / 2);
      c.fillText(chars[k], 0, 0);
      c.restore();
    }
    c.globalAlpha = 1;
  }
  // 銘柄の文字
  const len = [...b.mark].length;
  const fs = (len <= 1 ? 120 : len <= 2 ? 92 : len <= 3 ? 72 : len <= 4 ? 58 : 46) * u;
  c.font = `bold ${fs}px "Dela Gothic One", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 8 * u;
  c.strokeStyle = b.label;
  c.lineJoin = 'round';
  c.strokeText(b.mark, h, h + 4 * u);
  c.fillStyle = b.ink;
  c.fillText(b.mark, h, h + 4 * u);
  c.restore();
}

function labelTexture(b: CapBrand) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  drawCapTop(cv.getContext('2d')!, 512, b);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function haloTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,250,220,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** 表面の仕上げごとの材質 */
function bodyMaterial(b: CapBrand) {
  const base = { color: new THREE.Color(b.body), envMapIntensity: 1.2 };
  switch (b.finish ?? 'gloss') {
    case 'matte':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.62, clearcoat: 0.12, clearcoatRoughness: 0.5 });
    case 'metal':
      return new THREE.MeshPhysicalMaterial({ ...base, metalness: 0.88, roughness: 0.26, envMapIntensity: 1.6 });
    case 'pearl':
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2, iridescence: 0.75, iridescenceIOR: 1.45, iridescenceThicknessRange: [180, 520] });
    default:
      return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.12 });
  }
}

/**
 * キャップ本体：細かいみぞのある側面、丸みのある天面の縁、印刷されたラベル、
 * 裾の返し、内側のねじ山と中ぶた。
 */
function buildCapBody(b: CapBrand) {
  const body = new THREE.Group();
  body.name = 'body';
  const R = CAP_VIS_R, H = R * 0.7;
  const f = R * 0.12; // 天面の縁の丸み
  const yTop = H / 2, yBot = -H / 2;
  const mat = bodyMaterial(b);
  const lighter = new THREE.Color(b.body).lerp(new THREE.Color('#ffffff'), 0.55);
  const innerMat = new THREE.MeshStandardMaterial({ color: lighter, roughness: 0.55, side: THREE.BackSide });

  // 側面：みぞ（なめらかな山型）を刻む。上の縁の手前でみぞを消す
  const n = b.ridges ?? 96;
  const sideH = H - f;
  const rows = 6;
  const side = new THREE.CylinderGeometry(R, R, sideH, n * 4, rows, true);
  const pos = side.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const v = (y + sideH / 2) / sideH; // 0=下、1=上
    const fade = THREE.MathUtils.smoothstep(1 - v, 0.0, 0.22) * THREE.MathUtils.smoothstep(v, 0.0, 0.08);
    const ridge = Math.pow(0.5 + 0.5 * Math.cos(a * n), 1.6);
    const k = 1 + 0.03 * ridge * fade - 0.01 * (1 - fade);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  side.translate(0, yBot + sideH / 2, 0);
  side.computeVertexNormals();
  const sideMesh = new THREE.Mesh(side, mat);
  sideMesh.name = 'side';

  // 天面の縁の丸み
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = (k / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - f + Math.cos(t) * f * 0.99, yTop - f + Math.sin(t) * f));
  }
  const fillet = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 96), mat);

  // 天面のラベル（印刷フィルムっぽく少しつやを足す）
  const labelMat = new THREE.MeshPhysicalMaterial({ map: labelTexture(b), roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18, metalness: b.finish === 'metal' ? 0.35 : 0, envMapIntensity: 1.1 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(R - f + 0.0004, 96), labelMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = yTop;
  top.name = 'top';

  // 裾の返し
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 1.008, R * 0.045, 8, 96), mat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = yBot + R * 0.03;

  // 内側：内壁・底の縁・ねじ山・中ぶた
  const ri = R * 0.88;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, H * 0.92, 48, 1, true), innerMat);
  wall.position.y = yBot + H * 0.46;
  const rim = new THREE.Mesh(new THREE.RingGeometry(ri, R * 1.0, 64), new THREE.MeshStandardMaterial({ color: lighter, roughness: 0.5, side: THREE.DoubleSide }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = yBot + 0.0005;
  const threadMat = new THREE.MeshStandardMaterial({ color: lighter, roughness: 0.5 });
  const threads = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const th = new THREE.Mesh(new THREE.TorusGeometry(ri * 0.985, R * 0.028, 6, 64), threadMat);
    th.rotation.x = Math.PI / 2 + 0.06;
    th.position.y = yBot + H * (0.3 + k * 0.28);
    threads.add(th);
  }
  const liner = new THREE.Mesh(new THREE.CircleGeometry(ri, 48), new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.7 }));
  liner.rotation.x = Math.PI / 2;
  liner.position.y = yTop - H * 0.1;
  const seal = new THREE.Mesh(new THREE.TorusGeometry(ri * 0.72, R * 0.03, 6, 48), threadMat);
  seal.rotation.x = Math.PI / 2;
  seal.position.y = yTop - H * 0.12;

  body.add(sideMesh, fillet, top, lip, wall, rim, threads, liner, seal);
  for (const m of [sideMesh, fillet, top, lip]) m.castShadow = true;
  return body;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) {
      (mt as THREE.MeshStandardMaterial).map?.dispose();
      mt.dispose();
    }
  });
}

export function makeCapBall(brand: CapBrand = DEFAULT_CAP, withHalo = true) {
  const g = new THREE.Group();
  g.userData.capRoot = true;
  g.userData.brand = brand.id;
  g.add(buildCapBody(brand));
  if (withHalo) {
    // スマホの小さな画面でも見失わないよう、うっすら光る輪を添える
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(CAP_VIS_R * 5.5);
    halo.name = 'halo';
    g.add(halo);
  }
  return g;
}

/** 作ってあるキャップの見た目を別の銘柄に替える */
export function applyCapBrand(root: THREE.Object3D, brand: CapBrand) {
  let cap: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!cap && o.userData.capRoot) cap = o;
  });
  const g = cap as THREE.Object3D | null;
  if (!g || g.userData.brand === brand.id) return;
  const old = g.getObjectByName('body');
  if (old) {
    g.remove(old);
    disposeTree(old);
  }
  g.add(buildCapBody(brand));
  g.userData.brand = brand.id;
}

/** キャップの軌跡（フェードする帯） */
export class Trail {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private ages: number[] = [];
  life = 0.28;
  private geo: THREE.BufferGeometry;
  private max: number;
  constructor(max = 22, color = '#ffffff') {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    const n = max * 2;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    const idx: number[] = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor=vec4(color, vA*0.55); }',
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }
  clear() {
    this.pts = [];
    this.ages = [];
    this.update(new THREE.Vector3(0, 0, 1), 0.05, 0);
  }
  push(p: THREE.Vector3) {
    this.pts.unshift(p.clone());
    this.ages.unshift(0);
    if (this.pts.length > this.max) {
      this.pts.pop();
      this.ages.pop();
    }
  }
  update(camDir: THREE.Vector3, width = 0.05, dt = 0) {
    for (let i = 0; i < this.ages.length; i++) this.ages[i] += dt;
    while (this.ages.length && this.ages[this.ages.length - 1] > this.life) {
      this.ages.pop();
      this.pts.pop();
    }
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const al = this.geo.getAttribute('alpha') as THREE.BufferAttribute;
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const p = this.pts[Math.min(i, n - 1)] ?? new THREE.Vector3();
      const q = this.pts[Math.min(i + 1, n - 1)] ?? p;
      const d = p.clone().sub(q);
      const side = d.cross(camDir).normalize().multiplyScalar(width * (1 - i / this.max));
      if (!isFinite(side.x)) side.set(0, 0, 0);
      pos.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z);
      pos.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
      const a = i < n ? Math.max(0, 1 - this.ages[i] / this.life) : 0;
      al.setX(i * 2, a);
      al.setX(i * 2 + 1, a);
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
  }
}
