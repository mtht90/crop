// 第3弾「辺境の軍勢」 trainers
import type { TrainerCard } from '../types';
import { trainerFactory } from './factory';

const t = trainerFactory('AB3');

export const TRAINERS3: TrainerCard[] = [
  // --------------------------- Supporters ---------------------------
  t('spy', '斥候の報告', 'supporter', 'C', '自分の山札を上から5枚見て、その中から1枚を手札に加える。残りは山札の下にもどす。', 'humans/footpad'),
  t('smith', 'ドワーフの鍛冶師', 'supporter', 'U', '自分のトラッシュから基本エネルギーを2枚まで選び、自分のモンスターに好きなようにつける。', 'dwarves/fighter-2'),
  t('herbalist', '砂漠の薬師', 'supporter', 'C', '自分のモンスター全員の特殊状態を回復する。その後、自分の山札を1枚引く。', 'dunefolk/herbalist'),
  t('warchief', '族長の号令', 'supporter', 'U', '自分の手札が5枚になるまで、山札を引く。（手札が5枚以上のときは使えない）', 'orcs/ruler'),
  t('mercenary', '傭兵の契約', 'supporter', 'R', 'コインを2回投げる。オモテの数だけ、自分の山札から好きなカードを1枚ずつ選び、相手に見せて手札に加える。そして山札を切る。', 'humans/outlaw'),
  t('thief', '盗賊のすり', 'supporter', 'U', '相手の手札をウラにして2枚ランダムに選び、トラッシュする。', 'humans/thief'),
  t('venom', '毒薬売り', 'supporter', 'C', '相手のバトルモンスターをどくにする。', 'humans/trapper'),
  t('guide', '案内人の笛', 'supporter', 'R', '自分のトラッシュからたねモンスターを2枚まで選び、ベンチに出す。', 'humans/woodsman'),

  // ----------------------------- Items ------------------------------
  t('snare', '捕獲の網', 'item', 'U', 'コインを1回投げオモテなら、相手のバトルモンスターをマヒにする。', 'item', { icon: 'fishing-net' }),
  t('bomb', '爆薬樽', 'item', 'U', '相手のモンスター1匹に、ダメカンを2個のせる。', 'item', { icon: 'barrel' }),
  t('scroll2', '古代の写本', 'item', 'C', '自分の山札を2枚引く。（このカード以外の手札が6枚以上のときは使えない）', 'item', { icon: 'scroll-quill' }),
  t('tonic', '活力のエリクサー', 'item', 'U', '自分のモンスター1匹のHPを「50」回復し、特殊状態をすべて回復する。', 'item', { icon: 'heart-bottle' }),
  t('relay', '継承のたいまつ', 'item', 'U', '自分のバトルモンスターについているエネルギーをすべて、自分のベンチモンスター1匹につけ替える。', 'item', { icon: 'rope-coil' }),
  t('shovel', '発掘のシャベル', 'item', 'C', '自分のトラッシュからトレーナーズを1枚選び、相手に見せて手札に加える。', 'item', { icon: 'trowel' }),
  t('nectar', '甘い蜜', 'item', 'C', '自分のモンスター1匹のHPを「30」回復する。その後、自分の山札を1枚引く。', 'item', { icon: 'honeycomb' }),
  t('ladder', '巣穴の抜け道', 'item', 'C', '自分のバトルモンスターをベンチモンスターと入れ替える。その後、新しいバトルモンスターのHPを「20」回復する。', 'item', { icon: 'ladder' }),

  // ----------------------------- Tools ------------------------------
  t('tower', '鋼の大盾', 'tool', 'U', 'このカードをつけているモンスターが受けるワザのダメージは「-20」される。', 'item', { icon: 'round-shield' }),
  t('fangs', '吸血の牙', 'tool', 'R', 'このカードをつけているバトルモンスターが相手にワザのダメージを与えたとき、そのモンスターのHPを「20」回復する。', 'item', { icon: 'fangs' }),
  t('drum', '戦太鼓', 'tool', 'U', 'このカードをつけているたねモンスターが使うワザの、相手のバトルモンスターへのダメージは「+30」される。', 'item', { icon: 'drum' }),
  t('mailcoat', '鎖かたびら', 'tool', 'U', 'このカードをつけているたねモンスターの最大HPは「+60」される。', 'item', { icon: 'chain-mail' }),

  // ---------------------------- Stadiums ----------------------------
  t('ruins', '古代の遺跡', 'stadium', 'U', 'おたがいの超モンスターが使うワザの、相手のバトルモンスターへのダメージは「+20」される。', 'story/p-temple'),
  t('crypt', '呪われた地下墓地', 'stadium', 'U', 'おたがいの悪モンスターが使うワザの、相手のバトルモンスターへのダメージは「+20」される。', 'story/p-graves'),
  t('peak', '雷鳴の頂', 'stadium', 'U', 'おたがいの雷モンスターが使うワザの、相手のバトルモンスターへのダメージは「+20」される。', 'story/landscape-mountains-05'),
  t('oasis', '砂漠のオアシス', 'stadium', 'U', 'チェックタイムのたび、おたがいのバトルモンスターのHPを「10」回復する。', 'story/landscape-desert'),
  t('mine', 'ドワーフの坑道', 'stadium', 'U', 'おたがいのプレイヤーは、自分の番に1回、自分の手札を1枚トラッシュして、山札を2枚引いてよい。', 'story/blacksmith'),
];
