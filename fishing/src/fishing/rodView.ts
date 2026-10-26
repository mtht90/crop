import * as THREE from 'three';
import type { Lure } from '../data/tackle';
import { buildBobber, buildSinker, buildTackle, type TackleObject } from '../render/tackle';
import { LineSim } from './lineSim';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/**
 * 折れ線の点列を Line2 の線分バッファへ書き込む（毎フレーム新しいバッファを作らない）
 */
function writeSegments(g: LineGeometry, attr: 'instanceStart' | 'instanceColorStart', pts: Float32Array): void {
  const buf = (g.getAttribute(attr) as THREE.InterleavedBufferAttribute).data;
  const a = buf.array as Float32Array;
  const n = pts.length / 3;
  for (let i = 0; i < n - 1; i++) {
    const o = i * 6;
    a[o] = pts[i * 3];
    a[o + 1] = pts[i * 3 + 1];
    a[o + 2] = pts[i * 3 + 2];
    a[o + 3] = pts[i * 3 + 3];
    a[o + 4] = pts[i * 3 + 4];
    a[o + 5] = pts[i * 3 + 5];
  }
  buf.needsUpdate = true;
}

const SEGMENTS = 14;
const SEG_LEN = 0.14;
/** ガイドを付ける節（根元側ほど大きい） */
const GUIDE_AT = [1, 3, 5, 7, 9, 11, 12];

/** 一人称の竿（ビューモデル）と道糸・ルアー・ウキ */
export class RodView {
  readonly root = new THREE.Group();
  private segs: THREE.Object3D[] = [];
  private tip = new THREE.Object3D();
  private reelHandle: THREE.Group;
  private rotor: THREE.Group;
  private spool: THREE.Group;
  private guides: THREE.Object3D[] = [];
  private spoolFront = new THREE.Object3D();
  /** リールからガイドを通って竿先までの糸（竿の座標系） */
  private guideLine: Line2;
  private guidePos: Float32Array;
  readonly line: Line2;
  private linePos: Float32Array;
  private lineCol: Float32Array;
  /** 仕掛けの先（ルアー・エサ）。中身は setTackle で差し替える */
  readonly lure = new THREE.Group();
  private tackle: TackleObject | null = null;
  readonly bobber: THREE.Group;
  private sinker: THREE.Mesh;
  /** ウキからエサまでのハリス */
  private leader: THREE.Line;
  /** ルアーが水中を引かれる速さ（動きの演出用） */
  lureSpeed = 0;

  /** 竿のしなり（0..1 程度） */
  bend = 0;
  /** 左右への倒し -1..1 */
  side = 0;
  /** キャスト時の振りかぶり角 */
  swing = 0;
  /** 竿先の震え（アタリ） */
  shake = 0;
  private shakeT = 0;
  reelSpin = 0;
  /** ドラグが滑ってスプールが逆回転する速さ 0..1 */
  spoolSlip = 0;
  /** 竿の角度 0 = 寝かせる .. 1 = 立てる */
  lift = 0.55;
  /** 魚に竿ごと引っ張られる量 0..1 */
  pull = 0;
  /** 引きの衝撃で手元ごと前へ持っていかれる量（ばねで戻る） */
  lurch = 0;
  /** 竿先への寄り 0..1（強い突っ込みの瞬間、竿を画面の中央へ寄せて竿先を大きく見せる） */
  closeup = 0;
  /** 演出の強さ（設定） */
  feel = 1;
  /** 張った糸の震え (m) */
  lineVibe = 0;
  private vibeT = 0;
  /** 竿先のばね（引きの衝撃で大きくお辞儀して揺れ戻る。竿先の固有振動） */
  private tipK = 0;
  private tipV = 0;
  /** 胴のしなり（2次元：竿の座標で x = 右, y = 上）。糸に引かれる向きへ、ばねで遅れて曲がる */
  private bx = 0;
  private by = 0;
  private bvx = 0;
  private bvy = 0;
  /** 手の慣性：竿の角度は入力に少し遅れてついてくる */
  private dispLift = 0.55;
  private liftV = 0;
  private prevTilt = 0;
  private prevYaw = 0;
  private tiltVel = 0;
  private yawVel = 0;
  /** 糸の物理 */
  private sim = new LineSim(48);
  private hasLine = false;
  private time = 0;
  /** 竿先から垂れたルアーの振り子 */
  private hang = new THREE.Vector3();
  private hangPrev = new THREE.Vector3();
  private hangInit = false;

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    camera.add(this.root);
    this.root.position.set(0.3, -0.36, -0.42);
    // カーボンのブランク：濃紺のクリア塗装
    const blankMat = new THREE.MeshPhysicalMaterial({ color: 0x18222e, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    const wrapMat = new THREE.MeshPhysicalMaterial({ color: 0x5a1218, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.22, metalness: 0.95 });
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.15, metalness: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.3, metalness: 0.85 });
    const bright = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.2, metalness: 0.95 });
    const tube = (r0: number, r1: number, len: number, mat: THREE.Material, z: number, seg = 16) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.z = z;
      return m;
    };
    // グリップ：後ろはEVA、前はコルク、間に金属のリールシート
    const eva = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.95 });
    const cork = new THREE.MeshStandardMaterial({ color: 0xa47c52, roughness: 0.9 });
    this.root.add(
      tube(0.019, 0.017, 0.2, eva, 0.2),
      tube(0.02, 0.02, 0.012, metal, 0.305),
      tube(0.0145, 0.0145, 0.1, metal, 0.05),
      tube(0.0165, 0.0165, 0.016, bright, 0.1),
      tube(0.0165, 0.0165, 0.016, bright, 0.0),
      tube(0.0155, 0.013, 0.08, cork, -0.05),
      tube(0.0135, 0.012, 0.012, metal, -0.095),
    );
    // スピニングリール（竿の下にぶら下がる）
    const reel = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.03), metal);
    stem.position.set(0, -0.03, 0);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), metal);
    body.scale.set(0.75, 0.9, 1.15);
    body.position.set(0, -0.07, 0.012);
    reel.add(stem, body);
    // ローター（巻くと回る）とベール
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, -0.07, -0.025);
    const rotorCup = tube(0.024, 0.028, 0.03, metal, 0, 18);
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.0018, 6, 20, Math.PI), bright);
    bail.position.z = -0.03;
    bail.rotation.z = 0.3;
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 8), bright);
    roller.position.set(0.032, 0.01, -0.03);
    this.rotor.add(rotorCup, bail, roller);
    // スプール（ドラグが滑ると逆に回る）。糸の巻き付けを縞で見せる
    this.spool = new THREE.Group();
    this.spool.position.set(0, -0.07, -0.05);
    const spoolTex = (() => {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 64;
      const g = c.getContext('2d')!;
      for (let y = 0; y < 64; y++) {
        const v = 200 + Math.round(Math.sin(y * 1.7) * 25);
        g.fillStyle = `rgb(${v},${v},${v - 10})`;
        g.fillRect(0, y, 8, 1);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1, 3);
      return t;
    })();
    const lineOnSpool = tube(0.022, 0.022, 0.026, new THREE.MeshStandardMaterial({ map: spoolTex, roughness: 0.5 }), 0, 24);
    const lip = tube(0.025, 0.025, 0.004, bright, -0.015, 24);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.005, 0.027), new THREE.MeshStandardMaterial({ color: 0xc23a2a }));
    mark.position.set(0, 0.022, 0);
    this.spool.add(lineOnSpool, lip, mark);
    this.spoolFront.position.set(0, 0.022, -0.02);
    this.spool.add(this.spoolFront);
    // ハンドル（右側、竿と直角の軸で回る）
    this.reelHandle = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.055, 0.008), bright);
    arm.position.y = 0.027;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.022, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 }));
    knob.rotation.z = Math.PI / 2;
    knob.position.set(0.014, 0.055, 0);
    this.reelHandle.add(arm, knob);
    this.reelHandle.position.set(0.028, -0.07, 0.015);
    reel.add(this.reelHandle, this.rotor, this.spool);
    reel.position.set(0, -0.012, 0.05);
    this.root.add(reel);

    // ブランク：根元から先端へ節をつなぎ、各節を回してしならせる
    let parent: THREE.Object3D = this.root;
    const radius = (t: number) => 0.0088 * Math.pow(1 - t, 1.15) + 0.0016;
    for (let i = 0; i < SEGMENTS; i++) {
      const seg = new THREE.Object3D();
      seg.position.z = i === 0 ? -0.1 : -SEG_LEN;
      const r0 = radius(i / SEGMENTS);
      const r1 = radius((i + 1) / SEGMENTS);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, SEG_LEN + 0.002, 10), blankMat);
      m.rotation.x = -Math.PI / 2;
      m.position.z = -SEG_LEN / 2;
      seg.add(m);
      const gi = GUIDE_AT.indexOf(i);
      if (gi >= 0) {
        // ガイド：スレッドで巻いた足、斜めのフレーム、黒いリング
        const ringR = 0.017 * Math.pow(0.72, gi) + 0.0025;
        const h = ringR + 0.006 + 0.008 * (1 - gi / GUIDE_AT.length);
        const z = -SEG_LEN * 0.5;
        const wrap = tube(r0 * 1.25, r0 * 1.25, 0.018, wrapMat, z + 0.01, 10);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.0016, h - ringR, 0.0016), frameMat);
        leg.position.set(0, -(r0 + (h - ringR) / 2), z);
        leg.rotation.x = -0.25;
        const frame = new THREE.Mesh(new THREE.TorusGeometry(ringR + 0.0012, 0.0011, 5, 16), frameMat);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.0012 + ringR * 0.12, 6, 16), ringMat);
        const centre = new THREE.Object3D();
        centre.position.set(0, -h, z);
        frame.position.copy(centre.position);
        ring.position.copy(centre.position);
        seg.add(wrap, leg, frame, ring, centre);
        this.guides.push(centre);
      }
      parent.add(seg);
      this.segs.push(seg);
      parent = seg;
    }
    // トップガイド
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.0028, 0.0009, 5, 12), frameMat);
    top.position.set(0, -0.003, -SEG_LEN);
    parent.add(top);
    this.tip.position.set(0, -0.003, -SEG_LEN);
    parent.add(this.tip);
    this.guides.push(this.tip);

    // 糸は画面上で一定の太さ（ピクセル）で描く。細い1pxの線だと竿先付近で空に溶けて途切れて見える
    this.guidePos = new Float32Array((this.guides.length + 1) * 3);
    const gl = new LineGeometry();
    gl.setPositions(this.guidePos);
    this.guideLine = new Line2(gl, new LineMaterial({ color: 0xdedcd2, linewidth: 1.6, transparent: true, opacity: 0.9 }));
    this.guideLine.frustumCulled = false;
    this.root.add(this.guideLine);

    this.linePos = new Float32Array(48 * 3);
    // 頂点カラー：空中は明るく、水中は水の色に沈む
    this.lineCol = new Float32Array(48 * 3).fill(0.9);
    const lg = new LineGeometry();
    lg.setPositions(this.linePos);
    lg.setColors(this.lineCol);
    this.line = new Line2(lg, new LineMaterial({ vertexColors: true, linewidth: 1.6, transparent: true, opacity: 0.9 }));
    this.line.frustumCulled = false;
    scene.add(this.line);

    scene.add(this.lure);

    // 大きめの棒ウキ（遠くでもトップが見える）
    this.bobber = buildBobber();
    this.bobber.scale.setScalar(1.5);
    this.bobber.visible = false;
    scene.add(this.bobber);
    this.sinker = buildSinker();
    this.sinker.visible = false;
    scene.add(this.sinker);
    const ll = new THREE.BufferGeometry();
    ll.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.leader = new THREE.Line(ll, new THREE.LineBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.5 }));
    this.leader.frustumCulled = false;
    this.leader.visible = false;
    scene.add(this.leader);
  }

  /** 仕掛けの先をルアー・エサのモデルに差し替える */
  setTackle(lure: Lure): void {
    if (this.tackle) {
      this.lure.remove(this.tackle.group);
      this.tackle.dispose();
    }
    this.tackle = buildTackle(lure);
    this.lure.add(this.tackle.group);
  }

  /** ウキ → ガン玉 → エサ のハリスを描く（ウキを使っていない時は隠す） */
  updateLeader(): void {
    const show = this.bobber.visible && this.lure.visible;
    this.leader.visible = show;
    this.sinker.visible = show;
    if (!show) return;
    const top = this.bobber.position.clone().add(new THREE.Vector3(0, -0.1, 0));
    const end = this.lure.position;
    const p = this.leader.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, top.x, top.y, top.z);
    p.setXYZ(1, end.x, end.y, end.z);
    p.needsUpdate = true;
    this.sinker.position.lerpVectors(end, top, 0.25);
  }

  tipWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.tip.getWorldPosition(out);
  }

  /** 引きの衝撃：竿先がお辞儀して揺れ戻る */
  kick(amount: number): void {
    this.tipV += amount * 5 * this.feel;
  }

  update(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    const F = this.feel;
    this.time += dt;
    this.shakeT += dt * 24;
    this.shake = Math.max(0, this.shake - dt * 3);
    // 竿先の固有振動（約4Hz）。アタリや糸鳴りはこの揺れを励起する
    this.tipV += Math.sin(this.shakeT + Math.sin(this.time * 3.1)) * this.shake * (14 + 16 * F) * dt;
    this.tipV += (-this.tipK * 576 - this.tipV * 9.6) * dt;
    this.tipK += this.tipV * dt;
    // 手の慣性
    if (dt > 0) {
      this.liftV += ((this.lift - this.dispLift) * 196 - this.liftV * 25) * dt;
      this.dispLift += this.liftV * dt;
    }
    // 強く引かれるほど竿が前に倒され、手元ごと持っていかれる
    const pull = this.pull * (0.5 + 0.5 * F);
    const lurch = this.lurch * F;
    const cu = this.closeup;
    const tilt = -0.05 + this.dispLift * 0.8 + this.swing - pull * 0.32 - lurch * 0.25 + cu * 0.12;
    const yaw = -this.side * 0.45;
    this.root.position.set(0.3 - cu * 0.16 + this.side * 0.05, -0.36 + cu * 0.05 - pull * 0.08 - lurch * 0.06, -0.42 - cu * 0.08 - pull * 0.2 - lurch * 0.16);
    this.root.rotation.set(tilt, yaw, -this.side * 0.25);
    // 竿を振ると、胴と穂先は慣性で遅れてしなり、止めると振り戻る
    if (dt > 0) {
      const tv = (tilt - this.prevTilt) / dt;
      const yv = (yaw - this.prevYaw) / dt;
      const dTv = Math.max(-25, Math.min(25, tv - this.tiltVel));
      const dYv = Math.max(-25, Math.min(25, yv - this.yawVel));
      this.bvy -= dTv * 0.55;
      this.bvx += dYv * 0.55;
      this.tipV -= dTv * 0.25;
      this.tiltVel = tv;
      this.yawVel = yv;
    }
    this.prevTilt = tilt;
    this.prevYaw = yaw;
    // 糸に引かれる向き（竿の座標）。竿と糸の角度が大きいほど曲げる力が大きい
    let dx = 0;
    let dy = -1;
    let amount = this.bend;
    if (this.hasLine && this.bend > 0) {
      const [lx, ly, lz] = this.sim.pullDir();
      const q = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      const d = new THREE.Vector3(lx, ly, lz).applyQuaternion(q);
      const sinA = Math.hypot(d.x, d.y);
      if (sinA > 1e-3) {
        dx = d.x / sinA;
        dy = d.y / sinA;
      }
      amount = this.bend * (0.3 + 0.7 * Math.min(1, sinA));
    }
    // 胴のしなり：ばね（約1.4Hz）で糸の引きを追う
    this.bvx += ((amount * dx - this.bx) * 81 - this.bvx * 8) * dt;
    this.bvy += ((amount * dy - this.by) * 81 - this.bvy * 8) * dt;
    this.bx += this.bvx * dt;
    this.by += this.bvy * dt;
    // 胴から曲がるパラボリックなしなり：先へ行くほど大きく曲がる
    const n = this.segs.length;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      const w = Math.pow(k, 1.6) * 2.2 * 0.105;
      const tk = this.tipK * k * k * k * 0.9;
      this.segs[i].rotation.set(this.by * w + dy * tk, -(this.bx * w + dx * tk), 0);
    }
    // ハンドルとローターは巻くと回り、ドラグが滑るとスプールが逆に回る
    this.reelHandle.rotation.x -= this.reelSpin * dt * 18;
    this.rotor.rotation.z += this.reelSpin * dt * 18 * 5.2;
    this.spool.rotation.z -= this.spoolSlip * dt * 70;
    this.updateGuideLine();
    this.tackle?.update(dt, this.lureSpeed);
    this.updateLeader();
  }

  /** 竿先からぶら下がったルアーの位置（振り子。竿を動かすと揺れる） */
  hangFrom(tip: THREE.Vector3, len: number, dt: number): THREE.Vector3 {
    if (!this.hangInit || this.hang.distanceTo(tip) > len * 3) {
      this.hang.copy(tip).y -= len;
      this.hangPrev.copy(this.hang);
      this.hangInit = true;
    }
    const h = Math.min(dt, 1 / 30);
    const v = this.hang.clone().sub(this.hangPrev).multiplyScalar(Math.exp(-h * 1.5));
    this.hangPrev.copy(this.hang);
    this.hang.add(v).y -= 9.8 * h * h;
    const d = this.hang.clone().sub(tip);
    this.hang.copy(tip).addScaledVector(d.normalize(), len);
    return this.hang;
  }

  private updateGuideLine(): void {
    this.root.updateWorldMatrix(true, true);
    const p = this.guidePos;
    const v = new THREE.Vector3();
    this.spoolFront.getWorldPosition(v);
    this.root.worldToLocal(v);
    p.set([v.x, v.y, v.z], 0);
    for (let i = 0; i < this.guides.length; i++) {
      this.guides[i].getWorldPosition(v);
      this.root.worldToLocal(v);
      p.set([v.x, v.y, v.z], (i + 1) * 3);
    }
    writeSegments(this.guideLine.geometry, 'instanceStart', p);
  }

  /**
   * 竿先から終点まで、長さ rest (m) の糸を物理で動かして描く。
   * floor = 糸が沈める下限の高さ（湖底・地面）
   */
  updateLine(dt: number, from: THREE.Vector3, to: THREE.Vector3, rest: number, floor?: (x: number, z: number) => number): void {
    this.sim.step(dt, from.x, from.y, from.z, to.x, to.y, to.z, rest, floor);
    this.hasLine = true;
    const p = this.linePos;
    const c = this.lineCol;
    const sp = this.sim.pos;
    const n = this.sim.n;
    this.vibeT += dt * 55;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const k = i * 3;
      // 張り詰めた空中の糸がビリビリ震える
      const y = sp[k + 1];
      const vib = y > 0 ? Math.sin(t * Math.PI) * Math.sin(this.vibeT + t * 9) * this.lineVibe : 0;
      p[k] = sp[k];
      p[k + 1] = y + vib;
      p[k + 2] = sp[k + 2];
      if (y >= 0) c.set([0.92, 0.92, 0.88], k);
      else {
        // 深いほど水に溶けて見えにくい
        const v = 0.55 * Math.exp(y * 0.6) + 0.12;
        c.set([v * 0.85, v, v * 0.95], k);
      }
    }
    writeSegments(this.line.geometry, 'instanceStart', p);
    writeSegments(this.line.geometry, 'instanceColorStart', c);
  }

  /** 糸が水面に入る点 */
  lineEntry(): [number, number] | null {
    return this.sim.entry();
  }

  /** 次に描く糸を両端の直線から始め直す */
  resetLine(): void {
    this.hasLine = false;
    this.sim = new LineSim(48);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
    this.guideLine.visible = v;
    this.line.visible = v;
    if (!v) {
      this.lure.visible = false;
      this.bobber.visible = false;
    }
  }
}
