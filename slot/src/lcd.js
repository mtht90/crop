// =====================================================================
//  液晶オーバーレイ (Canvas 2D)。奥の 3D 舞台 (lcd3d.js) の上に重ねる
//   カットイン / タイトルカード / 群予告ウィンドウ / CAUTION帯 / ロックオン / 結果
// =====================================================================
const F = { d: 'Bungee, Impact, sans-serif', u: 'Orbitron, sans-serif' };
const COLORS = {
  blue: ['#4aa8ff', '#0a3a8a'], green: ['#3bff8a', '#0a5a2a'], red: ['#ff2a3a', '#6a0010'],
  gold: ['#ffd84a', '#7a5200'], rainbow: ['#ffffff', '#5a2a8a'],
};

export class Lcd {
  constructor(canvas, texture, images, cfg) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.tex = texture;
    this.images = images;
    this.cast = images.cast || {};
    this.cfg = cfg;
    this.mincho = cfg.assets.jpFonts.mincho;
    this.gothic = cfg.assets.jpFonts.gothic;
    this.t = 0;
    this.base = 'stage';
    this.stage = { name: '夜間警戒', mood: 'night' };
    this.info = { games: 0, big: 0, reg: 0, since: 0, medals: 0, diff: 0 };
    this.bonus = null;
    this.fx = [];
    this.blackout = 0;
    this.onTick = null;
  }

  play(type, opts = {}) {
    const e = { type, t: 0, dur: opts.dur ?? 1.6, ...opts };
    if (opts.exclusive !== false && ['cutin', 'title', 'band', 'result', 'lockon', 'count'].includes(type)) {
      this.fx = this.fx.filter((f) => f.type !== type);
    }
    this.fx.push(e);
    return e;
  }

  kill(type) { this.fx = this.fx.filter((f) => f.type !== type); }
  clear() { this.fx = []; }

  update(dt) {
    this.t += dt;
    const x = this.x, W = 1024, H = 512;
    x.save();
    x.clearRect(0, 0, W, H);
    if (this.base === 'bonus' && this.bonus) this.drawBonus(x, W, H);
    else this.drawStageHud(x, W, H);
    // 描画順: 背面系 → 人物 → 文字 → 全面系
    const order = ['band', 'windows', 'lockon', 'cutin', 'count', 'telop', 'push', 'text', 'icons', 'win', 'title', 'result', 'static', 'crack', 'rainbow', 'flash'];
    this.fx.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    for (const e of this.fx) { e.t += dt; x.save(); this.drawFx(x, e, W, H); x.restore(); }
    this.fx = this.fx.filter((e) => e.hold || e.t < e.dur);
    if (this.blackout > 0) { x.fillStyle = `rgba(0,0,0,${Math.min(1, this.blackout)})`; x.fillRect(0, 0, W, H); }
    // 走査線とビネット
    x.globalAlpha = 0.07; x.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) x.fillRect(0, y, W, 2);
    x.globalAlpha = 1;
    const v = x.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    x.restore();
    this.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------
  drawStageHud(x, W, H) {
    const t = this.t;
    const alert = this.stage.mood === 'alert';
    const c = alert ? '#ff4a4a' : this.stage.mood === 'command' ? '#5fffe0' : '#9fc8ff';
    x.strokeStyle = c; x.lineWidth = 3; x.globalAlpha = 0.85;
    // コーナーブラケット
    for (const [cx, cy, sx, sy] of [[16, 16, 1, 1], [W - 16, 16, -1, 1], [16, H - 16, 1, -1], [W - 16, H - 16, -1, -1]]) {
      x.beginPath(); x.moveTo(cx, cy + sy * 34); x.lineTo(cx, cy); x.lineTo(cx + sx * 34, cy); x.stroke();
    }
    // ステージ名
    x.font = `700 26px ${this.gothic}`; x.fillStyle = c; x.textBaseline = 'top';
    x.fillText(this.stage.name, 34, 30);
    x.font = `500 14px ${F.u}`; x.globalAlpha = 0.7;
    x.fillText(alert ? 'CONDITION RED' : this.stage.mood === 'command' ? 'COMMAND CENTER' : 'NIGHT WATCH', 36, 62);
    // 右上: ゲーム数
    const i = this.info;
    x.textAlign = 'right'; x.globalAlpha = 0.85;
    x.font = `700 22px ${F.u}`;
    x.fillText(`${i.since} G`, W - 34, 30);
    x.font = `500 14px ${F.u}`;
    x.fillText(`BIG ${i.big}  REG ${i.reg}  TOTAL ${i.games}`, W - 34, 60);
    x.textAlign = 'left';
    if (alert) {
      // 警戒態勢: 外周の赤い脈動
      const a = 0.35 + 0.35 * Math.sin(t * 6);
      x.globalAlpha = a; x.lineWidth = 14; x.strokeStyle = '#ff1a1a';
      x.strokeRect(7, 7, W - 14, H - 14);
      if (Math.sin(t * 6) > 0) {
        x.globalAlpha = 0.9; x.font = `900 20px ${F.u}`; x.fillStyle = '#ff3030';
        x.textAlign = 'center'; x.fillText('ALERT', W / 2, 26); x.textAlign = 'left';
      }
    }
    if (this.stage.mood === 'command') {
      // 司令室: 作戦図
      x.globalAlpha = 0.35; x.strokeStyle = '#5fffe0'; x.lineWidth = 1;
      for (let gx = 620; gx <= 980; gx += 30) { x.beginPath(); x.moveTo(gx, 300); x.lineTo(gx, 470); x.stroke(); }
      for (let gy = 300; gy <= 470; gy += 30) { x.beginPath(); x.moveTo(620, gy); x.lineTo(980, gy); x.stroke(); }
      const sweep = t * 1.4;
      x.globalAlpha = 0.6; x.beginPath(); x.moveTo(800, 385); x.lineTo(800 + Math.cos(sweep) * 85, 385 + Math.sin(sweep) * 85); x.stroke();
      x.fillStyle = '#ff5050'; x.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
      x.beginPath(); x.arc(870, 340, 5, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    if (this.prompt && Math.sin(t * 4) > -0.3) {
      x.font = `700 30px ${this.gothic}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = '#000'; x.strokeText(this.prompt, W / 2, H - 52);
      x.fillStyle = '#fff'; x.fillText(this.prompt, W / 2, H - 52);
      x.textAlign = 'left';
    }
    x.textBaseline = 'alphabetic';
  }

  drawBonus(x, W, H) {
    const b = this.bonus, t = this.t;
    const big = b.type === 'BIG';
    x.fillStyle = big ? 'rgba(40,0,6,0.35)' : 'rgba(0,10,40,0.35)'; x.fillRect(0, 0, W, H);
    x.font = `800 64px ${this.mincho}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = big ? '#ff2040' : '#2080ff'; x.shadowBlur = 30; x.fillStyle = '#fff';
    x.fillText(big ? '迎撃作戦 成功' : '防衛 成功', W / 2, 92);
    x.shadowBlur = 0;
    x.font = `22px ${F.d}`; x.fillStyle = big ? '#ffb0b8' : '#b0d0ff';
    x.fillText(big ? 'BIG BONUS' : 'REGULAR BONUS', W / 2, 140);
    x.font = `700 118px ${F.u}`; x.fillStyle = '#ffe14d';
    x.shadowColor = '#000'; x.shadowBlur = 16;
    x.fillText(String(b.paid), W / 2, 262);
    x.shadowBlur = 0;
    x.font = `500 28px ${F.u}`; x.fillStyle = '#fff';
    x.fillText(`/ ${b.max} 枚`, W / 2 + 230, 292);
    const p = Math.min(1, b.paid / b.max);
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(112, 370, 800, 26);
    const pg = x.createLinearGradient(112, 0, 912, 0);
    pg.addColorStop(0, '#ff3b6b'); pg.addColorStop(0.5, '#ffd23f'); pg.addColorStop(1, '#3bffb0');
    x.fillStyle = pg; x.fillRect(112, 370, 800 * p, 26);
    x.font = `700 24px ${this.gothic}`; x.fillStyle = '#fff';
    x.fillText(`残り ${Math.max(0, b.max - b.paid)} 枚  /  ${b.games} G`, W / 2, 440);
    x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    void t;
  }

  // ------------------------------------------------------------
  drawFx(x, e, W, H) {
    const p = Math.min(1, e.t / e.dur);
    const fadeOut = e.hold ? 1 : Math.min(1, (e.dur - e.t) / 0.2);
    switch (e.type) {
      case 'flash':
        x.fillStyle = e.color || '#fff'; x.globalAlpha = (1 - p) * (e.alpha ?? 1); x.fillRect(0, 0, W, H);
        break;
      case 'rainbow': {
        x.globalAlpha = 0.6 * (1 - p * 0.6);
        const g = x.createLinearGradient(0, 0, W, H);
        for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, `hsl(${(k * 60 + e.t * 300) % 360},100%,55%)`);
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        break;
      }
      case 'title': this.drawTitle(x, e, W, H, fadeOut); break;
      case 'cutin': this.drawCutin(x, e, W, H, fadeOut); break;
      case 'windows': this.drawWindows(x, e, W, H, fadeOut); break;
      case 'band': this.drawBand(x, e, W, H, fadeOut); break;
      case 'lockon': this.drawLock(x, e, W, H, fadeOut); break;
      case 'count': {
        const k = Math.min(1, e.t / 0.15);
        x.globalAlpha = fadeOut;
        x.font = `900 ${Math.round(260 * (1.6 - 0.6 * k))}px ${F.u}`;
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeText(e.text, W / 2, H / 2);
        x.fillStyle = e.color || '#ffd84a'; x.shadowColor = e.color || '#ffd84a'; x.shadowBlur = 40;
        x.fillText(e.text, W / 2, H / 2);
        break;
      }
      case 'telop': {
        x.globalAlpha = Math.min(1, e.t * 5) * fadeOut;
        x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, H - 110, W, 64);
        x.font = `700 30px ${this.gothic}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = e.color || '#fff';
        const n = Math.floor(e.t * 24);
        x.fillText(e.text.slice(0, n), W / 2, H - 78);
        break;
      }
      case 'result': this.drawResult(x, e, W, H, fadeOut); break;
      case 'push': {
        // 実機の「PUSH!」: 脈動するボタンと波紋
        const cx = W / 2, cy = H / 2 - 10, pulse = 1 + 0.08 * Math.sin(e.t * 14);
        x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, 0, W, H);
        for (let k = 0; k < 3; k++) {
          const r = ((e.t * 160 + k * 60) % 180) + 90;
          x.globalAlpha = Math.max(0, 1 - (r - 90) / 180);
          x.strokeStyle = e.level === 2 ? `hsl(${(e.t * 300 + k * 90) % 360},100%,60%)` : '#ff3050';
          x.lineWidth = 8; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
        }
        x.globalAlpha = 1;
        const g = x.createRadialGradient(cx - 20, cy - 25, 8, cx, cy, 95 * pulse);
        if (e.level === 2) { g.addColorStop(0, '#fff'); g.addColorStop(0.5, `hsl(${(e.t * 300) % 360},100%,60%)`); g.addColorStop(1, `hsl(${(e.t * 300 + 120) % 360},100%,30%)`); }
        else { g.addColorStop(0, '#fff'); g.addColorStop(0.45, '#ff3050'); g.addColorStop(1, '#5a0010'); }
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 90 * pulse, 0, Math.PI * 2); x.fill();
        x.font = `78px ${F.d}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeText('PUSH!', cx, cy + 4);
        x.fillStyle = '#fff'; x.fillText('PUSH!', cx, cy + 4);
        x.textBaseline = 'alphabetic'; x.textAlign = 'left';
        break;
      }
      case 'static': {
        x.globalAlpha = (e.alpha ?? 0.6) * fadeOut;
        for (let i = 0; i < 260; i++) {
          x.fillStyle = Math.random() < 0.5 ? '#fff' : '#000';
          x.fillRect(Math.random() * W, Math.random() * H, 4 + Math.random() * 60, 2 + Math.random() * 3);
        }
        break;
      }
      case 'text': {
        const inP = Math.min(1, e.t / 0.18);
        const sc = (e.scale || 1) * (1 + (1 - inP) * 1.4);
        x.translate(W / 2 + (e.shake ? (Math.random() - 0.5) * e.shake : 0), (e.y ?? H / 2) + (e.shake ? (Math.random() - 0.5) * e.shake : 0));
        x.scale(sc, sc);
        x.globalAlpha = inP * fadeOut;
        x.font = e.font || `${e.size || 110}px ${F.d}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 14; x.strokeStyle = e.stroke || '#000'; x.lineJoin = 'round';
        x.shadowColor = e.glow || e.color || '#fff'; x.shadowBlur = 36;
        x.strokeText(e.text, 0, 0);
        x.shadowBlur = 0;
        x.fillStyle = e.rainbow ? rainbowFill(x, e.t) : e.color || '#fff';
        x.fillText(e.text, 0, 0);
        if (e.sub) { x.font = `700 32px ${this.gothic}`; x.fillStyle = '#fff'; x.fillText(e.sub, 0, (e.size || 110) * 0.75); }
        break;
      }
      case 'icons': {
        const ic = this.images[e.icon || 'star'];
        if (!ic) break;
        e.parts ??= Array.from({ length: e.count || 26 }, () => ({ a: Math.random() * Math.PI * 2, v: 300 + Math.random() * 700, r: Math.random() * 6 }));
        for (const q of e.parts) {
          const d = q.v * e.t, s = 60 * (1 - p * 0.5);
          x.save(); x.translate(W / 2 + Math.cos(q.a) * d, H / 2 + Math.sin(q.a) * d * 0.6); x.rotate(q.r + e.t * 4);
          x.globalAlpha = 1 - p; x.drawImage(ic, -s / 2, -s / 2, s, s); x.restore();
        }
        break;
      }
      case 'crack': {
        e.lines ??= Array.from({ length: 22 }, () => {
          const pts = [[W / 2, H / 2]]; let a = Math.random() * Math.PI * 2, r = 0;
          while (r < 700) { r += 40 + Math.random() * 80; a += (Math.random() - 0.5) * 0.5; pts.push([W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r]); }
          return pts;
        });
        x.strokeStyle = 'rgba(220,240,255,0.95)'; x.lineWidth = 3; x.shadowColor = '#9cf'; x.shadowBlur = 12;
        const grow = Math.min(1, e.t / 0.25);
        for (const pts of e.lines) {
          x.beginPath(); x.moveTo(...pts[0]);
          for (let i = 1; i < Math.ceil(pts.length * grow); i++) x.lineTo(...pts[i]);
          x.stroke();
        }
        break;
      }
      case 'win': {
        const yy = H - 70 - Math.max(0, 1 - e.t * 5) * 60;
        x.globalAlpha = p > 0.8 ? (1 - p) / 0.2 : 1;
        x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, yy - 40, W, 80);
        x.font = `700 46px ${this.gothic}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = e.color || '#ffe14d'; x.shadowColor = e.color || '#ffe14d'; x.shadowBlur = 20;
        x.fillText(e.text, W / 2, yy);
        break;
      }
      default:
    }
  }

  // エヴァ風タイトルカード: 黒地に極太明朝。行ごとにサイズ・位置を指定
  drawTitle(x, e, W, H, fade) {
    x.globalAlpha = fade;
    x.fillStyle = e.bg || '#000'; x.fillRect(0, 0, W, H);
    const lines = e.lines || [{ text: e.text, size: 150 }];
    const jitter = e.t < 0.08 ? (Math.random() - 0.5) * 30 : 0;
    x.textBaseline = 'alphabetic';
    for (const ln of lines) {
      x.font = `800 ${ln.size}px ${this.mincho}`;
      x.textAlign = ln.align || 'left';
      x.fillStyle = ln.color || '#f4f0e8';
      // 横方向に圧縮して“詰めた”組版にする
      x.save();
      x.translate((ln.x ?? 70) + jitter, ln.y ?? H / 2 + ln.size * 0.35);
      x.scale(ln.squash ?? 0.82, 1);
      x.fillText(ln.text, 0, 0);
      x.restore();
    }
    if (e.sub) {
      x.font = `500 18px ${F.u}`; x.fillStyle = '#c8c0b0'; x.textAlign = 'left';
      x.fillText(e.sub, 74, H - 40);
    }
  }

  drawCutin(x, e, W, H, fade) {
    const col = COLORS[e.color] || COLORS.blue;
    const k = Math.min(1, e.t / 0.22);
    const ease = 1 - Math.pow(1 - k, 3);
    x.globalAlpha = fade;
    // 斜めの色帯
    x.save();
    x.beginPath();
    x.moveTo(W * 0.38 + (1 - ease) * W, 0); x.lineTo(W, 0); x.lineTo(W, H); x.lineTo(W * 0.24 + (1 - ease) * W, H); x.closePath();
    const g = x.createLinearGradient(W * 0.3, 0, W, 0);
    if (e.color === 'rainbow') for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + e.t * 200) % 360},90%,${45 + 10 * Math.sin(e.t * 8)}%)`);
    else { g.addColorStop(0, col[1]); g.addColorStop(1, col[0]); }
    x.fillStyle = g; x.fill();
    x.clip();
    // 速度線
    x.globalAlpha = 0.25 * fade; x.fillStyle = '#fff';
    for (let i = 0; i < 18; i++) {
      const yy = ((i * 53 + e.t * 900) % (H + 60)) - 30;
      x.fillRect(W * 0.3, yy, W, 2);
    }
    x.globalAlpha = fade;
    // 立ち絵
    const img = this.cast[e.char];
    if (img) {
      const s = (H * 1.25) / img.height;
      const iw = img.width * s, ih = img.height * s;
      const ix = W - iw * 0.92 + (1 - ease) * 300 + Math.sin(e.t * 1.5) * 4;
      x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 30;
      x.drawImage(img, ix, H - ih * 0.86, iw, ih);
      x.shadowBlur = 0;
    }
    x.restore();
    // 名前と台詞
    const ch = this.cfg.story.cast[e.char] || { full: '' };
    const boxY = H - 150;
    x.globalAlpha = Math.min(1, e.t * 6) * fade;
    x.fillStyle = 'rgba(0,0,0,0.78)';
    x.fillRect(30, boxY, W * 0.72, 118);
    x.fillStyle = col[0]; x.fillRect(30, boxY, 8, 118);
    x.font = `700 22px ${this.gothic}`; x.fillStyle = ch.color || '#fff'; x.textBaseline = 'top';
    x.fillText(ch.full, 54, boxY + 12);
    const n = Math.min(e.text.length, Math.floor(Math.max(0, e.t - 0.15) * 28));
    if (n > (e._n || 0)) { e._n = n; this.onTick?.(); }
    x.font = `900 42px ${this.gothic}`;
    x.lineWidth = 6; x.strokeStyle = '#000';
    const txt = e.text.slice(0, n);
    x.strokeText(txt, 54, boxY + 50);
    x.fillStyle = e.color === 'rainbow' ? rainbowFill(x, e.t) : e.color === 'gold' ? goldFill(x, boxY) : col[0];
    if (e.color === 'blue') x.fillStyle = '#9fd0ff';
    x.fillText(txt, 54, boxY + 50);
    x.textBaseline = 'alphabetic';
  }

  drawWindows(x, e, W, H, fade) {
    e.list ??= [];
    const red = e.color === 'red';
    const want = Math.min(e.count || 12, Math.floor(e.t * (e.rate || 10)));
    while (e.list.length < want) {
      const w = 180 + Math.random() * 140, h = 90 + Math.random() * 60;
      e.list.push({ x: Math.random() * (W - w), y: Math.random() * (H - h), w, h, t0: e.t, label: red ? ['EMERGENCY', '緊急', 'BREACH'][e.list.length % 3] : ['WARNING', '警告', 'CAUTION'][e.list.length % 3] });
      this.onWindow?.();
    }
    for (const b of e.list) {
      const a = Math.min(1, (e.t - b.t0) * 8) * fade;
      x.globalAlpha = a;
      x.fillStyle = red ? 'rgba(60,0,0,0.85)' : 'rgba(40,30,0,0.85)';
      x.fillRect(b.x, b.y, b.w, b.h);
      x.fillStyle = red ? '#ff2a2a' : '#ffb400';
      x.fillRect(b.x, b.y, b.w, 26);
      x.strokeStyle = x.fillStyle; x.lineWidth = 2; x.strokeRect(b.x, b.y, b.w, b.h);
      x.font = `900 16px ${F.u}`; x.fillStyle = '#000'; x.textBaseline = 'middle';
      x.fillText(b.label, b.x + 10, b.y + 13);
      x.font = `900 ${Math.round(b.h * 0.42)}px ${this.gothic}`; x.fillStyle = red ? '#ff4a4a' : '#ffc400';
      x.textAlign = 'center';
      if (Math.sin((e.t - b.t0) * 14) > -0.6) x.fillText(red ? '緊急' : '警告', b.x + b.w / 2, b.y + 26 + (b.h - 26) / 2);
      x.textAlign = 'left';
    }
    x.textBaseline = 'alphabetic';
  }

  // 上下の CAUTION / EMERGENCY 帯 (スクロール)
  drawBand(x, e, W, H, fade) {
    const lv = e.level || 'caution';
    const conf = {
      caution: ['#ffc400', '#000', 'CAUTION  注意  '],
      emergency: ['#ff1a2a', '#fff', 'EMERGENCY  緊急事態  '],
      rainbow: [null, '#fff', 'ALL CLEAR  作戦承認  '],
    }[lv];
    x.globalAlpha = Math.min(1, e.t * 6) * fade;
    for (const [y, dir] of [[18, 1], [H - 74, -1]]) {
      x.save();
      x.beginPath(); x.rect(0, y, W, 56); x.clip();
      if (conf[0]) x.fillStyle = conf[0]; else x.fillStyle = rainbowFill(x, e.t);
      x.fillRect(0, y, W, 56);
      x.fillStyle = conf[1];
      x.font = `900 34px ${F.u}`; x.textBaseline = 'middle';
      const str = conf[2].repeat(8);
      const off = ((e.t * 220 * dir) % 700 + 700) % 700;
      x.fillText(str, -off, y + 30);
      x.restore();
    }
    if (lv !== 'caution') {
      x.globalAlpha = 0.25 * (0.5 + 0.5 * Math.sin(e.t * 10)) * fade;
      x.fillStyle = conf[0] || '#fff'; x.fillRect(0, 0, W, H);
    }
  }

  drawLock(x, e, W, H, fade) {
    const k = Math.min(1, e.t / 0.6);
    const cx = e.cx ?? W * 0.62, cy = e.cy ?? H * 0.42;
    const r = 220 - k * 150;
    x.globalAlpha = fade;
    x.strokeStyle = k >= 1 ? '#ff2a2a' : '#5fffe0'; x.lineWidth = 4;
    x.save(); x.translate(cx, cy); x.rotate(e.t * (k >= 1 ? 0 : 3));
    for (let i = 0; i < 4; i++) {
      x.rotate(Math.PI / 2);
      x.beginPath(); x.arc(0, 0, r, -0.4, 0.4); x.stroke();
      x.beginPath(); x.moveTo(r + 10, 0); x.lineTo(r + 34, 0); x.stroke();
    }
    x.restore();
    x.font = `900 26px ${F.u}`; x.fillStyle = x.strokeStyle; x.textAlign = 'center';
    x.fillText(k >= 1 ? 'LOCK ON' : `RANGE ${Math.round(3200 - k * 2800)}m`, cx, cy + r + 54);
    x.textAlign = 'left';
  }

  drawResult(x, e, W, H, fade) {
    const win = e.win;
    const k = Math.min(1, e.t / 0.12);
    x.globalAlpha = fade;
    if (win) {
      const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(1, 'rgba(255,140,0,0.35)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    } else {
      x.fillStyle = 'rgba(0,0,0,0.75)'; x.fillRect(0, 0, W, H);
    }
    x.save();
    x.translate(W / 2, H / 2);
    x.scale(1 + (1 - k) * 0.6, 1 + (1 - k) * 0.6);
    x.font = `800 ${win ? 150 : 120}px ${this.mincho}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.scale(0.85, 1);
    if (win) { x.lineWidth = 12; x.strokeStyle = '#5a2a00'; x.strokeText(e.text, 0, 0); x.fillStyle = goldFill(x, -80); }
    else x.fillStyle = '#8a8a8a';
    x.fillText(e.text, 0, 0);
    x.restore();
    if (e.sub) {
      x.font = `700 28px ${this.gothic}`; x.textAlign = 'center'; x.fillStyle = win ? '#4a2000' : '#bbb';
      x.fillText(e.sub, W / 2, H / 2 + 110);
      x.textAlign = 'left';
    }
  }
}

function rainbowFill(x, t) {
  const g = x.createLinearGradient(-300, 0, 1300, 0);
  for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, `hsl(${(k * 60 + t * 400) % 360},100%,62%)`);
  return g;
}

function goldFill(x, y) {
  const g = x.createLinearGradient(0, y, 0, y + 90);
  g.addColorStop(0, '#fff6c0'); g.addColorStop(0.5, '#ffc828'); g.addColorStop(1, '#a86a00');
  return g;
}
