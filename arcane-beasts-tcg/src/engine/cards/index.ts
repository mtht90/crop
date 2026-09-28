import type { AbilitySpec, AttackEffect, CardDef, Condition, EType, MonsterCard, Rarity, SetCode, TrainerCard, Variant } from '../types';
import { MONSTERS } from './monsters';
import { ENERGIES, TRAINERS } from './trainers';
import { MONSTERS2 } from './monsters2';
import { TRAINERS2 } from './trainers2';

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
      return `相手のバトルモンスターがΩかEXなら、${e.bonus}ダメージ追加。`;
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
for (const mc of [...MONSTERS, ...MONSTERS2]) {
  if (mc.ability && !mc.ability.text) mc.ability.text = describeAbility(mc.ability.spec);
  for (const atk of mc.attacks) {
    if (!atk.text && atk.effects?.length) atk.text = atk.effects.map(describeEffect).join('');
  }
}

// --------------------------------------------------------------------------
// Rarity (6 tiers) and model (how the card is printed)
// --------------------------------------------------------------------------
export const RARITIES: Rarity[] = ['C', 'U', 'R', 'RR', 'ST', 'CR'];
export const RARITY_SYMBOL: Record<Rarity, string> = { C: '◇', U: '◇◇', R: '◇◇◇', RR: '◇◇◇◇', ST: '☆', CR: '♛' };
export const RARITY_NAME: Record<Rarity, string> = { C: 'コモン', U: 'アンコモン', R: 'レア', RR: 'ダブルレア', ST: 'スター', CR: 'クラウン' };

export type Model = 'normal' | 'mirror' | 'omega' | 'ex' | 'illust' | 'fullart' | 'shiny' | 'gold';
export const MODEL_NAME: Record<Model, string> = {
  normal: 'ノーマル',
  mirror: 'ミラー',
  omega: 'Ω',
  ex: 'EX',
  illust: 'イラスト',
  fullart: 'フルアート',
  shiny: 'シャイニー',
  gold: 'ゴールド',
};
export function modelOf(c: CardDef): Model {
  switch (c.variant) {
    case 'mirror':
      return 'mirror';
    case 'AR':
    case 'CHR':
    case 'SAR':
      return 'illust';
    case 'SR':
      return 'fullart';
    case 'S':
      return 'shiny';
    case 'UR':
      return 'gold';
  }
  if (c.kind === 'monster' && c.ex) return 'ex';
  if (c.kind === 'monster' && c.omega) return 'omega';
  return 'normal';
}
/** "☆ イラスト" style label */
export const printLabel = (c: CardDef) => `${RARITY_SYMBOL[c.rarity]} ${MODEL_NAME[modelOf(c)]}`;

// --------------------------------------------------------------------------
// Sets
// --------------------------------------------------------------------------
export const SET_INFO: Record<SetCode, { name: string; short: string }> = {
  AB1: { name: '目覚めの咆哮', short: '第1弾' },
  AB2: { name: '覇者の降臨', short: '第2弾' },
};
export const SETS: SetCode[] = ['AB1', 'AB2'];

const MAIN1: CardDef[] = [...MONSTERS, ...TRAINERS, ...ENERGIES];
MAIN1.forEach((c, i) => (c.no = i + 1));
const MAIN2: CardDef[] = [...MONSTERS2, ...TRAINERS2];
MAIN2.forEach((c, i) => (c.no = i + 1));
export const MAIN_SET: CardDef[] = [...MAIN1, ...MAIN2];
/** Number of regular (non-secret) cards per set, printed as "no/COUNT" */
export const SET_COUNT: Record<SetCode, number> = { AB1: MAIN1.length, AB2: MAIN2.length };

// --------------------------------------------------------------------------
// Alternate printings
//   mirror … reverse-holo version of a C/U/R card (same number)
//   AR     … illustration rare: the art spreads over the whole card
//   CHR    … character rare: the monster together with its trainer
//   S      … shiny: rare colouring with a star-foil frame
//   SR     … full-art Ω / EX / supporter
//   SAR    … special art: dramatic close-up illustration
//   UR     … gold
// --------------------------------------------------------------------------
const SUFFIX: Record<Variant, string> = { mirror: 'M', AR: 'AR', CHR: 'CHR', S: 'S', SR: 'SR', SAR: 'SAR', UR: 'UR' };
const secret: Record<SetCode, number> = { AB1: MAIN1.length, AB2: MAIN2.length };
const VARIANTS: CardDef[] = [];

function named(name: string): CardDef {
  const c = MAIN_SET.find((x) => x.name === name);
  if (!c) throw new Error(`variant: unknown card ${name}`);
  return c;
}

function alt(base: CardDef, v: Variant, extra: Partial<CardDef> = {}) {
  const rarity: Rarity = v === 'mirror' ? base.rarity : v === 'SAR' || v === 'UR' ? 'CR' : 'ST';
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
interface SetVariants {
  AR: ArtSpec[];
  CHR: [string, string, CropSpec?][]; // monster, partner portrait
  S: [string, number][]; // monster, hue rotation
  SR: string[];
  SAR: ArtSpec[];
  UR: string[];
}

const PLAN: Record<SetCode, SetVariants> = {
  AB1: {
    AR: [
      ['ヒアリクイーン'], ['ゴウカレイス', undefined, 'story/p-burning'], ['イエティ', undefined, 'story/p-snowfield'], ['コガネスカラベ', undefined, 'story/p-great-tree'],
      ['サンダーグリフォン', undefined, 'story/p-mountains'], ['レイス', undefined, 'story/p-graves'], ['グリズリー'], ['ホワイトホース', undefined, 'story/p-summer'],
      ['ドレッドバット'], ['ヤミオオカミ', undefined, 'story/p-black-forest'],
    ],
    CHR: [
      ['コダマギ', 'humans/peasant'],
      ['ミズチ', 'merfolk/initiate'],
      ['ライメイハヤブサ', 'humans/longbowman'],
      ['トロル', 'trolls/troll-shaman'],
      ['バーナドレイク', 'drakes/flameheart'],
      ['グレートウルフ', 'goblins/wolf-rider'],
      ['ナイトメア', 'humans/dark-adept+female'],
      ['レヴナント', 'undead/ancient-lich'],
    ],
    S: [['ヒオネコ', 200], ['ワイバーン', 110], ['アカオオカミ', 190], ['オオツチグモ', 250], ['ゴースト', 150], ['ディープテンタクル', 90]],
    SR: [...MONSTERS.filter((x) => x.omega).map((x) => x.name), '大賢者の研究', '司令官の号令', '盗賊団の手引き', '白魔導士の祈り'],
    SAR: [
      ['ヴォルカリオン', undefined, 'story/p-burning'],
      ['リヴァイアサーペント', { scale: 1.1, x: 40, y: 14 }, 'story/p-storm-sea'],
      ['ナイトゴーント', undefined, 'story/p-black-forest'],
      ['大賢者の研究', undefined, 'story/p-study'],
    ],
    UR: ['ヴォルカリオン', 'リヴァイアサーペント', 'デスナイト', 'トロルキング', 'エンシェントウッド', 'ナイトゴーント', '進化の秘薬', '虹色エネルギー'],
  },
  AB2: {
    AR: [
      ['ドレイクガーディアン'], ['ヒブネ', undefined, 'story/p-island'], ['ナーガリングキャスター'], ['シャイード', undefined, 'story/p-great-tree'],
      ['セイレーン', undefined, 'story/p-wild-sea'], ['オオヒグマ', undefined, 'story/p-summer'], ['ドラウグ', undefined, 'story/p-graves'], ['ゾンビグリフォン'],
      ['スノーゴーレム', undefined, 'story/p-winter'], ['テュポーン', undefined, 'story/p-storm-sea'], ['カエンワイト', undefined, 'story/p-burning'],
      ['フレッシュゴーレム', undefined, 'story/p-fog'], ['メダマソウ', undefined, 'story/p-great-tree'],
    ],
    CHR: [
      ['ドレイククラッシャー', 'humans/grand-knight'],
      ['ナーガミュルミドン', 'merfolk/priestess'],
      ['ブラウンリッチ', 'humans/necromancer+female'],
      ['ロックトロル', 'orcs/warlord'],
      ['ヘイタイアリ', 'elves/druid'],
      ['スノーゴーレム', 'elves/sorceress'],
      ['ワーム', 'elves/shaman'],
      ['ツカイマ', 'humans/mage-red+female'],
    ],
    S: [['ドレイクファイター', 170], ['ナーガソルジャー', 260], ['クサレオオカミ', 200], ['シルフ', 300], ['ワーム', 190], ['ユキダマ', 300]],
    SR: [...MONSTERS2.filter((x) => x.omega || x.ex).map((x) => x.name), '騎士の突撃', '暗殺者の刃', '聖騎士の加護'],
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
    UR: [...MONSTERS2.filter((x) => x.ex).map((x) => x.name), '賢者の水晶', '覇者の紋章'],
  },
};

for (const set of SETS) {
  const main = set === 'AB1' ? MAIN1 : MAIN2;
  for (const c of main) {
    const basicEnergy = c.kind === 'energy' && c.basic;
    if (!basicEnergy && (c.rarity === 'C' || c.rarity === 'U' || c.rarity === 'R')) alt(c, 'mirror');
  }
  const plan = PLAN[set];
  const withScene = (scene?: string) => (scene ? { scene } : {});
  for (const [n, crop, scene] of plan.AR) alt(named(n), 'AR', { crop, ...withScene(scene) });
  for (const [n, partner, crop] of plan.CHR) alt(named(n), 'CHR', { partner, crop });
  for (const [n, hue] of plan.S) alt(named(n), 'S', { hue });
  for (const n of plan.SR) alt(named(n), 'SR');
  // supporters with a painting are printed as the painting alone
  for (const [n, crop, scene] of plan.SAR) {
    const base = named(n);
    alt(base, 'SAR', { crop, ...withScene(scene), ...(scene && base.kind === 'trainer' ? { paint: true } : {}) });
  }
  for (const n of plan.UR) alt(named(n), 'UR');
}

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

export { MONSTERS, TRAINERS, ENERGIES, MONSTERS2, TRAINERS2 };
