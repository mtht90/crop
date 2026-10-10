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

// 上部の多段クルーン抽選機（scene 側で筐体上に配置する、グループ内のローカル座標）
export type CroonLabel = number | 'JP' | 'NEXT';
export interface CroonStageDef {
  x: number;
  y: number;
  z: number;
  radius: number;
  depth: number; // すり鉢の深さ
  cone?: number; // 内側の中心へ向かう傾き（省略時は CROON.coneDepth）
  holeRing: number; // 周りの穴の位置（半径に対する比）
  holeRadius: number;
  centerRadius: number;
  spin: number; // 皿の回転 rad/s
  launchAngle: number; // ボールが打ち出される外周の位置（ローカル角 atan2(-z, x)）
  launchSpeed: number;
  holes: CroonLabel[]; // 周りの穴（反時計回り）
  center: CroonLabel;
  color: string;
}

export const CROON = {
  ballRadius: 0.22,
  gravity: -14, // 盤面より弱い重力で、ふわっと転がって穴を飛び越えたりする
  ballDamping: 0.05,
  plateFriction: 0.5,
  bankFriction: 0.02, // 外周のバンク（よく滑る）
  bankStart: 0.72, // バンクが始まる位置（半径に対する比） // 皿の摩擦。逆回転の皿がボールの周回を止めて内側へ落とす
  coneDepth: 0.1,
  ballSpinDamping: 8, // ボールの回転の減衰。大きいと滑り摩擦が効き、逆回転の皿で周回が止まる // 皿の内側の中心へ向かう傾き（大きいほど中央の穴に入りやすい）
  transferSeconds: 0.9, // NEXT に入ってから次の段に打ち出されるまで
  stages: [
    {
      x: -4.0, y: 2.2, z: -1.2, radius: 2.0, depth: 0.6, holeRing: 0.5, holeRadius: 0.235, centerRadius: 0.245,
      spin: 0.35, launchAngle: 1.2, launchSpeed: 4.6, holes: [10, 10, 20, 10, 10, 20], center: 'NEXT', color: '#ff3d8b',
    },
    {
      x: 4.0, y: 1.2, z: -1.2, radius: 2.0, depth: 0.6, holeRing: 0.5, holeRadius: 0.245, centerRadius: 0.24,
      spin: -0.4, launchAngle: Math.PI, launchSpeed: 4.6, holes: [20, 30, 20, 30, 20, 50], center: 'NEXT', color: '#3d8bff',
    },
    {
      x: 0, y: 0, z: 2.0, radius: 2.6, depth: 0.7, cone: 0.074, holeRing: 0.5, holeRadius: 0.265, centerRadius: 0.228,
      spin: 0.3, launchAngle: 0.67, launchSpeed: 5.2, holes: [50, 100, 50, 200, 50, 100], center: 'JP', color: '#ffb000',
    },
  ] as CroonStageDef[],
};

// 疑似課金のメダル購入プラン（実際の支払いは発生しない）
export const SHOP = [
  { yen: 500, medals: 50 },
  { yen: 1000, medals: 110 },
  { yen: 3000, medals: 360 },
  { yen: 5000, medals: 650 },
];
