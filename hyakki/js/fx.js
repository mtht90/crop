// 演出：火花パーティクル（SoA・プール）、素材アニメ（爆発・煙・落雷・魔法陣）、衝撃波、ダメージ数字
import { SPR, SPARKS, draw } from './sprites.js';

let MAXP = 2600;
let px, py, pvx, pvy, plife, pmax, psize, pcol, pdrag, pn = 0;

const anims = [];
const rings = [];
const bolts = [];
const texts = [];
let MAXT = 140, MAXA = 220;

export const FONT_NUM = '"NinjaAdventure", "DotGothic16", monospace';
export const FONT_JP = '"DotGothic16", "Hiragino Kaku Gothic ProN", sans-serif';

export const FX = {
  init(maxParticles, maxTexts) {
    MAXP = maxParticles;
    MAXT = maxTexts;
    MAXA = Math.round(maxParticles / 12);
    px = new Float32Array(MAXP); py = new Float32Array(MAXP);
    pvx = new Float32Array(MAXP); pvy = new Float32Array(MAXP);
    plife = new Float32Array(MAXP); pmax = new Float32Array(MAXP);
    psize = new Float32Array(MAXP); pcol = new Uint8Array(MAXP); pdrag = new Float32Array(MAXP);
    this.clear();
  },
  clear() { pn = 0; anims.length = 0; rings.length = 0; bolts.length = 0; texts.length = 0; },
  count() { return pn + anims.length; },

  particle(x, y, vx, vy, life, size, col, drag = 3) {
    if (pn >= MAXP) return;
    const i = pn++;
    px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy;
    plife[i] = life; pmax[i] = life; psize[i] = size; pcol[i] = col; pdrag[i] = drag;
  },
  burst(x, y, n, col, speed = 160, size = 6, life = 0.45) {
    if (pn > MAXP * 0.7) n = Math.ceil(n * 0.35);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), col);
    }
  },
  // 素材のアニメーションを1回再生。opts: scale, dur, add(加算), follow, rot, alpha, under(地面側)
  anim(key, x, y, opts = {}) {
    if (anims.length >= MAXA && !opts.force) return;
    const s = SPR[key];
    anims.push({
      s, x, y, t: 0, dur: opts.dur || s.n * 0.06, k: opts.scale || 1, add: !!opts.add,
      follow: opts.follow || null, rot: opts.rot || 0, alpha: opts.alpha ?? 1, under: !!opts.under, loops: opts.loops || 1,
    });
  },
  ring(x, y, r0, r1, life, color, width = 4) {
    if (rings.length > 50) return;
    rings.push({ x, y, r0, r1, t: 0, life, color, width });
  },
  bolt(x, y, top) {
    const pts = [];
    const cx = x + (Math.random() - 0.5) * 60;
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      // ドット絵に馴染むよう 4 単位に丸める
      const jx = i && i < steps ? (Math.random() - 0.5) * 34 : 0;
      pts.push(Math.round((cx + (x - cx) * k + jx) / 4) * 4, Math.round((top + (y - top) * k) / 4) * 4);
    }
    bolts.push({ pts, t: 0, life: 0.2 });
  },
  // 魔法陣（素材の光輪を大きく展開）
  seal(x, y, r, life, follow = null, spark = false) {
    this.anim(spark ? 'circleSpark' : 'circle', x, y, { scale: (r * 2) / 32, dur: life, add: true, follow, under: true, force: true, loops: spark ? 1 : 2, alpha: spark ? 0.9 : 0.4 });
  },
  text(x, y, str, color = '#fff', size = 14, jp = false) {
    if (texts.length >= MAXT) {
      if (size <= 14) return;
      texts.shift();
    }
    texts.push({ x: x + (Math.random() - 0.5) * 10, y, str, color, size, t: 0, life: jp ? 1.1 : 0.7, jp });
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
    for (let j = anims.length - 1; j >= 0; j--) {
      const a = anims[j];
      if (a.follow) { a.x = a.follow.x; a.y = a.follow.y; }
      if ((a.t += dt) >= a.dur) anims.splice(j, 1);
    }
    for (let j = rings.length - 1; j >= 0; j--) if ((rings[j].t += dt) >= rings[j].life) rings.splice(j, 1);
    for (let j = bolts.length - 1; j >= 0; j--) if ((bolts[j].t += dt) >= bolts[j].life) bolts.splice(j, 1);
    for (let j = texts.length - 1; j >= 0; j--) {
      const t = texts[j];
      t.t += dt;
      t.y -= dt * (46 - t.t * 46);
      if (t.t >= t.life) texts.splice(j, 1);
    }
  },

  drawAnims(ctx, v, under) {
    for (const a of anims) {
      if (a.under !== under) continue;
      const hw = a.s.w * a.k;
      if (a.x < v.x0 - hw || a.x > v.x1 + hw || a.y < v.y0 - hw || a.y > v.y1 + hw) continue;
      const p = a.t / a.dur;
      const f = Math.min(a.s.n - 1, Math.floor(p * a.s.n * a.loops) % a.s.n);
      ctx.globalAlpha = a.alpha * (p > 0.75 ? (1 - p) / 0.25 : 1);
      if (a.add) ctx.globalCompositeOperation = 'lighter';
      if (a.rot) {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
        draw(ctx, a.s, 0, 0, f, 0, false, a.k);
        ctx.restore();
      } else draw(ctx, a.s, a.x, a.y, f, 0, false, a.k);
      if (a.add) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  },

  drawGlow(ctx, v) {
    ctx.globalCompositeOperation = 'lighter';
    const sp = SPR.spark, fw = sp.fw, fh = sp.fh, n = sp.n;
    for (let i = 0; i < pn; i++) {
      const x = px[i], y = py[i];
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      const a = plife[i] / pmax[i];
      const f = Math.min(n - 1, ((1 - a) * n) | 0);
      const s = psize[i] * 0.5;
      ctx.drawImage(SPARKS[pcol[i]], f * fw, 0, fw, fh, x - s * 1.25, y - s, s * 2.5, s * 2);
    }
    for (const r of rings) {
      const k = r.t / r.life;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) ** 3);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(2, r.width * (1 - k * 0.6));
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const b of bolts) {
      ctx.globalAlpha = 1 - b.t / b.life;
      for (const [w, c] of [[8, 'rgba(150,120,255,0.55)'], [3, '#fffbe0']]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.lineJoin = 'miter';
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
      const f = `${Math.round(t.size * pop)}px ${t.jp ? FONT_JP : FONT_NUM}`;
      if (f !== font) { ctx.font = f; font = f; }
      ctx.globalAlpha = t.t > t.life * 0.6 ? (t.life - t.t) / (t.life * 0.4) : 1;
      ctx.lineWidth = t.size >= 20 ? 5 : 4;
      ctx.strokeStyle = '#1a0d14';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },
};
