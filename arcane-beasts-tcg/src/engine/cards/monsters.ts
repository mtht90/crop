import type { EType, MonsterCard } from '../types';
import { monsterFactory } from './factory';

const m = monsterFactory('AB1');

const F: EType = 'fire', W: EType = 'water', G: EType = 'grass', L: EType = 'lightning', P: EType = 'psychic', X: EType = 'fighting', D: EType = 'dark', C: EType = 'colorless';

export const MONSTERS: MonsterCard[] = [
  // ============================== FIRE ==============================
  m('アリタマゴ', 'monsters/ant-egg', F, 'basic', 50, 2, 'C', 'たまご', [
    { name: 'かたくなる', cost: [C], effects: [{ k: 'reduceNext', n: 30 }] },
    { name: 'ころがる', cost: [F, C], damage: 20 },
  ], { flavor: '溶岩の熱で温められる卵。殻は鉄よりも硬く、中からかすかな羽音が聞こえる。' }),
  m('ヒアリ', 'monsters/ant-fire', F, 'stage1', 90, 1, 'C', 'ほのおアリ', [
    { name: 'かみつく', cost: [F], damage: 30 },
    { name: 'ひのこ', cost: [F, C], damage: 50, effects: [{ k: 'condition', cond: 'burned', flip: true }] },
  ], { evolvesFrom: 'アリタマゴ', flavor: '群れで動き、獲物を見つけると一斉に火の粉を吹きかける。' }),
  m('ヒアリクイーン', 'monsters/ant-fire-queen', F, 'stage2', 160, 2, 'R', 'じょおうアリ', [
    { name: 'インフェルノクイーン', cost: [F, F, C], damage: 80, suffix: '+', effects: [{ k: 'bonusPerBench', per: 30, whose: 'self', nameIncludes: 'アリ' }] },
  ], {
    evolvesFrom: 'ヒアリ',
    ability: { name: '女王の号令', text: '', spec: { k: 'searchBasicOnce', nameIncludes: 'アリ' } },
    flavor: '巣の奥で眠る女王。ひとたび号令を発すれば、火山そのものが動き出す。',
  }),
  m('バクダンアリ', 'monsters/ant-firebomb', F, 'basic', 70, 1, 'U', 'ばくだんアリ', [
    { name: 'たいあたり', cost: [C], damage: 10 },
    { name: 'だいばくはつ', cost: [F, C], damage: 120, effects: [{ k: 'selfDamage', n: 70 }] },
  ], { flavor: '腹に溜め込んだ油に火がつくと、巣ごと吹き飛ばすほどの爆発を起こす。' }),
  m('ホムラビ', 'monsters/fire_guardian', F, 'basic', 80, 2, 'C', 'ほむら', [
    { name: 'ほのおのうず', cost: [F], damage: 20 },
    { name: 'かえん', cost: [F, F], damage: 70, effects: [{ k: 'discardSelfEnergy', n: 1, type: F }] },
  ], { flavor: '祠の篝火に宿る精霊。夜になると人の形をとって山道を歩くという。' }),
  m('ゴウカレイス', 'monsters/fire_wraith_A', F, 'stage1', 130, 2, 'R', 'ごうか', [
    { name: 'ごうかのつめ', cost: [F, C], damage: 60 },
    { name: 'ごうか', cost: [F, F, C], damage: 130, effects: [{ k: 'discardSelfEnergy', n: 1 }] },
  ], {
    evolvesFrom: 'ホムラビ',
    ability: { name: '灼熱の体', text: '', spec: { k: 'counterDamage', n: 30 } },
    flavor: '触れたものすべてを灰にする業火の化身。怒りが収まるまで燃え続ける。',
  }),
  m('ミツオネコ', 'monsters/tritail-cat', F, 'basic', 70, 1, 'C', 'みつお', [
    { name: 'ひっかく', cost: [C], damage: 20 },
    { name: 'ひのしっぽ', cost: [F, C], damage: 40 },
  ], { flavor: '三本の尻尾を器用に使い分ける。尻尾の先が温かいのは火の力の兆し。' }),
  m('ヒオネコ', 'monsters/redtail-cat', F, 'stage1', 120, 1, 'U', 'ひお', [
    { name: 'バーンクロー', cost: [F], damage: 30, effects: [{ k: 'condition', cond: 'burned' }] },
    { name: 'フレアテイル', cost: [F, F, C], damage: 80, suffix: '+', effects: [{ k: 'bonusIfOppCondition', cond: 'burned', bonus: 60 }] },
  ], { evolvesFrom: 'ミツオネコ', flavor: '燃え盛る尾は獲物を惑わせる。炎に見とれた者は二度と帰らない。' }),
  m('バーナドレイク', 'drakes/burner', F, 'basic', 100, 2, 'C', 'りゅうじん', [
    { name: 'ドラゴンクロー', cost: [F, C], damage: 40 },
    { name: 'ヒートブレス', cost: [F, F, C], damage: 90 },
  ], { flavor: '火山の麓に住む竜人族の若者。その吐息は鉄をも溶かすという。' }),
  m('インフェルドレイク', 'drakes/inferno', F, 'stage1', 270, 3, 'RR', 'えんごくりゅう', [
    { name: 'ヒートアップ', cost: [F], effects: [{ k: 'searchEnergyAttach', n: 2, type: F, from: 'discard', to: 'self' }] },
    { name: '煉獄ブレス', cost: [F, F, C], damage: 200, effects: [{ k: 'discardSelfEnergy', n: 2 }] },
  ], { evolvesFrom: 'バーナドレイク', omega: true, flavor: '千の戦を越えた竜人の王。その咆哮は溶岩を呼び覚ます。' }),
  m('ヴォルカリオン', 'monsters/fire-dragon', F, 'basic', 230, 3, 'RR', 'ぐれんりゅう', [
    { name: 'かえんほうしゃ', cost: [F, C], damage: 60, effects: [{ k: 'condition', cond: 'burned' }] },
    { name: '紅蓮爆炎', cost: [F, F, F, C], damage: 220, effects: [{ k: 'cantAttackNext' }] },
  ], { omega: true, flavor: '天を焦がす紅蓮の竜。その羽ばたきひとつで、山がひとつ燃え落ちる。' }),

  // ============================== WATER ==============================
  m('タツノコ', 'monsters/seahorse', W, 'basic', 60, 1, 'C', 'たつのこ', [
    { name: 'みずでっぽう', cost: [W], damage: 20 },
    { name: 'しおまねき', cost: [C], effects: [{ k: 'searchEnergyAttach', n: 1, type: W, from: 'deck', to: 'any' }] },
  ], { flavor: '竜の血を引くと伝えられる小さな海の生き物。尾で海藻に掴まって眠る。' }),
  m('ミズチ', 'monsters/water-serpent', W, 'stage1', 110, 2, 'U', 'すいりゅう', [
    { name: 'アクアテール', cost: [W, C], damage: 60 },
    { name: 'うずしお', cost: [W, W, C], damage: 90, effects: [{ k: 'oppCantRetreat' }] },
  ], { evolvesFrom: 'タツノコ', flavor: '川と海の境に棲む水竜。嵐の夜には天に昇るのが見えるという。' }),
  m('リヴァイアサーペント', 'monsters/sea-serpent', W, 'stage2', 320, 3, 'RR', 'かいじん', [
    { name: 'たいかいしょう', cost: [W, C], damage: 60, effects: [{ k: 'spread', n: 20 }] },
    { name: '海神の怒濤', cost: [W, W, W, C], damage: 240 },
  ], { evolvesFrom: 'ミズチ', omega: true, flavor: '大海原の主。怒りに触れた船は、ひとつ残らず深海へと引きずり込まれた。' }),
  m('キバピラニア', 'monsters/caribe', W, 'basic', 60, 1, 'C', 'きば', [
    { name: 'かみくだく', cost: [W], damage: 10, suffix: '+', effects: [{ k: 'bonusIfOppDamaged', bonus: 30 }] },
  ], { flavor: '血の匂いを一滴でも嗅ぎつけると、群れで押し寄せてくる。' }),
  m('カリブハンター', 'monsters/caribe-hunter', W, 'stage1', 110, 1, 'U', 'かりうど', [
    { name: 'ちのにおい', cost: [W], damage: 40, suffix: '+', effects: [{ k: 'bonusIfOppDamaged', bonus: 70 }] },
    { name: 'たたきつける', cost: [W, W, C], damage: 100 },
  ], { evolvesFrom: 'キバピラニア', flavor: '群れを率いる狩人。傷ついた獲物を見逃したことは一度もない。' }),
  m('オオイカリ', 'monsters/cuttlefish', W, 'basic', 100, 2, 'C', 'おおいか', [
    { name: 'すみはき', cost: [W], damage: 20, effects: [{ k: 'condition', cond: 'confused' }] },
    { name: 'しめつける', cost: [W, W, C], damage: 80 },
  ], { flavor: '墨を吐いて獲物の目をくらませる。暗い海の底で青く光る。' }),
  m('クラーケン', 'monsters/kraken', W, 'stage1', 280, 3, 'RR', 'しんかい', [
    { name: '引きずり込む', cost: [W], damage: 30, effects: [{ k: 'gustBefore' }] },
    { name: '深淵の抱擁', cost: [W, W, C], damage: 190 },
  ], { evolvesFrom: 'オオイカリ', omega: true, flavor: '伝説の深海魔。その触手は大陸ひとつを抱きかかえるほど長い。' }),
  m('コオリアルマ', 'monsters/small-icemonax', W, 'basic', 70, 2, 'C', 'こおりよろい', [
    { name: 'まるくなる', cost: [C], effects: [{ k: 'reduceNext', n: 40 }] },
    { name: 'こおりのつぶて', cost: [W, C], damage: 40 },
  ], { flavor: '氷の結晶を背負って眠る。危険を感じると丸くなって転がって逃げる。' }),
  m('ヒョウガアルマ', 'monsters/big-icemonax', W, 'stage1', 150, 3, 'U', 'ひょうが', [
    { name: 'アイスローリング', cost: [W, W, C], damage: 110 },
  ], {
    evolvesFrom: 'コオリアルマ',
    ability: { name: '氷の鎧', text: '', spec: { k: 'damageReduce', n: 30 } },
    flavor: '千年溶けない氷河の鎧をまとう。どんな牙もその殻を貫けない。',
  }),
  m('ハネウオ', 'monsters/nibbler', W, 'basic', 50, 0, 'C', 'はねうお', [
    { name: '呼び水', cost: [C], effects: [{ k: 'searchEnergyAttach', n: 2, type: W, from: 'deck', to: 'bench' }] },
    { name: 'はねる', cost: [W], damage: 20 },
  ], { flavor: '水面を跳ねて雨を呼ぶと言われる魚。漁師たちは豊漁の印と喜ぶ。' }),
  m('イエティ', 'monsters/yeti', W, 'basic', 140, 3, 'U', 'ゆきおとこ', [
    { name: 'ブリザード', cost: [W, C, C], damage: 70, effects: [{ k: 'spread', n: 10 }] },
    { name: 'ゆきなだれ', cost: [W, W, C, C], damage: 160, effects: [{ k: 'cantAttackNext' }] },
  ], { flavor: '雪山の頂に棲む白い巨人。吹雪の日には遠吠えが谷に響く。' }),
  m('ナイアド', 'monsters/naiad', W, 'basic', 70, 1, 'U', 'いずみ', [
    { name: 'みずのはどう', cost: [W], damage: 20 },
  ], {
    ability: { name: '癒しの泉', text: '', spec: { k: 'healOnce', n: 30 } },
    flavor: '森の泉に棲む水の精。傷ついた旅人をそっと癒して去っていく。',
  }),

  // ============================== GRASS ==============================
  m('コダマギ', 'woses/wose', G, 'basic', 110, 3, 'C', 'こだま', [
    { name: 'のしかかり', cost: [G, C], damage: 40 },
    { name: '根を張る', cost: [G, G, C], damage: 90, effects: [{ k: 'healSelf', n: 30 }] },
  ], { flavor: '森の奥深くで何百年も眠る樹木の民。怒らせると森全体が動き出す。' }),
  m('エンシェントウッド', 'woses/ancient-wose', G, 'stage1', 290, 4, 'RR', 'せんねんじゅ', [
    { name: 'こうごうせい', cost: [G], effects: [{ k: 'healSelf', n: 80 }] },
    { name: '千年樹の鉄槌', cost: [G, G, C, C], damage: 230 },
  ], { evolvesFrom: 'コダマギ', omega: true, flavor: '神話の時代から森を守り続ける古木の王。その根は世界の果てまで続く。' }),
  m('ハヤテトンボ', 'monsters/dragonfly', G, 'basic', 60, 0, 'C', 'はやて', [
    { name: 'かぜきり', cost: [G], damage: 20, effects: [{ k: 'switchSelf' }] },
    { name: 'ハイスピード', cost: [G, C], damage: 40 },
  ], { flavor: '風よりも速く飛ぶ大トンボ。羽ばたきの音を聞いた時にはもう遠くにいる。' }),
  m('ハネグモ', 'monsters/jumping-spider', G, 'basic', 60, 1, 'C', 'はねぐも', [
    { name: 'どくのきば', cost: [G], damage: 10, effects: [{ k: 'condition', cond: 'poisoned' }] },
    { name: 'とびかかる', cost: [G, C], damage: 30 },
  ], { flavor: '自分の十倍の距離を跳ぶ。毒は弱いがしびれる痛みが三日続く。' }),
  m('オオツチグモ', 'monsters/giant-spider', G, 'stage1', 130, 2, 'U', 'つちぐも', [
    { name: 'クモの巣', cost: [G], damage: 30, effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    { name: '猛毒の牙', cost: [G, G, C], damage: 70, suffix: '+', effects: [{ k: 'bonusIfOppCondition', cond: 'poisoned', bonus: 70 }, { k: 'condition', cond: 'poisoned' }] },
  ], { evolvesFrom: 'ハネグモ', flavor: '洞窟の天井一面に巣を張る巨大グモ。迷い込んだ者は糸に絡め取られる。' }),
  m('コガネスカラベ', 'monsters/scarab', G, 'basic', 80, 1, 'U', 'こがね', [
    { name: 'ころがす', cost: [G, C], damage: 40 },
  ], {
    ability: { name: '黄金の恵み', text: '', spec: { k: 'energyFromHand', type: G } },
    flavor: '黄金の甲羅は太陽の力を蓄える。大地に恵みをもたらす聖なる虫。',
  }),
  m('リザードスカウト', 'saurians/skirmisher', G, 'basic', 60, 1, 'C', 'とかげへい', [
    { name: 'すばやいつき', cost: [G], damage: 20, suffix: '+', effects: [{ k: 'flipBonus', bonus: 30 }] },
  ], { flavor: '湿地帯を駆け回る斥候。身軽さでは右に出る者はいない。' }),
  m('リザードシャーマン', 'saurians/augur', G, 'stage1', 110, 1, 'U', 'じゅじゅつし', [
    { name: 'のろいのひかり', cost: [G, C], damage: 60 },
    { name: 'とこやみのいのり', cost: [G, G], damage: 30, effects: [{ k: 'condition', cond: 'asleep' }, { k: 'condition', cond: 'poisoned' }] },
  ], {
    evolvesFrom: 'リザードスカウト',
    ability: { name: '祈祷', text: '', spec: { k: 'healOnce', n: 30 } },
    flavor: '古き蜥蜴族の呪術師。泥と骨で占い、雨と病を操る。',
  }),
  m('コブタ', 'monsters/piglet', G, 'basic', 60, 1, 'C', 'こぶた', [
    { name: 'はなでさがす', cost: [C], effects: [{ k: 'draw', n: 2 }] },
    { name: 'たいあたり', cost: [G, C], damage: 30 },
  ], { flavor: 'どんぐりが大好物。鼻が利き、土に埋まった宝も掘り当てる。' }),
  m('モリイノシシ', 'monsters/woodland_boar', G, 'stage1', 130, 2, 'C', 'もりいのしし', [
    { name: 'つきあげる', cost: [G, C], damage: 50 },
    { name: '猪突猛進', cost: [G, C, C], damage: 120, effects: [{ k: 'selfDamage', n: 30 }] },
  ], { evolvesFrom: 'コブタ', flavor: '一度走り出したら止まらない森の暴れ者。大木もなぎ倒す。' }),

  // ============================== LIGHTNING ==============================
  m('イナズマハヤブサ', 'monsters/falcon', L, 'basic', 60, 0, 'C', 'いなずま', [
    { name: '電光石火', cost: [L], damage: 20, suffix: '+', effects: [{ k: 'flipBonus', bonus: 20 }] },
  ], { flavor: '稲妻とともに急降下して獲物を捕らえる。雷雨の日にしか姿を見せない。' }),
  m('ライメイハヤブサ', 'monsters/falcon-elder', L, 'stage1', 110, 0, 'U', 'らいめい', [
    { name: 'サンダーダイブ', cost: [L, C], damage: 70 },
    { name: '雷鳴', cost: [L, L, C], damage: 100, effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
  ], {
    evolvesFrom: 'イナズマハヤブサ',
    ability: { name: '風読み', text: '', spec: { k: 'freeRetreat' } },
    flavor: '雷雲の上を舞う隼の長。その眼は千里先の獲物も逃さない。',
  }),
  m('ヘラルドクロウ', 'monsters/herald', L, 'basic', 90, 1, 'U', 'らいちょう', [
    { name: 'ライトニングボルト', cost: [L, L], damage: 60, effects: [{ k: 'benchSnipe', n: 20 }] },
  ], { flavor: '雷の報せを運ぶ紫の鴉。その羽根に触れると体がしびれる。' }),
  m('サンダーグリフォン', 'monsters/gryphon', L, 'basic', 120, 2, 'U', 'らいじゅう', [
    { name: 'いかずちのつめ', cost: [L, C, C], damage: 80, effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
  ], { flavor: '獅子の体に鷲の翼。嵐の山に棲み、雷を浴びて力を蓄える。' }),
  m('グライドドレイク', 'drakes/glider', L, 'basic', 80, 1, 'C', 'かっくう', [
    { name: 'かぜおこし', cost: [L], damage: 20 },
    { name: 'スパーク', cost: [L, C], damage: 40 },
  ], { flavor: '空を滑るように飛ぶ竜人。雷雲の中を好んで飛び回る。' }),
  m('ハリケーンドレイク', 'drakes/hurricane', L, 'stage1', 260, 1, 'RR', 'らいりゅう', [
    { name: '充電', cost: [L], effects: [{ k: 'searchEnergyAttach', n: 2, type: L, from: 'deck', to: 'self' }] },
    { name: 'ボルテックストーム', cost: [L, L, C], damage: 120, effects: [{ k: 'spread', n: 20 }] },
  ], { evolvesFrom: 'グライドドレイク', omega: true, flavor: '嵐をまとう竜人の戦士。翼を広げれば雷鳴が大地を揺らす。' }),
  m('ワイバーン', 'monsters/wyvern', L, 'basic', 110, 2, 'C', 'ひりゅう', [
    { name: 'テイルスラッシュ', cost: [L, C, C], damage: 80 },
  ], { flavor: '二本脚の飛竜。尾の先の棘には雷の力が宿っている。' }),

  // ============================== PSYCHIC ==============================
  m('ゴースト', 'undead/ghost', P, 'basic', 60, 1, 'C', 'ゆうれい', [
    { name: 'おどかす', cost: [P], effects: [{ k: 'condition', cond: 'confused' }] },
    { name: 'シャドーパンチ', cost: [P, C], damage: 40 },
  ], { resistance: 'fighting', flavor: '古城をさまよう亡霊。壁をすり抜けて旅人を驚かせるのが好き。' }),
  m('スペクター', 'undead/spectre', P, 'stage1', 110, 1, 'U', 'ぼうれい', [
    { name: 'ソウルドレイン', cost: [P, C], damage: 60, effects: [{ k: 'healSelf', n: 30 }] },
    { name: 'ゴーストハンド', cost: [P, P], effects: [{ k: 'anySnipe', n: 70 }] },
  ], { evolvesFrom: 'ゴースト', resistance: 'fighting', flavor: '生者の魂を喰らう亡霊。その冷たい手に掴まれると体温が奪われる。' }),
  m('レイス', 'undead/wraith', P, 'stage1', 120, 1, 'R', 'れいけん', [
    { name: 'ファントムブレード', cost: [P, P, C], damage: 100, effects: [{ k: 'benchSnipe', n: 30 }] },
  ], {
    evolvesFrom: 'ゴースト',
    resistance: 'fighting',
    ability: { name: '霊体化', text: '', spec: { k: 'switchInOnce' } },
    flavor: '蒼き霊剣を携える騎士の亡霊。生前の誓いを果たすため今も戦い続ける。',
  }),
  m('シャドウ', 'undead/shadow', P, 'basic', 70, 1, 'C', 'かげ', [
    { name: '影ぬい', cost: [P], damage: 20, effects: [{ k: 'oppCantRetreat' }] },
    { name: 'やみうち', cost: [P, C], damage: 30, suffix: '+', effects: [{ k: 'flipBonus', bonus: 30 }] },
  ], { resistance: 'fighting', flavor: '闇に紛れて忍び寄る影。気づいた時には背後に立っている。' }),
  m('ナイトゴーント', 'undead/nightgaunt', P, 'stage1', 260, 2, 'RR', 'あくむ', [
    { name: 'ナイトメアクロー', cost: [P, P, C], damage: 150, effects: [{ k: 'condition', cond: 'asleep' }] },
  ], {
    evolvesFrom: 'シャドウ',
    omega: true,
    resistance: 'fighting',
    ability: { name: '悪夢の支配', text: '', spec: { k: 'nightmare', n: 30 } },
    flavor: '眠る者の夢に入り込み、魂を少しずつ削り取る夜の王。',
  }),
  m('ナイトメア', 'monsters/nightmare', P, 'basic', 100, 1, 'U', 'あくむうま', [
    { name: '悪夢の蹄', cost: [P, C], damage: 50, effects: [{ k: 'condition', cond: 'asleep' }] },
  ], { flavor: '真夜中にだけ現れる黒馬。その蹄の音を聞いた者は悪夢にうなされる。' }),
  m('ジン', 'monsters/jinn', P, 'basic', 220, 2, 'RR', 'まじん', [
    { name: 'ねがいごと', cost: [C], effects: [{ k: 'draw', n: 3 }] },
    { name: 'ミスティックバースト', cost: [P, C, C], damage: 30, suffix: '+', effects: [{ k: 'bonusPerEnergy', per: 40, on: 'both' }] },
  ], { omega: true, flavor: '古のランプに封じられていた魔神。三つの願いの代償は計り知れない。' }),
  m('ディープテンタクル', 'monsters/deep-tentacle', P, 'basic', 100, 2, 'C', 'しんえん', [
    { name: 'からみつく', cost: [P, C], damage: 30, effects: [{ k: 'condition', cond: 'paralyzed', flip: true }] },
    { name: 'しめあげ', cost: [P, P, C], damage: 90 },
  ], { flavor: '地の底の湖から伸びる触手。本体を見た者はいない。' }),

  // ============================== FIGHTING ==============================
  m('トロルコ', 'trolls/whelp', X, 'basic', 80, 2, 'C', 'こトロル', [
    { name: '石なげ', cost: [X], damage: 20 },
    { name: 'ずつき', cost: [X, C], damage: 40 },
  ], { flavor: '岩山で育つトロルの子ども。石を投げて遊ぶが、その力は大人顔負け。' }),
  m('トロル', 'trolls/troll', X, 'stage1', 130, 3, 'U', 'いわおに', [
    { name: 'ハンマーブロウ', cost: [X, X, C], damage: 100 },
  ], {
    evolvesFrom: 'トロルコ',
    ability: { name: '再生', text: '', spec: { k: 'regen', n: 20 } },
    flavor: '傷ついてもすぐに塞がる岩の肌を持つ。倒すには一撃で仕留めるしかない。',
  }),
  m('トロルキング', 'trolls/troll-hero', X, 'stage2', 330, 3, 'RR', 'おうじゃ', [
    { name: 'じならし', cost: [X], damage: 50, effects: [{ k: 'spread', n: 10 }] },
    { name: '大地砕き', cost: [X, X, C, C], damage: 250 },
  ], {
    evolvesFrom: 'トロル',
    omega: true,
    ability: { name: '王の再生', text: '', spec: { k: 'regen', n: 30 } },
    flavor: '全てのトロルを束ねる王。その拳は山を砕き、大地に谷を刻む。',
  }),
  m('コオーガ', 'monsters/young-ogre', X, 'basic', 90, 2, 'C', 'こおに', [
    { name: 'ぶんなぐる', cost: [X, C], damage: 30, suffix: '+', effects: [{ k: 'flipBonus', bonus: 30 }] },
  ], { flavor: '力自慢の若いオーガ。腹が減ると機嫌が悪くなる。' }),
  m('オーガ', 'monsters/ogre', X, 'stage1', 150, 3, 'U', 'おに', [
    { name: 'かいりき', cost: [X, X, C], damage: 100, suffix: '+', effects: [{ k: 'bonusIfSelfDamaged', bonus: 60 }] },
  ], { evolvesFrom: 'コオーガ', flavor: '傷を負うほど怒り狂う巨人。痛みを力に変えて暴れ回る。' }),
  m('サソリン', 'monsters/scorpion', X, 'basic', 60, 1, 'C', 'さそり', [
    { name: 'しっぽばり', cost: [X], damage: 10, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { flavor: '砂漠の岩陰に潜む。尻尾の毒針は小さいが侮れない。' }),
  m('ロックスコルピオ', 'monsters/scorpion-rock', X, 'stage1', 130, 2, 'U', 'いわさそり', [
    { name: 'ロックシザー', cost: [X, C, C], damage: 90 },
  ], {
    evolvesFrom: 'サソリン',
    ability: { name: '岩の甲殻', text: '', spec: { k: 'damageReduce', n: 20 } },
    flavor: '岩石と一体化した甲殻を持つ。千年生きた個体は小山ほどの大きさになる。',
  }),
  m('エルダースコルピオ', 'monsters/scorpion-elder', X, 'stage1', 120, 2, 'R', 'ちょうろう', [
    { name: 'もうどくばり', cost: [X, C], damage: 40, effects: [{ k: 'condition', cond: 'poisoned' }, { k: 'condition', cond: 'paralyzed', flip: true }] },
    { name: 'しめつけばさみ', cost: [X, X, C], damage: 80, suffix: '+', effects: [{ k: 'bonusIfOppCondition', cond: 'poisoned', bonus: 60 }] },
  ], { evolvesFrom: 'サソリン', flavor: '砂漠の長老。尾の毒は一刺しで竜をも眠らせる。' }),
  m('ドロンコ', 'monsters/mudcrawler', X, 'basic', 60, 2, 'C', 'どろ', [
    { name: 'どろかけ', cost: [X], damage: 20 },
  ], { flavor: '沼の泥が意思を持って動き出したもの。叩いても手応えがない。' }),
  m('ドロゴーレム', 'monsters/giant-mudcrawler', X, 'stage1', 140, 3, 'U', 'どろきょじん', [
    { name: 'どろのこぶし', cost: [X, C], damage: 60 },
    { name: 'マッドスラム', cost: [X, X, C], damage: 120, effects: [{ k: 'discardSelfEnergy', n: 1 }] },
  ], { evolvesFrom: 'ドロンコ', flavor: '沼ひとつ分の泥が集まってできた巨人。雨の日にはさらに大きくなる。' }),
  m('グリズリー', 'monsters/bear', X, 'basic', 130, 2, 'U', 'おおくま', [
    { name: 'ベアクロー', cost: [X, C, C], damage: 90 },
  ], { flavor: '森の王者。冬眠明けの空腹時には誰も近づこうとしない。' }),

  // ============================== DARK ==============================
  m('コウモリン', 'monsters/bat', D, 'basic', 50, 0, 'C', 'こうもり', [
    { name: 'すいとる', cost: [D], damage: 20, effects: [{ k: 'healSelf', n: 10 }] },
  ], { flavor: '洞窟の天井にぶら下がって眠る。超音波で暗闇を見通す。' }),
  m('ブラッドバット', 'monsters/bat-red', D, 'stage1', 90, 0, 'C', 'ちすい', [
    { name: '吸血', cost: [D, C], damage: 50, effects: [{ k: 'healSelf', n: 30 }] },
  ], { evolvesFrom: 'コウモリン', flavor: '真紅の翼を持つ吸血コウモリ。月夜に群れで狩りをする。' }),
  m('ドレッドバット', 'monsters/bat-dread', D, 'stage2', 150, 0, 'R', 'きょうふ', [
    { name: 'クリムゾンファング', cost: [D, C], damage: 100, effects: [{ k: 'healSelf', n: 30 }] },
  ], {
    evolvesFrom: 'ブラッドバット',
    ability: { name: '闇の導き', text: '', spec: { k: 'onEvolveDraw', n: 3 } },
    flavor: '恐怖そのものが翼を得た姿。その羽ばたきは死の前触れとされる。',
  }),
  m('アカオオカミ', 'wolves/wolf-red', D, 'basic', 70, 1, 'C', 'おおかみ', [
    { name: 'かみつく', cost: [D], damage: 20 },
    { name: 'むれでおそう', cost: [D, C], damage: 20, suffix: '+', effects: [{ k: 'bonusPerBench', per: 20, whose: 'self', nameIncludes: 'オオカミ' }] },
  ], { flavor: '赤い毛並みの狼。群れの絆は固く、仲間が多いほど勇敢になる。' }),
  m('グレートウルフ', 'wolves/wolf-great', D, 'stage1', 130, 1, 'R', 'むれのおさ', [
    { name: '牙の嵐', cost: [D, C, C], damage: 100 },
  ], {
    evolvesFrom: 'アカオオカミ',
    ability: { name: '群れの長', text: '', spec: { k: 'typeBoost', nameIncludes: 'オオカミ', n: 30 } },
    flavor: '幾多の群れを束ねる狼の王。その遠吠えに応えぬ狼はいない。',
  }),
  m('ヤミオオカミ', 'wolves/wolf-dark', D, 'basic', 80, 1, 'U', 'やみおおかみ', [
    { name: '闇討ち', cost: [D], effects: [{ k: 'anySnipe', n: 30 }] },
    { name: 'かみくだく', cost: [D, D], damage: 60 },
  ], { flavor: '夜の闇と同じ色の毛皮を持つ。気配を消して獲物に忍び寄る。' }),
  m('カラス', 'monsters/raven', D, 'basic', 50, 1, 'C', 'からす', [
    { name: 'ついばむ', cost: [C], damage: 10 },
    { name: 'かすめとる', cost: [D], effects: [{ k: 'discardOppEnergy', n: 1, flip: true }] },
  ], { flavor: '光るものを集める賢い鳥。戦場には必ずどこからともなく現れる。' }),
  m('ウォーハービンジャー', 'monsters/war-harbinger', D, 'stage1', 120, 1, 'U', 'きょうちょう', [
    { name: 'ダークウィング', cost: [D, C], damage: 70, effects: [{ k: 'discardOppEnergy', n: 1 }] },
  ], { evolvesFrom: 'カラス', flavor: '戦乱の前触れに現れる巨大な鴉。その影が落ちた地には必ず血が流れる。' }),
  m('スケルトン', 'undead/skeleton', D, 'basic', 70, 1, 'C', 'がいこつ', [
    { name: 'ほねのけん', cost: [D], damage: 20 },
    { name: 'がしゃどくろ', cost: [D, C], damage: 40 },
  ], { flavor: '古戦場に眠る兵士の骨。夜ごと起き上がり、終わらぬ戦を続ける。' }),
  m('レヴナント', 'undead/revenant', D, 'stage1', 120, 2, 'U', 'ふっかつ', [
    { name: '死者の剣', cost: [D, C, C], damage: 90 },
  ], {
    evolvesFrom: 'スケルトン',
    ability: { name: '不死の鎧', text: '', spec: { k: 'damageReduce', n: 20 } },
    flavor: '怨念によって蘇った戦士。錆びた鎧の奥に青い炎が灯っている。',
  }),
  m('デスナイト', 'undead/death-knight', D, 'stage2', 320, 3, 'RR', 'めいおう', [
    { name: '魂を刈る', cost: [D], damage: 30, suffix: '+', effects: [{ k: 'bonusPerDiscardMonster', per: 20, max: 200 }] },
    { name: '冥王斬', cost: [D, D, C], damage: 210 },
  ], { evolvesFrom: 'レヴナント', omega: true, flavor: '冥府の軍勢を率いる騎士。倒れた者の魂を刃に宿して振るう。' }),
  m('グール', 'undead/ghoul', D, 'basic', 100, 2, 'C', 'しょくし', [
    { name: '腐食の爪', cost: [D, C], damage: 30, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { flavor: '墓場を徘徊する食屍鬼。その爪には腐った瘴気がこびりついている。' }),
  m('ドブネズミ', 'monsters/giant-rat', D, 'basic', 50, 1, 'C', 'どぶねずみ', [
    { name: 'かじる', cost: [D], damage: 20 },
    { name: 'なかまをよぶ', cost: [C], effects: [{ k: 'callForFamily', n: 2 }] },
  ], { flavor: '地下水路に大群で棲む。一匹見かけたら百匹いると思え。' }),

  // ============================== COLORLESS ==============================
  m('オコジョ', 'monsters/stoat', C, 'basic', 60, 0, 'C', 'おこじょ', [
    { name: 'かみつく', cost: [C], damage: 20 },
  ], {
    ability: { name: 'すばしっこい', text: '', spec: { k: 'drawOnce', n: 1, activeOnly: true } },
    flavor: '雪原を跳ね回る小さな狩人。冬になると真っ白な毛に生え変わる。',
  }),
  m('ウマ', 'monsters/horse', C, 'basic', 80, 1, 'C', 'うま', [
    { name: 'とっしん', cost: [C, C], damage: 40 },
  ], { flavor: '人と共に旅をしてきた相棒。長い道のりも恐れず駆け抜ける。' }),
  m('グレートホース', 'monsters/great-horse', C, 'stage1', 130, 1, 'U', 'めいば', [
    { name: 'ギャロップ', cost: [C, C, C], damage: 110 },
  ], { evolvesFrom: 'ウマ', flavor: '王族の戦車を引いた名馬の血統。三日三晩走り続けても疲れを知らない。' }),
  m('ホワイトホース', 'monsters/white-horse', C, 'basic', 100, 1, 'U', 'はくば', [
    { name: 'きよらかないななき', cost: [C], effects: [{ k: 'healSelf', n: 30 }] },
    { name: 'しっぷう', cost: [C, C, C], damage: 70 },
  ], {
    ability: { name: '聖なる守り', text: '', spec: { k: 'benchBarrier' } },
    flavor: '伝説に語られる白馬。その背に乗る者は決して傷つかないという。',
  }),
  m('ロック', 'monsters/roc', C, 'basic', 240, 2, 'RR', 'きょちょう', [
    { name: '上昇気流', cost: [C], effects: [{ k: 'switchSelf' }, { k: 'draw', n: 2 }] },
    { name: '天空の爪', cost: [C, C, C, C], damage: 200 },
  ], { omega: true, flavor: '雲よりも高く飛ぶ巨鳥。その影が大地を覆うと、昼が夜に変わる。' }),
  m('マダラヤマネコ', 'monsters/jumpcat', C, 'basic', 90, 1, 'U', 'やまねこ', [
    { name: 'とびかかる', cost: [C, C], damage: 30, suffix: '+', effects: [{ k: 'flipBonus', bonus: 40 }] },
  ], {
    ability: { name: 'しなやかな身のこなし', text: '', spec: { k: 'freeRetreat' } },
    flavor: '岩から岩へと音もなく跳び移る。狩りの成功率は森で一番。',
  }),
  m('クロコダイル', 'monsters/crocodile', W, 'basic', 120, 3, 'C', 'わに', [
    { name: 'かみくだく', cost: [W, C], damage: 40 },
    { name: 'デスロール', cost: [W, W, C], damage: 100 },
  ], { flavor: '大河の濁流に潜む古代の捕食者。噛みついたら決して離さない。' }),
];
