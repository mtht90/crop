// ============================================================================
// 第四章 — the lords' realms: drake houses, dwarf holds, the elven courts, the
// orders of magi, the desert khalifate, the orc hordes, the outlaw roads and
// the restless dead. Portraits from the Wesnoth add-on "Reign of the Lords".
//
// Each card is one line: name, art, type, stage, HP, retreat, rarity, species,
// flavor (and options). The attacks come from the type's moves (two per card),
// sized by stage and rarity, so the set keeps the same strength curve as the
// first three chapters.
// ============================================================================
import type { Ability, Attack, AttackEffect as Effect, EType, LegacyRarity, MonsterCard, Stage } from '../types';
import { monsterFactory } from './factory';

const m = monsterFactory('AB4');
const F: EType = 'fire', W: EType = 'water', G: EType = 'grass', L: EType = 'lightning', P: EType = 'psychic', X: EType = 'fighting', D: EType = 'dark', C: EType = 'colorless';

/** a type's moves: [weak move name, strong move name, the strong move's effects, suffix] */
type Move = [string, string, Effect[], ('+' | '×')?];
const MOVES: Record<EType, Move[]> = {
  fire: [
    ['ひのこ', '業火のつるぎ', [{ k: 'discardSelfEnergy', n: 1, type: F }]],
    ['ねっぷう', '灼熱のブレス', [{ k: 'condition', cond: 'burned' }]],
    ['ほのおのつめ', '火炎旋風', [{ k: 'spread', n: 10 }]],
    ['ひばな', '捨て身の炎', [{ k: 'selfDamage', n: 20 }]],
    ['あかつきの火', '紅蓮の連撃', [{ k: 'flipBonus', bonus: 30 }], '+'],
  ],
  water: [
    ['しぶき', '渦潮のやり', [{ k: 'oppCantRetreat' }]],
    ['みずでっぽう', '氷の波', [{ k: 'condition', cond: 'paralyzed', flip: true }]],
    ['しおかぜ', '癒しの潮', [{ k: 'healSelf', n: 20 }]],
    ['あわ', '大波の盾', [{ k: 'reduceNext', n: 20 }]],
    ['なみうち', '深海のうねり', [{ k: 'bonusPerEnergy', per: 10, on: 'opp' }], '+'],
  ],
  lightning: [
    ['でんげき', '雷鳴の槍', [{ k: 'condition', cond: 'paralyzed', flip: true }]],
    ['しびれ', '稲妻の追撃', [{ k: 'benchSnipe', n: 20 }]],
    ['ひらめき', '雷光の連打', [{ k: 'flipBonus', bonus: 30 }], '+'],
    ['かぜきり', '疾風の一撃', [{ k: 'switchSelf' }]],
    ['らいう', '天雷の裁き', [{ k: 'bonusIfOppCondition', cond: 'paralyzed', bonus: 40 }], '+'],
  ],
  grass: [
    ['はっぱ', '森のめぐみ', [{ k: 'healSelf', n: 30 }]],
    ['つるのむち', '毒のとげ', [{ k: 'condition', cond: 'poisoned' }]],
    ['こもれび', '大樹の祈り', [{ k: 'healAllSelf', n: 10 }]],
    ['かぜのや', '森がくれの射撃', [{ k: 'anySnipe', n: 30 }]],
    ['めぶき', '芽吹きの力', [{ k: 'bonusPerEnergy', per: 10, on: 'self' }], '+'],
  ],
  psychic: [
    ['ねんりき', '惑わしの光', [{ k: 'condition', cond: 'confused' }]],
    ['まほうのや', '星読みの一撃', [{ k: 'anySnipe', n: 30 }]],
    ['ささやき', '魔力の封印', [{ k: 'discardOppEnergy', n: 1, flip: true }]],
    ['ゆめみ', '眠りの呪文', [{ k: 'condition', cond: 'asleep' }]],
    ['ひかりのたま', '秘術の奔流', [{ k: 'bonusPerEnergy', per: 10, on: 'both' }], '+'],
  ],
  fighting: [
    ['なぐる', '渾身の一撃', [{ k: 'flipBonus', bonus: 30 }], '+'],
    ['たいあたり', '大地割り', [{ k: 'bonusIfOppDamaged', bonus: 30 }], '+'],
    ['けりあげ', '捨て身のぶちかまし', [{ k: 'selfDamage', n: 20 }]],
    ['かまえ', '鉄壁の構え', [{ k: 'reduceNext', n: 20 }]],
    ['いしなげ', '岩石落とし', [{ k: 'spread', n: 10 }]],
  ],
  dark: [
    ['かみつく', '毒刃', [{ k: 'condition', cond: 'poisoned' }]],
    ['しのびより', '闇討ち', [{ k: 'benchSnipe', n: 20 }]],
    ['うばう', 'かすめとる', [{ k: 'discardOppHand', n: 1 }]],
    ['のろい', '呪いの刻印', [{ k: 'bonusIfOppCondition', cond: 'poisoned', bonus: 40 }], '+'],
    ['やみのて', '恐怖の手', [{ k: 'oppCantRetreat' }]],
  ],
  colorless: [
    ['つく', '連続突き', [{ k: 'flipBonus', bonus: 30 }], '+'],
    ['きりつける', '突撃', [{ k: 'selfDamage', n: 10 }]],
    ['たてでおす', '守りの陣', [{ k: 'reduceNext', n: 20 }]],
    ['はしる', 'かけぬけ斬り', [{ k: 'switchSelf' }]],
    ['ごうれい', '軍勢の力', [{ k: 'bonusPerBench', per: 10, whose: 'self' }], '+'],
  ],
};

/** [weak cost, weak damage, strong cost, strong damage] by stage and rarity */
function sizes(t: EType, stage: Stage, r: LegacyRarity, ace: boolean): [EType[], number, EType[], number] {
  if (ace) {
    if (stage === 'basic') return [[t, C], 70, [t, t, t, C], 230];
    if (stage === 'stage1') return [[t, C], 70, [t, t, t, C], 220];
    return [[t, C], 80, [t, t, C, C], 200];
  }
  if (stage === 'basic') {
    if (r === 'C') return [[t], 10, [t, C], 30];
    if (r === 'U') return [[t], 20, [t, C], 50];
    return [[t, C], 40, [t, t, C], 90];
  }
  if (stage === 'stage1') return r === 'R' ? [[t, C], 60, [t, t, C], 110] : [[t, C], 50, [t, t, C], 90];
  return [[t, C], 60, [t, t, C, C], 150];
}

let seed = 0;
function attacks(t: EType, stage: Stage, r: LegacyRarity, ace: boolean): Attack[] {
  const mv = MOVES[t][seed++ % MOVES[t].length];
  const [c1, d1, c2, d2] = sizes(t, stage, r, ace);
  const strong: Attack = { name: mv[1], cost: c2, damage: d2, effects: mv[2] };
  if (mv[3]) strong.suffix = mv[3];
  // the aces pay for their big move
  if (ace) strong.effects = [...(mv[2] ?? []), { k: 'discardSelfEnergy', n: stage === 'basic' ? 2 : 1, type: t }];
  return [{ name: mv[0], cost: c1, damage: d1 }, strong];
}

interface O {
  from?: string;
  ability?: Ability;
  ex?: boolean;
}
function card(name: string, art: string, t: EType, stage: Stage, hp: number, retreat: number, r: LegacyRarity, species: string, flavor: string, o: O = {}): MonsterCard {
  const ace = !!o.ex;
  return m(name, `rotl/${art}`, t, stage, hp, retreat, r, species, attacks(t, stage, r, ace), { evolvesFrom: o.from, ability: o.ability, ex: o.ex, flavor });
}
const ab = (name: string, spec: Ability['spec']): Ability => ({ name, text: '', spec });

export const MONSTERS4: MonsterCard[] = [
  // ============================== FIRE ==============================
  card('ドレイクブレード', 'drakes/sword', F, 'basic', 80, 1, 'C', 'ドレイク', '剣を覚えたばかりの若いドレイク。翼より先に、剣の重さに慣れようとしている。'),
  card('ドレイクソードマスター', 'drakes/sword-master', F, 'stage1', 120, 2, 'U', 'ドレイク', '炎をまとわせた刃で斬る剣の師範。鱗に刻まれた傷の数だけ、弟子を育ててきた。', { from: 'ドレイクブレード' }),
  card('ドレイクケンセイ', 'drakes/kensai', F, 'stage2', 180, 2, 'R', 'ドレイク', '剣と炎をひとつにした剣聖。抜いた瞬間に、もう相手は焼けた鉄の匂いを嗅いでいる。', { from: 'ドレイクソードマスター' }),
  card('ドレイクノーブル', 'drakes/noble', F, 'basic', 70, 1, 'C', 'ドレイク', '名家に生まれたドレイク。槍の稽古より、家紋の盾を磨く時間のほうが長い。'),
  card('ドレイクチャンセラー', 'drakes/chancellor', F, 'stage1', 120, 2, 'U', 'ドレイク', '一族の領地を治める大臣。剣と盾を手放さず、書類にも炎の封をする。', { from: 'ドレイクノーブル' }),
  card('ドレイクオブリテレーター', 'drakes/obliterator', F, 'stage2', 190, 3, 'R', 'ドレイク', '城門ひとつを炎で消し去る破壊者。通ったあとには、溶けた石しか残らない。', { from: 'ドレイクチャンセラー' }),
  card('アポカリプスドレイク', 'drakes/apocalypse', F, 'basic', 300, 3, 'RR', 'ドレイク', '終末の炎を宿すと恐れられたドレイクの王。翼を広げると、空が夕焼けより赤く染まる。', { ex: true }),
  card('フレアスピリット', 'elementals/flare', F, 'basic', 60, 1, 'C', 'せいれい', 'かがり火から生まれた小さな炎の精。風が吹くたびに、うれしそうに背を伸ばす。'),
  card('ファイアモンスター', 'elementals/fire-monster', F, 'stage1', 120, 2, 'U', 'せいれい', '大火事のなかで目を覚ました炎の巨人。歩くたびに、足元の草が黒く焦げる。', { from: 'フレアスピリット' }),
  card('ラヴァエレメンタル', 'elementals/lava', F, 'stage2', 180, 3, 'R', 'せいれい', '火山の底でうねる溶岩の化身。冷えて固まるまでに、千年かかると言われる。', { from: 'ファイアモンスター' }),
  card('フレイムアデプト', 'magi/fire-male', F, 'basic', 60, 1, 'C', 'まどうし', '炎の杖を授かったばかりの見習い。まだ指先から火の粉がこぼれてしまう。'),
  card('フレイムソーサレス', 'magi/fire', F, 'stage1', 110, 1, 'U', 'まどうし', '炎の塔の上級魔導士。杖を振るうたび、真紅の衣がほのおのように揺れる。', { from: 'フレイムアデプト' }),
  card('ドワーフフレイムキャスター', 'dwarves/flamecaster', F, 'basic', 90, 1, 'U', 'ドワーフ', '炉の火を杖に移して戦うドワーフ。坑道の闇を、自分の炎で照らして進む。'),
  card('トロルファイアシャーマン', 'trolls/troll-fire-shaman', F, 'basic', 120, 2, 'R', 'トロル', '火の霊を呼ぶトロルの呪術師。体に描いた赤い模様が、呪文に合わせて光る。', { ability: ab('炎の祭文', { k: 'typeBoost', type: F, n: 10 }) }),
  card('オークストレイファー', 'orcs/strafer', F, 'basic', 70, 1, 'C', 'オーク', '火矢を連射するオークの射手。狙いは雑だが、矢の数で何とかしてしまう。'),

  // ============================== WATER =============================
  card('マーマンブローラー', 'other/brawler', W, 'basic', 70, 1, 'C', 'かいじん', '港の酒場で名の知れた力自慢の半魚人。拳ひとつで、どんな喧嘩も終わらせる。'),
  card('マーマンレティアリウス', 'other/retiarius', W, 'stage1', 120, 1, 'U', 'かいじん', '網と三叉の槍を操る闘士。網に絡めた相手を、潮が満ちるまで逃がさない。', { from: 'マーマンブローラー' }),
  card('マーマンキング', 'other/king', W, 'stage2', 310, 3, 'RR', 'かいじん', '七つの海を束ねる半魚人の王。王笏をかかげれば、海そのものが彼の軍勢になる。', { from: 'マーマンレティアリウス', ex: true }),
  card('マーメイドプリーステス', 'other/priestess', W, 'basic', 90, 1, 'U', 'かいじん', '海の神殿に仕える巫女。真珠の杖の光は、深い傷もやさしく閉じていく。', { ability: ab('潮の祈り', { k: 'healOnce', n: 20 }) }),
  card('マーメイドネクロマンサー', 'other/mermaid_necromancer', W, 'basic', 120, 2, 'R', 'かいじん', '沈んだ船の魂を呼びもどす海の魔女。彼女の歌が聞こえたら、もう岸は見えない。'),
  card('ウェイヴスピリット', 'elementals/wave', W, 'basic', 60, 1, 'C', 'せいれい', '波しぶきから生まれた水の精。人の形をとるのは、ほんの一瞬だけ。'),
  card('ウォーターゴッド', 'elementals/watergod', W, 'stage1', 130, 2, 'R', 'せいれい', '大海原のうねりそのものの精霊。姿は見えず、ただ巨大な波として現れる。', { from: 'ウェイヴスピリット' }),
  card('ルストルアデプト', 'magi/lustre+female', W, 'basic', 60, 1, 'C', 'まどうし', '氷の光を学ぶ若い魔導士。吐く息で、杖の先に小さな霜の花を咲かせる。'),
  card('ルストルマスター', 'magi/lustre', W, 'stage1', 110, 1, 'U', 'まどうし', '凍てつく光をあやつる老魔導士。彼の前では、流れる川さえ足を止める。', { from: 'ルストルアデプト' }),
  card('トロルフロストシャーマン', 'trolls/troll-blue-fire-shaman', W, 'basic', 110, 2, 'U', 'トロル', '青い炎で凍らせるトロルの呪術師。その炎は、燃やすかわりに氷を残す。'),

  // ============================ LIGHTNING ===========================
  card('グローリーアデプト', 'magi/mage-glory+female', L, 'basic', 80, 1, 'U', 'まどうし', '雷光の塔で学ぶ若き魔導士。白い衣のすそに、いつも小さな稲妻がはじける。'),
  card('グローリーアークメイジ', 'magi/mage-glory', L, 'stage1', 300, 2, 'RR', 'まどうし', '雷光の塔の大魔導士。杖をかかげると、晴れた空からでも雷が落ちてくる。', { from: 'グローリーアデプト', ex: true }),
  card('ドワーフアーカニスター', 'dwarves/arcanister', L, 'basic', 120, 2, 'R', 'ドワーフ', '雷石の秘術を極めたドワーフ。手のひらの雷球は、鍛冶場の炉より明るい。', { ability: ab('雷石の加護', { k: 'typeBoost', type: L, n: 10 }) }),
  card('ドワーフルーンウォリアー', 'dwarves/rune-warrior', L, 'basic', 80, 1, 'C', 'ドワーフ', 'ルーンを刻んだ剣を振るう戦士。剣に雷を宿すまで、百年かけて打ち直した。'),
  card('ドワーフルーンディバイナー', 'dwarves/rune_diviner', L, 'stage1', 130, 2, 'U', 'ドワーフ', 'ルーンで未来を読む重装の戦士。斧の一撃が落ちる場所は、もう占いで決まっている。', { from: 'ドワーフルーンウォリアー' }),
  card('メイルストロムドレイク', 'drakes/maelstrom', L, 'basic', 120, 2, 'R', 'ドレイク', '嵐の雲を住処にする白衣のドレイク。羽ばたきひとつで、空に雷の渦ができる。'),
  card('ツムジカゼ', 'elementals/wind', L, 'basic', 60, 1, 'C', 'せいれい', '荒野を駆けまわる小さな竜巻。拾ったものを、どこか遠くへ届けてしまう。'),
  card('エルフグリフォニア', 'elves/elf-gryphonier', L, 'basic', 70, 1, 'C', 'エルフ', 'グリフォンと心を通わせる若いエルフ。空の上では、どんな鳥より速い。'),
  card('エルフグリフォンナイト', 'elves/elf-gryphon-knight', L, 'stage1', 120, 1, 'U', 'エルフ', 'グリフォンに乗る森の騎士。雷雲を突き抜けて、稲妻のように舞い降りる。', { from: 'エルフグリフォニア' }),
  card('グリフォンアーチライダー', 'dwarves/arch-gryphon-rider', L, 'stage2', 180, 1, 'R', 'ドワーフ', '山の空を守るドワーフの騎手の長。彼のグリフォンは、雷鳴を聞くと喜んで鳴く。', { from: 'エルフグリフォンナイト' }),

  // ============================== GRASS =============================
  card('エルフハルバーディア', 'elves/halberdier', G, 'basic', 70, 1, 'C', 'エルフ', '長い斧槍で森の入口を守る衛兵。木々の声に耳を澄まし、侵入者を待つ。'),
  card('エルフパラゴン', 'elves/paragon', G, 'stage1', 120, 1, 'U', 'エルフ', '剣の型を極めたエルフの模範剣士。その太刀筋は、舞う木の葉のように美しい。', { from: 'エルフハルバーディア' }),
  card('エルフイモータル', 'elves/immortal', G, 'stage2', 180, 2, 'R', 'エルフ', '千年を生きた不死の剣士。剣を振るうたび、古い森の香りが戦場に広がる。', { from: 'エルフパラゴン' }),
  card('エルフハンター', 'elves/hunter', G, 'basic', 70, 1, 'C', 'エルフ', '森の獣を追う狩人。肩にかついだ剣は、獲物をさばくための道具でもある。'),
  card('エルフプラウラー', 'elves/prowler', G, 'stage1', 110, 1, 'U', 'エルフ', '夜の森を歩き回る見回り役。足音ひとつ立てず、背後に立っている。', { from: 'エルフハンター' }),
  card('エルフバトルメイデン', 'elves/battle_1', G, 'basic', 60, 1, 'C', 'エルフ', '花の枝を手にした森の乙女。小さな祈りで、仲間の疲れをはらう。'),
  card('ドライアド', 'elves/dryad', G, 'stage1', 110, 1, 'U', 'ようせい', '大樹に宿る森の妖精。透きとおった羽で、木漏れ日のあいだを舞う。', { from: 'エルフバトルメイデン' }),
  card('フェアリーヒーラー', 'elves/healer', G, 'stage2', 170, 1, 'R', 'ようせい', '森の傷を癒やす妖精の長。彼女の舞いのあとには、焼けた地面にも花が咲く。', { from: 'ドライアド', ability: ab('妖精の癒やし', { k: 'healOnce', n: 30 }) }),
  card('エルフホースアーチャー', 'elves/horse-archer', G, 'basic', 90, 1, 'U', 'エルフ', '馬上で弓を引く森の騎手。駆けながら放つ矢は、一本も外れない。'),
  card('エルフハイキング', 'elves/high-king', G, 'basic', 300, 3, 'RR', 'エルフ', 'すべての森を治める至高の王。旗をかかげれば、大森林の木々までが軍勢となる。', { ex: true }),
  card('エルフルーラー', 'elves/ruler', G, 'basic', 120, 2, 'R', 'エルフ', '辺境の森を任された領主。剣の腕と知恵で、森の民を何百年も守ってきた。'),
  card('エルフマーシャル', 'elves/elvish-marshal', G, 'basic', 110, 2, 'R', 'エルフ', '旗を背に戦う森の元帥。彼の号令で、エルフの矢はひとつの風になる。', { ability: ab('森の軍旗', { k: 'typeBoost', type: G, n: 10 }) }),
  card('エルフウェイファーラー', 'elves/wayfarer', G, 'basic', 60, 1, 'C', 'エルフ', '赤い頭巾の旅のエルフ。森から森へ渡り歩き、噂を運んでくる。'),
  card('ミスティックショット', 'elves/mystic-deadshot-portrait', G, 'basic', 90, 1, 'U', 'ようせい', '羽をもつ妖精の射手。風を読んで放つ矢は、曲がって的に吸いこまれる。'),
  card('ミスティックアーチャー', 'elves/mystic-deadshot+female-portrait', G, 'stage1', 120, 1, 'U', 'ようせい', '妖精の弓兵の隊長。羽音が聞こえたときには、もう矢が届いている。', { from: 'ミスティックショット' }),
  card('タイコジュ', 'elementals/ancient', G, 'basic', 130, 3, 'R', 'せいれい', '森でいちばん古い大樹の精霊。その根は、地の底の泉まで届いている。'),
  card('モリノセイレイ', 'elementals/shaman', G, 'basic', 80, 2, 'C', 'せいれい', '若い木に宿った森の精。風がふくと、葉っぱを鳴らして返事をする。'),
  card('アキノセイレイ', 'elementals/arch-shaman', G, 'stage1', 140, 3, 'U', 'せいれい', '秋の色に染まった大樹の精。落ち葉が舞うたび、傷ついた森がよみがえる。', { from: 'モリノセイレイ' }),
  card('ツタノケモノ', 'elementals/vine-hulk', G, 'basic', 100, 2, 'U', 'せいれい', 'つたが絡みあって獣の姿になったもの。ほどけても、すぐに元の形にもどる。'),
  card('ネイチャーアデプト', 'magi/nature+female', G, 'basic', 60, 1, 'C', 'まどうし', '森の書を読み解く若い魔導士。本を開くと、ページから若葉の香りがする。'),
  card('ネイチャーセージ', 'magi/nature', G, 'stage1', 110, 1, 'U', 'まどうし', '自然の理を知りつくした賢者。杖の先の芽が、季節を告げて花を咲かせる。', { from: 'ネイチャーアデプト' }),
  card('ウッドウォーデン', 'outlaws/warden', G, 'basic', 60, 1, 'C', 'にんげん', '森に住む弓の番人。顔を布で隠し、森を荒らす者だけを射る。'),
  card('フォレストウォーデン', 'outlaws/forest-warden', G, 'stage1', 110, 1, 'U', 'にんげん', '森の守り手の頭。背負った矢筒の矢は、森の枝から自分で削り出したもの。', { from: 'ウッドウォーデン' }),

  // ============================= PSYCHIC ============================
  card('セレスティアル', 'magi/celestial+female', P, 'basic', 80, 1, 'U', 'まどうし', '白い翼をもつ天の魔導士。祈りの言葉は、空の高いところまで届く。'),
  card('セレスティアルロード', 'magi/celestial', P, 'stage1', 300, 2, 'RR', 'まどうし', '天空の魔導士たちの長。翼を広げれば、戦場の闇がすべて晴れていく。', { from: 'セレスティアル', ex: true }),
  card('ルミナリーアデプト', 'magi/luminary+female', P, 'basic', 60, 1, 'C', 'まどうし', '光の杖を学ぶ見習いの魔導士。杖の灯で、夜の書庫をひとりで照らす。'),
  card('ルミナリーマスター', 'magi/luminary', P, 'stage1', 110, 1, 'U', 'まどうし', '光の塔の老師。杖に宿る光は、相手の心の奥まで照らし出す。', { from: 'ルミナリーアデプト' }),
  card('エルフミスティック', 'elves/elf-mystic', P, 'basic', 90, 1, 'U', 'エルフ', '森の秘術を受けつぐ巫女。杖の先の光の粒は、精霊たちの目だと言われる。'),
  card('ベニバネ', 'elves/red', P, 'basic', 60, 1, 'C', 'ようせい', '紅い羽をもつ小さな妖精。手のひらの魔法の炎で、いたずらばかりしている。'),
  card('トカゲノジュジュツシ', 'other/magic', P, 'basic', 70, 1, 'C', 'トカゲ', '湿地に住むトカゲの呪術師。マントの下で、いつも何かの呪文をつぶやいている。'),
  card('トカゲノケンジャ', 'other/sage', P, 'stage1', 110, 1, 'U', 'トカゲ', '湿地の民の知恵袋。百年分の天気を覚えていて、嵐の日を言い当てる。', { from: 'トカゲノジュジュツシ' }),
  card('ワンダラーウィザード', 'outlaws/wizard', P, 'basic', 60, 1, 'C', 'にんげん', '国を追われた流れの魔術師。どこへ行っても、杖ひとつで食べていける。'),
  card('シャドウウィザード', 'outlaws/shadow-wizard', P, 'stage1', 110, 1, 'U', 'にんげん', '禁じられた術に手を出した魔術師。毛皮の外套の奥で、赤い光がまたたく。', { from: 'ワンダラーウィザード' }),
  card('シャドウウィッチ', 'outlaws/shadow-wizard+female', P, 'basic', 90, 1, 'U', 'にんげん', '影の術を使う流れの魔女。彼女と目が合うと、自分の名前を思い出せなくなる。'),
  card('ウィッチドクター', 'outlaws/witch-doctor', P, 'basic', 60, 1, 'C', 'にんげん', '薬草と呪いを売る旅の医者。薬が効くか呪いが効くかは、払った金しだい。'),
  card('ヤミノマジョ', 'outlaws/arch-witch', P, 'stage1', 120, 1, 'R', 'にんげん', '闇の森に住む大魔女。手のひらの光の玉に、遠い国の景色が映る。', { from: 'ウィッチドクター' }),
  card('モリノオババ', 'outlaws/hag', P, 'basic', 100, 1, 'U', 'にんげん', '森の奥の小屋に住む老婆。訪ねてきた者の願いを、ひとつだけ叶えるという。', { ability: ab('古い知恵', { k: 'drawOnce', n: 1 }) }),
  card('アーケインレディ', 'humans/arcane-female', P, 'basic', 120, 2, 'R', 'にんげん', '白馬に乗る魔法騎士。槍の穂先に、秘術の光を宿して戦う。'),

  // ============================ FIGHTING ============================
  card('ドワーフランナー', 'dwarves/runner', X, 'basic', 70, 1, 'C', 'ドワーフ', '坑道と坑道のあいだを走る伝令。背負い袋には、つるはしと手紙が入っている。'),
  card('ドワーフレイジャー', 'dwarves/rager', X, 'stage1', 120, 2, 'U', 'ドワーフ', '怒ると止まらない斧の戦士。あご髭を引っぱられたら、もう誰にも止められない。', { from: 'ドワーフランナー' }),
  card('ドワーフランペイジャー', 'dwarves/rampager', X, 'stage2', 190, 2, 'R', 'ドワーフ', '戦場を暴れまわる狂戦士。両手の大斧が、岩も鎧も同じように砕く。', { from: 'ドワーフレイジャー' }),
  card('ドワーフクロスボウマン', 'dwarves/crossbowman', X, 'basic', 70, 1, 'C', 'ドワーフ', '重い弩を担ぐドワーフ。狙うのに時間はかかるが、当たれば岩も貫く。'),
  card('ドワーフアーバレスト', 'dwarves/arbalestier', X, 'stage1', 120, 2, 'U', 'ドワーフ', '大型の弩を使いこなす名射手。弦を巻く音で、敵の足がすくむ。', { from: 'ドワーフクロスボウマン' }),
  card('ドワーフバラジャー', 'dwarves/barrager', X, 'stage2', 180, 2, 'R', 'ドワーフ', '連射弩で矢の雨を降らせる砲手。一度に放つ矢で、空が暗くなる。', { from: 'ドワーフアーバレスト' }),
  card('ドワーフスミス', 'dwarves/smith', X, 'basic', 80, 1, 'C', 'ドワーフ', '炉の前で汗を流す鍛冶屋。戦が始まると、打ったばかりの槌を持って出ていく。'),
  card('ドワーフスミスマスター', 'dwarves/smith-master', X, 'stage1', 130, 2, 'U', 'ドワーフ', '名剣を何振りも生んだ鍛冶の親方。槌の一振りで、敵の剣まで打ち直す。', { from: 'ドワーフスミス' }),
  card('ドワーフヴァリアント', 'dwarves/valiant', X, 'basic', 100, 2, 'U', 'ドワーフ', '槍と盾で仲間を守る勇士。退くことを知らず、いつも列のいちばん前に立つ。'),
  card('ドワーフレジェンド', 'dwarves/hero', X, 'basic', 120, 2, 'R', 'ドワーフ', '歌に語られる伝説の戦士。角の兜を見ただけで、敵の兵が逃げ出す。'),
  card('アーチセイン', 'dwarves/arch-thane', X, 'basic', 300, 3, 'RR', 'ドワーフ', 'すべての山の砦を治めるドワーフの大王。王の宝玉は、山の心臓だと言われる。', { ex: true }),
  card('ドワーフロアマスター', 'dwarves/loremaster', X, 'basic', 100, 1, 'U', 'ドワーフ', '一族の歴史を語り継ぐ学者。古い書の知恵で、仲間に戦い方を教える。', { ability: ab('古き書の教え', { k: 'drawOnce', n: 1 }) }),
  card('ドワーフアバランチ', 'dwarves/avalanche', X, 'basic', 120, 2, 'R', 'ドワーフ', '雪崩を呼ぶ秘術を使う山の賢者。一声で、山の雪が敵の頭上に落ちる。'),
  card('ロイヤルドラゴニア', 'dwarves/royal-dragonier', X, 'basic', 90, 2, 'U', 'ドワーフ', '竜の頭の銃を持つ王家の近衛。火を噴く銃口は、本物の竜を模して作られた。'),
  card('イワノキョジン', 'elementals/stone', X, 'basic', 110, 3, 'U', 'せいれい', '岩が集まってできた巨人。眠っているときは、ただの岩山にしか見えない。'),
  card('ヤマノヌシ', 'elementals/mountain', X, 'stage1', 160, 4, 'R', 'せいれい', '山そのものが目を覚ました姿。動くたびに地震が起き、谷が生まれる。', { from: 'イワノキョジン' }),
  card('オオヤク', 'elementals/monster', X, 'basic', 90, 2, 'C', 'けもの', '雪山に住む大きな毛長牛。荷物運びの名手だが、怒らせると角で突き上げる。'),
  card('ジャギュウ', 'elementals/collosus', X, 'basic', 120, 3, 'R', 'けもの', '大蛇を首に巻いた巨大な魔牛。蛇と牛、ふたつの頭がそれぞれ獲物を狙う。'),
  card('トロルブルート', 'trolls/trollwarrior', X, 'basic', 90, 2, 'C', 'トロル', '棍棒を振りまわすトロルの兵。傷ついても、ひと晩眠ればすっかり治っている。'),
  card('グレートトロル', 'trolls/greattroll', X, 'stage1', 140, 3, 'U', 'トロル', '大きな体のトロルの戦士。片手の棍棒で、城壁に穴をあける。', { from: 'トロルブルート' }),
  card('トロルジャイアント', 'trolls/giant', X, 'stage2', 200, 4, 'R', 'トロル', '山より大きいと噂されるトロルの巨人。一歩ごとに、大地がうめき声をあげる。', { from: 'グレートトロル', ability: ab('巨人の再生', { k: 'regen', n: 20 }) }),
  card('トロルロバー', 'trolls/lobber', X, 'basic', 100, 2, 'U', 'トロル', '岩を投げるのが得意なトロル。投げた岩は、山のむこうまで飛んでいく。'),
  card('オークヴァンガード', 'orcs/vanguard', X, 'basic', 70, 1, 'C', 'オーク', '軍旗をかかげて先頭を走るオーク。旗が倒れるまで、決して後ろを見ない。'),
  card('オークレイダー', 'orcs/raider', X, 'stage1', 120, 2, 'U', 'オーク', '毛皮をまとった略奪隊の頭。角の兜は、倒した獣から作った戦利品。', { from: 'オークヴァンガード' }),
  card('オークウォーモンガー', 'orcs/warmonger', X, 'stage2', 190, 2, 'R', 'オーク', '戦をなにより愛するオークの将。曲刀を抜けば、どこでも戦場にしてしまう。', { from: 'オークレイダー' }),
  card('オークプランジャー', 'orcs/plunger', X, 'basic', 70, 1, 'C', 'オーク', '大鎌をかつぐオークの兵。畑を刈るのも、敵を刈るのも同じだと思っている。'),
  card('オークポールアーム', 'orcs/polearm', X, 'stage1', 120, 2, 'U', 'オーク', '長柄の武器を自在に操るオーク。槍ぶすまで、騎兵の突撃を止める。', { from: 'オークプランジャー' }),
  card('オークラヴェジャー', 'orcs/ravager', X, 'basic', 130, 3, 'R', 'オーク', '巨大な毛長象に乗るオークの騎兵。象の足音が聞こえたら、村は逃げ出す。'),
  card('リザードストライカー', 'other/striker', X, 'basic', 70, 1, 'C', 'トカゲ', '盾と槍で戦うトカゲの戦士。身をかがめた低い構えから、いきなり跳びかかる。'),
  card('リザードチャンピオン', 'other/champion', X, 'stage1', 120, 1, 'U', 'トカゲ', 'トカゲの一族で一番の勇士。たくさんの槍を背負い、何度でも投げる。', { from: 'リザードストライカー' }),
  card('リザードアルティマター', 'other/ultimatar', X, 'stage2', 190, 2, 'R', 'トカゲ', '竜にまたがるトカゲの王者。竜と心をひとつにして、戦場を駆ける。', { from: 'リザードチャンピオン' }),

  // ============================== DARK ==============================
  card('ゾンビソルジャー', 'undead/fallen', D, 'basic', 70, 2, 'C', 'アンデッド', '戦場で倒れた兵士のなれの果て。剣を握った手だけは、まだ離そうとしない。'),
  card('ゾンビリーヴァー', 'undead/reaver', D, 'stage1', 120, 2, 'U', 'アンデッド', '鎌を振るう屍の兵。斬られた者は、次の夜には仲間になっている。', { from: 'ゾンビソルジャー' }),
  card('ソウルレスロード', 'undead/soulless', D, 'stage2', 180, 3, 'R', 'アンデッド', '魂を失った者たちの主。うつろな目に見つめられると、体が動かなくなる。', { from: 'ゾンビリーヴァー' }),
  card('スケルトンハンター', 'undead/hunter', D, 'basic', 60, 1, 'C', 'アンデッド', '骨の弓を引く屍の狩人。眠らず、疲れず、獲物を地の果てまで追う。'),
  card('ボーンパイレーツ', 'undead/bone-pirate', D, 'stage1', 110, 1, 'U', 'アンデッド', '沈んだ海賊船から上がってきた骸骨。宝の匂いをかぎつけると、すぐに現れる。', { from: 'スケルトンハンター' }),
  card('スリザーブレード', 'undead/slitherblade', D, 'basic', 70, 1, 'C', 'アンデッド', '赤い骨の剣士。地面を這うように動き、足元から斬りつけてくる。'),
  card('ドゥームウォーデン', 'undead/doomwarden', D, 'stage1', 120, 2, 'U', 'アンデッド', '滅びの門を守る赤骨の番人。その大斧は、生きた者の気配に反応して鳴る。', { from: 'スリザーブレード' }),
  card('ボーンデストロイヤー', 'undead/destroyer', D, 'stage2', 190, 3, 'R', 'アンデッド', '真紅の鎧をまとう骸骨の将。戦場の血を吸って、鎧はますます赤くなる。', { from: 'ドゥームウォーデン' }),
  card('ドレッドリッチ', 'undead/dread', D, 'basic', 90, 1, 'U', 'アンデッド', '紫の炎をまとう骸骨の魔術師。彼が笑うと、墓場の灯がいっせいに消える。'),
  card('エターナルリッチ', 'undead/eternal', D, 'stage1', 140, 2, 'R', 'アンデッド', '砂時計を手にした不滅の魔術師。時を止める術で、千年を生きながらえた。', { from: 'ドレッドリッチ' }),
  card('リッチプリンス', 'undead/prince', D, 'stage2', 310, 3, 'RR', 'アンデッド', '死者の国を継ぐ闇の王子。巻物に名を書かれた者は、必ず死者の列に加わる。', { from: 'エターナルリッチ', ex: true }),
  card('クロークドリッチ', 'undead/cloaked', D, 'basic', 80, 1, 'C', 'アンデッド', '黒い外套に身をつつむ屍の魔術師。外套の中には、骨と冷気しかない。'),
  card('ネクロマンサー', 'undead/arch-necromancer+female', D, 'basic', 90, 1, 'U', 'にんげん', '死者の声を聞く女魔術師。髑髏の杖で、眠る骨を呼び起こす。'),
  card('アークネクロマンサー', 'undead/arch-necromancer', D, 'stage1', 140, 2, 'R', 'にんげん', '死霊術を極めた老魔術師。手の中の青い炎は、とらえた魂の灯だという。', { from: 'ネクロマンサー', ability: ab('死霊の呼び声', { k: 'searchBasicOnce' }) }),
  card('デスクルセイダー', 'undead/death-crusader', D, 'basic', 100, 2, 'U', 'アンデッド', '聖戦の途中で倒れた騎士の屍。祈りを忘れても、剣の型だけは覚えている。'),
  card('フェイスレスナイト', 'undead/faceless-knight', D, 'basic', 100, 2, 'U', 'アンデッド', '顔のない黒騎士。兜の奥をのぞいた者は、二度と朝を迎えられない。'),
  card('アビスライダー', 'undead/abyssrider', D, 'basic', 130, 2, 'R', 'アンデッド', '奈落の馬を駆る死の騎士。青く燃える剣の跡が、夜道にいつまでも残る。'),
  card('デスマーシャル', 'undead/marshal', D, 'basic', 110, 2, 'R', 'アンデッド', '屍の軍勢を率いる元帥。戦斧の一振りで、骸骨の兵がいっせいに立ち上がる。', { ability: ab('屍の号令', { k: 'typeBoost', type: D, n: 10 }) }),
  card('ケイブバット', 'undead/cave-bat', D, 'basic', 50, 0, 'C', 'けもの', '洞窟に住む大コウモリ。闇のなかでも、獲物の心臓の音を聞き分ける。'),
  card('エルフインフィルトレイター', 'elves/infiltrator', D, 'basic', 60, 1, 'C', 'エルフ', '敵陣にもぐりこむ森の間者。昼は商人、夜は弓を持った影になる。'),
  card('エルフオペレイティヴ', 'elves/operative', D, 'stage1', 110, 1, 'U', 'エルフ', '黒い覆面の密偵。彼が届ける知らせは、いつも誰かの最期を告げる。', { from: 'エルフインフィルトレイター' }),
  card('エルフアサシン', 'elves/assassin', D, 'stage2', 170, 1, 'R', 'エルフ', '森の影から放たれる一本の矢。名を知る者は、もうこの世にいない。', { from: 'エルフオペレイティヴ' }),
  card('エルフィンアサシン', 'elves/assassin+female', D, 'basic', 90, 1, 'U', 'エルフ', '黒衣の女暗殺者。弓を引くとき、彼女は一度もまばたきをしない。'),
  card('アーマードバンディット', 'outlaws/armoured-bandit', D, 'basic', 70, 1, 'C', 'にんげん', '奪った鎧を身につけた山賊。顔を布で覆い、街道の通行料を取り立てる。'),
  card('アーマードハイウェイマン', 'outlaws/armored-highwayman', D, 'stage1', 120, 2, 'U', 'にんげん', '街道を荒らす山賊団の頭。鎖の鎚を一振りすれば、馬車ごと止まる。', { from: 'アーマードバンディット' }),
  card('マスターアサシン', 'outlaws/master-assassin', D, 'stage2', 170, 1, 'R', 'にんげん', '裏の世界に名をとどろかせる暗殺者。仕事の前に、相手に花を一輪送るという。', { from: 'アーマードハイウェイマン' }),
  card('プランダラー', 'outlaws/plunderer', D, 'basic', 80, 1, 'C', 'にんげん', '鹿の角の兜をかぶる騎馬の略奪者。奪った宝を、その日のうちに使いきる。'),
  card('アウトローナイト', 'outlaws/knight', D, 'basic', 90, 1, 'U', 'にんげん', '主を失った騎士。覆面の下の顔を知る者は、今では仲間の山賊だけ。'),
  card('アウトローアーチャー', 'outlaws/orion', D, 'basic', 60, 1, 'C', 'にんげん', '森にひそむ盗賊の弓兵。狙うのは、いつも金貨の袋をさげた旅人だ。'),
  card('レヴォリューショナリー', 'outlaws/revolutionary', D, 'basic', 80, 1, 'C', 'にんげん', '王を倒すと誓った反乱の指導者。黒い頭巾の下で、静かに次の手を考える。'),
  card('ウルフブレード', 'outlaws/honour-blade', D, 'basic', 70, 1, 'C', 'じゅうじん', '狼の顔をもつ獣人の剣士。仲間との約束だけは、命にかえても守る。'),
  card('ウルフハート', 'outlaws/wolf-heart', D, 'stage1', 130, 1, 'U', 'じゅうじん', '狼の一族を率いる獣人の勇者。月の光を背に受けると、剣がいっそう鋭くなる。', { from: 'ウルフブレード' }),
  card('マスターオブダークネス', 'outlaws/master_of_darkness', D, 'basic', 120, 2, 'R', 'にんげん', '闇の結社をたばねる男。両手の刃は、光をすべて吸いこむ黒鉄でできている。', { ability: ab('闇の契約', { k: 'damageReduce', n: 20 }) }),
  card('オークスノーシャーマン', 'orcs/shaman', D, 'basic', 60, 1, 'C', 'オーク', '雪原の部族の呪術師。毛皮の頭巾の下で、精霊の言葉をささやく。'),
  card('オークソーサラー', 'orcs/sorcerer', D, 'stage1', 110, 1, 'U', 'オーク', '髑髏の杖をもつオークの妖術師。呪文ひとつで、敵の兵をすくませる。', { from: 'オークスノーシャーマン' }),
  card('オークコンジャラー', 'orcs/conjurer', D, 'stage2', 170, 2, 'R', 'オーク', '大地の霊を呼び出す大妖術師。顔に刻んだ紋様は、呼んだ霊の数だけある。', { from: 'オークソーサラー' }),
  card('オークニンジャ', 'orcs/ninja', D, 'basic', 70, 1, 'C', 'オーク', '夜に動くオークの忍び。大きな体なのに、屋根の上を音もなく走る。'),
  card('オークストーカー', 'orcs/stalker', D, 'basic', 90, 1, 'U', 'オーク', '獲物を何日でも追う狩人のオーク。鎌と鎖で、逃げる足を絡めとる。'),
  card('ゴブリンマローダー', 'orcs/goblin-marauder', D, 'basic', 60, 1, 'C', 'ゴブリン', '大蜘蛛に乗るゴブリンの略奪兵。蜘蛛の糸で、崖も壁も登ってくる。'),
  card('ワーグ', 'orcs/warg', D, 'basic', 70, 1, 'C', 'けもの', '黒い毛皮の大狼。群れの遠吠えが聞こえたら、すぐに火を焚けと言われる。'),
  card('ワーグライダー', 'orcs/warg-rider', D, 'stage1', 120, 1, 'U', 'ゴブリン', '大狼にまたがるゴブリンの騎兵。狼と一緒になって、獲物を追いつめる。', { from: 'ワーグ' }),

  // ============================ COLORLESS ===========================
  card('ヴェリテス', 'humans/velite', C, 'basic', 70, 1, 'C', 'にんげん', '松明と槍をもつ軽装の兵。夜の見張りで、誰よりも早く敵に気づく。'),
  card('センチネル', 'humans/sentinel', C, 'stage1', 120, 2, 'U', 'にんげん', '旗と剣で城門を守る衛兵。一歩も動かずに、何日でも立ち続ける。', { from: 'ヴェリテス' }),
  card('ウォーマスター', 'humans/warmaster', C, 'stage2', 180, 2, 'R', 'にんげん', '百の戦を生き抜いた剣の達人。兵たちは、彼の背中を見て戦い方を覚える。', { from: 'センチネル' }),
  card('クロスボウガード', 'humans/crossbowman', C, 'basic', 70, 1, 'C', 'にんげん', '城壁の上で弩をかまえる兵。毎朝、矢の数を数えるのが日課。'),
  card('ホーリーボウマスター', 'humans/holy-bowmaster', C, 'stage1', 120, 1, 'U', 'にんげん', '聖なる弓の名手。祈りをこめた矢は、闇の者の鎧も貫く。', { from: 'クロスボウガード' }),
  card('オグジリアリー', 'humans/auxiliary', C, 'basic', 70, 1, 'C', 'にんげん', '黒い馬に乗る援軍の騎兵。どの戦場にも、いちばん最後にやってくる。'),
  card('ホースランサー', 'humans/horse-lancer', C, 'stage1', 120, 1, 'U', 'にんげん', '長槍で突撃する騎兵。馬と槍がひとつになったとき、城門すら破る。', { from: 'オグジリアリー' }),
  card('スカイダー', 'humans/scythe', C, 'basic', 70, 1, 'C', 'にんげん', '戦鎌をかつぐ重装の兵。刈りとるのは麦ではなく、敵の槍の林。'),
  card('エクスキューショナー', 'humans/excecutioner', C, 'stage1', 120, 2, 'U', 'にんげん', '大斧槍をふるう処刑人。彼の通ったあとに、立っている者はいない。', { from: 'スカイダー' }),
  card('アイアンナイト', 'humans/iron', C, 'basic', 90, 2, 'U', 'にんげん', '全身を鉄でおおった騎士。矢も剣も、その鎧に傷ひとつつけられない。'),
  card('デストロイヤーナイト', 'humans/destroyer', C, 'stage1', 140, 2, 'R', 'にんげん', '黒鉄の鎧と鎖の鎚の騎士。彼が来ると、敵の盾はただの板切れになる。', { from: 'アイアンナイト' }),
  card('デシメイター', 'humans/decimator', C, 'stage2', 190, 3, 'R', 'にんげん', '角の兜をかぶる黄金鎧の大将。一振りで、十人の兵をなぎ払う。', { from: 'デストロイヤーナイト' }),
  card('クルセイダー', 'humans/crusader', C, 'basic', 90, 2, 'U', 'にんげん', '聖なる誓いをたてた騎士。盾の紋章は、守るべき人々の数だけ傷がある。'),
  card('フェニックスナイト', 'humans/phoenixknight', C, 'stage1', 150, 2, 'R', 'にんげん', '不死鳥の兜の騎士。倒れても、何度でも立ち上がるという伝説をもつ。', { from: 'クルセイダー' }),
  card('エピックナイト', 'humans/epic', C, 'basic', 90, 1, 'U', 'にんげん', '吟遊詩人の歌に出てくる騎士。本人は、そんなに強くないと言って笑う。'),
  card('ライトウォーデン', 'humans/warden_of_light', C, 'basic', 120, 2, 'R', 'にんげん', '光の守護者。剣を胸にかかげると、まわりの仲間の傷がふさがっていく。', { ability: ab('光の守り', { k: 'healOnce', n: 20 }) }),
  card('ロイヤルガード', 'humans/royal', C, 'basic', 90, 2, 'U', 'にんげん', '王の盾となる近衛兵。赤い羽根飾りは、王に選ばれた者だけの印。'),
  card('セイバーノーブル', 'humans/saber', C, 'basic', 90, 1, 'U', 'にんげん', '東方から来た貴族の剣士。曲刀と丸い盾で、優雅に戦う。'),
  card('ドラゴンナイト', 'humans/dragon', C, 'basic', 300, 3, 'RR', 'にんげん', '赤竜と契りを結んだ騎士。竜の炎と騎士の剣が、ひとつの軍勢に勝る。', { ex: true }),
  card('ラシク', 'khalifate/rasikh', C, 'basic', 70, 1, 'C', 'さばくのたみ', '砂漠の国の若い槍兵。丸い盾には、母の名を刻んである。'),
  card('サブト', 'khalifate/thabt', C, 'stage1', 120, 2, 'U', 'さばくのたみ', '砂漠の国の重装兵。金の盾と斧槍で、砂嵐の中でも列を崩さない。', { from: 'ラシク' }),
  card('ムファリク', 'khalifate/mufariq', C, 'stage2', 180, 2, 'R', 'さばくのたみ', '白馬に乗る黄金の騎士団長。槍をかかげれば、砂の騎兵が地平を埋める。', { from: 'サブト' }),
  card('バタル', 'khalifate/batal', C, 'basic', 70, 1, 'C', 'さばくのたみ', '斧と盾の砂漠の戦士。昼の暑さにも夜の寒さにも、文句を言わない。'),
  card('ハルバ', 'khalifate/harba', C, 'stage1', 130, 2, 'U', 'さばくのたみ', '黄金の馬に乗る重騎兵。突撃の砂煙は、遠い町からも見えるという。', { from: 'バタル' }),
  card('デザートアーチャー', 'khalifate/archer', C, 'basic', 60, 1, 'C', 'さばくのたみ', '白い布で日差しをよける砂漠の弓兵。蜃気楼のむこうの的も外さない。'),
  card('ハキム', 'khalifate/hakim', C, 'basic', 90, 1, 'U', 'さばくのたみ', '旅の薬師。袋の中の薬瓶は、砂漠のどんな毒にも効くという。', { ability: ab('砂漠の薬', { k: 'healOnce', n: 20 }) }),
  card('ペリン', 'khalifate/perrin', C, 'basic', 90, 1, 'U', 'さばくのたみ', '神殿の老司祭。手をかざすだけで、迷った旅人に道を示す。', { ability: ab('神殿の導き', { k: 'searchBasicOnce' }) }),
  card('ティニーン', 'khalifate/tineen', C, 'basic', 70, 1, 'C', 'さばくのたみ', '頭巾で顔を隠した砂漠の密偵。火の矢の合図で、仲間に知らせを送る。'),
  card('ジャワル', 'khalifate/Jawal', C, 'basic', 90, 1, 'U', 'さばくのたみ', '白馬で砂漠を旅する占い師。水晶玉に、明日の天気と敵の数を映す。'),
  card('アーリズ', 'khalifate/aariz', C, 'basic', 70, 1, 'C', 'さばくのたみ', '鱗の鎧の砂漠の商人。剣より先に、まず値段の交渉をはじめる。'),
  card('アルカビール', 'khalifate/alkabir', C, 'stage1', 130, 2, 'U', 'さばくのたみ', '黄金の馬に乗る大商人の護衛隊長。荷を狙う盗賊は、彼の槍の前で逃げ出す。', { from: 'アーリズ' }),
  card('ミグワール', 'khalifate/mighwar', C, 'basic', 70, 1, 'C', 'さばくのたみ', '鎖かたびらの砂漠の兵士。短剣を口にくわえて、城壁をよじ登る。'),
];
