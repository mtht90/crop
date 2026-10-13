// 演出：パーティクル（SoA・プール）、衝撃波リング、落雷、魔法陣、ダメージ数字
import { DOTS, SPR } from './sprites.js';

let MAXP = 2600;
let px, py, pvx, pvy, plife, pmax, psize, pcol, pdrag, pn = 0;

const rings = [];
const bolts = [];
const seals = [];
const texts = [];
let MAXT = 140;

export const FX = {
  init(maxParticles, maxTexts) {
    MAXP = maxParticles;
    MAXT = maxTexts;
    px = new Float32Array(MAXP); py = new Float32Array(MAXP);
    pvx = new Float32Array(MAXP); pvy = new Float32Array(MAXP);
    plife = new Float32Array(MAXP); pmax = new Float32Array(MAXP);
    psize = new Float32Array(MAXP); pcol = new Uint8Array(MAXP); pdrag = new Float32Array(MAXP);
    this.clear();
  },
  clear() { pn = 0; rings.length = 0; bolts.length = 0; seals.length = 0; texts.length = 0; },
  count() { return pn; },

  particle(x, y, vx, vy, life, size, col, drag = 3) {
    if (pn >= MAXP) return;
    const i = pn++;
    px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy;
    plife[i] = life; pmax[i] = life; psize[i] = size; pcol[i] = col; pdrag[i] = drag;
  },
  burst(x, y, n, col, speed = 160, size = 6, life = 0.45) {
    // 満杯に近いときは数を絞る
    if (pn > MAXP * 0.7) n = Math.ceil(n * 0.35);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), col);
    }
  },
  ring(x, y, r0, r1, life, color, width = 4) {
    if (rings.length > 60) return;
    rings.push({ x, y, r0, r1, t: 0, life, color, width });
  },
  bolt(x, y, top) {
    const pts = [];
    let cx = x + (Math.random() - 0.5) * 60, cy = top;
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      pts.push(cx + (x - cx) * k + (i && i < steps ? (Math.random() - 0.5) * 34 : 0), cy + (y - cy) * k);
    }
    bolts.push({ pts, t: 0, life: 0.22 });
  },
  seal(x, y, r, life, spr = 'seal', follow = null) {
    seals.push({ x, y, r, t: 0, life, spr, follow, rot: Math.random() * 6 });
  },
  text(x, y, str, color = '#fff', size = 14) {
    if (texts.length >= MAXT) {
      if (size <= 14) return;
      texts.shift();
    }
    texts.push({ x: x + (Math.random() - 0.5) * 10, y, str, color, size, t: 0, life: 0.7 });
  },

  update(dt) {
    let i = 0;
    while (i < pn) {
      plife[i] -= dt;
      if (plife[i] <= 0) {
        pn--;
        px[i] = px[pn]; py[i] = py[pn]; pvx[i] = pvx[pn]; pvy[i] = pvy[pn];
        plife[i] = plife[pn]; pmax[i] = pmax[pn]; psize[i] = psize[pn]; pcol[i] = pcol[pn]; pdrag[i] = pdrag[pn];
        continue;
      }
      const k = Math.max(0, 1 - pdrag[i] * dt);
      pvx[i] *= k; pvy[i] *= k;
      px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
      i++;
    }
    for (let j = rings.length - 1; j >= 0; j--) if ((rings[j].t += dt) >= rings[j].life) rings.splice(j, 1);
    for (let j = bolts.length - 1; j >= 0; j--) if ((bolts[j].t += dt) >= bolts[j].life) bolts.splice(j, 1);
    for (let j = seals.length - 1; j >= 0; j--) {
      const s = seals[j];
      s.rot += dt * 1.6;
      if (s.follow) { s.x = s.follow.x; s.y = s.follow.y; }
      if ((s.t += dt) >= s.life) seals.splice(j, 1);
    }
    for (let j = texts.length - 1; j >= 0; j--) {
      const t = texts[j];
      t.t += dt;
      t.y -= dt * (40 - t.t * 40);
      if (t.t >= t.life) texts.splice(j, 1);
    }
  },

  // 地面に描くもの（魔法陣）
  drawGround(ctx, v) {
    for (const s of seals) {
      if (s.x < v.x0 - s.r || s.x > v.x1 + s.r || s.y < v.y0 - s.r || s.y > v.y1 + s.r) continue;
      const k = s.t / s.life;
      const grow = Math.min(1, s.t / 0.18);
      const r = s.r * (0.4 + 0.6 * easeOut(grow));
      ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(1, 0.55);
      ctx.rotate(s.rot);
      ctx.drawImage(SPR[s.spr].img, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  // 加算合成で描く光もの
  drawGlow(ctx, v) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pn; i++) {
      const x = px[i], y = py[i];
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      const a = plife[i] / pmax[i];
      const s = psize[i] * (0.5 + a * 0.5);
      ctx.globalAlpha = a;
      ctx.drawImage(DOTS[pcol[i]], x - s, y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    for (const r of rings) {
      const k = r.t / r.life;
      const rad = r.r0 + (r.r1 - r.r0) * easeOut(k);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const b of bolts) {
      const k = b.t / b.life;
      ctx.globalAlpha = 1 - k;
      for (const [w, c] of [[9, 'rgba(160,120,255,0.6)'], [3, '#ffffff']]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  drawTexts(ctx, v) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    let font = '';
    for (const t of texts) {
      if (t.x < v.x0 || t.x > v.x1 || t.y < v.y0 || t.y > v.y1) continue;
      const pop = t.t < 0.08 ? 1 + (0.08 - t.t) * 8 : 1;
      const f = `900 ${Math.round(t.size * pop)}px "Shippori Mincho B1", serif`;
      if (f !== font) { ctx.font = f; font = f; }
      ctx.globalAlpha = t.t > t.life * 0.6 ? (t.life - t.t) / (t.life * 0.4) : 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#120a14';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },
};

function easeOut(k) { return 1 - (1 - k) * (1 - k) * (1 - k); }
