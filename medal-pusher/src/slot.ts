// 上部液晶：スロット抽選・ジャックポット抽選の表示とロジック
// 絵柄: "Slot Machine Resource Pack" by Molly "Cougarmint" Willits (CC-BY 3.0)

import { GAME } from './config.ts';

export type SymbolKey = 'cherries' | 'lemon' | 'melon' | 'bell' | 'clover' | 'bar' | 'horseshoe' | 'seven' | 'heart';

interface SymbolDef {
  key: SymbolKey;
  file: string;
  payout: number; // 3つ揃いの払い出し枚数
  weight: number; // 当選確率の重み（1スピンあたり）
  label: string;
}

const SYMBOLS: SymbolDef[] = [
  { key: 'cherries', file: 'cherries', payout: 5, weight: 100, label: 'CHERRY' },
  { key: 'lemon', file: 'lemon', payout: 8, weight: 60, label: 'LEMON' },
  { key: 'melon', file: 'melon', payout: 10, weight: 40, label: 'MELON' },
  { key: 'bell', file: 'bell', payout: 15, weight: 30, label: 'BELL' },
  { key: 'clover', file: 'clover', payout: 20, weight: 20, label: 'CLOVER' },
  { key: 'bar', file: 'Bar1', payout: 30, weight: 14, label: 'BAR' },
  { key: 'horseshoe', file: 'horseshoe', payout: 0, weight: 14, label: 'BALL' },
  { key: 'seven', file: 'Lucky7_rainbow', payout: 77, weight: 6, label: 'SEVEN' },
  { key: 'heart', file: 'heart', payout: 0, weight: 0, label: '' }, // ハズレ用
];
const LOSE_WEIGHT = 716; // 合計1000に対するハズレの重み

const STRIP: SymbolKey[] = [
  'seven', 'cherries', 'bell', 'lemon', 'heart', 'melon', 'horseshoe', 'cherries',
  'clover', 'bar', 'lemon', 'heart', 'bell', 'cherries', 'melon', 'clover',
];

export type SpinResult = { kind: 'lose' } | { kind: 'win'; symbol: SymbolKey; payout: number; ball: boolean; fever: boolean };

export const JP_SEGMENTS: (number | 'JP')[] = ['JP', 20, 50, 30, 100, 20, 30, 50];
const JP_WEIGHTS = [1, 4, 2, 3, 1, 4, 3, 2];

type Mode = 'idle' | 'spinning' | 'jp';

interface Reel {
  pos: number; // ストリップ上の位置（小数）
  speed: number;
  stopAt: number; // 停止時刻
  target: number; // 停止させるストリップのインデックス
  stopped: boolean;
  startPos: number;
  decel: number;
}

export interface SlotCallbacks {
  onReelStop?: (index: number) => void;
  onReach?: () => void;
  onTick?: () => void;
  onResult?: (r: SpinResult) => void;
  onJpTick?: () => void;
  onJpResult?: (v: number | 'JP') => void;
}

export class SlotScreen {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private images = new Map<SymbolKey, HTMLImageElement>();
  pending = 0;
  jackpot = GAME.startJackpot;
  mode: Mode = 'idle';
  cb: SlotCallbacks = {};
  dirty = true;

  private reels: Reel[] = [];
  private result: SpinResult | null = null;
  private time = 0;
  private spinStart = 0;
  private reachFired = false;
  private lastTickPos = 0;
  private message = 'INSERT MEDAL';
  private messageColor = '#9ff';
  private messageUntil = Infinity;
  private flashUntil = 0;

  // JP抽選
  private jpPos = 0;
  private jpSpeed = 0;
  private jpTarget = 0;
  private jpStart = 0;
  private jpDone = false;
  private jpLastIndex = -1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 640;
    this.ctx = this.canvas.getContext('2d')!;
    for (let i = 0; i < 3; i++) {
      this.reels.push({ pos: i * 5, speed: 0, stopAt: 0, target: 0, stopped: true, startPos: 0, decel: 0 });
    }
  }

  async load(base: string): Promise<void> {
    await Promise.all(
      SYMBOLS.map(
        (s) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = `${base}assets/slot/${s.file}.png`;
            this.images.set(s.key, img);
          }),
      ),
    );
    this.dirty = true;
  }

  addPending(): boolean {
    if (this.pending >= GAME.maxPendingSpins) return false;
    this.pending++;
    this.dirty = true;
    return true;
  }

  /** JP抽選の結果がまだ出ていない */
  get jpInProgress(): boolean {
    return this.mode === 'jp' && !this.jpDone;
  }

  get busy(): boolean {
    return this.mode !== 'idle';
  }

  showMessage(text: string, color = '#ff6', seconds = 2.5): void {
    this.message = text;
    this.messageColor = color;
    this.messageUntil = this.time + seconds;
    this.dirty = true;
  }

  flash(seconds = 1.2): void {
    this.flashUntil = this.time + seconds;
  }

  private decide(): SpinResult {
    const total = LOSE_WEIGHT + SYMBOLS.reduce((a, s) => a + s.weight, 0);
    let r = Math.random() * total;
    for (const s of SYMBOLS) {
      if (s.weight === 0) continue;
      r -= s.weight;
      if (r < 0) return { kind: 'win', symbol: s.key, payout: s.payout, ball: s.key === 'horseshoe', fever: s.key === 'seven' };
    }
    return { kind: 'lose' };
  }

  private indexOf(sym: SymbolKey): number {
    const idx = STRIP.map((s, i) => (s === sym ? i : -1)).filter((i) => i >= 0);
    return idx[Math.floor(Math.random() * idx.length)];
  }

  startSpin(): boolean {
    if (this.mode !== 'idle' || this.pending <= 0) return false;
    this.pending--;
    this.mode = 'spinning';
    this.result = this.decide();
    this.spinStart = this.time;
    this.reachFired = false;

    let targets: SymbolKey[];
    if (this.result.kind === 'win') {
      targets = [this.result.symbol, this.result.symbol, this.result.symbol];
    } else {
      const pool: SymbolKey[] = ['cherries', 'lemon', 'melon', 'bell', 'clover', 'bar', 'horseshoe', 'seven', 'heart'];
      const pick = () => pool[Math.floor(Math.random() * pool.length)];
      const a = pick();
      // ハズレの3割はリーチ目
      const b = Math.random() < 0.3 ? a : pick();
      let c = pick();
      while (c === a && b === a) c = pick();
      targets = [a, b, c];
    }
    const reach = targets[0] === targets[1];
    const stops = [1.1, 1.65, reach ? 4.2 : 2.2];
    this.reels.forEach((reel, i) => {
      reel.stopped = false;
      reel.speed = 22 + i * 2;
      reel.target = this.indexOf(targets[i]);
      reel.stopAt = this.spinStart + stops[i];
    });
    this.message = '';
    this.dirty = true;
    return true;
  }

  startJackpotChance(): void {
    this.mode = 'jp';
    const total = JP_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    this.jpTarget = 0;
    for (let i = 0; i < JP_WEIGHTS.length; i++) {
      r -= JP_WEIGHTS[i];
      if (r < 0) {
        this.jpTarget = i;
        break;
      }
    }
    this.jpStart = this.time;
    this.jpSpeed = 18;
    this.jpDone = false;
    this.showMessage('JACKPOT CHANCE!!', '#f6f', 999);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.time > this.messageUntil) {
      this.message = this.pending > 0 || this.mode !== 'idle' ? '' : 'INSERT MEDAL';
      this.messageColor = '#9ff';
      this.messageUntil = Infinity;
      this.dirty = true;
    }
    if (this.mode === 'spinning') this.updateReels(dt);
    if (this.mode === 'jp') this.updateJp(dt);
    if (this.mode === 'idle' && this.pending > 0) this.startSpin();
    if (this.time < this.flashUntil) this.dirty = true;
  }

  private updateReels(dt: number): void {
    const n = STRIP.length;
    let allStopped = true;
    this.reels.forEach((reel, i) => {
      if (reel.stopped) return;
      allStopped = false;
      const remaining = reel.stopAt - this.time;
      if (remaining <= 0) {
        reel.pos = reel.target;
        reel.stopped = true;
        this.cb.onReelStop?.(i);
        if (i === 1 && this.reels[0].target !== undefined && STRIP[this.reels[0].target] === STRIP[this.reels[1].target] && !this.reachFired) {
          this.reachFired = true;
          this.cb.onReach?.();
          this.showMessage('REACH!', '#f44', 2.5);
        }
        return;
      }
      // 停止直前は目標位置に向けて減速
      const isReachReel = i === 2 && this.reachFired;
      const slowWindow = isReachReel ? 2.4 : 0.35;
      if (remaining < slowWindow) {
        const speed = isReachReel ? 3 + remaining * 4 : reel.speed;
        const dist = speed * remaining * 0.55;
        reel.pos = (((reel.target - dist) % n) + n) % n;
      } else {
        reel.pos = (reel.pos + reel.speed * dt) % n;
      }
    });
    const tickPos = Math.floor(this.reels[2].pos);
    if (tickPos !== this.lastTickPos) {
      this.lastTickPos = tickPos;
      this.cb.onTick?.();
    }
    this.dirty = true;
    if (allStopped) {
      this.mode = 'idle';
      const r = this.result!;
      if (r.kind === 'win') {
        this.flash(r.fever ? 3 : 1.5);
        const sym = SYMBOLS.find((s) => s.key === r.symbol)!;
        if (r.ball) this.showMessage('BALL GET!!', '#6ff', 3);
        else this.showMessage(`${sym.label} +${r.payout}`, r.fever ? '#f6f' : '#ff6', 3);
      }
      this.cb.onResult?.(r);
    }
  }

  private updateJp(dt: number): void {
    const n = JP_SEGMENTS.length;
    const elapsed = this.time - this.jpStart;
    if (!this.jpDone) {
      const spinTime = 4.5;
      if (elapsed < spinTime - 2) {
        this.jpPos = (this.jpPos + this.jpSpeed * dt) % n;
      } else {
        // 目標セグメントにぴったり止まるよう減速
        const remaining = Math.max(0, spinTime - elapsed);
        const dist = remaining * remaining * 3.2;
        this.jpPos = (((this.jpTarget - dist) % n) + n) % n;
        if (remaining <= 0) {
          this.jpPos = this.jpTarget;
          this.jpDone = true;
          this.jpStart = this.time;
          const v = JP_SEGMENTS[this.jpTarget];
          this.flash(v === 'JP' ? 4 : 1.5);
          this.showMessage(v === 'JP' ? `JACKPOT!! ${this.jackpot}` : `+${v} MEDALS`, v === 'JP' ? '#f6f' : '#ff6', 4);
          this.cb.onJpResult?.(v);
        }
      }
      const idx = Math.round(this.jpPos) % n;
      if (idx !== this.jpLastIndex) {
        this.jpLastIndex = idx;
        this.cb.onJpTick?.();
      }
    } else if (elapsed > 2.5) {
      this.mode = 'idle';
    }
    this.dirty = true;
  }

  draw(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const flashing = this.time < this.flashUntil && Math.floor(this.time * 8) % 2 === 0;

    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, flashing ? '#402060' : '#0a0618');
    bg.addColorStop(1, flashing ? '#603010' : '#120a26');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    // 走査線風グリッド
    c.strokeStyle = 'rgba(120,80,255,0.08)';
    c.lineWidth = 1;
    for (let y = 0; y < H; y += 8) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }

    // JACKPOT 表示
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '700 40px Orbitron, sans-serif';
    c.fillStyle = '#f9c';
    c.shadowColor = '#f0a';
    c.shadowBlur = 18;
    c.fillText('JACKPOT', W / 2, 46);
    c.font = '900 84px Orbitron, sans-serif';
    c.fillStyle = '#ffd84a';
    c.shadowColor = '#fa0';
    c.fillText(String(this.jackpot).padStart(4, '0'), W / 2, 118);
    c.shadowBlur = 0;

    if (this.mode === 'jp' || (this.mode === 'idle' && this.jpDone && this.time - this.jpStart < 2.5)) {
      this.drawJp(c, W);
    } else {
      this.drawReels(c, W);
    }

    // 保留ランプ
    const lampY = 590;
    c.font = '700 26px Orbitron, sans-serif';
    c.fillStyle = '#8af';
    c.textAlign = 'left';
    c.fillText('STOCK', 60, lampY);
    for (let i = 0; i < GAME.maxPendingSpins; i++) {
      const on = i < this.pending;
      c.beginPath();
      c.arc(210 + i * 56, lampY, 18, 0, Math.PI * 2);
      c.fillStyle = on ? '#ff4' : '#332';
      c.shadowColor = '#ff0';
      c.shadowBlur = on ? 20 : 0;
      c.fill();
      c.shadowBlur = 0;
    }
    // メッセージ
    if (this.message) {
      c.textAlign = 'right';
      c.font = '900 40px Orbitron, sans-serif';
      c.fillStyle = this.messageColor;
      c.shadowColor = this.messageColor;
      c.shadowBlur = 16;
      c.fillText(this.message, W - 50, lampY);
      c.shadowBlur = 0;
    }
    return true;
  }

  private drawReels(c: CanvasRenderingContext2D, W: number): void {
    const reelW = 250, reelH = 330, gap = 30;
    const x0 = (W - (reelW * 3 + gap * 2)) / 2;
    const y0 = 180;
    const cell = 150;
    const n = STRIP.length;
    this.reels.forEach((reel, i) => {
      const x = x0 + i * (reelW + gap);
      const g = c.createLinearGradient(0, y0, 0, y0 + reelH);
      g.addColorStop(0, '#888');
      g.addColorStop(0.18, '#fff');
      g.addColorStop(0.82, '#fff');
      g.addColorStop(1, '#888');
      c.fillStyle = g;
      c.fillRect(x, y0, reelW, reelH);
      c.save();
      c.beginPath();
      c.rect(x, y0, reelW, reelH);
      c.clip();
      c.imageSmoothingEnabled = false;
      const center = y0 + reelH / 2;
      const base = Math.floor(reel.pos);
      const frac = reel.pos - base;
      for (let k = -2; k <= 2; k++) {
        const idx = (((base - k) % n) + n) % n;
        const sym = STRIP[idx];
        const img = this.images.get(sym);
        const cy = center + (k + frac) * cell;
        if (img && img.complete && img.naturalWidth) {
          const s = 120 / Math.max(img.naturalWidth, img.naturalHeight);
          const w = img.naturalWidth * s, h = img.naturalHeight * s;
          c.drawImage(img, x + reelW / 2 - w / 2, cy - h / 2, w, h);
        }
      }
      c.restore();
      c.strokeStyle = '#c9a23a';
      c.lineWidth = 6;
      c.strokeRect(x, y0, reelW, reelH);
    });
    // ペイライン
    c.strokeStyle = 'rgba(255,40,40,0.8)';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x0 - 14, y0 + reelH / 2);
    c.lineTo(x0 + reelW * 3 + gap * 2 + 14, y0 + reelH / 2);
    c.stroke();
  }

  private drawJp(c: CanvasRenderingContext2D, W: number): void {
    const n = JP_SEGMENTS.length;
    const cols = 4;
    const bw = 200, bh = 150, gap = 20;
    const x0 = (W - (bw * cols + gap * (cols - 1))) / 2;
    const y0 = 185;
    const active = Math.round(this.jpPos) % n;
    // 時計回りに並べる（上段左→右、下段右→左）
    for (let i = 0; i < n; i++) {
      const row = i < cols ? 0 : 1;
      const col = row === 0 ? i : n - 1 - i;
      const x = x0 + col * (bw + gap);
      const y = y0 + row * (bh + gap);
      const on = i === active && (Math.floor(this.time * 10) % 2 === 0 || !this.jpDone);
      const v = JP_SEGMENTS[i];
      c.fillStyle = on ? (v === 'JP' ? '#f3c' : '#fd3') : '#1c1430';
      c.shadowColor = on ? '#fff' : 'transparent';
      c.shadowBlur = on ? 30 : 0;
      c.fillRect(x, y, bw, bh);
      c.shadowBlur = 0;
      c.strokeStyle = v === 'JP' ? '#f6c' : '#c9a23a';
      c.lineWidth = 5;
      c.strokeRect(x, y, bw, bh);
      c.fillStyle = on ? '#200' : v === 'JP' ? '#f8d' : '#fe9';
      c.textAlign = 'center';
      c.font = v === 'JP' ? '900 64px Orbitron, sans-serif' : '900 70px Orbitron, sans-serif';
      c.fillText(String(v), x + bw / 2, y + bh / 2 + 4);
    }
  }
}
