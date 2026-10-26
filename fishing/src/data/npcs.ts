import type { SpotId } from './types';
import { DOCK as LAKE_DOCK, HUT as LAKE_HUT } from '../world/shapes/lake';
import { COAST_DOCK, COAST_HUT, ZONES, coastX } from '../world/shapes/coast';

/** 依頼に出す魚：size = 'any' 大きさ不問 / 'good' 平均以上 / 'big' 大物 */
export interface RequestPick {
  species: string;
  count: [number, number];
  size?: 'any' | 'good' | 'big';
  /** 選ばれやすさ */
  weight?: number;
}

export interface NpcDef {
  id: string;
  name: string;
  /** 肩書き（話しかける時に表示） */
  title: string;
  area: SpotId;
  /** public/assets/npc/<model>.json（Kenney Mini Characters） */
  model: string;
  x: number;
  z: number;
  /** 向き（プレイヤーと同じ規則：0 = -Z を向く） */
  yaw: number;
  pool: RequestPick[];
  /** 報酬の倍率 */
  rewardMult: number;
  lines: {
    /** 依頼を頼む時（{fish} に依頼内容が入る） */
    ask: string[];
    /** まだ揃っていない時 */
    waiting: string[];
    /** 渡した時 */
    thanks: string[];
    /** 今日の依頼を済ませた後 */
    done: string[];
  };
}

export const NPCS: NpcDef[] = [
  {
    id: 'kenta',
    name: 'ケンタ',
    title: '釣り仲間',
    area: 'lake',
    model: 'male-c',
    x: LAKE_DOCK.xLand - 4,
    z: 0.95,
    yaw: Math.PI / 2,
    rewardMult: 1.8,
    pool: [
      { species: 'largemouth', count: [1, 1], size: 'good', weight: 3 },
      { species: 'largemouth', count: [1, 1], size: 'big' },
      { species: 'smallmouth', count: [1, 1], size: 'good', weight: 2 },
      { species: 'rainbow', count: [1, 2], size: 'any', weight: 2 },
      { species: 'namazu', count: [1, 1], size: 'good' },
      { species: 'bluegill', count: [3, 5], size: 'any', weight: 2 },
    ],
    lines: {
      ask: ['よう！ 今日は{fish}を見せてくれないか？ 写真を撮りたいんだ', '今日の課題は{fish}だ。どっちが先に釣るか勝負な'],
      waiting: ['まだか？ {fish}だぞ。焦らずいこうぜ', 'ルアーを替えてみるのも手だぜ。{fish}、待ってる'],
      thanks: ['うおっ、いい魚！ さすがだな。これ、取っといてくれ', 'やるなあ！ 約束の礼だ'],
      done: ['今日はもう十分だ。また明日、勝負しようぜ'],
    },
  },
  {
    id: 'haru',
    name: 'ハル',
    title: '近所のおばあちゃん',
    area: 'lake',
    model: 'female-d',
    x: LAKE_HUT.x - 6,
    z: LAKE_HUT.z + 7,
    yaw: Math.PI / 2,
    rewardMult: 2.2,
    pool: [
      { species: 'ginbuna', count: [2, 3], size: 'any', weight: 2 },
      { species: 'koi', count: [1, 1], size: 'any', weight: 2 },
      { species: 'wakasagi', count: [4, 6], size: 'any', weight: 2 },
      { species: 'oikawa', count: [3, 4], size: 'any', weight: 2 },
      { species: 'ugui', count: [2, 3], size: 'any' },
      { species: 'herabuna', count: [1, 2], size: 'good' },
    ],
    lines: {
      ask: ['あら、いらっしゃい。今夜は{fish}が食べたいねえ。頼めるかい？', '孫が遊びに来るんだよ。{fish}を持ってきてくれたら助かるねえ'],
      waiting: ['{fish}、急がなくていいからね', 'のんびりでいいよ。{fish}を待ってるからね'],
      thanks: ['まあ、立派だこと。ありがとうねえ。少ないけど取っておいて', '助かったよ。これはお礼だよ'],
      done: ['今日はもう十分だよ。また明日おいで'],
    },
  },
  {
    id: 'genji',
    name: 'ゲンジ',
    title: '漁師',
    area: 'coast',
    model: 'male-e',
    x: COAST_DOCK.xLand - 7,
    z: -1.7,
    yaw: Math.PI / 2,
    rewardMult: 1.7,
    pool: [
      { species: 'kurodai', count: [1, 1], size: 'good', weight: 3 },
      { species: 'suzuki', count: [1, 1], size: 'good', weight: 3 },
      { species: 'mejina', count: [1, 2], size: 'any', weight: 2 },
      { species: 'buri', count: [1, 1], size: 'any', weight: 2 },
      { species: 'madai', count: [1, 1], size: 'any' },
      { species: 'kurodai', count: [1, 1], size: 'big' },
      { species: 'ishidai', count: [1, 1], size: 'any', weight: 0.6 },
    ],
    lines: {
      ask: ['おう、若いの。{fish}を揚げてみな。腕を見てやる', '市場に急ぎの注文が入った。{fish}、頼めるか'],
      waiting: ['{fish}だ。潮が動く時間を狙え', '{fish}はまだか。朝夕のマヅメが勝負だぞ'],
      thanks: ['……いい腕だ。持ってけ', 'ほう、やるじゃねえか。約束の駄賃だ'],
      done: ['今日の仕事は終わりだ。また来な'],
    },
  },
  {
    id: 'hide',
    name: 'ヒデ',
    title: '料理屋「汐見亭」の大将',
    area: 'coast',
    model: 'male-a',
    x: COAST_HUT.x - 7,
    z: COAST_HUT.z - 6,
    yaw: Math.PI / 2 + 0.4,
    rewardMult: 2.0,
    pool: [
      { species: 'aji', count: [3, 5], size: 'any', weight: 3 },
      { species: 'kisu', count: [3, 4], size: 'any', weight: 2 },
      { species: 'saba', count: [2, 3], size: 'any', weight: 2 },
      { species: 'kawahagi', count: [1, 2], size: 'any', weight: 2 },
      { species: 'kasago', count: [2, 3], size: 'any', weight: 2 },
      { species: 'iwashi', count: [5, 8], size: 'any', weight: 2 },
      { species: 'tachiuo', count: [1, 1], size: 'good' },
      { species: 'aji', count: [1, 2], size: 'big' },
    ],
    lines: {
      ask: ['いらっしゃい！ 今日のおすすめに{fish}を出したいんだ。仕入れを頼めるかい', '常連さんが{fish}をご所望でね。お願いできるかな'],
      waiting: ['{fish}、待ってるよ。新鮮なうちに頼むね', '仕込みに間に合うといいんだが。{fish}だよ'],
      thanks: ['いい魚だ！ これなら最高の一皿になる。お代だよ', '鮮度抜群！ ありがとう、また頼むよ'],
      done: ['今日の仕入れは十分だ。また明日よろしく！'],
    },
  },
  {
    id: 'saki',
    name: 'サキ',
    title: '汐見水族館の飼育員',
    area: 'coast',
    model: 'female-b',
    x: coastX(ZONES.river + 20) + 9,
    z: ZONES.river + 20,
    yaw: Math.PI / 2 - 0.3,
    rewardMult: 2.4,
    pool: [
      { species: 'kyusen', count: [1, 2], size: 'any', weight: 2 },
      { species: 'kusafugu', count: [1, 2], size: 'any', weight: 2 },
      { species: 'bora', count: [1, 1], size: 'any', weight: 2 },
      { species: 'kasago', count: [1, 1], size: 'good', weight: 2 },
      { species: 'kawahagi', count: [1, 1], size: 'good' },
      { species: 'ishidai', count: [1, 1], size: 'any', weight: 0.5 },
      { species: 'madai', count: [1, 1], size: 'any', weight: 0.6 },
    ],
    lines: {
      ask: ['こんにちは！ 水族館の新しい水槽に{fish}を迎えたいんです。協力してもらえませんか？', '展示用に{fish}を探しているんです。お願いできますか？'],
      waiting: ['{fish}、見つかりそうですか？ 磯や河口を探してみてください', '{fish}、楽しみに待ってますね'],
      thanks: ['わあ、元気な子！ 大切に展示しますね。これはお礼です', 'ありがとうございます！ 館長も喜びます'],
      done: ['今日の展示の準備はばっちりです。また明日来てくださいね'],
    },
  },
];

export const NPC_BY_ID: Record<string, NpcDef> = Object.fromEntries(NPCS.map((n) => [n.id, n]));
