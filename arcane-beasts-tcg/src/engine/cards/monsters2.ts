// ============================================================================
// 第2弾「覇者の降臨」 — introduces EX monsters (knocked out → 3 prize cards)
// ============================================================================
import type { EType, MonsterCard } from '../types';
import { monsterFactory } from './factory';

const m = monsterFactory('AB2');
const F: EType = 'fire', W: EType = 'water', G: EType = 'grass', L: EType = 'lightning', P: EType = 'psychic', X: EType = 'fighting', D: EType = 'dark', C: EType = 'colorless';

export const MONSTERS2: MonsterCard[] = [
  // ============================== FIRE ==============================
  m('カエンアリ', 'monsters/ant-firebane', F, 'basic', 70, 1, 'C', 'かえんアリ', [
    { name: 'ひのこ', cost: [F], damage: 10, effects: [{ k: 'condition', cond: 'burned', flip: true }] },
    { name: 'かみつく', cost: [F, C], damage: 40 },
  ], { flavor: '触角の先から火花を散らす大アリ。巣の周りの草木はいつも焦げている。' }),
  m('ドレイクファイター', 'drakes/fighter', F, 'basic', 90, 2, 'C', 'ドレイク', [
    { name: 'きりさく', cost: [F, C], damage: 30 },
    { name: 'ドラゴンダイブ', cost: [F, F, C], damage: 80 },
  ], { flavor: '若いドレイクの戦士。空から槍ごと急降下する突撃を得意とする。' }),
  m('ドレイククラッシャー', 'drakes/clasher', F, 'stage1', 140, 2, 'U', 'ドレイク', [
    { name: 'やりぶすま', cost: [F, C], damage: 50 },
    { name: 'ドラゴンチャージ', cost: [F, F, C], damage: 120, effects: [{ k: 'selfDamage', n: 20 }] },
  ], { evolvesFrom: 'ドレイクファイター', flavor: '翼を捨て、重い鎧を選んだドレイク。地上戦では一歩も退かない。' }),
  m('ドラグーン', 'drakes/enforcer', F, 'stage1', 300, 3, 'RRR', 'はりゅう', [
    { name: '覇竜の号令', cost: [F], effects: [{ k: 'searchEnergyAttach', n: 2, type: 'fire', from: 'discard', to: 'any' }] },
    { name: '覇王の業火', cost: [F, F, F, C], damage: 260, effects: [{ k: 'discardSelfEnergy', n: 2, type: 'fire' }] },
  ], { evolvesFrom: 'ドレイクファイター', ex: true, flavor: '黄金の鎧をまとうドレイクの覇者。その咆哮ひとつで軍勢が膝をつく。' }),
  m('ドレイクガーディアン', 'drakes/warden', F, 'basic', 120, 3, 'U', 'ドレイク', [
    { name: 'ハルバード', cost: [F, C, C], damage: 70 },
  ], {
    ability: { name: '竜鱗の盾', text: '', spec: { k: 'damageReduce', n: 20 } },
    flavor: '城門を守る古参の衛兵。千年を生きた鱗は、どんな刃も通さない。',
  }),
  m('ヒブネ', 'transport/fireship', F, 'basic', 130, 3, 'R', 'ひぶね', [
    { name: '焼き討ち', cost: [F, C, C], damage: 50, effects: [{ k: 'spread', n: 10 }, { k: 'condition', cond: 'burned' }] },
  ], { flavor: '燃えながら進む無人の船。風に乗って敵の船団へと突っ込んでいく。', scene: 'story/landscape-coast' }),

  // ============================== WATER =============================
  m('ナーガソルジャー', 'nagas/fighter', W, 'basic', 70, 1, 'C', 'ナーガ', [
    { name: 'みずしぶき', cost: [W], damage: 20 },
    { name: 'テイルウィップ', cost: [W, C], damage: 40 },
  ], { flavor: '海底都市を守るナーガの兵。長い尾で砂を巻き上げ、敵の目をくらます。' }),
  m('ナーガミュルミドン', 'nagas/myrmidon', W, 'stage1', 130, 2, 'U', 'ナーガ', [
    { name: 'トライデント', cost: [W, C], damage: 60 },
    { name: '大渦の刃', cost: [W, W, C], damage: 110 },
  ], { evolvesFrom: 'ナーガソルジャー', flavor: '双剣を操るナーガの精鋭。渦潮の中でも刃筋がぶれることはない。' }),
  m('ナーガクイーン', 'nagas/naga-ophidian', W, 'stage1', 290, 2, 'RRR', 'かいおう', [
    { name: 'アビスダンス', cost: [W, W, C], damage: 130, suffix: '+', effects: [{ k: 'bonusPerBench', per: 20, whose: 'self', nameIncludes: 'ナーガ' }] },
  ], {
    evolvesFrom: 'ナーガソルジャー',
    ex: true,
    ability: { name: '潮の支配', text: '', spec: { k: 'energyFromHand', type: 'water' } },
    flavor: '深海の玉座に君臨する女王。その舞は潮の満ち引きさえ変えてしまう。',
  }),
  m('ナーガリングキャスター', 'nagas/naga-ringcaster', W, 'basic', 90, 1, 'U', 'ナーガ', [
    { name: 'リングスロー', cost: [W, C], effects: [{ k: 'anySnipe', n: 40 }] },
  ], { flavor: '水の輪を投げる術師。放たれた輪は波間を跳ね、狙った獲物を外さない。' }),
  m('トリトン', 'merfolk/triton', W, 'basic', 230, 2, 'RR', 'かいじん', [
    { name: '波濤の槍', cost: [W, C], damage: 70, effects: [{ k: 'benchSnipe', n: 20 }] },
    { name: '海王の三叉戟', cost: [W, W, W, C], damage: 210 },
  ], { omega: true, flavor: '海の王の血を引く戦士。三叉戟を掲げれば、大洋そのものが味方につく。' }),
  m('クサレワニ', 'undead/zombie-serpent', W, 'basic', 110, 3, 'C', 'くされワニ', [
    { name: 'かみつく', cost: [W, C], damage: 40 },
    { name: 'どろぬま', cost: [W, W, C], damage: 90, effects: [{ k: 'oppCantRetreat' }] },
  ], { flavor: '沼の底で眠っていた古いワニ。朽ちた体でも、噛む力だけは衰えない。' }),

  // ============================== GRASS =============================
  m('オオアリ', 'monsters/ant-giant', G, 'basic', 80, 1, 'C', 'おおアリ', [
    { name: 'なかまをよぶ', cost: [C], effects: [{ k: 'callForFamily', n: 2 }] },
    { name: 'かみつく', cost: [G, C], damage: 30 },
  ], { flavor: '森の土を掘り返して暮らす働きアリ。一匹見かけたら百匹いると思え。' }),
  m('ヘイタイアリ', 'monsters/ant-soldier', G, 'stage1', 130, 2, 'U', 'へいたいアリ', [
    { name: '顎の一撃', cost: [G, C], damage: 50 },
    { name: '軍隊の行進', cost: [G, G, C], damage: 50, suffix: '+', effects: [{ k: 'bonusPerBench', per: 30, whose: 'self' }] },
  ], { evolvesFrom: 'オオアリ', flavor: '巨大な顎を持つ兵隊アリ。仲間が多いほど士気が上がり、突撃が激しくなる。' }),
  m('クイーンアント', 'monsters/ant-queen', G, 'stage2', 350, 3, 'RRR', 'じょおうアリ', [
    { name: 'ロイヤルスティング', cost: [G, G, C, C], damage: 220, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], {
    evolvesFrom: 'ヘイタイアリ',
    ex: true,
    ability: { name: '女王の産卵', text: '', spec: { k: 'searchBasicOnce', nameIncludes: 'アリ' } },
    flavor: '森の地下に王国を築いた女王。羽音が聞こえたとき、森はすでに彼女のものだ。',
  }),
  m('カレキダマ', 'undead/zombie-wose', G, 'basic', 100, 3, 'C', 'かれき', [
    { name: '枯れ枝', cost: [G, C], damage: 40 },
    { name: '呪いの根', cost: [G, G, C], damage: 70, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { flavor: '魂の抜けた古木。夜になると根を引きずって、少しずつ村へ近づいてくる。' }),
  m('ゾンビバグ', 'undead/zombie-bug', G, 'basic', 60, 1, 'C', 'くされむし', [
    { name: 'どくばり', cost: [G], damage: 10, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { flavor: '死骸に群がる羽虫。刺されると傷口がゆっくりと腐っていく。' }),

  // ============================ LIGHTNING ===========================
  m('シルフ', 'elves/sylph', L, 'basic', 60, 0, 'C', 'ようせい', [
    { name: 'かぜのうた', cost: [C], effects: [{ k: 'draw', n: 2 }] },
    { name: 'そよかぜ', cost: [L], damage: 20 },
  ], { flavor: '雷雲の中で生まれる風の妖精。歌声が聞こえると、じきに嵐が来る。' }),
  m('シャイード', 'elves/shyde', L, 'stage1', 120, 1, 'R', 'ようせい', [
    { name: 'スパークリング', cost: [L, C], damage: 70 },
  ], {
    evolvesFrom: 'シルフ',
    ability: { name: '妖精の癒し', text: '', spec: { k: 'healOnce', n: 30 } },
    flavor: '稲光をまとって舞う大妖精。傷ついた者には、そっと雨を降らせる。',
  }),
  m('ブレードマスター', 'drakes/blademaster', L, 'basic', 220, 1, 'RR', 'けんせい', [
    { name: '迅雷斬り', cost: [L, C], damage: 60, effects: [{ k: 'switchSelf' }] },
    { name: '天雷一閃', cost: [L, L, C, C], damage: 200, effects: [{ k: 'discardSelfEnergy', n: 2 }] },
  ], { omega: true, flavor: '雷を斬ったと伝えられる剣の達人。抜刀の瞬間は誰にも見えない。' }),
  m('グリフォンライダー', 'dwarves/gryphon-rider', L, 'basic', 110, 1, 'U', 'りゅうきへい', [
    { name: '急降下', cost: [L, C], damage: 50, suffix: '+', effects: [{ k: 'flipBonus', bonus: 40 }] },
  ], { flavor: 'グリフォンと心を通わせた山の民。雷鳴とともに峰から舞い降りる。' }),

  // ============================= PSYCHIC ============================
  m('ハイセン', 'transport/derelict-hulk', P, 'basic', 90, 3, 'C', 'はいせん', [
    { name: 'きしむ船体', cost: [P, C], damage: 40 },
  ], { flavor: '霧の海を漂う朽ちた船。乗り込んだ者は、誰ひとり戻ってこない。', scene: 'story/landscape-coast' }),
  m('ユウレイセン', 'transport/ghost-ship', P, 'stage1', 270, 3, 'RR', 'ゆうれいせん', [
    { name: '亡霊の砲撃', cost: [P, C], damage: 30, effects: [{ k: 'spread', n: 20 }] },
    { name: '冥海への誘い', cost: [P, P, C, C], damage: 190, effects: [{ k: 'condition', cond: 'asleep' }] },
  ], { evolvesFrom: 'ハイセン', omega: true, flavor: '月のない夜にだけ現れる紫の帆。見た者は深い眠りに誘われるという。', scene: 'story/landscape-coast' }),
  m('セイレーン', 'merfolk/enchantress', P, 'basic', 90, 1, 'U', 'うたひめ', [
    { name: '魅惑のうた', cost: [P], effects: [{ k: 'condition', cond: 'asleep' }] },
    { name: 'ソウルソング', cost: [P, C], damage: 50, suffix: '+', effects: [{ k: 'bonusIfOppCondition', cond: 'asleep', bonus: 50 }] },
  ], { flavor: '岩礁で歌う人魚の巫女。その歌を聞いた船乗りは、自ら海へ身を投げる。' }),
  m('ミズヅケ', 'undead/zombie-swimmer', P, 'basic', 80, 2, 'C', 'みずづけ', [
    { name: '引きずる', cost: [P, C], damage: 30, effects: [{ k: 'oppCantRetreat' }] },
  ], { flavor: '水底から手を伸ばす溺れた者の霊。足をつかまれたら、もう逃げられない。' }),

  // ============================ FIGHTING ============================
  m('スナサソリ', 'monsters/scamperer', X, 'basic', 60, 1, 'C', 'すなサソリ', [
    { name: 'はさむ', cost: [X], damage: 20 },
    { name: 'しっぽ', cost: [X, C], damage: 30, effects: [{ k: 'condition', cond: 'poisoned', flip: true }] },
  ], { flavor: '砂漠を素早く駆け回る小さなサソリ。砂に潜って獲物を待ち伏せる。' }),
  m('ヨロイサソリ', 'monsters/scuttler', X, 'stage1', 130, 2, 'U', 'よろいサソリ', [
    { name: 'クラッシュシザー', cost: [X, C, C], damage: 90 },
  ], {
    evolvesFrom: 'スナサソリ',
    ability: { name: '砂鉄の殻', text: '', spec: { k: 'damageReduce', n: 20 } },
    flavor: '砂鉄を殻に溶かし込んだ大サソリ。鋼の刃でもかすり傷しかつかない。',
  }),
  m('トロルウォリアー', 'trolls/troll-warrior', X, 'basic', 110, 3, 'C', 'トロル', [
    { name: 'こんぼう', cost: [X, C], damage: 40 },
    { name: 'ぶちかます', cost: [X, X, C], damage: 100, effects: [{ k: 'cantAttackNext' }] },
  ], { flavor: '鎧を着込んだトロルの戦士。力任せの一撃は城壁にも穴をあける。' }),
  m('ロックトロル', 'trolls/troll-rocklobber', X, 'basic', 120, 3, 'U', 'トロル', [
    { name: '岩なげ', cost: [X, X], effects: [{ k: 'anySnipe', n: 50 }] },
  ], { flavor: '大岩を軽々と投げる山のトロル。狙いは粗いが、当たれば骨まで砕ける。' }),
  m('トロルジェネラル', 'trolls/troll-hero-alt', X, 'stage1', 320, 3, 'RRR', 'トロル', [
    { name: '大地の怒号', cost: [X, X, C, C], damage: 240 },
  ], {
    evolvesFrom: 'トロルウォリアー',
    ex: true,
    ability: { name: '不屈の肉体', text: '', spec: { k: 'regen', n: 30 } },
    flavor: '百の戦場を生き抜いたトロルの将軍。斬られた傷は、次の朝には塞がっている。',
  }),
  m('オオヒグマ', 'monsters/bear-alt', X, 'basic', 140, 3, 'U', 'ひぐま', [
    { name: 'ベアハッグ', cost: [X, C, C], damage: 80, suffix: '+', effects: [{ k: 'bonusIfSelfDamaged', bonus: 60 }] },
  ], { flavor: '森の主と呼ばれる巨大な熊。手負いになると手がつけられなくなる。' }),

  // ============================== DARK ==============================
  m('ソウルレス', 'undead/soulless', D, 'basic', 80, 2, 'C', 'しびと', [
    { name: 'ひっかく', cost: [D], damage: 20 },
    { name: '呪いのさけび', cost: [D, C], damage: 30, effects: [{ k: 'condition', cond: 'confused', flip: true }] },
  ], { flavor: '魂を抜かれ、術師に操られる亡者。うつろな目は何も映していない。' }),
  m('ブラウンリッチ', 'undead/brown-lich', D, 'stage1', 120, 1, 'U', 'しりょう', [
    { name: 'ダークボルト', cost: [D, C], damage: 60 },
  ], {
    evolvesFrom: 'ソウルレス',
    ability: { name: '死霊の囁き', text: '', spec: { k: 'energyFromDiscard', type: 'dark', selfDamage: 10 } },
    flavor: '死を超えて知識を求める魔術師。朽ちた指先に、冥府の力が集まる。',
  }),
  m('リッチロード', 'undead/lich', D, 'stage2', 340, 2, 'RRR', 'めいおう', [
    { name: '冥雷', cost: [D, C], damage: 60, effects: [{ k: 'benchSnipe', n: 30 }] },
    { name: '亡国の審判', cost: [D, D, C, C], damage: 180, suffix: '+', effects: [{ k: 'bonusPerDiscardMonster', per: 10, max: 100 }] },
  ], { evolvesFrom: 'ブラウンリッチ', ex: true, flavor: '滅びた王国を今も治める死霊の王。杖が光るたび、墓の底で何かが目を覚ます。' }),
  m('デスブレード', 'undead/deathblade', D, 'basic', 80, 1, 'U', 'しにがみ', [
    { name: '死の舞踏', cost: [D, C], damage: 40, suffix: '+', effects: [{ k: 'flipBonus', bonus: 50 }] },
  ], { flavor: '赤錆びた骨の剣士。倒れても倒れても、踊るように起き上がる。' }),
  m('ドラウグ', 'undead/draug', D, 'basic', 150, 3, 'R', 'ぼうれいきし', [
    { name: '冥府の戦斧', cost: [D, C, C], damage: 100 },
  ], {
    ability: { name: '呪われた鎧', text: '', spec: { k: 'damageReduce', n: 20 } },
    flavor: '王に仕えた騎士の成れの果て。主なき今も、城の門を守り続けている。',
  }),
  m('ウルフライダー', 'goblins/direwolver', D, 'basic', 100, 1, 'U', 'ゴブリン', [
    { name: '奇襲', cost: [D, C], damage: 30, effects: [{ k: 'gustBefore' }] },
  ], { flavor: '大狼にまたがるゴブリンの斥候。弱った獲物を見つけると群れから引き離す。' }),
  m('クサレオオカミ', 'undead/zombie-wolf', D, 'basic', 80, 1, 'C', 'くされオオカミ', [
    { name: '腐った牙', cost: [D, C], damage: 30, effects: [{ k: 'condition', cond: 'poisoned' }] },
  ], { flavor: '死してなお飢えに駆られる狼。遠吠えは、生者の耳には届かない。' }),

  // ============================ COLORLESS ===========================
  m('クロウマ', 'monsters/dark-horse', C, 'basic', 80, 1, 'C', 'うま', [
    { name: 'けりあげ', cost: [C, C], damage: 40 },
  ], { flavor: '夜明け前の草原を走る黒い馬。蹄の音だけが霧の中に響く。' }),
  m('ブラックスタリオン', 'monsters/black-stallion', C, 'stage1', 140, 1, 'U', 'うま', [
    { name: '黒い疾走', cost: [C, C, C], damage: 100 },
  ], {
    evolvesFrom: 'クロウマ',
    ability: { name: '疾風の脚', text: '', spec: { k: 'freeRetreat' } },
    flavor: '群れを率いる漆黒の牡馬。追いつける者は、風のほかにいない。',
  }),
  m('ホネハヤブサ', 'undead/zombie-falcon', C, 'basic', 60, 0, 'C', 'はやぶさ', [
    { name: 'ついばむ', cost: [C], damage: 20 },
  ], { flavor: '骨だけになっても空を捨てなかった隼。音もなく獲物の背後に回る。' }),
  m('ゾンビグリフォン', 'undead/zombie-gryphon', C, 'basic', 120, 2, 'U', 'グリフォン', [
    { name: '腐翼の一撃', cost: [C, C, C], damage: 90 },
  ], { flavor: '朽ちた翼でなおも空を目指すグリフォン。落ちてくるときがいちばん恐ろしい。' }),
];
