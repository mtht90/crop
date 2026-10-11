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
  winHalfWidth: 3.6, // 手前の獲得口の半幅（外側はロスト）
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
  // 中央の風車（回転する羽根でメダルを左右に弾く）
  windmill: { x: 0, y: 5.7, radius: 0.5, blades: 3, speed: 2.6, clear: 1.5 },
  // 左右端のポケット（入るとメダル払い出し＋START拡大）
  pockets: [
    { x: -3.4, y: 4.8 },
    { x: 3.4, y: 4.8 },
  ],
  pocketRadius: 0.28,
  pocketPayout: 2,
  pocketCycle: 4, // ポケット（チューリップ）が開閉する周期（秒）
  pocketOpen: 1.2, // そのうち開いている秒数（左右で交互）
  wideSeconds: 2, // ポケット入賞後に START が広がる秒数
  wideHalfWidth: 2.49, // 広がった START の半幅（隣のレーンまで）
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
  rate: 28, // 払い出し 枚/秒
  maxRate: 70, // 払い出しが大量に溜まったときの最大速度 枚/秒
  showerFrom: 100, // 1回でこの枚数以上の配当は、天井からもメダルシャワーで降らせる
  showerShare: 0.5, // そのうちシャワーで降らせる割合
  showerY: 6.4,
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
  posts?: { count: number; ring: number; offset?: number }; // 中央の穴のまわりの柱
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
  transferSeconds: 1.3, // NEXT に入ってからシュートを通って次の段に出るまで
  intakeSeconds: 1.4, // 抽選開始時、投入シュートを通って1段目に出るまで
  sinkSeconds: 0.45, // 穴に吸い込まれる演出の時間
  postRadius: 0.07,
  postHeight: 0.35,
  tensionRange: 0.75, // 中央の穴からこの距離以内でスロー演出
  tensionSpeed: 2.2, // この速さより遅いほどスローが強くなる
  capDepth: 0.08, // 狙い以外の穴のフタの深さ（ボールが少し沈んで転がり出る）
  steerStart: 2.5, // 打ち出してから狙いへ導き始めるまでの秒数
  steerRamp: 4, // 導く力が最大になるまでの秒数
  steerForce: 3.5, // 導く力（加速度）
  reviveSink: 1.1, // 復活演出：沈んでから飛び出すまで
  centerRates: [0.46, 0.46, 0.32], // 各段で中央（NEXT/JP）に入る率。JP ≒ 0.46×0.46×0.32 ≒ 1/15
  reviveChance: 0.12, // 中央へ進むときに復活演出になる率
  slowAmount: 0.7, // スローの強さ（0.7 = 30% の速さ）
  slowBudget: 3, // 1段あたりのスロー時間の上限（秒）
  stages: [
    {
      x: -4.8, y: 3.8, z: -1.4, radius: 2.6, depth: 0.7, cone: 0.1, holeRing: 0.5, holeRadius: 0.235, centerRadius: 0.245,
      spin: 0.3, launchAngle: 1.2, launchSpeed: 5.2, holes: [10, 10, 20, 10, 10, 20], center: 'NEXT', color: '#ff3d8b',
    },
    {
      x: 4.8, y: 1.9, z: -1.4, radius: 2.6, depth: 0.7, cone: 0.1, holeRing: 0.5, holeRadius: 0.245, centerRadius: 0.24,
      spin: -0.35, launchAngle: Math.PI, launchSpeed: 5.2, holes: [20, 30, 20, 30, 20, 50], center: 'NEXT', color: '#2456d6',
    },
    {
      x: 0, y: 0, z: 2.4, radius: 3.2, depth: 0.8, cone: 0.06, holeRing: 0.5, holeRadius: 0.265, centerRadius: 0.228,
      spin: 0.25, launchAngle: 0.7, launchSpeed: 5.8, holes: [50, 100, 50, 200, 50, 100], center: 'JP', color: '#4a1a8a',
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
