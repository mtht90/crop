// 筐体の寸法・ゲームバランスの定数。
// 座標系: x=左右, y=上, z=手前(プレイヤー側)が正。1単位 ≒ メダル直径の半分。

export const COIN = {
  radius: 0.5,
  halfThickness: 0.075,
  friction: 0.35,
  restitution: 0.1,
  density: 1.0,
};

export const BALL = {
  radius: 0.75,
  density: 0.6,
};

export const FIELD = {
  halfWidth: 5,
  front: 3.5, // この z より手前に落ちたら獲得
  back: -12,
  sideWallEnd: -0.5, // サイドの壁はここまで。以降は左右に落ちるとロスト
};

export const PUSHER = {
  height: 1.0, // 上面の高さ
  depth: 9,
  frontMin: -3.6, // 一番引いたときの前面 z
  frontMax: -1.0, // 一番出たときの前面 z
  period: 4.2, // 往復の秒数
};

// プッシャー奥の壁兼、ピンボード
export const BOARD = {
  backZ: -6.5, // 奥板（プッシャー上のメダルをかき落とす壁）
  frontZ: -6.18, // 手前ガラス
  bottom: 2.4, // ボード下端（ここからプッシャー上へ落ちる）
  top: 8.8,
  launchY: 8.15,
  pinRadius: 0.1,
  pinRows: [7.3, 6.25, 5.2, 4.15, 3.1],
  pinSpacing: 1.7,
  laneDividerTop: 3.0,
  checkerHalfWidth: 0.79, // 中央チェッカーの半幅
  launcherRange: 4.2,
};

// 獲得メダルの受け皿
export const TRAY = {
  halfWidth: 6.0,
  y: -6.0,
  shieldZ: 5.2,
  countY: -3.5,
  keepSeconds: 12,
  maxCoins: 70,
};

export const PAYOUT = {
  dropY: 3.2,
  dropZ: -5.6,
  rate: 14, // 払い出し 枚/秒
  maxPhysicalJackpot: 150, // JPで物理的に降らせる上限（超過分は直接クレジット）
};

export const GAME = {
  startCredit: 100,
  startJackpot: 300,
  jackpotPerCoin: 1,
  maxPendingSpins: 4,
  initialFieldCoins: 260,
  maxCoins: 900,
  autoFireInterval: 0.28,
};

export const PHYSICS = {
  gravity: -38,
  dt: 1 / 120,
  maxSubSteps: 4,
};
