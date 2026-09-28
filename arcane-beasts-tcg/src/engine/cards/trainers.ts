import type { EnergyCard, EType, Rarity, TrainerCard } from '../types';
import { trainerFactory } from './factory';

const t = trainerFactory('AB1');

// Trainer ids are referenced by effect implementations via their name.
export const TRAINERS: TrainerCard[] = [
  // --------------------------- Supporters ---------------------------
  t('research', '大賢者の研究', 'supporter', 'U', '自分の手札をすべてトラッシュし、山札を7枚引く。', 'humans/mage-arch'),
  t('boss', '司令官の号令', 'supporter', 'R', '相手のベンチモンスターを1匹選び、バトル場のモンスターと入れ替える。', 'humans/marshal'),
  t('iono', '盗賊団の手引き', 'supporter', 'R', 'おたがいのプレイヤーは、それぞれ手札をすべてウラにして切り、山札の下にもどす。その後、それぞれ自分のサイドの残り枚数ぶん、山札を引く。', 'humans/thief+female'),
  t('hunter', '狩人の知恵', 'supporter', 'U', '自分の山札からモンスターを1枚と基本エネルギーを1枚まで選び、相手に見せて手札に加える。そして山札を切る。', 'humans/huntsman'),
  t('cleric', '白魔導士の祈り', 'supporter', 'U', '自分のモンスター1匹のHPを「80」回復し、特殊状態をすべて回復する。', 'humans/mage-white+female'),
  t('judge', '書庫の整理', 'supporter', 'C', '自分の手札をすべて山札にもどして切る。その後、山札を6枚引く。', 'humans/mage+female'),
  t('necro', '死霊術師の儀式', 'supporter', 'U', '自分のトラッシュからモンスターと基本エネルギーを合計3枚まで選び、相手に見せて手札に加える。', 'humans/necromancer'),
  t('general', '騎士団長の激励', 'supporter', 'U', 'この番、自分のモンスターが使うワザの、相手のバトルモンスターへのダメージは「+30」される。', 'humans/general'),
  t('scholar', '見習い魔導士', 'supporter', 'C', '自分の山札を3枚引く。さらに、自分のベンチにモンスターがいないなら、もう2枚引く。', 'humans/mage-light'),

  // ----------------------------- Items ------------------------------
  t('nest', '召喚の巻物', 'item', 'C', '自分の山札からたねモンスターを1枚選び、ベンチに出す。そして山札を切る。', 'item', { icon: 'scroll-unfurled' }),
  t('ultra', '魔獣の笛', 'item', 'U', 'このカードは、自分の手札を2枚トラッシュしなければ使えない。自分の山札からモンスターを1枚選び、相手に見せて手札に加える。そして山札を切る。', 'item', { icon: 'hunting-horn' }),
  t('potion', '回復薬', 'item', 'C', '自分のモンスター1匹のHPを「30」回復する。', 'item', { icon: 'health-potion' }),
  t('superpotion', '上級回復薬', 'item', 'U', '自分のモンスター1匹のHPを「90」回復し、そのモンスターについているエネルギーを1個トラッシュする。', 'item', { icon: 'potion-ball' }),
  t('switch', '転移の羽', 'item', 'C', '自分のバトルモンスターをベンチモンスターと入れ替える。', 'item', { icon: 'feather' }),
  t('candy', '進化の秘薬', 'item', 'R', '自分の場のたねモンスター1匹に、そのモンスターから進化する2進化モンスターを手札から重ねて進化させる。(最初の番や、出したばかりのモンスターには使えない。)', 'item', { icon: 'magic-potion' }),
  t('retrieval', 'エネルギー結晶', 'item', 'C', '自分のトラッシュから基本エネルギーを2枚まで選び、相手に見せて手札に加える。', 'item', { icon: 'crystal-growth' }),
  t('vessel', '大地の器', 'item', 'U', 'このカードは、自分の手札を1枚トラッシュしなければ使えない。自分の山札から基本エネルギーを2枚まで選び、相手に見せて手札に加える。そして山札を切る。', 'item', { icon: 'amphora' }),
  t('stretcher', '夜の担架', 'item', 'U', '自分のトラッシュからモンスターか基本エネルギーを1枚選び、相手に見せて手札に加える。', 'item', { icon: 'night-sky' }),
  t('pokeball', '運命のコイン', 'item', 'C', 'コインを1回投げオモテなら、自分の山札からモンスターを1枚選び、相手に見せて手札に加える。そして山札を切る。', 'item', { icon: 'coins' }),
  t('catcher', '捕獲の鎖', 'item', 'U', 'コインを1回投げオモテなら、相手のベンチモンスターを1匹選び、バトル場のモンスターと入れ替える。', 'item', { icon: 'crossed-chains' }),
  t('compass', '属性の羅針盤', 'item', 'C', '自分の山札から基本エネルギーを1枚選び、相手に見せて手札に加える。そして山札を切る。', 'item', { icon: 'compass' }),

  // ----------------------------- Tools ------------------------------
  t('float', '浮遊の羽根飾り', 'tool', 'U', 'このカードをつけているモンスターのにげるためのエネルギーは、すべてなくなる。', 'item', { icon: 'feathered-wing' }),
  t('band', '力の腕輪', 'tool', 'U', 'このカードをつけているモンスターが使うワザの、相手のバトルモンスターへのダメージは「+20」される。', 'item', { icon: 'bracer' }),
  t('charm', '守りの護符', 'tool', 'U', 'このカードをつけているモンスターの最大HPは「+30」される。', 'item', { icon: 'pendant-key' }),
  t('helmet', '棘の鎧', 'tool', 'U', 'このカードをつけているバトルモンスターが、相手のモンスターからワザのダメージを受けたとき、ワザを使ったモンスターにダメカンを2個のせる。', 'item', { icon: 'spiked-armor' }),

  // ---------------------------- Stadiums ----------------------------
  t('volcano', '灼熱の火山帯', 'stadium', 'U', 'おたがいの炎モンスターが使うワザの、相手のバトルモンスターへのダメージは「+20」される。', 'story/landscape-lava'),
  t('forest', 'エルフの森', 'stadium', 'U', 'おたがいのプレイヤーは、自分の番に1回、自分の山札からたねモンスターを1枚選び、ベンチに出してよい。そして山札を切る。', 'story/landscape-hills-01'),
  t('coast', '嵐の海岸', 'stadium', 'U', 'おたがいの場のモンスター全員の、にげるためのエネルギーは、1個少なくなる。', 'story/landscape-coast'),
  t('swamp', '瘴気の沼', 'stadium', 'U', 'おたがいのどくのモンスターにのせるダメカンの数は、2個多くなる。', 'story/swamp-03'),
  t('battlefield', '英雄の古戦場', 'stadium', 'U', 'おたがいのモンスターが使うワザの、相手のバトルモンスターへのダメージは「+10」される。', 'story/landscape-battlefield_nohumans'),
];


// ------------------------------ Energy ------------------------------
const ENAMES: Record<string, string> = {
  fire: '基本炎エネルギー',
  water: '基本水エネルギー',
  grass: '基本草エネルギー',
  lightning: '基本雷エネルギー',
  psychic: '基本超エネルギー',
  fighting: '基本闘エネルギー',
  dark: '基本悪エネルギー',
};

let en = 200;
export const ENERGIES: EnergyCard[] = [
  ...(Object.keys(ENAMES) as EType[]).map((ty) => {
    en++;
    return {
      kind: 'energy' as const,
      id: `AB1-E${ty}`,
      set: 'AB1' as const,
      no: en,
      name: ENAMES[ty],
      rarity: 'C' as Rarity,
      art: `energy/${ty}`,
      basic: true,
      provides: [ty],
      energyType: ty,
    };
  }),
  {
    kind: 'energy',
    id: 'AB1-208',
    set: 'AB1',
    no: 208,
    name: 'ダブル無色エネルギー',
    rarity: 'U',
    art: 'energy/colorless',
    basic: false,
    provides: ['colorless'],
    count: 2,
    energyType: 'colorless',
    text: 'このカードは、無色エネルギー2個ぶんとしてはたらく。',
  },
  {
    kind: 'energy',
    id: 'AB1-209',
    set: 'AB1',
    no: 209,
    name: '虹色エネルギー',
    rarity: 'R',
    art: 'energy/rainbow',
    basic: false,
    provides: ['fire', 'water', 'grass', 'lightning', 'psychic', 'fighting', 'dark'],
    any: true,
    energyType: 'colorless',
    text: 'このカードは、すべてのタイプのエネルギー1個ぶんとしてはたらく。このカードを手札からモンスターにつけたとき、そのモンスターにダメカンを1個のせる。',
  },
];
