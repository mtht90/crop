// ゲーム全体のチューニング値。サーバー・クライアント両方から参照する。
// 距離の単位は「タイル」(1 タイル ≒ 1.25m)、時間の単位は秒。

export const TICK_RATE = 30; // サーバーのシミュレーション周波数
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 20; // スナップショット送信周波数
export const INTERP_DELAY = 0.1; // 他プレイヤー描画の補間遅延 (秒)

export const MAP_W = 64;
export const MAP_H = 44;

export const MAX_SURVIVORS = 4;

export const RADIUS = { survivor: 0.33, killer: 0.4 };

export const SPEED = {
  survivorRun: 3.6,
  survivorSneak: 1.8,
  survivorCrawl: 0.75,
  killer: 4.15, // サバイバーの約115% — 直線では必ず追いつかれる
  killerCarry: 3.85,
  killerCharge: 1.6, // 突進のチャージ中
  killerDash: 10.5, // 突進中
  lungeMul: 1.65, // 攻撃の踏み込み倍率
  hasteMul: 1.5, // 被弾直後のダッシュ倍率
};

export const VISION = {
  survivorRadius: 9,
  killerRadius: 13,
  killerFov: (110 * Math.PI) / 180, // キラーは一人称相当の視野角しか持たない
  killerNear: 2.6, // 背後でも気配で見える距離
  terrorRadius: 15, // 心音が聞こえ始める距離
};

export const KILLER = {
  lungeTime: 0.38,
  hitRange: 1.15,
  hitArc: (75 * Math.PI) / 180,
  missRecover: 1.3,
  hitWipe: 2.3,
  chargeTime: 0.65,
  dashTime: 0.85,
  dashCooldown: 9,
  dashTurnRate: 1.6, // 突進中に曲がれる角速度 (rad/s)
  dashWallStun: 1.6,
  howlCooldown: 50,
  howlRadius: 22,
  howlReveal: 3.5,
  pickupTime: 1.4,
  hookTime: 1.0,
  breakPalletTime: 2.0,
  kickGenTime: 1.8,
  vaultTime: 1.6,
  searchLockerTime: 1.2,
  closeHatchTime: 1.5,
  palletStun: 2.0,
  wiggleStun: 3.0,
};

export const SURVIVOR = {
  hasteTime: 1.8,
  enduranceTime: 12,
  vaultSlow: 1.05,
  vaultFast: 0.55,
  palletVault: 0.85,
  palletDrop: 0.35,
  lockerEnter: 0.9,
  lockerExit: 0.8,
  unhookTime: 1.0,
  healOther: 14,
  healSelf: 30, // 自己治療は遅い
  bleedout: 180,
  hookStage1: 45,
  hookStage2: 45,
  selfUnhookChance: 0.04,
  selfUnhookAttempts: 3,
  selfUnhookPenalty: 0.2,
  wiggleStep: 0.028, // 左右交互入力 1 回あたりの進捗
  wiggleDecay: 0.02, // 入力が止まると少しずつ戻る (毎秒)
  gateOpen: 12,
  printInterval: 0.22,
  printLife: 7,
  furInterval: 0.55,
  furLife: 10,
  groanInterval: 2.6,
  groanRange: 14,
};

export const GEN = {
  count: 7,
  baseTime: 50, // 1 人で直すのにかかる秒数
  coopPenalty: 0.12, // 複数人修理の効率低下
  skillCheckChancePerSec: 0.09,
  greatBonus: 0.02,
  missPenalty: 0.1,
  missStall: 1.4, // ミスするとしばらく手が止まる
  kickRegressInstant: 0.05,
  regressPerSec: 0.004,
};

export const SKILL = {
  warnTime: 0.6, // 予兆音から針が動き出すまで
  spinTime: 1.15, // 針が一周する時間
  goodSize: 0.13, // 一周に対する割合
  greatSize: 0.035,
};

export const ENDGAME = {
  collapseTime: 120,
  hatchCloseTime: 1.5,
};

export const INTERACT_RANGE = 1.25;

export const HEALTH = {
  HEALTHY: 'healthy',
  INJURED: 'injured',
  DOWNED: 'downed',
  CARRIED: 'carried',
  CAGED: 'caged',
  ESCAPED: 'escaped',
  DEAD: 'dead',
};

// 入力ビット
export const BTN = {
  UP: 1,
  DOWN: 2,
  LEFT: 4,
  RIGHT: 8,
  SNEAK: 16,
  INTERACT: 32, // E (押しっぱなし)
  ACTION: 64, // Space (押した瞬間)
  ATTACK: 128, // 左クリック
  POWER: 256, // 右クリック (押しっぱなしでチャージ)
  HOWL: 512, // Q
};
