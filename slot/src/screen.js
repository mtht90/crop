// =====================================================================
//  上部液晶 (1024×512 の Canvas を毎フレーム描いて筐体のパネルに貼る)
//   通常時   : ピエロがジャグリングしているだけ
//   予告     : レバーON で始まり、停止ごとに昇格する (ジャグリング加速 / ピエロ顔アップ /
//              カットイン (色で期待度) / 7 飛来 / 暗転)。第3停止ボタンを離した瞬間に決着
//   告知     : 液晶全体が「LUCKY!!」で光る (ジャグラーのランプの代わり)。7 を揃えるまで点きっぱなし
//   ボーナス : ピエロが 7 をジャグリング + 獲得枚数
// =====================================================================
const W = 1024, H = 512;
const COLORS = {
  blue: ['#3aa0ff', '#0a3cc0'], green: ['#5dff7a', '#0a8a2a'], red: ['#ff4a4a', '#9a0010'],
  gold: ['#fff07a', '#d08a00'], rainbow: null,
};
const ORDER = ['blue', 'green', 'red', 'gold', 'rainbow'];
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

export class Screen {
  constructor(canvas, images, gothic) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.img = images;
    this.gothic = gothic || 'sans-serif';
    this.scene = 'idle';
    this.t0 = 0;            // シーン開始時刻
    this.now = 0;
    this.pv = null;         // 進行中の予告
    this.premium = false;
    this.bonus = { type: 'BIG', paid: 0, max: 312 };
    this.flash = 0;
  }

  // ---------------- 外部 API ----------------
  set(scene, opts = {}) {
    this.scene = scene;
    this.t0 = this.now;
    if (scene === 'lit') { this.premium = !!opts.premium; this.flash = 0.55; this.pv = null; }
    if (scene === 'bonus') { this.bonus = { type: opts.type, paid: 0, max: opts.max }; this.pv = null; }
    if (scene === 'result') this.result = { type: opts.type, paid: opts.paid };
    if (scene === 'idle') this.pv = null;
  }

  // 予告開始。type: balls | face | cutin | seven | blackout, color: カットインの最終色, sevens: 飛来する 7 の数 (3 で揃う)
  preview(p) {
    this.pv = { ...p, stage: 0, t0: this.now, stageT: this.now, fail: false };
    this.scene = 'preview';
    this.t0 = this.now;
  }

  // 第 n 停止 (1〜3)。予告が昇格する
  step(n) {
    if (!this.pv) return;
    this.pv.stage = n;
    this.pv.stageT = this.now;
  }

  // 予告の決着 (はずれ)。当たりは呼び出し側が set('lit') する
  fail() {
    if (!this.pv) return;
    this.pv.fail = true;
    this.pv.failT = this.now;
  }

  // カットイン色の昇格: 最終色へ向けて停止ごとに上がる
  colorAt(stage) {
    const fi = ORDER.indexOf(this.pv.color || 'blue');
    const steps = [Math.min(fi, 0), Math.min(fi, Math.max(0, fi - 1)), fi];
    return ORDER[steps[Math.max(0, Math.min(2, stage - 1))]];
  }

  // ---------------- 描画 ----------------
  draw(t) {
    this.now = t;
    const x = this.x;
    x.save();
    const st = t - this.t0;
    switch (this.scene) {
      case 'lit': this.drawLit(t, st); break;
      case 'bonus': this.drawBonus(t, st); break;
      case 'result': this.drawResult(t, st); if (st > 3) this.set('idle'); break;
      case 'preview': this.drawPreview(t); break;
      default: this.drawIdle(t, 1);
    }
    x.restore();
    this.drawFrame(t);
  }

  // 背景 (放射光 + 星)
  bg(t, c0, c1, spin = 0.06, rays = 'rgba(255,220,140,0.07)') {
    const x = this.x;
    const g = x.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.translate(W / 2, H * 0.55); x.rotate(t * spin);
    for (let i = 0; i < 24; i++) {
      x.rotate(Math.PI / 12);
      if (i % 2) continue;
      x.fillStyle = rays;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(1000, -90); x.lineTo(1000, 90); x.fill();
    }
    x.restore();
    for (let i = 0; i < 16; i++) {
      const tw = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.7);
      this.star(40 + ((i * 173) % 960), 30 + ((i * 97) % 450), 6 + (i % 4) * 5, `rgba(255,${210 + (i % 3) * 15},${110 + (i % 5) * 25},${0.25 + tw * 0.7})`);
    }
  }

  star(cx, cy, r, col) {
    const x = this.x;
    x.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fillStyle = col; x.fill();
  }

  clown(cx, cy, h, rot = 0, alpha = 1) {
    const im = this.img.clown;
    if (!im) return;
    const x = this.x, w = im.width * (h / im.height);
    x.save(); x.globalAlpha = alpha; x.translate(cx, cy); x.rotate(rot);
    x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 20; x.shadowOffsetY = 8;
    x.drawImage(im, -w / 2, -h / 2, w, h);
    x.restore();
  }

  // ジャグリングの玉 (または 7)
  juggle(cx, cy, t, speed, n, what = 'ball', spread = 1) {
    const x = this.x;
    for (let i = 0; i < n; i++) {
      const ph = (t * speed + i / n) % 1;
      const side = Math.floor((t * speed + i / n) % 2) ? 1 : -1;
      const bx = cx + side * (1 - 2 * ph) * 150 * spread;
      const by = cy - Math.sin(ph * Math.PI) * 190 * spread;
      if (what === 'seven') this.seven(bx, by, 0.42, Math.sin(t * 6 + i) * 0.3);
      else {
        const hue = (i * 120 + t * 40) % 360;
        const g = x.createRadialGradient(bx - 8, by - 8, 2, bx, by, 26);
        g.addColorStop(0, '#fff'); g.addColorStop(0.3, `hsl(${hue},95%,60%)`); g.addColorStop(1, `hsl(${hue},90%,30%)`);
        x.fillStyle = g; x.beginPath(); x.arc(bx, by, 24, 0, Math.PI * 2); x.fill();
      }
    }
  }

  seven(cx, cy, s = 1, rot = 0, glow = 0) {
    const x = this.x;
    x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
    x.font = '170px Bungee'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    if (glow) { x.shadowColor = '#ffd84a'; x.shadowBlur = 40 * glow; }
    x.lineWidth = 18; x.strokeStyle = '#2a0008'; x.strokeText('7', 0, 0);
    x.shadowBlur = 0;
    const g = x.createLinearGradient(0, -80, 0, 80); g.addColorStop(0, '#ff8a7a'); g.addColorStop(0.5, '#e3001b'); g.addColorStop(1, '#6a0010');
    x.fillStyle = g; x.fillText('7', 0, 0);
    x.restore();
  }

  logo(cx, cy, s, t, hot = 0) {
    const x = this.x;
    x.save(); x.translate(cx, cy); x.rotate(-0.06); x.scale(s, s);
    x.font = '170px Bungee'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (let k = 5; k >= 0; k--) { x.lineWidth = 16 + k * 8; x.strokeStyle = `hsl(${(k * 55 + t * 200 * hot) % 360},95%,${45 + k * 3}%)`; x.strokeText('SLOT', 0, 6); }
    const lg = x.createLinearGradient(0, -80, 0, 90); lg.addColorStop(0, '#fffbe6'); lg.addColorStop(0.5, '#ffe14d'); lg.addColorStop(1, '#ff9a00');
    x.fillStyle = lg; x.fillText('SLOT', 0, 6);
    x.restore();
  }

  // 縁取り付きの文字
  text(str, cx, cy, size, fill, stroke = '#120018', font = 'Bungee') {
    const x = this.x;
    x.font = `900 ${size}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = size * 0.16; x.strokeStyle = stroke; x.strokeText(str, cx, cy);
    x.fillStyle = fill; x.fillText(str, cx, cy);
  }

  rainbowFill(y0, y1, t) {
    const g = this.x.createLinearGradient(0, y0, W, y1);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + t * 240) % 360},100%,60%)`);
    return g;
  }

  // ---------------- シーン ----------------
  drawIdle(t, speed) {
    this.bg(t, '#2b3fb0', '#05061a');
    const bob = Math.sin(t * 2.2) * 8;
    this.juggle(W * 0.27, H * 0.42, t, 0.55 * speed, 3);
    this.clown(W * 0.27, H * 0.58 + bob, H * 0.74, Math.sin(t * 1.3) * 0.05);
    this.logo(W * 0.71, H * 0.42, 1, t);
    for (let i = 0; i < 3; i++) this.seven(W * 0.59 + i * 120, H * 0.78 + Math.sin(t * 3 + i) * 4, 0.55);
  }

  drawPreview(t) {
    const p = this.pv;
    const st = t - p.t0, sst = t - p.stageT;
    const failK = p.fail ? Math.min(1, (t - p.failT) / 0.9) : 0;
    if (p.fail && failK >= 1) { this.set('idle'); this.drawIdle(t, 1); return; }
    const x = this.x;

    if (p.type === 'balls') {
      // ジャグリング加速: 停止ごとに玉が増えて速くなる
      this.bg(t, '#3a2ab0', '#08061e', 0.2 + p.stage * 0.3);
      const n = 3 + p.stage;
      this.juggle(W / 2, H * 0.4, t, 0.8 + p.stage * 0.45, n, 'ball', 1.35);
      this.clown(W / 2, H * 0.6 + Math.sin(t * 9) * 6, H * 0.72);
      if (p.fail) this.dropBalls(failK);
    } else if (p.type === 'face') {
      // ピエロ顔アップ: 停止ごとに迫ってくる
      this.bg(t, '#5a1a8a', '#100420', 0.3);
      const z = [0.75, 1.0, 1.3, 1.65][p.stage];
      const zz = z + (1 - ease(sst / 0.35)) * -0.1;
      this.clown(W / 2, H * 0.55 + (zz - 1) * 120, H * zz, Math.sin(t * 14) * 0.03 * p.stage);
      if (p.stage >= 1) this.text(p.stage >= 3 ? '!!!' : p.stage === 2 ? '!!' : '!', W * 0.82, H * 0.3, 120, '#ffe14d');
    } else if (p.type === 'cutin') {
      // カットイン: 帯の色が期待度 (青 < 緑 < 赤 < 金 < 虹)
      this.drawIdle(t, 1.6);
      if (p.stage >= 1) {
        const col = this.colorAt(p.stage);
        const k = ease(sst / 0.25);
        const y = H * 0.5;
        x.save();
        x.translate((1 - k) * -W, 0);
        x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, y - 110, W, 220);
        const c = COLORS[col];
        x.fillStyle = c ? (() => { const g = x.createLinearGradient(0, y - 90, 0, y + 90); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]); return g; })() : this.rainbowFill(0, 0, t);
        x.beginPath(); x.moveTo(0, y - 90); x.lineTo(W, y - 70); x.lineTo(W, y + 70); x.lineTo(0, y + 90); x.fill();
        this.clown(W * 0.16, y, 230, -0.15);
        const label = { blue: 'CHANCE', green: 'CHANCE!', red: 'BIG CHANCE!', gold: '激アツ!!', rainbow: 'LUCKY!?' }[col];
        const jp = col === 'gold';
        this.text(label, W * 0.6, y + 4, jp ? 120 : 100, '#fff', '#120018', jp ? this.gothic : 'Bungee');
        x.restore();
      }
    } else if (p.type === 'seven') {
      // 7 飛来: 停止ごとに 7 が 1 つずつ落ちてくる。3 つ並べば…
      this.bg(t, '#0a2a60', '#02040e', 0.15);
      this.clown(W * 0.14, H * 0.66, H * 0.5, Math.sin(t * 3) * 0.08, 0.9);
      const shown = Math.min(p.stage, p.sevens);
      for (let i = 0; i < 3; i++) {
        const cx = W * 0.4 + i * 190;
        x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 4;
        x.strokeRect(cx - 80, H * 0.5 - 100, 160, 200);
        if (i < shown) {
          const k = i === shown - 1 ? ease(sst / 0.3) : 1;
          this.seven(cx, H * 0.5 - (1 - k) * 400, 0.85, 0, shown === 3 ? 1 : 0.3);
        }
      }
      if (p.fail) this.text('…', W / 2, H * 0.85, 80, '#aaa');
    } else if (p.type === 'blackout') {
      // 暗転: 真っ暗の中で心音
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      const beat = Math.pow(Math.max(0, Math.sin(st * Math.PI * (1.6 + p.stage * 0.5))), 8);
      x.fillStyle = `rgba(255,40,80,${0.15 + beat * 0.35})`;
      x.beginPath(); x.arc(W / 2, H / 2, 60 + beat * 40, 0, Math.PI * 2); x.fill();
      if (p.stage >= 2) this.clown(W / 2, H * 0.55, H * 0.6, 0, 0.12 + beat * 0.2);
    }
    if (p.fail) {
      x.fillStyle = `rgba(4,4,20,${failK * 0.85})`; x.fillRect(0, 0, W, H);
    }
  }

  dropBalls(k) {
    const x = this.x;
    for (let i = 0; i < 5; i++) {
      const bx = W / 2 - 220 + i * 110, by = H * 0.2 + ease(k) * H * 0.9;
      x.fillStyle = `hsl(${i * 70},80%,55%)`; x.beginPath(); x.arc(bx, by, 22, 0, Math.PI * 2); x.fill();
    }
  }

  // 告知 (ランプの代わり)。7 を揃えるまで点きっぱなし
  drawLit(t, st) {
    const x = this.x;
    const prem = this.premium;
    this.flash = Math.max(0, this.flash - 0.03);
    const c0 = prem ? `hsl(${(t * 160) % 360},80%,45%)` : '#d0308a';
    this.bg(t, c0, prem ? '#200030' : '#3a0026', 0.5, 'rgba(255,255,255,0.14)');
    const pop = 1 + (1 - ease(st / 0.35)) * 0.6 + Math.sin(t * 6) * 0.02;
    x.save(); x.translate(W / 2, H * 0.43); x.scale(pop, pop);
    x.font = '210px Bungee'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = 34; x.strokeStyle = '#3a0026'; x.strokeText('LUCKY!!', 0, 0);
    x.fillStyle = prem ? this.rainbowFill(-300, 300, t) : (() => { const g = x.createLinearGradient(0, -90, 0, 90); g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, '#ffe14d'); g.addColorStop(1, '#ff8a00'); return g; })();
    x.fillText('LUCKY!!', 0, 0);
    x.restore();
    if (st > 1.2) {
      const blink = Math.sin(t * 8) > -0.3;
      if (blink) this.text('7 を狙え!', W / 2, H * 0.8, 74, '#fff', '#3a0026', this.gothic);
    }
    if (this.flash > 0) { x.fillStyle = `rgba(255,255,255,${this.flash})`; x.fillRect(0, 0, W, H); }
  }

  drawBonus(t, st) {
    const big = this.bonus.type === 'BIG';
    this.bg(t, big ? '#c0102a' : '#1050c0', big ? '#2a0008' : '#04103a', 0.4, 'rgba(255,240,160,0.12)');
    this.juggle(W * 0.25, H * 0.42, t, 1.0, 3, 'seven');
    this.clown(W * 0.25, H * 0.62 + Math.sin(t * 6) * 8, H * 0.66, Math.sin(t * 3) * 0.06);
    const pop = 1 + (1 - ease(st / 0.4)) * 0.8;
    const x = this.x;
    x.save(); x.translate(W * 0.68, H * 0.3); x.scale(pop, pop);
    this.text(big ? 'BIG BONUS' : 'REG BONUS', 0, 0, 92, this.rainbowFill(-300, 300, t));
    x.restore();
    const { paid, max } = this.bonus;
    this.text(`${paid}`, W * 0.64, H * 0.64, 130, '#fff');
    this.text(`/ ${max} 枚`, W * 0.86, H * 0.68, 56, '#ffe14d', '#120018', this.gothic);
    // ゲージ
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(W * 0.46, H * 0.84, W * 0.48, 26);
    x.fillStyle = this.rainbowFill(0, 0, t); x.fillRect(W * 0.46, H * 0.84, W * 0.48 * Math.min(1, paid / max), 26);
  }

  drawResult(t, st) {
    const r = this.result;
    this.bg(t, '#d0a000', '#2a1600', 0.3, 'rgba(255,255,255,0.12)');
    this.clown(W * 0.2, H * 0.58, H * 0.7, Math.sin(t * 5) * 0.1);
    this.text(`${r.type} 終了`, W * 0.62, H * 0.32, 80, '#fff', '#120018', this.gothic);
    this.text(`${r.paid} 枚 GET!`, W * 0.62, H * 0.62, 110, '#ffe14d', '#120018', this.gothic);
  }

  // 縁の電球 (チェイス)
  drawFrame(t) {
    const x = this.x;
    const hot = this.scene === 'lit' || this.scene === 'bonus' || (this.pv && this.pv.stage >= 2);
    const n = 46;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      let bx, by;
      if (p < 0.35) { bx = 20 + (p / 0.35) * (W - 40); by = 16; } else if (p < 0.5) { bx = W - 16; by = 16 + ((p - 0.35) / 0.15) * (H - 32); }
      else if (p < 0.85) { bx = W - 20 - ((p - 0.5) / 0.35) * (W - 40); by = H - 16; } else { bx = 16; by = H - 16 - ((p - 0.85) / 0.15) * (H - 32); }
      const on = hot ? Math.sin(t * 24 + i) > 0 : (Math.floor(t * 6) + i) % 4 === 0;
      x.fillStyle = on ? (hot ? `hsl(${(i * 30 + t * 300) % 360},100%,70%)` : '#fff2a8') : '#5a4418';
      x.beginPath(); x.arc(bx, by, 7, 0, Math.PI * 2); x.fill();
    }
  }
}
