// 第2弾「覇者の降臨」 trainers
import type { TrainerCard } from '../types';
import { trainerFactory } from './factory';

const t = trainerFactory('AB2');

export const TRAINERS2: TrainerCard[] = [
  // --------------------------- Supporters ---------------------------
  t('rally', '騎士の突撃', 'supporter', 'U', '自分の山札からたねモンスターを2枚まで選び、ベンチに出す。そして山札を切る。', 'humans/cavalier'),
  t('assassin', '暗殺者の刃', 'supporter', 'R', '相手のモンスター1匹に、ダメカンを3個のせる。', 'humans/assassin+female'),
  t('paladin', '聖騎士の加護', 'supporter', 'U', '自分のモンスター全員のHPを、それぞれ「30」回復する。', 'humans/paladin'),

  // ----------------------------- Items ------------------------------
  t('tutor', '賢者の水晶', 'item', 'U', '自分の山札からトレーナーズを1枚選び、相手に見せて手札に加える。そして山札を切る。', 'item', { icon: 'crystal-ball' }),
  t('energyswap', '魔力の転移', 'item', 'U', '自分の場のモンスターについている基本エネルギーを1個選び、自分の別のモンスターにつけ替える。', 'item', { icon: 'energy-arrow' }),
  t('hammer', '砕きの鉄槌', 'item', 'U', 'コインを1回投げオモテなら、相手の場のモンスターについているエネルギーを1個選び、トラッシュする。', 'item', { icon: 'hammer-drop' }),

  // ----------------------------- Tools ------------------------------
  t('crest', '覇者の紋章', 'tool', 'R', 'このカードをつけているΩかEXのモンスターが、相手のモンスターから受けるワザのダメージは「-30」される。', 'item', { icon: 'dragon-shield' }),

  // ---------------------------- Stadiums ----------------------------
  t('harbor', '亡者の港', 'stadium', 'U', 'おたがいの場の、ΩでもEXでもないモンスター全員の最大HPは「+30」される。', 'story/landscape-bridge'),
];
