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

// 荒めの配分：小当たりを減らし、当たったときの払い出しを大きくしている。
// weight は 1000 スピンあたりの当選数。
const SYMBOLS: SymbolDef[] = [
  { key: 'cherries', file: 'cherries', payout: 10, weight: 75, label: 'CHERRY' },
  { key: 'lemon', file: 'lemon', payout: 0, weight: 0, label: '' }, // ハズレ目用
  { key: 'melon', file: 'melon', payout: 0, weight: 0, label: '' },
  { key: 'bell', file: 'bell', payout: 20, weight: 30, label: 'BELL' },
  { key: 'clover', file: 'clover', payout: 0, weight: 0, label: '' },
  { key: 'bar', file: 'Bar1', payout: 30, weight: 12, label: 'BAR' }, // ＋サイドウォール・チャンス
  { key: 'horseshoe', file: 'horseshoe', payout: 0, weight: 30, label: 'BALL' },
  { key: 'seven', file: 'Lucky7_rainbow', payout: 100, weight: 4, label: 'SEVEN' },
  { key: 'heart', file: 'heart', payout: 0, weight: 0, label: '' },
];
const LOSE_WEIGHT = 1000 - SYMBOLS.reduce((a, s) => a + s.weight, 0);
/** 777 の後に続く確定当たりの回数 */
export const FEVER_SPINS = 5;

const STRIP: SymbolKey[] = [
  'seven', 'cherries', 'bell', 'lemon', 'heart', 'melon', 'horseshoe', 'cherries',
  'clover', 'bar', 'lemon', 'heart', 'bell', 'cherries', 'melon', 'clover',
];

export type SpinResult = { kind: 'lose' } | { kind: 'win'; symbol: SymbolKey; payout: number; ball: boolean; fever: boolean };


type Mode = 'idle' | 'spinning';

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
    return this.chance;
  }

  /** クルーン抽選中はスロットを止めて「JP CHANCE」を表示 */
  setChance(on: boolean): void {
    // スロットの回転はそのまま続け、新しい回転だけ止めて画面を「JP CHANCE」にする
    this.chance = on;
    if (on) this.showMessage('JP CHANCE!!', '#f6f', 999);
    else this.showMessage('', '#9ff', 0);
    this.dirty = true;
  }

  private chance = false;

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
    const fever = this.feverSpins > 0;
    if (fever) this.feverSpins--;
    // フィーバー中はハズレ無し（7 は出ない）
    const table = fever ? SYMBOLS.filter((s) => s.weight > 0 && s.key !== 'seven') : SYMBOLS.filter((s) => s.weight > 0);
    const total = (fever ? 0 : LOSE_WEIGHT) + table.reduce((a, s) => a + s.weight, 0);
    let r = Math.random() * total;
    for (const s of table) {
      r -= s.weight;
      if (r < 0) {
        if (s.key === 'seven') this.feverSpins = FEVER_SPINS;
        return { kind: 'win', symbol: s.key, payout: s.payout, ball: s.key === 'horseshoe', fever: s.key === 'seven' };
      }
    }
    return { kind: 'lose' };
  }

  /** フィーバー（確定当たり）の残り回数 */
  feverSpins = 0;

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

  update(dt: number): void {
    this.time += dt;
    if (this.time > this.messageUntil) {
      this.message = this.pending > 0 || this.mode !== 'idle' ? '' : 'INSERT MEDAL';
      this.messageColor = '#9ff';
      this.messageUntil = Infinity;
      this.dirty = true;
    }
    if (this.mode === 'spinning') this.updateReels(dt);
    if (this.chance) this.dirty = true;
    else if (this.mode === 'idle' && this.pending > 0) this.startSpin();
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

    if (this.chance) {
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
    // 上のクルーンを見上げるよう促す表示
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 8);
    c.textAlign = 'center';
    c.font = 'italic 900 120px Orbitron, sans-serif';
    c.fillStyle = `rgba(255, 90, 220, ${pulse})`;
    c.shadowColor = '#f0f';
    c.shadowBlur = 40;
    c.fillText('JP CHANCE', W / 2, 300);
    c.shadowBlur = 0;
    c.font = '700 40px Orbitron, sans-serif';
    c.fillStyle = '#fe9';
    c.fillText('▲  CROON  ▲', W / 2, 420);
    c.font = '700 30px Orbitron, sans-serif';
    c.fillStyle = '#9ff';
    c.fillText('STAGE 1  →  STAGE 2  →  FINAL : 中央で JACKPOT', W / 2, 490);
  }
}
