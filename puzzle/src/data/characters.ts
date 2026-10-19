export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export type SkillKind =
  | 'bombs' // spawn bombs
  | 'hline' // clear a horizontal band
  | 'vline' // clear a vertical band
  | 'random' // pop N random pieces
  | 'circle' // clear a big circle in the middle
  | 'paint' // recolor pieces into the most common color
  | 'colorBlast' // pop every piece of the most common color
  | 'bigMaker' // turn pieces into big pieces
  | 'fever' // instantly start fever
  | 'twoColor' // pop every piece of the two most common colors
  | 'allClear'; // pop everything

export interface CharDef {
  id: string;
  name: string;
  rarity: Rarity;
  atk: number;
  skill: { kind: SkillKind; name: string; desc: string; charge: number; power: number; amount?: number };
  catch: string;
}

type Row = [id: string, name: string, rarity: Rarity, atk: number, skill: CharDef['skill'], catchCopy: string];

const S = {
  bomb1: { kind: 'bombs', name: 'ころころボム', desc: 'ボムを1個つくる', charge: 26, power: 2, amount: 1 },
  hline: { kind: 'hline', name: 'よこなぎ', desc: '横一列をまとめて消す', charge: 28, power: 3 },
  vline: { kind: 'vline', name: 'たてわり', desc: '縦一列をまとめて消す', charge: 28, power: 3 },
  random8: { kind: 'random', name: 'きまぐれ', desc: 'ランダムに8個消す', charge: 25, power: 3, amount: 8 },
  circle: { kind: 'circle', name: 'どっかーん', desc: '真ん中の円の範囲を消す', charge: 30, power: 3.5 },
  bomb2: { kind: 'bombs', name: 'ダブルボム', desc: 'ボムを2個つくる', charge: 32, power: 3, amount: 2 },
  paint: { kind: 'paint', name: 'いろぬり', desc: '10個を多い色にぬりかえる', charge: 28, power: 1.5, amount: 10 },
  blast: { kind: 'colorBlast', name: 'いっせい攻撃', desc: 'いちばん多い色を全部消す', charge: 34, power: 4 },
  big: { kind: 'bigMaker', name: 'でっかくなーれ', desc: '6個をデカピースに変える', charge: 32, power: 2, amount: 6 },
  fever: { kind: 'fever', name: 'フィーバータイム', desc: 'すぐにフィーバー突入！', charge: 36, power: 2 },
  two: { kind: 'twoColor', name: 'ダブルブレイク', desc: '多い2色を全部消す', charge: 40, power: 5 },
  all: { kind: 'allClear', name: 'ぜんぶ消し', desc: '盤面を全部消す', charge: 44, power: 6 },
} satisfies Record<string, CharDef['skill']>;

const ROWS: Row[] = [
  // N: legacy heads
  ['kh_a', 'キリッと', 'N', 100, S.bomb1, 'まゆげに自信あり。毎朝ととのえている。'],
  ['kh_b', 'ツンツン', 'N', 102, S.hline, 'ツンツン頭の見習い剣士。'],
  ['kh_c', 'きりり', 'N', 101, S.vline, 'まじめで几帳面。おかたづけが得意。'],
  ['rh_a', 'ロングヘア', 'N', 99, S.random8, 'さらさらの長い髪がじまん。'],
  ['rh_b', 'ブロンド', 'N', 103, S.hline, 'のんびり屋さん。お昼寝が大好き。'],
  ['rh_c', 'ボブ', 'N', 100, S.vline, 'すばしっこい村の配達係。'],
  ['mh_a', 'ひげ長老', 'N', 98, S.random8, 'ながーいおひげの物知りおじいさん。'],
  ['mh_b', 'ひげ先生', 'N', 102, S.bomb1, '魔法学校の先生。宿題が多い。'],
  ['mh_c', 'ひげ見習い', 'N', 101, S.hline, 'おひげを伸ばし中の見習い魔法使い。'],
  ['bh_a', 'ひげ親方', 'N', 104, S.vline, '鍛冶屋の親方。声が大きい。'],
  ['bh_b', 'ひげ兄貴', 'N', 103, S.random8, '力持ちの兄貴分。面倒見がいい。'],
  // R
  ['l_knight', '見習い騎士', 'R', 124, S.circle, 'かぶとが大きくてちょっと前が見えない。'],
  ['l_barbarian', 'クマかぶり', 'R', 128, S.bomb2, 'クマの毛皮がお気に入りの戦士。'],
  ['l_mage', 'とんがり帽', 'R', 122, S.paint, '帽子のつばで顔がかくれがち。'],
  ['skull', 'ドクロ', 'R', 130, S.circle, 'カラカラ笑うおちゃめなドクロ。'],
  ['skel_minion', 'ホネっこ', 'R', 126, S.bomb2, 'ホネだけど元気いっぱい。'],
  // SR
  ['knight', 'ナイト', 'SR', 156, S.blast, '王国を守る正義の騎士。'],
  ['barbarian', 'バーバリアン', 'SR', 160, S.two, 'クマの頭をかぶった豪快な戦士。'],
  ['mage', 'メイジ', 'SR', 150, S.big, '大きな帽子の天才魔法使い。'],
  ['rogue', 'ローグ', 'SR', 154, S.paint, '身軽な弓の名手。'],
  ['hood', 'フードローグ', 'SR', 152, S.fever, 'フードの奥で何を考えているのかな？'],
  // SSR
  ['skel_warrior', 'ホネ戦士', 'SSR', 192, S.two, '角かぶとのスケルトン戦士。'],
  ['skel_mage', 'ホネ魔導士', 'SSR', 186, S.all, 'いにしえの魔法をあやつるスケルトン。'],
  ['skel_rogue', 'ホネ盗賊', 'SSR', 188, S.fever, '赤いフードの神出鬼没なスケルトン。'],
];

export const CHARACTERS: CharDef[] = ROWS.map(([id, name, rarity, atk, skill, catchCopy]) => ({ id, name, rarity, atk, skill, catch: catchCopy }));

export const STARTER_ID = 'kh_a';

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c])) as Record<string, CharDef>;

export const RARITY_INFO: Record<Rarity, { color: number; stars: number; rate: number; label: string }> = {
  N: { color: 0x9aa7b8, stars: 1, rate: 0.55, label: 'N' },
  R: { color: 0x4fc3ff, stars: 2, rate: 0.3, label: 'R' },
  SR: { color: 0xffb020, stars: 3, rate: 0.12, label: 'SR' },
  SSR: { color: 0xff4fd8, stars: 4, rate: 0.03, label: 'SSR' },
};

export const MAX_LV = 10;

/** Attack including level bonus. */
export function charAtk(c: CharDef, lv: number): number {
  return Math.round(c.atk * (1 + (lv - 1) * 0.07));
}

/** Pieces needed to charge the skill (levels shave it down). */
export function charCharge(c: CharDef, lv: number): number {
  return c.skill.charge - Math.floor((lv - 1) / 2);
}

/** Copies needed to reach the next level. */
export function copiesForLevel(lv: number): number {
  // Lv1 = 1 copy, each further level needs one more copy than the last one did, capped at 3.
  let total = 1;
  for (let l = 1; l < lv; l++) total += Math.min(3, l);
  return total;
}

export function levelFromCount(count: number): number {
  let lv = 1;
  while (lv < MAX_LV && copiesForLevel(lv + 1) <= count) lv++;
  return lv;
}
