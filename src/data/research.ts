import { Decimal } from '../core/decimal';
import { fmtMult, fmtPct } from '../core/format';
import type { Mods } from '../core/mods';
import { mulBuildings } from '../core/mods';
import type { Game } from '../core/game';

export type ResearchBranch = '生産' | 'クリック' | '施設' | '効率' | '彗星' | '遠征' | '転生';

export interface ResearchDef {
  id: string;
  branch: ResearchBranch;
  name: string;
  icon: string;
  max: number;
  /** レベル lvl → lvl+1 にかかる基本秒数 */
  time: (lvl: number) => number;
  requires: string[];
  cond?: (g: Game) => boolean;
  condDesc?: string;
  desc: string;
  effect: (lvl: number) => string;
  apply: (m: Mods, lvl: number) => void;
}

const M = 60;
const H = 3600;
const D = 86400;

function single(
  id: string, branch: ResearchBranch, name: string, icon: string, seconds: number,
  requires: string[], desc: string, apply: (m: Mods) => void, extra: Partial<ResearchDef> = {},
): ResearchDef {
  return {
    id, branch, name, icon, max: 1, time: () => seconds, requires, desc,
    effect: (l) => (l > 0 ? '完了' : '未研究'),
    apply: (m, l) => { if (l > 0) apply(m); },
    ...extra,
  };
}

const prodSteps: Array<[string, string, number, number]> = [
  ['基礎天文学', '🔭', 2 * M, 2],
  ['恒星分光学', '🌈', 15 * M, 2],
  ['重力波観測', '〰️', H, 3],
  ['暗黒エネルギー理論', '🌑', 4 * H, 3],
  ['統一場理論', '🧲', 12 * H, 5],
  ['超弦理論', '🎻', D, 5],
  ['ホログラフィック原理', '🪩', 3 * D, 10],
  ['宇宙の設計図', '📐', 7 * D, 10],
  ['万物の理論', '📖', 14 * D, 25],
  ['創造の方程式', '✍️', 30 * D, 100],
];

const RESEARCH_LIST: ResearchDef[] = [];

prodSteps.forEach(([name, icon, sec, mult], i) => {
  RESEARCH_LIST.push(
    single(`r_prod${i + 1}`, '生産', name, icon, sec, i === 0 ? [] : [`r_prod${i}`], `全ての生産 ×${mult}`, (m) => {
      m.global = m.global.mul(mult);
    }),
  );
});

RESEARCH_LIST.push({
  id: 'r_inf', branch: '生産', name: '宇宙の真理', icon: '♾️', max: Number.POSITIVE_INFINITY,
  time: (l) => D * 1.3 ** l, requires: ['r_prod5'],
  desc: '全ての生産 ×1.5 (無限に研究可能)',
  effect: (l) => fmtMult(Decimal.pow(1.5, l)),
  apply: (m, l) => { m.global = m.global.mul(Decimal.pow(1.5, l)); },
});

// クリック
RESEARCH_LIST.push(
  single('r_click1', 'クリック', '反射神経強化', '⚡', 5 * M, [], 'クリック ×3', (m) => { m.click = m.click.mul(3); }),
  single('r_click2', 'クリック', 'ニューラルリンク', '🧠', 30 * M, ['r_click1'], 'クリックに毎秒生産の 2% を加算', (m) => { m.clickSps += 0.02; }),
  single('r_click3', 'クリック', '念動力', '🌀', 2 * H, ['r_click2'], 'クリック ×5', (m) => { m.click = m.click.mul(5); }),
  single('r_click4', 'クリック', '量子タップ', '⚛️', 8 * H, ['r_click3'], 'クリックに毎秒生産の 3% を加算', (m) => { m.clickSps += 0.03; }),
  single('r_click5', 'クリック', '神の指', '☝️', 2 * D, ['r_click4'], 'クリック ×10', (m) => { m.click = m.click.mul(10); }),
  single('r_auto1', 'クリック', '自動化アルゴリズム', '🤖', H, ['r_click1'], '自動クリック +5回/秒', (m) => { m.autoClick += 5; }),
  single('r_auto2', 'クリック', '群知能', '🐜', 12 * H, ['r_auto1'], '自動クリックの効果 ×3', (m) => { m.autoClickMult *= 3; }),
);

// 施設グループ
const groups: Array<[string, string, number]> = [
  ['近傍宙域の開発', '🛰️', 10 * M],
  ['恒星系の開発', '☀️', H],
  ['銀河の開発', '🌌', 6 * H],
  ['超宇宙の開発', '🌠', D],
];
groups.forEach(([name, icon, base], g) => {
  const from = g * 10;
  const to = from + 9;
  RESEARCH_LIST.push({
    id: `r_grp${g}`, branch: '施設', name, icon, max: 5,
    time: (l) => base * 2.5 ** l,
    requires: g === 0 ? ['r_prod1'] : [`r_grp${g - 1}`],
    desc: `施設 ${from + 1}〜${to + 1} 番の生産 ×4`,
    effect: (l) => fmtMult(Decimal.pow(4, l)),
    apply: (m, l) => { if (l > 0) mulBuildings(m, from, to, Decimal.pow(4, l)); },
  });
});
RESEARCH_LIST.push({
  id: 'r_tier', branch: '施設', name: '精密加工', icon: '🛠️', max: 3,
  time: (l) => 6 * H * 3 ** l, requires: ['r_grp1'],
  desc: '施設強化アップグレードの倍率 +0.1',
  effect: (l) => `+${(l * 0.1).toFixed(1)}`,
  apply: (m, l) => { m.tierMult += 0.1 * l; },
});

// 効率
RESEARCH_LIST.push(
  single('r_cost1', '効率', 'モジュール建築', '🧱', 20 * M, [], '施設の価格 ×0.9', (m) => { m.costMult *= 0.9; }),
  single('r_cost2', '効率', '自己組立ナノマシン', '🦠', 6 * H, ['r_cost1'], '施設の価格 ×0.85', (m) => { m.costMult *= 0.85; }),
  single('r_cost3', '効率', '物質複製機', '🖨️', 3 * D, ['r_cost2'], '施設の価格 ×0.8', (m) => { m.costMult *= 0.8; }),
  {
    id: 'r_scale', branch: '効率', name: '規模の経済', icon: '📉', max: 2,
    time: (l) => 2 * D * 4 ** l, requires: ['r_cost2'],
    desc: '施設価格の上昇率 -0.005',
    effect: (l) => `-${(l * 0.005).toFixed(3)}`,
    apply: (m, l) => { m.costScale -= 0.005 * l; },
  },
  single('r_upcost', '効率', '特許プール', '📑', 2 * H, ['r_cost1'], 'アップグレードの価格 ×0.8', (m) => { m.upgradeCostMult *= 0.8; }),
  single('r_off1', '効率', '冬眠技術', '💤', 30 * M, [], '放置効率 +10%', (m) => { m.offlineEff += 0.1; }),
  single('r_off2', '効率', '時間の繭', '🐛', 3 * H, ['r_off1'], '放置上限 +12時間', (m) => { m.offlineCapH += 12; }),
  single('r_off3', '効率', '相対論的休眠', '🕰️', D, ['r_off2'], '放置効率 +15% / 放置上限 +24時間', (m) => {
    m.offlineEff += 0.15;
    m.offlineCapH += 24;
  }),
  single('r_queue', '効率', '研究管理AI', '🗂️', H, ['r_prod1'], '研究キュー +2', (m) => { m.researchQueue += 2; }),
  single('r_speed1', '効率', '研究の自動化', '🦾', 3 * H, ['r_queue'], '研究速度 ×1.5', (m) => { m.researchSpeed *= 1.5; }),
  single('r_speed2', '効率', '超並列研究', '🖥️', 2 * D, ['r_speed1'], '研究速度 ×2', (m) => { m.researchSpeed *= 2; }),
  single('r_autores', '効率', '自律研究AI', '🤖', 12 * H, ['r_speed1'], '研究の自動選択を解放', () => {}),
);

// 彗星
RESEARCH_LIST.push(
  single('r_comet1', '彗星', '彗星力学', '☄️', 20 * M, [], '彗星の出現頻度 ×1.2', (m) => { m.cometFreq *= 1.2; }),
  single('r_comet2', '彗星', '彗星捕獲網', '🕸️', 2 * H, ['r_comet1'], '彗星バフの持続 ×1.3', (m) => { m.cometDur *= 1.3; }),
  single('r_comet3', '彗星', '彗星錬金術', '⚗️', 12 * H, ['r_comet2'], '彗星の効果 ×1.5', (m) => { m.cometPower *= 1.5; }),
  single('r_comet4', '彗星', '彗星の雨', '🌠', 3 * D, ['r_comet3'], '彗星の出現頻度 ×1.5', (m) => { m.cometFreq *= 1.5; }),
);

// 遠征
RESEARCH_LIST.push(
  single('r_exp0', '遠征', '星間航行術', '🚀', 10 * M, ['r_prod1'], '遠征を解放', () => {}),
  single('r_exp1', '遠征', 'ワープ航法', '🌀', 2 * H, ['r_exp0'], '遠征速度 ×1.3', (m) => { m.expSpeed *= 1.3; }),
  single('r_exp2', '遠征', '宇宙考古学', '🏺', 6 * H, ['r_exp0'], '遠征の幸運 +20%', (m) => { m.expLuck += 0.2; }),
  single('r_exp3', '遠征', '艦隊拡張', '🚢', D, ['r_exp1'], '遠征スロット +1', (m) => { m.expSlots += 1; }),
  single('r_exp4', '遠征', '自動航行', '🧭', 12 * H, ['r_exp1'], '遠征の自動再出発を解放', () => {}),
  single('r_exp5', '遠征', '超光速航法', '💨', 4 * D, ['r_exp3'], '遠征速度 ×1.5', (m) => { m.expSpeed *= 1.5; }),
  single('r_exp6', '遠征', '大艦隊', '🛳️', 10 * D, ['r_exp5'], '遠征スロット +1', (m) => { m.expSlots += 1; }),
  single('r_exp7', '遠征', '財宝探知', '💰', 2 * D, ['r_exp2'], '遠征で得る星屑 ×2', (m) => { m.expReward *= 2; }),
);

// 転生
RESEARCH_LIST.push(
  single('r_sn1', '転生', '超新星物理学', '💥', H, ['r_prod2'], '星核の獲得量 ×1.5', (m) => { m.snGain = m.snGain.mul(1.5); }),
  single('r_sn2', '転生', '連鎖超新星', '🎆', D, ['r_sn1'], '星核の獲得量 ×2', (m) => { m.snGain = m.snGain.mul(2); }),
  single('r_core', '転生', '星核工学', '⭐', 12 * H, ['r_sn1'], `星核1個あたりの生産ボーナス +${fmtPct(0.005, 1)}`, (m) => { m.corePer += 0.005; }),
  single('r_ach', '転生', '名声の研究', '🏅', D, ['r_sn1'], `実績1個あたりの生産ボーナス +${fmtPct(0.002, 1)}`, (m) => { m.achPer += 0.002; }),
  single('r_dm1', '転生', '暗黒物質の性質', '🌑', 2 * D, ['r_sn2'], 'ダークマターの獲得量 ×1.5', (m) => { m.dmGain = m.dmGain.mul(1.5); }, {
    cond: (g) => g.s.stats.galaxyTotal >= 1, condDesc: '銀河崩壊を1回行う',
  }),
  single('r_dm2', '転生', '暗黒物質の制御', '🕳️', 7 * D, ['r_dm1'], 'ダークマターの獲得量 ×2', (m) => { m.dmGain = m.dmGain.mul(2); }),
  single('r_ent1', '転生', 'エントロピー工学', '🔥', 7 * D, ['r_dm1'], 'エントロピーの獲得量 ×1.5', (m) => { m.entGain = m.entGain.mul(1.5); }, {
    cond: (g) => g.s.stats.crunchTotal >= 1, condDesc: 'ビッグクランチを1回行う',
  }),
  single('r_shard1', '転生', '多元宇宙論', '💎', 20 * D, ['r_ent1'], '次元の欠片の獲得量 ×1.5', (m) => { m.shardGain = m.shardGain.mul(1.5); }, {
    cond: (g) => g.s.stats.mvTotal >= 1, condDesc: '多元宇宙転生を1回行う',
  }),
  single('r_expo', '転生', '指数関数的成長', '📈', 10 * D, ['r_prod8'], '生産量の指数 +0.01', (m) => { m.exponent += 0.01; }),
);

export const RESEARCH: ResearchDef[] = RESEARCH_LIST;
export const RESEARCH_MAP: Map<string, ResearchDef> = new Map(RESEARCH.map((r) => [r.id, r]));
export const RESEARCH_BRANCHES: ResearchBranch[] = ['生産', 'クリック', '施設', '効率', '彗星', '遠征', '転生'];
