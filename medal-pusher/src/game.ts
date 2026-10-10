import { BOARD, FIELD, GAME, PAYOUT, SHOP } from './config.ts';
import { CroonPhysics, type CroonPrize } from './croon.ts';
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
  wallTimer?: number;
  goldQueue?: number;
  stats: Stats;
  field: SavedField;
}

export interface Stats {
  inserted: number;
  won: number;
  jackpots: number;
  bestCredit: number;
  spentYen?: number; // 疑似課金の累計（実際の支払いは無し）
  bought?: number;
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
  private jackpotFrac = 0;
  /** サイドウォールの残り秒数 */
  wallTimer = 0;
  private goldQueue = 0;
  /** クルーン演出の段階: 'none' → 'spin' → 'result' */
  private croonPhase: 'none' | 'spin' | 'result' = 'none';
  private croonTimer = 0;
  readonly croon = new CroonPhysics();

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
      onCoinGone: (c, outcome) => {
        if (outcome === 'win' && c.gold) this.onGoldMedal();
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
    };
    this.croon.onSettle = (_i, prize) => this.onCroonResult(prize);
    this.croon.onBounce = (k) => this.audio.play('reelStop', { volume: 0.2 + k * 0.6, minInterval: 0.06, rate: 1.2 });
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
    this.goldQueue = 0;
    this.wallTimer = 0;
    this.physics.wallTarget = 0;
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
    // JP は投入 1 枚ごとに少しずつ積み上がる
    this.jackpotFrac += GAME.jackpotPerCoin;
    if (this.jackpotFrac >= 1) {
      this.slot.jackpot += Math.floor(this.jackpotFrac);
      this.jackpotFrac -= Math.floor(this.jackpotFrac);
      this.slot.dirty = true;
    }
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
        this.onToast?.('JPボール投入！手前に落とせばクルーンでJPチャンス', 'jp');
      }
      this.audio.play('smallWin');
      return;
    }
    this.payoutQueue += r.payout;
    if (Math.random() < GAME.goldChance) this.goldQueue++;
    if (r.symbol === 'bar') this.startWall();
    if (r.fever) {
      this.audio.play('bigWin');
      this.audio.duckBgm(4);
      this.view.fever(5);
      this.onToast?.(`777 FEVER!! +${r.payout} 枚  次の5回は当たり確定`, 'jp');
    } else {
      this.audio.play('smallWin');
      this.onToast?.(`+${r.payout} 枚 払い出し`, 'win');
    }
  }

  private onCroonResult(prize: CroonPrize): void {
    this.croonPhase = 'result';
    this.croonTimer = 0;
    this.slot.flash(prize === 'JP' ? 4 : 1.5);
    if (prize === 'JP') {
      const amount = this.slot.jackpot;
      // 一部は盤面に降らせ、残りは直接クレジットへ
      const physical = Math.min(amount, PAYOUT.maxPhysicalJackpot);
      this.payoutQueue += physical;
      this.addCredit(amount - physical);
      this.stats.jackpots++;
      this.slot.jackpot = GAME.startJackpot;
      this.jackpotFrac = 0;
      this.audio.play('jpWin');
      this.audio.play('fanfare');
      this.audio.duckBgm(6);
      this.view.fever(8);
      this.slot.showMessage(`JACKPOT!! ${amount}`, '#f6f', 5);
      this.onToast?.(`★ JACKPOT ★  ${amount} 枚獲得！`, 'jp');
    } else {
      // クルーンの配当は直接クレジットへ
      this.addCredit(prize);
      this.audio.play(prize >= 50 ? 'bigWin' : 'smallWin');
      this.slot.showMessage(`CROON +${prize}`, '#ff6', 4);
      this.onToast?.(`クルーン  +${prize} 枚`, 'win');
    }
    this.onChange?.();
  }

  private startWall(): void {
    this.wallTimer = GAME.wallSeconds;
    this.physics.wallTarget = 1;
    this.view.fever(2);
    this.audio.play('reach');
    this.slot.showMessage('SIDE WALL!!', '#6ff', 4);
    this.onToast?.(`サイドウォール・チャンス ${GAME.wallSeconds}秒！ 手前の全幅が獲得口`, 'jp');
  }

  private onGoldMedal(): void {
    this.audio.play('ballDrop');
    if (!this.physics.ball && this.croonPhase === 'none' && this.pendingJpChance === 0) {
      this.audio.play('ballRelease');
      this.physics.spawnBall((Math.random() - 0.5) * 4, PAYOUT.dropY + 1, -5.0);
      this.onToast?.('黄金メダル GET！ JPボール投入', 'jp');
    } else {
      this.addCredit(GAME.goldBonus);
      this.onToast?.(`黄金メダル GET！ +${GAME.goldBonus} 枚`, 'win');
    }
  }

  private addCredit(n: number): void {
    if (n <= 0) return;
    this.credit += n;
    this.stats.won += n;
    this.stats.bestCredit = Math.max(this.stats.bestCredit, this.credit);
  }

  /** 疑似課金でメダルを買う（実際の支払いは発生しない） */
  buy(index: number): void {
    const plan = SHOP[index];
    if (!plan) return;
    this.credit += plan.medals;
    this.stats.spentYen = (this.stats.spentYen ?? 0) + plan.yen;
    this.stats.bought = (this.stats.bought ?? 0) + plan.medals;
    this.audio.play('stack', { volume: 0.8 });
    this.audio.play('checker');
    this.save();
    this.onChange?.();
  }

  get croonActive(): boolean {
    return this.croonPhase !== 'none';
  }

  private updateCroon(dt: number): void {
    this.croon.update(dt);
    if (this.croonPhase === 'none') {
      // ボールが落ちたら待たずにすぐ打ち出す。カメラは回っている間に寄っていく
      if (this.pendingJpChance > 0) {
        this.pendingJpChance--;
        this.croonPhase = 'spin';
        this.croonTimer = 0;
        this.slot.setChance(true);
        this.view.focusCroon(true);
        this.audio.play('jpChance');
        this.audio.play('ballRelease');
        this.audio.duckBgm(12);
        this.croon.start();
        this.lastBallAngle = null;
        this.onToast?.('JP CHANCE！ クルーン抽選', 'jp');
      }
      return;
    }
    this.croonTimer += dt;
    // 外周を転がる音（ボールが一定角度進むごとにカラカラ）
    const p = this.croon.ballPosition;
    if (p && this.croon.rolling) {
      const a = Math.atan2(p.z, p.x);
      if (this.lastBallAngle !== null) {
        let d = Math.abs(a - this.lastBallAngle);
        if (d > Math.PI) d = Math.PI * 2 - d;
        this.rollAccum += d;
        if (this.rollAccum > 0.45) {
          this.rollAccum = 0;
          this.audio.play('reelTick', { volume: 0.35, minInterval: 0.03, rate: 1.3 });
        }
      }
      this.lastBallAngle = a;
    }
    if (this.croonPhase === 'result' && this.croonTimer > 3.2) {
      this.croon.finish();
      this.croonPhase = 'none';
      this.slot.setChance(false);
      this.view.focusCroon(false);
    }
  }

  private lastBallAngle: number | null = null;
  private rollAccum = 0;

  update(dt: number): void {
    // JPチャンス（クルーン）はスロットが空いたら開始
    this.updateCroon(dt);
    this.slot.update(dt);
    if (this.wallTimer > 0) {
      this.wallTimer = Math.max(0, this.wallTimer - dt);
      if (this.wallTimer === 0) {
        this.physics.wallTarget = 0;
        this.onToast?.('サイドウォール終了', 'info');
      }
    }

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
        const gold = this.goldQueue > 0;
        if (gold) this.goldQueue--;
        const c = this.physics.dropPayoutCoin(x, PAYOUT.dropY, z, gold);
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
      jpChances: this.pendingJpChance + (this.croonPhase === 'spin' ? 1 : 0),
      wallTimer: this.wallTimer,
      goldQueue: this.goldQueue,
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
      this.goldQueue = d.goldQueue ?? 0;
      this.wallTimer = d.wallTimer ?? 0;
      if (this.wallTimer > 0) this.physics.wallTarget = 1;
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
