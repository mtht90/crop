// 液晶演出 (Canvas 2D → CanvasTexture)
const F = { d: 'Bungee, Impact, sans-serif', u: 'Orbitron, sans-serif' };

export class Lcd {
  constructor(canvas, texture, images) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.tex = texture;
    this.images = images;
    this.t = 0;
    this.base = 'idle';
    this.info = { games: 0, big: 0, reg: 0, since: 0, medals: 0, diff: 0 };
    this.bonus = null; // { type, paid, max, games }
    this.fx = [];
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random() * 1024, y: Math.random() * 512, z: Math.random() }));
    this.blackout = 0;
  }

  // 演出を積む
  play(type, opts = {}) {
    const e = { type, t: 0, dur: opts.dur ?? 1.6, ...opts };
    if (opts.exclusive) this.fx = this.fx.filter((f) => f.type !== type);
    this.fx.push(e);
    return e;
  }

  clear() { this.fx = []; }

  update(dt) {
    this.t += dt;
    const x = this.x, W = 1024, H = 512, t = this.t;
    x.save();
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    if (this.base === 'bonus' && this.bonus) this.drawBonus(x, W, H, t);
    else this.drawIdle(x, W, H, t);
    for (const e of this.fx) { e.t += dt; this.drawFx(x, e, W, H); }
    this.fx = this.fx.filter((e) => e.hold || e.t < e.dur);
    if (this.blackout > 0) { x.fillStyle = `rgba(0,0,0,${Math.min(1, this.blackout)})`; x.fillRect(0, 0, W, H); }
    // 走査線
    x.globalAlpha = 0.08; x.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) x.fillRect(0, y, W, 2);
    x.restore();
    this.tex.needsUpdate = true;
  }

  drawIdle(x, W, H, t) {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0326'); g.addColorStop(1, '#22053a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // 星 (奥行きスクロール)
    for (const s of this.stars) {
      s.x -= (20 + s.z * 120) * 0.016; if (s.x < 0) s.x += W;
      x.fillStyle = `rgba(255,255,255,${0.2 + s.z * 0.8})`;
      x.fillRect(s.x, s.y, 1 + s.z * 2.5, 1 + s.z * 2.5);
    }
    // ロゴ
    const pulse = 1 + 0.02 * Math.sin(t * 3);
    x.save(); x.translate(W / 2, 190); x.scale(pulse, pulse);
    x.font = `96px ${F.d}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#ff2a8a'; x.shadowBlur = 40;
    const lg = x.createLinearGradient(0, -50, 0, 50);
    lg.addColorStop(0, '#fff6c8'); lg.addColorStop(0.5, '#ffcc33'); lg.addColorStop(1, '#ff6a00');
    x.fillStyle = lg; x.fillText('DOPAMINE 7', 0, 0);
    x.restore();
    x.shadowBlur = 0;
    x.font = `500 30px ${F.u}`; x.textAlign = 'center'; x.fillStyle = '#9fd8ff';
    const i = this.info;
    x.fillText(`GAME ${i.since}   BIG ${i.big}   REG ${i.reg}`, W / 2, 330);
    x.font = `500 24px ${F.u}`; x.fillStyle = '#ffb3d9';
    x.fillText(`TOTAL ${i.games} G   差枚 ${i.diff >= 0 ? '+' : ''}${i.diff}`, W / 2, 380);
    if (Math.sin(t * 4) > -0.3) {
      x.font = `28px ${F.d}`; x.fillStyle = '#ffffff';
      x.fillText(this.prompt || '', W / 2, 450);
    }
  }

  drawBonus(x, W, H, t) {
    const b = this.bonus;
    const big = b.type === 'BIG';
    // 回転するサンバースト
    x.fillStyle = big ? '#3a0008' : '#00163a';
    x.fillRect(0, 0, W, H);
    x.save(); x.translate(W / 2, H * 0.55); x.rotate(t * 0.6);
    for (let k = 0; k < 24; k++) {
      x.rotate(Math.PI / 12);
      x.fillStyle = `hsla(${big ? (t * 80 + k * 15) % 360 : 200 + (k % 2) * 20},90%,55%,0.22)`;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(800, -90); x.lineTo(800, 90); x.fill();
    }
    x.restore();
    x.font = `84px ${F.d}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = big ? '#ff2040' : '#2080ff'; x.shadowBlur = 30;
    x.fillStyle = '#fff8d8';
    x.fillText(big ? 'BIG BONUS' : 'REGULAR BONUS', W / 2, 110);
    x.shadowBlur = 0;
    x.font = `700 120px ${F.u}`; x.fillStyle = '#ffe14d';
    x.fillText(String(b.paid), W / 2, 270);
    x.font = `500 30px ${F.u}`; x.fillStyle = '#fff';
    x.fillText(`/ ${b.max} 枚`, W / 2 + 230, 300);
    // 進捗バー
    const p = Math.min(1, b.paid / b.max);
    x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(112, 380, 800, 30);
    const pg = x.createLinearGradient(112, 0, 912, 0);
    pg.addColorStop(0, '#ff3b6b'); pg.addColorStop(0.5, '#ffd23f'); pg.addColorStop(1, '#3bffb0');
    x.fillStyle = pg; x.fillRect(112, 380, 800 * p, 30);
    x.font = `26px ${F.d}`; x.fillStyle = '#fff';
    x.fillText(`GAME ${b.games}`, W / 2, 455);
  }

  drawFx(x, e, W, H) {
    const p = Math.min(1, e.t / e.dur);
    const img = this.images;
    switch (e.type) {
      case 'flash': {
        x.fillStyle = e.color || '#fff';
        x.globalAlpha = (1 - p) * (e.alpha ?? 1);
        x.fillRect(0, 0, W, H);
        x.globalAlpha = 1;
        break;
      }
      case 'text': {
        const inP = Math.min(1, e.t / 0.18);
        const sc = (e.scale || 1) * (1 + (1 - inP) * 1.6) * (1 + 0.03 * Math.sin(e.t * 30));
        x.save();
        x.translate(W / 2 + (e.shake ? (Math.random() - 0.5) * e.shake : 0), (e.y ?? H / 2) + (e.shake ? (Math.random() - 0.5) * e.shake : 0));
        x.scale(sc, sc);
        x.globalAlpha = p > 0.85 && !e.hold ? (1 - p) / 0.15 : inP;
        x.font = `${e.size || 110}px ${F.d}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 14; x.strokeStyle = e.stroke || '#000'; x.lineJoin = 'round';
        x.shadowColor = e.glow || e.color || '#fff'; x.shadowBlur = 36;
        x.strokeText(e.text, 0, 0);
        x.shadowBlur = 0;
        if (e.rainbow) {
          const g = x.createLinearGradient(-300, 0, 300, 0);
          for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, `hsl(${(k * 60 + e.t * 400) % 360},100%,60%)`);
          x.fillStyle = g;
        } else x.fillStyle = e.color || '#fff';
        x.fillText(e.text, 0, 0);
        if (e.sub) { x.font = `500 36px ${F.u}`; x.fillStyle = '#fff'; x.fillText(e.sub, 0, (e.size || 110) * 0.75); }
        x.restore();
        break;
      }
      case 'stripes': { // CHANCE 帯
        x.save();
        x.globalAlpha = Math.min(1, e.t * 6) * (p > 0.85 ? (1 - p) / 0.15 : 1);
        x.fillStyle = e.color || '#ffd400';
        x.fillRect(0, H / 2 - 90, W, 180);
        x.beginPath(); x.rect(0, H / 2 - 90, W, 180); x.clip();
        x.fillStyle = 'rgba(0,0,0,0.85)';
        const off = (e.t * 600) % 80;
        for (let i = -2; i < 20; i++) {
          x.beginPath(); x.moveTo(i * 80 + off, H / 2 - 90); x.lineTo(i * 80 + 40 + off, H / 2 - 90);
          x.lineTo(i * 80 + off - 140, H / 2 + 90); x.lineTo(i * 80 - 180 + off, H / 2 + 90); x.fill();
        }
        x.restore();
        break;
      }
      case 'flames': {
        const ic = img.fire;
        x.fillStyle = `rgba(80,0,0,${0.6 * (1 - p * 0.4)})`; x.fillRect(0, 0, W, H);
        if (ic) for (let i = 0; i < 14; i++) {
          const s = 90 + 40 * Math.sin(e.t * 8 + i);
          x.drawImage(ic, (i / 13) * W - s / 2, H - s * 0.9 - 30 * Math.abs(Math.sin(e.t * 6 + i * 1.7)), s, s);
        }
        break;
      }
      case 'icons': { // 飛び交うアイコン
        const ic = img[e.icon || 'star'];
        if (!ic) break;
        e.parts ??= Array.from({ length: e.count || 26 }, () => ({ a: Math.random() * Math.PI * 2, v: 300 + Math.random() * 700, r: Math.random() * 6 }));
        for (const q of e.parts) {
          const d = q.v * e.t;
          const s = 60 * (1 - p * 0.5);
          x.save(); x.translate(W / 2 + Math.cos(q.a) * d, H / 2 + Math.sin(q.a) * d * 0.6); x.rotate(q.r + e.t * 4);
          x.globalAlpha = 1 - p; x.drawImage(ic, -s / 2, -s / 2, s, s); x.restore();
        }
        break;
      }
      case 'rainbow': {
        x.save(); x.globalAlpha = 0.7 * (1 - p * 0.5);
        const g = x.createLinearGradient(0, 0, W, H);
        for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, `hsl(${(k * 60 + e.t * 300) % 360},100%,55%)`);
        x.fillStyle = g; x.fillRect(0, 0, W, H); x.restore();
        break;
      }
      case 'crack': { // フリーズのガラス割れ
        e.lines ??= Array.from({ length: 22 }, () => {
          const pts = [[W / 2, H / 2]]; let a = Math.random() * Math.PI * 2, r = 0;
          while (r < 700) { r += 40 + Math.random() * 80; a += (Math.random() - 0.5) * 0.5; pts.push([W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r]); }
          return pts;
        });
        x.strokeStyle = 'rgba(220,240,255,0.95)'; x.lineWidth = 3; x.shadowColor = '#9cf'; x.shadowBlur = 12;
        const grow = Math.min(1, e.t / 0.25);
        for (const pts of e.lines) {
          x.beginPath(); x.moveTo(...pts[0]);
          const n = Math.ceil(pts.length * grow);
          for (let i = 1; i < n; i++) x.lineTo(...pts[i]);
          x.stroke();
        }
        x.shadowBlur = 0;
        break;
      }
      case 'win': {
        x.save();
        const yy = H - 70 - Math.max(0, 1 - e.t * 5) * 60;
        x.globalAlpha = p > 0.8 ? (1 - p) / 0.2 : 1;
        x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, yy - 46, W, 92);
        x.font = `56px ${F.d}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = e.color || '#ffe14d'; x.shadowColor = e.color || '#ffe14d'; x.shadowBlur = 20;
        x.fillText(e.text, W / 2, yy);
        x.restore();
        break;
      }
    }
  }
}
