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
  winHalfWidth: 3.4, // 手前の獲得口の半幅（外側はロスト）
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
  jackpotPerCoin: 0.08, // 投入1枚あたりJPに積まれる枚数
  maxPendingSpins: 4,
  initialFieldCoins: 260,
  maxCoins: 900,
  autoFireInterval: 0.28,
  wallSeconds: 20, // BAR 揃いで上がるサイドウォールの時間
  goldChance: 0.25, // スロット当選の払い出しに黄金メダルが混ざる確率
  goldBonus: 20, // ボールが盤面に残っているときに黄金メダルを落とした場合の枚数
};

export const PHYSICS = {
  gravity: -38,
  dt: 1 / 120,
  maxSubSteps: 4,
};

// 上部クルーン（ローカル座標。scene 側で筐体上に配置）。ルーレット型
export const CROON = {
  radius: 3.3, // 外周の壁の内側
  wheelRadius: 2.5, // 回転する皿（ポケット）の半径
  trackInner: 2.5, // 外周レーンの内側の縁
  trackInnerY: 0.42,
  trackOuterY: 0.95,
  deflectorCount: 0, // 斜面の突起はボールが引っかかるので無し
  coneRadius: 1.0,
  coneHeight: 0.7,
  dividerHeight: 0.42,
  ballRadius: 0.38,
  launchSpeed: 13,
  ballDamping: 0.05, // 大きいほど早く減速して落ちる
  startSpeed: 2.2, // 皿の回転 rad/s
  idleSpeed: 0.6,
  spinDecay: 5,
  timeout: 25,
  // 反時計回りに並ぶポケット。どれも同じ広さなので確率は各1/10
  pockets: ['JP', 10, 30, 10, 20, 100, 10, 20, 10, 30] as (number | 'JP')[],
};

// 疑似課金のメダル購入プラン（実際の支払いは発生しない）
export const SHOP = [
  { yen: 500, medals: 50 },
  { yen: 1000, medals: 110 },
  { yen: 3000, medals: 360 },
  { yen: 5000, medals: 650 },
];
