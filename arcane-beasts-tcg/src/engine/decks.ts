import { byName, card, strongestPrinting } from './cards';
import type { EType } from './types';

export interface DeckList {
  id: string;
  name: string;
  type: EType;
  cover: string; // card name for the deck box art
  description: string;
  cards: [string, number][];
}

const E = (t: string) => `基本${t}エネルギー`;

export const STARTER_DECKS: DeckList[] = [
  {
    id: 'fire',
    name: '紅蓮の咆哮',
    type: 'fire',
    cover: 'ヴォルカリオン',
    description: '圧倒的な火力で押し切る炎デッキ。インフェルドレイクの煉獄ブレスで一気にサイドを奪え！',
    cards: [
      ['ヴォルカリオン', 2], ['バーナドレイク', 4], ['インフェルドレイク', 3], ['ホムラビ', 3], ['ゴウカレイス', 2],
      ['ミツオネコ', 2], ['ヒオネコ', 2], ['バクダンアリ', 1],
      ['大賢者の研究', 4], ['司令官の号令', 2], ['狩人の知恵', 2], ['召喚の巻物', 4], ['魔獣の笛', 2], ['転移の羽', 2],
      ['エネルギー結晶', 2], ['回復薬', 2], ['力の腕輪', 1], ['灼熱の火山帯', 2], ['大地の器', 2],
      [E('炎'), 16],
    ],
  },
  {
    id: 'water',
    name: '深海の王',
    type: 'water',
    cover: 'リヴァイアサーペント',
    description: 'ハネウオでエネルギーを加速し、リヴァイアサーペントとクラーケンで海を制する。',
    cards: [
      ['タツノコ', 4], ['ミズチ', 3], ['リヴァイアサーペント', 2], ['オオイカリ', 3], ['クラーケン', 2],
      ['ハネウオ', 2], ['ナイアド', 2], ['コオリアルマ', 2], ['ヒョウガアルマ', 1],
      ['大賢者の研究', 4], ['司令官の号令', 2], ['書庫の整理', 2], ['召喚の巻物', 4], ['魔獣の笛', 2],
      ['進化の秘薬', 2], ['転移の羽', 2], ['回復薬', 2], ['嵐の海岸', 1],
      [E('水'), 18],
    ],
  },
  {
    id: 'grass',
    name: '森の守護者',
    type: 'grass',
    cover: 'エンシェントウッド',
    description: '回復と毒で粘り強く戦う草デッキ。千年樹の鉄槌は全てを打ち砕く。',
    cards: [
      ['コダマギ', 4], ['エンシェントウッド', 3], ['ハネグモ', 3], ['オオツチグモ', 2], ['コガネスカラベ', 2],
      ['リザードスカウト', 2], ['リザードシャーマン', 2], ['ハヤテトンボ', 2],
      ['大賢者の研究', 4], ['白魔導士の祈り', 2], ['司令官の号令', 2], ['召喚の巻物', 4], ['魔獣の笛', 2],
      ['回復薬', 2], ['上級回復薬', 2], ['エルフの森', 2], ['属性の羅針盤', 1],
      [E('草'), 19],
    ],
  },
  {
    id: 'lightning',
    name: '嵐の翼',
    type: 'lightning',
    cover: 'ハリケーンドレイク',
    description: '素早い鳥たちとハリケーンドレイクのボルテックストームで盤面を焼き払う。',
    cards: [
      ['グライドドレイク', 4], ['ハリケーンドレイク', 3], ['イナズマハヤブサ', 3], ['ライメイハヤブサ', 2],
      ['ヘラルドクロウ', 2], ['サンダーグリフォン', 2], ['ワイバーン', 1], ['オコジョ', 2],
      ['大賢者の研究', 4], ['司令官の号令', 2], ['狩人の知恵', 2], ['召喚の巻物', 4], ['魔獣の笛', 2],
      ['浮遊の羽根飾り', 2], ['転移の羽', 2], ['捕獲の鎖', 2], ['大地の器', 2],
      [E('雷'), 17], ['ダブル無色エネルギー', 2],
    ],
  },
  {
    id: 'dark',
    name: '冥府の軍勢',
    type: 'dark',
    cover: 'デスナイト',
    description: '倒れた仲間の魂を力に変える。デスナイトの魂を刈るが終盤を支配する。',
    cards: [
      ['スケルトン', 4], ['レヴナント', 3], ['デスナイト', 2], ['コウモリン', 3], ['ブラッドバット', 2],
      ['ドレッドバット', 2], ['ヤミオオカミ', 2], ['グール', 1],
      ['大賢者の研究', 4], ['司令官の号令', 2], ['死霊術師の儀式', 2], ['召喚の巻物', 4], ['魔獣の笛', 2],
      ['進化の秘薬', 2], ['夜の担架', 2], ['瘴気の沼', 1], ['エネルギー結晶', 2],
      [E('悪'), 20],
    ],
  },
  {
    id: 'fighting',
    name: '巨人の拳',
    type: 'fighting',
    cover: 'トロルキング',
    description: '再生するトロルたちで耐えて殴る。トロルキングの大地砕きは一撃必殺。',
    cards: [
      ['トロルコ', 4], ['トロル', 3], ['トロルキング', 2], ['サソリン', 3], ['ロックスコルピオ', 2],
      ['エルダースコルピオ', 1], ['コオーガ', 2], ['オーガ', 2], ['グリズリー', 1],
      ['大賢者の研究', 4], ['司令官の号令', 2], ['騎士団長の激励', 2], ['召喚の巻物', 4], ['魔獣の笛', 2],
      ['進化の秘薬', 2], ['転移の羽', 2], ['棘の鎧', 1], ['守りの護符', 1],
      [E('闘'), 20],
    ],
  },
  {
    id: 'psychic',
    name: '悪夢の宴',
    type: 'psychic',
    cover: 'ナイトゴーント',
    description: 'ねむりで相手を封じ、ナイトゴーントの悪夢でじわじわと削る。',
    cards: [
      ['シャドウ', 4], ['ナイトゴーント', 3], ['ゴースト', 3], ['スペクター', 2], ['レイス', 2],
      ['ナイトメア', 3], ['ジン', 2],
      ['大賢者の研究', 4], ['司令官の号令', 2], ['書庫の整理', 2], ['召喚の巻物', 4], ['魔獣の笛', 2],
      ['転移の羽', 2], ['浮遊の羽根飾り', 1], ['捕獲の鎖', 1], ['英雄の古戦場', 1], ['大地の器', 2],
      [E('超'), 20],
    ],
  },
  {
    id: 'wolf',
    name: '狼の群れ',
    type: 'dark',
    cover: 'グレートウルフ',
    description: '群れの長の号令でオオカミたちが牙をむく。巨鳥ロックが空から援護する。',
    cards: [
      ['アカオオカミ', 4], ['グレートウルフ', 3], ['ヤミオオカミ', 2], ['カラス', 3], ['ウォーハービンジャー', 2],
      ['ロック', 2], ['ウマ', 2], ['グレートホース', 1],
      ['大賢者の研究', 4], ['司令官の号令', 2], ['盗賊団の手引き', 2], ['召喚の巻物', 4], ['魔獣の笛', 2],
      ['力の腕輪', 2], ['転移の羽', 2], ['捕獲の鎖', 1], ['属性の羅針盤', 1],
      [E('悪'), 17], ['ダブル無色エネルギー', 4],
    ],
  },
];

// ----------------------------------------------------------------------------
// decks of the later rivals (also used in free battle)
// ----------------------------------------------------------------------------
export const EX_DECKS: DeckList[] = [
  {
    id: 'dragoon',
    name: '覇竜の軍団',
    type: 'fire',
    cover: 'ドラグーン',
    description: 'ドラグーンEXの覇王の業火で3枚のサイドごと焼き尽くす。トラッシュの炎エネルギーを覇竜の号令で再利用しよう。',
    cards: [
      ['ドレイクファイター', 4], ['ドラグーン', 3], ['ドレイククラッシャー', 2], ['ドレイクガーディアン', 2], ['カエンアリ', 2], ['ヒブネ', 1],
      ['クロウマ', 2], ['ブラックスタリオン', 2],
      ['大賢者の研究', 4], ['騎士の突撃', 2], ['司令官の号令', 2], ['召喚の巻物', 3], ['魔獣の笛', 2], ['賢者の水晶', 1],
      ['魔力の転移', 2], ['転移の羽', 2], ['覇者の紋章', 1], ['エネルギー結晶', 2], ['灼熱の火山帯', 2], ['狩人の知恵', 2],
      [E('炎'), 17],
    ],
  },
  {
    id: 'naga',
    name: '深淵の女王',
    type: 'water',
    cover: 'ナーガクイーン',
    description: 'ナーガを並べるほど強くなるナーガクイーンEX。潮の支配でエネルギーを一気に加速する。',
    cards: [
      ['ナーガソルジャー', 4], ['ナーガクイーン', 3], ['ナーガミュルミドン', 2], ['ナーガリングキャスター', 3], ['トリトン', 2], ['セイレーン', 2],
      ['クサレワニ', 1],
      ['大賢者の研究', 4], ['騎士の突撃', 3], ['司令官の号令', 2], ['盗賊団の手引き', 1], ['召喚の巻物', 3], ['魔獣の笛', 2],
      ['賢者の水晶', 1], ['転移の羽', 2], ['回復薬', 2], ['覇者の紋章', 1], ['嵐の海岸', 1], ['狩人の知恵', 2],
      [E('水'), 16], [E('超'), 3],
    ],
  },
  {
    id: 'lich',
    name: '亡国の王',
    type: 'dark',
    cover: 'リッチロード',
    description: 'トラッシュのモンスターが増えるほどリッチロードEXの審判は重くなる。暗殺者の刃でベンチを狙い撃て。',
    cards: [
      ['ソウルレス', 4], ['ブラウンリッチ', 3], ['リッチロード', 3], ['デスブレード', 2], ['ドラウグ', 2], ['ウルフライダー', 2], ['クサレオオカミ', 2],
      ['大賢者の研究', 4], ['死霊術師の儀式', 2], ['暗殺者の刃', 2], ['司令官の号令', 1], ['召喚の巻物', 4], ['魔獣の笛', 2],
      ['進化の秘薬', 2], ['夜の担架', 2], ['砕きの鉄槌', 2], ['亡者の港', 1], ['転移の羽', 2],
      [E('悪'), 18],
    ],
  },
  {
    id: 'troll',
    name: '巨人の行軍',
    type: 'fighting',
    cover: 'トロルジェネラル',
    description: '倒れても再生するトロルジェネラルEXと、硬い甲殻のサソリで押し込む闘デッキ。',
    cards: [
      ['トロルウォリアー', 4], ['トロルジェネラル', 3], ['ロックトロル', 2], ['スナサソリ', 3], ['ヨロイサソリ', 2], ['オオヒグマ', 2], ['グリズリー', 1],
      ['大賢者の研究', 4], ['騎士の突撃', 2], ['司令官の号令', 2], ['聖騎士の加護', 2], ['召喚の巻物', 4], ['魔獣の笛', 2],
      ['上級回復薬', 2], ['転移の羽', 2], ['守りの護符', 1], ['覇者の紋章', 1], ['英雄の古戦場', 1], ['狩人の知恵', 2],
      [E('闘'), 18],
    ],
  },
  {
    id: 'swarm',
    name: '女王の巣',
    type: 'grass',
    cover: 'クイーンアント',
    description: 'オオアリで仲間を呼び、軍隊の行進で数の暴力を。巣の奥からクイーンアントEXが目を覚ます。',
    cards: [
      ['オオアリ', 4], ['ヘイタイアリ', 3], ['クイーンアント', 3], ['カレキダマ', 2], ['ゾンビバグ', 2], ['シルフ', 2], ['コガネスカラベ', 2],
      ['大賢者の研究', 4], ['騎士の突撃', 2], ['司令官の号令', 2], ['召喚の巻物', 4], ['魔獣の笛', 2], ['進化の秘薬', 3],
      ['聖騎士の加護', 1], ['転移の羽', 2], ['回復薬', 2], ['瘴気の沼', 1], ['大地の器', 1], ['狩人の知恵', 1],
      [E('草'), 17],
    ],
  },
  {
    id: 'frost',
    name: '氷河の番人',
    type: 'water',
    cover: 'スノーゴーレム',
    description: '氷のかべで耐え、ブリザードパンチでマヒさせる水デッキ。テュポーンとナーガハンターがベンチを削る。',
    cards: [
      ['ユキダマ', 4], ['スノーゴーレム', 3], ['オオガニ', 2], ['テュポーン', 2], ['ナーガハンター', 2], ['トリトン', 1], ['コオリアルマ', 2], ['ヒョウガアルマ', 2],
      ['大賢者の研究', 4], ['騎士の突撃', 2], ['司令官の号令', 2], ['召喚の巻物', 4], ['魔獣の笛', 2], ['狩人の知恵', 2],
      ['転移の羽', 2], ['上級回復薬', 2], ['守りの護符', 1], ['嵐の海岸', 1], ['回復薬', 2],
      [E('水'), 18],
    ],
  },
  {
    id: 'wyrm',
    name: '古竜の森',
    type: 'grass',
    cover: 'エルダーワイアーム',
    description: '毒とマヒで相手を縛り、エルダーワイアームの瘴竜の吐息でとどめを刺す草デッキ。',
    cards: [
      ['ワーム', 4], ['エルダーワイアーム', 3], ['コダマギ', 2], ['エンシェントウッド', 1], ['カレキダマ', 4], ['コガネスカラベ', 2], ['ゾンビバグ', 2],
      ['大賢者の研究', 4], ['騎士の突撃', 2], ['司令官の号令', 2], ['召喚の巻物', 4], ['魔獣の笛', 2], ['狩人の知恵', 2],
      ['白魔導士の祈り', 2], ['転移の羽', 2], ['瘴気の沼', 2], ['回復薬', 2],
      [E('草'), 18],
    ],
  },
  {
    id: 'night',
    name: '夜会の主',
    type: 'dark',
    cover: 'ヴァンパイア',
    description: '吸血で傷を癒やしながら戦うヴァンパイアと、使い魔たちの悪デッキ。ドウクツインプのいたずらでエネルギーを奪う。',
    cards: [
      ['ヴァンパイア', 3], ['ツカイマ', 4], ['ドウクツインプ', 3], ['デスブレード', 2], ['ドラウグ', 2], ['クサレオオカミ', 2], ['ヤミオオカミ', 2],
      ['大賢者の研究', 4], ['暗殺者の刃', 2], ['司令官の号令', 2], ['召喚の巻物', 4], ['魔獣の笛', 2], ['狩人の知恵', 2],
      ['砕きの鉄槌', 2], ['転移の羽', 2], ['覇者の紋章', 1], ['亡者の港', 1], ['回復薬', 2], ['運命のコイン', 1],
      [E('悪'), 17],
    ],
  },
];

/** more rivals' decks */
export const AB3_DECKS: DeckList[] = [
  {
    id: 'sunfolk',
    name: '砂陽の軍旗',
    type: 'fire',
    cover: 'タウロクプロテクター',
    description: '砂漠の民と大牛タウロクの炎デッキ。軍旗がはためくたび、炎が強く燃える。',
    cards: [
      ['サンスカウト', 4], ['サンパスファインダー', 3], ['サンチャンピオン', 2], ['タウロクヴァンガード', 3], ['タウロクフラッグベアラー', 2], ['タウロクプロテクター', 2], ['サンシンガー', 2],
      ['大賢者の研究', 4], ['斥候の報告', 2], ['砂漠の薬師', 2], ['召喚の巻物', 4], ['戦太鼓', 2], ['活力のエリクサー', 2], ['砂漠のオアシス', 2], ['狩人の知恵', 2], ['司令官の号令', 2], ['回復薬', 2],
      [E('炎'), 18],
    ],
  },
  {
    id: 'mine',
    name: '鋼鉄の坑道',
    type: 'fighting',
    cover: 'ドワーフロード',
    description: 'ドワーフ一族の闘・雷デッキ。鋼の大盾と鎖かたびらで固め、坑道から鉄槌を振るう。',
    cards: [
      ['ドワーフファイター', 4], ['ドワーフバーサーカー', 3], ['ドワーフガード', 3], ['ドワーフセンチネル', 2], ['ドワーフロード', 2], ['ドワーフサンダラー', 2], ['ドラゴンガード', 2],
      ['大賢者の研究', 4], ['ドワーフの鍛冶師', 3], ['鋼の大盾', 2], ['鎖かたびら', 2], ['ドワーフの坑道', 2], ['召喚の巻物', 4], ['雷鳴の頂', 1], ['爆薬樽', 2], ['司令官の号令', 2], ['回復薬', 2],
      [E('闘'), 10], [E('雷'), 8],
    ],
  },
  {
    id: 'horde',
    name: '蛮勇の大軍',
    type: 'fighting',
    cover: 'オークソブリン',
    description: 'オークの軍勢を一気に並べて押し潰す闘デッキ。戦太鼓が響けば、止まらない。',
    cards: [
      ['グランティ', 4], ['グラントウォリアー', 4], ['オークスレイヤー', 2], ['オークソブリン', 4], ['オークアーチャー', 3], ['オークバーサーカー', 2],
      ['大賢者の研究', 4], ['族長の号令', 2], ['戦太鼓', 2], ['盗賊のすり', 2], ['召喚の巻物', 4], ['騎士の突撃', 3], ['進化の秘薬', 2], ['砕きの鉄槌', 2], ['回復薬', 2],
      [E('闘'), 18],
    ],
  },
  {
    id: 'highelf',
    name: '大森林の王',
    type: 'grass',
    cover: 'エルフハイロード',
    description: 'エルフの隊列で粘り、エルフハイロードで一気に決める草デッキ。森が味方の傷を癒やす。',
    cards: [
      ['エルフスカウト', 3], ['エルフレンジャー', 3], ['エルフキャプテン', 2], ['エルフロード', 3], ['エルフハイロード', 3], ['エルフファイター', 2], ['エルフヒーロー', 2], ['エルフレディ', 1],
      ['大賢者の研究', 4], ['白魔導士の祈り', 2], ['甘い蜜', 3], ['司令官の号令', 2], ['召喚の巻物', 4], ['活力のエリクサー', 2], ['エルフの森', 2], ['属性の羅針盤', 1], ['転移の羽', 2],
      [E('草'), 19],
    ],
  },
  {
    id: 'shadow',
    name: '影の玉座',
    type: 'dark',
    cover: 'ドラウグロード',
    description: '亡者の覇王を軸に、盗み・毒・吸血で追い詰める悪デッキ。影の女王は容赦しない。',
    cards: [
      ['ゾンビドワーフ', 4], ['ゾンビトロル', 4], ['ドラウグロード', 3], ['ダークアデプト', 3], ['スケルトンライダー', 2], ['ゾンビバット', 2],
      ['大賢者の研究', 4], ['呪われた地下墓地', 2], ['吸血の牙', 2], ['毒薬売り', 2], ['盗賊のすり', 2], ['召喚の巻物', 4], ['発掘のシャベル', 2], ['暗殺者の刃', 2], ['転移の羽', 2], ['進化の秘薬', 2],
      [E('悪'), 18],
    ],
  },
  {
    id: 'elder',
    name: '賢者の書斎',
    type: 'psychic',
    cover: 'アークウィッチ',
    description: '老いた賢者が四十年かけて磨いた超デッキ。大魔女と銀の魔女、そして大地を揺らす騎士たち。',
    cards: [
      ['ミスティック', 4], ['サンシャーマン', 3], ['アークウィッチ', 3], ['サイキックメイジ', 2], ['グランドナイト', 2], ['ロック', 2], ['メカニカルレイダー', 2],
      ['大賢者の研究', 4], ['召喚の巻物', 4], ['魔獣の笛', 2], ['司令官の号令', 2], ['進化の秘薬', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2],
      ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['瘴気の沼', 2], ['回復薬', 1],
      [E('超'), 15],
    ],
  },
];


/** 第二章の強敵が使うデッキ */
export const CH2_DECKS: DeckList[] = [
  {
    id: 'ash-trader',
    name: '灰市の荒馬',
    type: 'fighting',
    cover: 'ブラックスタリオン',
    description: '黒馬と鉄の守りで押し切る闘デッキ。石像を荷車に積んで売り歩く男の、荒っぽい商売道具。',
    cards: [
      ['クロウマ', 4], ['ブラックスタリオン', 3], ['ドワーフロード', 2], ['フレッシュゴーレム', 2], ['タウロスライダー', 2], ['ゾンビグリフォン', 2], ['ドワーフガード', 3], ['ドワーフセンチネル', 2], ['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['ドワーフの坑道', 2], ['回復薬', 2], ['運命のコイン', 2], ['書庫の整理', 1], ['基本闘エネルギー', 15],
    ],
  },
  {
    id: 'night-steward',
    name: '夜会の残り火',
    type: 'lightning',
    cover: 'ブレードマスター',
    description: '剣竜ブレードマスターの一閃で決める雷デッキ。主を失った館で、執事は今も銀を磨いている。',
    cards: [
      ['ブレードマスター', 3], ['ゾンビグリフォン', 2], ['ドワーフサンダラー', 3], ['ドラゴンガード', 2], ['サンウォリアー', 2], ['グリフォンライダー', 2], ['クロウマ', 3], ['ブラックスタリオン', 2], ['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['雷鳴の頂', 2], ['回復薬', 2], ['運命のコイン', 2], ['書庫の整理', 2], ['基本雷エネルギー', 15],
    ],
  },
  {
    id: 'ghost-fleet',
    name: '幽霊船団',
    type: 'psychic',
    cover: 'ユウレイセン',
    description: '朽ちた船が幽霊船へと変わる超デッキ。沈んだ船乗りたちは、まだ港を探している。',
    cards: [
      ['ハイセン', 4], ['ユウレイセン', 3], ['ゾンビグリフォン', 2], ['クロウマ', 3], ['ブラックスタリオン', 2], ['サンドルイド', 2], ['メダマソウ', 2], ['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['回復薬', 2], ['運命のコイン', 2], ['書庫の整理', 2], ['見習い魔導士', 2], ['基本超エネルギー', 16],
    ],
  },
  {
    id: 'tide-folk',
    name: '潮の民',
    type: 'water',
    cover: 'ナーガウォーロード',
    description: 'ナーガの戦士が大将へと育つ水デッキ。海の底で、潮の声を聞く民のデッキ。',
    cards: [
      ['ナーガダークファング', 4], ['ナーガメイスウォリアー', 3], ['ナーガウォーロード', 3], ['ガレオン', 2], ['ゾンビグリフォン', 2], ['マーフォークハンター', 2], ['クロウマ', 3], ['ブラックスタリオン', 2], ['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['進化の秘薬', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['嵐の海岸', 2], ['回復薬', 2], ['基本水エネルギー', 15],
    ],
  },
  {
    id: 'oasis',
    name: 'オアシスの守り',
    type: 'fire',
    cover: 'タウロクプロテクター',
    description: '大牛タウロクが泉を守る炎デッキ。砂漠の墓標に花を供える者たちの祈り。',
    cards: [
      ['タウロクプロテクター', 3], ['サンシルフ', 2], ['ドレイクガーディアン', 2], ['ゾンビグリフォン', 2], ['カエンワイト', 2], ['サンスカウト', 3], ['サンパスファインダー', 2], ['サンシンガー', 2], ['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['灼熱の火山帯', 2], ['回復薬', 2], ['運命のコイン', 2], ['書庫の整理', 2], ['見習い魔導士', 1], ['基本炎エネルギー', 15],
    ],
  },
  {
    id: 'thunder-peak',
    name: '雷鳴の頂',
    type: 'lightning',
    cover: 'ドラゴンガード',
    description: '雷の銃士が竜の鎧をまとう雷デッキ。頂の天文台に、古い記録が眠っている。',
    cards: [
      ['ドワーフサンダラー', 4], ['ドラゴンガード', 3], ['ブレードマスター', 2], ['ゾンビグリフォン', 2], ['サンウォリアー', 2], ['グリフォンライダー', 2], ['クロウマ', 3], ['ブラックスタリオン', 2], ['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['雷鳴の頂', 2], ['回復薬', 2], ['運命のコイン', 2], ['書庫の整理', 1], ['基本雷エネルギー', 15],
    ],
  },
  {
    id: 'ashen-village',
    name: '灰の村',
    type: 'fighting',
    cover: 'フレッシュゴーレム',
    description: 'つぎはぎの巨人と亡骸の鳥が守る闘デッキ。四十年、誰も帰らない村の番人。',
    cards: [
      ['フレッシュゴーレム', 3], ['ドワーフロード', 2], ['タウロスライダー', 2], ['ゾンビグリフォン', 2], ['クロウマ', 3], ['ブラックスタリオン', 2], ['ドワーフガード', 3], ['ドワーフセンチネル', 2], ['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['ドワーフの坑道', 2], ['回復薬', 2], ['運命のコイン', 2], ['書庫の整理', 2], ['基本闘エネルギー', 15],
    ],
  },
  {
    id: 'young-master',
    name: '若き師の炎',
    type: 'fire',
    cover: 'ドラグーン',
    description: '竜の騎兵ドラグーンが焼き払う炎デッキ。若さを取り戻した大陸一のプレイヤーの、新しい切り札。',
    cards: [
      ['ドレイクファイター', 4], ['ドラグーン', 3], ['タウロクプロテクター', 2], ['サンシルフ', 2], ['ドレイクガーディアン', 2], ['ゾンビグリフォン', 2], ['カエンワイト', 2], ['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['灼熱の火山帯', 2], ['回復薬', 2], ['運命のコイン', 2], ['書庫の整理', 2], ['見習い魔導士', 2], ['基本炎エネルギー', 15],
    ],
  },
  {
    id: 'herald',
    name: '影の先触れ',
    type: 'psychic',
    cover: 'ナイトゴーント',
    description: '夜の魔物と幽霊船が忍び寄る超デッキ。誰の使いなのか、まだ誰も知らない。',
    cards: [
      ['ナイトゴーント', 3], ['ゾンビグリフォン', 2], ['ハイセン', 3], ['ユウレイセン', 2], ['クロウマ', 3], ['ブラックスタリオン', 2], ['サンドルイド', 2], ['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['回復薬', 2], ['運命のコイン', 2], ['書庫の整理', 2], ['見習い魔導士', 2], ['基本超エネルギー', 17],
    ],
  },
];

/** a story deck: its monsters, the usual trainers, and basic energy to sixty */
const CORE_TRAINERS: [string, number][] = [['大賢者の研究', 2], ['召喚の巻物', 2], ['魔獣の笛', 2], ['司令官の号令', 2], ['騎士の突撃', 2], ['狩人の知恵', 2], ['転移の羽', 2], ['賢者の水晶', 1], ['エネルギー結晶', 2], ['覇者の紋章', 1], ['回復薬', 2], ['運命のコイン', 2], ['書庫の整理', 2]];
const ENERGY_JP: Record<EType, string> = { fire: '炎', water: '水', grass: '草', lightning: '雷', psychic: '超', fighting: '闘', dark: '悪', colorless: '闘' };
function storyDeck(id: string, name: string, type: EType, cover: string, description: string, mons: [string, number][]): DeckList {
  const n = [...mons, ...CORE_TRAINERS].reduce((a, [, k]) => a + k, 0);
  return { id, name, type, cover, description, cards: [...mons, ...CORE_TRAINERS, [E(ENERGY_JP[type]), 60 - n]] };
}

/** 第四章の強敵が使うデッキ */
export const CH4_DECKS: DeckList[] = [
  storyDeck('c4-court', 'エルフの宮廷', 'grass', 'エルフルーラー', '千年前の森の宮廷。不死の剣士へ育つ若いエルフたち。', [['エルフハルバーディア', 4], ['エルフパラゴン', 3], ['エルフイモータル', 2], ['エルフルーラー', 2], ['エルフマーシャル', 2], ['モリノセイレイ', 2], ['アキノセイレイ', 2]]),
  storyDeck('c4-hold', 'ドワーフの砦', 'fighting', 'ドワーフレジェンド', '石を千年見てきた一族の砦。弩兵の列が、山の門を守る。', [['ドワーフクロスボウマン', 4], ['ドワーフアーバレスト', 3], ['ドワーフバラジャー', 2], ['ドワーフレジェンド', 2], ['ドワーフヴァリアント', 2], ['ドワーフランナー', 2], ['ドワーフレイジャー', 2]]),
  storyDeck('c4-tower', '炎の塔', 'fire', 'フレイムソーサレス', '十二枚の絵の具を溶かす火を焚く、炎の大魔導の塔。', [['フレアスピリット', 4], ['ファイアモンスター', 3], ['ラヴァエレメンタル', 2], ['フレイムソーサレス', 2], ['ルミナリーマスター', 2], ['トロルファイアシャーマン', 2]]),
  storyDeck('c4-sands', '砂漠の宮廷', 'colorless', 'フェニックスナイト', '若いカリフの宮廷。砂の戦士と不死鳥の騎士。', [['バタル', 3], ['ムファリク', 2], ['デザートアーチャー', 2], ['ペリン', 2], ['ティニーン', 2], ['ジャワル', 2], ['ミグワール', 2], ['クルセイダー', 2], ['フェニックスナイト', 2]]),
  storyDeck('c4-horde', 'オークの大群', 'fighting', 'オークウォーモンガー', '盟約を認めないオークの大王の軍勢。', [['オークヴァンガード', 4], ['オークレイダー', 3], ['オークウォーモンガー', 2], ['オークプランジャー', 2], ['オークポールアーム', 2], ['オークラヴェジャー', 2], ['リザードストライカー', 2]]),
  storyDeck('c4-road', '無法者の街道', 'dark', 'マスターアサシン', '戦の街道にたむろする剣士と盗賊たち。', [['アーマードバンディット', 4], ['アーマードハイウェイマン', 3], ['マスターアサシン', 2], ['ウルフブレード', 2], ['ウルフハート', 2], ['マスターオブダークネス', 2], ['アウトローナイト', 2]]),
  storyDeck('c4-dead', '死者の王国', 'dark', 'リッチプリンス', '命の重さを量る、死者の国の女王の兵。', [['ドレッドリッチ', 4], ['エターナルリッチ', 3], ['リッチプリンス', 2], ['ゾンビソルジャー', 2], ['ゾンビリーヴァー', 2], ['ネクロマンサー', 2], ['アークネクロマンサー', 2]]),
  storyDeck('c4-arcane', '絵描きの塔', 'psychic', 'セレスティアルロード', '十二枚を描いた塔の絵描きと、その弟子。', [['セレスティアル', 4], ['セレスティアルロード', 3], ['アーケインレディ', 2], ['ワンダラーウィザード', 2], ['シャドウウィザード', 2], ['エルフミスティック', 2], ['ベニバネ', 2]]),
  storyDeck('c4-sea', '潮の王宮', 'water', 'マーマンキング', '王女を逃がそうとした、海の王の軍勢。', [['マーマンレティアリウス', 4], ['マーマンキング', 3], ['マーメイドプリーステス', 3], ['ウェイヴスピリット', 3], ['ウォーターゴッド', 2], ['ルストルマスター', 2]]),
  storyDeck('c4-crown', '十二王の盟約', 'colorless', 'ウォーマスター', '十二国の上王が率いる、盟約の騎士団。', [['ヴェリテス', 4], ['センチネル', 3], ['ウォーマスター', 2], ['アイアンナイト', 2], ['デストロイヤーナイト', 2], ['デシメイター', 1], ['エピックナイト', 2], ['ロイヤルガード', 2]]),
];

/** 第五章の強敵が使うデッキ */
export const CH5_DECKS: DeckList[] = [
  storyDeck('c5-knights', '残響の騎士団', 'colorless', 'ホワイトナイト', '国を守る力を願った、老騎士の残響。', [['ヴェテランナイト', 4], ['ゴールデンガーディアン', 3], ['ティールナイト', 3], ['ホワイトナイト', 2], ['ガードキャプテン', 2], ['ランスホースマン', 2], ['クリムゾンランサー', 2]]),
  storyDeck('c5-north', '北の盾', 'fighting', 'アックスナイト', '吹雪から村を守り続ける、北の戦士たち。', [['シールドウォリアー', 4], ['アックスナイト', 3], ['ノースバーバリアン', 2], ['ベテランハンター', 2], ['ドワーフマスクガード', 2], ['ストーンハンマートロル', 2], ['ドワーフホーンロード', 2]]),
  storyDeck('c5-necro', '禁書の系譜', 'dark', 'リッチソーサラー', '故郷を守るために、不死になった魔導士。', [['ネクロアプレンティス', 4], ['ネクロマスター', 3], ['リッチソーサラー', 2], ['グレイヴシスター', 2], ['ダークアークメイジ', 2], ['フードリッチ', 2], ['クリムゾンリッチ', 1]]),
  storyDeck('c5-sands', '星読みの砂', 'colorless', 'デザートコマンダー', '道しるべの石になった少女と、砂漠の民。', [['サンドスカウト', 4], ['デザートコマンダー', 3], ['サンドブレード', 2], ['デザートシーカー', 2], ['ラフィアン', 2], ['ストリートブルート', 2], ['サージェント', 2]]),
  storyDeck('c5-elves', '森の女王', 'grass', 'エルフクイーン', '森を燃やさない力を願った、森の女王の残響。', [['エルフブレイド', 4], ['エルフゴールドブレイド', 3], ['エルフクイーン', 2], ['エルフホルンメイデン', 2], ['エルフコマンダー', 2], ['エルフエルダー', 2], ['エルフウォーデン', 2]]),
  storyDeck('c5-forge', '鍛冶神の炉', 'fighting', 'ドワーフマスタースミス', '何でも割れる鎚を願った、伝説の鍛冶師。', [['ドワーフディガー', 4], ['ドワーフマスタースミス', 3], ['ドワーフスローンキング', 2], ['ドワーフマスクガード', 2], ['ドワーフホーンロード', 2], ['ストーンハンマートロル', 2], ['シールドウォリアー', 2]]),
  storyDeck('c5-orc', '黄金の大族長', 'fighting', 'オークゴールデンキング', '部族を飢えから救った、黄金の大族長の残響。', [['オークアイアンガード', 4], ['オークウォーチーフ', 3], ['オークグランドチーフ', 2], ['オークゴールデンキング', 2], ['ノースバーバリアン', 2], ['ストーンハンマートロル', 2]]),
  storyDeck('c5-tide', '海の王子', 'water', 'タイドプリンス', '千年、港を探した船の、最後の乗り手。', [['リバーメイデン', 4], ['マーセイレーン', 3], ['タイドプリンス', 2], ['ナーガウィッチ', 3], ['フロストウッド', 2]]),
  storyDeck('c5-dark', '暗黒卿', 'dark', 'ダークロード', '主君を救うために、国を石にした騎士。', [['ブラックシールド', 4], ['ダークロード', 3], ['ナイトストーカー', 2], ['スモークブレード', 2], ['ディスガイズ', 2], ['ゾンビホース', 2], ['ゾンビライダー', 2]]),
  storyDeck('c5-storm', '天輪の雷', 'lightning', 'ヘイローメイジ', '「十三」を書き残した記録係の残響。', [['ストームアデプト', 4], ['ヘイローメイジ', 3], ['スパークシーア', 3], ['エルダーボルト', 2], ['サンダーランサー', 2]]),
  storyDeck('c5-flame', '紅蓮の邪術', 'fire', 'ヘルフレイムロード', '炎を従える邪術の王と、赤い髪の剣士。', [['スパークシーフ', 4], ['カーマインファイター', 3], ['ヘルフレイムロード', 2], ['フレアウィッチ', 2], ['エンバーセージ', 2], ['ブレイズバーバリアン', 2]]),
  storyDeck('c5-kings', '老王の帰還', 'colorless', 'オールドキング', '盟約を結んだ王たちの残響。', [['ヤングプリンス', 4], ['オールドキング', 3], ['サージェント', 2], ['ヴェテランナイト', 2], ['ゴールデンガーディアン', 2], ['ホワイトナイト', 2], ['ティールナイト', 2]]),
];

export const ALL_DECKS: DeckList[] = [...STARTER_DECKS, ...EX_DECKS, ...AB3_DECKS, ...CH2_DECKS, ...CH4_DECKS, ...CH5_DECKS];
export const deckById = (id: string) => ALL_DECKS.find((d) => d.id === id)!;

export function expand(list: [string, number][]): string[] {
  const out: string[] = [];
  for (const [name, n] of list) for (let i = 0; i < n; i++) out.push(byName(name).id);
  return out;
}

export function validateDeck(ids: string[]): string[] {
  const errs: string[] = [];
  if (ids.length !== 60) errs.push(`デッキは60枚ちょうどにしてください（現在${ids.length}枚）`);
  const counts = new Map<string, number>();
  for (const id of ids) {
    const c = card(id);
    if (c.kind === 'energy' && c.basic) continue;
    counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  }
  for (const [name, n] of counts) if (n > 4) errs.push(`「${name}」は4枚までです（${n}枚）`);
  const raid = ids.filter((id) => card(id).raid).length;
  if (raid > 1) errs.push(`レイドカードはデッキに1枚までです（${raid}枚）`);
  if (!ids.some((id) => {
    const c = card(id);
    return c.kind === 'monster' && c.stage === 'basic';
  })) errs.push('たねモンスターが1枚以上必要です');
  return errs;
}

// ----------------------------------------------------------------------------
// Rivals
// ----------------------------------------------------------------------------
export interface Rival {
  id: string;
  name: string;
  title: string;
  portrait: string;
  deck: string; // starter deck id
  level: 'easy' | 'normal' | 'hard';
  reward: number;
  intro: string;
  win: string;
  lose: string;
  scene: string;
  /** chapter the rival belongs to */
  set?: 'AB1' | 'AB2' | 'AB3' | 'AB4' | 'AB5';
}

export const RIVALS: Rival[] = [
  {
    id: 'tim', name: 'ティム', title: '村の少年', portrait: 'humans/peasant', deck: 'grass', level: 'easy', reward: 150,
    intro: '父ちゃんのカードは、誰にも渡さない！', win: '……父ちゃん、守ったよ。', lose: '……わかった。約束は、約束だから。', scene: 'story/landscape-hills-01',
  },
  {
    id: 'marina', name: 'マリナ', title: '潮騒の巫女', portrait: 'merfolk/initiate', deck: 'water', level: 'easy', reward: 180,
    intro: '海の祠のカードは、不幸を呼ぶの。それでも、望むのね？', win: '波は、欲を連れ去ってくれる。', lose: '……あなたに、海の加護がありますように。', scene: 'story/landscape-coast',
  },
  {
    id: 'vane', name: 'ヴェイン', title: '雷弓の射手', portrait: 'humans/longbowman', deck: 'lightning', level: 'normal', reward: 220,
    intro: 'カード遊びで、兄貴は首を吊った。……勝負だ、遊び人。', win: 'これで、少しは懲りたか。', lose: '……持っていけ。そんなもんのために、人は死ぬんだ。', scene: 'story/landscape-mountains-04',
  },
  {
    id: 'grom', name: 'グロム', title: '岩山の戦士', portrait: 'trolls/troll-shaman', deck: 'fighting', level: 'normal', reward: 250,
    intro: 'グハハハ！オレ様の拳を受けてみろ！', win: 'グハハ！力こそすべて！', lose: 'ぐぬぬ…お前、小さいのにやるな！', scene: 'story/landscape-mountains-05',
  },
  {
    id: 'ignis', name: 'イグナス', title: '紅蓮の竜騎士', portrait: 'drakes/flameheart', deck: 'fire', level: 'normal', reward: 300,
    intro: '我が炎は千の戦を越えてきた。貴様に耐えられるか！', win: '灰となれ！', lose: '見事だ…貴様の炎、確かに受け取った。', scene: 'story/landscape-lava',
  },
  {
    id: 'rouga', name: 'ロウガ', title: '街道の野盗頭', portrait: 'goblins/wolf-rider', deck: 'wolf', level: 'hard', reward: 350,
    intro: '荷物も、カードも、命もだ。ぜんぶ置いていけ。', win: '狩りは終わりだ。身ぐるみ剥いでやれ！', lose: '……ちっ。おい、何を見てる、お前ら……。', scene: 'story/landscape-plain',
  },
  {
    id: 'lilith', name: 'リリス', title: '夢魔の魔女', portrait: 'humans/dark-adept+female', deck: 'psychic', level: 'hard', reward: 400,
    intro: 'ふふ…いい夢を見せてあげる。二度と覚めない夢をね。', win: 'おやすみなさい、永遠に…', lose: 'あら…悪夢から目覚めるなんて、面白い人。', scene: 'story/swamp-02',
  },
  {
    id: 'necros', name: 'ネクロス', title: '冥府の王', portrait: 'undead/ancient-lich', deck: 'dark', level: 'hard', reward: 600,
    intro: '千年の眠りを妨げし者よ…その魂、我が軍勢に加えてくれよう。', win: '魂はもらったぞ…', lose: 'バカな…この我が敗れるだと…！', scene: 'story/bones',
  },
  {
    id: 'flora', name: 'フローラ', title: '墓守のドルイド', portrait: 'elves/druid', deck: 'swarm', level: 'normal', reward: 380,
    intro: '彼の眠りを、乱さないで。', win: '帰って。ここは、死んだ人の場所よ。', lose: '……掘るなら、せめて、優しくしてあげて。', scene: 'story/landscape-hills-02',
  },
  {
    id: 'garm', name: 'ガルム', title: '鉱山の親方', portrait: 'orcs/warlord', deck: 'troll', level: 'hard', reward: 460,
    intro: '賃金がほしけりゃ、勝って取れ。それがこの山の掟だ。', win: '次の給金も、俺のもんだな。', lose: '……グハ。山の掟は、お前の勝ちだ。', scene: 'story/landscape-mountains-03',
  },
  {
    id: 'nerea', name: 'ネレア', title: '湖の神殿の大巫女', portrait: 'merfolk/priestess', deck: 'naga', level: 'hard', reward: 480,
    intro: '聖なるカードに触れる者には、罰が下ります。', win: '祈りなさい。あなたの罪が、洗われるまで。', lose: '……神よ。なぜ、この者を選ぶのですか。', scene: 'story/landscape-beach',
  },
  {
    id: 'setsuna', name: 'セツナ', title: '氷河の魔導士', portrait: 'elves/sorceress', deck: 'frost', level: 'hard', reward: 540,
    intro: '伝承を知りたいのなら、まず、私に勝ちなさい。', win: '知らないほうが、幸せなこともあるのです。', lose: '……いいでしょう。代価を、教えてあげます。', scene: 'story/p-snowfield',
  },
  {
    id: 'verd', name: 'ヴェルド', title: '古竜の守り手', portrait: 'elves/shaman', deck: 'wyrm', level: 'hard', reward: 560,
    intro: 'あの男の弟子か。……その顔、昔のあいつにそっくりだ。', win: '森へ帰りな。庭へは、行くんじゃない。', lose: '……行くのか。なら、覚悟して行け。', scene: 'story/p-great-tree',
  },
  {
    id: 'carmilla', name: 'カーミラ', title: '夜会の女主人', portrait: 'humans/mage-red+female', deck: 'night', level: 'hard', reward: 600,
    intro: 'ようこそ、坊や。……あら、可愛い番犬も一緒なのね。', win: '踊り疲れたかしら。今夜はここまで。', lose: '……ふふ、いいわ。あの方の所へ行きなさい。', scene: 'story/p-graves',
  },
  {
    id: 'morgana', name: 'モルガナ', title: '庭の門番', portrait: 'humans/necromancer+female', deck: 'lich', level: 'hard', reward: 650,
    intro: 'ここから先へは、行かせない。あなたのために。', win: '帰りなさい。まだ、間に合うかもしれない。', lose: '……もう、止められないのね。', scene: 'story/grim-altar',
  },
  {
    id: 'olden', name: 'オルデン', title: '師', portrait: 'camp/delfador', deck: 'elder', level: 'hard', reward: 1500,
    intro: '来たか。よく、ここまで勝ち続けてくれた。', win: 'お前の役目は終わった。……ありがとう。', lose: '……強くなったな。だが、もう遅い。', scene: 'story/p-shrine',
  },
  {
    id: 'gale', name: 'ゲイル', title: '灰市の石像商', portrait: 'humans/outlaw', deck: 'ash-trader', level: 'normal', reward: 520, set: 'AB2',
    intro: '石になった町は宝の山さ。邪魔するなら、あんたも荷台に積んでやる。', win: '商談成立だな。', lose: '……ちっ。割に合わねえ商売だ。', scene: 'story/p-aftermath',
  },
  {
    id: 'severin', name: 'セヴラン', title: '夜会の館の執事', portrait: 'humans/fencer', deck: 'night-steward', level: 'normal', reward: 540, set: 'AB2',
    intro: '主のいない館でも、客人のもてなしは執事の務めでございます。', win: 'お帰りはあちらでございます。', lose: '……お見事。銀の盆を、お下げいたします。', scene: 'story/p-hall',
  },
  {
    id: 'barak', name: 'バラク', title: '幽霊船の船長', portrait: 'undead/wraith', deck: 'ghost-fleet', level: 'hard', reward: 560, set: 'AB2',
    intro: '港はどこだ……四十年、探しているのだ。', win: '錨を上げろ。また、霧の中へ。', lose: '……ああ。あれが、港の灯か。', scene: 'story/p-storm-sea',
  },
  {
    id: 'nagisa', name: 'ナギサ', title: '潮の民の長', portrait: 'merfolk/enchantress', deck: 'tide-folk', level: 'hard', reward: 580, set: 'AB2',
    intro: '潮の声が言っています。あなたは、灰を連れてきた人だと。', win: '海へお帰りなさい。灰ごと、沈めてあげる。', lose: '……潮が、あなたの味方をしたのね。', scene: 'story/p-wild-sea',
  },
  {
    id: 'salima', name: 'サリマ', title: '砂陽の戦士長', portrait: 'camp/q-champion', deck: 'sunfolk', level: 'hard', reward: 620, set: 'AB2',
    intro: '砂漠に入る者は、まず太陽に試される。次に、わたしが試す。', win: '日輪は、誰にも沈められない。', lose: '……見事。砂の民は、強き者に旗を預ける。', scene: 'story/landscape-desert',
  },
  {
    id: 'ishma', name: 'イシュマ', title: 'オアシスの墓守', portrait: 'camp/q-mystic', deck: 'oasis', level: 'hard', reward: 620, set: 'AB2',
    intro: '泉のほとりで眠る者たちを、騒がせないで。', win: '砂は、すべてを覆ってくれる。', lose: '……水は、強い者のほうへ流れるのね。', scene: 'story/landscape-desert',
  },
  {
    id: 'dorgan', name: 'ドルガン', title: '鋼鉄の坑道長', portrait: 'dwarves/lord', deck: 'mine', level: 'hard', reward: 680, set: 'AB2',
    intro: 'ガハハ！ 坑道の扉は、わしの鉄槌を越えた者にしか開かんぞ！', win: '鍛え直して出直してこい！', lose: '……ふん、石頭のわしを割るとは。気に入った！', scene: 'story/landscape-mountains-03',
  },
  {
    id: 'brock', name: 'ブロック', title: '雷鳴の頂の記録係', portrait: 'dwarves/runemaster', deck: 'thunder-peak', level: 'hard', reward: 660, set: 'AB2',
    intro: '記録を見たければ、まず記録に残る勝負をしてもらおう。', win: '一行。お前の名前は、それで十分だ。', lose: '……よかろう。この一局は、太字で書いておく。', scene: 'story/landscape-mountains-03',
  },
  {
    id: 'sieg', name: 'ジーク', title: '覇竜騎士団長', portrait: 'humans/grand-knight', deck: 'dragoon', level: 'hard', reward: 520, set: 'AB2',
    intro: '覇者の名にかけて、全力で相手をしよう。騎士団、前へ！', win: '覇竜の炎こそ、王者の証だ。', lose: 'その力…お前こそ次の覇者かもしれんな。', scene: 'story/landscape-mountains-05',
  },
  {
    id: 'hanna', name: 'ハンナ', title: '灰の村の生き残り', portrait: 'humans/mage-arch+female', deck: 'ashen-village', level: 'hard', reward: 700, set: 'AB2',
    intro: '四十年、誰も帰ってこなかった。……あんたは、何をしに来たんだい。', win: '帰りな。ここは、もう村じゃない。', lose: '……強いね。あの子も、そうだった。', scene: 'story/p-remains',
  },
  {
    id: 'olden2', name: 'オルデン', title: '若き師', portrait: 'humans/mage-silver', deck: 'young-master', level: 'hard', reward: 900, set: 'AB2',
    intro: '追ってきたか。……ならば、もう一度だけ教えてやろう。', win: 'まだ遠いな、弟子よ。', lose: '……そうか。もう、教えることはないか。', scene: 'story/p-graves',
  },
  {
    id: 'nacht', name: 'ナハト', title: '影の先触れ', portrait: 'undead/shadow', deck: 'herald', level: 'hard', reward: 1000, set: 'AB2',
    intro: '主が、あなたを見つけました。……灰になる前に、少し遊びましょう。', win: 'おやすみなさい。灰の中で。', lose: '……主に、伝えておきましょう。', scene: 'story/p-shadows',
  },
  {
    id: 'zaluk', name: 'ザルク', title: '蛮勇の大王', portrait: 'orcs/sovereign', deck: 'horde', level: 'hard', reward: 720, set: 'AB3',
    intro: 'グォォォ！ 我が軍勢の足音が聞こえぬか！ 踏み潰してくれる！', win: '弱き者に、居場所はない！', lose: 'グ……フ、フハハ！ 小さいくせに、よく吠える！', scene: 'story/p-burning',
  },
  {
    id: 'elwin', name: 'エルウィン', title: '大森林の王', portrait: 'elves/high-lord', deck: 'highelf', level: 'hard', reward: 760, set: 'AB3',
    intro: '森は、あなたを見ていた。その覚悟が本物か、剣で語ってもらおう。', win: '森の声に、耳をかたむけなさい。', lose: '……参りました。森も、あなたを認めたようだ。', scene: 'story/p-black-forest',
  },
  {
    id: 'asha', name: '影の女王', title: '千年の黒幕', portrait: 'camp/asheviere', deck: 'shadow', level: 'hard', reward: 1000, set: 'AB3',
    intro: 'ようこそ、小さな召喚士。あなたの絆ごと、闇に溶かしてあげましょう。', win: '光など、影があるから輝けるのよ。', lose: '……ありえない。私の、千年が……！', scene: 'story/p-shadows',
  },
  {
    id: 'harald', name: 'ハラルド', title: '王都の老将軍', portrait: 'humans/general', deck: 'dragoon', level: 'hard', reward: 780, set: 'AB3',
    intro: '王都の盾として、子どもには道を譲れん。', win: '王都は、まだ倒れん。', lose: '……老いたか。いや、おまえが強いのだ。', scene: 'story/p-hall',
  },
  {
    id: 'celes', name: 'セレス', title: '写本の司書', portrait: 'humans/mage-light+female', deck: 'psychic', level: 'hard', reward: 800, set: 'AB3',
    intro: 'お静かに。頁をめくる覚悟を、見せてください。', win: 'この頁は、まだ早いようです。', lose: '……どうぞ。お読みください。', scene: 'story/p-study',
  },
  {
    id: 'olden3', name: 'オルデン', title: '灰の腕の師', portrait: 'humans/mage-silver', deck: 'elder', level: 'hard', reward: 1000, set: 'AB3',
    intro: '憎め。そして勝て。……それが、最後の授業じゃ。', win: 'まだじゃ。まだ、遠い。', lose: '……よう、育った。', scene: 'story/p-lone-tower',
  },
  {
    id: 'walter', name: 'ヴァルター', title: '門の騎士の亡霊', portrait: 'undead/death-knight', deck: 'lich', level: 'hard', reward: 860, set: 'AB3',
    intro: '門は、開かぬ。千年の悔いにかけて。', win: '誰も、あの椅子には座らせぬ。', lose: '……通れ。王女を、起こしてやってくれ。', scene: 'story/p-castle-fall',
  },
  {
    id: 'riven', name: 'リヴェン', title: '女王の盾', portrait: 'undead/revenant', deck: 'night', level: 'hard', reward: 880, set: 'AB3',
    intro: '陛下の眠りを、乱すな。', win: '盾は、まだ立っている。', lose: '……陛下は、王冠の間におられる。', scene: 'story/p-fort',
  },
  {
    id: 'asha2', name: '影の女王', title: '割れた王冠', portrait: 'camp/asheviere-mad', deck: 'shadow', level: 'hard', reward: 1500, set: 'AB3',
    intro: '座りなさい。十三番目の席に。', win: '王冠は、待てるのよ。', lose: '……さむい。', scene: 'story/p-the-fall',
  },
  {
    id: 'rolf', name: 'ロルフ', title: '街道の剣士', portrait: 'rotl/outlaws/honour-blade', deck: 'c4-road', level: 'hard', reward: 900, set: 'AB4',
    intro: '斬るより、カードのほうが好きでね。抜け！', win: '街道じゃ、二度目からが本番だ。', lose: 'ははっ、斬らなくてよかった。', scene: 'story/p-midlands',
  },
  {
    id: 'zahir', name: 'ザヒール', title: '砂漠のカリフ', portrait: 'rotl/khalifate/mufariq', deck: 'c4-sands', level: 'hard', reward: 920, set: 'AB4',
    intro: '砂の上で論じよう。勝った者の言葉が、正しい。', win: '砂は、強き者の足跡だけを残す。', lose: '……砂が、おまえたちの足跡を残した。', scene: 'story/landscape-desert',
  },
  {
    id: 'igna', name: 'イグナ', title: '炎の塔の大魔導', portrait: 'rotl/magi/fire', deck: 'c4-tower', level: 'hard', reward: 940, set: 'AB4',
    intro: '火は、明日のために焚く。', win: '火に近づきすぎたわね。', lose: '……強い子。でも、火は焚くわ。', scene: 'story/p-fire-sky',
  },
  {
    id: 'brandl', name: 'ブランドル', title: 'ドワーフの砦の王', portrait: 'rotl/dwarves/hero', deck: 'c4-hold', level: 'hard', reward: 960, set: 'AB4',
    intro: '石は、嘘をつかん。砦、構え！', win: '石頭は、まだ割れんぞ。', lose: '……割られたな。わしの石頭が。', scene: 'story/blacksmith',
  },
  {
    id: 'sylvan', name: 'シルヴァン', title: '千年前の森の王', portrait: 'rotl/elves/ruler', deck: 'c4-court', level: 'hard', reward: 980, set: 'AB4',
    intro: '森は、約束を忘れない。', win: '森は、何度でも芽吹く。', lose: '……あなたの剣は、森に似ている。', scene: 'story/p-elf-wood',
  },
  {
    id: 'grukka', name: 'グルカ', title: '千年前のオークの大王', portrait: 'rotl/orcs/warmonger', deck: 'c4-horde', level: 'hard', reward: 1000, set: 'AB4',
    intro: '戦は、戦士が終わらせる！', win: 'グハ！ まだまだ軽い！', lose: 'グ……小さいのに、拳が重い。', scene: 'story/landscape-battlefield_nohumans',
  },
  {
    id: 'morg', name: 'モルグ', title: '闇の主', portrait: 'rotl/outlaws/master_of_darkness', deck: 'c4-road', level: 'hard', reward: 1020, set: 'AB4',
    intro: '闇は、どこにでも潜む。', win: 'くく……闇に呑まれたか。', lose: '……くく。未来の子は、強いな。', scene: 'story/p-dark-pines',
  },
  {
    id: 'nekra', name: 'ネクラ', title: '死者の国の女王', portrait: 'rotl/undead/arch-necromancer+female', deck: 'c4-dead', level: 'hard', reward: 1040, set: 'AB4',
    intro: '命の重さを、量りましょう。', win: 'まだ、軽いわね。', lose: '……重い言葉ね。', scene: 'story/p-graves',
  },
  {
    id: 'ella', name: 'エラ', title: '塔の絵描き', portrait: 'rotl/humans/arcane-female', deck: 'c4-arcane', level: 'hard', reward: 1060, set: 'AB4',
    intro: '筆より強いものを、見せて。', win: 'まだ、線がぶれてる。', lose: '……本物ね。', scene: 'story/p-lone-tower',
  },
  {
    id: 'nept', name: 'ネプト', title: '千年前の海の王', portrait: 'rotl/other/king', deck: 'c4-sea', level: 'hard', reward: 1080, set: 'AB4',
    intro: '潮は、誰も縛らない。', win: '潮は、また満ちる。', lose: '……強いな。', scene: 'story/p-storm-sea',
  },
  {
    id: 'ashurie', name: 'アシュリエ', title: '千年前の王女', portrait: 'rotl/magi/celestial+female', deck: 'c4-arcane', level: 'hard', reward: 1100, set: 'AB4',
    intro: '描く理由は、わたしが決める。', win: 'ふふ、けっこう強いのよ。', lose: '……負けちゃった。', scene: 'story/p-summer',
  },
  {
    id: 'volks', name: 'ヴォルクス', title: '十二国の上王', portrait: 'rotl/humans/epic', deck: 'c4-crown', level: 'hard', reward: 1500, set: 'AB4',
    intro: '千年の平和を、この手で。', win: '政は、子どもの遊びではない。', lose: '……見事。だが、遅い。', scene: 'story/p-temple',
  },
  {
    id: 'eckhart', name: 'エッカルト', title: '老騎士の残響', portrait: 'ch5/drogan', deck: 'c5-knights', level: 'hard', reward: 1100, set: 'AB5',
    intro: '老騎士の、最後の一戦を。', win: '剣を拾え。老人は、待つのが得意だ。', lose: '……よき剣だ。満足した。', scene: 'story/landscape-plain',
  },
  {
    id: 'beorn', name: 'ベオルン', title: '北の盾の残響', portrait: 'ch5/howgarth', deck: 'c5-north', level: 'hard', reward: 1120, set: 'AB5',
    intro: '盾は、下ろさん。', win: '吹雪は、まだやまんぞ。', lose: '……盾が、軽くなった。', scene: 'story/p-snowfield',
  },
  {
    id: 'matthias', name: 'マティアス', title: '禁書の魔導士の残響', portrait: 'ch5/malin-old', deck: 'c5-necro', level: 'hard', reward: 1140, set: 'AB5',
    intro: '頁は、まだ終わらない。', win: 'まだ、頁が残っている。', lose: '……閉じられた。', scene: 'story/p-study',
  },
  {
    id: 'sara', name: 'サラ', title: '砂漠の星読みの残響', portrait: 'ch5/nym', deck: 'c5-sands', level: 'hard', reward: 1160, set: 'AB5',
    intro: '星は、ちゃんと見てるよ！', win: 'えへへ、迷子になっちゃった？', lose: 'わ、負けた！ 強いね！', scene: 'story/landscape-desert',
  },
  {
    id: 'isildia', name: 'イシルディア', title: '森の女王の残響', portrait: 'ch5/uradredia', deck: 'c5-elves', level: 'hard', reward: 1180, set: 'AB5',
    intro: '聖樹の名において。', win: '森は、何度でも芽吹きます。', lose: '……見事でした。', scene: 'story/p-great-tree',
  },
  {
    id: 'grimwald', name: 'グリムヴァルト', title: '鍛冶神の残響', portrait: 'ch5/thursagan', deck: 'c5-forge', level: 'hard', reward: 1200, set: 'AB5',
    intro: '鉄は、嘘をつかん。', win: '鉄は、何度でも打ち直せる。', lose: '……割らん、という目をしとる。', scene: 'story/blacksmith',
  },
  {
    id: 'braga', name: 'ブラガ', title: '黄金の大族長の残響', portrait: 'ch5/kapoue', deck: 'c5-orc', level: 'hard', reward: 1220, set: 'AB5',
    intro: '黒き眼の、最後の戦！', win: 'グハハ！ 立て！', lose: 'グ……見事。', scene: 'story/landscape-battlefield_nohumans',
  },
  {
    id: 'maris', name: 'マリス', title: '海の王子の残響', portrait: 'ch5/kai-krellis', deck: 'c5-tide', level: 'hard', reward: 1240, set: 'AB5',
    intro: '潮は、誰も縛らない。', win: '潮は、また満ちる。', lose: '……千年ぶりの、風だ。', scene: 'story/p-storm-sea',
  },
  {
    id: 'wolfram', name: 'ヴォルフラム', title: '赤い外套の暗黒卿', portrait: 'ch5/eldaric', deck: 'c5-dark', level: 'hard', reward: 1260, set: 'AB5',
    intro: '赤い外套に、誓って。', win: 'まだ、迷いがある。', lose: '……清らかな剣だ。', scene: 'story/p-castle-fall',
  },
  {
    id: 'aurel', name: 'アウレル', title: '天輪の魔導士の残響', portrait: 'ch5/edmond', deck: 'c5-storm', level: 'hard', reward: 1280, set: 'AB5',
    intro: '天輪よ、答えを示せ。', win: '答えを急がないで。', lose: '……強い。でも、答えは、まだだね。', scene: 'story/p-study',
  },
  {
    id: 'olden4', name: 'オルデン', title: '最後の授業', portrait: 'camp/delfador', deck: 'elder', level: 'hard', reward: 1500, set: 'AB5',
    intro: '来い、わしの自慢の弟子！', win: '授業は、まだ終わっとらん。', lose: '……負けた。本当に、もう、教えることはないのう。', scene: 'story/p-statue',
  },
  {
    id: 'crown', name: 'ヴォルクス', title: '王冠の残響', portrait: 'rotl/humans/epic', deck: 'c5-kings', level: 'hard', reward: 2000, set: 'AB5',
    intro: '十二の王よ、筆を取れ！', win: '盟約は、子どもの夢では止まらぬ。', lose: '……見事だ。千年前に、この剣があれば。', scene: 'story/p-great-tree',
  },
];

/**
 * a CPU's deck at its strength: every card swapped for its strongest printing
 * up to `maxTier` (0 regular … 3 gold). Rarer printings hit harder and draw more.
 */
export function upgradeDeck(ids: string[], maxTier: number): string[] {
  if (maxTier <= 0) return ids;
  return ids.map((id) => strongestPrinting(id, maxTier));
}
/** how strong the printings a CPU level brings are */
export const cpuPrintTier = (level: number) => (level >= 7 ? 2 : level >= 5 ? 1 : 0);

/**
 * prebuilt decks by strength (round robin at Lv5, scripts/deck-rank.ts), the
 * strongest first. High CPU levels pick from the top of this list.
 */
export const DECK_STRENGTH = ['highelf', 'sunfolk', 'wyrm', 'lich', 'shadow', 'ashen-village', 'water', 'naga', 'psychic', 'night', 'grass'];
