export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export type SkillKind =
  | 'bombs' // drop bombs into the bowl
  | 'hline' // clear a horizontal band
  | 'vline' // clear a vertical band
  | 'diag' // clear a diagonal band
  | 'cross' // clear a + shaped pair of bands
  | 'random' // pop N random pieces, one after another
  | 'circle' // clear circles (amount = how many blasts)
  | 'bottom' // clear the bottom of the bowl (size = height in radii)
  | 'rim' // clear the ring along the bowl's edge
  | 'paint' // recolor pieces into the most common color
  | 'bigMaker' // turn pieces into big pieces
  | 'tapPop' // for a few seconds, tapping pops a whole same-color group
  | 'colorBlast' // pop every piece of the most common color
  | 'twoColor' // pop every piece of the two most common colors
  | 'feverTap' // start fever and allow group tapping for its duration
  | 'allClear'; // pop everything

export interface Skill {
  kind: SkillKind;
  name: string;
  desc: string;
  /** Pieces to pop before the skill piece drops. */
  charge: number;
  /** Damage multiplier for pieces the skill pops. */
  power: number;
  amount?: number;
  /** Size in piece radii (band width, blast radius...). */
  size?: number;
  /** Seconds, for timed skills. */
  dur?: number;
}

export interface CharDef {
  id: string;
  name: string;
  rarity: Rarity;
  atk: number;
  skill: Skill;
  catch: string;
}

type Row = [id: string, name: string, rarity: Rarity, atk: number, skill: Skill, catchCopy: string];

// Every character has its own skill. Strength (power, size, amount) grows with rarity:
// N ≈ power 1.6–2, R ≈ 2.4–2.8, SR ≈ 3.2–3.6, SSR ≈ 4.5–5.
const ROWS: Row[] = [
  // N
  ['kh_a', 'キリッと', 'N', 100, { kind: 'bombs', name: 'ころころボム', desc: 'ボムを1個おとす', charge: 24, power: 1.8, amount: 1 }, 'まゆげに自信あり。毎朝ととのえている。'],
  ['kh_b', 'ツンツン', 'N', 102, { kind: 'hline', name: 'よこなぎ', desc: '横一列をまとめて消す', charge: 26, power: 1.8, size: 1.7 }, 'ツンツン頭の見習い剣士。'],
  ['kh_c', 'きりり', 'N', 101, { kind: 'vline', name: 'たてわり', desc: '縦一列をまとめて消す', charge: 26, power: 1.8, size: 1.7 }, 'まじめで几帳面。おかたづけが得意。'],
  ['rh_a', 'ロングヘア', 'N', 99, { kind: 'random', name: 'かぜのいたずら', desc: 'ランダムに7個消す', charge: 24, power: 1.9, amount: 7 }, 'さらさらの長い髪がじまん。'],
  ['rh_b', 'ブロンド', 'N', 103, { kind: 'circle', name: 'おひるねドーン', desc: 'まんなかを丸く消す', charge: 27, power: 1.8, amount: 1, size: 2.8 }, 'のんびり屋さん。お昼寝が大好き。'],
  ['rh_c', 'ボブ', 'N', 100, { kind: 'paint', name: 'おとどけもの', desc: '8個を多い色にぬりかえる', charge: 24, power: 1.6, amount: 8 }, 'すばしっこい村の配達係。'],
  ['mh_a', 'ひげ長老', 'N', 98, { kind: 'diag', name: 'ながーいおひげ', desc: 'ななめ一列をまとめて消す', charge: 26, power: 1.9, size: 1.7 }, 'ながーいおひげの物知りおじいさん。'],
  ['mh_b', 'ひげ先生', 'N', 102, { kind: 'cross', name: 'ばってんチェック', desc: '十字にまとめて消す', charge: 28, power: 1.8, size: 1.3 }, '魔法学校の先生。宿題が多い。'],
  ['mh_c', 'ひげ見習い', 'N', 101, { kind: 'bigMaker', name: 'みならいマジック', desc: '3個をデカピースに変える', charge: 25, power: 1.6, amount: 3 }, 'おひげを伸ばし中の見習い魔法使い。'],
  ['bh_a', 'ひげ親方', 'N', 104, { kind: 'bottom', name: 'かなづちドン', desc: 'ボウルの底をまとめて消す', charge: 27, power: 1.8, size: 2.2 }, '鍛冶屋の親方。声が大きい。'],
  ['bh_b', 'ひげ兄貴', 'N', 103, { kind: 'rim', name: 'ぐるっとひとまわり', desc: 'ボウルのふちを一周消す', charge: 28, power: 1.9, size: 1.6 }, '力持ちの兄貴分。面倒見がいい。'],
  // R
  ['l_knight', '見習い騎士', 'R', 124, { kind: 'circle', name: 'たてのいちげき', desc: 'まんなかを大きく丸く消す', charge: 30, power: 2.6, amount: 1, size: 3.8 }, 'かぶとが大きくてちょっと前が見えない。'],
  ['l_barbarian', 'クマかぶり', 'R', 128, { kind: 'bombs', name: 'ダブルボム', desc: 'ボムを2個おとす', charge: 30, power: 2.6, amount: 2 }, 'クマの毛皮がお気に入りの戦士。'],
  ['l_mage', 'とんがり帽', 'R', 122, { kind: 'paint', name: 'いろぬり', desc: '14個を多い色にぬりかえる', charge: 28, power: 2.4, amount: 14 }, '帽子のつばで顔がかくれがち。'],
  ['skull', 'ドクロ', 'R', 130, { kind: 'random', name: 'カラカラわらい', desc: 'ランダムに14個消す', charge: 30, power: 2.8, amount: 14 }, 'カラカラ笑うおちゃめなドクロ。'],
  ['skel_minion', 'ホネっこ', 'R', 126, { kind: 'tapPop', name: 'ホネまわし', desc: '4秒間タップでまとめて消せる', charge: 30, power: 2.4, dur: 4 }, 'ホネだけど元気いっぱい。'],
  // SR
  ['knight', 'ナイト', 'SR', 156, { kind: 'colorBlast', name: 'いっせい攻撃', desc: 'いちばん多い色を全部消す', charge: 34, power: 3.4 }, '王国を守る正義の騎士。'],
  ['barbarian', 'バーバリアン', 'SR', 160, { kind: 'bottom', name: 'じならし', desc: 'ボウルの下半分をまとめて消す', charge: 34, power: 3.4, size: 4.2 }, 'クマの頭をかぶった豪快な戦士。'],
  ['mage', 'メイジ', 'SR', 150, { kind: 'circle', name: 'メテオ', desc: '4か所を丸く消す', charge: 34, power: 3.2, amount: 4, size: 2.6 }, '大きな帽子の天才魔法使い。'],
  ['rogue', 'ローグ', 'SR', 154, { kind: 'random', name: 'れんぞくアロー', desc: 'ランダムに22個消す', charge: 34, power: 3.4, amount: 22 }, '身軽な弓の名手。'],
  ['hood', 'フードローグ', 'SR', 152, { kind: 'tapPop', name: 'フードの手品', desc: '7秒間タップでまとめて消せる', charge: 34, power: 3.2, dur: 7 }, 'フードの奥で何を考えているのかな？'],
  // SSR
  ['skel_warrior', 'ホネ戦士', 'SSR', 192, { kind: 'twoColor', name: 'ダブルブレイク', desc: '多い2色を全部消す', charge: 40, power: 4.6 }, '角かぶとのスケルトン戦士。'],
  ['skel_mage', 'ホネ魔導士', 'SSR', 186, { kind: 'allClear', name: 'ぜんぶ消し', desc: 'ボウルの中を全部消す', charge: 44, power: 5 }, 'いにしえの魔法をあやつるスケルトン。'],
  ['skel_rogue', 'ホネ盗賊', 'SSR', 188, { kind: 'feverTap', name: 'かげのうたげ', desc: 'フィーバー突入＋その間タップでまとめて消せる', charge: 40, power: 4.5 }, '赤いフードの神出鬼没なスケルトン。'],
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
