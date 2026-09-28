import { Decimal } from '../core/decimal';

/**
 * 転生まわりの主要なバランス定数。
 * 獲得量 = floor((対象量 / req) ^ (1 / root) × 倍率)
 * root を大きくするほど「量を増やしても獲得が伸びにくく」なり、雪だるま式の暴走を防げる。
 * 超新星は施設の階段を登り切るまで (〜1e90) は急激に伸びるため強く圧縮し、
 * それ以降は soft.root で緩やかに圧縮する。
 */
export const BALANCE = {
  sn: { req: new Decimal(1e12), root: 12, soft: { at: new Decimal(1e90), root: 5 } },
  galaxy: { req: new Decimal(3e5), root: 2 },
  crunch: { req: new Decimal(1e4), root: 3 },
  mv: { req: new Decimal(2000), root: 3 },
  /** 星核 1 個あたりの生産ボーナス (加算) */
  corePer: 0.05,
  /** ダークマターの生産ボーナス指数: ×(1 + DM)^x */
  dmExp: 1.2,
  /** エントロピーの生産ボーナス指数 */
  entExp: 2,
  /** 次元の欠片の生産ボーナス指数 */
  shardExp: 3,
};
