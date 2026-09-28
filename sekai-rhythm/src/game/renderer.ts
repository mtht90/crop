import { Difficulty, DIFFICULTY_COLORS, FlickDir, LANES } from '../core/chart';
import { GameEngine, KEY_COUNT, LANES_PER_KEY, RANK_BORDERS, rankOf } from './engine';
import { HitObj, Judge, RSlide, RuntimeChart, slideRangeAt } from './runtime';

export const FONT = `'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Noto Sans JP', 'Yu Gothic UI', sans-serif`;

/** ノーツが判定ラインに来るまでの見かけの奥行き（Sonolus 版 pjsekai エンジンと同じ近づき方） */
export function approach(noteTime: number, now: number, duration: number): number {
  return Math.pow(1.06, (45 * (now - noteTime)) / duration);
}

const SPAWN_Y = Math.pow(1.06, -45);
const NOTE_H = 0.026;
/** 奥のステージ幅を広げるための補正（0 だと消失点に収束する三角形になる） */
const PERSP_K = 0.12;
const sc = (y: number) => (y + PERSP_K) / (1 + PERSP_K);

interface Palette {
  top: string;
  mid: string;
  bottom: string;
  cap: string;
  glow: string;
}
const PAL: Record<string, Palette> = {
  tap: { top: '#b8f6ff', mid: '#3cc8ff', bottom: '#1a62d8', cap: '#eafcff', glow: '#5fd8ff' },
  critical: { top: '#fff8c4', mid: '#ffd23a', bottom: '#ff8a12', cap: '#fffbe6', glow: '#ffd84a' },
  flick: { top: '#ffc2e2', mid: '#ff4f9f', bottom: '#c01765', cap: '#ffeaf4', glow: '#ff6fb4' },
  slide: { top: '#c4ffdd', mid: '#3de48b', bottom: '#0f9a55', cap: '#ecfff4', glow: '#56f09c' },
  trace: { top: '#f0ffc0', mid: '#aee84a', bottom: '#5c9e16', cap: '#fbffe8', glow: '#c2f25a' },
};

function palOf(o: { kind: string; critical: boolean; dir?: FlickDir }): Palette {
  if (o.critical) return PAL.critical;
  if (o.kind === 'flick' || (o.kind === 'slideEnd' && o.dir)) return PAL.flick;
  if (o.kind === 'trace') return PAL.trace;
  if (o.kind === 'slideStart' || o.kind === 'slideEnd' || o.kind === 'tick') return PAL.slide;
  return PAL.tap;
}

interface Hit {
  lane: number;
  width: number;
  t0: number;
  color: string;
  kind: 'hit' | 'flick' | 'tick';
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  life: number;
  size: number;
  color: string;
}

export interface HudInfo {
  title: string;
  difficulty: Difficulty;
  level: number;
  autoplay: boolean;
  showFastLate: boolean;
  keyLabels: string[] | null;
  flickLabel: string;
  videoBg: boolean;
  dim: number;
  /** 6レーン譜面: キーの境目だけ線を引く */
  sixLane: boolean;
}

const wall = () => performance.now() / 1000;

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private cx = 0;
  private vY = 0;
  private J = 0;
  private LW = 0;
  private hits: Hit[] = [];
  private particles: Particle[] = [];
  private judgeText: { judge: Judge; t0: number; diff: number } | null = null;
  private comboPop = 0;
  private lastCombo = 0;
  private keyRelease: number[] = new Array(KEY_COUNT).fill(-10);
  private lastHold = 0;
  private bgShapes = Array.from({ length: 14 }, (_, i) => ({
    x: (i * 0.137 + 0.05) % 1,
    y: (i * 0.291 + 0.1) % 1,
    r: 0.04 + ((i * 7) % 5) * 0.025,
    s: 0.01 + (i % 4) * 0.006,
    hue: [190, 330, 170, 280][i % 4],
  }));

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.cx = this.w / 2;
    this.J = this.h * 0.84;
    // y=0.06（ステージ上端）が画面上 2% に来るように消失点を置く
    this.vY = (0.02 * this.h - 0.06 * this.J) / 0.94;
    this.LW = Math.min(this.w * 0.88, this.h * 1.45) / LANES;
  }

  private Y(y: number) {
    return this.vY + y * (this.J - this.vY);
  }
  private X(u: number, y: number) {
    return this.cx + (u - LANES / 2) * this.LW * sc(y);
  }

  // ---------------------------------------------------------------- effects

  onJudge(obj: HitObj, judge: Judge, diff: number) {
    if (obj.kind !== 'tick' && obj.kind !== 'trace') this.judgeText = { judge, t0: wall(), diff };
    if (judge === 'miss' || obj.hidden) return;
    const pal = palOf(obj);
    let lane = obj.lane;
    let width = obj.width;
    if (obj.kind === 'tick' && obj.slide) {
      [lane, width] = slideRangeAt(obj.slide, obj.time);
      width -= lane;
    }
    const isFlick = obj.kind === 'flick' || (obj.kind === 'slideEnd' && !!obj.dir);
    const kind = obj.kind === 'tick' || obj.kind === 'trace' ? 'tick' : isFlick ? 'flick' : 'hit';
    this.hits.push({ lane, width, t0: wall(), color: pal.glow, kind });
    const n = kind === 'tick' ? 4 : obj.critical ? 18 : 11;
    const x0 = this.X(lane, 1);
    const x1 = this.X(lane + width, 1);
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * (isFlick ? 0.9 : 2.4);
      const sp = (kind === 'tick' ? 120 : 260 + Math.random() * 380) * (this.h / 1080);
      this.particles.push({
        x: x0 + (x1 - x0) * Math.random(),
        y: this.J,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * (isFlick ? 1.6 : 1),
        t0: wall(),
        life: 0.35 + Math.random() * 0.3,
        size: (2 + Math.random() * 4) * (this.h / 1080),
        color: i % 3 === 0 ? '#ffffff' : pal.glow,
      });
    }
  }

  keyReleased(k: number) {
    this.keyRelease[k] = wall();
  }

  // ---------------------------------------------------------------- frame

  render(now: number, duration: number, chart: RuntimeChart, engine: GameEngine, hud: HudInfo, progress: number) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(hud);
    this.drawStage(engine, hud);

    // 描画対象の範囲（時刻）
    const tMax = now + duration;
    const tMin = now - 0.3;
    const objs = chart.objs;
    let lo = 0;
    let hi = objs.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (objs[m].time < tMin) lo = m + 1;
      else hi = m;
    }
    let end = lo;
    while (end < objs.length && objs[end].time <= tMax) end++;

    // ガイド（判定なし）
    for (let i = chart.guides.length - 1; i >= 0; i--) {
      const g = chart.guides[i];
      if (g.startTime > tMax || g.endTime < now) continue;
      this.drawSlideBody(g, now, duration, true);
    }
    // スライド本体
    for (let i = chart.slides.length - 1; i >= 0; i--) {
      const s = chart.slides[i];
      if (s.startTime > tMax || s.endTime < now - 0.05) continue;
      if (s.end && s.end.judge !== null && s.end.judge !== 'miss' && now > s.endTime) continue;
      this.drawSlideBody(s, now, duration, false);
    }

    // 同時押しライン
    c.save();
    for (const sl of chart.simLines) {
      if (sl.time < now || sl.time > tMax) continue;
      const y = approach(sl.time, now, duration);
      c.globalAlpha = this.spawnAlpha(y) * 0.9;
      c.strokeStyle = '#ffffff';
      c.lineWidth = Math.max(1, 3 * y * (this.h / 1080));
      c.beginPath();
      c.moveTo(this.X(sl.left, y), this.Y(y));
      c.lineTo(this.X(sl.right, y), this.Y(y));
      c.stroke();
    }
    c.restore();

    // スライドの押さえている位置（判定ライン上）
    for (const s of chart.slides) {
      if (now < s.startTime || now > s.endTime) continue;
      if (s.end && s.end.judge !== null) continue;
      const [l, r] = slideRangeAt(s, now);
      this.drawNote(l, r - l, 1, s.critical ? PAL.critical : PAL.slide, s.covered ? 1 : 0.45, false);
      if (s.covered) this.holdEffect(l, r, s.critical ? PAL.critical.glow : PAL.slide.glow);
    }

    // ノーツ（奥から手前へ）
    for (let i = end - 1; i >= lo; i--) {
      const o = objs[i];
      if (o.judge !== null) continue;
      const y = approach(o.time, now, duration);
      if (y < SPAWN_Y * 0.98 || y > 1.3) continue;
      const a = this.spawnAlpha(y) * (y > 1 ? Math.max(0, 1 - (y - 1) * 5) : 1);
      if (o.kind === 'tick') {
        if (!o.hidden) {
          const [l, r] = o.slide ? slideRangeAt(o.slide, o.time) : [o.lane, o.lane + o.width];
          this.drawDiamond((l + r) / 2, y, o.critical ? PAL.critical : o.trace ? PAL.trace : PAL.slide, a, o.trace ? 0.8 : 1);
        }
        continue;
      }
      const pal = palOf(o);
      this.drawNote(o.lane, o.width, y, pal, a, o.trace);
      if (o.trace) this.drawDiamond(o.lane + o.width / 2, y, pal, a, 0.8);
      if (o.dir) this.drawFlickArrow(o.lane, o.width, y, o.dir, o.critical, a);
    }

    this.drawEffects();
    this.drawHud(engine, chart, hud, progress);
  }

  private spawnAlpha(y: number) {
    return Math.min(1, Math.max(0, (y - SPAWN_Y) / 0.03));
  }

  private drawBackground(hud: HudInfo) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    if (hud.videoBg) {
      c.fillStyle = `rgba(4,4,14,${hud.dim})`;
      c.fillRect(0, 0, this.w, this.h);
      return;
    }
    const g = c.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#15103a');
    g.addColorStop(0.55, '#0c1a3a');
    g.addColorStop(1, '#06121f');
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);
    const t = wall();
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const s of this.bgShapes) {
      const x = ((s.x + t * s.s * 0.3) % 1.2) * this.w - 0.1 * this.w;
      const y = (s.y + Math.sin(t * s.s * 3 + s.x * 9) * 0.03) * this.h;
      const r = s.r * this.h;
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `hsla(${s.hue},90%,65%,0.10)`);
      rg.addColorStop(1, `hsla(${s.hue},90%,65%,0)`);
      c.fillStyle = rg;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private quad(l: number, r: number, y1: number, y2: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(this.X(l, y1), this.Y(y1));
    c.lineTo(this.X(r, y1), this.Y(y1));
    c.lineTo(this.X(r, y2), this.Y(y2));
    c.lineTo(this.X(l, y2), this.Y(y2));
    c.closePath();
  }

  private drawStage(engine: GameEngine, hud: HudInfo) {
    const c = this.ctx;
    const yTop = 0.06;
    const yBot = (this.h - this.vY) / (this.J - this.vY);
    // 土台
    this.quad(0, LANES, yTop, yBot);
    const g = c.createLinearGradient(0, this.Y(yTop), 0, this.h);
    g.addColorStop(0, 'rgba(10,12,34,0.35)');
    g.addColorStop(0.25, 'rgba(10,12,34,0.82)');
    g.addColorStop(1, 'rgba(6,8,24,0.92)');
    c.fillStyle = g;
    c.fill();
    // キーごとの帯
    for (let k = 0; k < KEY_COUNT; k++) {
      if (k % 2 === 1) {
        this.quad(k * LANES_PER_KEY, (k + 1) * LANES_PER_KEY, yTop, yBot);
        c.fillStyle = 'rgba(255,255,255,0.028)';
        c.fill();
      }
    }
    // 押下中のレーンを光らせる
    const t = wall();
    for (let k = 0; k < KEY_COUNT; k++) {
      const held = engine.autoplay ? false : engine.held[k];
      const fade = held ? 1 : Math.max(0, 1 - (t - this.keyRelease[k]) / 0.15);
      if (fade <= 0) continue;
      const l = k * LANES_PER_KEY;
      this.quad(l, l + LANES_PER_KEY, 0.45, 1);
      const lg = c.createLinearGradient(0, this.Y(0.45), 0, this.Y(1));
      lg.addColorStop(0, 'rgba(120,230,255,0)');
      lg.addColorStop(1, `rgba(120,230,255,${0.32 * fade})`);
      c.fillStyle = lg;
      c.fill();
    }
    // レーン線
    const lineGrad = (alpha: number) => {
      const lg = c.createLinearGradient(0, this.Y(yTop), 0, this.J);
      lg.addColorStop(0, `rgba(255,255,255,0)`);
      lg.addColorStop(0.3, `rgba(255,255,255,${alpha})`);
      lg.addColorStop(1, `rgba(255,255,255,${alpha})`);
      return lg;
    };
    for (let i = 1; i < LANES; i++) {
      const major = i % LANES_PER_KEY === 0;
      if (hud.sixLane && !major) continue;
      c.strokeStyle = lineGrad(major ? 0.32 : 0.1);
      c.lineWidth = major ? 1.6 : 1;
      c.beginPath();
      c.moveTo(this.X(i, yTop), this.Y(yTop));
      c.lineTo(this.X(i, yBot), this.Y(yBot));
      c.stroke();
    }
    // 両端
    c.save();
    c.shadowColor = '#6ff0ff';
    c.shadowBlur = 12;
    c.strokeStyle = lineGrad(0.9);
    c.lineWidth = 3;
    for (const u of [0, LANES]) {
      c.beginPath();
      c.moveTo(this.X(u, yTop), this.Y(yTop));
      c.lineTo(this.X(u, yBot), this.Y(yBot));
      c.stroke();
    }
    c.restore();
    // 判定ライン
    const jh = NOTE_H * 1.15;
    this.quad(0, LANES, 1 - jh, 1 + jh);
    const jg = c.createLinearGradient(0, this.Y(1 - jh), 0, this.Y(1 + jh));
    jg.addColorStop(0, 'rgba(255,255,255,0.05)');
    jg.addColorStop(0.5, 'rgba(200,250,255,0.28)');
    jg.addColorStop(1, 'rgba(255,255,255,0.05)');
    c.fillStyle = jg;
    c.fill();
    c.save();
    c.shadowColor = '#9ff6ff';
    c.shadowBlur = 16;
    c.strokeStyle = 'rgba(235,255,255,0.95)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(this.X(0, 1), this.J);
    c.lineTo(this.X(LANES, 1), this.J);
    c.stroke();
    c.restore();
    // キーラベル
    if (hud.keyLabels) {
      const fy = 1.09;
      const fs = Math.round(this.h * 0.024);
      c.font = `700 ${fs}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (let k = 0; k < KEY_COUNT; k++) {
        const held = engine.held[k] && !engine.autoplay;
        c.fillStyle = held ? 'rgba(160,245,255,1)' : 'rgba(255,255,255,0.4)';
        c.fillText(hud.keyLabels[k], this.X(k * LANES_PER_KEY + LANES_PER_KEY / 2, fy), this.Y(fy));
      }
      c.font = `600 ${Math.round(fs * 0.7)}px ${FONT}`;
      c.fillStyle = engine.flickHeld && !engine.autoplay ? 'rgba(255,150,210,1)' : 'rgba(255,255,255,0.3)';
      c.fillText(`フリック: ${hud.flickLabel}`, this.cx, this.Y(1.155));
    }
  }

  private drawSlideBody(s: RSlide, now: number, duration: number, guide: boolean) {
    const c = this.ctx;
    const tA = Math.max(s.startTime, now);
    const tB = Math.min(s.endTime, now + duration);
    if (tB <= tA) return;
    const times: number[] = [tA];
    const step = duration / 48;
    for (let t = tA + step; t < tB; t += step) times.push(t);
    for (const p of s.points) if (p.time > tA && p.time < tB) times.push(p.time);
    times.push(tB);
    times.sort((a, b) => a - b);
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (const t of times) {
      const y = approach(t, now, duration);
      const [l, r] = slideRangeAt(s, t);
      const inset = 0.08;
      left.push([this.X(l + inset, y), this.Y(y)]);
      right.push([this.X(r - inset, y), this.Y(y)]);
    }
    const yTopScreen = left[left.length - 1][1];
    const g = c.createLinearGradient(0, yTopScreen, 0, this.J);
    const base = s.critical ? '255,214,70' : '70,235,150';
    const dimmed = guide || (!s.covered && now > s.startTime && s.start?.judge === 'miss');
    const a = guide ? 0.22 : dimmed ? 0.18 : 0.42;
    g.addColorStop(0, `rgba(${base},0)`);
    g.addColorStop(0.08, `rgba(${base},${a})`);
    g.addColorStop(1, `rgba(${base},${a + 0.1})`);
    c.beginPath();
    c.moveTo(left[0][0], left[0][1]);
    for (const p of left) c.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    if (guide) return;
    // 縁
    c.strokeStyle = `rgba(${s.critical ? '255,240,180' : '190,255,220'},${dimmed ? 0.25 : 0.6})`;
    c.lineWidth = 2;
    for (const edge of [left, right]) {
      c.beginPath();
      edge.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      c.stroke();
    }
  }

  private drawNote(lane: number, width: number, y: number, pal: Palette, alpha: number, thin: boolean) {
    const c = this.ctx;
    const h = thin ? NOTE_H * 0.55 : NOTE_H;
    const inset = 0.04;
    const l = lane + inset;
    const r = lane + width - inset;
    const y1 = y * (1 - h);
    const y2 = y * (1 + h);
    const x1l = this.X(l, y1);
    const x1r = this.X(r, y1);
    const x2l = this.X(l, y2);
    const x2r = this.X(r, y2);
    const sy1 = this.Y(y1);
    const sy2 = this.Y(y2);
    const thick = sy2 - sy1;
    const rad = Math.min(thick * 0.5, (x2r - x2l) * 0.25);
    c.save();
    c.globalAlpha = alpha;
    // 本体（角丸台形）
    c.beginPath();
    c.moveTo(x1l + rad, sy1);
    c.lineTo(x1r - rad, sy1);
    c.quadraticCurveTo(x1r, sy1, (x1r + x2r) / 2, (sy1 + sy2) / 2);
    c.quadraticCurveTo(x2r, sy2, x2r - rad, sy2);
    c.lineTo(x2l + rad, sy2);
    c.quadraticCurveTo(x2l, sy2, (x1l + x2l) / 2, (sy1 + sy2) / 2);
    c.quadraticCurveTo(x1l, sy1, x1l + rad, sy1);
    c.closePath();
    const g = c.createLinearGradient(0, sy1, 0, sy2);
    g.addColorStop(0, pal.top);
    g.addColorStop(0.45, pal.mid);
    g.addColorStop(1, pal.bottom);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(1, 2.2 * y * (this.h / 1080));
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.stroke();
    // 両端のつまみ
    const capW = Math.min(0.22, width * 0.18);
    c.fillStyle = pal.cap;
    for (const [a, b] of [
      [l + 0.06, l + 0.06 + capW],
      [r - 0.06 - capW, r - 0.06],
    ]) {
      const cy1 = y * (1 - h * 0.5);
      const cy2 = y * (1 + h * 0.5);
      this.quad(a, b, cy1, cy2);
      c.fill();
    }
    // ハイライト
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = Math.max(1, 1.5 * y);
    const hy = y * (1 - h * 0.25);
    c.beginPath();
    c.moveTo(this.X(l + 0.35, hy), this.Y(hy));
    c.lineTo(this.X(r - 0.35, hy), this.Y(hy));
    c.stroke();
    c.restore();
  }

  private drawDiamond(u: number, y: number, pal: Palette, alpha: number, scale: number) {
    const c = this.ctx;
    const x = this.X(u, y);
    const sy = this.Y(y);
    const s = this.LW * sc(y) * 0.32 * scale;
    c.save();
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(x, sy - s * 0.75);
    c.lineTo(x + s, sy);
    c.lineTo(x, sy + s * 0.75);
    c.lineTo(x - s, sy);
    c.closePath();
    const g = c.createLinearGradient(0, sy - s, 0, sy + s);
    g.addColorStop(0, pal.top);
    g.addColorStop(1, pal.bottom);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(1, 2 * y);
    c.stroke();
    c.restore();
  }

  private drawFlickArrow(lane: number, width: number, y: number, dir: FlickDir, critical: boolean, alpha: number) {
    const c = this.ctx;
    const u = lane + width / 2;
    const s = this.LW * sc(y) * (0.42 + 0.1 * Math.min(width, 6));
    const x0 = this.X(u, y);
    const baseY = this.Y(y * (1 - NOTE_H)) - s * 0.15;
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const col = critical ? PAL.critical : PAL.flick;
    const t = (wall() * 1.8) % 1;
    const chevron = (ox: number, oy: number, k: number, a: number, solid: boolean) => {
      c.save();
      c.globalAlpha = alpha * a;
      c.translate(x0 + ox, baseY + oy);
      c.rotate(dx * 0.62);
      c.scale(k, k);
      c.beginPath();
      c.moveTo(0, -s);
      c.lineTo(s * 0.78, -s * 0.08);
      c.lineTo(s * 0.34, -s * 0.08);
      c.lineTo(s * 0.34, s * 0.12);
      c.lineTo(-s * 0.34, s * 0.12);
      c.lineTo(-s * 0.34, -s * 0.08);
      c.lineTo(-s * 0.78, -s * 0.08);
      c.closePath();
      if (solid) {
        const g = c.createLinearGradient(0, -s, 0, s * 0.12);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, col.top);
        g.addColorStop(1, col.mid);
        c.fillStyle = g;
        c.fill();
        c.lineWidth = Math.max(1.5, 2.5 * sc(y));
        c.strokeStyle = col.bottom;
        c.stroke();
      } else {
        c.fillStyle = col.glow;
        c.fill();
      }
      c.restore();
    };
    // 流れていく残像 + 本体
    const off = t * s * 0.9;
    chevron(dx * off * 0.55, -off, 0.8, (1 - t) * 0.55, false);
    chevron(0, 0, 1, 1, true);
  }

  private holdEffect(l: number, r: number, color: string) {
    const c = this.ctx;
    const t = wall();
    const x0 = this.X(l, 1);
    const x1 = this.X(r, 1);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const pulse = 0.7 + 0.3 * Math.sin(t * 20);
    const g = c.createRadialGradient((x0 + x1) / 2, this.J, 0, (x0 + x1) / 2, this.J, (x1 - x0) * 0.8);
    g.addColorStop(0, `rgba(255,255,255,${0.35 * pulse})`);
    g.addColorStop(0.4, color + '66');
    g.addColorStop(1, color + '00');
    c.fillStyle = g;
    c.fillRect(x0 - (x1 - x0) * 0.3, this.J - (x1 - x0) * 0.8, (x1 - x0) * 1.6, (x1 - x0) * 1.6);
    c.restore();
    if (t - this.lastHold > 0.03) {
      this.lastHold = t;
      const sp = (160 + Math.random() * 200) * (this.h / 1080);
      this.particles.push({
        x: x0 + (x1 - x0) * Math.random(),
        y: this.J,
        vx: (Math.random() - 0.5) * 60,
        vy: -sp,
        t0: t,
        life: 0.3 + Math.random() * 0.2,
        size: (2 + Math.random() * 3) * (this.h / 1080),
        color,
      });
    }
  }

  private drawEffects() {
    const c = this.ctx;
    const t = wall();
    c.save();
    c.globalCompositeOperation = 'lighter';
    this.hits = this.hits.filter((h) => t - h.t0 < 0.45);
    for (const h of this.hits) {
      const a = (t - h.t0) / (h.kind === 'tick' ? 0.25 : 0.45);
      if (a >= 1) continue;
      const fade = 1 - a;
      const xc = this.X(h.lane + h.width / 2, 1);
      const halfW = (this.X(h.lane + h.width, 1) - this.X(h.lane, 1)) / 2;
      if (h.kind !== 'tick') {
        // レーンから立ち上る光
        const top = this.J - this.h * (0.18 + a * 0.25) * (h.kind === 'flick' ? 1.6 : 1);
        const g = c.createLinearGradient(0, top, 0, this.J);
        g.addColorStop(0, h.color + '00');
        g.addColorStop(1, h.color + Math.round(fade * 160).toString(16).padStart(2, '0'));
        c.fillStyle = g;
        c.fillRect(xc - halfW * (1 - a * 0.3), top, halfW * 2 * (1 - a * 0.3), this.J - top);
      }
      // 波紋
      const rx = halfW * (0.8 + a * 1.4) + this.LW * 0.3;
      c.strokeStyle = h.color;
      c.globalAlpha = fade;
      c.lineWidth = (h.kind === 'tick' ? 2 : 5) * fade + 1;
      c.beginPath();
      c.ellipse(xc, this.J, rx, rx * 0.22, 0, 0, Math.PI * 2);
      c.stroke();
      // 中心の閃光
      const rg = c.createRadialGradient(xc, this.J, 0, xc, this.J, halfW + this.LW);
      rg.addColorStop(0, `rgba(255,255,255,${0.7 * fade})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg;
      c.beginPath();
      c.ellipse(xc, this.J, halfW + this.LW, (halfW + this.LW) * 0.35, 0, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    this.particles = this.particles.filter((p) => t - p.t0 < p.life);
    for (const p of this.particles) {
      const age = t - p.t0;
      const k = age / p.life;
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age + 300 * age * age * (this.h / 1080);
      c.globalAlpha = 1 - k;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(x, y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawHud(engine: GameEngine, chart: RuntimeChart, hud: HudInfo, progress: number) {
    const c = this.ctx;
    const u = this.h / 1080;
    const t = wall();

    // 判定表示
    if (this.judgeText) {
      const age = t - this.judgeText.t0;
      if (age < 0.6) {
        const j = this.judgeText.judge;
        const pop = 1 + 0.3 * Math.max(0, 1 - age / 0.07);
        const alpha = age < 0.45 ? 1 : 1 - (age - 0.45) / 0.15;
        const fs = 64 * u * pop;
        const y = this.Y(0.66);
        c.save();
        c.globalAlpha = alpha;
        c.font = `italic 900 ${fs}px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const text = j.toUpperCase();
        const wText = c.measureText(text).width;
        let fill: string | CanvasGradient;
        if (j === 'perfect') {
          const g = c.createLinearGradient(this.cx - wText / 2, 0, this.cx + wText / 2, 0);
          g.addColorStop(0, '#ff7ad9');
          g.addColorStop(0.35, '#ffe66e');
          g.addColorStop(0.65, '#86ffcf');
          g.addColorStop(1, '#6fd6ff');
          fill = g;
        } else {
          fill = { great: '#ff64c8', good: '#4fd2ff', bad: '#9a86ff', miss: '#c8c8d0' }[j];
        }
        c.lineWidth = 7 * u;
        c.strokeStyle = 'rgba(20,10,40,0.85)';
        c.strokeText(text, this.cx, y);
        c.fillStyle = fill;
        c.fillText(text, this.cx, y);
        if (hud.showFastLate && (j === 'great' || j === 'good' || j === 'bad')) {
          const fast = this.judgeText.diff < 0;
          c.font = `italic 800 ${26 * u}px ${FONT}`;
          c.lineWidth = 5 * u;
          c.strokeText(fast ? 'FAST' : 'LATE', this.cx, y - fs * 0.75);
          c.fillStyle = fast ? '#6fc3ff' : '#ff8a6a';
          c.fillText(fast ? 'FAST' : 'LATE', this.cx, y - fs * 0.75);
        }
        c.restore();
      }
    }

    // コンボ
    const combo = engine.stats.combo;
    if (combo !== this.lastCombo) {
      if (combo > this.lastCombo) this.comboPop = t;
      this.lastCombo = combo;
    }
    if (combo >= 2) {
      const yMid = this.h * 0.42;
      const yDepth = (yMid - this.vY) / (this.J - this.vY);
      const x = Math.min(this.w - 120 * u, this.X(LANES, yDepth) + 150 * u);
      const pop = 1 + 0.18 * Math.max(0, 1 - (t - this.comboPop) / 0.08);
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.font = `italic 800 ${28 * u}px ${FONT}`;
      const ap = engine.allPerfect;
      c.fillStyle = ap ? '#ffe98a' : '#ffffff';
      c.fillText('COMBO', x, yMid - 70 * u);
      c.font = `italic 900 ${96 * u * pop}px ${FONT}`;
      let fill: string | CanvasGradient = '#ffffff';
      if (ap) {
        const g = c.createLinearGradient(0, yMid - 80 * u, 0, yMid);
        g.addColorStop(0, '#fff6b0');
        g.addColorStop(0.5, '#ffb3e6');
        g.addColorStop(1, '#8fe8ff');
        fill = g;
      } else if (engine.fullCombo) {
        fill = '#a8f0ff';
      }
      c.lineWidth = 6 * u;
      c.strokeStyle = 'rgba(20,10,40,0.8)';
      c.strokeText(String(combo), x, yMid + 18 * u);
      c.fillStyle = fill;
      c.fillText(String(combo), x, yMid + 18 * u);
      c.restore();
    }

    // スコア
    const score = engine.score;
    c.save();
    const px = 24 * u;
    const py = 20 * u;
    const pw = 420 * u;
    c.fillStyle = 'rgba(10,10,30,0.55)';
    roundRect(c, px, py, pw, 92 * u, 14 * u);
    c.fill();
    c.fillStyle = '#9fe9ff';
    c.font = `800 ${18 * u}px ${FONT}`;
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillText('SCORE', px + 18 * u, py + 12 * u);
    c.fillStyle = '#ffffff';
    c.font = `italic 900 ${40 * u}px ${FONT}`;
    c.textAlign = 'right';
    c.fillText(score.toLocaleString('en-US').padStart(9, ' '), px + pw - 70 * u, py + 6 * u);
    c.font = `italic 900 ${36 * u}px ${FONT}`;
    const rank = rankOf(score);
    c.fillStyle = { S: '#ffd84a', A: '#ff7ad9', B: '#6fd6ff', C: '#86ffcf', D: '#bbbbbb' }[rank] ?? '#fff';
    c.fillText(rank, px + pw - 20 * u, py + 8 * u);
    // ランクゲージ
    const bx = px + 18 * u;
    const by = py + 60 * u;
    const bw = pw - 36 * u;
    const bh = 12 * u;
    c.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(c, bx, by, bw, bh, bh / 2);
    c.fill();
    const maxS = 1_000_000;
    const g = c.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#6fd6ff');
    g.addColorStop(0.7, '#ff7ad9');
    g.addColorStop(1, '#ffe66e');
    c.fillStyle = g;
    roundRect(c, bx, by, Math.max(bh, (bw * score) / maxS), bh, bh / 2);
    c.fill();
    c.textAlign = 'center';
    c.font = `800 ${11 * u}px ${FONT}`;
    for (const [r, v] of RANK_BORDERS) {
      const x = bx + (bw * v) / maxS;
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillRect(x - 1, by - 3 * u, 2, bh + 6 * u);
      c.fillText(r, x, by + bh + 3 * u);
    }
    c.restore();

    // ライフ
    c.save();
    const lw = 300 * u;
    const lx = this.w - lw - 24 * u;
    const ly = 20 * u;
    c.fillStyle = 'rgba(10,10,30,0.55)';
    roundRect(c, lx, ly, lw, 56 * u, 14 * u);
    c.fill();
    const life = engine.stats.life;
    c.fillStyle = '#ffffff';
    c.font = `800 ${16 * u}px ${FONT}`;
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillText('LIFE', lx + 16 * u, ly + 10 * u);
    c.textAlign = 'right';
    c.font = `italic 900 ${22 * u}px ${FONT}`;
    c.fillText(String(life), lx + lw - 16 * u, ly + 6 * u);
    const lbx = lx + 16 * u;
    const lby = ly + 36 * u;
    const lbw = lw - 32 * u;
    c.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(c, lbx, lby, lbw, 9 * u, 4 * u);
    c.fill();
    c.fillStyle = life > 300 ? '#6dfa9e' : '#ff5f7a';
    roundRect(c, lbx, lby, (lbw * life) / 1000, 9 * u, 4 * u);
    c.fill();
    c.restore();

    // 曲名・難易度（右上、ライフの下）
    c.save();
    c.textAlign = 'right';
    c.textBaseline = 'top';
    const rx = this.w - 24 * u;
    c.font = `800 ${20 * u}px ${FONT}`;
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.fillText(hud.title, rx, 88 * u);
    const diffText = `${hud.difficulty.toUpperCase()} ${hud.level}`;
    c.font = `900 ${14 * u}px ${FONT}`;
    const dw = c.measureText(diffText).width + 20 * u;
    c.fillStyle = DIFFICULTY_COLORS[hud.difficulty];
    roundRect(c, rx - dw, 116 * u, dw, 22 * u, 11 * u);
    c.fill();
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.fillText(diffText, rx - dw / 2, 120 * u);
    c.textAlign = 'left';
    if (hud.autoplay) {
      c.font = `italic 900 ${20 * u}px ${FONT}`;
      c.fillStyle = `rgba(255,220,120,${0.6 + 0.4 * Math.sin(t * 4)})`;
      c.fillText('AUTO PLAY', 24 * u, 124 * u);
    }
    if (engine.stats.failed) {
      c.font = `900 ${16 * u}px ${FONT}`;
      c.fillStyle = '#ff6f8a';
      c.fillText('LIFE 0 — クリア失敗', 24 * u, 152 * u);
    }
    c.restore();

    // 進行バー
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(0, 0, this.w, 4 * u);
    c.fillStyle = '#6ff0ff';
    c.fillRect(0, 0, this.w * Math.min(1, Math.max(0, progress)), 4 * u);
    void chart;
  }
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}
