import { BOARD, FIELD, GAME, PAYOUT } from './config.ts';
import { PusherPhysics, type SavedField } from './physics.ts';
import { SlotScreen, type SpinResult } from './slot.ts';
import type { AudioManager } from './audio.ts';
import type { PusherScene } from './scene.ts';

const SAVE_KEY = 'medal-pusher.save.v1';

interface SaveData {
  version: 1;
  credit: number;
  jackpot: number;
  pending: number;
  payoutQueue: number;
  jpChances?: number;
  stats: Stats;
  field: SavedField;
}

export interface Stats {
  inserted: number;
  won: number;
  jackpots: number;
  bestCredit: number;
}

export class Game {
  credit = GAME.startCredit;
  launcherX = 0;
  stats: Stats = { inserted: 0, won: 0, jackpots: 0, bestCredit: GAME.startCredit };
  onChange?: () => void;
  onToast?: (text: string, kind?: 'win' | 'jp' | 'info') => void;

  private payoutQueue = 0;
  private payoutTimer = 0;
  private payoutSide = 1;
  private pendingJpChance = 0;
  private saveTimer = 0;

  constructor(
    readonly physics: PusherPhysics,
    readonly slot: SlotScreen,
    private audio: AudioManager,
    private view: PusherScene,
  ) {
    physics.events = {
      onChecker: () => {
        this.view.pulseChecker();
        if (this.slot.addPending()) this.audio.play('checker', { volume: 0.8 });
      },
      onCoinGone: (_c, outcome) => {
        if (outcome === 'win') {
          this.credit++;
          this.stats.won++;
          this.stats.bestCredit = Math.max(this.stats.bestCredit, this.credit);
          this.audio.play('win', { volume: 0.5, minInterval: 0.06, rate: 0.9 + Math.random() * 0.2 });
          this.onChange?.();
        }
      },
      onCoinLanded: () => this.audio.play('clink', { volume: 0.35, minInterval: 0.05, rate: 0.9 + Math.random() * 0.3 }),
      onBallGone: (outcome) => {
        if (outcome === 'win') {
          this.audio.play('ballDrop');
          this.pendingJpChance++;
        } else {
          this.onToast?.('ボールが落ちてしまった…', 'info');
        }
      },
    };
    slot.cb = {
      onTick: () => this.audio.play('reelTick', { volume: 0.25, minInterval: 0.05 }),
      onReelStop: () => this.audio.play('reelStop', { volume: 0.6 }),
      onReach: () => {
        this.audio.play('reach', { volume: 0.8 });
      },
      onResult: (r) => this.onSpinResult(r),
      onJpTick: () => this.audio.play('jpTick', { volume: 0.4, minInterval: 0.04 }),
      onJpResult: (v) => this.onJpResult(v),
    };
  }

  /** 新規ゲーム or セーブから復元 */
  start(): boolean {
    const loaded = this.load();
    if (!loaded) this.newField();
    this.onChange?.();
    return loaded;
  }

  newField(): void {
    this.physics.clearAll();
    this.physics.fillField(GAME.initialFieldCoins);
    this.physics.settle(3);
    this.credit = GAME.startCredit;
    this.slot.jackpot = GAME.startJackpot;
    this.slot.pending = 0;
    this.payoutQueue = 0;
    this.pendingJpChance = 0;
    this.stats = { inserted: 0, won: 0, jackpots: 0, bestCredit: GAME.startCredit };
  }

  reset(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ストレージが使えない環境
    }
    this.newField();
    this.save();
    this.onChange?.();
  }

  /** メダル投入。成功したら true */
  insert(): boolean {
    if (this.credit <= 0) {
      this.audio.play('error', { minInterval: 0.3 });
      return false;
    }
    if (this.physics.coins.size >= GAME.maxCoins - 20) return false;
    const x = Math.max(-BOARD.launcherRange, Math.min(BOARD.launcherRange, this.launcherX));
    if (!this.physics.canLaunch(x)) return false;
    this.credit--;
    this.stats.inserted++;
    this.slot.jackpot += GAME.jackpotPerCoin;
    this.slot.dirty = true;
    this.physics.launchCoin(x);
    this.audio.play('launch', { volume: 0.6, rate: 0.95 + Math.random() * 0.1 });
    this.onChange?.();
    return true;
  }

  private onSpinResult(r: SpinResult): void {
    if (r.kind !== 'win') return;
    if (r.ball) {
      if (this.physics.ball) {
        // ボールが既に盤面にあれば代わりにメダル
        this.payoutQueue += 30;
        this.onToast?.('BALL ×  →  +30 枚', 'win');
      } else {
        this.audio.play('ballRelease');
        this.physics.spawnBall((Math.random() - 0.5) * 4, PAYOUT.dropY + 1, -5.0);
        this.onToast?.('JPボール投入！手前に落とせばJPチャンス', 'jp');
      }
      this.audio.play('smallWin');
      return;
    }
    this.payoutQueue += r.payout;
    if (r.fever) {
      this.audio.play('bigWin');
      this.audio.duckBgm(4);
      this.view.fever(5);
      this.onToast?.(`777 FEVER!! +${r.payout} 枚`, 'jp');
    } else {
      this.audio.play('smallWin');
      this.onToast?.(`+${r.payout} 枚 払い出し`, 'win');
    }
  }

  private onJpResult(v: number | 'JP'): void {
    if (v === 'JP') {
      const amount = this.slot.jackpot;
      const physical = Math.min(amount, PAYOUT.maxPhysicalJackpot);
      this.payoutQueue += physical;
      const direct = amount - physical;
      if (direct > 0) {
        this.credit += direct;
        this.stats.won += direct;
      }
      this.stats.jackpots++;
      this.slot.jackpot = GAME.startJackpot;
      this.audio.play('jpWin');
      this.audio.play('fanfare');
      this.audio.duckBgm(6);
      this.view.fever(8);
      this.onToast?.(`★ JACKPOT ★  ${amount} 枚獲得！`, 'jp');
    } else {
      this.payoutQueue += v;
      this.audio.play('smallWin');
      this.onToast?.(`JPチャンス  +${v} 枚`, 'win');
    }
    this.onChange?.();
  }

  update(dt: number): void {
    // JPチャンスはスロットが空いたら開始
    if (this.pendingJpChance > 0 && !this.slot.busy) {
      this.pendingJpChance--;
      this.audio.play('jpChance');
      this.audio.duckBgm(5);
      this.slot.startJackpotChance();
    }
    this.slot.update(dt);

    // 払い出し（左右のシュートから交互にプッシャー上へ）
    if (this.payoutQueue > 0) {
      this.payoutTimer -= dt;
      while (this.payoutTimer <= 0 && this.payoutQueue > 0 && this.physics.coins.size < GAME.maxCoins - 5) {
        this.payoutTimer += 1 / PAYOUT.rate;
        this.payoutQueue--;
        this.payoutSide *= -1;
        // シュートの出口から内側へ飛ばす
        const x = this.payoutSide * (FIELD.halfWidth - 1.1) + (Math.random() - 0.5) * 0.3;
        const z = PAYOUT.dropZ + 0.6 + (Math.random() - 0.5) * 0.5;
        const c = this.physics.dropPayoutCoin(x, PAYOUT.dropY, z);
        c.body.setLinvel({ x: -this.payoutSide * (1.5 + Math.random() * 4), y: -1, z: Math.random() }, true);
        this.audio.play('stack', { volume: 0.3, minInterval: 0.08 });
      }
    } else {
      this.payoutTimer = 0;
    }

    this.saveTimer += dt;
    if (this.saveTimer > 3) {
      this.saveTimer = 0;
      this.save();
    }
  }

  get payoutRemaining(): number {
    return this.payoutQueue;
  }

  save(): void {
    const data: SaveData = {
      version: 1,
      credit: this.credit,
      jackpot: this.slot.jackpot,
      pending: this.slot.pending + (this.slot.mode === 'spinning' ? 1 : 0),
      // 盤面にいる投入中のメダルはセーブ対象外なので、その分はクレジットに戻す
      payoutQueue: this.payoutQueue,
      // 抽選中のJPチャンスは再開時にやり直す
      jpChances: this.pendingJpChance + (this.slot.jpInProgress ? 1 : 0),
      stats: this.stats,
      field: this.physics.serialize(),
    };
    const inBoard = [...this.physics.coins.values()].filter((c) => c.inBoard).length;
    data.credit += inBoard;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // 容量不足などは無視（次回は新規ゲーム）
    }
  }

  private load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw) as SaveData;
      if (d.version !== 1) return false;
      this.credit = d.credit;
      this.slot.jackpot = d.jackpot;
      this.slot.pending = Math.min(d.pending, GAME.maxPendingSpins);
      this.payoutQueue = d.payoutQueue;
      this.pendingJpChance = d.jpChances ?? 0;
      this.stats = d.stats;
      this.physics.restore(d.field);
      this.physics.settle(0.3);
      return true;
    } catch (e) {
      console.warn('save data broken', e);
      return false;
    }
  }
}
