import type { AbilitySpec, AttackEffect, CardDef, Condition, EType, MonsterCard } from '../types';
import { MONSTERS } from './monsters';
import { ENERGIES, TRAINERS } from './trainers';

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
      return `自分の山札からたねモンスターを${e.n}枚まで選び、ベンチに出す。そして山札を切る。`;
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
      return `自分のトラッシュにあるモンスターの数×${e.per}ダメージ追加。${e.max ? `（最大${e.max}）` : ''}`;
    case 'bonusIfOmega':
      return `相手のバトルモンスターがΩなら、${e.bonus}ダメージ追加。`;
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
for (const mc of MONSTERS) {
  if (mc.ability && !mc.ability.text) mc.ability.text = describeAbility(mc.ability.spec);
  for (const atk of mc.attacks) {
    if (!atk.text && atk.effects?.length) atk.text = atk.effects.map(describeEffect).join('');
  }
}

export const MAIN_SET: CardDef[] = [...MONSTERS, ...TRAINERS, ...ENERGIES];
MAIN_SET.forEach((c, i) => (c.no = i + 1));
export const SET_MAIN_COUNT = MAIN_SET.length;

// Secret rares: full-art (SR) and gold (UR) alternate versions
const VARIANTS: CardDef[] = [];
let secret = SET_MAIN_COUNT;
for (const mc of MONSTERS.filter((m) => m.omega)) {
  secret++;
  VARIANTS.push({ ...mc, id: `${mc.id}-SR`, no: secret, rarity: 'SR', fullArt: true, baseId: mc.id });
}
for (const name of ['大賢者の研究', '司令官の号令', '盗賊団の手引き', '白魔導士の祈り']) {
  const t = TRAINERS.find((x) => x.name === name)!;
  secret++;
  VARIANTS.push({ ...t, id: `${t.id}-SR`, no: secret, rarity: 'SR', fullArt: true, baseId: t.id });
}
for (const name of ['ヴォルカリオン', 'リヴァイアサーペント', 'デスナイト', 'トロルキング', 'エンシェントウッド', 'ナイトゴーント']) {
  const mc = MONSTERS.find((x) => x.name === name)!;
  secret++;
  VARIANTS.push({ ...mc, id: `${mc.id}-UR`, no: secret, rarity: 'UR', fullArt: true, gold: true, baseId: mc.id });
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

export { MONSTERS, TRAINERS, ENERGIES };
