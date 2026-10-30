import type { AbilitySpec, AttackEffect, CardDef, Condition, EType, MonsterCard, Rarity, SetCode, TrainerCard, Variant } from '../types';
import { MONSTERS } from './monsters';
import { ENERGIES, TRAINERS } from './trainers';
import { MONSTERS2 } from './monsters2';
import { TRAINERS2 } from './trainers2';
import { MONSTERS3 } from './monsters3';
import { TRAINERS3 } from './trainers3';
import { CH1_EXTRA, CH2_EXTRA } from './chapters';

export const TYPE_JP: Record<EType, string> = {
  fire: '炎',
  water: '水',
  grass: '草',
  lightning: '雷',
  psychic: '超',
  fighting: '闘',
  dark: '悪',
  colorless: '無色',
};

export const COND_JP: Record<Condition, string> = {
  poisoned: 'どく',
  burned: 'やけど',
  asleep: 'ねむり',
  paralyzed: 'マヒ',
  confused: 'こんらん',
};

export const STAGE_JP = { basic: 'たね', stage1: '1進化', stage2: '2進化' } as const;

// --------------------------------------------------------------------------
// Auto-generated rules text
// --------------------------------------------------------------------------
export function describeEffect(e: AttackEffect): string {
  switch (e.k) {
    case 'flipMulti':
      return `コインを${e.flips}回投げ、オモテの数×${e.per}ダメージ。`;
    case 'flipUntilTails':
      return `ウラが出るまでコインを投げ、オモテの数×${e.per}ダメージ。`;
    case 'flipBonus':
      return `コインを1回投げオモテなら、${e.bonus}ダメージ追加。`;
    case 'flipFail':
      return 'コインを1回投げウラなら、このワザは失敗。';
    case 'condition':
      return e.flip
        ? `コインを1回投げオモテなら、相手のバトルモンスターを${COND_JP[e.cond]}にする。`
        : `相手のバトルモンスターを${COND_JP[e.cond]}にする。`;
    case 'selfCondition':
      return `このモンスターは${COND_JP[e.cond]}になる。`;
    case 'selfDamage':
      return `このモンスターにも${e.n}ダメージ。`;
    case 'healSelf':
      return `このモンスターのHPを「${e.n}」回復する。`;
    case 'benchSnipe':
      return `相手のベンチモンスター${e.count && e.count > 1 ? e.count + '匹' : '1匹'}にも、${e.n}ダメージ。［ベンチは弱点・抵抗力を計算しない。］`;
    case 'anySnipe':
      return `相手のモンスター1匹に、${e.n}ダメージ。［ベンチは弱点・抵抗力を計算しない。］`;
    case 'spread':
      return `相手のベンチモンスター全員にも、それぞれ${e.n}ダメージ。［ベンチは弱点・抵抗力を計算しない。］`;
    case 'discardSelfEnergy':
      return e.n === 'all'
        ? 'このモンスターについているエネルギーをすべてトラッシュする。'
        : `このモンスターについている${e.type ? TYPE_JP[e.type] : ''}エネルギーを${e.n}個トラッシュする。`;
    case 'discardOppEnergy':
      return e.flip
        ? 'コインを1回投げオモテなら、相手のバトルモンスターについているエネルギーを1個トラッシュする。'
        : `相手のバトルモンスターについているエネルギーを${e.n}個トラッシュする。`;
    case 'draw':
      return `自分の山札を${e.n}枚引く。`;
    case 'searchEnergyAttach': {
      const src = e.from === 'deck' ? '山札' : 'トラッシュ';
      const to = e.to === 'self' ? 'このモンスター' : e.to === 'bench' ? 'ベンチモンスター' : '自分のモンスター';
      return `自分の${src}から基本${TYPE_JP[e.type]}エネルギーを${e.n}枚まで選び、${to}に好きなようにつける。${e.from === 'deck' ? 'そして山札を切る。' : ''}`;
    }
    case 'callForFamily':
      return `自分の山札から${e.name ? `名前に「${e.name}」とつく` : ''}たねモンスターを${e.n}枚まで選び、ベンチに出す。そして山札を切る。`;
    case 'bonusPerEnergy':
      return e.on === 'both'
        ? `おたがいのバトルモンスターについているエネルギーの数×${e.per}ダメージ追加。`
        : `${e.on === 'self' ? 'このモンスター' : '相手のバトルモンスター'}についているエネルギーの数×${e.per}ダメージ追加。`;
    case 'bonusPerSelfDamage':
      return `このモンスターにのっているダメカンの数×${e.per}ダメージ追加。`;
    case 'bonusIfOppDamaged':
      return `相手のバトルモンスターにダメカンがのっているなら、${e.bonus}ダメージ追加。`;
    case 'bonusIfSelfDamaged':
      return `このモンスターにダメカンがのっているなら、${e.bonus}ダメージ追加。`;
    case 'bonusIfOppCondition':
      return `相手のバトルモンスターが${COND_JP[e.cond]}なら、${e.bonus}ダメージ追加。`;
    case 'bonusPerBench': {
      const who = e.whose === 'self' ? '自分の' : e.whose === 'opp' ? '相手の' : 'おたがいの';
      const nm = e.nameIncludes ? `名前に「${e.nameIncludes}」とつく` : '';
      return `${who}ベンチの${nm}モンスターの数×${e.per}ダメージ追加。`;
    }
    case 'bonusPerDiscardMonster':
      return `自分のトラッシュにあるモンスターの数×${e.per}ダメージ追加。${e.max ? `（追加は最大${e.max}ダメージ）` : ''}`;
    case 'bonusIfOmega':
      return `相手のバトルモンスターがHP150以上なら、${e.bonus}ダメージ追加。`;
    case 'bonusPerHand':
      return `${e.whose === 'self' ? '自分' : '相手'}の手札の枚数×${e.per}ダメージ追加。${e.max ? `（追加は最大${e.max}ダメージ）` : ''}`;
    case 'bonusPerTrash':
      return `自分のトラッシュにある${e.of === 'energy' ? 'エネルギー' : 'トレーナーズ'}の枚数×${e.per}ダメージ追加。${e.max ? `（追加は最大${e.max}ダメージ）` : ''}`;
    case 'discardOppHand':
      return `相手の手札をウラにして${e.n}枚ランダムに選び、トラッシュする。`;
    case 'healAllSelf':
      return `自分のモンスター全員のHPを、それぞれ「${e.n}」回復する。`;
    case 'millOpp':
      return `相手の山札を上から${e.n}枚、トラッシュする。`;
    case 'cantAttackNext':
      return '次の自分の番、このモンスターはワザが使えない。';
    case 'reduceNext':
      return `次の相手の番、このモンスターが受けるワザのダメージは「-${e.n}」される。`;
    case 'preventNext':
      return e.flip
        ? 'コインを1回投げオモテなら、次の相手の番、このモンスターはワザのダメージや効果を受けない。'
        : '次の相手の番、このモンスターはワザのダメージや効果を受けない。';
    case 'switchSelf':
      return 'このモンスターをベンチモンスターと入れ替える。';
    case 'gustBefore':
      return '相手のベンチモンスターを1匹選び、バトルモンスターと入れ替える。その後、新しいバトルモンスターにダメージを与える。';
    case 'oppCantRetreat':
      return '次の相手の番、このワザを受けたモンスターはにげられない。';
    case 'hitBench':
      return `自分のベンチモンスター全員にも、それぞれ${e.n}ダメージ。`;
  }
}

export function describeAbility(a: AbilitySpec): string {
  switch (a.k) {
    case 'drawOnce':
      return `${a.activeOnly ? 'このモンスターがバトル場にいるなら、' : ''}自分の番に1回使える。自分の山札を${a.n}枚引く。`;
    case 'energyFromHand':
      return `自分の番に1回使える。自分の手札から基本${TYPE_JP[a.type]}エネルギーを1枚選び、自分のモンスターにつける。`;
    case 'energyFromDiscard':
      return `自分の番に1回使える。自分のトラッシュから基本${TYPE_JP[a.type]}エネルギーを1枚選び、自分のモンスターにつける。${a.selfDamage ? `その後、このモンスターにダメカンを${a.selfDamage / 10}個のせる。` : ''}`;
    case 'healOnce':
      return `自分の番に1回使える。自分のモンスター1匹のHPを「${a.n}」回復する。`;
    case 'searchBasicOnce':
      return `自分の番に1回使える。自分の山札から${a.nameIncludes ? `名前に「${a.nameIncludes}」とつく` : ''}たねモンスターを1枚選び、ベンチに出す。そして山札を切る。`;
    case 'switchInOnce':
      return '自分の番に1回、このモンスターがベンチにいるなら使える。このモンスターを、バトル場のモンスターと入れ替える。';
    case 'damageReduce':
      return `このモンスターが受けるワザのダメージは「-${a.n}」される。`;
    case 'freeRetreat':
      return 'このモンスターのにげるためのエネルギーは、すべてなくなる。';
    case 'benchBarrier':
      return '自分のベンチモンスター全員は、相手のワザのダメージを受けない。';
    case 'typeBoost':
      return `自分の${a.nameIncludes ? `名前に「${a.nameIncludes}」とつく` : a.type ? TYPE_JP[a.type] : ''}モンスターが使うワザの、相手のバトルモンスターへのダメージは「+${a.n}」される。（この効果は重ならない）`;
    case 'counterDamage':
      return `このモンスターがバトル場で相手のワザのダメージを受けたとき、ワザを使ったモンスターにダメカンを${a.n / 10}個のせる。`;
    case 'regen':
      return `チェックタイムのたび、このモンスターのHPを「${a.n}」回復する。`;
    case 'nightmare':
      return `チェックタイムのたび、相手のねむりのモンスターにダメカンを${a.n / 10}個のせる。`;
    case 'onEvolveDraw':
      return `自分の番に、このカードを手札から出して進化させたとき、1回使える。自分の山札を${a.n}枚引く。`;
    case 'hpAura':
      return `自分の${TYPE_JP[a.type]}モンスター全員の最大HPは「+${a.n}」される。`;
  }
}

// Fill in auto-generated texts
for (const mc of [...MONSTERS, ...MONSTERS2, ...MONSTERS3]) {
  if (mc.ability && !mc.ability.text) mc.ability.text = describeAbility(mc.ability.spec);
  for (const atk of mc.attacks) {
    if (!atk.text && atk.effects?.length) atk.text = atk.effects.map(describeEffect).join('');
  }
}

// --------------------------------------------------------------------------
// Rarity (★1 – ★5) and model (how the card is printed)
// --------------------------------------------------------------------------
export const RARITIES: Rarity[] = [1, 2, 3, 4, 5];
export const RARITY_SYMBOL: Record<Rarity, string> = { 1: '★', 2: '★★', 3: '★★★', 4: '★★★★', 5: '★★★★★' };
export const RARITY_NAME: Record<Rarity, string> = { 1: '★1', 2: '★2', 3: '★3', 4: '★4', 5: '★5' };
/** the colour each ★ shows in (pack opening, badges): grey, blue, gold, rainbow, rainbow-gold */
export const RARITY_COLOR: Record<Rarity, string> = { 1: '#b8bec9', 2: '#5ab0ff', 3: '#ffc245', 4: '#ff79d6', 5: '#fff1a8' };
/** prize cards taken when this monster is knocked out */


/** special printings; a card printed the ordinary way has no model */
export type Model = 'mirror' | 'fullart' | 'special' | 'gold';
export const MODEL_NAME: Record<Model, string> = {
  mirror: 'ミラー',
  fullart: 'フルアート',
  special: 'スペシャルアート',
  gold: 'ゴールド',
};
export function modelOf(c: CardDef): Model | null {
  switch (c.variant) {
    case 'mirror':
      return 'mirror';
    case 'SR':
      return 'fullart';
    case 'SAR':
      return 'special';
    case 'UR':
      return 'gold';
  }
  return null;
}
/** "★★★ フルアート" style label ("★★" alone for an ordinary printing) */
export const printLabel = (c: CardDef) => {
  const m = modelOf(c);
  return m ? `${RARITY_SYMBOL[c.rarity]} ${MODEL_NAME[m]}` : RARITY_SYMBOL[c.rarity];
};

// --------------------------------------------------------------------------
// Chapters
//   cards are grouped by the chapter of the story they belong to (the SetCode
//   is the chapter); ids keep the printing they were first made in
// --------------------------------------------------------------------------
export const SET_INFO: Record<SetCode, { name: string; short: string; code: string }> = {
  AB1: { name: '十二枚の伝説', short: '第一章', code: 'CH1' },
  AB2: { name: '灰の巡礼', short: '第二章', code: 'CH2' },
  AB3: { name: '影の王冠', short: '第三章', code: 'CH3' },
};
export const SETS: SetCode[] = ['AB1', 'AB2', 'AB3'];

const PRINT1: CardDef[] = [...MONSTERS, ...TRAINERS, ...ENERGIES];
const PRINT2: CardDef[] = [...MONSTERS2, ...TRAINERS2];
const PRINT3: CardDef[] = [...MONSTERS3, ...TRAINERS3];
const chapterOf = (c: CardDef, printing: SetCode): SetCode =>
  printing === 'AB1' || CH1_EXTRA.has(c.name) ? 'AB1' : printing === 'AB2' || CH2_EXTRA.has(c.name) ? 'AB2' : 'AB3';
const MAIN_OF: Record<SetCode, CardDef[]> = { AB1: [], AB2: [], AB3: [] };
for (const [printing, list] of [['AB1', PRINT1], ['AB2', PRINT2], ['AB3', PRINT3]] as const)
  for (const c of list) MAIN_OF[(c.set = chapterOf(c, printing))].push(c);
for (const set of SETS) MAIN_OF[set].forEach((c, i) => (c.no = i + 1));
export const MAIN_SET: CardDef[] = SETS.flatMap((s) => MAIN_OF[s]);
/** Number of regular (non-secret) cards per chapter, printed as "no/COUNT" */
export const SET_COUNT: Record<SetCode, number> = { AB1: MAIN_OF.AB1.length, AB2: MAIN_OF.AB2.length, AB3: MAIN_OF.AB3.length };

// --------------------------------------------------------------------------
// Printings
//   mirror … reverse-holo version of a regular card (same number and ★)
//   SR     … full art (★3): the aces and some supporters
//   SAR    … special art (★4): dramatic close-up illustration
//   UR     … gold (★5)
// --------------------------------------------------------------------------
const SUFFIX: Record<Variant, string> = { mirror: 'M', SR: 'SR', SAR: 'SAR', UR: 'UR' };
const PRINT_STAR: Record<Exclude<Variant, 'mirror'>, Rarity> = { SR: 3, SAR: 4, UR: 5 };
const secret: Record<SetCode, number> = { ...SET_COUNT };
const VARIANTS: CardDef[] = [];

function named(name: string): CardDef {
  const c = MAIN_SET.find((x) => x.name === name);
  if (!c) throw new Error(`variant: unknown card ${name}`);
  return c;
}

function alt(base: CardDef, v: Variant, extra: Partial<CardDef> = {}) {
  const rarity: Rarity = v === 'mirror' ? base.rarity : PRINT_STAR[v];
  const no = v === 'mirror' ? base.no : ++secret[base.set];
  VARIANTS.push({
    ...base,
    id: `${base.id}-${SUFFIX[v]}`,
    no,
    rarity,
    variant: v,
    baseId: base.id,
    fullArt: v === 'SR' || v === 'UR' || (v === 'SAR' && base.kind === 'trainer') || undefined,
    gold: v === 'UR' || undefined,
    ...extra,
  } as CardDef);
}

type CropSpec = { scale?: number; x?: number; y?: number };
/** [card name, framing, painted background] — backgrounds are Wesnoth campaign story paintings */
type ArtSpec = [string, CropSpec?, string?];
interface Plan {
  SR: string[];
  SAR: ArtSpec[];
  UR: string[];
}
/** printings by the set the card was first made in */
const PLAN: Plan[] = [
  {
    SR: [...MONSTERS3.filter((x) => x.ace).map((x) => x.name), '傭兵の契約', '案内人の笛', '族長の号令'],
    SAR: [
      ['タウロクプロテクター', undefined, 'story/p-burning'],
      ['ナーガウォーロード', undefined, 'story/p-storm-sea'],
      ['エルフハイロード', undefined, 'story/p-great-tree'],
      ['ドラゴンガード', undefined, 'story/p-mountains'],
      ['アークウィッチ', undefined, 'story/p-study'],
      ['オークソブリン', undefined, 'story/p-the-fall'],
      ['ドラウグロード', undefined, 'story/p-graves'],
      ['グランドナイト', undefined, 'story/landscape-castle'],
      ['傭兵の契約', undefined, 'story/p-shadows'],
    ],
    UR: [...MONSTERS3.filter((x) => x.ace).map((x) => x.name), 'サイキックメイジ', 'ドワーフロード', '傭兵の契約'],
  },
  {
    SR: [...MONSTERS.filter((x) => x.ace).map((x) => x.name), '大賢者の研究', '司令官の号令', '盗賊団の手引き', '白魔導士の祈り'],
    SAR: [
      ['ヴォルカリオン', undefined, 'story/p-burning'],
      ['リヴァイアサーペント', { scale: 1.1, x: 40, y: 14 }, 'story/p-storm-sea'],
      ['ナイトゴーント', undefined, 'story/p-black-forest'],
      ['大賢者の研究', undefined, 'story/p-study'],
    ],
    UR: ['ヴォルカリオン', 'リヴァイアサーペント', 'デスナイト', 'トロルキング', 'エンシェントウッド', 'ナイトゴーント', '進化の秘薬', '虹色エネルギー'],
  },
  {
    SR: [...MONSTERS2.filter((x) => x.ace).map((x) => x.name), '騎士の突撃', '暗殺者の刃', '聖騎士の加護'],
    SAR: [
      ['ドラグーン', undefined, 'story/p-drake-fleet'],
      ['ナーガクイーン', undefined, 'story/p-wild-sea'],
      ['リッチロード', { y: 10 }, 'story/p-summoning'],
      ['クイーンアント', { x: 40 }, 'story/p-swamp'],
      ['トロルジェネラル', undefined, 'story/p-the-fall'],
      ['エルダーワイアーム', { scale: 1.15, x: 44, y: 8 }, 'story/p-mountains'],
      ['ヴァンパイア', { scale: 1.2 }, 'story/p-graves'],
      ['暗殺者の刃', undefined, 'story/p-shadows'],
    ],
    UR: [...MONSTERS2.filter((x) => x.ace).map((x) => x.name), '賢者の水晶', '覇者の紋章'],
  },
];

for (const c of MAIN_SET) if (!(c.kind === 'energy' && c.basic)) alt(c, 'mirror');
// secret numbers run per chapter: full art, then special art, then gold
for (const set of SETS)
  for (const p of PLAN) {
    const mine = (n: string) => named(n).set === set;
    for (const n of new Set(p.SR)) if (mine(n)) alt(named(n), 'SR');
  }
for (const set of SETS)
  for (const p of PLAN)
    // supporters with a painting are printed as the painting alone
    for (const [n, crop, scene] of p.SAR) {
      const base = named(n);
      if (base.set === set) alt(base, 'SAR', { crop, ...(scene ? { scene } : {}), ...(scene && base.kind === 'trainer' ? { paint: true } : {}) });
    }
for (const set of SETS) for (const p of PLAN) for (const n of new Set(p.UR)) if (named(n).set === set) alt(named(n), 'UR');

export const ALL_CARDS: CardDef[] = [...MAIN_SET, ...VARIANTS];
export const CARDS: Record<string, CardDef> = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));
export const CARD_BY_NAME: Record<string, CardDef> = Object.fromEntries(MAIN_SET.map((c) => [c.name, c]));

export function card(cid: string): CardDef {
  const c = CARDS[cid];
  if (!c) throw new Error(`Unknown card ${cid}`);
  return c;
}

export function byName(name: string): CardDef {
  const c = CARD_BY_NAME[name];
  if (!c) throw new Error(`Unknown card name ${name}`);
  return c;
}

export function isMonster(c: CardDef): c is MonsterCard {
  return c.kind === 'monster';
}

export function isTrainer(c: CardDef): c is TrainerCard {
  return c.kind === 'trainer';
}

export { MONSTERS, TRAINERS, ENERGIES, MONSTERS2, TRAINERS2, MONSTERS3, TRAINERS3 };
