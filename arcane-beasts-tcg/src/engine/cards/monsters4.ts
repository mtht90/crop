// ============================================================================
// 第四章「諸王の時代」 — the lords' realms: elven courts, dwarf holds, the orders
// of magi, the desert khalifate, the orc hordes, the outlaw roads and the
// restless dead. Portraits from the Wesnoth add-on "Reign of the Lords"
// (only those that do not look like a card of the first three chapters).
//
// Each card is one line: name, art, type, stage, HP, retreat, rarity, species,
// flavor, and its two moves: [weak move, strong move, the strong move's effect,
// (the weak move's effect)]. The damage comes from the stage and rarity, so the
// chapter keeps the strength curve of the first three.
// ============================================================================
import type { Ability, Attack, AttackEffect, EType, LegacyRarity, MonsterCard, Stage } from '../types';
import { monsterFactory } from './factory';

const m = monsterFactory('AB4');
const F: EType = 'fire', W: EType = 'water', G: EType = 'grass', L: EType = 'lightning', P: EType = 'psychic', X: EType = 'fighting', D: EType = 'dark', C: EType = 'colorless';

/** the effects a move can carry ('+' ones add to the printed damage) */
const E = {
  burn: [{ k: 'condition', cond: 'burned' }],
  poison: [{ k: 'condition', cond: 'poisoned' }],
  para: [{ k: 'condition', cond: 'paralyzed', flip: true }],
  conf: [{ k: 'condition', cond: 'confused' }],
  sleep: [{ k: 'condition', cond: 'asleep' }],
  spread: [{ k: 'spread', n: 10 }],
  bench: [{ k: 'benchSnipe', n: 20 }],
  snipe: [{ k: 'anySnipe', n: 30 }],
  heal: [{ k: 'healSelf', n: 30 }],
  healAll: [{ k: 'healAllSelf', n: 10 }],
  reduce: [{ k: 'reduceNext', n: 20 }],
  prevent: [{ k: 'preventNext', flip: true }],
  trap: [{ k: 'oppCantRetreat' }],
  strip: [{ k: 'discardOppEnergy', n: 1, flip: true }],
  hand: [{ k: 'discardOppHand', n: 1 }],
  draw: [{ k: 'draw', n: 1 }],
  swap: [{ k: 'switchSelf' }],
  gust: [{ k: 'gustBefore' }],
  recoil: [{ k: 'selfDamage', n: 20 }],
  mill: [{ k: 'millOpp', n: 1 }],
  coin: [{ k: 'flipBonus', bonus: 30 }],
  crowd: [{ k: 'bonusPerBench', per: 10, whose: 'self' }],
  power: [{ k: 'bonusPerEnergy', per: 10, on: 'self' }],
  drain: [{ k: 'bonusPerEnergy', per: 10, on: 'opp' }],
  hurt: [{ k: 'bonusIfOppDamaged', bonus: 30 }],
  berserk: [{ k: 'bonusIfSelfDamaged', bonus: 30 }],
  venom: [{ k: 'bonusIfOppCondition', cond: 'poisoned', bonus: 40 }],
  shock: [{ k: 'bonusIfOppCondition', cond: 'paralyzed', bonus: 40 }],
  graves: [{ k: 'bonusPerDiscardMonster', per: 10, max: 60 }],
} satisfies Record<string, AttackEffect[]>;
type EK = keyof typeof E;
const PLUS = new Set<EK>(['coin', 'crowd', 'power', 'drain', 'hurt', 'berserk', 'venom', 'shock', 'graves']);

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

/** [weak move, strong move, strong effect, weak effect] */
type Moves = [string, string, EK?, EK?];

interface O {
  from?: string;
  ability?: Ability;
  ex?: boolean;
}
function card(name: string, art: string, t: EType, stage: Stage, hp: number, retreat: number, r: LegacyRarity, species: string, flavor: string, mv: Moves, o: O = {}): MonsterCard {
  const ace = !!o.ex;
  const [c1, d1, c2, d2] = sizes(t, stage, r, ace);
  const [n1, n2, e2, e1] = mv;
  const weak: Attack = { name: n1, cost: c1, damage: d1, ...(e1 ? { effects: E[e1] } : {}) };
  const strong: Attack = { name: n2, cost: c2, damage: d2, effects: [...(e2 ? E[e2] : [])] };
  if (e2 && PLUS.has(e2)) strong.suffix = '+';
  // the aces pay for their big move
  if (ace) strong.effects = [...(strong.effects ?? []), { k: 'discardSelfEnergy', n: stage === 'basic' ? 2 : 1, type: t }];
  if (!strong.effects?.length) delete strong.effects;
  return m(name, `rotl/${art}`, t, stage, hp, retreat, r, species, [weak, strong], { evolvesFrom: o.from, ability: o.ability, ex: o.ex, flavor });
}
const ab = (name: string, spec: Ability['spec']): Ability => ({ name, text: '', spec });

export const MONSTERS4: MonsterCard[] = [
  // ============================== FIRE ==============================
  card('フレアスピリット', 'elementals/flare', F, 'basic', 60, 1, 'C', 'せいれい', 'かがり火から生まれた小さな炎の精。風が吹くたびに、うれしそうに背を伸ばす。', ['ゆらめき', 'ひのこまい', 'burn']),
  card('ファイアモンスター', 'elementals/fire-monster', F, 'stage1', 120, 2, 'U', 'せいれい', '大火事のなかで目を覚ました炎の巨人。歩くたびに、足元の草が黒く焦げる。', ['もえうつり', '大火の抱擁', 'spread'], { from: 'フレアスピリット' }),
  card('ラヴァエレメンタル', 'elementals/lava', F, 'stage2', 180, 3, 'R', 'せいれい', '火山の底でうねる溶岩の化身。冷えて固まるまでに、千年かかると言われる。', ['ようがんだま', '噴火口の怒り', 'power'], { from: 'ファイアモンスター' }),
  card('フレイムソーサレス', 'magi/fire', F, 'basic', 300, 2, 'RR', 'まどうし', '炎の塔の頂に立つ大魔導士。杖を振るうたび、真紅の衣が炎そのものになって揺れる。', ['紅蓮の杖', '炎の塔の大魔法', 'burn'], { ex: true }),
  card('ルミナリーマスター', 'magi/luminary', F, 'basic', 90, 1, 'U', 'まどうし', '灯火の杖をもつ老導師。杖の火は、六十年いちども消えたことがない。', ['ともしび', '導きの炎', 'hurt']),
  card('トロルファイアシャーマン', 'trolls/troll-fire-shaman', F, 'basic', 120, 2, 'R', 'トロル', '火の霊を呼ぶトロルの呪術師。体に描いた赤い模様が、呪文に合わせて光る。', ['ひのまじない', '火霊の踊り', 'recoil'], { ability: ab('炎の祭文', { k: 'typeBoost', type: F, n: 10 }) }),
  card('オークストレイファー', 'orcs/strafer', F, 'basic', 70, 1, 'C', 'オーク', '火矢を連射するオークの射手。狙いは雑だが、矢の数で何とかしてしまう。', ['ひや', 'めくら撃ち', 'coin']),

  // ============================== WATER =============================
  card('マーマンレティアリウス', 'other/retiarius', W, 'basic', 90, 1, 'U', 'かいじん', '網と三叉の槍を操る半魚人の闘士。網に絡めた相手を、潮が満ちるまで逃がさない。', ['あみうち', '三叉の網突き', 'trap']),
  card('マーマンキング', 'other/king', W, 'stage1', 300, 3, 'RR', 'かいじん', '七つの海を束ねる半魚人の王。王笏をかかげれば、海そのものが彼の軍勢になる。', ['王笏のしぶき', '七つの海の大号令', 'crowd'], { from: 'マーマンレティアリウス', ex: true }),
  card('マーメイドプリーステス', 'other/priestess', W, 'basic', 90, 1, 'U', 'かいじん', '海の神殿に仕える巫女。真珠の杖の光は、深い傷もやさしく閉じていく。', ['しんじゅのひかり', '満ち潮の祈り', 'healAll'], { ability: ab('潮の祈り', { k: 'healOnce', n: 20 }) }),
  card('ウェイヴスピリット', 'elementals/wave', W, 'basic', 60, 1, 'C', 'せいれい', '波しぶきから生まれた水の精。人の形をとるのは、ほんの一瞬だけ。', ['しぶきとばし', 'うねりの手', 'para']),
  card('ウォーターゴッド', 'elementals/watergod', W, 'stage1', 130, 2, 'R', 'せいれい', '大海原のうねりそのものの精霊。姿は見えず、ただ巨大な波として現れる。', ['おおなみ', '海神の大渦', 'gust'], { from: 'ウェイヴスピリット' }),
  card('ルストルマスター', 'magi/lustre', W, 'basic', 90, 1, 'U', 'まどうし', '凍てつく光をあやつる老魔導士。彼の前では、流れる川さえ足を止める。', ['しもばしら', '凍る光', 'para']),

  // ============================ LIGHTNING ===========================
  card('グローリーアークメイジ', 'magi/mage-glory', L, 'basic', 300, 2, 'RR', 'まどうし', '雷光の塔の大魔導士。杖をかかげると、晴れた空からでも雷が落ちてくる。', ['雷光の杖', '天を裂く雷霆', 'shock', 'para'], { ex: true }),
  card('ドワーフアーカニスター', 'dwarves/arcanister', L, 'basic', 120, 2, 'R', 'ドワーフ', '雷石の秘術を極めたドワーフ。手のひらの雷球は、鍛冶場の炉より明るい。', ['らいせきだま', '雷球の炸裂', 'bench'], { ability: ab('雷石の加護', { k: 'typeBoost', type: L, n: 10 }) }),
  card('ドワーフルーンウォリアー', 'dwarves/rune-warrior', L, 'basic', 80, 1, 'C', 'ドワーフ', 'ルーンを刻んだ剣を振るう戦士。剣に雷を宿すまで、百年かけて打ち直した。', ['ルーンのけん', 'いなずま斬り', 'para']),
  card('ドワーフルーンディバイナー', 'dwarves/rune_diviner', L, 'stage1', 130, 2, 'U', 'ドワーフ', 'ルーンで未来を読む重装の戦士。斧の一撃が落ちる場所は、もう占いで決まっている。', ['うらないのおの', '予言の雷斧', 'coin'], { from: 'ドワーフルーンウォリアー' }),
  card('メイルストロムドレイク', 'drakes/maelstrom', L, 'basic', 120, 2, 'R', 'ドレイク', '嵐の雲を住処にする白衣のドレイク。羽ばたきひとつで、空に雷の渦ができる。', ['あらしのはね', '雷雲の大渦', 'spread']),
  card('ツムジカゼ', 'elementals/wind', L, 'basic', 60, 0, 'C', 'せいれい', '荒野を駆けまわる小さな竜巻。拾ったものを、どこか遠くへ届けてしまう。', ['まきあげる', 'つむじ風', 'swap']),
  card('エルフグリフォニア', 'elves/elf-gryphonier', L, 'basic', 70, 1, 'C', 'エルフ', 'グリフォンと心を通わせる若いエルフ。空の上では、どんな鳥より速い。', ['くうちゅうげり', '急降下', 'swap']),
  card('エルフグリフォンナイト', 'elves/elf-gryphon-knight', L, 'stage1', 120, 1, 'U', 'エルフ', 'グリフォンに乗る森の騎士。雷雲を突き抜けて、稲妻のように舞い降りる。', ['かみなりのつばさ', '雷雲突破', 'bench'], { from: 'エルフグリフォニア' }),

  // ============================== GRASS =============================
  card('エルフハルバーディア', 'elves/halberdier', G, 'basic', 70, 1, 'C', 'エルフ', '長い斧槍で森の入口を守る衛兵。木々の声に耳を澄まし、侵入者を待つ。', ['まもりのやり', '木霊の薙ぎ払い', 'reduce']),
  card('エルフパラゴン', 'elves/paragon', G, 'stage1', 120, 1, 'U', 'エルフ', '剣の型を極めたエルフの模範剣士。その太刀筋は、舞う木の葉のように美しい。', ['このはぎり', '落葉の剣舞', 'coin'], { from: 'エルフハルバーディア' }),
  card('エルフイモータル', 'elves/immortal', G, 'stage2', 180, 2, 'R', 'エルフ', '千年を生きた不死の剣士。剣を振るうたび、古い森の香りが戦場に広がる。', ['千年のつるぎ', '不死樹の一閃', 'heal'], { from: 'エルフパラゴン' }),
  card('エルフハンター', 'elves/hunter', G, 'basic', 70, 1, 'C', 'エルフ', '森の獣を追う狩人。肩にかついだ剣は、獲物をさばくための道具でもある。', ['けもののわな', '狩人の剣', 'trap']),
  card('エルフバトルメイデン', 'elves/battle_1', G, 'basic', 60, 1, 'C', 'エルフ', '花の枝を手にした森の乙女。小さな祈りで、仲間の疲れをはらう。', ['はなのえだ', '花の祈り', 'heal']),
  card('ドライアド', 'elves/dryad', G, 'stage1', 110, 1, 'U', 'ようせい', '大樹に宿る森の妖精。透きとおった羽で、木漏れ日のあいだを舞う。', ['こもれびのはね', '樹液の眠り', 'sleep'], { from: 'エルフバトルメイデン' }),
  card('フェアリーヒーラー', 'elves/healer', G, 'stage2', 170, 1, 'R', 'ようせい', '森の傷を癒やす妖精の長。彼女の舞いのあとには、焼けた地面にも花が咲く。', ['いやしのりんぷん', '百花繚乱', 'healAll'], { from: 'ドライアド', ability: ab('妖精の癒やし', { k: 'healOnce', n: 30 }) }),
  card('エルフホースアーチャー', 'elves/horse-archer', G, 'basic', 90, 1, 'U', 'エルフ', '馬上で弓を引く森の騎手。駆けながら放つ矢は、一本も外れない。', ['うまのり', '駆け抜け射ち', 'snipe']),
  card('エルフルーラー', 'elves/ruler', G, 'basic', 300, 3, 'RR', 'エルフ', '辺境の大森林を治める王。剣の腕と知恵で、森の民を何百年も守ってきた。', ['森の王剣', '千年樹の裁き', 'power'], { ex: true }),
  card('エルフマーシャル', 'elves/elvish-marshal', G, 'basic', 110, 2, 'R', 'エルフ', '旗を背に戦う森の元帥。彼の号令で、エルフの矢はひとつの風になる。', ['ぐんきのかぜ', '全軍射撃', 'crowd'], { ability: ab('森の軍旗', { k: 'typeBoost', type: G, n: 10 }) }),
  card('モリノセイレイ', 'elementals/shaman', G, 'basic', 80, 2, 'C', 'せいれい', '若い木に宿った森の精。風がふくと、葉っぱを鳴らして返事をする。', ['はっぱのおと', 'ねっこしばり', 'trap']),
  card('アキノセイレイ', 'elementals/arch-shaman', G, 'stage1', 140, 3, 'U', 'せいれい', '秋の色に染まった大樹の精。落ち葉が舞うたび、傷ついた森がよみがえる。', ['もみじがり', '落葉の帳', 'healAll'], { from: 'モリノセイレイ' }),
  card('ツタノケモノ', 'elementals/vine-hulk', G, 'basic', 100, 2, 'U', 'せいれい', 'つたが絡みあって獣の姿になったもの。ほどけても、すぐに元の形にもどる。', ['からみつく', '毒つたの牙', 'poison']),
  card('ネイチャーアデプト', 'magi/nature+female', G, 'basic', 60, 1, 'C', 'まどうし', '森の書を読み解く若い魔導士。本を開くと、ページから若葉の香りがする。', ['わかばのしょ', '芽吹きの詩', 'heal']),
  card('ネイチャーセージ', 'magi/nature', G, 'stage1', 110, 1, 'U', 'まどうし', '自然の理を知りつくした賢者。杖の先の芽が、季節を告げて花を咲かせる。', ['しぜんのことわり', '四季巡り', 'power', 'draw'], { from: 'ネイチャーアデプト' }),
  card('ウッドウォーデン', 'outlaws/warden', G, 'basic', 60, 1, 'C', 'にんげん', '森に住む弓の番人。顔を布で隠し、森を荒らす者だけを射る。', ['こだちのや', '番人の一矢', 'hurt']),
  card('フォレストウォーデン', 'outlaws/forest-warden', G, 'stage1', 110, 1, 'U', 'にんげん', '森の守り手の頭。背負った矢筒の矢は、森の枝から自分で削り出したもの。', ['しげみうち', '森の掟', 'snipe'], { from: 'ウッドウォーデン' }),

  // ============================= PSYCHIC ============================
  card('セレスティアル', 'magi/celestial+female', P, 'basic', 80, 1, 'U', 'まどうし', '白い翼をもつ天の魔導士。祈りの言葉は、空の高いところまで届く。', ['てんのいのり', '白翼の光', 'prevent']),
  card('セレスティアルロード', 'magi/celestial', P, 'stage1', 300, 2, 'RR', 'まどうし', '天空の魔導士たちの長。翼を広げれば、戦場の闇がすべて晴れていく。', ['天翼の杖', '天上の審判', 'conf'], { from: 'セレスティアル', ex: true }),
  card('エルフミスティック', 'elves/elf-mystic', P, 'basic', 90, 1, 'U', 'エルフ', '森の秘術を受けつぐ巫女。杖の先の光の粒は、精霊たちの目だと言われる。', ['せいれいのめ', '精霊の囁き', 'strip']),
  card('ベニバネ', 'elves/red', P, 'basic', 60, 0, 'C', 'ようせい', '紅い羽をもつ小さな妖精。手のひらの魔法の炎で、いたずらばかりしている。', ['いたずら', 'まどわしの粉', 'conf']),
  card('トカゲノジュジュツシ', 'other/magic', P, 'basic', 70, 1, 'C', 'トカゲ', '湿地に住むトカゲの呪術師。マントの下で、いつも何かの呪文をつぶやいている。', ['つぶやき', 'しめった呪い', 'sleep']),
  card('トカゲノケンジャ', 'other/sage', P, 'stage1', 110, 1, 'U', 'トカゲ', '湿地の民の知恵袋。百年分の天気を覚えていて、嵐の日を言い当てる。', ['ちえぶくろ', '百年の予言', 'mill', 'draw'], { from: 'トカゲノジュジュツシ' }),
  card('ワンダラーウィザード', 'outlaws/wizard', P, 'basic', 60, 1, 'C', 'にんげん', '国を追われた流れの魔術師。どこへ行っても、杖ひとつで食べていける。', ['ながれぼし', 'かくし術', 'hand']),
  card('シャドウウィザード', 'outlaws/shadow-wizard', P, 'stage1', 110, 1, 'U', 'にんげん', '禁じられた術に手を出した魔術師。毛皮の外套の奥で、赤い光がまたたく。', ['かげのひ', '禁呪の奔流', 'drain'], { from: 'ワンダラーウィザード' }),
  card('ウィッチドクター', 'outlaws/witch-doctor', P, 'basic', 70, 1, 'C', 'にんげん', '薬草と呪いを売る旅の医者。薬が効くか呪いが効くかは、払った金しだい。', ['あやしいくすり', '呪いの処方', 'poison']),
  card('モリノオババ', 'outlaws/hag', P, 'basic', 100, 1, 'U', 'にんげん', '森の奥の小屋に住む老婆。訪ねてきた者の願いを、ひとつだけ叶えるという。', ['むかしばなし', '老婆の呪文', 'sleep'], { ability: ab('古い知恵', { k: 'drawOnce', n: 1 }) }),
  card('アーケインレディ', 'humans/arcane-female', P, 'basic', 120, 2, 'R', 'にんげん', '白馬に乗る魔法騎士。槍の穂先に、秘術の光を宿して戦う。', ['ひじゅつのやり', '秘光の突撃', 'snipe']),

  // ============================ FIGHTING ============================
  card('ドワーフランナー', 'dwarves/runner', X, 'basic', 70, 1, 'C', 'ドワーフ', '坑道と坑道のあいだを走る伝令。背負い袋には、つるはしと手紙が入っている。', ['でんれい', 'つるはし打ち', 'swap', 'draw']),
  card('ドワーフレイジャー', 'dwarves/rager', X, 'stage1', 130, 2, 'U', 'ドワーフ', '怒ると止まらない斧の戦士。あご髭を引っぱられたら、もう誰にも止められない。', ['いかりのおの', '怒髪天', 'berserk'], { from: 'ドワーフランナー' }),
  card('ドワーフクロスボウマン', 'dwarves/crossbowman', X, 'basic', 70, 1, 'C', 'ドワーフ', '重い弩を担ぐドワーフ。狙うのに時間はかかるが、当たれば岩も貫く。', ['いしゆみ', 'ねらいすまし', 'hurt']),
  card('ドワーフアーバレスト', 'dwarves/arbalestier', X, 'stage1', 120, 2, 'U', 'ドワーフ', '大型の弩を使いこなす名射手。弦を巻く音で、敵の足がすくむ。', ['おおゆみ', '貫通の矢', 'bench'], { from: 'ドワーフクロスボウマン' }),
  card('ドワーフバラジャー', 'dwarves/barrager', X, 'stage2', 180, 2, 'R', 'ドワーフ', '連射弩で矢の雨を降らせる砲手。一度に放つ矢で、空が暗くなる。', ['れんしゃ', '矢の豪雨', 'spread'], { from: 'ドワーフアーバレスト' }),
  card('ドワーフスミスマスター', 'dwarves/smith-master', X, 'basic', 100, 2, 'U', 'ドワーフ', '名剣を何振りも生んだ鍛冶の親方。槌の一振りで、敵の剣まで打ち直す。', ['おやかたのつち', '鋼砕き', 'strip']),
  card('ドワーフヴァリアント', 'dwarves/valiant', X, 'basic', 100, 2, 'U', 'ドワーフ', '槍と盾で仲間を守る勇士。退くことを知らず、いつも列のいちばん前に立つ。', ['たてのかべ', '不退転の槍', 'reduce']),
  card('ドワーフレジェンド', 'dwarves/hero', X, 'basic', 300, 3, 'RR', 'ドワーフ', '歌に語られる伝説の戦士。角の兜を見ただけで、敵の兵が逃げ出す。', ['伝説の大槌', '英雄譚の一撃', 'hurt'], { ex: true }),
  card('ドワーフロアマスター', 'dwarves/loremaster', X, 'basic', 100, 1, 'U', 'ドワーフ', '一族の歴史を語り継ぐ学者。古い書の知恵で、仲間に戦い方を教える。', ['こしょのかど', '古の戦術', 'crowd'], { ability: ab('古き書の教え', { k: 'drawOnce', n: 1 }) }),
  card('ドワーフアバランチ', 'dwarves/avalanche', X, 'basic', 120, 2, 'R', 'ドワーフ', '雪崩を呼ぶ秘術を使う山の賢者。一声で、山の雪が敵の頭上に落ちる。', ['ゆきつぶて', '大雪崩', 'spread']),
  card('イワノキョジン', 'elementals/stone', X, 'basic', 110, 3, 'U', 'せいれい', '岩が集まってできた巨人。眠っているときは、ただの岩山にしか見えない。', ['いわおとし', '岩の拳', 'reduce']),
  card('ヤマノヌシ', 'elementals/mountain', X, 'stage1', 160, 4, 'R', 'せいれい', '山そのものが目を覚ました姿。動くたびに地震が起き、谷が生まれる。', ['じなり', '大地震', 'spread'], { from: 'イワノキョジン' }),
  card('オオヤク', 'elementals/monster', X, 'basic', 90, 2, 'C', 'けもの', '雪山に住む大きな毛長牛。荷物運びの名手だが、怒らせると角で突き上げる。', ['つのつき', '雪原の突進', 'recoil']),
  card('ジャギュウ', 'elementals/collosus', X, 'basic', 120, 3, 'R', 'けもの', '大蛇を首に巻いた巨大な魔牛。蛇と牛、ふたつの頭がそれぞれ獲物を狙う。', ['へびのきば', '双頭の猛襲', 'poison']),
  card('オークヴァンガード', 'orcs/vanguard', X, 'basic', 70, 1, 'C', 'オーク', '軍旗をかかげて先頭を走るオーク。旗が倒れるまで、決して後ろを見ない。', ['はたふり', '先駆けの突撃', 'recoil']),
  card('オークレイダー', 'orcs/raider', X, 'stage1', 120, 2, 'U', 'オーク', '毛皮をまとった略奪隊の頭。角の兜は、倒した獣から作った戦利品。', ['うばいとる', '略奪の大斧', 'hand'], { from: 'オークヴァンガード' }),
  card('オークウォーモンガー', 'orcs/warmonger', X, 'stage2', 190, 2, 'R', 'オーク', '戦をなにより愛するオークの将。曲刀を抜けば、どこでも戦場にしてしまう。', ['いくさばやし', '戦狂いの曲刀', 'berserk'], { from: 'オークレイダー' }),
  card('オークプランジャー', 'orcs/plunger', X, 'basic', 70, 1, 'C', 'オーク', '大鎌をかつぐオークの兵。畑を刈るのも、敵を刈るのも同じだと思っている。', ['かりとる', 'おおがま', 'coin']),
  card('オークポールアーム', 'orcs/polearm', X, 'stage1', 120, 2, 'U', 'オーク', '長柄の武器を自在に操るオーク。槍ぶすまで、騎兵の突撃を止める。', ['やりぶすま', '長柄の薙ぎ払い', 'gust'], { from: 'オークプランジャー' }),
  card('オークラヴェジャー', 'orcs/ravager', X, 'basic', 130, 3, 'R', 'オーク', '巨大な毛長象に乗るオークの騎兵。象の足音が聞こえたら、村は逃げ出す。', ['ふみならし', '巨象の蹂躙', 'spread']),
  card('リザードストライカー', 'other/striker', X, 'basic', 70, 1, 'C', 'トカゲ', '盾と槍で戦うトカゲの戦士。身をかがめた低い構えから、いきなり跳びかかる。', ['とびかかる', '低空突き', 'coin']),
  card('リザードチャンピオン', 'other/champion', X, 'stage1', 120, 1, 'U', 'トカゲ', 'トカゲの一族で一番の勇士。たくさんの槍を背負い、何度でも投げる。', ['やりなげ', '百本槍', 'bench'], { from: 'リザードストライカー' }),

  // ============================== DARK ==============================
  card('ゾンビソルジャー', 'undead/fallen', D, 'basic', 70, 2, 'C', 'アンデッド', '戦場で倒れた兵士のなれの果て。剣を握った手だけは、まだ離そうとしない。', ['くさったけん', '屍の執念', 'graves']),
  card('ゾンビリーヴァー', 'undead/reaver', D, 'stage1', 120, 2, 'U', 'アンデッド', '鎌を振るう屍の兵。斬られた者は、次の夜には仲間になっている。', ['しにがみのかま', '屍の刈り入れ', 'graves'], { from: 'ゾンビソルジャー' }),
  card('スケルトンハンター', 'undead/hunter', D, 'basic', 60, 1, 'C', 'アンデッド', '骨の弓を引く屍の狩人。眠らず、疲れず、獲物を地の果てまで追う。', ['ほねのや', '追い詰める矢', 'trap']),
  card('ボーンパイレーツ', 'undead/bone-pirate', D, 'stage1', 110, 1, 'U', 'アンデッド', '沈んだ海賊船から上がってきた骸骨。宝の匂いをかぎつけると、すぐに現れる。', ['たからさがし', '幽霊船の略奪', 'hand'], { from: 'スケルトンハンター' }),
  card('ドレッドリッチ', 'undead/dread', D, 'basic', 90, 1, 'U', 'アンデッド', '紫の炎をまとう骸骨の魔術師。彼が笑うと、墓場の灯がいっせいに消える。', ['むらさきのひ', '墓場の灯消し', 'conf']),
  card('エターナルリッチ', 'undead/eternal', D, 'stage1', 140, 2, 'R', 'アンデッド', '砂時計を手にした不滅の魔術師。時を止める術で、千年を生きながらえた。', ['すなどけい', '時止めの呪文', 'para'], { from: 'ドレッドリッチ' }),
  card('リッチプリンス', 'undead/prince', D, 'stage2', 310, 3, 'RR', 'アンデッド', '死者の国を継ぐ闇の王子。巻物に名を書かれた者は、必ず死者の列に加わる。', ['死者の巻物', '冥府の王命', 'graves'], { from: 'エターナルリッチ', ex: true }),
  card('クロークドリッチ', 'undead/cloaked', D, 'basic', 80, 1, 'C', 'アンデッド', '黒い外套に身をつつむ屍の魔術師。外套の中には、骨と冷気しかない。', ['れいき', '凍える指先', 'poison']),
  card('ネクロマンサー', 'undead/arch-necromancer+female', D, 'basic', 90, 1, 'U', 'にんげん', '死者の声を聞く女魔術師。髑髏の杖で、眠る骨を呼び起こす。', ['しりょうのこえ', '骨の行進', 'graves']),
  card('アークネクロマンサー', 'undead/arch-necromancer', D, 'stage1', 140, 2, 'R', 'にんげん', '死霊術を極めた老魔術師。手の中の青い炎は、とらえた魂の灯だという。', ['たましいのひ', '魂喰らい', 'drain'], { from: 'ネクロマンサー', ability: ab('死霊の呼び声', { k: 'searchBasicOnce' }) }),
  card('フェイスレスナイト', 'undead/faceless-knight', D, 'basic', 100, 2, 'U', 'アンデッド', '顔のない黒騎士。兜の奥をのぞいた者は、二度と朝を迎えられない。', ['くろいけん', '虚ろの一閃', 'trap']),
  card('デスマーシャル', 'undead/marshal', D, 'basic', 110, 2, 'R', 'アンデッド', '屍の軍勢を率いる元帥。戦斧の一振りで、骸骨の兵がいっせいに立ち上がる。', ['しかばねのおの', '死者の行軍', 'crowd'], { ability: ab('屍の号令', { k: 'typeBoost', type: D, n: 10 }) }),
  card('エルフィンアサシン', 'elves/assassin+female', D, 'basic', 90, 1, 'U', 'エルフ', '黒衣の女暗殺者。弓を引くとき、彼女は一度もまばたきをしない。', ['かげのや', '狙撃の黒矢', 'snipe']),
  card('アーマードバンディット', 'outlaws/armoured-bandit', D, 'basic', 70, 1, 'C', 'にんげん', '奪った鎧を身につけた山賊。顔を布で覆い、街道の通行料を取り立てる。', ['つうこうりょう', '追いはぎ', 'hand']),
  card('アーマードハイウェイマン', 'outlaws/armored-highwayman', D, 'stage1', 120, 2, 'U', 'にんげん', '街道を荒らす山賊団の頭。鎖の鎚を一振りすれば、馬車ごと止まる。', ['くさりづち', '街道封鎖', 'trap'], { from: 'アーマードバンディット' }),
  card('マスターアサシン', 'outlaws/master-assassin', D, 'stage2', 170, 1, 'R', 'にんげん', '裏の世界に名をとどろかせる暗殺者。仕事の前に、相手に花を一輪送るという。', ['くろいはな', '最期の一刺し', 'venom', 'poison'], { from: 'アーマードハイウェイマン' }),
  card('アウトローナイト', 'outlaws/knight', D, 'basic', 90, 1, 'U', 'にんげん', '主を失った騎士。覆面の下の顔を知る者は、今では仲間の山賊だけ。', ['ふくめんのけん', '捨てた誓い', 'recoil']),
  card('アウトローアーチャー', 'outlaws/orion', D, 'basic', 60, 1, 'C', 'にんげん', '森にひそむ盗賊の弓兵。狙うのは、いつも金貨の袋をさげた旅人だ。', ['まちぶせ', 'きんかねらい', 'bench']),
  card('レヴォリューショナリー', 'outlaws/revolutionary', D, 'basic', 80, 1, 'C', 'にんげん', '王を倒すと誓った反乱の指導者。黒い頭巾の下で、静かに次の手を考える。', ['せんどう', '反乱の狼煙', 'crowd']),
  card('ウルフブレード', 'outlaws/honour-blade', D, 'basic', 70, 1, 'C', 'じゅうじん', '狼の顔をもつ獣人の剣士。仲間との約束だけは、命にかえても守る。', ['おおかみぎり', '誓いの牙', 'hurt']),
  card('ウルフハート', 'outlaws/wolf-heart', D, 'stage1', 130, 1, 'U', 'じゅうじん', '狼の一族を率いる獣人の勇者。月の光を背に受けると、剣がいっそう鋭くなる。', ['つきのとおぼえ', '月下の牙', 'coin'], { from: 'ウルフブレード' }),
  card('マスターオブダークネス', 'outlaws/master_of_darkness', D, 'basic', 120, 2, 'R', 'にんげん', '闇の結社をたばねる男。両手の刃は、光をすべて吸いこむ黒鉄でできている。', ['くろがね', '闇呑みの双刃', 'drain'], { ability: ab('闇の契約', { k: 'damageReduce', n: 20 }) }),
  card('オークスノーシャーマン', 'orcs/shaman', D, 'basic', 60, 1, 'C', 'オーク', '雪原の部族の呪術師。毛皮の頭巾の下で、精霊の言葉をささやく。', ['ゆきのまじない', '凍えの呪い', 'sleep']),
  card('オークソーサラー', 'orcs/sorcerer', D, 'stage1', 110, 1, 'U', 'オーク', '髑髏の杖をもつオークの妖術師。呪文ひとつで、敵の兵をすくませる。', ['どくろのつえ', 'すくみの呪', 'para'], { from: 'オークスノーシャーマン' }),
  card('オークコンジャラー', 'orcs/conjurer', D, 'stage2', 170, 2, 'R', 'オーク', '大地の霊を呼び出す大妖術師。顔に刻んだ紋様は、呼んだ霊の数だけある。', ['れいをよぶ', '百霊の呪縛', 'venom', 'poison'], { from: 'オークソーサラー' }),
  card('オークニンジャ', 'orcs/ninja', D, 'basic', 70, 1, 'C', 'オーク', '夜に動くオークの忍び。大きな体なのに、屋根の上を音もなく走る。', ['しのびあし', '屋根裏の一撃', 'swap']),
  card('オークストーカー', 'orcs/stalker', D, 'basic', 90, 1, 'U', 'オーク', '獲物を何日でも追う狩人のオーク。鎌と鎖で、逃げる足を絡めとる。', ['くさりがま', '追跡の鎖', 'gust']),
  card('ワーグ', 'orcs/warg', D, 'basic', 70, 1, 'C', 'けもの', '黒い毛皮の大狼。群れの遠吠えが聞こえたら、すぐに火を焚けと言われる。', ['とおぼえ', 'むれのきば', 'crowd']),

  // ============================ COLORLESS ===========================
  card('ヴェリテス', 'humans/velite', C, 'basic', 70, 1, 'C', 'にんげん', '松明と槍をもつ軽装の兵。夜の見張りで、誰よりも早く敵に気づく。', ['みはり', 'たいまつ突き', 'draw']),
  card('センチネル', 'humans/sentinel', C, 'stage1', 120, 2, 'U', 'にんげん', '旗と剣で城門を守る衛兵。一歩も動かずに、何日でも立ち続ける。', ['じょうもんまもり', '鉄の門', 'reduce'], { from: 'ヴェリテス' }),
  card('ウォーマスター', 'humans/warmaster', C, 'stage2', 180, 2, 'R', 'にんげん', '百の戦を生き抜いた剣の達人。兵たちは、彼の背中を見て戦い方を覚える。', ['しなんのけん', '百戦の剣技', 'crowd'], { from: 'センチネル' }),
  card('クロスボウガード', 'humans/crossbowman', C, 'basic', 70, 1, 'C', 'にんげん', '城壁の上で弩をかまえる兵。毎朝、矢の数を数えるのが日課。', ['じょうへきうち', 'ねらい撃ち', 'bench']),
  card('ホーリーボウマスター', 'humans/holy-bowmaster', C, 'stage1', 120, 1, 'U', 'にんげん', '聖なる弓の名手。祈りをこめた矢は、闇の者の鎧も貫く。', ['せいなるや', '祝福の一射', 'snipe'], { from: 'クロスボウガード' }),
  card('オグジリアリー', 'humans/auxiliary', C, 'basic', 70, 1, 'C', 'にんげん', '黒い馬に乗る援軍の騎兵。どの戦場にも、いちばん最後にやってくる。', ['えんぐん', 'かけつけ', 'swap']),
  card('ホースランサー', 'humans/horse-lancer', C, 'stage1', 120, 1, 'U', 'にんげん', '長槍で突撃する騎兵。馬と槍がひとつになったとき、城門すら破る。', ['ながやり', 'ランスチャージ', 'recoil'], { from: 'オグジリアリー' }),
  card('アイアンナイト', 'humans/iron', C, 'basic', 90, 2, 'U', 'にんげん', '全身を鉄でおおった騎士。矢も剣も、その鎧に傷ひとつつけられない。', ['てっこう', '鉄壁', 'reduce']),
  card('デストロイヤーナイト', 'humans/destroyer', C, 'stage1', 140, 2, 'R', 'にんげん', '黒鉄の鎧と鎖の鎚の騎士。彼が来ると、敵の盾はただの板切れになる。', ['てっつい', '盾砕き', 'strip'], { from: 'アイアンナイト' }),
  card('デシメイター', 'humans/decimator', C, 'stage2', 190, 3, 'R', 'にんげん', '角の兜をかぶる黄金鎧の大将。一振りで、十人の兵をなぎ払う。', ['おうごんのおの', '十人斬り', 'spread'], { from: 'デストロイヤーナイト' }),
  card('クルセイダー', 'humans/crusader', C, 'basic', 90, 2, 'U', 'にんげん', '聖なる誓いをたてた騎士。盾の紋章は、守るべき人々の数だけ傷がある。', ['ちかいのたて', '聖騎士の一撃', 'heal']),
  card('フェニックスナイト', 'humans/phoenixknight', C, 'stage1', 300, 3, 'RR', 'にんげん', '不死鳥の兜の騎士。倒れても、何度でも立ち上がるという伝説をもつ。', ['不死鳥の剣', '灰からの再臨', 'heal'], { from: 'クルセイダー', ex: true }),
  card('エピックナイト', 'humans/epic', C, 'basic', 90, 1, 'U', 'にんげん', '吟遊詩人の歌に出てくる騎士。本人は、そんなに強くないと言って笑う。', ['うたわれるけん', '英雄の見せ場', 'coin']),
  card('ライトウォーデン', 'humans/warden_of_light', C, 'basic', 120, 2, 'R', 'にんげん', '光の守護者。剣を胸にかかげると、まわりの仲間の傷がふさがっていく。', ['ひかりのけん', '守護の光', 'healAll'], { ability: ab('光の守り', { k: 'healOnce', n: 20 }) }),
  card('ロイヤルガード', 'humans/royal', C, 'basic', 90, 2, 'U', 'にんげん', '王の盾となる近衛兵。赤い羽根飾りは、王に選ばれた者だけの印。', ['このえのけん', '王の盾', 'prevent']),
  card('セイバーノーブル', 'humans/saber', C, 'basic', 90, 1, 'U', 'にんげん', '東方から来た貴族の剣士。曲刀と丸い盾で、優雅に戦う。', ['きょくとう', '舞踏の剣', 'swap']),
  card('ムファリク', 'khalifate/mufariq', C, 'basic', 120, 2, 'R', 'さばくのたみ', '白馬に乗る黄金の騎士団長。槍をかかげれば、砂の騎兵が地平を埋める。', ['こがねのやり', '砂の騎兵団', 'crowd']),
  card('バタル', 'khalifate/batal', C, 'basic', 70, 1, 'C', 'さばくのたみ', '斧と盾の砂漠の戦士。昼の暑さにも夜の寒さにも、文句を言わない。', ['すなのおの', '砂嵐の一撃', 'hurt']),
  card('デザートアーチャー', 'khalifate/archer', C, 'basic', 60, 1, 'C', 'さばくのたみ', '白い布で日差しをよける砂漠の弓兵。蜃気楼のむこうの的も外さない。', ['しんきろう', '陽炎の矢', 'snipe']),
  card('ペリン', 'khalifate/perrin', C, 'basic', 90, 1, 'U', 'さばくのたみ', '神殿の老司祭。手をかざすだけで、迷った旅人に道を示す。', ['みちしるべ', '神殿の加護', 'prevent'], { ability: ab('神殿の導き', { k: 'searchBasicOnce' }) }),
  card('ティニーン', 'khalifate/tineen', C, 'basic', 70, 1, 'C', 'さばくのたみ', '頭巾で顔を隠した砂漠の密偵。火の矢の合図で、仲間に知らせを送る。', ['あいずのや', '密偵の報せ', 'draw', 'draw']),
  card('ジャワル', 'khalifate/Jawal', C, 'basic', 90, 1, 'U', 'さばくのたみ', '白馬で砂漠を旅する占い師。水晶玉に、明日の天気と敵の数を映す。', ['すいしょうだま', '星占いの槍', 'mill']),
  card('ミグワール', 'khalifate/mighwar', C, 'basic', 70, 1, 'C', 'さばくのたみ', '鎖かたびらの砂漠の兵士。短剣を口にくわえて、城壁をよじ登る。', ['よじのぼる', '城壁越え', 'gust']),
];
