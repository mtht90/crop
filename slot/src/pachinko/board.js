// =====================================================================
//  パチンコ台の 3D (盤面・釘・役物・液晶・銀玉・上皿・ハンドル)
//   盤面の座標は physics.js と同じ (盤面中心が原点、単位 m)。group の中で BOARD_Y だけ持ち上げる
// =====================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_R, FIELD_R } from './physics.js';

export const BOARD_Y = 1.28;
const MAX_BALLS = 96;

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
    const T = assets.textures || {};
    this.m = {
      chrome: new THREE.MeshStandardMaterial({ color: 0xf2f2f5, metalness: 1, roughness: 0.12 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 1, roughness: 0.25 }),
      body: new THREE.MeshPhysicalMaterial({ color: 0x6a0a3a, metalness: 0.6, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x14101c, metalness: 0.7, roughness: 0.45, ...(T.metal ? { map: T.metal.map } : {}) }),
      plastic: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.6, roughness: 0.15, thickness: 0.01, transparent: true, opacity: 0.85 }),
      ball: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 }),
    };
    this.lights = { frameHue: 0.9, frameMode: 'idle', flash: 0 };
    this.buildBody();
    this.buildBoard();
    this.buildParts();
    this.buildBalls();
    this.buildTray();
  }

  // ---------------- 筐体 ----------------
  buildBody() {
    const g = this.group;
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.66, 1.16, 0.3, 4, 0.03), this.m.dark);
    body.position.set(0, 1.18, -0.17);
    g.add(body);
    // 前面パネル (盤面のところが丸く抜けている)
    const shape = new THREE.Shape();
    const w = 0.33, h0 = 0.66, h1 = 1.72;
    shape.moveTo(-w, h0); shape.lineTo(w, h0); shape.lineTo(w, h1); shape.lineTo(-w, h1); shape.lineTo(-w, h0);
    const hole = new THREE.Path(); hole.absarc(0, BOARD_Y, FIELD_R + 0.008, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 64 }), this.m.body);
    panel.position.z = 0.0;
    g.add(panel);
    // 盤面を囲むクロームの輪と、色が変わる LED リング
    const ring = new THREE.Mesh(new THREE.TorusGeometry(FIELD_R + 0.01, 0.008, 16, 96), this.m.chrome);
    ring.position.set(0, BOARD_Y, 0.036);
    g.add(ring);
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0xff3fa8, toneMapped: false });
    const led = new THREE.Mesh(new THREE.TorusGeometry(FIELD_R + 0.026, 0.0025, 8, 96), this.ledMat);
    led.position.set(0, BOARD_Y, 0.038);
    g.add(led);
    // 上部の看板
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    this.signCanvas = c;
    this.signTex = new THREE.CanvasTexture(c); this.signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), new THREE.MeshStandardMaterial({ map: this.signTex, emissiveMap: this.signTex, emissive: 0xffffff, emissiveIntensity: 0.9 }));
    sign.position.set(0, 1.64, 0.04);
    g.add(sign);
    this.drawSign(0);
    // ガラス
    const glass = new THREE.Mesh(new THREE.CircleGeometry(FIELD_R + 0.01, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, roughness: 0.05, metalness: 0, envMapIntensity: 0.15, depthWrite: false }));
    glass.position.set(0, BOARD_Y, 0.03);
    glass.renderOrder = 5;
    g.add(glass);
  }

  drawSign(t) {
    const x = this.signCanvas.getContext('2d');
    x.fillStyle = '#12051f'; x.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 36; i++) {
      const on = (Math.floor(t * 10) + i) % 4 === 0;
      x.fillStyle = on ? '#fff2a8' : '#5a4010';
      x.beginPath(); x.arc(20 + i * 28.6, 16, 7, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(20 + i * 28.6, 240, 7, 0, Math.PI * 2); x.fill();
    }
    x.font = `400 120px ${this.font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 14; x.strokeStyle = '#ff1f6b'; x.shadowColor = '#ff1f6b'; x.shadowBlur = 30;
    x.strokeText('CIRCUS', 512, 130); x.shadowBlur = 0;
    x.fillStyle = '#fff6fb'; x.fillText('CIRCUS', 512, 130);
    this.signTex.needsUpdate = true;
  }

  // ---------------- 盤面 (印刷されたセル板) ----------------
  buildBoard() {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d');
    const S = 1024 / (FIELD_R * 2);
    const P = (px, py) => [512 + px * S, 512 - py * S];
    const g = x.createRadialGradient(512, 420, 40, 512, 512, 600);
    g.addColorStop(0, '#3a2a9a'); g.addColorStop(0.6, '#1a1050'); g.addColorStop(1, '#06041a');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
    // サーカスのテント模様
    x.save(); x.translate(512, 300);
    for (let i = 0; i < 16; i++) { x.rotate(Math.PI / 8); x.fillStyle = i % 2 ? 'rgba(255,60,120,0.16)' : 'rgba(255,240,200,0.08)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(700, -120); x.lineTo(700, 120); x.fill(); }
    x.restore();
    for (let i = 0; i < 40; i++) {
      const sx = (i * 197) % 1024, sy = (i * 331) % 1024;
      x.fillStyle = `rgba(255,${210 + (i % 3) * 15},140,${0.3 + (i % 5) * 0.12})`;
      x.beginPath(); x.arc(sx, sy, 3 + (i % 4) * 2, 0, Math.PI * 2); x.fill();
    }
    const im = this.assets.images.clown;
    if (im) {
      const h = 210, w = im.width * (h / im.height);
      const [lx, ly] = P(-0.16, -0.155);
      x.globalAlpha = 0.85; x.drawImage(im, lx - w / 2, ly - h / 2, w, h); x.globalAlpha = 1;
    }
    // ヘソ・アタッカーまわりの印刷
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

  // ---------------- 上皿・ハンドル・ボタン ----------------
  buildTray() {
    const g = this.group;
    const tray = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.1, 0.16, 4, 0.03), this.m.body);
    tray.position.set(0, 0.86, 0.07);
    g.add(tray);
    const well = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.03, 0.09, 3, 0.012), new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.4 }));
    well.position.set(-0.06, 0.91, 0.09);
    g.add(well);
    // 上皿の玉 (持ち玉の量で増減)
    this.trayBalls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 10, 8), this.m.ball, 120);
    this.trayBalls.count = 0;
    g.add(this.trayBalls);
    // 上皿前面の表示 (持ち玉・打ち出しの強さ)
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    this.trayCanvas = c;
    this.trayTex = new THREE.CanvasTexture(c); this.trayTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.056), new THREE.MeshBasicMaterial({ map: this.trayTex, toneMapped: false }));
    disp.position.set(-0.08, 0.86, 0.151);
    g.add(disp);
    // PUSH ボタン
    this.pushMat = new THREE.MeshPhysicalMaterial({ color: 0xff2040, emissive: 0xff2040, emissiveIntensity: 0.4, roughness: 0.2, clearcoat: 1 });
    const push = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.02, 32), this.pushMat);
    push.position.set(0.13, 0.92, 0.1);
    push.userData.action = 'push';
    g.add(push);
    this.pushBtn = push;
    // 貸し玉ボタン
    const lend = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.016, 0.03, 2, 0.005), new THREE.MeshPhysicalMaterial({ color: 0x3bff8a, emissive: 0x18a050, emissiveIntensity: 0.5, roughness: 0.3 }));
    lend.position.set(-0.27, 0.92, 0.11);
    lend.userData.action = 'plend';
    g.add(lend);
    this.lendBtn = lend;
    // ハンドル (右下)。回した角度 = 打ち出しの強さ
    const hg = new THREE.Group();
    hg.position.set(0.19, 0.78, 0.14);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 32), this.m.chrome);
    base.rotation.x = Math.PI / 2;
    hg.add(base);
    const knob = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 12, 32), new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.6 }));
    knob.add(grip);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.02), new THREE.MeshPhysicalMaterial({ color: 0xff2040, emissive: 0xff2040, emissiveIntensity: 0.5 }));
    tab.position.set(0, 0.048, 0);
    knob.add(tab);
    knob.position.z = 0.03;
    hg.add(knob);
    g.add(hg);
    this.knob = knob;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(hg.position);
    hit.userData.action = 'handle';
    g.add(hit);
    this.pickables.push(push, lend, hit);
    // 下皿
    const low = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.08, 0.14, 4, 0.02), this.m.dark);
    low.position.set(-0.03, 0.72, 0.05);
    g.add(low);
    // 台の下の島
    const island = new THREE.Mesh(new RoundedBoxGeometry(6, 0.66, 0.7, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a0a18, roughness: 0.7 }));
    island.position.set(0, 0.33, -0.1);
    g.add(island);
  }

  drawTray(balls, power, firing) {
    const x = this.trayCanvas.getContext('2d');
    x.fillStyle = '#060208'; x.fillRect(0, 0, 512, 96);
    x.font = `400 26px ${this.font}`; x.fillStyle = '#9fd8ff'; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillText('持ち玉', 16, 48);
    x.font = '700 50px DSEG7'; x.fillStyle = '#ff2a2a'; x.textAlign = 'right'; x.fillText(String(balls), 300, 50);
    // 強さゲージ (左打ち / 右打ちの目安つき)
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
      m4.makeTranslation(-0.2 + col * 0.0118 + (row % 2) * 0.006, 0.925 + row * 0.006, 0.07 + (row % 3) * 0.011);
      this.trayBalls.setMatrixAt(i, m4);
    }
    this.trayBalls.count = k;
    this.trayBalls.instanceMatrix.needsUpdate = true;
  }

  update(dt, t, world, power) {
    // 銀玉
    const m4 = new THREE.Matrix4();
    const n = Math.min(MAX_BALLS, world.balls.length);
    for (let i = 0; i < n; i++) { const b = world.balls[i]; m4.makeTranslation(b.x, b.y, 0.0075); this.ballMesh.setMatrixAt(i, m4); }
    this.ballMesh.count = n;
    this.ballMesh.instanceMatrix.needsUpdate = true;
    // 役物
    this.windmills.forEach((w, i) => { w.rotation.z = world.windAngle * (i ? -1 : 1); });
    for (const [k, m] of Object.entries(this.doors)) {
      const open = world.open[k];
      m.visible = !open;
      m.material.emissiveIntensity = open ? 1.5 : 0.35;
    }
    this.knob.rotation.z = -power * Math.PI * 0.8;
    // LED リングの色
    const L = this.lights;
    L.flash = Math.max(0, L.flash - dt * 2);
    let hue = L.frameHue, s = 0.9, l = 0.3;
    if (L.frameMode === 'rainbow') hue = (t * 0.5) % 1;
    else if (L.frameMode === 'round') { hue = 0.12; l = Math.sin(t * 20) > 0 ? 0.7 : 0.3; }
    this.ledMat.color.setHSL(hue, s, Math.min(0.95, l + L.flash * 0.4));
    this.pushMat.emissiveIntensity = L.pushPrompt ? (Math.sin(t * 16) > 0 ? 2 : 0.3) : 0.4;
    this._signT = (this._signT || 0) + dt;
    if (this._signT > 0.08) { this._signT = 0; this.drawSign(t); }
  }
}
