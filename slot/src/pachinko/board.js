// =====================================================================
//  パチンコ台の 3D
//   実機の CR 機に寄せた筐体: クリスタル調の光る枠、上部の赤いドット LED ロゴ、左右上のスピーカー、
//   台上のデータ表示機と機種 POP、台の左のサンド (紙幣投入口)、上皿・下皿、光るハンドル玉
//   盤面の座標は physics.js と同じ (盤面中心が原点、単位 m)。group の中で BOARD_Y だけ持ち上げる
// =====================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_R, FIELD_R } from './physics.js';

export const BOARD_Y = 1.28;
const MAX_BALLS = 96;
const CAB_W = 0.56;      // 筐体の幅

export class PBoard {
  constructor(cfg, assets, layout) {
    this.cfg = cfg;
    this.assets = assets;
    this.L = layout;
    this.group = new THREE.Group();
    this.board = new THREE.Group();
    this.board.position.y = BOARD_Y;
    this.group.add(this.board);
    this.pickables = [];
    this.font = cfg.assets.jpFonts.display;
    this.m = {
      chrome: new THREE.MeshStandardMaterial({ color: 0xf2f2f5, metalness: 1, roughness: 0.12 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 1, roughness: 0.25 }),
      black: new THREE.MeshPhysicalMaterial({ color: 0x07070a, metalness: 0.3, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x15131a, metalness: 0.6, roughness: 0.45 }),
      red: new THREE.MeshPhysicalMaterial({ color: 0x9a0a1e, metalness: 0.4, roughness: 0.3, clearcoat: 1, emissive: 0x3a0008, emissiveIntensity: 0.6 }),
      plastic: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.6, roughness: 0.15, thickness: 0.01, transparent: true, opacity: 0.85 }),
      ball: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 }),
    };
    this.lights = { frameHue: 0.78, frameMode: 'idle', flash: 0 };
    this.buildBody();
    this.buildBoard();
    this.buildParts();
    this.buildBalls();
    this.buildTray();
    this.buildDataUnit();
    this.buildSand();
  }

  // ---------------- 筐体と装飾枠 ----------------
  buildBody() {
    const g = this.group;
    // 本体 (黒の光沢)
    const body = new THREE.Mesh(new RoundedBoxGeometry(CAB_W, 1.12, 0.3, 4, 0.02), this.m.black);
    body.position.set(0, 1.21, -0.16);
    g.add(body);
    // 盤面まわりの黒いパネル (盤面のところが丸く抜けている)
    const shape = new THREE.Shape();
    const w = CAB_W / 2, h0 = 0.96, h1 = 1.7;
    shape.moveTo(-w, h0); shape.lineTo(w, h0); shape.lineTo(w, h1); shape.lineTo(-w, h1); shape.lineTo(-w, h0);
    const hole = new THREE.Path(); hole.absarc(0, BOARD_Y, FIELD_R + 0.008, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false, curveSegments: 64 }), this.m.black);
    g.add(panel);
    // クリスタル調の枠: 角ばった多角形のリングを面ごとに分けて、交互に光らせる
    const facets = 18;
    const rIn = FIELD_R + 0.012;
    const outer = (a) => {
      // 横は筐体幅に収まり、縦に少し長い多角形
      const rx = 0.272, ry = 0.3;
      const k = 1 + 0.08 * Math.cos(a * 3);
      return [Math.cos(a) * rx * k, Math.sin(a) * ry * k];
    };
    this.facets = [];
    for (let i = 0; i < facets; i++) {
      const a0 = (i / facets) * Math.PI * 2 + Math.PI / 2, a1 = ((i + 1) / facets) * Math.PI * 2 + Math.PI / 2;
      const s = new THREE.Shape();
      const [ox0, oy0] = outer(a0), [ox1, oy1] = outer(a1);
      s.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn);
      s.lineTo(ox0, oy0); s.lineTo(ox1, oy1);
      s.lineTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
      s.closePath();
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xe2d4ff, emissive: 0x8a3aff, emissiveIntensity: 0.4, roughness: 0.12, metalness: 0.2, clearcoat: 1, sheen: 1, sheenColor: 0xffffff, iridescence: 0.6, transparent: true, opacity: 0.94 });
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.004, bevelSegments: 1 }), mat);
      m.position.set(0, BOARD_Y, 0.02);
      g.add(m);
      this.facets.push(mat);
    }
    // 内側の銀の縁
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rIn, 0.004, 12, 96), this.m.chrome);
    ring.position.set(0, BOARD_Y, 0.052);
    g.add(ring);
    // 黄緑のクリスタル (枠の四隅)
    this.gems = [];
    for (const [x, y, s] of [[-0.24, 1.53, 0.03], [0.24, 1.53, 0.03], [-0.25, 1.06, 0.026], [0.25, 1.06, 0.026], [-0.2, 1.62, 0.02], [0.2, 1.62, 0.02]]) {
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xd8ff5a, emissive: 0xa8e020, emissiveIntensity: 0.7, roughness: 0.1, clearcoat: 1 });
      const gm = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), mat);
      gm.scale.set(1, 1.3, 0.5);
      gm.position.set(x, y, 0.06);
      gm.rotation.z = x < 0 ? 0.4 : -0.4;
      g.add(gm);
      this.gems.push(mat);
    }
    // 左右上のスピーカー (グレーの網)
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sx = sc.getContext('2d');
    sx.fillStyle = '#4a4a52'; sx.fillRect(0, 0, 128, 128);
    sx.fillStyle = '#16161a';
    for (let yy = 4; yy < 128; yy += 8) for (let xx = (yy / 8) % 2 ? 4 : 8; xx < 128; xx += 8) { sx.beginPath(); sx.arc(xx, yy, 2.4, 0, Math.PI * 2); sx.fill(); }
    const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
    for (const sgn of [-1, 1]) {
      const sp = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.09, 0.05, 3, 0.012), new THREE.MeshStandardMaterial({ map: stex, metalness: 0.6, roughness: 0.4 }));
      sp.position.set(sgn * 0.215, 1.625, 0.05);
      sp.rotation.set(-0.15, sgn * -0.25, sgn * -0.2);
      g.add(sp);
    }
    // 上部の赤いドット LED ロゴ
    const c = document.createElement('canvas'); c.width = 1024; c.height = 320;
    this.signCanvas = c;
    this.signTex = new THREE.CanvasTexture(c); this.signTex.colorSpace = THREE.SRGBColorSpace;
    const logoShape = new THREE.Shape();
    logoShape.moveTo(-0.17, -0.045); logoShape.lineTo(0.17, -0.045); logoShape.lineTo(0.2, 0.035); logoShape.lineTo(0.08, 0.06); logoShape.lineTo(-0.08, 0.06); logoShape.lineTo(-0.2, 0.035); logoShape.closePath();
    const logoGeo = new THREE.ShapeGeometry(logoShape);
    // UV を形の外接矩形に合わせる
    const pos = logoGeo.attributes.position, uv = logoGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 0.2) / 0.4, (pos.getY(i) + 0.045) / 0.105);
    this.signMat = new THREE.MeshBasicMaterial({ map: this.signTex, toneMapped: false, transparent: true });
    const logo = new THREE.Mesh(logoGeo, this.signMat);
    logo.position.set(0, 1.505, 0.069);
    g.add(logo);
    const logoBack = new THREE.Mesh(new THREE.ExtrudeGeometry(logoShape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1 }), new THREE.MeshPhysicalMaterial({ color: 0x1a0505, roughness: 0.3, clearcoat: 1, transparent: true, opacity: 0.85 }));
    logoBack.position.set(0, 1.505, 0.048);
    g.add(logoBack);
    this.drawSign(0);
    // 枠の下の銀の飾り (王冠のような形)
    const crown = new THREE.Shape();
    crown.moveTo(-0.09, 0); crown.lineTo(-0.06, 0.03); crown.lineTo(-0.03, 0.008); crown.lineTo(0, 0.04); crown.lineTo(0.03, 0.008); crown.lineTo(0.06, 0.03); crown.lineTo(0.09, 0); crown.lineTo(0, -0.02); crown.closePath();
    const cm = new THREE.Mesh(new THREE.ExtrudeGeometry(crown, { depth: 0.015, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 }), this.m.chrome);
    cm.position.set(0, 0.985, 0.055);
    g.add(cm);
    // 左右下の赤い装飾
    for (const sgn of [-1, 1]) {
      const rs = new THREE.Shape();
      rs.moveTo(0, 0); rs.lineTo(0.07 * sgn, 0.01); rs.lineTo(0.05 * sgn, 0.07); rs.closePath();
      const rm = new THREE.Mesh(new THREE.ExtrudeGeometry(rs, { depth: 0.02, bevelEnabled: false }), this.m.red);
      rm.position.set(sgn * 0.17, 0.985, 0.05);
      g.add(rm);
    }
    // 左のピンクの玉抜きレバー
    const pink = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.022, 0.04, 2, 0.008), new THREE.MeshPhysicalMaterial({ color: 0xff5ab0, emissive: 0xff2a90, emissiveIntensity: 0.5, roughness: 0.2, clearcoat: 1 }));
    pink.position.set(-0.285, 1.13, 0.06);
    pink.rotation.z = -0.12;
    g.add(pink);
    // ガラス
    const glass = new THREE.Mesh(new THREE.CircleGeometry(FIELD_R + 0.01, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, roughness: 0.05, metalness: 0, envMapIntensity: 0.15, depthWrite: false }));
    glass.position.set(0, BOARD_Y, 0.03);
    glass.renderOrder = 5;
    g.add(glass);
  }

  // 赤いドット LED (ロゴ)。演出に合わせて流れる
  drawSign(t, mode = 'idle') {
    const x = this.signCanvas.getContext('2d');
    x.clearRect(0, 0, 1024, 320);
    // 文字をいったん小さく描いて、画素ごとにドットに置き換える
    const off = this._signOff || (this._signOff = document.createElement('canvas'));
    off.width = 128; off.height = 40;
    const o = off.getContext('2d');
    o.clearRect(0, 0, 128, 40);
    o.font = `400 23px ${this.font}`; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
    const txt = mode === 'round' ? 'FEVER' : mode === 'st' ? 'RUSH' : 'CIRCUS';
    o.fillText(txt, 64 + (mode === 'round' ? Math.sin(t * 6) * 4 : 0), 22);
    const data = o.getImageData(0, 0, 128, 40).data;
    for (let yy = 0; yy < 40; yy++) for (let xx = 0; xx < 128; xx++) {
      const a = data[(yy * 128 + xx) * 4 + 3];
      const px = xx * 8 + 4, py = yy * 8 + 4;
      if (a > 100) {
        const hue = mode === 'round' ? (t * 200 + xx * 3) % 360 : mode === 'st' ? 300 : 0;
        const tw = 0.75 + 0.25 * Math.sin(t * 8 + xx * 0.3);
        x.fillStyle = `hsla(${hue},100%,${55 + tw * 15}%,1)`;
        x.beginPath(); x.arc(px, py, 3.4, 0, Math.PI * 2); x.fill();
      } else {
        x.fillStyle = 'rgba(120,20,20,0.35)';
        x.beginPath(); x.arc(px, py, 2.2, 0, Math.PI * 2); x.fill();
      }
    }
    this.signTex.needsUpdate = true;
  }

  // ---------------- 盤面 (印刷されたセル板) ----------------
  buildBoard() {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d');
    const S = 1024 / (FIELD_R * 2);
    const P = (px, py) => [512 + px * S, 512 - py * S];
    const g = x.createRadialGradient(512, 400, 40, 512, 512, 620);
    g.addColorStop(0, '#5a1020'); g.addColorStop(0.55, '#2a0610'); g.addColorStop(1, '#0a0206');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
    // 金の唐草模様 (放射状の線と弧)
    x.strokeStyle = 'rgba(255,200,90,0.28)'; x.lineWidth = 3;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      x.beginPath(); x.moveTo(512 + Math.cos(a) * 330, 512 + Math.sin(a) * 330);
      x.quadraticCurveTo(512 + Math.cos(a + 0.15) * 430, 512 + Math.sin(a + 0.15) * 430, 512 + Math.cos(a + 0.05) * 500, 512 + Math.sin(a + 0.05) * 500);
      x.stroke();
    }
    for (const r of [340, 420, 480]) { x.beginPath(); x.arc(512, 512, r, 0, Math.PI * 2); x.strokeStyle = 'rgba(255,200,90,0.16)'; x.stroke(); }
    // 金粉
    for (let i = 0; i < 120; i++) {
      const sx = (i * 197) % 1024, sy = (i * 331) % 1024;
      x.fillStyle = `rgba(255,${190 + (i % 3) * 20},90,${0.25 + (i % 5) * 0.12})`;
      x.beginPath(); x.arc(sx, sy, 1.5 + (i % 3), 0, Math.PI * 2); x.fill();
    }
    const im = this.assets.images.clown;
    if (im) {
      const h = 190, w = im.width * (h / im.height);
      const [lx, ly] = P(-0.165, -0.16);
      x.globalAlpha = 0.8; x.drawImage(im, lx - w / 2, ly - h / 2, w, h); x.globalAlpha = 1;
    }
    const L = this.L;
    const lab = (txt, px, py, col, size = 30) => {
      const [cx, cy] = P(px, py);
      x.font = `400 ${size}px ${this.font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = '#120018'; x.strokeText(txt, cx, cy); x.fillStyle = col; x.fillText(txt, cx, cy);
    };
    lab('START', L.heso.x, L.heso.y - 0.022, '#ffd23f', 26);
    lab('右打ち →', 0.15, 0.08, '#ffd23f', 30);
    lab('ATTACKER', (L.attacker.x0 + L.attacker.x1) / 2, L.attacker.y - 0.03, '#ff7ad8', 22);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    this.boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45 });
    const face = new THREE.Mesh(new THREE.CircleGeometry(FIELD_R + 0.004, 96), this.boardMat);
    face.position.z = -0.004;
    this.board.add(face);
  }

  // ---------------- 釘・役物・液晶 ----------------
  buildParts() {
    const L = this.L, b = this.board;
    // 釘
    const nailGeo = new THREE.CylinderGeometry(0.0011, 0.0011, 0.016, 8);
    nailGeo.rotateX(Math.PI / 2);
    const nails = new THREE.InstancedMesh(nailGeo, this.m.chrome, L.nails.length);
    const m4 = new THREE.Matrix4();
    L.nails.forEach((n, i) => { m4.makeTranslation(n.x, n.y, 0.004); nails.setMatrixAt(i, m4); });
    b.add(nails);
    // 外周のレール
    const rail = new THREE.Mesh(new THREE.TorusGeometry(FIELD_R, 0.0025, 8, 128), this.m.chrome);
    rail.position.z = 0.006;
    b.add(rail);
    // ガイド板・ステージ (線分を薄い板に)
    this.doors = {};
    for (const sg of L.segs) {
      const [ax, ay] = sg.a, [bx, by] = sg.b;
      const len = Math.hypot(bx - ax, by - ay);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.003, 0.016), sg.door ? new THREE.MeshPhysicalMaterial({ color: sg.door === 'attacker' ? 0xff3fa8 : 0x3fd0ff, emissive: sg.door === 'attacker' ? 0xff3fa8 : 0x3fd0ff, emissiveIntensity: 0.4, roughness: 0.2, clearcoat: 1 }) : this.m.gold);
      m.position.set((ax + bx) / 2, (ay + by) / 2, 0.006);
      m.rotation.z = Math.atan2(by - ay, bx - ax);
      b.add(m);
      if (sg.door) this.doors[sg.door] = m;
    }
    // 風車
    this.windmills = L.windmills.map((w) => {
      const grp = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(w.r * 2, 0.0026, 0.004), this.m.plastic);
        blade.rotation.z = (k * Math.PI) / 4;
        grp.add(blade);
      }
      grp.position.set(w.x, w.y, 0.008);
      b.add(grp);
      return grp;
    });
    // ヘソ (スタートチャッカー)
    const heso = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.014), new THREE.MeshPhysicalMaterial({ color: 0xffd23f, emissive: 0xffa000, emissiveIntensity: 0.4, roughness: 0.3 }));
    heso.position.set(L.heso.x, L.heso.y - 0.009, 0.007);
    b.add(heso);
    this.hesoMesh = heso;
    // 一般入賞口
    for (const p of L.pockets) {
      const pk = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.012), this.m.gold);
      pk.position.set(p.x, p.y - 0.007, 0.007);
      b.add(pk);
    }
    // ゲート
    const gate = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0018, 6, 24, Math.PI), this.m.gold);
    gate.position.set(L.gate.x, L.gate.y, 0.007);
    b.add(gate);
    // アタッカーの受け
    const at = L.attacker;
    const atBox = new THREE.Mesh(new THREE.BoxGeometry(at.x1 - at.x0 + 0.01, 0.016, 0.014), new THREE.MeshStandardMaterial({ color: 0x220010, roughness: 0.6 }));
    atBox.position.set((at.x0 + at.x1) / 2, at.y - 0.012, 0.004);
    b.add(atBox);
    // 液晶 (枠つき)
    const lc = L.lcd;
    const frame = new THREE.Mesh(new RoundedBoxGeometry(lc.w, lc.h, 0.018, 3, 0.008), this.m.gold);
    frame.position.set(lc.x, lc.y, 0.004);
    b.add(frame);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 720;
    this.lcdCanvas = c;
    this.lcdTex = new THREE.CanvasTexture(c); this.lcdTex.colorSpace = THREE.SRGBColorSpace;
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(lc.w - 0.018, lc.h - 0.018), new THREE.MeshBasicMaterial({ map: this.lcdTex, toneMapped: false }));
    lcd.position.set(lc.x, lc.y, 0.0135);
    b.add(lcd);
  }

  buildBalls() {
    const geo = new THREE.SphereGeometry(BALL_R, 16, 12);
    this.ballMesh = new THREE.InstancedMesh(geo, this.m.ball, MAX_BALLS);
    this.ballMesh.count = 0;
    this.ballMesh.frustumCulled = false;
    this.board.add(this.ballMesh);
  }

  // ---------------- 上皿・下皿・ハンドル・ボタン ----------------
  buildTray() {
    const g = this.group;
    // 上皿 (黒の光沢 + 銀の縁 + 白い LED)
    const tray = new THREE.Mesh(new RoundedBoxGeometry(CAB_W - 0.02, 0.09, 0.18, 5, 0.035), this.m.black);
    tray.position.set(0, 0.905, 0.07);
    g.add(tray);
    const trim = new THREE.Mesh(new RoundedBoxGeometry(CAB_W - 0.03, 0.008, 0.02, 2, 0.004), this.m.chrome);
    trim.position.set(0, 0.952, 0.155);
    g.add(trim);
    this.trayLed = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const led = new THREE.Mesh(new THREE.BoxGeometry(CAB_W - 0.1, 0.004, 0.004), this.trayLed);
    led.position.set(0, 0.87, 0.162);
    g.add(led);
    const well = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.02, 0.09, 3, 0.01), new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.4 }));
    well.position.set(-0.08, 0.948, 0.07);
    g.add(well);
    this.trayBalls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 10, 8), this.m.ball, 120);
    this.trayBalls.count = 0;
    g.add(this.trayBalls);
    // 上皿前面の表示 (持ち玉・打ち出しの強さ)
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    this.trayCanvas = c;
    this.trayTex = new THREE.CanvasTexture(c); this.trayTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.038), new THREE.MeshBasicMaterial({ map: this.trayTex, toneMapped: false }));
    disp.position.set(-0.1, 0.9, 0.161);
    g.add(disp);
    // 中央の宝石型 PUSH ボタン
    this.pushMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f0ff, emissive: 0x9ab8ff, emissiveIntensity: 0.4, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
    const push = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.03, 8), this.pushMat);
    push.position.set(0.07, 0.962, 0.08);
    push.userData.action = 'push';
    push.userData.baseY = push.position.y;
    g.add(push);
    const pushRing = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, 8, 8), this.m.chrome);
    pushRing.rotation.x = Math.PI / 2;
    pushRing.position.set(0.07, 0.952, 0.08);
    g.add(pushRing);
    this.pushBtn = push;
    // 貸玉・返却ボタン (上皿の左上)
    const lend = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.012, 0.026, 2, 0.005), new THREE.MeshPhysicalMaterial({ color: 0x3bff8a, emissive: 0x18a050, emissiveIntensity: 0.6, roughness: 0.3 }));
    lend.position.set(-0.235, 0.955, 0.1);
    lend.userData.action = 'plend';
    g.add(lend);
    this.lendBtn = lend;
    const ret = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.012, 0.026, 2, 0.005), new THREE.MeshPhysicalMaterial({ color: 0xffb03b, emissive: 0x804010, emissiveIntensity: 0.5, roughness: 0.3 }));
    ret.position.set(-0.19, 0.955, 0.1);
    g.add(ret);
    // 下皿
    const low = new THREE.Mesh(new RoundedBoxGeometry(CAB_W - 0.04, 0.13, 0.17, 5, 0.04), this.m.black);
    low.position.set(0, 0.76, 0.06);
    g.add(low);
    const lowHole = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.06, 0.02, 3, 0.012), new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.9 }));
    lowHole.position.set(-0.05, 0.765, 0.14);
    g.add(lowHole);
    // ハンドル (右下)。白く光る玉と、回した角度 = 打ち出しの強さ
    const hg = new THREE.Group();
    hg.position.set(0.215, 0.79, 0.16);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.035, 32), this.m.chrome);
    base.rotation.x = Math.PI / 2;
    hg.add(base);
    const knob = new THREE.Group();
    this.knobMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0xdfe8ff, emissiveIntensity: 0.9, roughness: 0.1, transmission: 0.3, thickness: 0.02, clearcoat: 1 });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.038, 32, 24), this.knobMat);
    orb.scale.z = 0.7;
    knob.add(orb);
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 10, 32), this.m.chrome);
    knob.add(grip);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.016), new THREE.MeshPhysicalMaterial({ color: 0xff2040, emissive: 0xff2040, emissiveIntensity: 0.6 }));
    tab.position.set(0, 0.048, 0);
    knob.add(tab);
    knob.position.z = 0.03;
    hg.add(knob);
    g.add(hg);
    this.knob = knob;
    this.handleLight = new THREE.PointLight(0xdfe8ff, 0.15, 0.4, 2);
    this.handleLight.position.set(0.215, 0.79, 0.24);
    g.add(this.handleLight);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(hg.position);
    hit.userData.action = 'handle';
    g.add(hit);
    this.pickables.push(push, lend, hit);
    // 台の下の島
    const island = new THREE.Mesh(new RoundedBoxGeometry(6, 0.68, 0.7, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.5, roughness: 0.4 }));
    island.position.set(0, 0.34, -0.1);
    g.add(island);
    const step = new THREE.Mesh(new THREE.BoxGeometry(6, 0.02, 0.2), this.m.chrome);
    step.position.set(0, 0.68, 0.2);
    g.add(step);
  }

  // ---------------- 台上のデータ表示機と機種 POP ----------------
  buildDataUnit() {
    const g = this.group;
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.2, 0.08, 4, 0.02), this.m.black);
    box.position.set(0, 1.86, -0.04);
    box.rotation.x = -0.12;
    g.add(box);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
    this.dataCanvas = c;
    this.dataTex = new THREE.CanvasTexture(c); this.dataTex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.18), new THREE.MeshBasicMaterial({ map: this.dataTex, toneMapped: false }));
    face.position.set(0, 1.862, 0.002);
    face.rotation.x = -0.12;
    g.add(face);
    // 虹色に流れる縁
    this.dataLed = new THREE.MeshBasicMaterial({ color: 0xff3fa8, toneMapped: false });
    const edge = new THREE.Group();
    for (const [w, h, ex, ey] of [[0.5, 0.006, 0, 0.096], [0.5, 0.006, 0, -0.096], [0.006, 0.198, 0.25, 0], [0.006, 0.198, -0.25, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), this.dataLed);
      b.position.set(ex, ey, 0);
      edge.add(b);
    }
    edge.position.set(0, 1.862, 0.006);
    edge.rotation.x = -0.12;
    g.add(edge);
    // 機種 POP (白いカード)
    const pc = document.createElement('canvas'); pc.width = 1024; pc.height = 256;
    const p = pc.getContext('2d');
    p.fillStyle = '#f4f4f6'; p.fillRect(0, 0, 1024, 256);
    p.fillStyle = '#d0102a'; p.fillRect(0, 0, 1024, 18);
    const im = this.assets.images.clown;
    if (im) p.drawImage(im, 16, 30, 180 * im.width / im.height, 180);
    const box2 = (bx, label, val, sub) => {
      p.fillStyle = '#d0102a'; p.fillRect(bx, 40, 120, 60);
      p.font = `400 26px ${this.font}`; p.fillStyle = '#fff'; p.textAlign = 'center'; p.fillText(label, bx + 60, 80);
      p.font = `400 64px ${this.font}`; p.fillStyle = '#111'; p.textAlign = 'left'; p.fillText(val, bx + 132, 96);
      p.font = `400 24px ${this.font}`; p.fillStyle = '#333'; p.fillText(sub, bx + 10, 160);
    };
    box2(220, '大当り', '1/199', 'ST 100 回');
    box2(620, '継続率', '72%', '10R 約1500個');
    const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
    const pop = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.11), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.6, emissiveMap: ptex, emissive: 0xffffff, emissiveIntensity: 0.35 }));
    pop.position.set(0, 2.07, -0.12);
    g.add(pop);
    // 呼出ボタン
    const call = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 24), new THREE.MeshBasicMaterial({ color: 0x3fffd0, toneMapped: false }));
    call.rotation.x = Math.PI / 2 - 0.12;
    call.position.set(-0.215, 1.8, 0.012);
    g.add(call);
    // 後ろの白い壁と赤いライン
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshStandardMaterial({ color: 0xd8d8de, roughness: 0.5 }));
    wall.position.set(0, 2.2, -0.33);
    g.add(wall);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.03), new THREE.MeshBasicMaterial({ color: 0xc0102a }));
    line.position.set(0, 1.97, -0.32);
    g.add(line);
    this.drawData({ hits: 0, sinceHit: 0, spins: 0, history: [] }, 0);
  }

  drawData(stats, t) {
    const x = this.dataCanvas.getContext('2d');
    x.fillStyle = '#05060a'; x.fillRect(0, 0, 1024, 384);
    const seg = (str, cx, cy, size, col) => {
      x.font = `700 ${size}px DSEG7`; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
      x.fillStyle = 'rgba(80,255,220,0.08)'; x.fillText('8'.repeat(str.length), cx, cy);
      x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 18; x.fillText(str, cx, cy); x.shadowBlur = 0;
    };
    x.font = `400 26px ${this.font}`; x.fillStyle = '#ff4a5a'; x.textAlign = 'left'; x.fillText('大当', 60, 46);
    seg(String(stats.hits % 1000).padStart(3, '!'), 470, 230, 190, '#3fffd8');
    x.font = `400 24px ${this.font}`; x.fillStyle = '#9fd8ff'; x.fillText('スタート', 60, 300);
    seg(String(stats.sinceHit % 10000).padStart(4, '!'), 470, 350, 70, '#3fffd8');
    // 右: 小さな液晶 (履歴)
    x.fillStyle = '#0a1a3a'; x.fillRect(520, 24, 470, 336);
    x.font = `400 24px ${this.font}`; x.fillStyle = '#ffd23f'; x.textAlign = 'left';
    x.fillText(`総スタート ${stats.spins}`, 540, 64);
    x.fillText(`初当り ${stats.firstHits || 0}  ST中 ${stats.stHits || 0}`, 540, 100);
    x.fillText(`最大連チャン ${stats.maxChain || 0}`, 540, 136);
    x.fillStyle = '#c9d4e4';
    x.fillText(`最大ハマり ${stats.maxHamari || 0}`, 540, 172);
    x.fillText(`千円あたり ${stats.perK ? stats.perK.toFixed(1) : '--'} 回`, 540, 208);
    // 連チャン履歴のバー
    const hist = (stats.history || []).slice(0, 10);
    hist.forEach((h, i) => {
      const hh = Math.min(120, 12 * h.chain);
      x.fillStyle = h.chain >= 3 ? '#ff4a5a' : '#3fa8ff';
      x.fillRect(540 + i * 44, 340 - hh, 30, hh);
    });
    this.dataTex.needsUpdate = true;
  }

  // ---------------- 台の左のサンド (紙幣投入口・カード) ----------------
  buildSand() {
    const g = this.group;
    const c = document.createElement('canvas'); c.width = 128; c.height = 1024;
    const x = c.getContext('2d');
    x.fillStyle = '#1a1a20'; x.fillRect(0, 0, 128, 1024);
    x.fillStyle = '#2fd8ff'; x.fillRect(30, 40, 68, 14);
    x.fillStyle = '#0a0a0e'; x.fillRect(20, 120, 88, 220);                 // 紙幣投入口
    x.fillStyle = '#3fa8ff'; x.fillRect(54, 140, 20, 180);
    x.fillStyle = '#e8e8f0'; x.fillRect(20, 380, 88, 120);                 // カード
    x.fillStyle = '#ff5ab0'; x.font = `400 40px ${this.font}`; x.textAlign = 'center'; x.fillText('¥', 64, 460);
    x.fillStyle = '#0a0a0e'; x.fillRect(30, 540, 68, 10);
    x.fillStyle = '#2ab060'; x.fillRect(16, 760, 96, 200);                 // QR のシール
    x.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) x.fillRect(26 + (i * 37) % 76, 776 + ((i * 53) % 160), 8, 8);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sand = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.78, 0.12, 2, 0.01), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.4 }));
    sand.position.set(-CAB_W / 2 - 0.035, 1.24, 0.0);
    g.add(sand);
  }

  drawTray(balls, power, firing) {
    const x = this.trayCanvas.getContext('2d');
    x.fillStyle = '#060208'; x.fillRect(0, 0, 512, 96);
    x.font = `400 26px ${this.font}`; x.fillStyle = '#9fd8ff'; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillText('持ち玉', 16, 48);
    x.font = '700 50px DSEG7'; x.fillStyle = '#ff2a2a'; x.textAlign = 'right'; x.fillText(String(balls), 300, 50);
    const gx = 320, gw = 176;
    x.fillStyle = '#1a1020'; x.fillRect(gx, 30, gw, 36);
    x.fillStyle = 'rgba(80,200,255,0.25)'; x.fillRect(gx + gw * 0.4, 30, gw * 0.22, 36);
    x.fillStyle = 'rgba(255,200,60,0.25)'; x.fillRect(gx + gw * 0.88, 30, gw * 0.12, 36);
    x.fillStyle = firing ? '#ffd23f' : '#887040'; x.fillRect(gx, 30, gw * power, 36);
    x.font = `400 18px ${this.font}`; x.fillStyle = '#c9d4e4'; x.textAlign = 'center';
    x.fillText(firing ? '発射中' : '停止', gx + gw / 2, 18);
    this.trayTex.needsUpdate = true;
  }

  setTrayBalls(n) {
    const k = Math.min(120, Math.ceil(n / 8));
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < k; i++) {
      const col = i % 24, row = Math.floor(i / 24);
      m4.makeTranslation(-0.215 + col * 0.0112 + (row % 2) * 0.0056, 0.962 + row * 0.005, 0.045 + (row % 4) * 0.011);
      this.trayBalls.setMatrixAt(i, m4);
    }
    this.trayBalls.count = k;
    this.trayBalls.instanceMatrix.needsUpdate = true;
  }

  update(dt, t, world, power) {
    const m4 = new THREE.Matrix4();
    const n = Math.min(MAX_BALLS, world.balls.length);
    for (let i = 0; i < n; i++) { const b = world.balls[i]; m4.makeTranslation(b.x, b.y, 0.0075); this.ballMesh.setMatrixAt(i, m4); }
    this.ballMesh.count = n;
    this.ballMesh.instanceMatrix.needsUpdate = true;
    this.windmills.forEach((w, i) => { w.rotation.z = world.windAngle * (i ? -1 : 1); });
    for (const [k, m] of Object.entries(this.doors)) {
      const open = world.open[k];
      m.visible = !open;
      m.material.emissiveIntensity = open ? 1.5 : 0.35;
    }
    this.knob.rotation.z = -power * Math.PI * 0.8;
    // 枠のクリスタル: 通常は紫がゆっくり流れ、ST は虹、大当たりは金の点滅
    const L = this.lights;
    L.flash = Math.max(0, L.flash - dt * 2);
    this.facets.forEach((mat, i) => {
      let h = L.frameHue, l = 0.55, k = 0.18 + 0.5 * Math.pow(Math.max(0, Math.sin(t * 2 - i * 0.6)), 3);
      if (L.frameMode === 'rainbow') { h = (t * 0.4 + i / this.facets.length) % 1; k = 0.9; }
      else if (L.frameMode === 'round') { h = 0.12; k = Math.sin(t * 18 + i) > 0 ? 1.4 : 0.3; }
      mat.emissive.setHSL(h, 0.9, l);
      mat.emissiveIntensity = k + L.flash * 1.2;
    });
    this.gems.forEach((mat, i) => { mat.emissiveIntensity = 0.5 + 0.4 * Math.sin(t * 3 + i) + L.flash; });
    this.trayLed.color.setHSL(L.frameMode === 'round' ? (t * 0.8) % 1 : 0, L.frameMode === 'round' ? 1 : 0, 0.85);
    this.dataLed.color.setHSL((t * 0.25) % 1, 1, 0.55);
    const press = this.pushBtn.userData.press || 0;
    this.pushBtn.userData.press = Math.max(0, press - dt * 8);
    this.pushBtn.position.y = this.pushBtn.userData.baseY - 0.008 * Math.min(1, press);
    this.pushMat.emissiveIntensity = L.pushPrompt ? (Math.sin(t * 16) > 0 ? 2.2 : 0.3) : 0.4;
    this.knobMat.emissiveIntensity = 0.7 + (L.firing ? 0.3 * Math.sin(t * 10) : 0);
    this._signT = (this._signT || 0) + dt;
    if (this._signT > 0.08) { this._signT = 0; this.drawSign(t, L.frameMode === 'round' ? 'round' : L.frameMode === 'rainbow' ? 'st' : 'idle'); }
  }
}
