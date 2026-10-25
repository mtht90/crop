import * as THREE from 'three';

const SEGMENTS = 10;

/** 一人称の竿（ビューモデル）と道糸・ルアー・ウキ */
export class RodView {
  readonly root = new THREE.Group();
  private segs: THREE.Object3D[] = [];
  private tip = new THREE.Object3D();
  private reelHandle: THREE.Group;
  readonly line: THREE.Line;
  private linePos: Float32Array;
  readonly lure: THREE.Mesh;
  readonly bobber: THREE.Group;
  private lureMat: THREE.MeshStandardMaterial;

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
  /** 竿の角度 0 = 寝かせる .. 1 = 立てる */
  lift = 0.55;
  /** 魚に竿ごと引っ張られる量 0..1 */
  pull = 0;
  /** 張った糸の震え (m) */
  lineVibe = 0;
  private vibeT = 0;

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    camera.add(this.root);
    this.root.position.set(0.3, -0.36, -0.42);
    const blankMat = new THREE.MeshStandardMaterial({ color: 0x1e2a36, roughness: 0.35, metalness: 0.4 });
    const guideMat = new THREE.MeshStandardMaterial({ color: 0xc0c4c8, roughness: 0.2, metalness: 0.9 });
    // グリップ
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.32, 10), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }));
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.08;
    this.root.add(grip);
    // リール
    const reel = new THREE.Group();
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.8, roughness: 0.3 }));
    spool.rotation.x = Math.PI / 2;
    reel.add(spool);
    this.reelHandle = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.05), guideMat);
    arm.position.z = 0.025;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    knob.position.set(0.012, 0, 0.05);
    knob.rotation.z = Math.PI / 2;
    this.reelHandle.add(arm, knob);
    this.reelHandle.position.set(0.035, 0, 0);
    this.reelHandle.rotation.y = Math.PI / 2;
    reel.add(this.reelHandle);
    reel.position.set(0, -0.055, 0.02);
    this.root.add(reel);

    // ブランク：根元から先端へ節をつなぎ、各節を回してしならせる
    let parent: THREE.Object3D = this.root;
    const segLen = 0.19;
    for (let i = 0; i < SEGMENTS; i++) {
      const seg = new THREE.Object3D();
      seg.position.z = i === 0 ? -0.06 : -segLen;
      const r0 = 0.011 * (1 - i / SEGMENTS) + 0.0025;
      const r1 = 0.011 * (1 - (i + 1) / SEGMENTS) + 0.0025;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segLen, 6), blankMat);
      m.rotation.x = Math.PI / 2;
      m.position.z = -segLen / 2;
      seg.add(m);
      if (i % 2 === 1) {
        const g = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0015, 4, 8), guideMat);
        g.position.set(0, -0.012, -segLen * 0.5);
        seg.add(g);
      }
      parent.add(seg);
      this.segs.push(seg);
      parent = seg;
    }
    this.tip.position.z = -segLen;
    parent.add(this.tip);

    this.linePos = new Float32Array(48 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.8 }));
    this.line.frustumCulled = false;
    scene.add(this.line);

    this.lureMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.3 });
    this.lure = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.06, 4, 8).rotateX(Math.PI / 2), this.lureMat);
    scene.add(this.lure);

    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe03020, roughness: 0.4, emissive: 0x401008 }));
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12), new THREE.MeshStandardMaterial({ color: 0xffd040, emissive: 0x403000 }));
    stick.position.y = 0.08;
    this.bobber.add(top, bottom, stick);
    this.bobber.visible = false;
    scene.add(this.bobber);
  }

  setLureColor(hex: string): void {
    this.lureMat.color.set(hex);
  }

  tipWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.tip.getWorldPosition(out);
  }

  update(dt: number): void {
    this.shakeT += dt * 40;
    this.shake = Math.max(0, this.shake - dt * 3);
    const jitter = Math.sin(this.shakeT) * this.shake * 0.04;
    // 根元を立てて、先へ行くほど曲げる
    // 強く引かれるほど竿が前に倒され、手元ごと持っていかれる
    const baseTilt = -0.05 + this.lift * 1.1 + this.swing - this.pull * 0.2;
    this.root.position.set(0.3 + this.side * 0.04, -0.36 - this.pull * 0.05 + jitter * 0.3, -0.42 - this.pull * 0.09);
    this.root.rotation.set(0, 0, 0);
    this.root.rotation.x = baseTilt;
    this.root.rotation.y = -this.side * 0.45;
    this.root.rotation.z = -this.side * 0.25;
    for (let i = 0; i < this.segs.length; i++) {
      const k = (i + 1) / this.segs.length;
      this.segs[i].rotation.x = -(this.bend * 0.16 + jitter) * k * k * 1.4;
      this.segs[i].rotation.y = this.side * this.bend * 0.05 * k;
    }
    this.reelHandle.rotation.x += this.reelSpin * dt * 18;
  }

  /** 竿先から終点まで糸を描く。sag = たるみ量 (m)、entry = 水面への入水点（無ければ空中のみ） */
  drawLine(from: THREE.Vector3, to: THREE.Vector3, sag: number, entry: THREE.Vector3 | null): void {
    const p = this.linePos;
    const n = p.length / 3;
    const airEnd = entry ?? to;
    const airN = entry ? n - 6 : n;
    this.vibeT += 0.9;
    for (let i = 0; i < airN; i++) {
      const t = i / (airN - 1);
      const x = from.x + (airEnd.x - from.x) * t;
      const z = from.z + (airEnd.z - from.z) * t;
      let y = from.y + (airEnd.y - from.y) * t;
      y -= Math.sin(t * Math.PI) * sag;
      // 張り詰めた糸がビリビリ震える
      y += Math.sin(t * Math.PI) * Math.sin(this.vibeT + t * 9) * this.lineVibe;
      p.set([x, y, z], i * 3);
    }
    if (entry) {
      for (let i = 0; i < 6; i++) {
        const t = (i + 1) / 6;
        p.set([entry.x + (to.x - entry.x) * t, entry.y + (to.y - entry.y) * t, entry.z + (to.z - entry.z) * t], (airN + i) * 3);
      }
    }
    this.line.geometry.getAttribute('position').needsUpdate = true;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
    this.line.visible = v;
    if (!v) {
      this.lure.visible = false;
      this.bobber.visible = false;
    }
  }
}
