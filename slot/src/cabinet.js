// =====================================================================
//  筐体 (外部PBRテクスチャ + HDRI 反射) / リール / ボタン / レバー / ランプ
// =====================================================================
import * as THREE from 'three';
import { Screen } from './screen.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeReelCanvas, drawSymbol, roundRect } from './symbols.js';

export const DIM = {
  W: 0.9, bodyBottom: 0.78, top: 2.13, front: 0.28, back: -0.36,
  reelY: 1.37, reelR: 0.28, reelW: 0.176, reelGap: 0.2,
  winW: 0.62, deckY: 1.135, deckZ: 0.46,
  lcdY: 1.775, lcdW: 0.64, lcdH: 0.32,
};

const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

export class Cabinet {
  constructor(cfg, assets, logic) {
    this.cfg = cfg;
    this.assets = assets;
    this.logic = logic;
    this.group = new THREE.Group();
    this.pickables = [];
    this.time = 0;
    this.lights = {
      mode: 'idle', neonHue: 0.9, neonBoost: 1, ledMode: 'chase', lamp: 0, lampTarget: 0,
      backlight: [1, 1, 1], backlightTarget: [1, 1, 1], flicker: 0, rainbow: 0,
      stopLed: ['#3cf', '#3cf', '#3cf'], stopLedOn: [false, false, false], betLed: true, leverLed: false,
      reelFlash: null, reelRainbow: 0, pushLed: 0,
    };
    this.buildMaterials();
    this.buildBody();
    this.buildReels();
    this.buildWindow();
    this.buildDeck();
    this.buildLever();
    this.buildTray();
    this.buildLcd();
    this.buildSign();
    this.buildNeon();
    this.buildLamp();
    this.buildCounter();
    this.buildChanger();
  }

  // ---------------- materials ----------------
  buildMaterials() {
    const T = this.assets.textures;
    const brushed = T.brushedMetal || {};
    const rep = (set, x, y) => {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        if (set[k]) { set[k] = set[k].clone(); set[k].repeat.set(x, y); set[k].needsUpdate = true; }
      }
      return set;
    };
    const side = rep({ ...brushed }, 1.5, 3);
    this.m = {
      side: new THREE.MeshStandardMaterial({
        color: 0x9aa4b4, metalness: 1, roughness: 0.42, ...side, envMapIntensity: 1.1,
      }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xf2f2f5, metalness: 1, roughness: 0.12 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc95a, metalness: 1, roughness: 0.22 }),
      darkMetal: new THREE.MeshStandardMaterial({
        color: 0x24262c, metalness: 0.9, roughness: 0.38,
        ...rep({ ...(T.scratchedMetal || {}) }, 2, 2),
      }),
      piano: new THREE.MeshPhysicalMaterial({ color: 0x07070b, metalness: 0.2, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.6 }),
      plasticRed: new THREE.MeshPhysicalMaterial({ color: 0xd0001c, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.2 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x3a0d18, roughness: 0.75, ...rep({ ...(T.leather || {}) }, 12, 2), map: null, metalnessMap: null, metalness: 0 }),
    };
  }

  // ---------------- body ----------------
  buildBody() {
    const { W, bodyBottom, top, front, back } = DIM;
    const g = this.group;
    const H = top - bodyBottom, D = front - back;
    // 内部シェル: 背板 + 下部ボックス + 天板 (リール室は空洞)
    const blk = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.01), this.m.piano); m.position.set(x, y, z); g.add(m); return m; };
    blk(W - 0.02, H, 0.04, 0, bodyBottom + H / 2, back + 0.02);
    blk(W - 0.02, 1.16 - bodyBottom, D - 0.06, 0, (bodyBottom + 1.16) / 2, back + (D - 0.06) / 2);
    blk(W - 0.02, top - 1.6, D - 0.06, 0, (1.6 + top) / 2, back + (D - 0.06) / 2 - 0.02);
    // サイドパネル (ヘアライン金属)
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new RoundedBoxGeometry(0.035, H + 0.01, D + 0.02, 4, 0.012), this.m.side);
      p.position.set(s * (W / 2 + 0.0), bodyBottom + H / 2, back + D / 2);
      g.add(p);
      // 前面縁のクロームモール
      const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, H, 16), this.m.chrome);
      trim.position.set(s * (W / 2 - 0.004), bodyBottom + H / 2, front + 0.012);
      g.add(trim);
    }
    // 上部パネル (LCD 周り) — 黒鏡面
    const upper = new THREE.Mesh(new RoundedBoxGeometry(W - 0.03, 0.4, 0.04, 4, 0.015), this.m.piano);
    upper.position.set(0, 1.79, front - 0.01);
    g.add(upper);
  }

  // ---------------- reels ----------------
  buildReels() {
    const { reelR, reelW, reelGap, reelY } = DIM;
    const N = this.logic.N;
    const pixel = this.cfg.assets.symbolSkin === 'pixel';
    this.reels = [];
    for (let i = 0; i < 3; i++) {
      const canvas = makeReelCanvas(this.logic.strips[i], this.assets.images, pixel);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.magFilter = pixel ? THREE.NearestFilter : THREE.LinearFilter;
      const circ = Math.PI * 2 * reelR;
      const geo = new THREE.PlaneGeometry(reelW, circ, 1, N * 8);
      const pos = geo.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v);
        const th = (y / circ) * Math.PI * 2;
        pos.setY(v, reelR * Math.sin(th));
        pos.setZ(v, reelR * Math.cos(th));
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: 0x000000, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1,
        roughness: 0.5, metalness: 0, side: THREE.FrontSide, toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const holder = new THREE.Group();
      holder.position.set((i - 1) * reelGap, reelY, DIM.front - 0.035 - reelR);
      holder.add(mesh);
      // リール間の仕切り (黒)
      this.group.add(holder);
      this.reels.push({ holder, mesh, mat, s: Math.floor(Math.random() * N), v: 0, state: 'idle', target: 0, t: 0, bounceT: -1, speedMul: 1 });
      this.setReelAngle(i);
    }
    // リール奥の暗幕
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    back.position.set(0, reelY, DIM.front - 0.035 - reelR * 1.1);
    this.group.add(back);
    for (const x of [-0.1, 0.1]) {
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.34, 0.06), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.7 }));
      div.position.set(x, reelY, DIM.front - 0.06);
      this.group.add(div);
    }
  }

  // s (連続位置) → 回転角。中段 index = s
  setReelAngle(i) {
    const r = this.reels[i];
    const N = this.logic.N;
    const a = (Math.PI * 2) / N;
    let s = r.s;
    if (r.bounceT >= 0) s += r.bounceOffset || 0;
    r.mesh.rotation.x = (s + 0.5) * a - Math.PI;
  }

  // ---------------- window / panel ----------------
  buildWindow() {
    const { W, front, reelY, winW } = DIM;
    const cellH = DIM.reelR * (Math.PI * 2) / this.logic.N;
    this.cellH = cellH;
    const winH = cellH * 3 + 0.03;
    this.winH = winH;
    const y0 = 1.165, y1 = 1.585;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2 + 0.02, y0); shape.lineTo(W / 2 - 0.02, y0); shape.lineTo(W / 2 - 0.02, y1); shape.lineTo(-W / 2 + 0.02, y1); shape.closePath();
    const hole = new THREE.Path();
    const hx = winW / 2, hy0 = reelY - winH / 2, hy1 = reelY + winH / 2, r = 0.02;
    hole.moveTo(-hx + r, hy0); hole.lineTo(hx - r, hy0); hole.quadraticCurveTo(hx, hy0, hx, hy0 + r);
    hole.lineTo(hx, hy1 - r); hole.quadraticCurveTo(hx, hy1, hx - r, hy1); hole.lineTo(-hx + r, hy1);
    hole.quadraticCurveTo(-hx, hy1, -hx, hy1 - r); hole.lineTo(-hx, hy0 + r); hole.quadraticCurveTo(-hx, hy0, -hx + r, hy0);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 12 });
    // UV を矩形全体に正規化してパネルアートを貼る
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + W / 2) / W, (pos.getY(k) - y0) / (y1 - y0));
    this.panelArt = this.makePanelArt(W, y1 - y0, y0, winH);
    const mat = new THREE.MeshPhysicalMaterial({
      map: this.panelArt, roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03,
      emissiveMap: this.panelArt, emissive: 0xffffff, emissiveIntensity: 0.18,
    });
    this.panelMat = mat;
    const panel = new THREE.Mesh(geo, mat);
    panel.position.z = front - 0.02;
    this.group.add(panel);

    // クロームベゼル
    const bz = new THREE.Shape();
    const o = 0.016;
    bz.moveTo(-hx - o, hy0 - o); bz.lineTo(hx + o, hy0 - o); bz.lineTo(hx + o, hy1 + o); bz.lineTo(-hx - o, hy1 + o); bz.closePath();
    bz.holes.push(hole);
    const bzGeo = new THREE.ExtrudeGeometry(bz, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 4, curveSegments: 12 });
    const bezel = new THREE.Mesh(bzGeo, this.m.chrome);
    bezel.position.z = front + 0.002;
    this.group.add(bezel);

    // リール上下の陰影 (曲面感)
    const vc = document.createElement('canvas'); vc.width = 4; vc.height = 256;
    const vx = vc.getContext('2d');
    const vg = vx.createLinearGradient(0, 0, 0, 256);
    vg.addColorStop(0, 'rgba(0,0,0,0.85)'); vg.addColorStop(0.18, 'rgba(0,0,0,0.0)');
    vg.addColorStop(0.82, 'rgba(0,0,0,0.0)'); vg.addColorStop(1, 'rgba(0,0,0,0.85)');
    vx.fillStyle = vg; vx.fillRect(0, 0, 4, 256);
    const vig = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vc), transparent: true, depthWrite: false }));
    vig.position.set(0, reelY, front - 0.028);
    this.group.add(vig);

    // アクリル (HDRI の映り込み)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW + 0.03, winH + 0.03), new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.06, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.2, depthWrite: false,
    }));
    glass.position.set(0, reelY, front + 0.006);
    glass.renderOrder = 5;
    this.group.add(glass);

    // 有効ライン表示 (当選時に光る)
    this.lineMeshes = this.cfg.lines.map((ln) => {
      const ys = ln.map((row) => reelY + (row - 1) * cellH);
      const x0 = -DIM.reelGap - 0.11, x1 = DIM.reelGap + 0.11;
      const ya = ys[0] + (ys[0] - ys[1]) * 0.55, yb = ys[2] + (ys[2] - ys[1]) * 0.55;
      const len = Math.hypot(x1 - x0, yb - ya);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.007), new THREE.MeshBasicMaterial({ color: hdr(0xffd84a, 4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.position.set(0, (ya + yb) / 2, front - 0.026);
      m.rotation.z = Math.atan2(yb - ya, x1 - x0);
      m.renderOrder = 4;
      this.group.add(m);
      return m;
    });
  }

  makePanelArt(W, H, y0, winH) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = Math.round(1024 * H / W);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#1a0630'); g.addColorStop(0.5, '#05020c'); g.addColorStop(1, '#2a0418');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    // 放射状のライン
    x.save(); x.translate(c.width / 2, c.height / 2);
    for (let i = 0; i < 48; i++) {
      x.rotate(Math.PI * 2 / 48);
      x.fillStyle = i % 2 ? 'rgba(255,40,140,0.07)' : 'rgba(80,120,255,0.06)';
      x.beginPath(); x.moveTo(0, 0); x.lineTo(900, -40); x.lineTo(900, 40); x.fill();
    }
    x.restore();
    // 左右の装飾文字
    x.font = '38px Bungee'; x.textAlign = 'center'; x.fillStyle = '#ffd34d';
    x.save(); x.translate(c.width - 60, c.height / 2); x.rotate(Math.PI / 2); x.fillText('SLOT', 0, 12); x.restore();
    // ライン番号
    x.font = '22px Orbitron'; x.fillStyle = '#9fd8ff';
    const py = (yy) => c.height - (yy - y0) / H * c.height;
    const cy = py(DIM.reelY), ch = this.cellH / H * c.height;
    for (const [lbl, dy] of [['3', -1], ['1', 0], ['2', 1]]) x.fillText(lbl, 140, cy + dy * ch + 8);
    return Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 });
  }

  // ---------------- 告知 (液晶全体が光る。独立したランプは置かない) ----------------
  buildLamp() {
    // 液晶の光が筐体と手元を照らす
    this.lampLight = new THREE.PointLight(0xff3fa8, 0, 2.6, 2);
    this.lampLight.position.set(0, DIM.lcdY, DIM.front + 0.2);
    this.group.add(this.lampLight);
    // 点灯の瞬間に広がる光の波紋
    this.ripples = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.position.set(0, DIM.lcdY, DIM.front + 0.03);
      m.userData.t = 99; // 待機中 (起動直後に勝手に広がらないように)
      this.group.add(m);
      return m;
    });
  }

  ripple(color = 0xff5fc0) {
    this.ripples.forEach((m, i) => { m.userData.t = -i * 0.12; m.material.color.set(color); });
  }

  // ---------------- 操作部 ----------------
  buildDeck() {
    const { W, front, deckY, deckZ } = DIM;
    const g = this.group;
    // 下パネル (配当表)
    const payTex = this.makePayTable();
    const lower = new THREE.Mesh(new RoundedBoxGeometry(W - 0.03, 0.17, 0.03, 3, 0.01), this.m.piano);
    lower.position.set(0, 0.99, front - 0.005);
    g.add(lower);
    const payPlane = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.08, 0.14), new THREE.MeshPhysicalMaterial({ map: payTex, emissiveMap: payTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.18, clearcoat: 1 }));
    payPlane.position.set(0, 0.99, front + 0.0115);
    g.add(payPlane);

    // デッキ本体
    const deck = new THREE.Mesh(new RoundedBoxGeometry(W - 0.01, 0.075, deckZ - front + 0.04, 4, 0.018), this.m.piano);
    deck.position.set(0, deckY, (front + deckZ) / 2 - 0.02);
    g.add(deck);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(W - 0.03, 0.006, 0.006), this.m.chrome);
    trim.position.set(0, deckY + 0.034, deckZ - 0.004);
    g.add(trim);
    const trim2 = trim.clone(); trim2.position.y = deckY - 0.034; g.add(trim2);

    // ストップボタン
    this.stopButtons = [];
    for (let i = 0; i < 3; i++) {
      const grp = new THREE.Group();
      grp.position.set((i - 1) * DIM.reelGap, deckY, deckZ + 0.002);
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 16, 48), this.m.chrome);
      grp.add(bezel);
      const mat = new THREE.MeshPhysicalMaterial({ color: 0x223344, emissive: new THREE.Color('#3cf'), emissiveIntensity: 0, roughness: 0.15, clearcoat: 1, transmission: 0, thickness: 0.01 });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.026, 40), mat);
      cap.rotation.x = Math.PI / 2;
      cap.position.z = 0.006;
      cap.userData.action = 'stop' + i;
      grp.add(cap);
      // 指で押しやすいように、ボタン列の下 (配当表) まで含めた大きな当たり判定
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(0.195, 0.24), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, -0.07, 0.03); hit.userData.action = 'stop' + i;
      grp.add(hit);
      g.add(grp);
      this.pickables.push(cap, hit);
      this.stopButtons.push({ grp, cap, mat, press: 0 });
    }

    // MAX BET (ボタン面は Kenney UI Pack の光沢ボタン画像に文字を刷ったもの)
    const bc = document.createElement('canvas'); bc.width = 384; bc.height = 160;
    const bx = bc.getContext('2d');
    const face = this.assets.images.maxbet;
    if (face) bx.drawImage(face, 0, 0, 384, 160);
    else { bx.fillStyle = '#ffcf33'; bx.fillRect(0, 0, 384, 160); }
    bx.font = '58px Bungee'; bx.textAlign = 'center'; bx.textBaseline = 'middle';
    bx.lineWidth = 8; bx.strokeStyle = 'rgba(255,250,220,0.9)'; bx.strokeText('MAX BET', 192, 74);
    bx.fillStyle = '#7a2a00'; bx.fillText('MAX BET', 192, 74);
    const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = 4;
    this.betMat = new THREE.MeshPhysicalMaterial({ map: btex, emissiveMap: btex, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    // 台座 (クロームの枠) + 押し込める本体
    // 実機同様、手前に少し傾けて正面から文字が読めるようにする
    const betGrp = new THREE.Group();
    betGrp.position.set(-0.19, deckY + 0.034, DIM.front + 0.1);
    betGrp.rotation.x = 0.42;
    g.add(betGrp);
    const betBase = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.012, 0.075, 3, 0.005), this.m.chrome);
    betGrp.add(betBase);
    const bet = new THREE.Mesh(new RoundedBoxGeometry(0.134, 0.022, 0.058, 3, 0.007), new THREE.MeshPhysicalMaterial({ color: 0xffc81a, roughness: 0.25, clearcoat: 1, emissive: 0x6a4400, emissiveIntensity: 0.3 }));
    bet.position.set(0, 0.013, 0);
    bet.userData.action = 'bet';
    bet.userData.baseY = bet.position.y;
    const betTop = new THREE.Mesh(new THREE.PlaneGeometry(0.124, 0.051), this.betMat);
    betTop.rotation.x = -Math.PI / 2; betTop.position.set(0, 0.0112, 0);
    betTop.userData.action = 'bet';
    bet.add(betTop);
    betGrp.add(bet);
    this.betButton = bet;
    this.betPress = 0;
    const betHit = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.14), new THREE.MeshBasicMaterial({ visible: false }));
    betHit.userData.action = 'bet';
    betGrp.add(betHit);
    this.pickables.push(bet, betTop, betHit);



    // メダル投入口
    const slot = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.012, 0.06, 2, 0.004), this.m.chrome);
    slot.position.set(0.3, deckY + 0.042, DIM.front + 0.1);
    g.add(slot);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.006), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    slit.position.set(0.3, deckY + 0.0485, DIM.front + 0.1);
    g.add(slit);

    // 7セグ表示 (クレジット / 払い出し)
    this.segCanvas = document.createElement('canvas');
    this.segCanvas.width = 512; this.segCanvas.height = 96;
    this.segTex = new THREE.CanvasTexture(this.segCanvas);
    this.segTex.colorSpace = THREE.SRGBColorSpace;
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.0788), new THREE.MeshBasicMaterial({ map: this.segTex, toneMapped: false }));
    seg.position.set(0.02, 1.19, DIM.front + 0.013);
    seg.scale.setScalar(0.85);
    g.add(seg);
    this.setSegments(0, 0, 0);
  }

  setSegments(credit, pay, games) {
    const x = this.segCanvas.getContext('2d');
    x.fillStyle = '#080204'; x.fillRect(0, 0, 512, 96);
    const draw = (val, digits, cx, label) => {
      x.font = '700 50px DSEG7'; x.textAlign = 'right';
      x.fillStyle = 'rgba(255,40,40,0.12)'; x.fillText('8'.repeat(digits), cx, 70);
      x.fillStyle = '#ff2a2a'; x.shadowColor = '#ff2a2a'; x.shadowBlur = 14;
      x.fillText(String(Math.max(0, Math.floor(val))).padStart(digits, ' ').replace(/ /g, '!'), cx, 70);
      x.shadowBlur = 0;
      x.font = '500 13px Orbitron'; x.fillStyle = '#ffb0b0'; x.textAlign = 'left';
      x.fillText(label, cx - digits * 40, 90);
    };
    draw(games, 4, 175, 'GAME');
    draw(credit, 5, 375, 'CREDIT');
    draw(pay, 3, 505, 'PAY');
    this.segTex.needsUpdate = true;
  }

  makePayTable() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 168;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1024, 0);
    g.addColorStop(0, '#12002a'); g.addColorStop(0.5, '#2a0050'); g.addColorStop(1, '#12002a');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 168);
    x.strokeStyle = '#ffd34d'; x.lineWidth = 3; x.strokeRect(6, 6, 1012, 156);
    const imgs = this.assets.images;
    const pixel = this.cfg.assets.symbolSkin === 'pixel';
    const items = [
      ['RRR', 'BIG'], ['RRA', 'REG'], ['GGG', '8'], ['LLL', '14'], ['JJJ', '10'], ['PPP', 'REPLAY'], ['C', '2'],
    ];
    const colW = 1024 / items.length;
    items.forEach(([sy, txt], i) => {
      const cx = colW * i + colW / 2;
      const n = sy.length;
      for (let k = 0; k < n; k++) drawSymbol(x, sy[k], cx + (k - (n - 1) / 2) * 42, 62, 42, imgs, pixel);
      x.font = '30px Bungee'; x.textAlign = 'center'; x.fillStyle = txt === 'BIG' ? '#ff4a5a' : txt === 'REG' ? '#4ab0ff' : '#ffe9a0';
      x.fillText(txt, cx, 132);
    });
    return Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 });
  }

  buildLever() {
    const pivot = new THREE.Group();
    pivot.position.set(-0.36, DIM.deckY + 0.02, DIM.front + 0.1);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.02, 32), this.m.chrome);
    pivot.add(base);
    const arm = new THREE.Group();
    arm.rotation.x = 0.95; // 手前上向き
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.12, 16), this.m.chrome);
    shaft.position.y = 0.06;
    arm.add(shaft);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 32, 24), this.m.plasticRed);
    knob.position.y = 0.125;
    knob.userData.action = 'lever';
    arm.add(knob);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.1; hit.userData.action = 'lever';
    arm.add(hit);
    pivot.add(arm);
    this.group.add(pivot);
    this.lever = { pivot, arm, angle: 0.95, pull: 0, vel: 0, drag: 0 };
    // 画面端でも掴みやすいよう、デッキ左側一帯をレバーの当たり判定にする
    const zone = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.24), new THREE.MeshBasicMaterial({ visible: false }));
    zone.position.set(-0.34, DIM.deckY + 0.07, DIM.front + 0.12);
    zone.userData.action = 'lever';
    this.group.add(zone);
    this.pickables.push(zone);
    this.pickables.push(knob, hit);
  }

  buildTray() {
    const g = this.group;
    const y = 0.81, z0 = DIM.front - 0.02, z1 = DIM.front + 0.14;
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.01, z1 - z0), this.m.darkMetal);
    bottom.position.set(0, y, (z0 + z1) / 2);
    g.add(bottom);
    const mk = (w, h, d, px, py, pz) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.003), this.m.chrome); m.position.set(px, py, pz); g.add(m); };
    mk(0.62, 0.07, 0.012, 0, y + 0.03, z1);
    mk(0.012, 0.07, z1 - z0, -0.31, y + 0.03, (z0 + z1) / 2);
    mk(0.012, 0.07, z1 - z0, 0.31, y + 0.03, (z0 + z1) / 2);
    // 払い出し口
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.01), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    chute.position.set(0, 0.875, DIM.front + 0.001);
    g.add(chute);
    this.tray = { y: y + 0.006, z0, z1, x0: -0.3, x1: 0.3 };
  }

  // 上部液晶 (中身は screen.js)
  buildLcd() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    this.artCanvas = c;
    this.artTex = new THREE.CanvasTexture(c);
    this.artTex.colorSpace = THREE.SRGBColorSpace;
    this.artMat = new THREE.MeshStandardMaterial({ map: this.artTex, emissiveMap: this.artTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.25 });
    const art = new THREE.Mesh(new THREE.PlaneGeometry(DIM.lcdW + 0.04, DIM.lcdH + 0.04), this.artMat);
    art.position.set(0, DIM.lcdY, DIM.front + 0.012);
    this.group.add(art);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(DIM.lcdW + 0.04, DIM.lcdH + 0.04), new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.05, roughness: 0, clearcoat: 1, envMapIntensity: 1.2, depthWrite: false }));
    glass.position.set(0, DIM.lcdY, DIM.front + 0.016);
    glass.renderOrder = 3;
    this.group.add(glass);
    this.screen = new Screen(c, this.assets.images, this.cfg.assets.jpFonts.gothic);
    this.screen.draw(0);
    this.artTex.needsUpdate = true;
  }


  buildSign() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 200;
    this.signCanvas = c;
    this.signTex = new THREE.CanvasTexture(c);
    this.signTex.colorSpace = THREE.SRGBColorSpace;
    this.drawSign(0);
    const box = new THREE.Mesh(new RoundedBoxGeometry(DIM.W + 0.02, 0.18, 0.16, 4, 0.03), this.m.side);
    box.position.set(0, 2.05, DIM.front - 0.06);
    this.group.add(box);
    this.signMat = new THREE.MeshStandardMaterial({ map: this.signTex, emissiveMap: this.signTex, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.3 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(DIM.W - 0.06, 0.15), this.signMat);
    face.position.set(0, 2.05, DIM.front + 0.022);
    this.group.add(face);
  }

  drawSign(t) {
    const c = this.signCanvas, x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1024, 0);
    const h = (t * 40) % 360;
    g.addColorStop(0, `hsl(${h},90%,18%)`); g.addColorStop(0.5, '#08000f'); g.addColorStop(1, `hsl(${(h + 180) % 360},90%,18%)`);
    x.fillStyle = g; x.fillRect(0, 0, 1024, 200);
    // 電球チェイス
    for (let i = 0; i < 40; i++) {
      const on = (Math.floor(t * 12) + i) % 4 === 0;
      x.fillStyle = on ? '#fff2a8' : '#5a4010';
      x.beginPath(); x.arc(14 + i * 25.4, 12, 6, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(14 + i * 25.4, 188, 6, 0, Math.PI * 2); x.fill();
    }
    x.font = '120px Bungee'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 14; x.strokeStyle = '#ff1f6b'; x.shadowColor = '#ff1f6b'; x.shadowBlur = 30;
    x.strokeText('SLOT', 512, 108);
    x.shadowBlur = 0;
    const tg = x.createLinearGradient(0, 50, 0, 160);
    tg.addColorStop(0, '#fffbe0'); tg.addColorStop(0.5, '#ffd23f'); tg.addColorStop(1, '#ff8a00');
    x.fillStyle = tg; x.fillText('SLOT', 512, 108);
    this.signTex.needsUpdate = true;
  }

  buildNeon() {
    // 前面外周のネオン管
    const { W, front } = DIM;
    const pts = [];
    const x = W / 2 - 0.028, yb = 1.18, yt = 1.97;
    pts.push(new THREE.Vector3(-x, yb, front + 0.03));
    pts.push(new THREE.Vector3(-x, yt - 0.06, front + 0.03));
    pts.push(new THREE.Vector3(-x + 0.06, yt, front + 0.03));
    pts.push(new THREE.Vector3(x - 0.06, yt, front + 0.03));
    pts.push(new THREE.Vector3(x, yt - 0.06, front + 0.03));
    pts.push(new THREE.Vector3(x, yb, front + 0.03));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    this.neonMat = new THREE.MeshBasicMaterial({ color: hdr(0xff2fa0, 1.6), toneMapped: false });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.0055, 10, false), this.neonMat);
    this.group.add(tube);
    // ネオンの環境光
    this.neonLights = [-1, 1].map((s) => {
      const l = new THREE.PointLight(0xff2fa0, 0.6, 2.2, 2);
      l.position.set(s * 0.55, 1.6, 0.5);
      this.group.add(l);
      return l;
    });
    // サイド LED (チェイス)
    const n = 22;
    const geo = new THREE.BoxGeometry(0.014, 0.022, 0.006);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.leds = new THREE.InstancedMesh(geo, mat, n * 2);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n * 2; i++) {
      const s = i < n ? -1 : 1, k = i % n;
      m4.makeTranslation(s * (W / 2 + 0.019), 0.84 + k * 0.058, front + 0.0);
      this.leds.setMatrixAt(i, m4);
      this.leds.setColorAt(i, new THREE.Color(0, 0, 0));
    }
    this.ledCount = n;
    this.group.add(this.leds);
  }

  // ---------------- per-frame ----------------
  update(dt, now) {
    this.time += dt;
    const L = this.lights;
    const t = this.time;
    // リール
    this.updateReels(dt);
    // バックライト
    for (let i = 0; i < 3; i++) {
      L.backlight[i] += (L.backlightTarget[i] - L.backlight[i]) * Math.min(1, dt * 18);
      let b = L.backlight[i] * this.cfg.reels.backlight;
      if (L.flicker > 0) b *= 0.5 + 0.5 * Math.sin(t * 50 + i * 2);
      // リールフラッシュ (実機の消灯・点滅パターン)
      const F = L.reelFlash;
      if (F) {
        const ft = t - F.t0;
        if (ft > F.dur) L.reelFlash = null;
        else if (F.mode === 'strobe') b *= Math.sin(ft * 42) > 0 ? 1.7 : 0.08;
        else if (F.mode === 'blink') b *= Math.sin(ft * 14) > 0 ? 1.35 : 0.25;
        else if (F.mode === 'wave') b *= Math.sin(ft * 12 - i * 1.6) > 0.2 ? 1.6 : 0.1;
        else if (F.mode === 'off') b *= 0.05;
        else if (F.mode === 'lineup') b *= ft < 0.12 * (i + 1) ? 0.05 : 1.6;
      }
      const mat = this.reels[i].mat;
      mat.emissiveIntensity = Math.max(0.04, b);
      if (L.reelRainbow > 0) mat.emissive.setHSL((t * 0.9 + i * 0.18) % 1, 0.85, 0.62);
      else mat.emissive.setRGB(1, 1, 1);
    }
    // ネオン
    let hue = L.neonHue, inten = 1.6 * L.neonBoost;
    if (L.mode === 'rainbow' || L.rainbow > 0) hue = (t * 0.35) % 1;
    if (L.mode === 'off') inten = 0.05;
    if (L.mode === 'chance') inten *= 0.6 + 0.6 * Math.abs(Math.sin(t * 9));
    if (L.mode === 'idle') inten *= 0.8 + 0.2 * Math.sin(t * 1.6);
    const nc = new THREE.Color().setHSL(hue, 1, 0.55);
    this.neonMat.color.copy(nc).multiplyScalar(inten);
    for (const l of this.neonLights) { l.color.copy(nc); l.intensity = L.mode === 'off' ? 0 : 0.35 * inten; }
    // LED チェイス
    const n = this.ledCount;
    const col = new THREE.Color();
    for (let i = 0; i < n * 2; i++) {
      const k = i % n;
      let v = 0;
      if (L.mode === 'off') v = 0;
      else if (L.ledMode === 'chase') v = ((k - t * 14) % 6 + 6) % 6 < 1.2 ? 1 : 0.06;
      else if (L.ledMode === 'flash') v = Math.sin(t * 30) > 0 ? 1 : 0.05;
      else if (L.ledMode === 'rise') v = ((t * 30 - k) % 22 + 22) % 22 < 4 ? 1 : 0.05;
      if (L.mode === 'rainbow' || L.rainbow > 0) col.setHSL((k / n + t * 0.8) % 1, 1, 0.55).multiplyScalar(v * 3);
      else col.setHSL(hue, 1, 0.6).multiplyScalar(v * 1.8);
      this.leds.setColorAt(i, col);
    }
    this.leds.instanceColor.needsUpdate = true;
    // 告知ランプ
    // ペカッ: 点灯は一瞬で、消灯はゆっくり
    L.lamp = L.lampTarget > L.lamp ? L.lampTarget : L.lamp + (L.lampTarget - L.lamp) * Math.min(1, dt * 4);
    L.lampFlash = Math.max(0, (L.lampFlash || 0) - dt * 2.2);
    const pulse = L.lampTarget > 0 ? 0.85 + 0.15 * Math.sin(t * 5) : 1;
    this.lampLight.intensity = L.lamp * 0.25 * pulse + L.lampFlash * 0.8;
    if (L.lampPremium) this.lampLight.color.setHSL((t * 0.9) % 1, 1, 0.55); else this.lampLight.color.set(0xff3fa8);
    for (const m of this.ripples) {
      if (m.userData.t > 1.2) { m.material.opacity = 0; continue; }
      m.userData.t += dt;
      const k = Math.max(0, m.userData.t);
      m.scale.setScalar(0.12 + k * 0.4);
      m.material.opacity = m.userData.t < 0 ? 0 : Math.max(0, 0.45 * (1 - k / 1.2));
      if (L.lampPremium) m.material.color.setHSL((t + k) % 1, 1, 0.6);
    }
    // ストップボタン LED / 押し込み
    this.stopButtons.forEach((b, i) => {
      b.press += ((b.down ? 1 : 0) - b.press) * Math.min(1, dt * 30);
      b.cap.position.z = 0.006 - b.press * 0.009;
      const on = L.stopLedOn[i];
      const c = L.stopLed[i] === 'rainbow' ? new THREE.Color().setHSL((t * 1.5 + i * 0.2) % 1, 1, 0.5) : new THREE.Color(L.stopLed[i]);
      b.mat.emissive.copy(c);
      b.mat.emissiveIntensity = on ? 1.1 : 0.04;
    });
    L.betNudge = Math.max(0, (L.betNudge || 0) - dt * 1.5);
    this.betMat.emissiveIntensity = L.betNudge > 0 ? 0.4 + 1.4 * (Math.sin(t * 30) > 0 ? 1 : 0)
      : L.betLed ? 0.55 + 0.4 * (Math.sin(t * 7) * 0.5 + 0.5) : 0.1;
    this.betPress = Math.max(0, this.betPress - dt * 7);
    this.betButton.position.y = this.betButton.userData.baseY - 0.008 * Math.min(1, this.betPress * 2);
    // 貸出ボタン (メダル切れで点滅して催促)
    this.lendMat.emissiveIntensity = this.lendPrompt ? (Math.sin(t * 10) > 0 ? 1.8 : 0.2) : 0.35;
    // レバー (バネ)
    const lv = this.lever;
    const k = 260, d = 18;
    const target = Math.max(lv.held ? 0.42 : 0, lv.drag * 0.46);
    lv.vel += (k * (target - lv.pull) - d * lv.vel) * dt;
    lv.pull += lv.vel * dt;
    lv.arm.rotation.x = lv.angle + lv.pull;
    // 有効ライン
    for (const m of this.lineMeshes) {
      if (m.userData.flash > 0) {
        m.userData.flash -= dt;
        m.material.opacity = Math.max(0, Math.sin(t * 18) * 0.5 + 0.5) * Math.min(1, m.userData.flash);
      } else m.material.opacity = 0;
    }
    // 看板
    this._signT = (this._signT || 0) + dt;
    if (this._signT > 1 / 20) { this._signT = 0; this.drawSign(t * (L.rainbow > 0 ? 3 : 1)); }
    this.signMat.emissiveIntensity = L.mode === 'off' ? 0.05 : 1.0;
    // 電飾パネル: 平常時はゆっくり、告知・ボーナス中は高速で
    // 液晶 (30fps で描き直す)
    this._artT = (this._artT || 0) + dt;
    if (this._artT > 1 / 30) { this._artT = 0; this.screen.draw(t); this.artTex.needsUpdate = true; }
    this.artMat.emissiveIntensity = this.screen.scene === 'preview' ? 0.85 : L.mode === 'off' ? 0.05 : this.screen.scene === 'lit' ? 0.6 : 0.8;
    this.panelMat.emissiveIntensity = L.mode === 'off' ? 0.0 : 0.18;
  }

  // ---------------- ホールのデータカウンター (台上) ----------------
  buildCounter() {
    const c = document.createElement('canvas'); c.width = 768; c.height = 320;
    this.counterCanvas = c;
    this.counterTex = new THREE.CanvasTexture(c);
    this.counterTex.colorSpace = THREE.SRGBColorSpace;
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.27, 0.12, 3, 0.012), this.m.darkMetal);
    box.position.set(0, 2.34, -0.05);
    this.group.add(box);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.24), new THREE.MeshBasicMaterial({ map: this.counterTex, toneMapped: false }));
    face.position.set(0, 2.34, 0.012);
    this.group.add(face);
    this.setCounter({ big: 0, reg: 0, since: 0, games: 0, graph: [0], history: [] });
  }

  setCounter(st, blink = '') {
    const x = this.counterCanvas.getContext('2d'), W = 768, H = 320;
    x.fillStyle = '#05070c'; x.fillRect(0, 0, W, H);
    const seg = (label, v, cx, col) => {
      x.font = '500 22px Orbitron'; x.fillStyle = '#8fa0b8'; x.textAlign = 'center'; x.fillText(label, cx, 34);
      x.font = '700 58px DSEG7'; x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillText('888', cx, 98);
      x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 12; x.fillText(String(v).padStart(3, '!'), cx, 98); x.shadowBlur = 0;
    };
    seg('BIG', st.big, 110, blink === 'BIG' ? '#ffffff' : '#ff3b4b');
    seg('REG', st.reg, 290, blink === 'REG' ? '#ffffff' : '#3b9bff');
    const since = st.since ?? st.sinceBonus ?? 0;
    seg('START', since, 490, since >= 500 ? '#ff5a3a' : '#ffd23f');
    x.font = '500 18px Orbitron'; x.fillStyle = '#8fa0b8'; x.textAlign = 'right';
    x.fillText(`TOTAL ${st.games}`, W - 24, 34);
    // 設定推測データ (通常時の回転数で割る)
    const ng = st.normalGames || 0;
    const rate = (n) => (n > 0 && ng > 0 ? `1/${(ng / n).toFixed(n >= 10 ? 1 : 0)}` : '---');
    x.font = `500 21px ${this.cfg.assets.jpFonts.gothic}`; x.textAlign = 'left'; x.fillStyle = '#c9d4e4';
    x.fillText(`合算 ${rate((st.big || 0) + (st.reg || 0))}`, 24, 134);
    x.fillStyle = '#c9a0ff'; x.fillText(`ぶどう ${st.grape || 0}回 ${ng && st.grape ? '1/' + (ng / st.grape).toFixed(2) : '---'}`, 220, 134);
    x.fillStyle = '#ff8aa0'; x.fillText(`チェリー ${rate(st.cherry || 0)}`, 480, 134);
    x.fillStyle = '#8fa0b8'; x.textAlign = 'right'; x.fillText(`最大ハマり ${st.maxHamari || 0}`, W - 24, 134);
    // スランプグラフ (差枚の推移)
    const gx = 24, gy = 150, gw = W - 48, gh = 152;
    x.strokeStyle = '#1e2a3a'; x.lineWidth = 1; x.strokeRect(gx, gy, gw, gh);
    const gr = st.graph && st.graph.length > 1 ? st.graph : [0, 0];
    const mx = Math.max(500, ...gr.map(Math.abs));
    const mid = gy + gh / 2;
    x.strokeStyle = '#33465e'; x.beginPath(); x.moveTo(gx, mid); x.lineTo(gx + gw, mid); x.stroke();
    x.strokeStyle = '#ffd23f'; x.lineWidth = 3; x.beginPath();
    gr.forEach((v, i) => { const px = gx + (i / (gr.length - 1)) * gw, py = mid - (v / mx) * (gh / 2 - 6); if (i) x.lineTo(px, py); else x.moveTo(px, py); });
    x.stroke();
    x.textAlign = 'left'; x.font = '500 15px Orbitron'; x.fillStyle = '#6a7a90';
    x.fillText(`+${mx}`, gx + 6, gy + 18); x.fillText(`-${mx}`, gx + 6, gy + gh - 8);
    this.counterTex.needsUpdate = true;
  }

  // ---------------- 台間サンド (千円札でメダルを借りる) ----------------
  buildChanger() {
    const g = new THREE.Group();
    g.position.set(DIM.W / 2 + 0.085, 1.28, DIM.front - 0.06);
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.6, 0.2, 3, 0.012), this.m.darkMetal);
    g.add(body);
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    this.changerCanvas = c;
    this.changerTex = new THREE.CanvasTexture(c);
    this.changerTex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.23), new THREE.MeshBasicMaterial({ map: this.changerTex, toneMapped: false }));
    face.position.set(0, 0.15, 0.101);
    g.add(face);
    // 紙幣投入口
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.01), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    slit.position.set(0, -0.0, 0.102);
    g.add(slit);
    // 貸出ボタン
    this.lendMat = new THREE.MeshPhysicalMaterial({ color: 0x0a3a1a, emissive: new THREE.Color(0x3bff8a), emissiveIntensity: 0.4, roughness: 0.2, clearcoat: 1 });
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 32), this.lendMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0, -0.12, 0.105);
    g.add(btn);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.24), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.action = 'lend'; btn.userData.action = 'lend';
    g.add(hit);
    this.group.add(g);
    this.pickables.push(btn, hit);
    this.lendBtn = btn;
    this.setChanger(30000, false);
  }

  setChanger(wallet, prompt) {
    const x = this.changerCanvas.getContext('2d');
    x.fillStyle = '#0a0d14'; x.fillRect(0, 0, 256, 512);
    x.textAlign = 'center';
    x.font = '700 30px "Zen Kaku Gothic New", sans-serif'; x.fillStyle = '#9fd8ff';
    x.fillText('残高', 128, 60);
    x.font = '700 40px DSEG7'; x.fillStyle = '#3bff8a'; x.shadowColor = '#3bff8a'; x.shadowBlur = 10;
    x.fillText(String(wallet).padStart(5, '!'), 128, 130); x.shadowBlur = 0;
    x.font = '700 28px "Zen Kaku Gothic New", sans-serif'; x.fillStyle = '#fff';
    x.fillText('円', 128, 172);
    x.fillStyle = prompt ? '#ffd23f' : '#4a5a70';
    x.font = '900 34px "Zen Kaku Gothic New", sans-serif';
    x.fillText('千円で', 128, 300); x.fillText('46枚', 128, 345);
    x.font = '700 24px "Zen Kaku Gothic New", sans-serif'; x.fillStyle = prompt ? '#fff' : '#6a7a90';
    x.fillText('↓ 貸出ボタン', 128, 430);
    this.changerTex.needsUpdate = true;
    this.lendPrompt = prompt;
  }

  reelFlash(mode, dur) { this.lights.reelFlash = { mode, dur, t0: this.time }; }

  flashLines(lineIdx, sec = 2.4) {
    for (const i of lineIdx) if (this.lineMeshes[i]) this.lineMeshes[i].userData.flash = sec;
  }

  // ---------------- reel motion ----------------
  speed() { return (this.cfg.reels.rpm / 60) * this.logic.N; }

  startReels(dir = 1) {
    for (const r of this.reels) {
      r.state = 'spinup'; r.t = 0; r.dir = dir; r.bounceT = -1; r.speedMul = 1;
      r.s = ((r.s % this.logic.N) + this.logic.N) % this.logic.N;
    }
  }

  isSpinning(i) { return this.reels[i].state === 'spin' || this.reels[i].state === 'spinup'; }
  canStop(i) { return this.reels[i].state === 'spin'; }

  // ボタン押下位置: 次に中段へ来る整数コマ
  pressPos(i) { return Math.ceil(this.reels[i].s - 1e-6) % this.logic.N; }

  stopReel(i, target, onStopped) {
    const r = this.reels[i];
    const N = this.logic.N;
    const p = Math.ceil(r.s - 1e-6);
    const dist = (((target - p) % N) + N) % N;
    r.target = p + dist;
    r.state = 'sliding';
    r.onStopped = onStopped;
  }

  // 演出用: 指定位置へ強制回転 (逆回転・スロー)
  forceSpin(i, speedMul, dir = 1) {
    const r = this.reels[i];
    r.state = 'spin'; r.speedMul = speedMul; r.dir = dir; r.bounceT = -1;
  }

  updateReels(dt) {
    const N = this.logic.N;
    const V = this.speed();
    const cfgR = this.cfg.reels;
    for (let i = 0; i < 3; i++) {
      const r = this.reels[i];
      if (r.state === 'spinup') {
        r.t += dt * 1000;
        const k = Math.min(1, r.t / cfgR.spinUpMs);
        const v = V * Math.min(1, k * 1.15);
        r.s += v * dt * (r.dir || 1);
        if (k >= 1) r.state = 'spin';
      } else if (r.state === 'spin') {
        r.s += V * r.speedMul * dt * (r.dir || 1);
      } else if (r.state === 'sliding') {
        r.s += V * Math.max(0.6, r.speedMul) * dt;
        if (r.s >= r.target) {
          r.s = r.target % N;
          r.state = 'stopped';
          r.bounceT = 0;
          r.onStopped?.();
        }
      }
      if (r.bounceT >= 0) {
        r.bounceT += dt;
        const A = cfgR.bounce, w = (Math.PI * 2) / (cfgR.bounceMs / 1000) * 0.9, lam = 4.2 / (cfgR.bounceMs / 1000);
        r.bounceOffset = A * Math.sin(r.bounceT * w) * Math.exp(-r.bounceT * lam);
        if (r.bounceT > cfgR.bounceMs / 1000 * 1.6) { r.bounceT = -1; r.bounceOffset = 0; }
      }
      if (r.s > 1e6) r.s %= N;
      this.setReelAngle(i);
    }
  }
}
