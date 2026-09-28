import { Decimal } from '../core/decimal';
import { fmtMult, fmtPct } from '../core/format';
import type { Mods } from '../core/mods';

export type Rarity = 0 | 1 | 2 | 3 | 4;

export const RARITY_NAMES = ['コモン', 'レア', 'エピック', 'レジェンド', 'ミシック'];
export const RARITY_CLASS = ['r-common', 'r-rare', 'r-epic', 'r-legend', 'r-mythic'];

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  desc: string;
  /** p = 所持数 × 遺物パワー */
  effect: (p: number) => string;
  apply: (m: Mods, p: number) => void;
}

function globalRelic(id: string, name: string, icon: string, rarity: Rarity, per: number): RelicDef {
  return {
    id, name, icon, rarity,
    desc: `全ての生産 +${fmtPct(per)} / 個`,
    effect: (p) => fmtMult(1 + per * p),
    apply: (m, p) => { m.global = m.global.mul(1 + per * p); },
  };
}

function rangeRelic(id: string, name: string, icon: string, rarity: Rarity, from: number, to: number, per: number): RelicDef {
  return {
    id, name, icon, rarity,
    desc: `施設 ${from + 1}〜${to + 1} 番の生産 +${fmtPct(per)} / 個`,
    effect: (p) => fmtMult(1 + per * p),
    apply: (m, p) => {
      for (let i = from; i <= to; i++) m.building[i] = m.building[i].mul(1 + per * p);
    },
  };
}

export const RELICS: RelicDef[] = [
  // コモン
  globalRelic('rl_iron', '隕鉄のかけら', '🪨', 0, 0.05),
  globalRelic('rl_ice', '彗星の氷', '🧊', 0, 0.05),
  rangeRelic('rl_bolt', '古いボルト', '🔩', 0, 0, 9, 0.1),
  rangeRelic('rl_chip', '焼けた回路', '💾', 0, 10, 19, 0.1),
  {
    id: 'rl_glove', name: '宇宙服の手袋', icon: '🧤', rarity: 0,
    desc: 'クリック +10% / 個',
    effect: (p) => fmtMult(1 + 0.1 * p),
    apply: (m, p) => { m.click = m.click.mul(1 + 0.1 * p); },
  },
  {
    id: 'rl_map', name: '擦り切れた星図', icon: '🗺️', rarity: 0,
    desc: '遠征速度 +3% / 個',
    effect: (p) => fmtMult(1 + 0.03 * p),
    apply: (m, p) => { m.expSpeed *= 1 + 0.03 * p; },
  },
  {
    id: 'rl_pillow', name: '無重力まくら', icon: '🛏️', rarity: 0,
    desc: '放置効率 +1% / 個 (最大 +30%)',
    effect: (p) => `+${fmtPct(Math.min(0.3, 0.01 * p))}`,
    apply: (m, p) => { m.offlineEff += Math.min(0.3, 0.01 * p); },
  },
  {
    id: 'rl_dust', name: '光る砂', icon: '⏳', rarity: 0,
    desc: '研究速度 +2% / 個',
    effect: (p) => fmtMult(1 + 0.02 * p),
    apply: (m, p) => { m.researchSpeed *= 1 + 0.02 * p; },
  },
  // レア
  globalRelic('rl_crystal', '星晶石', '💎', 1, 0.15),
  rangeRelic('rl_engine', '異星のエンジン', '⚙️', 1, 20, 29, 0.2),
  rangeRelic('rl_lens', '重力レンズ片', '🔍', 1, 30, 39, 0.2),
  {
    id: 'rl_tail', name: '彗星の尾', icon: '💫', rarity: 1,
    desc: '彗星の効果 +5% / 個',
    effect: (p) => fmtMult(1 + 0.05 * p),
    apply: (m, p) => { m.cometPower *= 1 + 0.05 * p; },
  },
  {
    id: 'rl_compass', name: '量子コンパス', icon: '🧭', rarity: 1,
    desc: '遠征の幸運 +5% / 個',
    effect: (p) => `+${fmtPct(0.05 * p)}`,
    apply: (m, p) => { m.expLuck += 0.05 * p; },
  },
  {
    id: 'rl_clock', name: '止まった時計', icon: '🕰️', rarity: 1,
    desc: '放置上限 +1時間 / 個 (最大 +72時間)',
    effect: (p) => `+${Math.min(72, p).toFixed(0)}時間`,
    apply: (m, p) => { m.offlineCapH += Math.min(72, p); },
  },
  {
    id: 'rl_coin', name: '異星の硬貨', icon: '🪙', rarity: 1,
    desc: '施設の価格 -1% / 個 (最大 -30%)',
    effect: (p) => fmtMult(1 - Math.min(0.3, 0.01 * p)),
    apply: (m, p) => { m.costMult *= 1 - Math.min(0.3, 0.01 * p); },
  },
  // エピック
  globalRelic('rl_heart', '恒星の心臓', '❤️‍🔥', 2, 0.5),
  {
    id: 'rl_crown', name: '古代王の冠', icon: '👑', rarity: 2,
    desc: '星核の獲得量 +10% / 個',
    effect: (p) => fmtMult(1 + 0.1 * p),
    apply: (m, p) => { m.snGain = m.snGain.mul(1 + 0.1 * p); },
  },
  {
    id: 'rl_book', name: '禁断の天文書', icon: '📕', rarity: 2,
    desc: '研究速度 +10% / 個',
    effect: (p) => fmtMult(1 + 0.1 * p),
    apply: (m, p) => { m.researchSpeed *= 1 + 0.1 * p; },
  },
  {
    id: 'rl_ring', name: '事象の指輪', icon: '💍', rarity: 2,
    desc: 'クリックに毎秒生産の +0.2% / 個 (最大 +10%)',
    effect: (p) => `+${fmtPct(Math.min(0.1, 0.002 * p), 1)}`,
    apply: (m, p) => { m.clickSps += Math.min(0.1, 0.002 * p); },
  },
  {
    id: 'rl_robot', name: '忘れられた自動機械', icon: '🤖', rarity: 2,
    desc: '自動クリック +1回/秒 / 個',
    effect: (p) => `+${p.toFixed(0)}回/秒`,
    apply: (m, p) => { m.autoClick += p; },
  },
  {
    id: 'rl_seal', name: '星座の封印', icon: '🔯', rarity: 2,
    desc: `実績1個あたりのボーナス +${fmtPct(0.0005, 2)} / 個 (最大 +1%)`,
    effect: (p) => `+${fmtPct(Math.min(0.01, 0.0005 * p), 2)}`,
    apply: (m, p) => { m.achPer += Math.min(0.01, 0.0005 * p); },
  },
  // レジェンド
  globalRelic('rl_eye', '宇宙の瞳', '👁️', 3, 2),
  {
    id: 'rl_orb', name: '暗黒の宝珠', icon: '🔮', rarity: 3,
    desc: 'ダークマターの獲得量 +10% / 個',
    effect: (p) => fmtMult(1 + 0.1 * p),
    apply: (m, p) => { m.dmGain = m.dmGain.mul(1 + 0.1 * p); },
  },
  {
    id: 'rl_anvil', name: '神々の金床', icon: '⚒️', rarity: 3,
    desc: '施設強化アップグレードの倍率 +0.02 / 個 (最大 +0.5)',
    effect: (p) => `+${Math.min(0.5, 0.02 * p).toFixed(2)}`,
    apply: (m, p) => { m.tierMult += Math.min(0.5, 0.02 * p); },
  },
  {
    id: 'rl_wing', name: '光速の翼', icon: '🪽', rarity: 3,
    desc: '遠征速度 +15% / 個',
    effect: (p) => fmtMult(1 + 0.15 * p),
    apply: (m, p) => { m.expSpeed *= 1 + 0.15 * p; },
  },
  {
    id: 'rl_sword', name: '星を断つ剣', icon: '🗡️', rarity: 3,
    desc: 'クリック ×2 / 個',
    effect: (p) => fmtMult(Decimal.pow(2, p)),
    apply: (m, p) => { m.click = m.click.mul(Decimal.pow(2, p)); },
  },
  // ミシック
  globalRelic('rl_egg', '宇宙卵', '🥚', 4, 10),
  {
    id: 'rl_key', name: '多元宇宙の鍵', icon: '🗝️', rarity: 4,
    desc: '生産量の指数 +0.002 / 個 (最大 +0.05)',
    effect: (p) => `+${Math.min(0.05, 0.002 * p).toFixed(3)}`,
    apply: (m, p) => { m.exponent += Math.min(0.05, 0.002 * p); },
  },
  {
    id: 'rl_hourglass', name: '永遠の砂時計', icon: '⌛', rarity: 4,
    desc: '研究速度 ×1.5 / 個',
    effect: (p) => fmtMult(Decimal.pow(1.5, p)),
    apply: (m, p) => { m.researchSpeed *= 1.5 ** Math.min(p, 200); },
  },
  {
    id: 'rl_tear', name: '創造主の涙', icon: '💧', rarity: 4,
    desc: '全ての転生通貨の獲得量 +25% / 個',
    effect: (p) => fmtMult(1 + 0.25 * p),
    apply: (m, p) => {
      const f = 1 + 0.25 * p;
      m.snGain = m.snGain.mul(f);
      m.dmGain = m.dmGain.mul(f);
      m.entGain = m.entGain.mul(f);
      m.shardGain = m.shardGain.mul(f);
    },
  },
];

export const RELIC_MAP: Map<string, RelicDef> = new Map(RELICS.map((r) => [r.id, r]));

export interface DestinationDef {
  id: string;
  name: string;
  icon: string;
  seconds: number;
  rolls: number;
  /** レア度ごとの重み [コモン, レア, エピック, レジェンド, ミシック] */
  weights: [number, number, number, number, number];
  /** 報酬の星屑 = 毎秒生産 × この秒数 */
  stardustSec: number;
  unlockAt: number; // 必要な遠征完了回数
}

export const DESTINATIONS: DestinationDef[] = [
  { id: 'e0', name: '近傍小惑星帯', icon: '🪨', seconds: 10 * 60, rolls: 1, weights: [80, 18, 2, 0, 0], stardustSec: 300, unlockAt: 0 },
  { id: 'e1', name: '月の裏側', icon: '🌘', seconds: 30 * 60, rolls: 1, weights: [70, 25, 5, 0.2, 0], stardustSec: 900, unlockAt: 3 },
  { id: 'e2', name: '木星圏', icon: '🪐', seconds: 2 * 3600, rolls: 2, weights: [60, 30, 9, 1, 0.02], stardustSec: 3600, unlockAt: 10 },
  { id: 'e3', name: '星間分子雲', icon: '🌫️', seconds: 6 * 3600, rolls: 3, weights: [50, 33, 14, 2.5, 0.1], stardustSec: 3 * 3600, unlockAt: 25 },
  { id: 'e4', name: '隣の恒星系', icon: '✨', seconds: 12 * 3600, rolls: 4, weights: [40, 35, 19, 5, 0.3], stardustSec: 6 * 3600, unlockAt: 50 },
  { id: 'e5', name: '銀河中心', icon: '🌌', seconds: 24 * 3600, rolls: 6, weights: [30, 35, 25, 8, 1], stardustSec: 12 * 3600, unlockAt: 100 },
  { id: 'e6', name: '銀河の果て', icon: '🌠', seconds: 72 * 3600, rolls: 10, weights: [20, 32, 30, 14, 3], stardustSec: 36 * 3600, unlockAt: 200 },
];

export const DEST_MAP: Map<string, DestinationDef> = new Map(DESTINATIONS.map((d) => [d.id, d]));
