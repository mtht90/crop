// =====================================================================
//  DARKNIGHT 液晶の前面レイヤー (2D Canvas)
//   3D の舞台 (stage.js) の上に重ねる文字・帯・ナビ・ゲージ
// =====================================================================

export const BAND = {
  blue: ['#0a2a8a', '#2a7aff', '#bfe0ff'],
  green: ['#0a5a2a', '#2aff7a', '#d0ffe0'],
  red: ['#6a0010', '#ff1f3a', '#ffd0d0'],
  gold: ['#6a4200', '#ffc21a', '#fff4c0'],
  purple: ['#2a0a5a', '#a040ff', '#f0d8ff'],
  rainbow: null,
};
export const STAGE_NAMES = ['夜の城', '赤い月', '嵐の丘', '紫の霧'];
const REEL_X = [0.3, 0.5, 0.7]; // ナビ数字を出す位置 (リールの真上)

export class DarkScreen {
  constructor(canvas, font) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.W = canvas.width; this.H = canvas.height;
    this.font = font;
    this.scene = 'idle';
    this.status = { state: 'normal', atLeft: 0, net: 0, lbLeft: 0, czLeft: 0, czGauge: 0, stage: 0, battleLeft: 0, total: 0 };
    this.items = [];     // 時間で消える演出
    this.step = null;    // ステップアップ予告
    this.naviOrder = null;
    this.naviDone = [];
    this.flashA = 0; this.flashC = '#fff';
    this.result = null;
    this.t = 0;
  }

  set(scene) {
    this.scene = scene;
    if (scene === 'idle') { this.items = []; this.step = null; this.naviOrder = null; this.result = null; }
  }

  // ---------------- 演出の部品 ----------------
  banner(text, o = {}) {
    this.items.push({ kind: 'banner', text, sub: o.sub || '', band: o.band || 'purple', size: o.size || 120, t0: this.t, dur: o.dur || 1.8, y: o.y ?? 0.5 });
  }
  cutin(text, band) { this.items.push({ kind: 'cutin', text, band, t0: this.t, dur: 1.6 }); }
  popup(text, color = '#ffd23f', o = {}) { this.items.push({ kind: 'popup', text, color, t0: this.t, dur: o.dur || 1.4, size: o.size || 150, y: o.y ?? 0.42 }); }
  telop(text, o = {}) { this.items.push({ kind: 'telop', text, color: o.color || '#fff', t0: this.t, dur: o.dur || 2.2 }); }
  clearKind(kind) { this.items = this.items.filter((it) => it.kind !== kind); }
  flash(color = '#fff', a = 1) { this.flashC = color; this.flashA = a; }
  setStep(level, band) { this.step = { level, band, t0: this.t }; }
  clearStep() { this.step = null; }
  navi(order, done = []) { this.naviOrder = order; this.naviDone = done; this.naviT0 = this.t; }
  clearNavi() { this.naviOrder = null; }
  showResult(r) { this.result = { ...r, t0: this.t }; }
  clearResult() { this.result = null; }

  // ---------------- 描画 ----------------
  draw(t) {
    this.t = t;
    const { x, W, H } = this;
    x.clearRect(0, 0, W, H);
    this.drawHud();
    if (this.step) this.drawStep();
    if (this.naviOrder) this.drawNavi();
    this.items = this.items.filter((it) => t - it.t0 < it.dur);
    for (const it of this.items) {
      const k = (t - it.t0) / it.dur;
      if (it.kind === 'banner') this.drawBanner(it, k);
      else if (it.kind === 'cutin') this.drawCutin(it, k);
      else if (it.kind === 'popup') this.drawPopup(it, k);
      else if (it.kind === 'telop') this.drawTelop(it, k);
    }
    if (this.result) this.drawResult();
    if (this.flashA > 0) {
      x.globalAlpha = Math.min(1, this.flashA);
      x.fillStyle = this.flashC; x.fillRect(0, 0, W, H);
      x.globalAlpha = 1;
      this.flashA = Math.max(0, this.flashA - 0.06);
    }
  }

  text(str, cx, cy, size, fill, stroke = '#000', lw = size * 0.16, align = 'center') {
    const x = this.x;
    x.font = `400 ${size}px ${this.font}`;
    x.textAlign = align; x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.lineWidth = lw; x.strokeStyle = stroke; x.strokeText(str, cx, cy);
    x.fillStyle = fill; x.fillText(str, cx, cy);
  }

  bandFill(band, x0, y0, w, h) {
    const x = this.x;
    let g;
    if (band === 'rainbow') {
      g = x.createLinearGradient(x0, 0, x0 + w, 0);
      const s = this.t * 0.6;
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${((i / 6 + s) % 1) * 360},100%,55%)`);
    } else {
      const [d, m] = BAND[band] || BAND.purple;
      g = x.createLinearGradient(0, y0, 0, y0 + h);
      g.addColorStop(0, d); g.addColorStop(0.5, m); g.addColorStop(1, d);
    }
    return g;
  }

  gradText(band) {
    const x = this.x;
    if (band === 'rainbow') {
      const g = x.createLinearGradient(0, 0, this.W, 0);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${((i / 6 + this.t * 0.6) % 1) * 360},100%,70%)`);
      return g;
    }
    const g = x.createLinearGradient(0, this.H * 0.35, 0, this.H * 0.65);
    const c = (BAND[band] || BAND.purple)[2];
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, c); g.addColorStop(1, (BAND[band] || BAND.purple)[1]);
    return g;
  }

  drawBanner(it, k) {
    const { x, W, H } = this;
    const inK = Math.min(1, k * it.dur / 0.18), outK = Math.min(1, (1 - k) * it.dur / 0.25);
    const bh = it.size * 1.45 * outK;
    const cy = H * it.y;
    x.save();
    x.globalAlpha = 0.88;
    x.fillStyle = this.bandFill(it.band, 0, cy - bh / 2, W, bh);
    x.fillRect(0, cy - bh / 2, W * inK, bh);
    x.globalAlpha = 1;
    // 帯のふちの光
    x.fillStyle = 'rgba(255,255,255,0.8)';
    x.fillRect(0, cy - bh / 2, W * inK, 3); x.fillRect(W * (1 - inK), cy + bh / 2 - 3, W * inK, 3);
    const s = 1 + (1 - inK) * 0.8;
    x.translate(W / 2, cy); x.scale(s, s);
    x.font = `400 ${it.size}px ${this.font}`;
    const fit = Math.min(it.size, it.size * (W * 0.9) / Math.max(1, x.measureText(it.text).width)); // 液晶の幅に収める
    this.text(it.text, 0, it.sub ? -it.size * 0.12 : 0, fit, this.gradText(it.band), '#0a0010', fit * 0.14);
    if (it.sub) this.text(it.sub, 0, it.size * 0.52, it.size * 0.3, '#fff', '#000', 6);
    x.restore();
  }

  drawCutin(it, k) {
    const { x, W, H } = this;
    const slide = k < 0.15 ? 1 - k / 0.15 : k > 0.85 ? -(k - 0.85) / 0.15 : 0;
    x.save();
    x.translate(slide * W, 0);
    x.beginPath();
    x.moveTo(0, H * 0.58); x.lineTo(W, H * 0.4); x.lineTo(W, H * 0.66); x.lineTo(0, H * 0.84); x.closePath();
    x.fillStyle = this.bandFill(it.band, 0, H * 0.4, W, H * 0.44);
    x.globalAlpha = 0.92; x.fill(); x.globalAlpha = 1;
    // 集中線
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2;
    for (let i = 0; i < 24; i++) { const yy = H * 0.45 + ((i * 37 + this.t * 900) % (H * 0.35)); x.beginPath(); x.moveTo(0, yy + 40); x.lineTo(W, yy - 60); x.stroke(); }
    x.translate(W / 2, H * 0.62); x.rotate(-0.17);
    this.text(it.text, 0, 0, 86, this.gradText(it.band), '#000', 12);
    x.restore();
  }

  drawPopup(it, k) {
    const s = k < 0.12 ? 0.3 + k / 0.12 * 0.9 : k < 0.2 ? 1.2 - (k - 0.12) / 0.08 * 0.2 : 1;
    const x = this.x;
    x.save();
    x.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
    x.translate(this.W / 2, this.H * it.y - k * 30);
    x.scale(s, s);
    x.shadowColor = it.color; x.shadowBlur = 40;
    this.text(it.text, 0, 0, it.size, it.color, '#1a0800', it.size * 0.12);
    x.restore();
  }

  drawTelop(it, k) {
    const { x, W, H } = this;
    x.save();
    x.globalAlpha = Math.min(1, k * 8, (1 - k) * 6);
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(0, H - 92, W, 64);
    this.text(it.text, W / 2, H - 60, 38, it.color, '#000', 6);
    x.restore();
  }

  // ステップアップ予告: 枠が段階ごとに増えて色が上がる
  drawStep() {
    const { x, W } = this;
    const st = this.step;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const on = i < st.level;
      const bx = W / 2 - (n * 66) / 2 + i * 66, by = 24;
      x.fillStyle = on ? this.bandFill(i === st.level - 1 ? st.band : 'purple', bx, by, 56, 40) : 'rgba(255,255,255,0.08)';
      x.fillRect(bx, by, 56, 40);
      x.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; x.lineWidth = 2; x.strokeRect(bx, by, 56, 40);
      if (on) this.text(String(i + 1), bx + 28, by + 21, 28, '#fff', '#000', 5);
    }
    const age = this.t - st.t0;
    if (age < 0.6) this.text(`STEP ${st.level}`, W / 2, 110, 54 * (1 + (0.6 - age)), this.gradText(st.band), '#000', 9);
  }

  // 押し順ナビ: リールの真上に大きな数字
  drawNavi() {
    const { x, W, H } = this;
    const ord = this.naviOrder;
    const idx = { L: 0, C: 1, R: 2 };
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 10);
    x.save();
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.fillRect(W * 0.18, H - 170, W * 0.64, 150);
    for (let k = 0; k < 3; k++) {
      const reel = idx[ord[k]];
      const done = this.naviDone.includes(reel);
      const cx = W * REEL_X[reel], cy = H - 95;
      const next = !done && this.naviDone.length === k;
      const sz = next ? 120 * pulse : 96;
      x.globalAlpha = done ? 0.25 : 1;
      x.shadowColor = '#ffd23f'; x.shadowBlur = next ? 30 : 0;
      this.text(String(k + 1), cx, cy, sz, next ? '#fff6a0' : '#ffd23f', '#3a0000', 14);
      x.shadowBlur = 0;
    }
    x.globalAlpha = 1;
    this.text('押し順ナビ', W / 2, H - 182, 28, '#ffd23f', '#000', 5);
    x.restore();
  }

  drawHud() {
    const { x, W } = this;
    const s = this.status;
    if (s.state === 'at' || s.state === 'lb') {
      // 上部の AT 帯
      const lb = s.state === 'lb';
      x.fillStyle = lb ? this.bandFill('rainbow', 0, 0, W, 64) : 'rgba(40,0,10,0.75)';
      x.fillRect(0, 0, W, 64);
      this.text(lb ? 'LIMIT BREAK' : 'DARKNIGHT RUSH', 24, 33, 34, lb ? '#fff' : '#ff4a5a', '#000', 6, 'left');
      this.text(`残り ${s.atLeft}G`, W - 24, 33, 40, '#ffd23f', '#000', 7, 'right');
      this.text(`獲得 ${Math.max(0, s.net)}枚`, W / 2 + 60, 33, 30, '#fff', '#000', 5);
    } else if (s.state === 'cz') {
      x.fillStyle = 'rgba(20,0,40,0.75)'; x.fillRect(0, 0, W, 64);
      this.text('DARK GATE', 24, 33, 34, '#c080ff', '#000', 6, 'left');
      this.text(`残り ${s.czLeft}G`, W - 24, 33, 38, '#fff', '#000', 6, 'right');
      // 勝利期待度ゲージ
      const gx = W * 0.42, gw = W * 0.3;
      x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(gx, 20, gw, 26);
      x.fillStyle = this.bandFill(s.czGauge > 0.8 ? 'rainbow' : s.czGauge > 0.5 ? 'red' : 'purple', gx, 20, gw, 26);
      x.fillRect(gx, 20, gw * s.czGauge, 26);
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.strokeRect(gx, 20, gw, 26);
    } else if (s.state === 'battle') {
      x.fillStyle = 'rgba(40,0,0,0.75)'; x.fillRect(0, 0, W, 64);
      this.text('BATTLE', 24, 33, 38, '#ff3b4b', '#000', 6, 'left');
      this.text(s.enemyName || '', W / 2, 33, 32, s.enemyColor || '#fff', '#000', 6);
      this.text(s.battleLeft > 0 ? `残り ${s.battleLeft}G` : 'FINAL', W - 24, 33, 34, '#ffd23f', '#000', 6, 'right');
    } else {
      // 通常時: 左下に小さくステージ名
      this.text(STAGE_NAMES[s.stage] || '', 20, 30, 24, 'rgba(255,255,255,0.75)', 'rgba(0,0,0,0.8)', 5, 'left');
    }
  }

  drawResult() {
    const { x, W, H } = this;
    const r = this.result;
    const a = Math.min(1, (this.t - r.t0) * 3);
    x.save();
    x.globalAlpha = a;
    x.fillStyle = 'rgba(5,0,12,0.78)'; x.fillRect(W * 0.12, H * 0.16, W * 0.76, H * 0.68);
    x.strokeStyle = r.full ? '#ffd23f' : '#a040ff'; x.lineWidth = 4; x.strokeRect(W * 0.12, H * 0.16, W * 0.76, H * 0.68);
    this.text(r.full ? 'COMPLETE!!' : 'RUSH RESULT', W / 2, H * 0.27, 60, r.full ? this.gradText('rainbow') : '#e0c0ff', '#000', 8);
    this.text(`${Math.max(0, r.net)}`, W / 2, H * 0.5, 150, this.gradText('gold'), '#1a0800', 16);
    this.text('枚 獲得', W / 2 + 230, H * 0.55, 40, '#fff', '#000', 6);
    this.text(`${r.total}G 継続`, W / 2, H * 0.72, 40, '#fff', '#000', 6);
    x.restore();
  }
}
