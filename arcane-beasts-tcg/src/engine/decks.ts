import { byName, card } from './cards';
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
}

export const RIVALS: Rival[] = [
  {
    id: 'tim', name: 'ティム', title: '村の少年', portrait: 'humans/peasant', deck: 'grass', level: 'easy', reward: 150,
    intro: 'ぼくの森の仲間たち、すっごく強いんだ！勝負しよう！', win: 'やったー！森のみんな、ありがとう！', lose: 'うわぁ、負けちゃった…でも楽しかった！', scene: 'story/landscape-hills-01',
  },
  {
    id: 'marina', name: 'マリナ', title: '潮騒の巫女', portrait: 'merfolk/initiate', deck: 'water', level: 'easy', reward: 180,
    intro: '海の声が聞こえる…あなたの実力、見せてもらうわ。', win: '波は全てを飲み込むの。', lose: '見事ね。海もあなたを認めたみたい。', scene: 'story/landscape-coast',
  },
  {
    id: 'vane', name: 'ヴェイン', title: '雷弓の射手', portrait: 'humans/longbowman', deck: 'lightning', level: 'normal', reward: 220,
    intro: '俺の雷は一瞬で獲物を射抜く。目を離すなよ。', win: '遅い、遅すぎる！', lose: '…ちっ、俺の矢が見切られるとはな。', scene: 'story/landscape-mountains-04',
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
    id: 'rouga', name: 'ロウガ', title: '狼使い', portrait: 'goblins/wolf-rider', deck: 'wolf', level: 'hard', reward: 350,
    intro: '群れの牙から逃げられると思うなよ。', win: '狩りは終わりだ。', lose: '…群れを率いる器、お前にはあるようだな。', scene: 'story/landscape-plain',
  },
  {
    id: 'lilith', name: 'リリス', title: '夢魔の魔女', portrait: 'humans/dark-adept+female', deck: 'psychic', level: 'hard', reward: 400,
    intro: 'ふふ…いい夢を見せてあげる。二度と覚めない夢をね。', win: 'おやすみなさい、永遠に…', lose: 'あら…悪夢から目覚めるなんて、面白い人。', scene: 'story/swamp-02',
  },
  {
    id: 'necros', name: 'ネクロス', title: '冥府の王', portrait: 'undead/ancient-lich', deck: 'dark', level: 'hard', reward: 600,
    intro: '千年の眠りを妨げし者よ…その魂、我が軍勢に加えてくれよう。', win: '魂はもらったぞ…', lose: 'バカな…この我が敗れるだと…！', scene: 'story/bones',
  },
];
