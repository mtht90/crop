import { BOARD, CROON, FIELD, GAME, PAYOUT, SHOP } from './config.ts';
import { CroonPhysics, holeCenters, rarityColor, type CroonBallColor, type CroonPlan, type CroonPrize } from './croon.ts';
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
  /** クルーン演出（画面フラッシュ・シェイク・大きな文字）。main 側で DOM 演出する */
  onFx?: (fx: { flash?: string; shake?: number; text?: string; color?: string; sub?: string }) => void;

  private payoutQueue = 0;
  private showerQueue = 0;
  private payoutTimer = 0;
  private payoutSide = 1;
  private pendingJpChance = 0;
  private saveTimer = 0;
  private jackpotFrac = 0;
  /** サイドウォールの残り秒数 */
  wallTimer = 0;
  private goldQueue = 0;
  /** クルーン演出の段階: 'none' → 'spin' → 'result' → 'back'（カメラが戻る） */
  private croonPhase: 'none' | 'spin' | 'result' | 'back' = 'none';
  /** クルーンの配当（カメラが戻ってから払い出す） */
  private croonReward = 0;
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
      onCoinGone: (c, outcome, x) => {
        if (outcome === 'win' && c.gold) this.onGoldMedal();
        if (outcome === 'lost' && Math.abs(x) < 20) {
          this.view.coinLost(x);
          this.audio.play('lost', { volume: 0.45, minInterval: 0.12, rate: 0.55 + Math.random() * 0.1 });
        }
        if (outcome === 'win') {
          this.view.coinWon();
          this.credit++;
          this.stats.won++;
          this.stats.bestCredit = Math.max(this.stats.bestCredit, this.credit);
          this.audio.play('win', { volume: 0.5, minInterval: 0.06, rate: 0.9 + Math.random() * 0.2 });
          this.onChange?.();
        }
      },
      onCoinLanded: () => this.audio.play('clink', { volume: 0.35, minInterval: 0.05, rate: 0.9 + Math.random() * 0.3 }),
      onPocket: (i) => {
        this.payoutQueue += BOARD.pocketPayout;
        const wasWide = this.physics.wideTimer > 0;
        this.physics.wideTimer = BOARD.wideSeconds;
        this.view.pocketHit(i);
        this.audio.play('checker', { volume: 0.8, rate: 1.25 });
        this.audio.play('smallWin', { volume: 0.5, minInterval: 0.5 });
        this.onToast?.(`POCKET +${BOARD.pocketPayout}${wasWide ? '' : '　START 拡大！'}`, 'win');
      },
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
    this.croon.onSettle = (prize) => this.onCroonResult(prize);
    this.croon.onNext = (stage) => {
      this.slowUsed = 0;
      this.view.focusCroonStage(stage);
      const final = stage === CROON.stages.length - 1;
      this.audio.play(final ? 'bigWin' : 'checker');
      this.audio.duckBgm(10);
      this.slot.showMessage(final ? 'FINAL STAGE!!' : 'NEXT STAGE!', '#f6f', 999);
      // 3段目到達は赤以上確定
      this.onFx?.(
        final
          ? { text: 'FINAL', sub: '赤以上確定', color: '#ff3355', flash: this.croonTier >= 3 && Math.random() < 0.7 ? '#ff2040' : '#ffffff', shake: 0.5 }
          : { text: 'NEXT!!', color: '#7af', flash: '#ffffff' },
      );
    };
    this.croon.onRevive = () => {
      this.audio.play('reach', { volume: 1 });
      this.audio.duckBgm(4);
      // 沈んで…一拍おいて復活
      setTimeout(() => {
        this.audio.play('fanfare', { volume: 0.9 });
        this.onFx?.({ text: '復活!!', color: '#ff3355', flash: '#ff2040', shake: 1 });
      }, 650);
    };
    this.croon.onNearCenter = () => {
      // 中央の穴（NEXT/JP）に近づいた：本当に入るときほどシェイクが出やすい
      const going = this.croon.target === 6;
      if (Math.random() < (going ? 0.65 : 0.15)) {
        this.audio.play('ballDrop', { volume: 0.8 });
        this.onFx?.({ shake: 0.6 });
      }
    };
    this.croon.onRim = () => this.audio.play('reelTick', { volume: 0.3, minInterval: 0.1, rate: 0.8 });
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
        this.onToast?.('JPボールは盤面に1個まで → 代わりに 30 枚払い出し', 'win');
      } else {
        this.audio.play('ballRelease');
        this.physics.spawnBall((Math.random() - 0.5) * 4, PAYOUT.dropY + 1, -5.0);
        this.onToast?.('JPボール投入！手前に落とせばクルーンでJPチャンス', 'jp');
      }
      this.audio.play('smallWin');
      return;
    }
    this.addPayout(r.payout);
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
      // JP も全部プッシャー上に払い出す（カメラが戻ってから）
      this.croonReward += amount;
      this.stats.jackpots++;
      this.slot.jackpot = GAME.startJackpot;
      this.jackpotFrac = 0;
      this.audio.play('jpWin');
      this.audio.play('fanfare');
      this.audio.duckBgm(6);
      this.view.fever(8);
      this.slot.showMessage(`JACKPOT!! ${amount}`, '#f6f', 5);
      this.onFx?.({ text: 'JACKPOT!!', sub: `${amount} 枚`, color: '#ff66ff', flash: '#ffffff', shake: 1.2 });
      this.view.flashCroonHole();
      this.onToast?.(`★ JACKPOT ★  ${amount} 枚 払い出し！`, 'jp');
    } else {
      // クルーンの配当もプッシャー上に払い出す（カメラが戻ってから）
      this.croonReward += prize;
      this.audio.play(prize >= 50 ? 'bigWin' : 'smallWin');
      this.slot.showMessage(`CROON +${prize}`, '#ff6', 4);
      const rc = rarityColor(prize);
      this.onFx?.({ text: `${prize} 枚`, sub: rc.name, color: rc.css, flash: prize >= 50 ? rc.css : undefined, shake: prize >= 100 ? 0.6 : 0 });
      this.view.flashCroonHole();
      this.onToast?.(`クルーン ${prize} 枚 払い出し`, 'win');
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

  /** 払い出しを積む。大きい配当は天井からのメダルシャワーも混ぜる */
  private addPayout(n: number): void {
    this.payoutQueue += n;
    if (n >= PAYOUT.showerFrom) {
      this.showerQueue += Math.round(n * PAYOUT.showerShare);
      this.view.medalShower(true);
      this.onFx?.({ text: 'MEDAL SHOWER!!', color: '#ffd23a', flash: '#ffd23a', shake: 0.6 });
    }
  }

  private onGoldMedal(): void {
    this.audio.play('ballDrop');
    if (!this.physics.ball && this.croonPhase === 'none' && this.pendingJpChance === 0) {
      this.audio.play('ballRelease');
      this.physics.spawnBall((Math.random() - 0.5) * 4, PAYOUT.dropY + 1, -5.0);
      this.onToast?.('黄金メダル GET！ JPボール投入', 'jp');
    } else {
      this.payoutQueue += GAME.goldBonus;
      this.onToast?.(`黄金メダル GET！ ${GAME.goldBonus} 枚払い出し`, 'win');
    }
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
    // 中央の穴の縁で粘ったらスローモーション（1段につき合計数秒まで）
    const want = this.croon.state === 'rolling' && this.slowUsed < CROON.slowBudget ? this.croon.tension : 0;
    this.slowMix += (want - this.slowMix) * Math.min(1, dt * 6);
    const scale = 1 - CROON.slowAmount * this.slowMix;
    if (scale < 0.9) this.slowUsed += dt;
    this.view.croonTension = this.slowMix;
    this.croon.update(dt * scale);
    if (this.croonPhase === 'none') {
      // ボールが落ちたら待たずにすぐ打ち出す。カメラは回っている間に寄っていく
      if (this.pendingJpChance > 0) {
        this.pendingJpChance--;
        this.croonPhase = 'spin';
        this.croonTimer = 0;
        this.slot.setChance(true);
        this.view.focusCroon(true);
        this.view.focusCroonStage(0);
        this.audio.play('jpChance');
        this.audio.play('ballRelease');
        this.audio.duckBgm(12);
        const plan = this.makeCroonPlan();
        this.croonTier = this.planTier(plan);
        this.view.setCroonBall(plan.ballColor);
        this.croon.start(plan);
        this.slowUsed = 0;
        this.lastBallAngle = null;
        this.onToast?.('JP CHANCE！ クルーン抽選', 'jp');
      }
      return;
    }
    this.croonTimer += dt;
    // 転がる音（ボールが一定角度進むごとにカラカラ）
    const p = this.croon.ballPosition;
    if (p && this.croon.state === 'rolling') {
      const st = this.croon.stageIndex;
      const def = CROON.stages[st];
      const a = Math.atan2(p.z - def.z, p.x - def.x);
      if (this.lastBallAngle !== null) {
        let d = Math.abs(a - this.lastBallAngle);
        if (d > Math.PI) d = Math.PI * 2 - d;
        this.rollAccum += d;
        if (this.rollAccum > 0.6) {
          this.rollAccum = 0;
          this.audio.play('reelTick', { volume: 0.3, minInterval: 0.04, rate: 1.3 });
        }
      }
      this.lastBallAngle = a;
    } else {
      this.lastBallAngle = null;
    }
    if (this.croonPhase === 'back' && this.croonTimer > 1.1) {
      // カメラが盤面に戻りきったところで、まとめて勢いよく払い出す
      this.croonPhase = 'none';
      if (this.croonReward > 0) {
        this.addPayout(this.croonReward);
        this.croonReward = 0;
        this.audio.play('win', { volume: 1 });
      }
    }
    if (this.croonPhase === 'result' && this.croonTimer > 3.2) {
      this.croon.finish();
      this.croonPhase = 'back';
      this.croonTimer = 0;
      this.slot.setChance(false);
      this.view.focusCroon(false);
    }
  }

  private croonTier = 1;

  /**
   * クルーンの結果を先に決める（オリパと同じ）。物理演出はこの結果へ導かれる。
   * 中央（NEXT）へ進む率は 46% / 46%、FINAL の中央（JP）は 32%（JP ≒ 1/15）。
   */
  private makeCroonPlan(): CroonPlan {
    const n = CROON.stages.length;
    const holes: number[] = [];
    for (let i = 0; i < n; i++) {
      const pNext = CROON.centerRates[i];
      if (Math.random() < pNext) holes.push(6);
      else {
        holes.push(Math.floor(Math.random() * 6));
        break;
      }
    }
    // 復活演出：次の段へ進む（または JP）ときに、まれに一度ハズレ穴へ落としてから飛び出す
    let revive = -1;
    for (let i = 0; i < holes.length; i++) {
      if (holes[i] === 6 && Math.random() < CROON.reviveChance) {
        revive = i;
        break;
      }
    }
    // 復活の「沈む穴」は安い穴（白・緑）を選ぶ
    const def = CROON.stages[Math.max(0, revive)];
    const cheap = holeCenters(def)
      .slice(0, 6)
      .map((h, i) => ({ v: typeof h.label === 'number' ? h.label : 999, i }))
      .sort((a, b) => a.v - b.v)
      .slice(0, 3);
    const reviveHole = cheap[Math.floor(Math.random() * cheap.length)].i;
    const plan: CroonPlan = { holes, revive, reviveHole, ballColor: 'white' };
    plan.ballColor = this.pickBallColor(this.planTier(plan));
    return plan;
  }

  /** 結果の格（1: 1段目の配当 … 4: JACKPOT） */
  private planTier(plan: CroonPlan): number {
    const last = plan.holes.length - 1;
    if (last === CROON.stages.length - 1 && plan.holes[last] === 6) return 4;
    return last + 1;
  }

  /** 開幕の球の色。良い結果ほど赤・金・虹が出やすい（ハズレでも赤が出る「ガセ」もある） */
  private pickBallColor(tier: number): CroonBallColor {
    const table: Record<number, [CroonBallColor, number][]> = {
      1: [['white', 0.8], ['blue', 0.17], ['red', 0.03]],
      2: [['white', 0.5], ['blue', 0.35], ['red', 0.15]],
      3: [['blue', 0.3], ['red', 0.55], ['gold', 0.15]],
      4: [['red', 0.45], ['gold', 0.4], ['rainbow', 0.15]],
    };
    let r = Math.random();
    for (const [c, w] of table[tier]) {
      r -= w;
      if (r < 0) return c;
    }
    return 'white';
  }

  private lastBallAngle: number | null = null;
  private slowMix = 0;
  private slowUsed = 0;
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

    // 払い出し：左右のシュートから勢いよくジャラジャラ飛び出す
    if (this.payoutQueue > 0) {
      this.payoutTimer -= dt;
      this.view.setPayoutActive(true);
      while (this.payoutTimer <= 0 && this.payoutQueue > 0 && this.physics.coins.size < GAME.maxCoins - 5) {
        // 溜まっているほど速く（JP の大量払い出し）
        this.payoutTimer += 1 / Math.min(PAYOUT.maxRate, PAYOUT.rate + this.payoutQueue / 4);
        this.payoutQueue--;
        const gold = this.goldQueue > 0;
        if (gold) this.goldQueue--;
        if (this.showerQueue > 0 && this.payoutQueue % 2 === 0) {
          // メダルシャワー：天井から盤面全体に降らせる
          this.showerQueue--;
          const c = this.physics.dropPayoutCoin((Math.random() * 2 - 1) * (FIELD.halfWidth - 0.8), PAYOUT.showerY, -5 + Math.random() * 4.5, gold);
          c.body.setLinvel({ x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 3, z: (Math.random() - 0.5) * 1.5 }, true);
          c.body.setAngvel({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20 }, true);
          this.audio.play('stack', { volume: 0.45, minInterval: 0.06, rate: 0.9 + Math.random() * 0.3 });
          continue;
        }
        this.payoutSide *= -1;
        const x = this.payoutSide * (FIELD.halfWidth - 1.1) + (Math.random() - 0.5) * 0.3;
        const z = PAYOUT.dropZ + 0.6 + (Math.random() - 0.5) * 0.5;
        const c = this.physics.dropPayoutCoin(x, PAYOUT.dropY, z, gold);
        // シュートの口から内側・上向きに弾き出す
        c.body.setLinvel(
          { x: -this.payoutSide * (3.5 + Math.random() * 4.5), y: 2 + Math.random() * 3.5, z: 0.5 + Math.random() * 2.5 },
          true,
        );
        c.body.setAngvel({ x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30 }, true);
        this.audio.play('win', { volume: 0.55, minInterval: 0.045, rate: 0.85 + Math.random() * 0.35 });
        this.audio.play('stack', { volume: 0.4, minInterval: 0.07, rate: 0.9 + Math.random() * 0.3 });
      }
    } else {
      this.payoutTimer = 0;
      this.showerQueue = 0;
      this.view.setPayoutActive(false);
      this.view.medalShower(false);
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
      payoutQueue: this.payoutQueue + this.croonReward,
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

