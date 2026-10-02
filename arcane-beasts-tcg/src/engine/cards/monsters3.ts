// ============================================================================
// 第3弾「辺境の軍勢」 — orc hordes, dwarf clans, the desert folk, the plague of
// the dead and the mercenary companies of the frontier.
// ============================================================================
import type { EType, MonsterCard } from '../types';
import { monsterFactory } from './factory';

const m = monsterFactory('AB3');
const F: EType = 'fire', W: EType = 'water', G: EType = 'grass', L: EType = 'lightning', P: EType = 'psychic', X: EType = 'fighting', D: EType = 'dark', C: EType = 'colorless';

export const MONSTERS3: MonsterCard[] = [
  // ============================== FIRE ==============================
  m('サンスカウト', 'camp/q-scout', F, 'basic', 60, 1, 'C', 'さばくのたみ', [
    { name: 'ひのこ', cost: [F], damage: 10, effects: [{ k: 'condition', cond: 'burned', flip: true }] },
    { name: '熱砂のけり', cost: [F, C], damage: 30 },
  ], { flavor: '灼熱の砂丘を駆ける若き斥候。足跡が残る前に、もう次の丘の上にいる。' }),
  m('サンパスファインダー', 'camp/q-pathfinder', F, 'stage1', 110, 1, 'U', 'さばくのたみ', [
    { name: '陽炎のやり', cost: [F, C], damage: 50 },
    { name: '熱砂の突撃', cost: [F, F, C], damage: 90, effects: [{ k: 'selfDamage', n: 20 }] },
  ], { evolvesFrom: 'サンスカウト', flavor: '砂漠の道なき道を切り開く案内人。彼が通った後には、必ず安全な道ができる。' }),
  m('サンチャンピオン', 'camp/q-champion', F, 'stage2', 190, 2, 'R', 'さばくのたみ', [
    { name: '日輪の斬撃', cost: [F, C], damage: 60 },
    { name: '灼陽の裁き', cost: [F, F, C, C], damage: 150, effects: [{ k: 'discardSelfEnergy', n: 1, type: F }] },
  ], { evolvesFrom: 'サンパスファインダー', flavor: '砂の民の最強の戦士。その剣は、太陽の光をそのまま刃にしたと言われる。' }),
  m('タウロクヴァンガード', 'camp/q-tauroch-vanguard', F, 'basic', 100, 2, 'U', 'タウロク', [
    { name: 'つのでつく', cost: [F, C], damage: 40 },
    { name: 'とっしん', cost: [F, F, C], damage: 80, effects: [{ k: 'selfDamage', n: 10 }] },
  ], { flavor: '砂漠の大牛タウロクの先陣。群れの先頭で、砂煙をまき上げて突き進む。' }),
  m('タウロクフラッグベアラー', 'camp/q-tauroch-flagbearer', F, 'stage1', 150, 2, 'R', 'タウロク', [
    { name: 'はたなぎ', cost: [F, C], damage: 60 },
    { name: '大軍旗の突進', cost: [F, F, C], damage: 100, effects: [{ k: 'bonusPerBench', per: 10, whose: 'self' }], suffix: '+' },
  ], {
    evolvesFrom: 'タウロクヴァンガード',
    ability: { name: '砂陽の軍旗', text: '', spec: { k: 'typeBoost', type: F, n: 10 } },
    flavor: '砂陽の旗を背に負った大牛。旗が揺れるたび、味方の炎が少しだけ強く燃える。',
  }),
  m('ドワーフエクスプローラー', 'dwarves/explorer', F, 'basic', 70, 1, 'C', 'ドワーフ', [
    { name: 'つるはし', cost: [C], damage: 20 },
    { name: 'たいまつ', cost: [F, C], damage: 30, effects: [{ k: 'condition', cond: 'burned', flip: true }] },
  ], { flavor: '火山の洞窟を調べる探検家。腰のたいまつは、帰り道を照らすためのものだ。' }),
  m('ドワーフグレネーダー', 'camp/grenadier', F, 'stage1', 120, 2, 'U', 'ドワーフ', [
    { name: '手投げ弾', cost: [F, C], damage: 50, effects: [{ k: 'spread', n: 10 }] },
    { name: '大爆破', cost: [F, F, C], damage: 110, effects: [{ k: 'selfDamage', n: 30 }] },
  ], { evolvesFrom: 'ドワーフエクスプローラー', flavor: '鋼の筒に火薬を詰めて投げる職人。自分のひげが焦げるのは、勲章だと思っている。' }),
  m('サンシンガー', 'camp/q-sun-singer', F, 'basic', 90, 1, 'U', 'さばくのたみ', [
    { name: 'ひのうた', cost: [F], damage: 20 },
    { name: '日輪のうた', cost: [F, C], damage: 40, effects: [{ k: 'healSelf', n: 20 }] },
  ], {
    ability: { name: '朝焼けの歌', text: '', spec: { k: 'healOnce', n: 30 } },
    flavor: '夜明けとともに歌いはじめる砂の歌い手。その歌声は、傷ついた仲間の火を呼び戻す。',
  }),
  m('サンシルフ', 'camp/q-sun-sylph', F, 'basic', 120, 1, 'R', 'ようせい', [
    { name: 'ほのおのはね', cost: [F, C], damage: 50, effects: [{ k: 'condition', cond: 'burned' }] },
    { name: '陽炎のまい', cost: [F, F, C], damage: 110, effects: [{ k: 'preventNext', flip: true }] },
  ], { flavor: '陽炎のなかに住む精霊。触れようとした手は、いつも空をつかむだけだ。' }),
  m('ローバー', 'dunefolk/rover', F, 'basic', 60, 1, 'C', 'さばくのたみ', [
    { name: 'すなけむり', cost: [C], damage: 10, effects: [{ k: 'condition', cond: 'confused', flip: true }] },
    { name: 'さばくのつるぎ', cost: [F, C], damage: 40 },
  ], { flavor: '砂漠を渡り歩く放浪の剣士。どこの国にも属さず、どこの旗にも従わない。' }),
  m('タウロクプロテクター', 'camp/q-tauroch-protector', F, 'basic', 300, 3, 'RR', 'タウロク', [
    { name: 'ほのおのたて', cost: [F, C], damage: 70, effects: [{ k: 'reduceNext', n: 30 }] },
    { name: '灼熱大地', cost: [F, F, F, C], damage: 230, effects: [{ k: 'discardSelfEnergy', n: 2, type: F }] },
  ], { ex: true, flavor: '砂陽の聖獣を守る大牛の長。その足踏みひとつで、地面が熱を帯びて燃えあがる。' }),
  m('ゴブリンピラー', 'goblins/pillager', F, 'basic', 60, 1, 'C', 'ゴブリン', [
    { name: 'ひつけ', cost: [F], damage: 10, effects: [{ k: 'condition', cond: 'burned', flip: true }] },
    { name: 'たいまつなげ', cost: [F, C], damage: 40 },
  ], { flavor: '火矢と松明が大好きなゴブリンの略奪兵。村が燃えるのを見て、手を叩いて笑う。' }),

  // ============================== WATER =============================
  m('マーフォークファイター', 'merfolk/fighter', W, 'basic', 70, 1, 'C', 'かいじん', [
    { name: 'みずでっぽう', cost: [W], damage: 20 },
    { name: 'やりつき', cost: [W, C], damage: 40 },
  ], { flavor: '浅瀬の見張りを務める半魚人の兵。泳ぎながらの突きは、陸の騎士より速い。' }),
  m('マーフォークホプライト', 'merfolk/hoplite', W, 'stage1', 120, 2, 'U', 'かいじん', [
    { name: '盾づき', cost: [W, C], damage: 50 },
    { name: '大盾の波', cost: [W, W, C], damage: 90, effects: [{ k: 'reduceNext', n: 20 }] },
  ], { evolvesFrom: 'マーフォークファイター', flavor: '大盾と長槍を構えた重装の兵。隊列を組めば、津波すら受けとめる。' }),
  m('マーフォークブローラー', 'merfolk/brawler', W, 'stage2', 180, 2, 'R', 'かいじん', [
    { name: '渦巻きパンチ', cost: [W, C], damage: 60 },
    { name: '大海嘯', cost: [W, W, C, C], damage: 140, effects: [{ k: 'oppCantRetreat' }] },
  ], { evolvesFrom: 'マーフォークホプライト', flavor: '海の荒くれ者。素手で船板を割り、そのまま相手を海へ放り込む。' }),
  m('ナーガダークファング', 'nagas/dirkfang', W, 'basic', 60, 1, 'C', 'ナーガ', [
    { name: 'かみつく', cost: [W], damage: 20 },
    { name: 'どくきば', cost: [W, C], damage: 30, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { flavor: '二本の短剣のような牙をもつ小さなナーガ。一度かまれると、毒が全身に回る。' }),
  m('ナーガメイスウォリアー', 'nagas/naga-mace_warrior1', W, 'stage1', 120, 2, 'U', 'ナーガ', [
    { name: 'メイスなげ', cost: [W, C], damage: 50 },
    { name: '深海の連撃', cost: [W, W, C], damage: 90, effects: [{ k: 'flipBonus', bonus: 30 }], suffix: '+' },
  ], { evolvesFrom: 'ナーガダークファング', flavor: '棘付きの鎚を振るうナーガの戦士。尾で体を支え、海面すれすれを滑るように進む。' }),
  m('ナーガウォーロード', 'nagas/naga-mace_warrior3', W, 'stage2', 310, 3, 'RR', 'ナーガ', [
    { name: '潮鳴りの号令', cost: [W], effects: [{ k: 'searchEnergyAttach', n: 1, type: W, from: 'discard', to: 'any' }] },
    { name: '海嘯の大鎚', cost: [W, W, C, C], damage: 200, effects: [{ k: 'discardSelfEnergy', n: 1, type: W }] },
  ], { evolvesFrom: 'ナーガメイスウォリアー', ex: true, flavor: '海底軍団を率いる覇王。振り下ろす大鎚は、海そのものを割る。' }),
  m('マーフォークネットキャスター', 'merfolk/netcaster', W, 'basic', 90, 1, 'U', 'かいじん', [
    { name: 'あみなげ', cost: [W], damage: 20, effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    { name: 'からめとる', cost: [W, C], damage: 40, effects: [{ k: 'oppCantRetreat' }] },
  ], { flavor: '大きな投網で獲物を絡め取る漁師。網に捕まったものは、海でも陸でも逃げられない。' }),
  m('マーフォークスピアマン', 'merfolk/spearman', W, 'basic', 60, 1, 'C', 'かいじん', [
    { name: 'つっつく', cost: [W], damage: 20 },
    { name: 'ふかづき', cost: [W, C], damage: 40 },
  ], { flavor: '長い銛で魚を突く若者。腕前をみがいて、いつか海の王の槍持ちになりたい。' }),
  m('マーフォークハンター', 'merfolk/hunter', W, 'basic', 100, 1, 'U', 'かいじん', [
    { name: 'もりうち', cost: [W, C], damage: 50 },
    { name: '深海狩り', cost: [W, W, C], damage: 70, effects: [{ k: 'anySnipe', n: 30 }] },
  ], { flavor: '大型の海獣を追う狩人。矢は水の中でもまっすぐ飛び、狙った獲物を決して外さない。' }),
  m('ミズイニシエイト', 'merfolk/initiate-2', W, 'basic', 50, 1, 'C', 'かいじん', [
    { name: 'しおかぜ', cost: [W], damage: 10 },
    { name: 'いやしのしずく', cost: [W, C], damage: 20, effects: [{ k: 'healSelf', n: 30 }] },
  ], { flavor: '海の巫女に仕える見習い。唱える水の祈りで、傷をそっと洗い流す。' }),
  m('カヌー', 'transport/canoe', W, 'basic', 50, 1, 'C', 'ふね', [
    { name: 'たいあたり', cost: [W], damage: 20 },
    { name: 'かわくだり', cost: [W, C], damage: 40, effects: [{ k: 'switchSelf' }] },
  ], { flavor: '小さな丸木舟。川の流れに乗って、いつのまにか戦場の向こうへ行ってしまう。' }),
  m('ガレオン', 'transport/crew-galleon', W, 'basic', 150, 3, 'R', 'ふね', [
    { name: 'ほうげき', cost: [W, C], damage: 50, effects: [{ k: 'spread', n: 10 }] },
    { name: '一斉射撃', cost: [W, W, C], damage: 110, effects: [{ k: 'benchSnipe', n: 20 }] },
  ], { flavor: '何十もの大砲を積んだ大型帆船。一度に放つ砲火は、海岸線の形を変える。' }),

  // ============================== GRASS =============================
  m('エルフスカウト', 'elves/scout', G, 'basic', 60, 1, 'C', 'エルフ', [
    { name: 'つるなげ', cost: [G], damage: 10, effects: [{ k: 'condition', cond: 'confused', flip: true }] },
    { name: 'すばやいやり', cost: [G, C], damage: 30 },
  ], { flavor: '森の道を先回りして知らせる斥候。木々のあいだを、風のように抜ける。' }),
  m('エルフレンジャー', 'elves/ranger', G, 'stage1', 110, 1, 'U', 'エルフ', [
    { name: 'ささやきの矢', cost: [G, C], damage: 50 },
    { name: '森がくれの連射', cost: [G, G, C], damage: 90, effects: [{ k: 'flipBonus', bonus: 30 }], suffix: '+' },
  ], { evolvesFrom: 'エルフスカウト', flavor: '森と一体になる狩人。矢が放たれたあとも、どこにいるのか見つけられない。' }),
  m('エルフキャプテン', 'elves/captain', G, 'stage2', 180, 2, 'R', 'エルフ', [
    { name: '号令', cost: [G], effects: [{ k: 'callForFamily', n: 1, name: 'エルフ' }] },
    { name: '森の一斉射', cost: [G, G, C], damage: 80, effects: [{ k: 'bonusPerBench', per: 20, whose: 'self', nameIncludes: 'エルフ' }], suffix: '+' },
  ], { evolvesFrom: 'エルフレンジャー', flavor: '森の守備隊を率いる隊長。号令ひとつで、枝のかげから無数の弓が現れる。' }),
  m('エルフアーチャー', 'elves/archer', G, 'basic', 60, 1, 'C', 'エルフ', [
    { name: 'つるのいと', cost: [G], damage: 10 },
    { name: 'ねらいうち', cost: [G, C], damage: 40 },
  ], { flavor: '弓の名手を目指す若いエルフ。毎朝、木の葉を一枚ずつ射抜くのが日課。' }),
  m('エルフマークスマン', 'elves/marksman', G, 'stage1', 110, 1, 'U', 'エルフ', [
    { name: 'いぬく', cost: [G, C], damage: 50 },
    { name: '星影の矢', cost: [G, G, C], damage: 70, effects: [{ k: 'anySnipe', n: 40 }] },
  ], { evolvesFrom: 'エルフアーチャー', flavor: '夜空の星すら射落とす腕前。その矢は、雲のうしろの的さえも貫く。' }),
  m('エルフィンアーチャー', 'elves/archer+female', G, 'basic', 60, 1, 'C', 'エルフ', [
    { name: 'はなびら', cost: [G], damage: 20 },
    { name: 'ふたつの矢', cost: [G, C], damage: 20, effects: [{ k: 'flipMulti', flips: 2, per: 30 }], suffix: '×' },
  ], { flavor: '花びらをまとわせた矢を放つ射手。一度に二本、狙いを違えず放つのが得意。' }),
  m('エルフィンスナイパー', 'elves/marksman+female', G, 'stage1', 110, 1, 'U', 'エルフ', [
    { name: 'みきりの矢', cost: [G, C], damage: 50 },
    { name: 'ひとすじの光', cost: [G, G, C], damage: 100, effects: [{ k: 'bonusIfOppDamaged', bonus: 30 }], suffix: '+' },
  ], { evolvesFrom: 'エルフィンアーチャー', flavor: '遠くから一本だけ放つ狙撃手。「外したことはない」と、本人は微笑む。' }),
  m('エルフファイター', 'elves/fighter', G, 'basic', 70, 1, 'C', 'エルフ', [
    { name: 'けんのまい', cost: [G], damage: 20 },
    { name: 'つるぎはらい', cost: [G, C], damage: 40 },
  ], { flavor: '剣と弓を持ち替えて戦う、器用なエルフの戦士。どちらも自分の手のようだ。' }),
  m('エルフヒーロー', 'elves/hero', G, 'stage1', 160, 2, 'R', 'エルフ', [
    { name: '英雄の一閃', cost: [G, C], damage: 60 },
    { name: '緑の大旋風', cost: [G, G, C], damage: 110, effects: [{ k: 'healSelf', n: 30 }] },
  ], { evolvesFrom: 'エルフファイター', flavor: '森を救ったと語り継がれる英雄。その剣は、風を斬ってから斬られる者に気づかれる。' }),
  m('エルフレディ', 'elves/lady', G, 'basic', 90, 1, 'U', 'エルフ', [
    { name: 'みどりのいぶき', cost: [G], damage: 20 },
    { name: '森のめぐみ', cost: [G, C], damage: 40, effects: [{ k: 'healAllSelf', n: 10 }] },
  ], {
    ability: { name: '癒しの祈り', text: '', spec: { k: 'healOnce', n: 30 } },
    flavor: '森の貴婦人。彼女が歩いたあとには、しおれた草花が顔を上げる。',
  }),
  m('エルフロード', 'elves/lord', G, 'basic', 130, 2, 'R', 'エルフ', [
    { name: 'かがやく剣', cost: [G, C], damage: 50 },
    { name: '森の王の怒り', cost: [G, G, C], damage: 100, effects: [{ k: 'bonusPerEnergy', per: 10, on: 'self' }], suffix: '+' },
  ], { flavor: '古い森を治める貴族。静かな声で話すが、その怒りは枝葉を一斉に震わせる。' }),
  m('エルフハイロード', 'elves/high-lord', G, 'stage1', 300, 3, 'RR', 'エルフ', [
    { name: '大樹の加護', cost: [G, C], damage: 70, effects: [{ k: 'healAllSelf', n: 20 }] },
    { name: '太古の森の裁き', cost: [G, G, G, C], damage: 220 },
  ], { evolvesFrom: 'エルフロード', ex: true, flavor: 'すべてのエルフの頂点に立つ王。その一声で、大森林が軍勢となって動き出す。' }),

  // ============================ LIGHTNING ===========================
  m('サンダーアーチャー', 'camp/q-archer', L, 'basic', 60, 1, 'C', 'さばくのたみ', [
    { name: 'しびれ矢', cost: [L], damage: 10, effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    { name: 'いかずちの矢', cost: [L, C], damage: 40 },
  ], { flavor: '矢じりに雷石をつけた砂漠の射手。放たれた矢は、飛びながらパチパチと音を立てる。' }),
  m('サンダーマークスマン', 'camp/q-marksman', L, 'stage1', 110, 1, 'U', 'さばくのたみ', [
    { name: 'らいめいの矢', cost: [L, C], damage: 50 },
    { name: '稲妻の連射', cost: [L, L, C], damage: 90, effects: [{ k: 'flipBonus', bonus: 30 }], suffix: '+' },
  ], { evolvesFrom: 'サンダーアーチャー', flavor: '砂嵐の中でも的を外さない達人。雷の予兆を、矢じりの震えで感じとる。' }),
  m('サンダーレンジャー', 'camp/q-ranger', L, 'stage2', 170, 1, 'R', 'さばくのたみ', [
    { name: '雷鳴の追い矢', cost: [L, C], damage: 60, effects: [{ k: 'benchSnipe', n: 20 }] },
    { name: '天雷の一矢', cost: [L, L, C], damage: 130, effects: [{ k: 'bonusIfOppCondition', cond: 'paralyzed', bonus: 40 }], suffix: '+' },
  ], { evolvesFrom: 'サンダーマークスマン', flavor: '雷雲を従える砂漠の狩人の長。彼の矢は、空から降る雷と同じ速さで落ちる。' }),
  m('ファルコナー', 'dunefolk/falconer', L, 'basic', 60, 1, 'C', 'さばくのたみ', [
    { name: 'はやぶさ', cost: [L], damage: 20 },
    { name: 'ちょうくうの爪', cost: [L, C], damage: 40 },
  ], { flavor: '相棒の鷹と砂漠の空を見張る鷹匠。鷹の鳴き声ひとつで、ふたりは動きを合わせる。' }),
  m('アウトライダー', 'camp/q-outrider', L, 'stage1', 110, 1, 'U', 'さばくのたみ', [
    { name: 'かけぬけ', cost: [L, C], damage: 40, effects: [{ k: 'switchSelf' }] },
    { name: '雷速の突撃', cost: [L, L, C], damage: 90 },
  ], { evolvesFrom: 'ファルコナー', flavor: '鷹の背に乗って偵察する騎手。上空から見つけた獲物へ、急降下で襲いかかる。' }),
  m('ドワーフサンダラー', 'dwarves/thunderer', L, 'basic', 70, 1, 'C', 'ドワーフ', [
    { name: 'ライフルうち', cost: [L], damage: 20 },
    { name: 'かみなり弾', cost: [L, C], damage: 40 },
  ], { flavor: '長い銃を肩にのせて歩くドワーフの銃士。弾は雷石の粉を詰めた特別製。' }),
  m('ドラゴンガード', 'dwarves/dragonguard', L, 'stage1', 300, 3, 'RR', 'ドワーフ', [
    { name: '竜殺しの槍', cost: [L, C], damage: 70, effects: [{ k: 'bonusIfOmega', bonus: 50 }], suffix: '+' },
    { name: '雷槍の大投擲', cost: [L, L, L, C], damage: 220, effects: [{ k: 'discardSelfEnergy', n: 1 }] },
  ], { evolvesFrom: 'ドワーフサンダラー', ex: true, flavor: '竜を倒すために鍛えられたドワーフの精鋭。雷光をまとった槍で、巨竜の鱗を貫く。' }),
  m('フランカー', 'camp/q-flanker', L, 'basic', 60, 1, 'C', 'さばくのたみ', [
    { name: 'すりぬけ', cost: [L], damage: 10 },
    { name: 'うしろから', cost: [L, C], damage: 40, effects: [{ k: 'bonusIfOppDamaged', bonus: 20 }], suffix: '+' },
  ], { flavor: '敵の側面にまわりこむのが得意な軽装の戦士。気づいたときには、もう背後にいる。' }),
  m('サンファイター', 'camp/q-fighter', L, 'basic', 70, 1, 'C', 'さばくのたみ', [
    { name: 'つるぎうち', cost: [L], damage: 20 },
    { name: '砂雷のまい', cost: [L, C], damage: 40 },
  ], { flavor: '二刀を舞うように操る砂の戦士。刀の刃が触れあうたびに火花が散る。' }),
  m('サンウォリアー', 'camp/q-warrior', L, 'basic', 100, 2, 'U', 'さばくのたみ', [
    { name: '重なぐり', cost: [L, C], damage: 50 },
    { name: '雷鳴の盾', cost: [L, L, C], damage: 70, effects: [{ k: 'reduceNext', n: 30 }] },
  ], { flavor: '大盾と鎚をもつ砂の重戦士。雷雲を背にして立てば、誰も彼を動かせない。' }),
  m('シャイド', 'camp/q-shyde', L, 'basic', 120, 1, 'R', 'ようじゅつし', [
    { name: 'しびれのかぜ', cost: [L, C], damage: 40, effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    { name: 'いかずちの嵐', cost: [L, L, C], damage: 100, effects: [{ k: 'spread', n: 20 }] },
  ], { flavor: '雷雲を呼びよせる砂の妖術師。彼女が杖を高く掲げると、空から稲妻がしたたり落ちる。' }),
  m('ミスリルメイジ', 'humans/mage-silver', L, 'basic', 90, 1, 'U', 'ひと', [
    { name: 'ビリビリ', cost: [L], damage: 20 },
    { name: '銀雷の杖', cost: [L, C], damage: 50, effects: [{ k: 'bonusPerTrash', per: 10, of: 'energy', max: 40 }], suffix: '+' },
  ], { flavor: '銀の杖で雷の魔法を操る魔導士。杖の先端が帯電するたび、髪がふわりと逆立つ。' }),

  // ============================== PSYCHIC ===========================
  m('ミスティック', 'camp/q-mystic', P, 'basic', 60, 1, 'C', 'さばくのたみ', [
    { name: 'まどわし', cost: [P], damage: 10, effects: [{ k: 'condition', cond: 'confused', flip: true }] },
    { name: 'ねんりき', cost: [P, C], damage: 30 },
  ], { flavor: '砂漠の神秘を学ぶ見習い。ささやく言葉は、風に乗って旅人の耳に届く。' }),
  m('サンシャーマン', 'camp/q-shaman', P, 'stage1', 110, 1, 'U', 'さばくのたみ', [
    { name: 'まぼろしの炎', cost: [P, C], damage: 50 },
    { name: '星読みの託宣', cost: [P, P, C], damage: 80, effects: [{ k: 'draw', n: 1 }] },
  ], { evolvesFrom: 'ミスティック', flavor: '星の動きから未来を読む祈祷師。その予言ははずれたことがない、と言われる。' }),
  m('アークウィッチ', 'humans/mage-arch+female', P, 'stage2', 320, 2, 'RR', 'ひと', [
    { name: '星天の導き', cost: [P], effects: [{ k: 'draw', n: 2 }] },
    { name: '大魔導の閃光', cost: [P, P, C, C], damage: 200, effects: [{ k: 'discardOppHand', n: 1 }] },
  ], { evolvesFrom: 'サンシャーマン', ex: true, flavor: '大陸一とうたわれる魔女。杖をひと振りすれば、星の軌道さえ変わる。' }),
  m('みならいメイジ', 'humans/mage', P, 'basic', 60, 1, 'C', 'ひと', [
    { name: 'まほうのたま', cost: [P], damage: 20 },
    { name: 'ゆらめき', cost: [P, C], damage: 30, effects: [{ k: 'draw', n: 1 }] },
  ], { flavor: '魔導士の学院に入ったばかりの少年。魔法の失敗は多いけれど、勉強熱心。' }),
  m('ライトメイジ', 'humans/mage-light+female', P, 'stage1', 110, 1, 'U', 'ひと', [
    { name: 'ひかりのたま', cost: [P, C], damage: 50 },
    { name: 'まばゆい光', cost: [P, P, C], damage: 80, effects: [{ k: 'condition', cond: 'asleep', flip: true }] },
  ], { evolvesFrom: 'みならいメイジ', flavor: '光の魔法を得意とする魔導士。まぶしい光は、敵を眠りへ誘う。' }),
  m('ホワイトメイジ', 'humans/mage-white', P, 'basic', 90, 1, 'U', 'ひと', [
    { name: 'しろいひかり', cost: [P], damage: 20 },
    { name: 'せいなる祈り', cost: [P, C], damage: 30, effects: [{ k: 'healAllSelf', n: 10 }] },
  ], {
    ability: { name: '白魔法', text: '', spec: { k: 'healOnce', n: 30 } },
    flavor: '傷をいやす白魔法の使い手。戦場では敵味方どちらの傷も、放っておけない。',
  }),
  m('ルーンマスター', 'dwarves/runemaster', P, 'basic', 100, 1, 'U', 'ドワーフ', [
    { name: 'ルーンうち', cost: [P], damage: 30 },
    { name: '古代文字の爆発', cost: [P, C], damage: 50, effects: [{ k: 'bonusPerEnergy', per: 20, on: 'opp' }], suffix: '+' },
  ], { flavor: '古い文字を岩に刻むドワーフの魔術師。刻まれた文字は、石の中で静かに脈打つ。' }),
  m('サンハーバリスト', 'dunefolk/herbalist', P, 'basic', 50, 1, 'C', 'さばくのたみ', [
    { name: 'くすりをまく', cost: [P], damage: 10 },
    { name: 'ふしぎな薬', cost: [P, C], damage: 20, effects: [{ k: 'healSelf', n: 30 }] },
  ], { flavor: '砂漠の薬草を煎じる薬師。傷にも毒にも、まず一杯の薬草茶を勧めてくる。' }),
  m('シュナルアデプト', 'camp/shynal-adept', P, 'basic', 60, 1, 'C', 'ひと', [
    { name: 'のろい', cost: [P], damage: 10 },
    { name: 'まどろみの粉', cost: [P, C], damage: 20, effects: [{ k: 'condition', cond: 'asleep', flip: true }] },
  ], { flavor: '夢のなかを歩く若い魔法使い。魔法の粉を撒くと、周りの者があくびをはじめる。' }),
  m('オークシャーマン', 'camp/orcish-shaman', P, 'basic', 90, 1, 'U', 'オーク', [
    { name: 'まじない', cost: [P], damage: 20 },
    { name: '呪術の太鼓', cost: [P, C], damage: 40, effects: [{ k: 'discardOppHand', n: 1 }] },
  ], { flavor: 'オークの呪術師。太鼓の音を聞いた者は、手に持っていたものを落としてしまう。' }),
  m('サンドルイド', 'camp/q-druid', P, 'basic', 100, 1, 'U', 'さばくのたみ', [
    { name: 'すなのささやき', cost: [P], damage: 20 },
    { name: '大地の呼び声', cost: [P, C], damage: 50, effects: [{ k: 'callForFamily', n: 1 }] },
  ], { flavor: '砂漠の獣と語りあう占い師。呼べば、岩かげから仲間がのそのそ現れる。' }),
  m('サイキックメイジ', 'humans/mage-silver+female', P, 'basic', 230, 2, 'RR', 'ひと', [
    { name: '念の波動', cost: [P, C], damage: 50, effects: [{ k: 'bonusPerHand', per: 10, whose: 'opp', max: 50 }], suffix: '+' },
    { name: '精神崩壊', cost: [P, P, C, C], damage: 200, effects: [{ k: 'condition', cond: 'confused' }] },
  ], { omega: true, flavor: '心の奥底を読みとる銀の魔女。彼女に見られた者は、自分の記憶すらあやしくなる。' }),

  // ============================== FIGHTING ==========================
  m('グランティ', 'orcs/grunt', X, 'basic', 70, 1, 'C', 'オーク', [
    { name: 'なぐる', cost: [X], damage: 20 },
    { name: 'こんぼう', cost: [X, C], damage: 40 },
  ], { flavor: 'オークの軍団の下っぱ兵。数だけは多く、どこへ行ってもひとりでは終わらない。' }),
  m('グラントウォリアー', 'orcs/warrior', X, 'stage1', 120, 2, 'U', 'オーク', [
    { name: 'おのなぎ', cost: [X, C], damage: 50 },
    { name: '鉄の突進', cost: [X, X, C], damage: 90, effects: [{ k: 'selfDamage', n: 20 }] },
  ], { evolvesFrom: 'グランティ', flavor: '戦いの中で鍛えられたオークの戦士。傷の数だけ、斧が重くなっていく。' }),
  m('オークスレイヤー', 'orcs/slayer', X, 'stage2', 180, 2, 'R', 'オーク', [
    { name: '二刀はやぎり', cost: [X, C], damage: 60 },
    { name: '血染めの連斬', cost: [X, X, C], damage: 100, effects: [{ k: 'bonusIfOppDamaged', bonus: 50 }], suffix: '+' },
  ], { evolvesFrom: 'グラントウォリアー', flavor: '二本の刃で敵を切り裂く精鋭。先に血を流した者が、かならず先に倒れる。' }),
  m('オークソブリン', 'orcs/sovereign', X, 'stage1', 310, 3, 'RR', 'オーク', [
    { name: '軍勢の咆哮', cost: [X], effects: [{ k: 'callForFamily', n: 2, name: 'オーク' }] },
    { name: '覇王の大戦斧', cost: [X, X, C, C], damage: 130, effects: [{ k: 'bonusPerBench', per: 30, whose: 'self', nameIncludes: 'オーク' }], suffix: '+' },
  ], { evolvesFrom: 'グランティ', ex: true, flavor: '全オークを従える大王。その咆哮が響けば、山のような軍勢が地平線を埋めつくす。' }),
  m('オークアーチャー', 'orcs/archer', X, 'basic', 60, 1, 'C', 'オーク', [
    { name: 'ゆみびき', cost: [X], damage: 20 },
    { name: 'どくや', cost: [X, C], damage: 30, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { flavor: '粗末な弓で毒矢を放つオーク。腕前は荒いが、数が多いので油断できない。' }),
  m('オーククロスボウ', 'orcs/crossbowman', X, 'stage1', 110, 1, 'U', 'オーク', [
    { name: 'ボルト', cost: [X, C], damage: 50 },
    { name: 'ゆみいち斉射', cost: [X, X, C], damage: 70, effects: [{ k: 'spread', n: 20 }] },
  ], { evolvesFrom: 'オークアーチャー', flavor: '重いクロスボウを担ぐオークの射手。装填に時間はかかるが、一発の威力は鉄の盾をも抜く。' }),
  m('オークアサシン', 'orcs/assassin', X, 'basic', 90, 1, 'U', 'オーク', [
    { name: 'ふいうち', cost: [X], damage: 20, effects: [{ k: 'bonusIfOppDamaged', bonus: 20 }], suffix: '+' },
    { name: 'あんさつ', cost: [X, C], damage: 40, effects: [{ k: 'benchSnipe', n: 20 }] },
  ], { flavor: '影のように忍び寄るオークの暗殺者。標的が気づいたころには、もう首筋に刃がある。' }),
  m('オークバーサーカー', 'orcs/grunt-3', X, 'basic', 100, 2, 'U', 'オーク', [
    { name: 'あばれる', cost: [X, C], damage: 40 },
    { name: '怒りの猛打', cost: [X, X, C], damage: 60, effects: [{ k: 'bonusPerSelfDamage', per: 10 }], suffix: '+' },
  ], { flavor: '怒りで我を忘れたオーク。傷つけば傷つくほど、拳は重く、足は速くなる。' }),
  m('ドワーフファイター', 'dwarves/fighter', X, 'basic', 70, 1, 'C', 'ドワーフ', [
    { name: 'ハンマー', cost: [X], damage: 20 },
    { name: 'おのうち', cost: [X, C], damage: 40 },
  ], { flavor: '鉱山のドワーフ戦士。肩からぶら下げた斧は、鉱石も敵も、同じ力で砕く。' }),
  m('ドワーフバーサーカー', 'dwarves/ulfserker', X, 'stage1', 110, 1, 'U', 'ドワーフ', [
    { name: 'ウルフの雄たけび', cost: [X, C], damage: 50 },
    { name: '捨て身の連撃', cost: [X, X, C], damage: 100, effects: [{ k: 'selfDamage', n: 30 }] },
  ], { evolvesFrom: 'ドワーフファイター', flavor: '己の命を顧みずに突っ込む狂戦士。「後ろは任せた」の一言だけを残して。' }),
  m('ドワーフガード', 'dwarves/guard', X, 'basic', 80, 2, 'C', 'ドワーフ', [
    { name: 'たてたたき', cost: [X], damage: 20 },
    { name: 'どっしり', cost: [X, C], damage: 30, effects: [{ k: 'reduceNext', n: 20 }] },
  ], { flavor: '大きな鉄の盾を持つ坑道の守り手。重たすぎて走れないが、そのぶん倒れない。' }),
  m('ドワーフセンチネル', 'dwarves/sentinel', X, 'stage1', 130, 2, 'U', 'ドワーフ', [
    { name: '鉄壁のやり', cost: [X, C], damage: 50 },
    { name: '岩盤のかまえ', cost: [X, X, C], damage: 70, effects: [{ k: 'preventNext', flip: true }] },
  ], {
    evolvesFrom: 'ドワーフガード',
    ability: { name: '鉄壁', text: '', spec: { k: 'damageReduce', n: 10 } },
    flavor: '城門の前に立ちふさがる鉄の歩哨。何があっても、決して一歩も引かない。',
  }),
  m('ドワーフロード', 'dwarves/lord', X, 'basic', 240, 3, 'RR', 'ドワーフ', [
    { name: '族長のハンマー', cost: [X, C], damage: 70 },
    { name: '山割りの鉄槌', cost: [X, X, X, C], damage: 210, effects: [{ k: 'discardOppEnergy', n: 1 }] },
  ], { omega: true, flavor: '山脈を治めるドワーフ一族の長。戦槌を地面に打ちつけると、地鳴りがやまない。' }),

  // ================================ DARK ============================
  m('ゾンビドワーフ', 'undead/zombie-dwarf', D, 'basic', 70, 2, 'C', 'ゾンビ', [
    { name: 'のしかかる', cost: [D], damage: 20 },
    { name: 'くさったつるはし', cost: [D, C], damage: 40 },
  ], { flavor: '坑道で息絶えたドワーフのなれのはて。それでも手は、つるはしを探して動きつづける。' }),
  m('ゾンビトロル', 'undead/zombie-troll', D, 'stage1', 130, 3, 'U', 'ゾンビ', [
    { name: 'どしゃくずれ', cost: [D, C], damage: 50 },
    { name: 'ゾンビの怒り', cost: [D, D, C], damage: 90, effects: [{ k: 'healSelf', n: 20 }] },
  ], { evolvesFrom: 'ゾンビドワーフ', flavor: '体が大きすぎて、死んだことにも気づいていないトロルの亡骸。' }),
  m('ドラウグロード', 'undead/draug-2', D, 'stage2', 310, 3, 'RR', 'ししゃ', [
    { name: '死者の行進', cost: [D], effects: [{ k: 'searchEnergyAttach', n: 2, type: D, from: 'discard', to: 'any' }] },
    { name: '亡者の大鎌', cost: [D, D, C, C], damage: 200, effects: [{ k: 'bonusPerDiscardMonster', per: 10, max: 60 }], suffix: '+' },
  ], { evolvesFrom: 'ゾンビトロル', ex: true, flavor: '骨と闇でできた亡者の覇王。振り下ろされる大鎌は、生者の魂だけを刈る。' }),
  m('ゴブリンスピアマン', 'goblins/spearman', D, 'basic', 60, 1, 'C', 'ゴブリン', [
    { name: 'やりつき', cost: [D], damage: 20 },
    { name: 'まとめて突撃', cost: [D, C], damage: 30, effects: [{ k: 'bonusPerBench', per: 10, whose: 'self', nameIncludes: 'ゴブリン' }], suffix: '+' },
  ], { flavor: '数にものを言わせるゴブリンの槍兵。「わーっ」と叫びながら、全員で一度に突っ込む。' }),
  m('ゴブリンインペイラー', 'goblins/impaler', D, 'stage1', 110, 1, 'U', 'ゴブリン', [
    { name: '串刺し', cost: [D, C], damage: 50 },
    { name: 'どく針の雨', cost: [D, D, C], damage: 60, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { evolvesFrom: 'ゴブリンスピアマン', flavor: '長い串で敵をつらぬく槍投げの名手。投げた槍は、拾うのが面倒だと言って放置する。' }),
  m('ゴブリンラウザー', 'goblins/rouser', D, 'stage2', 170, 1, 'R', 'ゴブリン', [
    { name: 'おおさわぎ', cost: [D], effects: [{ k: 'callForFamily', n: 1, name: 'ゴブリン' }] },
    { name: 'ゴブリン大行進', cost: [D, D, C], damage: 80, effects: [{ k: 'bonusPerBench', per: 30, whose: 'self', nameIncludes: 'ゴブリン' }], suffix: '+' },
  ], { evolvesFrom: 'ゴブリンインペイラー', flavor: '仲間をたきつけて大軍にするゴブリンの扇動者。声の大きさだけは、群を抜いている。' }),
  m('ゾンビラット', 'undead/zombie-rat', D, 'basic', 50, 1, 'C', 'ゾンビ', [
    { name: 'かじる', cost: [D], damage: 20 },
    { name: 'やみのやまい', cost: [D, C], damage: 20, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { flavor: '墓地を走りまわるネズミの亡骸。かまれた者には、ひどい熱がでる。' }),
  m('ゾンビバット', 'undead/zombie-bat', D, 'basic', 60, 1, 'C', 'ゾンビ', [
    { name: 'つばさうち', cost: [D], damage: 20 },
    { name: 'ちをすう', cost: [D, C], damage: 30, effects: [{ k: 'healSelf', n: 30 }] },
  ], { flavor: '羽がちぎれても飛びつづけるコウモリ。飛び方は不格好だが、血を吸う力は健在だ。' }),
  m('ゾンビボア', 'undead/zombie-boar', D, 'basic', 100, 2, 'U', 'ゾンビ', [
    { name: 'つのでつく', cost: [D, C], damage: 40 },
    { name: 'くさったとっしん', cost: [D, D, C], damage: 80, effects: [{ k: 'selfDamage', n: 20 }] },
  ], { flavor: '森から迷い出た猪の亡骸。痛みを感じないので、壁にぶつかっても止まらない。' }),
  m('ゾンビスパイダー', 'undead/zombie-spider', D, 'basic', 90, 1, 'U', 'ゾンビ', [
    { name: 'くものす', cost: [D], damage: 20, effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    { name: 'どくのいと', cost: [D, C], damage: 40, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { flavor: '死んでも糸を吐きつづける大蜘蛛。巣の中には、古い骨だけがぶら下がっている。' }),
  m('ゾンビスコーピオン', 'undead/zombie-scorpion', D, 'basic', 90, 2, 'U', 'ゾンビ', [
    { name: 'はさむ', cost: [D, C], damage: 40 },
    { name: 'ししのどく', cost: [D, D, C], damage: 60, effects: [{ k: 'condition', cond: 'poisoned' }, { k: 'discardOppHand', n: 1 }] },
  ], { flavor: '砂の下から甦ったサソリ。尻尾の毒は、乾ききっているのにまだ生きている。' }),
  m('ダークアデプト', 'humans/dark-adept', D, 'basic', 90, 1, 'U', 'ひと', [
    { name: 'やみのたま', cost: [D], damage: 20 },
    { name: 'まじょのささやき', cost: [D, C], damage: 40, effects: [{ k: 'millOpp', n: 2 }] },
  ], { flavor: '闇の魔法に魅入られた学徒。口もとだけが笑っていて、目は決して笑わない。' }),
  m('スケルトンライダー', 'undead/skeletal_rider', D, 'basic', 140, 2, 'R', 'ししゃ', [
    { name: 'ほねのやり', cost: [D, C], damage: 50 },
    { name: '亡者の騎行', cost: [D, D, C], damage: 110, effects: [{ k: 'bonusPerTrash', per: 10, of: 'trainer', max: 40 }], suffix: '+' },
  ], { flavor: '骨の馬にまたがる亡者の騎士。夜の街道に、ひづめの音だけが響く。' }),

  // ============================ COLORLESS ===========================
  m('ヒュームスピアマン', 'humans/spearman', C, 'basic', 60, 1, 'C', 'ひと', [
    { name: 'つく', cost: [C], damage: 20 },
    { name: 'たいれつ突き', cost: [C, C], damage: 30, effects: [{ k: 'bonusPerBench', per: 10, whose: 'self' }], suffix: '+' },
  ], { flavor: '王国軍の槍兵。陣形を組んで戦うとき、はじめて本当の力を出す。' }),
  m('ヒュームパイクマン', 'humans/pikeman', C, 'stage1', 110, 2, 'U', 'ひと', [
    { name: 'ながやり', cost: [C, C], damage: 50 },
    { name: '槍ぶすま', cost: [C, C, C], damage: 80, effects: [{ k: 'reduceNext', n: 20 }] },
  ], { evolvesFrom: 'ヒュームスピアマン', flavor: '長槍の列で騎馬を食い止める熟練兵。槍が壁になれば、誰も近づけない。' }),
  m('ハルバードナイト', 'humans/halberdier', C, 'stage2', 160, 2, 'R', 'ひと', [
    { name: 'ハルバード', cost: [C, C], damage: 60 },
    { name: '三日月の斬撃', cost: [C, C, C], damage: 110, effects: [{ k: 'benchSnipe', n: 30 }] },
  ], { evolvesFrom: 'ヒュームパイクマン', flavor: '斧と槍をあわせた長柄の武器を振るう騎士。一振りで、前列を一掃する。' }),
  m('ヒュームソードマン', 'humans/swordsman', C, 'basic', 70, 1, 'C', 'ひと', [
    { name: 'きりかかる', cost: [C], damage: 20 },
    { name: '剣のまい', cost: [C, C], damage: 40 },
  ], { flavor: '剣一本で食べている傭兵。腕はたしかだが、お金にはだらしない。' }),
  m('ロイヤルウォリアー', 'humans/royal-warrior', C, 'stage1', 120, 2, 'U', 'ひと', [
    { name: '王のつるぎ', cost: [C, C], damage: 50 },
    { name: '近衛の連撃', cost: [C, C, C], damage: 90, effects: [{ k: 'flipBonus', bonus: 30 }], suffix: '+' },
  ], { evolvesFrom: 'ヒュームソードマン', flavor: '王の剣を預かる近衛の戦士。「お命、確かにお守りいたします」が口癖。' }),
  m('チューイングウルフ', 'wolves/wolf-chewing', C, 'basic', 50, 1, 'C', 'おおかみ', [
    { name: 'じゃれつく', cost: [C], damage: 10 },
    { name: 'がぶがぶ', cost: [C, C], damage: 30 },
  ], { flavor: '骨をかじるのに夢中な子オオカミ。近づくと、ついでに手もかじられる。' }),
  m('ヘビーインファントリー', 'humans/heavy-infantry', C, 'basic', 120, 3, 'U', 'ひと', [
    { name: '鎧のたいあたり', cost: [C, C], damage: 50 },
    { name: '鉄塊のスイング', cost: [C, C, C], damage: 90 },
  ], {
    ability: { name: '重装の守り', text: '', spec: { k: 'damageReduce', n: 10 } },
    flavor: '全身をぶ厚い鎧でおおった重装歩兵。歩くたびに、地面が少しへこむ。',
  }),
  m('グランドナイト', 'humans/grand-knight-2', C, 'basic', 300, 3, 'RR', 'ひと', [
    { name: '騎士団の号令', cost: [C], effects: [{ k: 'draw', n: 2 }] },
    { name: '聖騎士の大剣', cost: [C, C, C, C], damage: 220, effects: [{ k: 'healAllSelf', n: 20 }] },
  ], { ex: true, flavor: '王国騎士団の頂点に立つ騎士。その大剣は、国じゅうの民の祈りを重ねたものだ。' }),
  m('メカニカルレイダー', 'transport/mechanical-raider', C, 'basic', 140, 3, 'R', 'きかい', [
    { name: 'ドリルアタック', cost: [C, C], damage: 60 },
    { name: '蒸気の大砲', cost: [C, C, C], damage: 120, effects: [{ k: 'selfDamage', n: 20 }] },
  ], { flavor: '歯車と蒸気で動く奇妙な戦車。動くたびに、あちこちから白い煙がもれる。' }),
];
