import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addOutline, toToon, toonGradient } from './toon';
import type { ModelName } from '../core/assets';

/** KayKit の頭身（約2.3）を球場の寸法に合わせる縮尺。身長はおよそ 1.6m */
export const CHAR_SCALE = 0.7;
export const BAT_SCALE = 0.95;
/** 握りからバットの芯までの距離 */
export const BAT_SWEET = 0.62;

export interface Uniform {
  key: string;
  primary: string; // 上着
  accent: string; // ベルト・手袋・差し色
  pants: string; // ズボン
  shoes: string; // 靴
  cap: string; // 帽子
  brim: string; // つば
}

// ---------------------------------------------------------------------------
// ユニフォームの塗り替え（KayKit のパレットテクスチャの色面を役割ごとに置き換える）
// ---------------------------------------------------------------------------
const texCache = new Map<string, THREE.Texture>();

function rgb2hsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
const isSkin = (h: number, s: number, l: number) => h >= 8 && h <= 42 && s >= 0.25 && l >= 0.55 && l <= 0.88;
const isLeather = (h: number, s: number, l: number) => h >= 0 && h <= 45 && s >= 0.18 && l < 0.55;

function recolorTexture(model: ModelName, scene: THREE.Object3D, u: Uniform): THREE.Texture {
  const key = model + '|' + u.key;
  const hit = texCache.get(key);
  if (hit) return hit;
  let src: THREE.Texture | null = null;
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!src && m?.map) src = m.map;
  });
  const img = (src as unknown as THREE.Texture).image as CanvasImageSource & { width: number; height: number };
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H);
  const px = id.data;
  const owner = new Int32Array(W * H).fill(-1);
  interface Region { pixels: number[]; r: number; g: number; b: number; role: 'top' | 'bottom' | 'head' }
  const regions: Region[] = [];

  const fill = (sx: number, sy: number, role: Region['role']) => {
    const si = sy * W + sx;
    if (owner[si] >= 0) return;
    const r0 = px[si * 4], g0 = px[si * 4 + 1], b0 = px[si * 4 + 2];
    const reg: Region = { pixels: [], r: r0, g: g0, b: b0, role };
    const idx = regions.length;
    regions.push(reg);
    const stack = [si];
    owner[si] = idx;
    while (stack.length) {
      const p = stack.pop()!;
      reg.pixels.push(p);
      const x = p % W, y = (p / W) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const q of nb) {
        if (q < 0 || owner[q] >= 0) continue;
        const dr = px[q * 4] - r0, dg = px[q * 4 + 1] - g0, db = px[q * 4 + 2] - b0;
        if (dr * dr + dg * dg + db * db > 300) continue;
        owner[q] = idx;
        stack.push(q);
      }
    }
  };

  // 頭（顔・髪・眉）は元のテクスチャのまま使うので、ここでは服だけを見る
  const meshesInOrder: THREE.Mesh[] = [];
  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshesInOrder.push(o as THREE.Mesh); });
  meshesInOrder.forEach((mesh) => {
    const role: Region['role'] | null = /Leg/.test(mesh.name) ? 'bottom' : /(Body|Arm)/.test(mesh.name) ? 'top' : null;
    if (!role) return;
    const uv = mesh.geometry.getAttribute('uv');
    const index = mesh.geometry.getIndex();
    const n = index ? index.count : uv.count;
    for (let t = 0; t < n; t += 3) {
      let cu = 0, cv2 = 0;
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(t + k) : t + k;
        cu += uv.getX(vi);
        cv2 += uv.getY(vi);
      }
      const x = Math.min(W - 1, Math.max(0, Math.floor((cu / 3) * W)));
      const y = Math.min(H - 1, Math.max(0, Math.floor((cv2 / 3) * H)));
      fill(x, y, role);
    }
  });

  const C = (hex: string) => new THREE.Color(hex);
  const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
  // 役割ごとの基準明度（一番面積の大きい色面）
  const ref: Record<string, number> = {};
  const area: Record<string, number> = {};
  const classify = (reg: Region) => {
    const [h, s, l] = rgb2hsl(reg.r, reg.g, reg.b);
    if (reg.role === 'head' || isSkin(h, s, l)) return 'skin';
    if (reg.role === 'top') return isLeather(h, s, l) ? 'accent' : 'primary';
    return isLeather(h, s, l) || l < 0.22 ? 'shoes' : 'pants';
  };
  for (const reg of regions) {
    const c = classify(reg);
    if (reg.pixels.length > (area[c] ?? 0)) {
      area[c] = reg.pixels.length;
      ref[c] = lum(reg.r, reg.g, reg.b);
    }
  }
  const target: Record<string, THREE.Color> = { primary: C(u.primary), accent: C(u.accent), pants: C(u.pants), shoes: C(u.shoes) };
  for (const reg of regions) {
    const c = classify(reg);
    if (c === 'skin') continue;
    const t = target[c];
    const k = THREE.MathUtils.clamp(lum(reg.r, reg.g, reg.b) / Math.max(1, ref[c]), 0.55, 1.35);
    const r = Math.min(255, t.r * 255 * k), g = Math.min(255, t.g * 255 * k), b = Math.min(255, t.b * 255 * k);
    for (const p of reg.pixels) {
      px[p * 4] = r; px[p * 4 + 1] = g; px[p * 4 + 2] = b;
    }
  }
  ctx.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// 野球帽（ゲーム固有の小物なので形状をここで作る）
// ---------------------------------------------------------------------------
function makeCap(u: Uniform) {
  const g = new THREE.Group();
  const crownMat = new THREE.MeshToonMaterial({ color: u.cap, gradientMap: toonGradient() });
  const brimMat = new THREE.MeshToonMaterial({ color: u.brim, gradientMap: toonGradient() });
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), crownMat);
  crown.scale.set(1, 0.78, 1.04);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24, 1, true), crownMat);
  band.position.y = -0.04;
  const brimShape = new THREE.Shape();
  brimShape.absellipse(0, 0, 0.42, 0.36, Math.PI, Math.PI * 2, false, 0);
  brimShape.lineTo(-0.42, 0);
  const brim = new THREE.Mesh(new THREE.ExtrudeGeometry(brimShape, { depth: 0.025, bevelEnabled: false, curveSegments: 16 }), brimMat);
  brim.rotation.x = -Math.PI / 2 - 0.12;
  brim.position.set(0, -0.06, 0.38);
  brim.scale.set(1, 1, 1);
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), brimMat);
  button.position.y = 0.39;
  g.add(crown, band, brim, button);
  for (const m of [crown, band, brim, button]) {
    m.castShadow = true;
    addOutline(m, 0.012);
  }
  return g;
}

// ---------------------------------------------------------------------------
// 手続き的ポーズ（キャラ座標系: 前 +Z、左 +X、上 +Y。単位はメートル）
// ---------------------------------------------------------------------------
export interface ProcPose {
  hips?: THREE.Vector3; // 腰の移動量
  torso?: THREE.Vector3; // (yaw, pitch, roll) 度。腰・背骨・胸に配分
  handR?: THREE.Vector3;
  handL?: THREE.Vector3;
  elbowR?: THREE.Vector3; // 肘の向き（ポール）
  elbowL?: THREE.Vector3;
  footR?: THREE.Vector3; // 足首位置（地面で y≈0.15）
  footL?: THREE.Vector3;
  kneeR?: THREE.Vector3;
  kneeL?: THREE.Vector3;
  head?: THREE.Vector2; // (yaw, pitch) 度
  bat?: { grip: THREE.Vector3; dir: THREE.Vector3 } | null; // バット（握り位置と向き）
}

export interface PoseKey { t: number; p: ProcPose }

const ease = (x: number) => x * x * (3 - 2 * x);
function lerpV(a: THREE.Vector3 | undefined, b: THREE.Vector3 | undefined, k: number) {
  if (!a) return b?.clone();
  if (!b) return a.clone();
  return a.clone().lerp(b, k);
}
/** キーフレームからポーズを補間する（各区間を滑らかに） */
export function samplePose(keys: PoseKey[], t: number): ProcPose {
  if (t <= keys[0].t) return keys[0].p;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].p;
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const a = keys[i], b = keys[i + 1];
  const k = ease((t - a.t) / (b.t - a.t));
  const p: ProcPose = {};
  for (const name of ['hips', 'torso', 'handR', 'handL', 'elbowR', 'elbowL', 'footR', 'footL', 'kneeR', 'kneeL'] as const) {
    const v = lerpV(a.p[name], b.p[name], k);
    if (v) p[name] = v;
  }
  if (a.p.head || b.p.head) p.head = (a.p.head ?? b.p.head!).clone().lerp(b.p.head ?? a.p.head!, k);
  if (a.p.bat && b.p.bat) {
    p.bat = { grip: a.p.bat.grip.clone().lerp(b.p.bat.grip, k), dir: a.p.bat.dir.clone().lerp(b.p.bat.dir, k).normalize() };
  } else p.bat = a.p.bat ?? b.p.bat;
  return p;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();

function aimBone(bone: THREE.Object3D, childWorld: THREE.Vector3, targetWorld: THREE.Vector3) {
  const bw = bone.getWorldPosition(_v1);
  const cur = _v2.copy(childWorld).sub(bw);
  const des = _v3.copy(targetWorld).sub(bw);
  if (cur.lengthSq() < 1e-8 || des.lengthSq() < 1e-8) return;
  cur.normalize();
  des.normalize();
  _q1.setFromUnitVectors(cur, des);
  bone.getWorldQuaternion(_q2).premultiply(_q1);
  bone.parent!.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q2));
  bone.updateMatrixWorld(true);
}

function twoBoneIK(a: THREE.Object3D, b: THREE.Object3D, c: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
  const A = a.getWorldPosition(new THREE.Vector3());
  const B = b.getWorldPosition(new THREE.Vector3());
  const Cp = c.getWorldPosition(new THREE.Vector3());
  const l1 = A.distanceTo(B), l2 = B.distanceTo(Cp);
  const toT = target.clone().sub(A);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const n = toT.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const m = pole.clone().sub(n.clone().multiplyScalar(pole.dot(n)));
  if (m.lengthSq() < 1e-6) m.set(0, -1, 0);
  m.normalize();
  const Bn = A.clone().add(n.clone().multiplyScalar(l1 * cosA)).add(m.multiplyScalar(l1 * sinA));
  aimBone(a, B, Bn);
  aimBone(b, c.getWorldPosition(new THREE.Vector3()), A.clone().add(n.multiplyScalar(d)));
}

// ---------------------------------------------------------------------------
export class Character {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  currentName = '';
  readonly bones: Record<string, THREE.Bone> = {};
  private rest = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  pose: ProcPose | null = null;
  poseWeight = 0;
  poseTarget = 0;
  readonly cap: THREE.Object3D;
  bat: THREE.Object3D | null = null;
  readonly batHolder = new THREE.Group();
  private savedQ = new Map<THREE.Object3D, THREE.Quaternion>();

  constructor(gltf: GLTF, modelName: ModelName, uniform: Uniform, clips: THREE.AnimationClip[], opts: { scale?: number } = {}) {
    this.model = SkeletonUtils.clone(gltf.scene);
    const tex = recolorTexture(modelName, gltf.scene, uniform);
    const meshes: THREE.Mesh[] = [];
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) meshes.push(mesh);
      if ((o as THREE.Bone).isBone) this.bones[o.name] = o as THREE.Bone;
    });
    for (const mesh of meshes) {
      const isHead = /Head/.test(mesh.name);
      mesh.material = toToon(mesh.material as THREE.Material, isHead ? {} : { map: tex });
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      addOutline(mesh, 0.011);
    }
    this.root.add(this.model);
    this.root.add(this.batHolder);
    this.model.scale.setScalar(opts.scale ?? CHAR_SCALE);
    for (const b of Object.values(this.bones)) this.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });

    this.cap = makeCap(uniform);
    this.cap.scale.setScalar(1.16);
    this.cap.position.set(0, 0.74, -0.02);
    this.cap.rotation.x = -0.14;
    // 公式キャップ野球では帽子をかぶらないので、帽子は付けない（形だけ残す）
    this.cap.visible = false;
    this.bones['head']?.add(this.cap);

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
  }

  attachBat(batTemplate: THREE.Object3D) {
    const bat = batTemplate.clone(true);
    const meshes: THREE.Mesh[] = [];
    bat.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    meshes.forEach((m) => {
      {
        // キャップ野球のバットは滑らかで丸いプラスチック棒（黄色いウィッフル型）
        m.material = new THREE.MeshToonMaterial({ color: '#ffd23a', gradientMap: toonGradient() });
        m.castShadow = true;
        addOutline(m, 0.008);
      }
    });
    // Poly Haven のバットは +Y が先端、握りが -Y 側。握りを原点・先端を +Z に向ける
    bat.scale.set(BAT_SCALE * 0.8, BAT_SCALE, BAT_SCALE * 0.8);
    bat.rotation.set(Math.PI / 2, 0, 0);
    bat.position.set(0, 0, 0.2 * BAT_SCALE);
    this.bat = bat;
    this.batHolder.add(bat);
    this.batHolder.visible = false;
  }

  play(name: string, o: { fade?: number; loop?: boolean; speed?: number; clamp?: boolean; offset?: number } = {}) {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.current === a && a.isRunning() && (o.loop ?? true)) {
      a.timeScale = o.speed ?? 1;
      return;
    }
    a.reset();
    a.setLoop(o.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = o.clamp ?? true;
    a.timeScale = o.speed ?? 1;
    if (o.offset) a.time = o.offset * a.getClip().duration;
    a.play();
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, o.fade ?? 0.2, false);
    this.current = a;
    this.currentName = name;
  }

  clipDuration(name: string) {
    return this.actions.get(name)?.getClip().duration ?? 1;
  }

  setPose(p: ProcPose | null, weight = 1) {
    if (p) this.pose = p;
    this.poseTarget = p ? weight : 0;
  }

  update(dt: number) {
    this.mixer.update(dt);
    const k = 1 - Math.exp(-dt * 14);
    this.poseWeight += (this.poseTarget - this.poseWeight) * k;
    if (this.pose && this.poseWeight > 0.002) this.applyPose(this.pose, this.poseWeight);
    else this.batHolder.visible = false;
  }

  /** キャラ座標 → ワールド座標 */
  toWorld(v: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(v).applyMatrix4(this.root.matrixWorld);
  }

  private applyPose(p: ProcPose, w: number) {
    this.root.updateMatrixWorld(true);
    const affected = Object.values(this.bones);
    if (w < 0.999) for (const b of affected) this.savedQ.set(b, b.quaternion.clone());
    const savedHips = this.bones.hips.position.clone();

    const B = this.bones;
    if (p.hips) {
      // 腰の移動量はキャラ座標で与えるので、親の座標系に変換して足す
      const parent = B.hips.parent!;
      const base = this.rest.get(B.hips)!.p;
      const world0 = parent.localToWorld(base.clone());
      const off = p.hips.clone().transformDirection(this.root.matrixWorld).multiplyScalar(p.hips.length());
      B.hips.position.copy(parent.worldToLocal(world0.add(off)));
    } else B.hips.position.copy(this.rest.get(B.hips)!.p);
    if (p.torso) {
      const [yaw, pitch, roll] = [p.torso.x, p.torso.y, p.torso.z].map((d) => (d * Math.PI) / 180);
      const parts: [THREE.Bone, number][] = [[B.hips, 0.4], [B.spine, 0.3], [B.chest, 0.3]];
      for (const [bone, f] of parts) {
        _e.set(pitch * (bone === B.hips ? 0.2 : 0.4), yaw * f, roll * f, 'YXZ');
        bone.quaternion.copy(this.rest.get(bone)!.q).multiply(_q1.setFromEuler(_e));
      }
    }
    if (p.head) {
      _e.set((p.head.y * Math.PI) / 180, (p.head.x * Math.PI) / 180, 0, 'YXZ');
      B.head.quaternion.copy(this.rest.get(B.head)!.q).multiply(_q1.setFromEuler(_e));
    }
    this.model.updateMatrixWorld(true);
    const W = (v: THREE.Vector3) => this.toWorld(v);
    const D = (v: THREE.Vector3) => v.clone().transformDirection(this.root.matrixWorld);
    if (p.footR) twoBoneIK(B.upperlegr, B.lowerlegr, B.footr, W(p.footR), D(p.kneeR ?? new THREE.Vector3(0, 0, 1)));
    if (p.footL) twoBoneIK(B.upperlegl, B.lowerlegl, B.footl, W(p.footL), D(p.kneeL ?? new THREE.Vector3(0, 0, 1)));
    if (p.handR) twoBoneIK(B.upperarmr, B.lowerarmr, B.wristr, W(p.handR), D(p.elbowR ?? new THREE.Vector3(-0.3, -1, -0.4)));
    if (p.handL) twoBoneIK(B.upperarml, B.lowerarml, B.wristl, W(p.handL), D(p.elbowL ?? new THREE.Vector3(0.3, -1, -0.4)));

    if (w < 0.999) {
      for (const b of affected) {
        const s = this.savedQ.get(b)!;
        b.quaternion.copy(s.slerp(b.quaternion, w));
      }
      B.hips.position.lerpVectors(savedHips, B.hips.position, w);
    }
    if (p.bat && this.bat) {
      this.batHolder.visible = true;
      this.batHolder.position.copy(p.bat.grip);
      const dir = p.bat.dir.clone().normalize();
      this.batHolder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    } else this.batHolder.visible = false;
  }

  /** ワールド座標での右手（投球・送球のリリース位置） */
  handWorld(side: 'r' | 'l', out = new THREE.Vector3()) {
    return this.bones[side === 'r' ? 'handr' : 'handl'].getWorldPosition(out);
  }

  private opacity = 1;
  setOpacity(o: number) {
    if (Math.abs(o - this.opacity) < 0.01) return;
    this.opacity = o;
    this.model.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (/outline/.test(mesh.name)) {
        mesh.visible = o > 0.99;
        return;
      }
      const mat = mesh.material as THREE.Material;
      mat.transparent = o < 0.99;
      mat.opacity = o;
      mat.depthWrite = o > 0.99;
    });
    this.cap.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (/outline/.test(mesh.name)) { mesh.visible = o > 0.99; return; }
      const mat = (mesh.material as THREE.Material).clone();
      mat.transparent = o < 0.99;
      mat.opacity = o;
      mesh.material = mat;
    });
  }

  faceTowards(x: number, z: number, k = 1) {
    const yaw = Math.atan2(x - this.root.position.x, z - this.root.position.z);
    let d = yaw - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * k;
  }
}
