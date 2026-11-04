// Stadiums added with the 第二章 update. Each one changes how a game is played,
// not just which type hits harder. Ids start at 201 so they never collide with
// the third printing's trainers.
import type { TrainerCard } from '../types';
import { trainerFactory } from './factory';

const t = trainerFactory('AB3', 200);

export const STADIUMS: TrainerCard[] = [
  // 第一章
  t('snowfield', '白銀の雪原', 'stadium', 'U', 'おたがいのバトルモンスターの、にげるためのエネルギーは1個多くなる。また、チェックタイムに、やけどのモンスターにダメカンをのせない。', 'story/p-snowfield', {
    flavor: '吹雪は炎を鎮め、足を止める。',
  }),
  t('greattree', '世界樹のふもと', 'stadium', 'U', 'チェックタイムのたび、おたがいのベンチモンスター全員のHPを、それぞれ「10」回復する。', 'story/p-great-tree', {
    flavor: '傷ついた者は、根元で眠れ。',
  }),
  t('remains', '戦いの跡', 'stadium', 'U', '自分の番に1回、自分のトラッシュから基本エネルギーを1枚選び、相手に見せて手札に加えてよい。', 'story/p-aftermath', {
    flavor: '折れた剣にも、まだ魔力が残っている。',
  }),
  t('statue', '十二の石像', 'stadium', 'R', '残りのサイドの枚数が相手より多いプレイヤーのモンスターが使うワザの、相手のバトルモンスターへのダメージは「+30」される。', 'story/p-statue', {
    flavor: '追い詰められた者にだけ、石像は力を貸す。',
  }),
  // 第二章
  t('shrine', '祈りの社', 'stadium', 'U', 'おたがいのモンスターは、特殊状態にならない。このカードを場に出したとき、おたがいのバトルモンスターの特殊状態をすべて回復する。', 'story/p-shrine', {
    flavor: '鈴の音が、毒も眠りも払っていく。',
  }),
  t('mist', '霧の渓谷', 'stadium', 'U', 'おたがいのベンチモンスターは、相手のワザのダメージを受けない。', 'story/p-river-mist', {
    flavor: '霧の向こうは、狙えない。',
  }),
  t('study', '賢者の書斎', 'stadium', 'U', '自分の番に1回、自分の山札を上から3枚見て、その中から1枚を手札に加えてよい。残りのカードは山札の下にもどす。', 'story/p-study', {
    flavor: '答えは、いつも三冊目にある。',
  }),
  t('hall', '王城の大広間', 'stadium', 'U', 'おたがいの進化モンスター（1進化・2進化）が、相手のモンスターから受けるワザのダメージは「-20」される。', 'story/p-hall', {
    flavor: '鍛えあげた者だけが、この床に立てる。',
  }),
  // 第三章
  t('altar', '禁忌の祭壇', 'stadium', 'R', 'おたがいのモンスターが使うワザの、相手のバトルモンスターへのダメージは「+30」される。ダメージを与えたら、ワザを使ったモンスターにもダメカンを2個のせる。', 'story/grim-altar', {
    flavor: '力を望むなら、血で払え。',
  }),
  t('summoning', '召喚の魔法陣', 'stadium', 'U', '自分の番に1回、自分のトラッシュから基本エネルギーを1枚選び、自分のベンチモンスターにつけてよい。そうしたら、そのモンスターにダメカンを2個のせる。', 'story/p-summoning', {
    flavor: '呼び戻された魔力は、少しだけ熱い。',
  }),
  t('spire', '孤高の見張り塔', 'stadium', 'U', '自分の番に1回、自分の手札が3枚以下なら、山札を2枚引いてよい。', 'story/p-lone-tower', {
    flavor: '塔の上からは、次の一手がよく見える。',
  }),
];
