// ============================================================================
// 第五章「英雄の残響」 — the heroes of the old tales: princes and outlaws,
// elf wardens and dwarf smiths, necromancers who outlived their names, the
// desert folk and the dead that ride. Portraits from the Wesnoth add-on
// "Portraits for 1.16 campaigns" / "Portraits for 1.16 emulator" (the
// Battle for Wesnoth 1.16 portraits, GPL v2+), only those that do not look
// like a card of the first four chapters.
//
// Same one-line form as 第四章: name, art, type, stage, HP, retreat, rarity,
// species, flavor, [weak move, strong move, strong effect, (weak effect)].
// ============================================================================
import type { Ability, Attack, AttackEffect, EType, LegacyRarity, MonsterCard, Stage } from '../types';
import { monsterFactory } from './factory';

const m = monsterFactory('AB5');
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
  return m(name, `ch5/${art}`, t, stage, hp, retreat, r, species, [weak, strong], { evolvesFrom: o.from, ability: o.ability, ex: o.ex, flavor });
}
const ab = (name: string, spec: Ability['spec']): Ability => ({ name, text: '', spec });

export const MONSTERS5: MonsterCard[] = [
  // ============================== FIRE ==============================
  card('ヘルフレイムロード', 'camerin', F, 'basic', 300, 2, 'RR', 'じゃじゅつし', '炎を従える邪術の王。その笑い声が響くと、夜空が赤く染まる。', ['業火の杖', '煉獄の大火柱', 'burn'], { ex: true }),
  card('フレアウィッチ', 'elyssa', F, 'basic', 110, 1, 'R', 'まじょ', '指先に火の玉を灯す若い魔女。怒ると、髪の色まで燃えるように赤くなる。', ['ひのたま', '紅炎の舞', 'burn'], { ability: ab('火の手ほどき', { k: 'typeBoost', type: F, n: 10 }) }),
  card('エンバーセージ', 'ratheln', F, 'basic', 90, 1, 'U', 'まどうし', '毛皮をまとった北国の賢者。手の中の熾火は、吹雪の夜も消えない。', ['おきび', '熾火の呪文', 'hurt']),
  card('ブレイズバーバリアン', 'rakshas', F, 'basic', 120, 2, 'R', 'オーク', '炎の刺青を誇るオークの狂戦士。戦いのたびに、傷あとが一本ずつ増えていく。', ['ひのこぶし', '焦土の突撃', 'recoil']),
  card('スパークシーフ', 'shynal-outlaw', F, 'basic', 60, 1, 'C', 'ぞく', '火打ち石を盗みの道具にする少女。火花ひとつで、見張りの目をそらす。', ['ひばな', '火花の目くらまし', 'draw']),
  card('カーマインファイター', 'sisal', F, 'stage1', 110, 1, 'U', 'せんし', '赤い髪をなびかせる女剣士。盗賊あがりの身軽さで、炎のように斬りこむ。', ['あかいけん', '紅蓮の連撃', 'coin'], { from: 'スパークシーフ' }),

  // ============================== WATER =============================
  card('タイドプリンス', 'kai-krellis', W, 'basic', 300, 2, 'RR', 'かいじん', '海の底の王国を継ぐ半魚人の王子。王冠の真珠が光ると、潮が一斉に向きを変える。', ['真珠の王冠', '逆巻く大潮', 'gust'], { ex: true }),
  card('マーセイレーン', 'cylanna', W, 'basic', 90, 1, 'U', 'かいじん', '珊瑚の杖をもつ人魚の巫女。その歌は、嵐の海を一晩で鎮めるという。', ['しおのうた', '潮騒の祈り', 'healAll'], { ability: ab('珊瑚の祈り', { k: 'healOnce', n: 20 }) }),
  card('ナーガウィッチ', 'melusand', W, 'basic', 90, 1, 'U', 'ナーガ', '雷雲を呼ぶナーガの魔女。尾の一振りで、川の流れさえ逆さにする。', ['しおのまじない', '深淵の呪縛', 'para']),
  card('リバーメイデン', 'relana', W, 'basic', 60, 1, 'C', 'むらびと', '川辺の村の娘。水くみの桶ひとつで、けが人の手当てまでやってのける。', ['みずくみ', '川の恵み', 'heal']),
  card('フロストウッド', 'rithrandil', W, 'basic', 120, 3, 'R', 'じゅれい', '冬の森で眠る樹の精。枝に積もった霜は、春が来ても溶けない。', ['こおりのえだ', '霜枝の抱擁', 'para']),

  // ============================ LIGHTNING ===========================
  card('ストームアデプト', 'arthian', L, 'basic', 80, 1, 'C', 'まどうし', '青い炎を灯す見習い魔導士。まだ、自分の呼んだ雷に驚いてしまう。', ['あおいひ', '蒼雷の詠唱', 'bench']),
  card('ヘイローメイジ', 'edmond', L, 'stage1', 130, 1, 'R', 'まどうし', '頭上に光の輪をめぐらせる大魔導士。輪がひとつ回るたび、空のどこかで雷が鳴る。', ['ひかりのわ', '天輪の雷', 'shock', 'para'], { from: 'ストームアデプト' }),
  card('スパークシーア', 'orb-seer', L, 'basic', 60, 1, 'C', 'うらないし', '雷の宿る水晶をのぞく占い師。未来を見るたび、髪がぱちぱちと逆立つ。', ['ひかるたま', '稲光の予見', 'para']),
  card('エルダーボルト', 'baran', L, 'basic', 120, 2, 'R', 'まどうし', '雷の秘術を百年研いだ老魔導士。杖の一振りは、若い者の十の呪文に勝る。', ['らいめい', '老雷の裁き', 'spread']),
  card('サンダーランサー', 'owaec', L, 'basic', 110, 1, 'R', 'きし', '草原を稲妻の速さで駆ける騎馬の長。一族の馬は、雷の音を聞くと喜んで走る。', ['とつげき', '迅雷の騎行', 'swap']),

  // ============================== GRASS =============================
  card('エルフクイーン', 'uradredia', G, 'basic', 300, 2, 'RR', 'エルフ', '千年の森を治めるエルフの女王。剣を抜くと、森じゅうの木々が身をかがめる。', ['女王の剣', '聖樹の大号令', 'crowd'], { ex: true }),
  card('エルフブレイド', 'galtrid', G, 'basic', 70, 1, 'C', 'エルフ', '剣の修行を始めたばかりの若いエルフ。刃こぼれした剣を、毎晩ていねいに研ぐ。', ['きりつけ', '若葉の剣', 'coin']),
  card('エルフゴールドブレイド', 'ithelden', G, 'stage1', 120, 1, 'U', 'エルフ', '黄金の剣を授かったエルフの剣士。その刃は、森の朝日をそのまま映す。', ['こんじきのけん', '黄金樹の斬撃', 'hurt'], { from: 'エルフブレイド' }),
  card('エルフウォーデン', 'kalenz-young', G, 'basic', 90, 1, 'U', 'エルフ', '森の境を見張る若き番人。どんな足音も、三つ先の丘から聞き分ける。', ['みはり', '森の番人', 'reduce']),
  card('エルフスカウトボウ', 'landar', G, 'basic', 60, 1, 'C', 'エルフ', '身軽なエルフの弓兵。木の枝から枝へ、音もなく渡っていく。', ['とおや', '風切りの矢', 'snipe']),
  card('エルフエルダー', 'velon', G, 'basic', 90, 1, 'U', 'エルフ', '森の長老会のひとり。その歌を聞いた者は、どんな傷も忘れてしまう。', ['いにしえのうた', '長老の祝福', 'healAll'], { ability: ab('長老の癒し', { k: 'healOnce', n: 20 }) }),
  card('エルフホルンメイデン', 'elenia', G, 'basic', 60, 1, 'C', 'エルフ', '角笛で仲間を呼ぶエルフの娘。その音色は、森の端から端まで届く。', ['つのぶえ', '呼び声の角笛', 'crowd'], { ability: ab('森の呼び声', { k: 'searchBasicOnce' }) }),
  card('エルフコマンダー', 'hidel', G, 'stage1', 130, 1, 'R', 'エルフ', '赤い外套のエルフの将。角笛の合図ひとつで、森の兵がいっせいに動く。', ['しれい', '森軍の采配', 'crowd'], { from: 'エルフホルンメイデン' }),
  card('エルフホースマン', 'elurin', G, 'basic', 90, 1, 'U', 'エルフ', '白い馬で森を駆けるエルフの騎手。木々のあいだを、風のようにすり抜ける。', ['かけあし', '翠風の騎行', 'swap']),
  card('フォレストアーチャー', 'pelias', G, 'basic', 80, 1, 'U', 'かりうど', '森の狩人の弓の名手。木漏れ日のすきまから、遠い的を射抜く。', ['ねらいうち', '木漏れ日の矢', 'bench']),
  card('エルフセージ', 'aryad', G, 'basic', 90, 1, 'U', 'エルフ', '古い言葉で草木と話すエルフの賢者。葉擦れの音は、彼女への返事だという。', ['ことだま', '葉擦れの呪文', 'sleep']),
  card('ヴァイオレットシルフ', 'ethiliel', G, 'stage1', 110, 1, 'U', 'ようせい', '紫の羽をもつ森の妖精。舞い落ちる鱗粉を吸うと、敵は夢の中で迷子になる。', ['はねのこな', '紫の鱗粉', 'poison'], { from: 'エルフセージ' }),

  // ============================= PSYCHIC ============================
  card('ワンダリングセージ', 'crelanu', P, 'basic', 90, 1, 'U', 'まどうし', '森をさまよう老魔導士。弟子をとらない理由を、だれにも話さない。', ['まよいのつえ', '放浪の秘術', 'draw', 'draw']),
  card('ルーンアデプト', 'daellyn', P, 'basic', 70, 1, 'C', 'まどうし', 'ルーン文字を学ぶ若い魔導士。覚えた字を、つい壁に落書きしてしまう。', ['ちいさなじゅもん', 'ルーンの光', 'conf']),
  card('ルーンセイジ', 'tinry', P, 'stage1', 120, 1, 'U', 'まどうし', 'ルーンの壁を張る熟練の魔導士。彼の刻んだ字は、矢も呪いもはね返す。', ['ルーンのかべ', '刻印の大魔法', 'reduce'], { from: 'ルーンアデプト' }),
  card('ホワイトパラディン', 'moremirmu', P, 'basic', 120, 2, 'R', 'せいきし', '白い衣の聖騎士。不死者の群れにも、ひとりで剣を向けたという。', ['せいなるけん', '白光の一閃', 'heal']),
  card('スクロールスカラー', 'tallin', P, 'basic', 60, 1, 'C', 'がくしゃ', '古い巻物を読み解く若い学者。予言の一行のために、三年間眠らなかった。', ['まきもの', '予言の書', 'draw']),
  card('オーブキーパー', 'morvin', P, 'basic', 90, 1, 'U', 'しさい', '骨の面をつけた神殿の司祭。手の宝珠に、死者の言葉を映して聞く。', ['のぞきこむ', '宝珠の幻視', 'conf']),
  card('クロニクラー', 'alanin', P, 'basic', 80, 1, 'U', 'かたりべ', '王国の年代記を書き継ぐ老人。彼が書かなかったことは、なかったことになる。', ['かたりべ', '年代記の一頁', 'mill'], { ability: ab('記録係の手帳', { k: 'drawOnce', n: 1 }) }),

  // ============================ FIGHTING ============================
  card('ドワーフスローンキング', 'dwarf-king', X, 'basic', 300, 3, 'RR', 'ドワーフ', '山の王座に座すドワーフの王。兜を脱いだときだけ、王国に歌が許される。', ['王座の斧', '山王の大号令', 'crowd'], { ex: true }),
  card('オークゴールデンキング', 'kapoue', X, 'basic', 300, 2, 'RR', 'オーク', '黄金の鎧をまとうオークの大族長。黒き眼に睨まれた部族は、みな膝をつく。', ['黄金の剣', '黒き眼の覇道', 'hurt'], { ex: true }),
  card('ドワーフディガー', 'rugnur', X, 'basic', 70, 1, 'C', 'ドワーフ', 'つるはし一本で山を掘るドワーフ。掘った穴の数だけ、自慢話がある。', ['つるはし', '坑道掘り', 'mill']),
  card('ドワーフマスタースミス', 'thursagan', X, 'stage1', 140, 2, 'R', 'ドワーフ', '伝説の鎚を打った老鍛冶師。炉の火加減は、目を閉じていても分かる。', ['かなづち', '鍛冶神の大鎚', 'power'], { from: 'ドワーフディガー' }),
  card('ドワーフホーンロード', 'hamel', X, 'basic', 130, 2, 'R', 'ドワーフ', '角の兜をかぶるドワーフの領主。斧の重さは、背負った民の重さだという。', ['つののかぶと', '角兜の大斧', 'hurt']),
  card('ドワーフマスクガード', 'masked-dwarf', X, 'basic', 100, 2, 'U', 'ドワーフ', '鉄仮面で顔を隠す砦の衛兵。名を明かさないのが、一族のしきたり。', ['かめんのたて', '鉄仮面の守り', 'reduce'], { ability: ab('鉄仮面', { k: 'damageReduce', n: 10 }) }),
  card('ノースバーバリアン', 'stalrag', X, 'basic', 90, 1, 'U', 'ばんぞく', '北の雪原から来た戦士。寒さも痛みも、斧を振るえば忘れてしまう。', ['おのなげ', '北風の斧', 'berserk']),
  card('ベテランハンター', 'baldras', X, 'basic', 90, 1, 'U', 'かりうど', '熊の毛皮をまとう老狩人。若いころ素手で熊と組みあったのが、今も自慢。', ['けもののかわ', '老兵の一撃', 'hurt']),
  card('シールドウォリアー', 'howgarth', X, 'basic', 70, 1, 'C', 'せんし', '丸盾を構える北の戦士。盾の傷は、仲間を守った数だけ増えている。', ['たてうち', '盾構えの突進', 'reduce']),
  card('アックスナイト', 'gerrick', X, 'stage1', 120, 2, 'U', 'きし', '大斧を担ぐ辺境の騎士。剣より斧のほうが、手になじむらしい。', ['おのぎり', '騎士の大斧', 'coin'], { from: 'シールドウォリアー' }),
  card('オークアイアンガード', 'albrock', X, 'basic', 100, 2, 'U', 'オーク', '鉄の籠手で殴りかかるオークの衛兵。拳の跡が、城門に今も残っている。', ['てっこう', '鉄甲の拳', 'reduce']),
  card('オークウォーチーフ', 'flartar', X, 'stage1', 140, 2, 'R', 'オーク', '緑の鎧のオークの将。荒くれ者ぞろいの部隊を、ひと睨みでまとめる。', ['しれい', '鉄の軍団', 'crowd'], { from: 'オークアイアンガード' }),
  card('オークグランドチーフ', 'shan-taum', X, 'stage2', 180, 3, 'R', 'オーク', '腕を組んで戦場を見下ろす大族長。彼が腕をほどくとき、戦いは終わる。', ['だいおうのいかり', '大族長の号令', 'power'], { from: 'オークウォーチーフ' }),
  card('ストーンハンマートロル', 'gruu', X, 'basic', 130, 3, 'R', 'トロル', '石の鎚をかつぐ灰色のトロル。どんな傷も、ひと晩眠ればふさがっている。', ['いしのつち', '岩砕きの鎚', 'recoil'], { ability: ab('岩の肌', { k: 'regen', n: 10 }) }),

  // =============================== DARK =============================
  card('クリムゾンリッチ', 'ro-sothian', D, 'basic', 300, 2, 'RR', 'しりょう', '真紅の衣の不死の魔導士。生前の名を呼ばれると、ほんの一瞬だけ手を止める。', ['紅の呪印', '真紅の死霊術', 'drain'], { ex: true }),
  card('ネクロアプレンティス', 'malin-young', D, 'basic', 60, 1, 'C', 'まどうし', '禁じられた本に手を出した若い魔導士。最初の一頁は、ほんの好奇心だった。', ['くらいほん', '禁書の囁き', 'draw']),
  card('ネクロマスター', 'malin-old', D, 'stage1', 120, 1, 'U', 'まどうし', '死霊術を極めかけた魔導士。故郷を守るために選んだ道が、彼を遠くへ連れていく。', ['しのまほう', '死霊の行進', 'drain'], { from: 'ネクロアプレンティス' }),
  card('リッチソーサラー', 'malin-lich', D, 'stage2', 180, 2, 'R', 'しりょう', '自らを不死に変えた大魔導士。守りたかった故郷の名を、もう思い出せない。', ['ほねのつえ', '不死の大儀式', 'graves'], { from: 'ネクロマスター' }),
  card('グレイヴシスター', 'dela', D, 'basic', 90, 1, 'U', 'まどうし', '兄を追って闇の道に入った娘。墓守の槍で、迷い出た死者を眠らせる。', ['はかもり', '墓所の槍', 'trap']),
  card('ダークアークメイジ', 'darken', D, 'basic', 120, 2, 'R', 'まどうし', '王国の宮廷を追われた闇の大魔導士。その一言で、敵の手札が灰になる。', ['やみのことば', '虚無の詠唱', 'hand']),
  card('フードリッチ', 'mal-mbrin', D, 'basic', 120, 2, 'R', 'しりょう', '頭巾の奥に骨の顔を隠す死霊。触れたものに、じわじわと毒を回す。', ['のろいのて', '闇衣の呪い', 'poison']),
  card('スモークブレード', 'helicrom', D, 'basic', 90, 1, 'U', 'ぞく', '煙をまとった剣の使い手。斬られた者は、相手の顔を見ていない。', ['けむりまき', '煙幕斬り', 'prevent']),
  card('ナイトストーカー', 'jetto', D, 'basic', 80, 1, 'U', 'あんさつしゃ', '覆面の暗殺者。月のない夜だけ、雇い主のもとへ現れる。', ['しのびあし', '闇討ち', 'snipe']),
  card('ディスガイズ', 'disguise', D, 'basic', 70, 1, 'C', 'かんじゃ', '兵士に化けた密偵。彼の本当の顔を知る者は、王国にひとりもいない。', ['へんそう', '偽りの刃', 'hand']),
  card('ブラックシールド', 'aldar', D, 'basic', 110, 2, 'U', 'きし', '漆黒の盾を構える騎士。盾に映った自分の顔を、決して見ようとしない。', ['くろいたて', '漆黒の守り', 'reduce']),
  card('ダークロード', 'eldaric', D, 'stage1', 150, 2, 'R', 'きし', '赤い外套の暗黒卿。かつては王国でいちばん清らかな騎士だった。', ['くろのけん', '暗黒卿の剣', 'hurt'], { from: 'ブラックシールド' }),
  card('ゾンビファーマー', 'zombie-farmer', D, 'basic', 60, 1, 'C', 'しかばね', '畑を耕しつづける死者。季節が変わっても、くわを置こうとしない。', ['くわふり', '土の下から', 'poison']),
  card('ゾンビゴブリン', 'zombie-goblin', D, 'basic', 50, 1, 'C', 'しかばね', '両手を上げてよろめくゴブリンの死体。生きていたころより元気そうに見える。', ['かみつき', '腐った爪', 'poison']),
  card('ゾンビホース', 'zombie-horse', D, 'basic', 70, 1, 'C', 'しかばね', '鞍をつけたまま歩く馬の死体。乗り手を探して、戦場をさまよう。', ['けりあげる', '亡霊の駆け足', 'swap']),
  card('ゾンビライダー', 'zombie-rider', D, 'stage1', 120, 1, 'U', 'しかばね', '死んだ馬にまたがる死んだ騎士。行き先を告げる号令は、もう聞こえない。', ['くさったやり', '死者の突撃', 'hurt'], { from: 'ゾンビホース' }),
  card('ゾンビビーストライダー', 'zombie-beastrider', D, 'basic', 100, 2, 'U', 'しかばね', '毛むくじゃらの獣に乗った死者。獣のほうも、とっくに死んでいる。', ['けもののきば', '屍獣の蹂躙', 'crowd']),
  card('ゾンビドレイク', 'zombie-drake', D, 'basic', 130, 2, 'R', 'しかばね', '翼の破れたドレイクの死体。吐く息は、炎ではなく腐った霧になった。', ['くさったいき', '腐竜の息', 'poison']),
  card('ゾンビサウリアン', 'zombie-saurian', D, 'basic', 60, 1, 'C', 'しかばね', '沼から這い出たトカゲ人の死体。しっぽだけが、今もよく動く。', ['どくのしっぽ', '屍蜥蜴の突き', 'venom', 'poison']),
  card('デザートシャドウ', 'cloaked', D, 'basic', 70, 1, 'C', 'さばくのたみ', '日除けのマントで正体を隠す旅人。ゴーグルの奥の目は、だれも見たことがない。', ['すなけむり', '砂影の刃', 'prevent']),
  card('デザートアサシン', 'uncloaked', D, 'stage1', 110, 1, 'U', 'さばくのたみ', 'マントを脱いだ砂漠の刺客。素顔を見た者は、もう砂漠を出られない。', ['すなのやいば', '熱砂の暗殺', 'snipe'], { from: 'デザートシャドウ' }),

  // ============================ COLORLESS ===========================
  card('ヴェテランナイト', 'drogan', C, 'basic', 100, 2, 'U', 'きし', '幾多の戦をくぐった老騎士。若い騎士の失敗を、笑って見守る。', ['けんげき', '老騎士の剣', 'reduce']),
  card('ゴールデンガーディアン', 'lanbech', C, 'stage1', 150, 2, 'R', 'きし', '黄金の鎧の守護騎士。王の盾として、一度も城門を破らせなかった。', ['きんのたて', '黄金の守護', 'reduce'], { from: 'ヴェテランナイト', ability: ab('黄金の鎧', { k: 'damageReduce', n: 20 }) }),
  card('ガードキャプテン', 'maddock', C, 'basic', 100, 2, 'U', 'きし', '町の守備隊を率いる隊長。兵の名前と家族の名前を、ぜんぶ覚えている。', ['ちょうれい', '守備隊の号令', 'crowd']),
  card('ティールナイト', 'aethyr', C, 'basic', 70, 1, 'C', 'きし', '蒼い陣羽織の若い騎士。初陣の日に、剣の手入れを三回やり直した。', ['きりこみ', '蒼き剣', 'coin']),
  card('ホワイトナイト', 'arvith', C, 'stage1', 140, 2, 'R', 'きし', '白馬にまたがる王国の騎士。その姿を見ただけで、敵の兵が道をあける。', ['はくばのやり', '白馬の突撃', 'hurt'], { from: 'ティールナイト' }),
  card('ティールライダー', 'addroran', C, 'basic', 90, 1, 'U', 'きし', '蒼い鎧で馬を駆る伝令の騎士。どんな悪路でも、知らせを一日で届ける。', ['かけぬけ', '蒼の騎行', 'swap']),
  card('ボーダーライダー', 'ladoc', C, 'basic', 70, 1, 'C', 'きし', '国境を見回る騎兵。夜の焚き火の数で、敵の数を言い当てる。', ['ていさつ', '辺境の早駆け', 'draw']),
  card('サウスガードキャプテン', 'deoran', C, 'stage1', 140, 2, 'R', 'きし', '南の守備隊を率いる若い将。父の剣と、父の約束を受け継いだ。', ['しれい', '南方守備隊の突撃', 'crowd'], { from: 'ボーダーライダー' }),
  card('ハイランドライダー', 'ruddry', C, 'basic', 90, 1, 'U', 'きし', '高地の牧場で育った騎手。馬の機嫌は、人の機嫌より先に分かる。', ['やりつき', '高地の突撃', 'gust']),
  card('ランスホースマン', 'horseman', C, 'basic', 90, 1, 'U', 'きし', '長い槍を構えて突っこむ騎馬兵。止まり方は、まだ練習中。', ['とつげき', '騎馬の一番槍', 'coin']),
  card('クリムゾンランサー', 'lancer', C, 'stage1', 140, 2, 'R', 'きし', '真紅の馬鎧の槍騎兵。一番槍の誉れは、三十年ゆずったことがない。', ['ながやり', '真紅の突撃', 'berserk'], { from: 'ランスホースマン' }),
  card('ラフィアン', 'ruffian', C, 'basic', 60, 1, 'C', 'ならずもの', '棍棒をかついだ町のならず者。腕っぷしだけは、だれにも負けない。', ['こんぼう', 'ならず者の一撃', 'coin']),
  card('ストリートブルート', 'thug', C, 'stage1', 110, 1, 'U', 'ならずもの', '路地裏を仕切る荒くれ者。売られた喧嘩は、値切らずに買う。', ['なぐりつけ', '路地裏の喧嘩', 'berserk'], { from: 'ラフィアン' }),
  card('サージェント', 'sergeant', C, 'basic', 80, 1, 'U', 'へいし', '新兵をしごく古参の軍曹。怒鳴り声は、戦場の端まで届く。', ['ごうれい', '部隊の号令', 'crowd'], { ability: ab('集合の号令', { k: 'searchBasicOnce' }) }),
  card('ワンダラーガール', 'harper', C, 'basic', 60, 1, 'C', 'たびびと', '村を飛び出した旅の娘。短剣一本と、こわいもの知らずの度胸が財産。', ['すばしこい', '旅人の短剣', 'swap']),
  card('ヤングプリンス', 'haldric', C, 'basic', 90, 1, 'U', 'おうぞく', '国を追われた若い王子。海を渡った先で、新しい王国を興すことになる。', ['けんのけいこ', '王子の剣', 'coin']),
  card('オールドキング', 'haldric-old', C, 'stage1', 150, 2, 'R', 'おうぞく', '王国を興した老王。若い日の旅の話を、孫にだけ聞かせる。', ['おうしゃく', '老王の号令', 'crowd'], { from: 'ヤングプリンス' }),
  card('レッドヘアヒロイン', 'jessica', C, 'basic', 60, 1, 'C', 'たびびと', '赤い髪の向こう見ずな娘。危ないところほど、まっ先に飛びこんでいく。', ['ふいうち', '向こう見ずの剣', 'berserk']),
  card('ヴェールランサー', 'lady-outlaw', C, 'basic', 80, 1, 'U', 'ぞく', '覆面の女頭領。槍の一突きで、街道の荷馬車を止めてみせる。', ['のきさき', '覆面の槍', 'trap']),
  card('サンドスカウト', 'kaleh', C, 'basic', 70, 1, 'C', 'さばくのたみ', '砂丘を越えて道を探す若者。星の位置で、オアシスの方角が分かる。', ['ていさつ', '砂丘越え', 'draw']),
  card('デザートコマンダー', 'commander', C, 'stage1', 140, 2, 'R', 'さばくのたみ', '紫の衣の砂漠の将。砂嵐の中でも、兵の位置をすべて言い当てる。', ['しれい', '砂漠の軍令', 'crowd'], { from: 'サンドスカウト' }),
  card('サンドブレード', 'garak', C, 'basic', 90, 1, 'U', 'さばくのたみ', '曲刀を操る砂漠の戦士。砂嵐の日ほど、刃が冴える。', ['きょくとう', '砂塵の曲刀', 'coin']),
  card('デザートシーカー', 'nym', C, 'basic', 60, 1, 'C', 'さばくのたみ', '大きな帽子の砂漠の娘。なくした物を探すのが、だれよりもうまい。', ['みちしるべ', '星読み', 'mill']),
];
