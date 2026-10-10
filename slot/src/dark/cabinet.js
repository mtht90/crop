// =====================================================================
//  DARKNIGHT の筐体
//   ジャグラー型の筐体 (cabinet.js) をもとに、上部を 16:9 の大型液晶に、
//   看板・配当表・データカウンターを DARKNIGHT 用に差し替え、
//   デッキに「飛び出す PUSH ボタン」、液晶の上に剣の役物 (落下ギミック) を足す
// =====================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Cabinet } from '../cabinet.js';
import { drawSymbol } from '../symbols.js';
import { DarkStage } from './stage.js';
import { DarkScreen } from './screen.js';

const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

export class DarkCabinet extends Cabinet {
  constructor(cfg, assets, logic) {
    super(cfg, assets, logic);
    this.lights.neonHue = 0.78;
    this.buildPush();
    this.buildGimmick();
  }

  // ---------------- 大型液晶 (3D 舞台 + 前面の 2D レイヤー) ----------------
  buildLcd() {
    const { lcdW, lcdH, lcdY, front } = this.D;
    this.stage = new DarkStage(this.assets);
    // 液晶の黒い額縁
    const frame = new THREE.Mesh(new RoundedBoxGeometry(lcdW + 0.05, lcdH + 0.05, 0.02, 3, 0.008), this.m.darkMetal);
    frame.position.set(0, lcdY, front + 0.002);
    this.group.add(frame);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(lcdW, lcdH), new THREE.MeshBasicMaterial({ map: this.stage.rt.texture, toneMapped: false }));
    lcd.position.set(0, lcdY, front + 0.0125);
    this.lcdMat = lcd.material;
    this.group.add(lcd);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
    this.artCanvas = c;
    this.artTex = new THREE.CanvasTexture(c);
    this.artTex.colorSpace = THREE.SRGBColorSpace;
    this.artMat = new THREE.MeshBasicMaterial({ map: this.artTex, transparent: true, toneMapped: false, depthWrite: false });
    const over = new THREE.Mesh(new THREE.PlaneGeometry(lcdW, lcdH), this.artMat);
    over.position.set(0, lcdY, front + 0.0135);
    over.renderOrder = 2;
    this.group.add(over);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(lcdW + 0.02, lcdH + 0.02), new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.05, roughness: 0, clearcoat: 1, envMapIntensity: 1.2, depthWrite: false }));
    glass.position.set(0, lcdY, front + 0.016);
    glass.renderOrder = 3;
    this.group.add(glass);
    this.screen = new DarkScreen(c, this.cfg.assets.jpFonts.display);
    this.lcdBright = 1;
  }

  renderLcd(renderer, dt) {
    this.stage.update(dt);
    this._lcdT = (this._lcdT || 0) + dt;
    if (this._lcdT < 1 / (this.cfg.render.lcdFps || 60) - 1e-4) return;
    this._lcdT = 0;
    this.stage.render(renderer);
  }

  // ---------------- 看板 ----------------
  drawSign(t) {
    const c = this.signCanvas, x = c.getContext('2d');
    const L = this.lights;
    const g = x.createLinearGradient(0, 0, 1024, 0);
    g.addColorStop(0, '#2a0010'); g.addColorStop(0.5, '#05000a'); g.addColorStop(1, '#14002a');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 200);
    // 稲妻状のライン
    x.strokeStyle = `rgba(160,64,255,${0.35 + 0.25 * Math.sin(t * 3)})`; x.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      x.beginPath();
      for (let i = 0; i <= 20; i++) { const px = i * 51.2, py = (k ? 176 : 24) + Math.sin(i * 2.1 + t * 4 + k) * 8; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
      x.stroke();
    }
    x.font = `400 104px ${this.cfg.assets.jpFonts.display}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const hot = L.mode === 'rainbow' || L.rainbow > 0;
    x.lineWidth = 14; x.strokeStyle = hot ? `hsl(${(t * 200) % 360},100%,55%)` : '#a020ff'; x.shadowColor = x.strokeStyle; x.shadowBlur = 34;
    x.strokeText('DARKNIGHT', 512, 106);
    x.shadowBlur = 0;
    const tg = x.createLinearGradient(0, 50, 0, 160);
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.45, '#c8c8d8'); tg.addColorStop(0.55, '#5a5a70'); tg.addColorStop(1, '#ff2a3a');
    x.fillStyle = tg; x.fillText('DARKNIGHT', 512, 106);
    this.signTex.needsUpdate = true;
  }

  makePanelArt(W, H, y0) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = Math.round(1024 * H / W);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#14001e'); g.addColorStop(0.5, '#030006'); g.addColorStop(1, '#200008');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    // 魔法陣の紋様
    x.save(); x.translate(c.width / 2, c.height / 2);
    x.strokeStyle = 'rgba(160,64,255,0.16)'; x.lineWidth = 4;
    for (const r of [420, 360, 250]) { x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); }
    for (let i = 0; i < 12; i++) { x.rotate(Math.PI / 6); x.beginPath(); x.moveTo(250, 0); x.lineTo(420, 0); x.stroke(); }
    x.restore();
    x.font = `400 34px ${this.cfg.assets.jpFonts.display}`; x.textAlign = 'center'; x.fillStyle = '#c080ff';
    x.save(); x.translate(c.width - 56, c.height / 2); x.rotate(Math.PI / 2); x.fillText('DARK', 0, 12); x.restore();
    x.save(); x.translate(56, c.height / 2); x.rotate(-Math.PI / 2); x.fillText('NIGHT', 0, 12); x.restore();
    return Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 });
  }

  makePayTable() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 168;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1024, 0);
    g.addColorStop(0, '#1a0008'); g.addColorStop(0.5, '#2a0040'); g.addColorStop(1, '#1a0008');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 168);
    x.strokeStyle = '#a040ff'; x.lineWidth = 3; x.strokeRect(6, 6, 1012, 156);
    const R = this.cfg.roles;
    const items = [['RRR', 'RUSH'], ['AAA', 'チャンス'], ['SSS', String(R.SUIKA.pay)], ['LLL', String(R.BELL.pay)], ['PPP', 'REPLAY'], ['C', String(R.CHERRY.pay)]];
    const colW = 1024 / items.length;
    items.forEach(([sy, txt], i) => {
      const cx = colW * i + colW / 2;
      for (let k = 0; k < sy.length; k++) drawSymbol(x, sy[k], cx + (k - (sy.length - 1) / 2) * 42, 62, 42, this.assets.images, false);
      x.font = `400 28px ${this.cfg.assets.jpFonts.display}`; x.textAlign = 'center';
      x.fillStyle = txt === 'RUSH' ? '#ff4a5a' : txt === 'チャンス' ? '#ffd23f' : '#e8d8ff';
      x.fillText(txt, cx, 132);
    });
    return Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 });
  }

  // データカウンター: AT 回数 / CZ 回数 / 現在のゲーム数 (AT 間)
  setCounter(st, blink = '') {
    const x = this.counterCanvas.getContext('2d'), W = 768, H = 320;
    const font = this.cfg.assets.jpFonts.display;
    x.fillStyle = '#05070c'; x.fillRect(0, 0, W, H);
    const seg = (label, v, cx, col) => {
      x.font = `400 22px ${font}`; x.fillStyle = '#8fa0b8'; x.textAlign = 'center'; x.fillText(label, cx, 34);
      x.font = '700 58px DSEG7'; x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillText('888', cx, 98);
      x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 12; x.fillText(String(v).padStart(3, '!'), cx, 98); x.shadowBlur = 0;
    };
    seg('AT', st.at || 0, 110, blink === 'AT' ? '#ffffff' : '#ff3b4b');
    seg('CZ', st.cz || 0, 290, '#b070ff');
    const since = st.since ?? st.sinceBonus ?? 0;
    seg('START', since % 1000, 490, since >= 600 ? '#ff5a3a' : '#ffd23f');
    x.font = `400 18px ${font}`; x.fillStyle = '#8fa0b8'; x.textAlign = 'right';
    x.fillText(`TOTAL ${st.games}`, W - 24, 34);
    const ng = st.normalGames || 0;
    const rate = (n) => (n > 0 && ng > 0 ? `1/${(ng / n).toFixed(0)}` : '---');
    x.font = `400 20px ${font}`; x.textAlign = 'left'; x.fillStyle = '#c9d4e4';
    x.fillText(`AT 初当り ${rate(st.at || 0)}`, 24, 134);
    x.fillStyle = '#b070ff'; x.fillText(`CZ ${rate(st.cz || 0)}`, 260, 134);
    x.fillStyle = '#8fa0b8'; x.textAlign = 'right'; x.fillText(`最大ハマり ${st.maxHamari || 0}`, W - 24, 134);
    // スランプグラフ
    const gx = 24, gy = 150, gw = W - 48, gh = 152;
    x.strokeStyle = '#1e2a3a'; x.lineWidth = 1; x.strokeRect(gx, gy, gw, gh);
    const gr = st.graph && st.graph.length > 1 ? st.graph : [0, 0];
    const mx = Math.max(500, ...gr.map(Math.abs));
    const mid = gy + gh / 2;
    x.strokeStyle = '#33465e'; x.beginPath(); x.moveTo(gx, mid); x.lineTo(gx + gw, mid); x.stroke();
    x.strokeStyle = '#c070ff'; x.lineWidth = 3; x.beginPath();
    gr.forEach((v, i) => { const px = gx + (i / (gr.length - 1)) * gw, py = mid - (v / mx) * (gh / 2 - 6); if (i) x.lineTo(px, py); else x.moveTo(px, py); });
    x.stroke();
    // AT 履歴 (直近 5 回の獲得枚数)
    x.textAlign = 'right'; x.font = `400 15px ${font}`; x.fillStyle = '#6a7a90';
    (st.atHistory || []).slice(0, 5).forEach((h, i) => x.fillText(`${h.net}枚`, W - 30, gy + 20 + i * 20));
    x.textAlign = 'left';
    x.fillText(`+${mx}`, gx + 6, gy + 18); x.fillText(`-${mx}`, gx + 6, gy + gh - 8);
    this.counterTex.needsUpdate = true;
  }

  // ---------------- 飛び出す PUSH ボタン ----------------
  buildPush() {
    const { deckY, front } = this.D;
    const grp = new THREE.Group();
    grp.position.set(0.3, deckY + 0.038, front + 0.1);
    grp.rotation.x = 0.42;
    this.group.add(grp);
    // 台座 (クロームのリング)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.054, 0.012, 48), this.m.chrome);
    grp.add(ring);
    // 押し込む本体 (せり上がる)
    const body = new THREE.Group();
    grp.add(body);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const face = this.assets.images.push;
    x.fillStyle = '#c0001c'; x.fillRect(0, 0, 256, 256);
    if (face) { x.imageSmoothingEnabled = true; x.drawImage(face, 0, 0, 256, 256); }
    x.font = `400 64px ${this.cfg.assets.jpFonts.display}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = '#4a0008'; x.strokeText('PUSH', 128, 122);
    x.fillStyle = '#fff'; x.fillText('PUSH', 128, 122);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.pushMat = new THREE.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 });
    const sideMat = new THREE.MeshPhysicalMaterial({ color: 0xa00018, emissive: 0xff1030, emissiveIntensity: 0.2, roughness: 0.2, clearcoat: 1, transparent: true, opacity: 0.92 });
    this.pushSideMat = sideMat;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.044, 0.03, 48), [sideMat, this.pushMat, sideMat]);
    cap.position.y = 0.012;
    // 上面だけ画像を貼るため、円柱の上面 UV を円形に合わせる (既定どおり)
    cap.userData.action = 'push';
    body.add(cap);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.03; hit.userData.action = 'push';
    body.add(hit);
    this.pickables.push(cap, hit);
    // 発光のハロ
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.11, 48), new THREE.MeshBasicMaterial({ color: hdr(0xff2040, 3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.008;
    grp.add(halo);
    this.pushLight = new THREE.PointLight(0xff2040, 0, 0.9, 2);
    this.pushLight.position.set(0, 0.1, 0.05);
    grp.add(this.pushLight);
    this.push = { grp, body, cap, halo, pop: 0, target: 0, press: 0, color: new THREE.Color(0xff2040), rainbow: false };
  }

  // 激アツ時にボタンがせり上がって大きくなる
  popPush(color = 0xff2040, rainbow = false) {
    this.push.target = 1;
    this.push.color.set(color);
    this.push.rainbow = rainbow;
    this.pickables.includes(this.push.cap) || this.pickables.push(this.push.cap);
  }
  retractPush() { this.push.target = 0; }
  pressPush() { this.push.press = 1; }

  // ---------------- 剣の役物 (液晶上部から落ちてくる) ----------------
  buildGimmick() {
    // 液晶と看板のあいだの黒い帯 (役物の背景) と紫の LED ライン
    const top = this.D.lcdY + this.D.lcdH / 2, h = 2.26 - top;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(this.D.W - 0.06, h), new THREE.MeshStandardMaterial({ color: 0x07020c, roughness: 0.5, metalness: 0.3 }));
    band.position.set(0, top + h / 2 + 0.01, this.D.front + 0.0112);
    this.group.add(band);
    this.topLine = new THREE.Mesh(new THREE.PlaneGeometry(this.D.W - 0.08, 0.006), new THREE.MeshBasicMaterial({ color: hdr(0xa040ff, 3), toneMapped: false }));
    this.topLine.position.set(0, top + 0.03, this.D.front + 0.0118);
    this.group.add(this.topLine);
    const g = new THREE.Group();
    g.position.set(0, this.D.lcdY + this.D.lcdH / 2 + 0.035, this.D.front + 0.03);
    this.group.add(g);
    // 紋章 (盾形のプレート) + 中に剣のモデル (読み込み後に attachSword で差し込む)
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.045, 6), new THREE.MeshPhysicalMaterial({ color: 0x1a1024, metalness: 0.9, roughness: 0.25, emissive: 0x6020c0, emissiveIntensity: 0.4 }));
    plate.rotation.z = Math.PI / 6;
    g.add(plate);
    this.gim = { g, plate, y0: g.position.y, drop: 0, target: 0, sword: null, spin: 0 };
  }

  attachSword(src) {
    if (!src) return;
    const s = src.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    const k = 0.24 / Math.max(size.x, size.y, size.z);
    s.scale.setScalar(k);
    const ctr = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
    s.position.sub(ctr);
    s.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xc8c8d8, metalness: 1, roughness: 0.2, emissive: new THREE.Color(0x8a2aff), emissiveIntensity: 0.6 }); });
    const holder = new THREE.Group();
    holder.add(s);
    // 横向きに寝かせる (長い軸を x に)
    if (size.y >= size.x && size.y >= size.z) holder.rotation.z = Math.PI / 2;
    else if (size.z >= size.x) holder.rotation.y = Math.PI / 2;
    holder.position.z = 0.012;
    this.gim.g.add(holder);
    this.gim.sword = holder;
  }

  // 役物落下 (on = true で下がりっぱなし。数秒で戻すときは autoBack)
  dropGimmick(ms = 1600) {
    this.gim.target = 1;
    clearTimeout(this.gim.timer);
    if (ms) this.gim.timer = setTimeout(() => { this.gim.target = 0; }, ms);
  }

  update(dt) {
    super.update(dt);
    const t = this.time;
    // PUSH ボタン
    const P = this.push;
    P.pop += (P.target - P.pop) * Math.min(1, dt * (P.target ? 9 : 5));
    P.press = Math.max(0, P.press - dt * 5);
    const s = 1 + P.pop * 0.9;
    P.body.scale.set(s, 1 + P.pop * 1.6, s);
    P.body.position.y = P.pop * 0.04 - P.press * 0.02;
    P.grp.scale.setScalar(1 + P.pop * 0.25);
    const col = P.rainbow ? new THREE.Color().setHSL((t * 1.4) % 1, 1, 0.55) : P.color;
    const blink = P.target ? 0.6 + 0.4 * (Math.sin(t * 22) > 0 ? 1 : 0) : 0;
    P.halo.material.color.copy(col).multiplyScalar(3);
    P.halo.material.opacity = P.pop * blink;
    P.halo.scale.setScalar(1 + P.pop * 0.6 + (P.target ? 0.15 * Math.sin(t * 9) : 0));
    this.pushLight.color.copy(col);
    this.pushLight.intensity = P.pop * blink * 2.2;
    this.pushMat.emissiveIntensity = 0.25 + P.pop * blink * 1.2;
    this.pushSideMat.emissive.copy(col);
    this.pushSideMat.emissiveIntensity = 0.2 + P.pop * blink * 1.5;
    // 役物
    const G = this.gim;
    G.drop += (G.target - G.drop) * Math.min(1, dt * (G.target ? 14 : 3));
    G.g.position.y = G.y0 - G.drop * 0.17 + (G.target ? Math.sin(t * 40) * 0.002 : 0);
    G.g.scale.setScalar(1 + G.drop * 0.5);
    G.plate.material.emissiveIntensity = 0.4 + G.drop * 2.5;
    if (G.sword) G.sword.rotation.x += dt * (0.4 + G.drop * 8);
    this.topLine.material.color.setHSL(this.lights.mode === 'rainbow' ? (t * 0.8) % 1 : this.lights.neonHue, 1, 0.55).multiplyScalar(this.lights.mode === 'off' ? 0.1 : 3);
    // 液晶の明るさ (暗転演出)
    this.lcdMat.color.setScalar(this.lcdBright);
  }
}
