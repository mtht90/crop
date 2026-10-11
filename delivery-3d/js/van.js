// 配送用の軽バン：見た目・荷台・運転の挙動
import * as THREE from 'three';
import { A, box, textTexture, JP_FONT, Batch } from './assets.js';
import { resolveCircle } from './town.js';

// ローカル座標：+z が前、+x が車の左側（助手席・歩道側）、右ハンドル
const L = 3.4, WD = 1.48, WB = 2.4, WHEEL_R = 0.28;
const DEPTH_Z = [-1.33, -0.68, -0.03];  // 荷台の奥行き方向の位置（0 = 後ろ）
const SIDE_X = { L: 0.4, R: -0.4 };
const LEVEL_Y = { floor: 0.52, shelf: 1.15 };

export class Van {
  constructor(scene) {
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // 車体の傾き用
    this.group.add(this.body);
    scene.add(this.group);
    this.x = 0; this.z = 0; this.heading = 0; this.speed = 0; this.steer = 0; this.yawRate = 0;
    this.accel = 0; this.lastImpact = 0;
    this.hatchOpen = false; this.slideOpen = false; this.hatchT = 0; this.slideT = 0;
    this.blink = 0; this.signal = 0; this.hazard = false; this.lightsOn = false; this.brakeOn = false;
    this.wheelSpin = 0;
    this.thr = 0; this.brk = 0; this.kbSteer = 0; this.gear = 'P'; this.gearIdx = 0; this.rpm = 0; this.engineOn = false;
    this.parkingBrake = true; this.cruise = 0; this.stoppedT = 0; this.signalHeading = 0; this.pbWarn = 0;
    this.build();
    this.slots = [];
    for (const side of ['L', 'R']) for (let d = 0; d < 3; d++) for (const level of ['floor', 'shelf']) {
      if (side === 'L' && d === 2 && level === 'floor') continue; // 保冷ボックスの場所
      this.slots.push({ id: `${side}${d}${level[0]}`, side, depth: d, level, parcel: null });
    }
    this.cooler = { capacity: 2, items: [] };
  }

  build() {
    const m = A.mats;
    const paint = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 });
    this.paint = paint;
    const add = (mesh, parent = this.body) => { mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

    // 下半分の車体（側面形状を押し出し）
    const sh = new THREE.Shape();
    sh.moveTo(-1.7, 0.3); sh.lineTo(1.55, 0.3); sh.quadraticCurveTo(1.7, 0.3, 1.7, 0.48); sh.lineTo(1.7, 0.96);
    sh.quadraticCurveTo(1.69, 1.06, 1.6, 1.07); sh.lineTo(-1.7, 1.07); sh.lineTo(-1.7, 0.3);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: WD, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 8 });
    eg.rotateY(-Math.PI / 2); eg.translate(WD / 2, 0, 0);
    add(new THREE.Mesh(eg, paint));
    // ホイールハウスの黒い部分
    for (const z of [-1.2, 1.2]) for (const s of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20, 0, Math.PI), m.black);
      arch.position.set(s * (WD / 2 + 0.025), 0.3, z); arch.rotation.y = s * Math.PI / 2;
      this.body.add(arch);
    }
    // バンパー
    add(new THREE.Mesh(box(WD + 0.04, 0.16, 0.1), m.plastic)).position.set(0, 0.38, 1.71);
    add(new THREE.Mesh(box(WD + 0.04, 0.16, 0.1), m.plastic)).position.set(0, 0.36, -1.71);

    // 屋根
    add(new THREE.Mesh(box(WD, 0.06, 2.92), paint)).position.set(0, 1.86, -0.24);
    // 屋根の内張り
    const inner = new THREE.MeshStandardMaterial({ color: 0x6b6e70, roughness: 0.9, side: THREE.DoubleSide });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(WD - 0.08, 2.9), inner); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 1.82, -0.24); this.body.add(ceil);

    const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 1, roughness: 0.05, envMapIntensity: 1.2 });
    // フロントガラス（斜め）
    const wsLen = Math.hypot(0.4, 0.78);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(WD - 0.1, wsLen), m.glassClear);
    ws.position.set(0, 1.46, 1.42); ws.rotation.x = -Math.atan2(0.4, 0.78); this.body.add(ws);
    for (const s of [-1, 1]) {
      const p = add(new THREE.Mesh(box(0.07, wsLen, 0.07), paint)); p.position.set(s * (WD / 2 - 0.035), 1.46, 1.42); p.rotation.x = -Math.atan2(0.4, 0.78);
      // ドアの窓
      const dw = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.72), m.glassClear);
      dw.position.set(s * (WD / 2 + 0.005), 1.45, 0.92); dw.rotation.y = s * Math.PI / 2; this.body.add(dw);
      // Bピラー
      add(new THREE.Mesh(box(0.06, 0.8, 0.1), paint)).position.set(s * (WD / 2 - 0.03), 1.46, 0.38);
      // ドアミラー
      const mir = add(new THREE.Mesh(box(0.06, 0.13, 0.17), paint)); mir.position.set(s * (WD / 2 + 0.12), 1.24, 1.3);
      // ドアミラー：後ろ向きのカメラの映像を左右反転して映す
      const rt = new THREE.WebGLRenderTarget(320, 232, { samples: 0 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.repeat.x = -1; rt.texture.offset.x = 1;
      const mcam = new THREE.PerspectiveCamera(30, 320 / 232, 0.3, 320);
      mcam.position.set(s * (WD / 2 + 0.12), 1.24, 1.2);
      mcam.lookAt(new THREE.Vector3(s * (WD / 2 + 1.6), 1.0, -12));
      this.body.add(mcam);
      const mg = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.11), new THREE.MeshBasicMaterial({ map: rt.texture }));
      mg.position.set(s * (WD / 2 + 0.12), 1.24, 1.3 - 0.031); mg.rotation.y = Math.PI; this.body.add(mg);
      (this.mirrors = this.mirrors || []).push({ rt, cam: mcam });
      add(new THREE.Mesh(box(0.1, 0.025, 0.03), m.plastic)).position.set(s * (WD / 2 + 0.05), 1.2, 1.34);
    }
    // 荷室の側面（右側は固定パネル、左側はスライドドア）
    const sideMat = new THREE.MeshStandardMaterial({
      map: textTexture(1024, 384, (c, w, h) => {
        c.fillStyle = '#f4f4f2'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#2f7d4f'; c.fillRect(0, h - 90, w, 34);
        c.fillStyle = '#e0a92a'; c.fillRect(0, h - 52, w, 10);
        c.fillStyle = '#2f7d4f'; c.font = `bold 96px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('あおば運輸', w / 2, h * 0.4);
        c.font = `36px ${JP_FONT}`; c.fillStyle = '#5d6672'; c.fillText('まちの宅配便　0120-XX-XXXX', w / 2, h * 0.62);
      }), roughness: 0.35,
    });
    const rp = add(new THREE.Mesh(box(0.04, 0.8, 2.08), paint)); rp.position.set(-(WD / 2 - 0.02), 1.46, -0.64);
    const rd = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.75), sideMat); rd.position.set(-(WD / 2 + 0.005), 1.46, -0.64); rd.rotation.y = -Math.PI / 2; this.body.add(rd);
    // 右側の下側にも帯（押し出しの車体に貼る）
    // 左：後ろの固定部分とスライドドア
    const lp = add(new THREE.Mesh(box(0.04, 0.8, 1.2), paint)); lp.position.set(WD / 2 - 0.02, 1.46, -1.08);
    const ld = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.75), sideMat); ld.position.set(WD / 2 + 0.005, 1.46, -1.08); ld.rotation.y = Math.PI / 2; this.body.add(ld);
    this.slide = new THREE.Group();
    const sd = add(new THREE.Mesh(box(0.04, 1.5, 0.86), paint), this.slide); sd.position.set(0, 1.1, 0);
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), m.glassClear); sw.position.set(0.025, 1.5, 0.05); sw.rotation.y = Math.PI / 2; this.slide.add(sw);
    add(new THREE.Mesh(box(0.03, 0.04, 0.2), m.plastic), this.slide).position.set(0.03, 1.0, -0.3);
    this.slide.position.set(WD / 2 - 0.0, 0, -0.06);
    this.body.add(this.slide);

    // リアハッチ（上ヒンジ）
    this.hatch = new THREE.Group();
    this.hatch.position.set(0, 1.86, -1.7);
    const hp = add(new THREE.Mesh(box(WD - 0.02, 0.78, 0.04), paint), this.hatch); hp.position.set(0, -1.15, 0);
    const hg = new THREE.Mesh(new THREE.PlaneGeometry(WD - 0.25, 0.6), m.glassClear); hg.position.set(0, -0.42, -0.025); hg.rotation.y = Math.PI; this.hatch.add(hg);
    for (const s of [-1, 1]) add(new THREE.Mesh(box(0.1, 0.78, 0.04), paint), this.hatch).position.set(s * (WD / 2 - 0.06), -0.42, 0);
    add(new THREE.Mesh(box(WD - 0.02, 0.08, 0.04), paint), this.hatch).position.set(0, -0.04, 0);
    this.body.add(this.hatch);
    // テールランプ
    this.brakeMat = new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff2010, emissiveIntensity: 0.15 });
    this.blinkMatL = new THREE.MeshStandardMaterial({ color: 0x5a3a08, emissive: 0xffa020, emissiveIntensity: 0 });
    this.blinkMatR = this.blinkMatL.clone();
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(box(0.12, 0.28, 0.03), this.brakeMat); t.position.set(s * (WD / 2 - 0.08), 0.85, -1.74); this.body.add(t);
      const bm = s > 0 ? this.blinkMatL : this.blinkMatR; // +x が車の左
      const b = new THREE.Mesh(box(0.12, 0.1, 0.03), bm); b.position.set(s * (WD / 2 - 0.08), 0.64, -1.74); this.body.add(b);
      const fb = new THREE.Mesh(box(0.14, 0.06, 0.03), bm); fb.position.set(s * (WD / 2 - 0.12), 0.62, 1.715); this.body.add(fb);
    }
    // ヘッドライト
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xfff4e0, emissiveIntensity: 0.05, roughness: 0.1 });
    for (const s of [-1, 1]) { const h = new THREE.Mesh(box(0.3, 0.16, 0.03), this.headMat); h.position.set(s * (WD / 2 - 0.22), 0.82, 1.715); this.body.add(h); }
    add(new THREE.Mesh(box(0.7, 0.12, 0.03), m.plastic)).position.set(0, 0.7, 1.715); // グリル
    // ナンバープレート（事業用の軽自動車は黒地に黄色）
    const plate = new THREE.MeshStandardMaterial({
      map: textTexture(330, 165, (c, w, h) => {
        c.fillStyle = '#16181a'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#d8b440'; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10);
        c.fillStyle = '#e5c247'; c.textAlign = 'center';
        c.font = `bold 34px ${JP_FONT}`; c.fillText('あおば 480', w / 2, 52);
        c.font = `bold 30px ${JP_FONT}`; c.fillText('あ', 40, 128);
        c.font = `bold 78px ${JP_FONT}`; c.fillText('12-34', w / 2 + 22, 140);
      }), roughness: 0.4,
    });
    for (const [z, y, r] of [[1.725, 0.52, 0], [-1.725, 0.5, Math.PI]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.165), plate); p.position.set(0, y, z); p.rotation.y = r; this.body.add(p);
    }

    // タイヤ
    this.wheels = [];
    const tireG = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.17, 24); tireG.rotateZ(Math.PI / 2);
    const rimG = new THREE.CylinderGeometry(0.17, 0.17, 0.18, 16); rimG.rotateZ(Math.PI / 2);
    const hubG = new THREE.BoxGeometry(0.19, 0.05, 0.3);
    for (const z of [-WB / 2, WB / 2]) for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * (WD / 2 - 0.1), WHEEL_R, z);
      const spin = new THREE.Group();
      spin.add(add(new THREE.Mesh(tireG, m.rubber), spin), add(new THREE.Mesh(rimG, m.chrome), spin), add(new THREE.Mesh(hubG, m.frameDark), spin));
      pivot.add(spin); this.group.add(pivot);
      this.wheels.push({ pivot, spin, front: z > 0 });
    }

    // ---------------- 車内 ----------------
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.85 });
    const floor = new THREE.Mesh(box(WD - 0.1, 0.04, 2.05), new THREE.MeshStandardMaterial({ color: 0x4a4c4e, roughness: 0.6, metalness: 0.3 }));
    floor.position.set(0, 0.48, -0.66); floor.receiveShadow = true; this.body.add(floor);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.78), dark); w.position.set(s * (WD / 2 - 0.05), 0.88, -0.66); w.rotation.y = -s * Math.PI / 2; this.body.add(w);
      // 棚板と支柱
      const sb = new THREE.Mesh(box(0.56, 0.035, 1.95), m.frame); sb.position.set(s * 0.42, 1.1, -0.67); sb.castShadow = true; sb.receiveShadow = true; this.body.add(sb);
      for (const z of [-1.62, -1.0, -0.35, 0.28]) { const p = new THREE.Mesh(box(0.03, 0.62, 0.03), m.frame); p.position.set(s * 0.69, 0.8, z); this.body.add(p); }
    }
    // 保冷ボックス（左・前寄り・床）
    const cooler = new THREE.Group();
    const cb = new THREE.Mesh(box(0.56, 0.5, 0.58), new THREE.MeshStandardMaterial({ color: 0x3f7fa8, roughness: 0.55 })); cb.position.y = 0.25; cb.castShadow = true;
    const cl = new THREE.Mesh(box(0.58, 0.05, 0.6), new THREE.MeshStandardMaterial({ color: 0xe8eef0, roughness: 0.5 })); cl.position.y = 0.52;
    cooler.add(cb, cl); cooler.position.set(SIDE_X.L, 0.5, DEPTH_Z[2]);
    this.body.add(cooler); this.coolerMesh = cooler;
    // 運転席まわり
    const seatMat = A.mats.fabric;
    for (const s of [-1, 1]) {
      const seat = new THREE.Mesh(box(0.5, 0.14, 0.5), seatMat); seat.position.set(s * 0.36, 0.86, 0.75); this.body.add(seat);
      const back = new THREE.Mesh(box(0.5, 0.65, 0.12), seatMat); back.position.set(s * 0.36, 1.2, 0.48); back.rotation.x = -0.12; this.body.add(back);
      const rest = new THREE.Mesh(box(0.28, 0.18, 0.1), seatMat); rest.position.set(s * 0.36, 1.62, 0.44); this.body.add(rest);
    }
    const dash = new THREE.Mesh(box(WD - 0.06, 0.22, 0.32), A.mats.plastic); dash.position.set(0, 1.04, 1.42); this.body.add(dash);
    const dashTop = new THREE.Mesh(box(WD - 0.06, 0.04, 0.42), A.mats.plastic); dashTop.position.set(0, 1.16, 1.36); this.body.add(dashTop);
    // ハンドル（右ハンドル）
    this.wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 32), A.mats.plastic);
    const spoke = new THREE.Mesh(box(0.34, 0.03, 0.02), A.mats.plastic);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16).rotateX(Math.PI / 2), A.mats.frameDark);
    this.wheel.add(rim, spoke, hub);
    this.wheel.position.set(-0.36, 1.12, 1.2); this.wheel.rotation.x = -0.45;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), A.mats.plastic); col.position.set(-0.36, 1.05, 1.33); col.rotation.x = Math.PI / 2 - 0.45;
    this.body.add(this.wheel, col);
    // メーター
    this.meterCanvas = document.createElement('canvas'); this.meterCanvas.width = 512; this.meterCanvas.height = 256;
    this.meterTex = new THREE.CanvasTexture(this.meterCanvas); this.meterTex.colorSpace = THREE.SRGBColorSpace;
    const meter = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: this.meterTex }));
    // ダッシュボード中央のナビ画面
    this.navCanvas = document.createElement('canvas'); this.navCanvas.width = 320; this.navCanvas.height = 200;
    this.navTex = new THREE.CanvasTexture(this.navCanvas); this.navTex.colorSpace = THREE.SRGBColorSpace;
    const navBezel = new THREE.Mesh(box(0.25, 0.165, 0.03), A.mats.plastic); navBezel.position.set(0.12, 1.25, 1.39); navBezel.rotation.x = -0.32; this.body.add(navBezel);
    const nav = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.1375), new THREE.MeshBasicMaterial({ map: this.navTex }));
    nav.position.set(0.12, 1.25, 1.372); nav.rotation.set(0.32, Math.PI, 0); this.body.add(nav);
    meter.position.set(-0.36, 1.2, 1.31); meter.rotation.set(0.5, Math.PI, 0); this.body.add(meter);
    // ルームミラー
    const rm = new THREE.Mesh(box(0.2, 0.055, 0.025), A.mats.plastic); rm.position.set(0.05, 1.76, 1.36); this.body.add(rm);
    const rmg = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.045), mirrorMat); rmg.position.set(0.05, 1.76, 1.346); rmg.rotation.y = Math.PI; this.body.add(rmg);
    // 運転席側のヘッドライト（暗いとき）
    this.headLights = [];
    for (const s of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff1dc, 0, 40, 0.5, 0.5, 1.5);
      l.position.set(s * 0.5, 0.8, 1.8); l.target.position.set(s * 0.6, 0, 12);
      this.body.add(l, l.target); this.headLights.push(l);
    }
  }

  // ---------------- 荷台の位置 ----------------
  slotLocal(slot) { return new THREE.Vector3(SIDE_X[slot.side], LEVEL_Y[slot.level], DEPTH_Z[slot.depth]); }
  slotWorld(slot) { return this.body.localToWorld(this.slotLocal(slot)); }
  coolerWorld(i = 0) { return this.body.localToWorld(new THREE.Vector3(SIDE_X.L + (i % 2 ? 0.1 : -0.1), 0.6 + Math.floor(i / 2) * 0.22, DEPTH_Z[2] + (i % 2 ? 0.12 : -0.12))); }
  canHold(slot, parcel) {
    if (slot.parcel) return false;
    if (slot.level === 'shelf' && parcel.size > 100) return false;
    return true;
  }
  // プレイヤーの位置から見て、荷台のどこに手が届くか（追加の作業時間：分）
  access(px, pz) {
    const loc = this.toLocal(px, pz);
    const res = { rear: false, side: false };
    if (this.hatchT > 0.8 && loc.z < -1.6 && loc.z > -3.2 && Math.abs(loc.x) < 1.1) res.rear = true;
    if (this.slideT > 0.8 && loc.x > 0.6 && loc.x < 2.2 && loc.z > -0.9 && loc.z < 0.8) res.side = true;
    return res;
  }
  reachCost(slotOrCooler, acc, gloves) {
    const depth = slotOrCooler === 'cooler' ? 2 : slotOrCooler.depth;
    const side = slotOrCooler === 'cooler' ? 'L' : slotOrCooler.side;
    const k = gloves ? 0.5 : 1;
    let best = Infinity;
    if (acc.rear) best = Math.min(best, [0, 0.5, 1.5][depth] * k);
    if (acc.side) best = Math.min(best, ([1.5, 0.3, 0][depth] + (side === 'R' ? 0.5 : 0)) * k);
    return best;
  }
  toLocal(x, z) {
    const dx = x - this.x, dz = z - this.z, c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }
  worldPoint(lx, lz) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }
  get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  get kmh() { return Math.abs(this.speed) * 3.6; }

  setPose(x, z, h) { this.x = x; this.z = z; this.heading = h; this.speed = 0; this.steer = 0; this.kbSteer = 0; this.sync(0); }

  // 運転席・外からのカメラ位置
  cabEye() { return this.body.localToWorld(new THREE.Vector3(-0.36, 1.5, 0.72)); }
  driverDoor() { return this.worldPoint(-1.25, 0.9); }
  passengerSide() { return this.worldPoint(1.3, -0.2); }
  rearPoint() { return this.worldPoint(0, -2.4); }

  // 当たり判定用の円（プレイヤー・他の車との判定にも使う）
  circles() {
    const f = this.forward;
    return [-1.15, 0, 1.15].map(o => ({ x: this.x + f.x * o, z: this.z + f.z * o, r: 0.76 }));
  }

  // inp: { throttle 0..1, brake 0..1, steer -1..1, mouseSteer: null または -1..1 }
  update(dt, inp, otherCars = []) {
    let v = this.speed;
    this.thr += ((inp.throttle || 0) - this.thr) * Math.min(1, dt * 7);
    this.brk += ((inp.brake || 0) - this.brk) * Math.min(1, dt * 9);
    // ---- クルーズコントロール ----
    if (this.cruise) {
      if (inp.brake > 0 || this.gear !== 'D' || this.parkingBrake) this.cruise = 0;
      else this.thr = Math.max(this.thr, THREE.MathUtils.clamp((this.cruise - v) * 0.7, 0, 1));
    }
    // ---- シフト（AT）：止まった状態でブレーキを押し直すと R、アクセルで D ----
    if (!inp.brake) this.holdStop = false;
    if (inp.brake > 0 && Math.abs(v) > 0.4) this.holdStop = true;
    if (Math.abs(v) < 0.25) {
      this.stoppedT += dt;
      if (this.gear === 'D' && inp.brake > 0 && !inp.throttle && !this.holdStop && this.stoppedT > 0.2) this.gear = 'R';
      else if (this.gear === 'R' && inp.throttle > 0 && !inp.brake) this.gear = 'D';
      else if ((this.gear === 'P' || this.gear === 'N') && (inp.throttle > 0 || inp.brake > 0) && this.engineOn) this.gear = inp.throttle > 0 ? 'D' : 'R';
    } else this.stoppedT = 0;
    let drive = 0, braking = 0;
    if (this.gear === 'D') { drive = this.thr; braking = this.brk; }
    else if (this.gear === 'R') { drive = this.brk; braking = this.thr; }
    else braking = Math.max(this.thr, this.brk) * 0;
    if (this.parkingBrake && drive > 0.2) this.pbWarn = 1;
    // ---- エンジンと変速 ----
    const RATIOS = [3.55, 2.05, 1.38, 1.0], FINAL = 4.7, REV = 3.2;
    const wheelRpm = Math.abs(v) / (2 * Math.PI * WHEEL_R) * 60;
    if (this.gear === 'D') {
      const r = wheelRpm * RATIOS[this.gearIdx] * FINAL;
      if (r > 3500 + drive * 1300 && this.gearIdx < 3) { this.gearIdx++; this.shiftT = 0.25; }
      else if (r < 1350 && this.gearIdx > 0) this.gearIdx--;
    } else this.gearIdx = 0;
    const ratio = this.gear === 'R' ? REV : RATIOS[this.gearIdx];
    let rpm = wheelRpm * ratio * FINAL;
    // トルクコンバーターのすべり（低速で回転が上がる）
    rpm = Math.max(rpm, 780 + drive * 2400 * (1 - Math.min(1, Math.abs(v) / 7)));
    if (!this.engineOn) rpm = 0;
    if (this.gear === 'P' || this.gear === 'N') rpm = this.engineOn ? 780 + this.thr * 4500 : 0;
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 7);
    this.shiftT = Math.max(0, (this.shiftT || 0) - dt);
    const torque = Math.max(35, 98 * (1 - Math.pow((this.rpm - 3600) / 4300, 2)));
    let a = 0;
    if (this.engineOn && (this.gear === 'D' || this.gear === 'R') && this.rpm < 6300 && !this.parkingBrake) {
      a += (this.gear === 'R' ? -1 : 1) * torque * ratio * FINAL / WHEEL_R / 1250 * drive * (this.shiftT > 0 ? 0.45 : 1);
    }
    // エンジンブレーキ
    if (this.gear === 'D' && drive < 0.05 && v > 0.8) a -= 0.12 + this.rpm / 6000 * 0.4;
    // ブレーキ
    const bdec = 8.2 * braking;
    this.brakeOn = braking > 0.05 || (this.gear !== 'P' && this.gear !== 'N' && Math.abs(v) < 0.3 && inp.brake > 0);
    // 抵抗
    const res = 0.12 + 0.0011 * v * v;
    let nv = v + a * dt;
    const stop = (bdec + res) * dt;
    if (Math.abs(nv) <= stop) nv = (Math.abs(a) > bdec + res) ? nv : 0;
    else nv -= Math.sign(nv) * stop;
    if (this.parkingBrake) { if (Math.abs(nv) < 1.2) nv = 0; else nv -= Math.sign(nv) * 5 * dt; }
    if (this.gear === 'P') nv = 0;
    this.speed = nv;
    this.accel = (nv - v) / Math.max(dt, 1e-4);

    // ---- ハンドル（速いほど切れ角を小さく、ゆっくり）----
    const sp = Math.abs(nv);
    const maxAng = 0.62 / (1 + sp / 11);
    let targetAng;
    if (inp.mouseSteer != null) {
      targetAng = inp.mouseSteer * 0.62;
      this.kbSteer = inp.mouseSteer;
    } else {
      const want = inp.steer || 0;
      const rate = (Math.abs(want) > Math.abs(this.kbSteer) && Math.sign(want) === Math.sign(this.kbSteer || want) ? 1.9 / (1 + sp / 14) : 2.8) * dt;
      this.kbSteer += THREE.MathUtils.clamp(want - this.kbSteer, -rate, rate);
      targetAng = this.kbSteer * maxAng;
    }
    this.steer += THREE.MathUtils.clamp(targetAng - this.steer, -3.2 * dt, 3.2 * dt);
    this.yawRate = nv / WB * Math.tan(this.steer) / (1 + 0.0011 * nv * nv);
    this.heading += this.yawRate * dt;

    const f = this.forward;
    const ox = this.x, oz = this.z;
    this.x += f.x * nv * dt; this.z += f.z * nv * dt;

    // ---- 衝突 ----
    let impact = 0;
    const offs = [-1.15, 0, 1.15];
    for (let it = 0; it < 2; it++) {
      for (const o of offs) {
        const p = { x: this.x + f.x * o, z: this.z + f.z * o };
        const hit = resolveCircle(p, 0.76);
        if (hit > 0) { this.x += p.x - (this.x + f.x * o); this.z += p.z - (this.z + f.z * o); impact = Math.max(impact, Math.abs(this.speed)); }
      }
      for (const car of otherCars) {
        for (const o of offs) {
          for (const c of car.circles()) {
            const px = this.x + f.x * o, pz = this.z + f.z * o;
            const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), R = 0.76 + c.r;
            if (d < R && d > 0.001) { const k = (R - d) / d; this.x += dx * k; this.z += dz * k; impact = Math.max(impact, Math.abs(this.speed - (car.speed || 0)), 1.6); car.bumped = true; }
          }
        }
      }
    }
    if (impact > 0) {
      const moved = Math.hypot(this.x - ox, this.z - oz);
      if (moved < Math.abs(nv) * dt * 0.6) this.speed *= -0.15;
      this.lastImpact = impact;
    } else this.lastImpact = 0;

    // ---- ウインカー（曲がり終えたら自動で戻る）----
    this.blink += dt;
    if (this.signal) {
      const turned = Math.abs(Math.atan2(Math.sin(this.heading - this.signalHeading), Math.cos(this.heading - this.signalHeading)));
      if (turned > 0.9) this.signalTurned = true;
      if (this.signalTurned && Math.abs(this.kbSteer) < 0.12) { this.signal = 0; this.signalTurned = false; }
    }
    const was = this.blinkOn;
    this.blinkOn = (this.signal || this.hazard) && (this.blink % 0.76) < 0.38;
    this.blinkTick = was !== this.blinkOn;
    this.sync(dt);
  }

  setSignal(dir) {
    this.signal = this.signal === dir ? 0 : dir;
    this.signalHeading = this.heading; this.signalTurned = false; this.blink = 0;
  }
  get gearLabel() { return this.gear === 'D' ? `D${this.gearIdx + 1}` : this.gear; }

  sync(dt) {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    // 車体の傾き（加減速と旋回）
    const pitch = THREE.MathUtils.clamp(-this.accel * 0.006, -0.04, 0.04);
    const roll = THREE.MathUtils.clamp(this.speed * this.yawRate * 0.012, -0.05, 0.05);
    this.body.rotation.x += (pitch - this.body.rotation.x) * Math.min(1, dt * 6);
    this.body.rotation.z += (roll - this.body.rotation.z) * Math.min(1, dt * 6);
    this.wheelSpin += this.speed * dt / WHEEL_R;
    for (const w of this.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      w.pivot.rotation.y = w.front ? this.steer : 0;
    }
    this.wheel.rotation.z = -this.steer * 12;
    // ドア
    this.hatchT += ((this.hatchOpen ? 1 : 0) - this.hatchT) * Math.min(1, dt * 4);
    this.slideT += ((this.slideOpen ? 1 : 0) - this.slideT) * Math.min(1, dt * 4);
    this.hatch.rotation.x = this.hatchT * 1.45;
    this.slide.position.x = WD / 2 + 0.05 * Math.min(1, this.slideT * 3);
    this.slide.position.z = -0.06 - this.slideT * 0.82;
    // 灯火
    this.brakeMat.emissiveIntensity = this.brakeOn ? 2.2 : (this.lightsOn ? 0.6 : 0.1);
    this.headMat.emissiveIntensity = this.lightsOn ? 2.5 : 0.05;
    for (const l of this.headLights) l.intensity = this.lightsOn ? 35 : 0;
    this.blinkMatL.emissiveIntensity = this.blinkOn && (this.signal === 1 || this.hazard) ? 2.5 : 0;
    this.blinkMatR.emissiveIntensity = this.blinkOn && (this.signal === -1 || this.hazard) ? 2.5 : 0;
  }

  // メーター（速度計・回転計・シフト位置）
  drawMeter() {
    const c = this.meterCanvas.getContext('2d'), W = 512, H = 256;
    c.fillStyle = '#07090b'; c.fillRect(0, 0, W, H);
    const dial = (cx, val, max, label, ticks, warn) => {
      const R = 96, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      c.lineWidth = 3; c.strokeStyle = '#2a3036'; c.beginPath(); c.arc(cx, 132, R, a0, a1); c.stroke();
      for (let i = 0; i <= ticks; i++) {
        const t = i / ticks, ang = a0 + (a1 - a0) * t;
        c.strokeStyle = warn && t > warn ? '#e5534b' : '#c9d1d8'; c.lineWidth = i % 2 ? 2 : 3;
        c.beginPath(); c.moveTo(cx + Math.cos(ang) * (R - 4), 132 + Math.sin(ang) * (R - 4)); c.lineTo(cx + Math.cos(ang) * (R - (i % 2 ? 12 : 18)), 132 + Math.sin(ang) * (R - (i % 2 ? 12 : 18))); c.stroke();
      }
      const ang = a0 + (a1 - a0) * Math.min(1, val / max);
      c.strokeStyle = '#f2a93b'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, 132); c.lineTo(cx + Math.cos(ang) * (R - 10), 132 + Math.sin(ang) * (R - 10)); c.stroke();
      c.fillStyle = '#1b2025'; c.beginPath(); c.arc(cx, 132, 12, 0, 7); c.fill();
      c.fillStyle = '#8a949c'; c.font = '600 15px sans-serif'; c.textAlign = 'center'; c.fillText(label, cx, 196);
    };
    dial(120, this.kmh, 140, 'km/h', 14);
    dial(392, this.rpm, 7000, '×1000 r/min', 14, 0.86);
    c.fillStyle = '#eef1f3'; c.font = '700 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(Math.round(this.kmh)), 120, 150);
    c.fillStyle = '#f2a93b'; c.font = '700 54px sans-serif'; c.fillText(this.gearLabel, 256, 120);
    c.font = '600 16px sans-serif'; c.fillStyle = '#8a949c';
    c.fillText(['P', 'R', 'N', 'D'].map(g => g === this.gear ? `[${g}]` : g).join(' '), 256, 170);
    c.textBaseline = 'alphabetic';
    if (this.blinkOn) { c.fillStyle = '#4fdc7f'; c.font = '700 30px sans-serif'; if (this.signal > 0 || this.hazard) c.fillText('◀', 210, 40); if (this.signal < 0 || this.hazard) c.fillText('▶', 302, 40); }
    if (this.parkingBrake) { c.fillStyle = '#e5534b'; c.font = '700 22px sans-serif'; c.fillText('(P)', 256, 230); }
    if (this.lightsOn) { c.fillStyle = '#5aa9e6'; c.font = '700 18px sans-serif'; c.fillText('ライト', 256, 210); }
    this.meterTex.needsUpdate = true;
  }

  renderMirrors(renderer, scene) {
    if (!this.mirrors) return;
    const prev = renderer.getRenderTarget();
    for (const m of this.mirrors) {
      m.cam.updateMatrixWorld(true);
      renderer.setRenderTarget(m.rt);
      renderer.render(scene, m.cam);
    }
    renderer.setRenderTarget(prev);
  }
}

// ---------------- 他の車（見た目だけの簡易な車） ----------------
export function buildCar(color, kind = 'sedan') {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 });
  const m = A.mats;
  const len = kind === 'kei' ? 3.4 : kind === 'truck' ? 4.7 : 4.4, wd = kind === 'kei' ? 1.47 : 1.72;
  const add = (mesh) => { mesh.castShadow = true; g.add(mesh); return mesh; };
  if (kind === 'truck') {
    add(new THREE.Mesh(box(wd, 1.3, 1.5), paint)).position.set(0, 1.25, len / 2 - 0.75);
    add(new THREE.Mesh(box(wd + 0.1, 2.0, len - 1.6), new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.5 }))).position.set(0, 1.55, -0.8);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(wd - 0.15, 0.6), m.glass); ws.position.set(0, 1.55, len / 2 + 0.005); g.add(ws);
  } else {
    const sh = new THREE.Shape();
    const h1 = kind === 'kei' ? 0.95 : 0.85;
    sh.moveTo(-len / 2, 0.3); sh.lineTo(len / 2, 0.3); sh.lineTo(len / 2, h1 - 0.1); sh.lineTo(len / 2 - 0.25, h1);
    sh.lineTo(-len / 2, h1); sh.lineTo(-len / 2, 0.3);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: wd, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    eg.rotateY(-Math.PI / 2); eg.translate(wd / 2, 0, 0);
    add(new THREE.Mesh(eg, paint));
    const cabLen = kind === 'kei' ? len - 0.9 : len * 0.5, cz = kind === 'kei' ? -0.3 : -0.2;
    const top = kind === 'kei' ? 1.7 : 1.42;
    add(new THREE.Mesh(box(wd - 0.1, 0.05, cabLen - 0.4), paint)).position.set(0, top, cz);
    const glass = new THREE.Mesh(box(wd - 0.12, top - h1, cabLen - 0.2), m.glass); glass.position.set(0, (top + h1) / 2, cz); g.add(glass);
  }
  const tireG = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16); tireG.rotateZ(Math.PI / 2);
  for (const z of [-len / 2 + 0.75, len / 2 - 0.75]) for (const s of [-1, 1]) { const t = new THREE.Mesh(tireG, m.rubber); t.position.set(s * (wd / 2 - 0.08), 0.3, z); g.add(t); }
  const tail = new THREE.MeshStandardMaterial({ color: 0x500, emissive: 0xff2010, emissiveIntensity: 0.3 });
  for (const s of [-1, 1]) { const t = new THREE.Mesh(box(0.25, 0.1, 0.03), tail); t.position.set(s * (wd / 2 - 0.2), 0.8, -len / 2 - 0.01); g.add(t); }
  const head = new THREE.MeshStandardMaterial({ color: 0xddd, emissive: 0xfff4e0, emissiveIntensity: 0.1 });
  for (const s of [-1, 1]) { const t = new THREE.Mesh(box(0.28, 0.12, 0.03), head); t.position.set(s * (wd / 2 - 0.25), 0.75, len / 2 + 0.01); g.add(t); }
  // 部品をまとめて描画回数を減らす
  const B = new Batch();
  g.updateMatrixWorld(true);
  for (const c of [...g.children]) { B.add(c.geometry, c.material, c.matrix); g.remove(c); }
  B.build(g);
  g.userData = { len, tail, head };
  return g;
}
