import { Decimal } from '../core/decimal';
import { fmt, fmtMult, fmtPct } from '../core/format';
import type { Mods } from '../core/mods';
import type { LayerId } from '../core/state';

export interface ShopItem {
  id: string;
  layer: LayerId;
  name: string;
  icon: string;
  max: number;
  cost: (lvl: number) => Decimal;
  /** 現在レベルでの効果説明 */
  effect: (lvl: number) => string;
  /** 次レベル 1 つ分で何が起きるか */
  desc: string;
  apply: (m: Mods, lvl: number) => void;
}

const geo = (base: number, ratio: number) => (lvl: number) => new Decimal(base).mul(Decimal.pow(ratio, lvl));

const INF = Number.POSITIVE_INFINITY;

export const SHOP_ITEMS: ShopItem[] = [
  // ============ 超新星 (星核) ============
  {
    id: 'sn_prod', layer: 'sn', name: '超新星の残光', icon: '🌟', max: INF,
    desc: '全ての生産 ×1.5', cost: geo(1, 4),
    effect: (l) => fmtMult(Decimal.pow(1.5, l)),
    apply: (m, l) => { m.global = m.global.mul(Decimal.pow(1.5, l)); },
  },
  {
    id: 'sn_click', layer: 'sn', name: '星の指先', icon: '👆', max: 10,
    desc: 'クリック ×3', cost: geo(1, 5),
    effect: (l) => fmtMult(Decimal.pow(3, l)),
    apply: (m, l) => { m.click = m.click.mul(Decimal.pow(3, l)); },
  },
  {
    id: 'sn_autoclick', layer: 'sn', name: '自動タッパー', icon: '🤖', max: 20,
    desc: '自動クリック +1回/秒', cost: geo(3, 2),
    effect: (l) => `${l}回/秒`,
    apply: (m, l) => { m.autoClick += l; },
  },
  {
    id: 'sn_offline', layer: 'sn', name: '休眠プロトコル', icon: '🛏️', max: 5,
    desc: '放置効率 +10%', cost: geo(3, 4),
    effect: (l) => `+${fmtPct(l * 0.1)}`,
    apply: (m, l) => { m.offlineEff += 0.1 * l; },
  },
  {
    id: 'sn_offcap', layer: 'sn', name: '冬眠カプセル', icon: '🧊', max: 10,
    desc: '放置上限 +4時間', cost: geo(5, 3),
    effect: (l) => `+${l * 4}時間`,
    apply: (m, l) => { m.offlineCapH += 4 * l; },
  },
  {
    id: 'sn_start', layer: 'sn', name: '初期投資', icon: '💰', max: 4,
    desc: '周回開始時の星屑 ×100 (初回 1000)', cost: geo(10, 10),
    effect: (l) => (l === 0 ? 'なし' : fmt(new Decimal(10).mul(Decimal.pow(100, l)))),
    apply: (m, l) => { if (l > 0) m.startStardust = new Decimal(10).mul(Decimal.pow(100, l)); },
  },
  {
    id: 'sn_startbld', layer: 'sn', name: '前線基地', icon: '🏕️', max: 5,
    desc: '周回開始時に下位 10 種の施設を +5 基ずつ所持', cost: geo(500, 10),
    effect: (l) => `各 ${l * 5} 基`,
    apply: (m, l) => { m.startBuildings = Math.max(m.startBuildings, l * 5); },
  },
  {
    id: 'sn_comet', layer: 'sn', name: '彗星誘引ビーコン', icon: '📡', max: 10,
    desc: '彗星の出現頻度 +15%', cost: geo(5, 2.5),
    effect: (l) => `+${fmtPct(l * 0.15)}`,
    apply: (m, l) => { m.cometFreq *= 1 + 0.15 * l; },
  },
  {
    id: 'sn_cometpow', layer: 'sn', name: '彗星の核', icon: '☄️', max: 10,
    desc: '彗星の効果 ×1.2 / 持続 +10%', cost: geo(8, 2.5),
    effect: (l) => `${fmtMult(1.2 ** l)} / +${fmtPct(l * 0.1)}`,
    apply: (m, l) => { m.cometPower *= 1.2 ** l; m.cometDur *= 1 + 0.1 * l; },
  },
  {
    id: 'sn_cost', layer: 'sn', name: '量産技術', icon: '🏭', max: 10,
    desc: '施設の価格 ×0.95', cost: geo(50, 4),
    effect: (l) => fmtMult(0.95 ** l),
    apply: (m, l) => { m.costMult *= 0.95 ** l; },
  },
  {
    id: 'sn_research', layer: 'sn', name: '研究助成金', icon: '🔬', max: 20,
    desc: '研究速度 +25%', cost: geo(10, 3),
    effect: (l) => `+${fmtPct(l * 0.25)}`,
    apply: (m, l) => { m.researchSpeed *= 1 + 0.25 * l; },
  },
  {
    id: 'sn_core', layer: 'sn', name: '核融合共鳴', icon: '⭐', max: 15,
    desc: '星核1個あたりの生産ボーナス +0.2%', cost: geo(100, 5),
    effect: (l) => `+${fmtPct(l * 0.002, 1)}`,
    apply: (m, l) => { m.corePer += 0.002 * l; },
  },
  {
    id: 'sn_gain', layer: 'sn', name: '崩壊加速器', icon: '💥', max: 20,
    desc: '星核の獲得量 ×1.25', cost: geo(25, 6),
    effect: (l) => fmtMult(Decimal.pow(1.25, l)),
    apply: (m, l) => { m.snGain = m.snGain.mul(Decimal.pow(1.25, l)); },
  },
  {
    id: 'sn_tier', layer: 'sn', name: '強化合金', icon: '🔩', max: 5,
    desc: '施設強化アップグレードの倍率 +0.1', cost: geo(1e3, 20),
    effect: (l) => `+${(l * 0.1).toFixed(1)}`,
    apply: (m, l) => { m.tierMult += 0.1 * l; },
  },
  {
    id: 'sn_ach', layer: 'sn', name: '栄誉の星座', icon: '🏅', max: 10,
    desc: '実績1個あたりの生産ボーナス +0.1%', cost: geo(200, 4),
    effect: (l) => `+${fmtPct(l * 0.001, 1)}`,
    apply: (m, l) => { m.achPer += 0.001 * l; },
  },
  {
    id: 'sn_upcost', layer: 'sn', name: '特許の蓄積', icon: '📑', max: 10,
    desc: 'アップグレードの価格 ×0.9', cost: geo(40, 4),
    effect: (l) => fmtMult(0.9 ** l),
    apply: (m, l) => { m.upgradeCostMult *= 0.9 ** l; },
  },
  {
    id: 'sn_autobuy', layer: 'sn', name: '自動建設ユニット', icon: '🏗️', max: 1,
    desc: '施設の自動購入を解放', cost: () => new Decimal(1e3),
    effect: (l) => (l ? '解放済み' : '未解放'),
    apply: () => {},
  },
  {
    id: 'sn_autoupg', layer: 'sn', name: '自動技術者', icon: '🧑‍🔧', max: 1,
    desc: 'アップグレードの自動購入を解放', cost: () => new Decimal(5e3),
    effect: (l) => (l ? '解放済み' : '未解放'),
    apply: () => {},
  },
  {
    id: 'sn_exp', layer: 'sn', name: '遠征船ドック', icon: '⚓', max: 3,
    desc: '遠征スロット +1', cost: geo(100, 100),
    effect: (l) => `+${l}`,
    apply: (m, l) => { m.expSlots += l; },
  },

  // ============ 銀河崩壊 (ダークマター) ============
  {
    id: 'dm_prod', layer: 'galaxy', name: '暗黒の潮汐', icon: '🌑', max: INF,
    desc: '全ての生産 ×2', cost: geo(1, 3),
    effect: (l) => fmtMult(Decimal.pow(2, l)),
    apply: (m, l) => { m.global = m.global.mul(Decimal.pow(2, l)); },
  },
  {
    id: 'dm_autosn', layer: 'galaxy', name: '超新星オートメーション', icon: '⚙️', max: 1,
    desc: '超新星の自動実行を解放', cost: () => new Decimal(2),
    effect: (l) => (l ? '解放済み' : '未解放'),
    apply: () => {},
  },
  {
    id: 'dm_keepsn', layer: 'galaxy', name: '星核の記憶', icon: '🧬', max: 1,
    desc: '銀河崩壊しても超新星ショップのレベルを保持', cost: () => new Decimal(5),
    effect: (l) => (l ? '保持する' : '保持しない'),
    apply: () => {},
  },
  {
    id: 'dm_sngain', layer: 'galaxy', name: '重力崩壊の触媒', icon: '💥', max: INF,
    desc: '星核の獲得量 ×1.5', cost: geo(2, 4),
    effect: (l) => fmtMult(Decimal.pow(1.5, l)),
    apply: (m, l) => { m.snGain = m.snGain.mul(Decimal.pow(1.5, l)); },
  },
  {
    id: 'dm_startcores', layer: 'galaxy', name: '星核の種', icon: '🌱', max: 6,
    desc: '銀河崩壊後に星核を持って開始 (×10)', cost: geo(10, 5),
    effect: (l) => (l === 0 ? 'なし' : fmt(Decimal.pow(10, l + 1))),
    apply: (m, l) => { if (l > 0) m.startCores = Decimal.pow(10, l + 1); },
  },
  {
    id: 'dm_offline', layer: 'galaxy', name: '暗黒の揺りかご', icon: '🌙', max: 5,
    desc: '放置効率 +10% / 放置上限 +12時間', cost: geo(5, 3),
    effect: (l) => `+${fmtPct(l * 0.1)} / +${l * 12}時間`,
    apply: (m, l) => { m.offlineEff += 0.1 * l; m.offlineCapH += 12 * l; },
  },
  {
    id: 'dm_research', layer: 'galaxy', name: '暗黒物理学', icon: '🔭', max: 10,
    desc: '研究速度 ×1.5 / 研究キュー +1', cost: geo(3, 3),
    effect: (l) => `${fmtMult(1.5 ** l)} / +${l}`,
    apply: (m, l) => { m.researchSpeed *= 1.5 ** l; m.researchQueue += l; },
  },
  {
    id: 'dm_autoclick', layer: 'galaxy', name: '量子タッパー', icon: '🦾', max: 10,
    desc: '自動クリックの効果 ×2', cost: geo(2, 2.5),
    effect: (l) => fmtMult(2 ** l),
    apply: (m, l) => { m.autoClickMult *= 2 ** l; },
  },
  {
    id: 'dm_exp', layer: 'galaxy', name: '暗黒航法', icon: '🧭', max: 10,
    desc: '遠征速度 ×1.25 / 幸運 +10%', cost: geo(4, 2.5),
    effect: (l) => `${fmtMult(1.25 ** l)} / +${fmtPct(l * 0.1)}`,
    apply: (m, l) => { m.expSpeed *= 1.25 ** l; m.expLuck += 0.1 * l; },
  },
  {
    id: 'dm_lowbld', layer: 'galaxy', name: 'ダークエネルギー注入', icon: '🔋', max: 10,
    desc: '下位 20 種の施設 ×10', cost: geo(5, 4),
    effect: (l) => fmtMult(Decimal.pow(10, l)),
    apply: (m, l) => {
      const f = Decimal.pow(10, l);
      for (let i = 0; i < 20; i++) m.building[i] = m.building[i].mul(f);
    },
  },
  {
    id: 'dm_exponent', layer: 'galaxy', name: '暗黒の指数', icon: '📈', max: 10,
    desc: '生産量の指数 +0.005', cost: geo(50, 4),
    effect: (l) => `^${(1 + l * 0.005).toFixed(3)}`,
    apply: (m, l) => { m.exponent += 0.005 * l; },
  },
  {
    id: 'dm_gain', layer: 'galaxy', name: '事象の地平線', icon: '🕳️', max: INF,
    desc: 'ダークマターの獲得量 ×1.5', cost: geo(20, 5),
    effect: (l) => fmtMult(Decimal.pow(1.5, l)),
    apply: (m, l) => { m.dmGain = m.dmGain.mul(Decimal.pow(1.5, l)); },
  },

  // ============ ビッグクランチ (エントロピー) ============
  {
    id: 'ent_prod', layer: 'crunch', name: '熱的死の反転', icon: '🔥', max: INF,
    desc: '全ての生産 ×3', cost: geo(1, 3),
    effect: (l) => fmtMult(Decimal.pow(3, l)),
    apply: (m, l) => { m.global = m.global.mul(Decimal.pow(3, l)); },
  },
  {
    id: 'ent_autogal', layer: 'crunch', name: '銀河オートメーション', icon: '⚙️', max: 1,
    desc: '銀河崩壊の自動実行を解放', cost: () => new Decimal(2),
    effect: (l) => (l ? '解放済み' : '未解放'),
    apply: () => {},
  },
  {
    id: 'ent_keepdm', layer: 'crunch', name: '暗黒の記憶', icon: '🧬', max: 1,
    desc: 'ビッグクランチしても銀河ショップのレベルを保持', cost: () => new Decimal(5),
    effect: (l) => (l ? '保持する' : '保持しない'),
    apply: () => {},
  },
  {
    id: 'ent_dmgain', layer: 'crunch', name: '暗黒の泉', icon: '⛲', max: INF,
    desc: 'ダークマターの獲得量 ×1.5', cost: geo(2, 4),
    effect: (l) => fmtMult(Decimal.pow(1.5, l)),
    apply: (m, l) => { m.dmGain = m.dmGain.mul(Decimal.pow(1.5, l)); },
  },
  {
    id: 'ent_exponent', layer: 'crunch', name: '無秩序の指数', icon: '📈', max: 10,
    desc: '生産量の指数 +0.01', cost: geo(10, 4),
    effect: (l) => `^${(1 + l * 0.01).toFixed(2)}`,
    apply: (m, l) => { m.exponent += 0.01 * l; },
  },
  {
    id: 'ent_research', layer: 'crunch', name: '時間圧縮', icon: '⏩', max: 10,
    desc: '研究速度 ×2', cost: geo(3, 3),
    effect: (l) => fmtMult(2 ** l),
    apply: (m, l) => { m.researchSpeed *= 2 ** l; },
  },
  {
    id: 'ent_startdm', layer: 'crunch', name: '暗黒の種', icon: '🌰', max: 5,
    desc: 'ビッグクランチ後にダークマターを持って開始 (×10)', cost: geo(10, 6),
    effect: (l) => (l === 0 ? 'なし' : fmt(Decimal.pow(10, l))),
    apply: (m, l) => { if (l > 0) m.startDm = Decimal.pow(10, l); },
  },
  {
    id: 'ent_challenge', layer: 'crunch', name: '試練の熱量', icon: '🏆', max: 5,
    desc: 'チャレンジ報酬 +20%', cost: geo(5, 5),
    effect: (l) => `+${fmtPct(l * 0.2)}`,
    apply: (m, l) => { m.challengeReward += 0.2 * l; },
  },
  {
    id: 'ent_relic', layer: 'crunch', name: '遺物の共鳴', icon: '🏺', max: 10,
    desc: '遺物の効果 +10%', cost: geo(4, 3),
    effect: (l) => `+${fmtPct(l * 0.1)}`,
    apply: (m, l) => { m.relicPower += 0.1 * l; },
  },
  {
    id: 'ent_gain', layer: 'crunch', name: '崩壊の連鎖', icon: '🌀', max: INF,
    desc: 'エントロピーの獲得量 ×1.5', cost: geo(20, 5),
    effect: (l) => fmtMult(Decimal.pow(1.5, l)),
    apply: (m, l) => { m.entGain = m.entGain.mul(Decimal.pow(1.5, l)); },
  },

  // ============ 多元宇宙 (次元の欠片) ============
  {
    id: 'mv_prod', layer: 'mv', name: '多元の重なり', icon: '💎', max: INF,
    desc: '全ての生産 ×5', cost: geo(1, 3),
    effect: (l) => fmtMult(Decimal.pow(5, l)),
    apply: (m, l) => { m.global = m.global.mul(Decimal.pow(5, l)); },
  },
  {
    id: 'mv_autocrunch', layer: 'mv', name: 'クランチ・オートメーション', icon: '⚙️', max: 1,
    desc: 'ビッグクランチの自動実行を解放', cost: () => new Decimal(2),
    effect: (l) => (l ? '解放済み' : '未解放'),
    apply: () => {},
  },
  {
    id: 'mv_keepent', layer: 'mv', name: '混沌の記憶', icon: '🧬', max: 1,
    desc: '多元宇宙転生してもクランチショップのレベルを保持', cost: () => new Decimal(5),
    effect: (l) => (l ? '保持する' : '保持しない'),
    apply: () => {},
  },
  {
    id: 'mv_entgain', layer: 'mv', name: '混沌の泉', icon: '🌋', max: INF,
    desc: 'エントロピーの獲得量 ×1.5', cost: geo(2, 4),
    effect: (l) => fmtMult(Decimal.pow(1.5, l)),
    apply: (m, l) => { m.entGain = m.entGain.mul(Decimal.pow(1.5, l)); },
  },
  {
    id: 'mv_exponent', layer: 'mv', name: '次元の指数', icon: '📈', max: 10,
    desc: '生産量の指数 +0.02', cost: geo(5, 4),
    effect: (l) => `^${(1 + l * 0.02).toFixed(2)}`,
    apply: (m, l) => { m.exponent += 0.02 * l; },
  },
  {
    id: 'mv_allgain', layer: 'mv', name: '全次元の収束', icon: '🔮', max: INF,
    desc: '全ての転生通貨の獲得量 ×1.5', cost: geo(3, 4),
    effect: (l) => fmtMult(Decimal.pow(1.5, l)),
    apply: (m, l) => {
      const f = Decimal.pow(1.5, l);
      m.snGain = m.snGain.mul(f);
      m.dmGain = m.dmGain.mul(f);
      m.entGain = m.entGain.mul(f);
    },
  },
  {
    id: 'mv_research', layer: 'mv', name: '並行研究所', icon: '🧫', max: 5,
    desc: '研究速度 ×3', cost: geo(4, 4),
    effect: (l) => fmtMult(3 ** l),
    apply: (m, l) => { m.researchSpeed *= 3 ** l; },
  },
  {
    id: 'mv_startent', layer: 'mv', name: '混沌の種', icon: '🫘', max: 5,
    desc: '多元宇宙転生後にエントロピーを持って開始 (×10)', cost: geo(10, 6),
    effect: (l) => (l === 0 ? 'なし' : fmt(Decimal.pow(10, l))),
    apply: (m, l) => { if (l > 0) m.startEnt = Decimal.pow(10, l); },
  },
  {
    id: 'mv_gain', layer: 'mv', name: '次元の裂け目', icon: '🪞', max: INF,
    desc: '次元の欠片の獲得量 ×1.5', cost: geo(10, 6),
    effect: (l) => fmtMult(Decimal.pow(1.5, l)),
    apply: (m, l) => { m.shardGain = m.shardGain.mul(Decimal.pow(1.5, l)); },
  },
];

export const SHOP_MAP: Map<string, ShopItem> = new Map(SHOP_ITEMS.map((s) => [s.id, s]));

export function shopItemsFor(layer: LayerId): ShopItem[] {
  return SHOP_ITEMS.filter((s) => s.layer === layer);
}
