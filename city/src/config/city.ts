// 街の形と区画の数値（初期値。あとから調整する）
export const CITY = {
  /** 区画の数（横×縦） */
  size: 10,
  /** 1区画の一辺（ワールド単位。素材の1マス = 1） */
  lotSize: 1,
  /** 道路の幅（ワールド単位） */
  roadWidth: 1,
  /**
   * 道路を通す位置。n を入れると「n-1列目とn列目の間」に道路が通る。
   * 0 と size を入れると外周にも道路が付く。
   */
  roadsX: [0, 2, 5, 8, 10] as number[],
  roadsZ: [0, 2, 5, 8, 10] as number[],
  /** 最初から買える区画：中心からのチェビシェフ距離がこれ以下 */
  initialBuyableRadius: 1,
  /** 地価（円）：中心で base、端に行くほど下がる */
  landPrice: { base: 30_000_000, edgeMultiplier: 0.25 },
  /** 人通り：中心で 1.0、端で edge。道路沿いは roadsideBonus 倍 */
  traffic: { center: 1.0, edge: 0.35, roadsideBonus: 1.25 },
} as const;

/** 昼夜・カメラなど描画まわりの設定 */
export const VIEW = {
  maxPixelRatio: 2,
  /** 正投影カメラの見える高さ（ワールド単位）の範囲 */
  zoomMin: 3,
  zoomMax: 26,
  zoomInitial: 10,
  /** 回転できる範囲（度）。基準から ±rotateLimitDeg */
  rotateLimitDeg: 45,
  /** 見下ろし角（度） */
  elevationDeg: 35.264,
  /** タップとみなす指の移動量（px）と時間（ms） */
  tapSlopPx: 10,
  tapMaxMs: 450,
} as const;
