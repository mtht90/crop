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
  | 'timePlus' // add seconds, then pop a few random pieces
  | 'ring' // clear a donut around the middle
  | 'bombMaker' // turn pieces into bombs
  | 'arrows' // clear several thin vertical columns
  | 'shuriken' // small blasts at random spots
  | 'xBlast' // a wide X across the bowl, plus fever gauge
  | 'megaBombs' // drop big bombs
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

export type PassiveKind = 'guard' | 'shadow' | 'oath' | 'treat';

/** Always-on bonus (SSR only). */
export interface Passive {
  kind: PassiveKind;
  name: string;
  desc: string;
}

export interface CharDef {
  id: string;
  name: string;
  rarity: Rarity;
  atk: number;
  skill: Skill;
  catch: string;
  passive?: Passive;
  /** First day (JST, YYYY-MM-DD) the character appears; hidden before that. */
  release?: string;
  /** Last day (JST) a limited character can be pulled. Copies already pulled are kept. */
  limitedUntil?: string;
}

type Row = [id: string, name: string, rarity: Rarity, atk: number, skill: Skill, catchCopy: string];

// Every character has its own skill. Strength (power, size, amount) grows with rarity:
// SR land around 2x an N in play, SSR around 3x (plus a passive).
const ROWS: Row[] = [
  // N
  ['kh_a', 'キリッと', 'N', 100, { kind: 'bombs', name: 'ころころボム', desc: 'ボムを1個おとす', charge: 24, power: 1.8, amount: 1 }, 'まゆげに自信あり。毎朝ととのえている。'],
  ['kh_b', 'ツンツン', 'N', 102, { kind: 'hline', name: 'よこなぎ', desc: '横一列をまとめて消す', charge: 26, power: 1.75, size: 1.7 }, 'ツンツン頭の見習い剣士。'],
  ['kh_c', 'きりり', 'N', 101, { kind: 'vline', name: 'たてわり', desc: '縦一列をまとめて消す', charge: 26, power: 1.8, size: 1.7 }, 'まじめで几帳面。おかたづけが得意。'],
  ['rh_a', 'ロングヘア', 'N', 99, { kind: 'random', name: 'かぜのいたずら', desc: 'ランダムに10個消す', charge: 24, power: 2.75, amount: 10 }, 'さらさらの長い髪がじまん。'],
  ['rh_b', 'ブロンド', 'N', 103, { kind: 'circle', name: 'おひるねドーン', desc: 'まんなかを丸く消す', charge: 27, power: 3.38, amount: 1, size: 3.0 }, 'のんびり屋さん。お昼寝が大好き。'],
  ['rh_c', 'ボブ', 'N', 100, { kind: 'paint', name: 'おとどけもの', desc: '11個を多い色にぬりかえる', charge: 24, power: 2.0, amount: 11 }, 'すばしっこい村の配達係。'],
  ['mh_a', 'ひげ長老', 'N', 98, { kind: 'diag', name: 'ながーいおひげ', desc: 'ななめ一列をまとめて消す', charge: 26, power: 3.0, size: 1.7 }, 'ながーいおひげの物知りおじいさん。'],
  ['mh_b', 'ひげ先生', 'N', 102, { kind: 'cross', name: 'ばってんチェック', desc: '十字にまとめて消す', charge: 28, power: 1.95, size: 1.3 }, '魔法学校の先生。宿題が多い。'],
  ['mh_c', 'ひげ見習い', 'N', 101, { kind: 'bigMaker', name: 'みならいマジック', desc: '3個をデカピースに変える', charge: 25, power: 1.5, amount: 3 }, 'おひげを伸ばし中の見習い魔法使い。'],
  ['bh_a', 'ひげ親方', 'N', 104, { kind: 'bottom', name: 'かなづちドン', desc: 'ボウルの底をまとめて消す', charge: 27, power: 1.85, size: 2.2 }, '鍛冶屋の親方。声が大きい。'],
  ['bh_b', 'ひげ兄貴', 'N', 103, { kind: 'rim', name: 'ぐるっとひとまわり', desc: 'ボウルのふちを一周消す', charge: 28, power: 1.01, size: 1.6 }, '力持ちの兄貴分。面倒見がいい。'],
  ['c_student', 'まなぶちゃん', 'N', 100, { kind: 'timePlus', name: 'しゅくだいタイム', desc: '時間を2秒のばして5個消す', charge: 26, power: 1.8, amount: 5, dur: 2 }, '宿題はいつもギリギリに終わらせる。'],
  ['c_short', 'ぱっつん', 'N', 101, { kind: 'ring', name: 'まんまるリング', desc: 'まんなかをドーナツ形に消す', charge: 27, power: 2.0, size: 1.6 }, '前髪はミリ単位でととのえる派。'],
  ['c_kuro', 'くろかみ', 'N', 102, { kind: 'vline', name: 'くろいいなずま', desc: '縦一列をまとめて消す', charge: 26, power: 1.6, size: 1.7 }, '赤い目がチャームポイント。夜ふかしが得意。'],
  ['q_chicken', 'コケッコ', 'N', 100, { kind: 'random', name: 'コケコッコー', desc: 'ランダムに11個消す', charge: 24, power: 2.55, amount: 11 }, '朝いちばんに大声で起こしてくれる。'],
  ['q_pigeon', 'ポッポ', 'N', 101, { kind: 'paint', name: 'まめまきペイント', desc: '13個を多い色にぬりかえる', charge: 24, power: 2.0, amount: 13 }, 'いつも眠そうなハト。まめが好き。'],
  ['q_dog', 'ワンタ', 'N', 102, { kind: 'bombs', name: 'ほりほりボム', desc: 'ボムを1個おとす', charge: 24, power: 2.1, amount: 1 }, '穴をほるとなにか見つけてくる。'],
  ['q_cat', 'トラにゃん', 'N', 101, { kind: 'diag', name: 'ねこパンチ', desc: 'ななめ一列をまとめて消す', charge: 26, power: 3.0, size: 1.7 }, 'しましまがじまんのネコ。'],
  ['q_henry', 'ヘンリー', 'N', 100, { kind: 'hline', name: 'リュートの調べ', desc: '横一列をまとめて消す', charge: 26, power: 2.0, size: 1.7 }, '船でいちばんの音楽家。'],
  // R
  ['l_knight', '見習い騎士', 'R', 115, { kind: 'circle', name: 'たてのいちげき', desc: 'まんなかを大きく丸く消す', charge: 30, power: 6.0, amount: 1, size: 4.3 }, 'かぶとが大きくてちょっと前が見えない。'],
  ['l_barbarian', 'クマかぶり', 'R', 119, { kind: 'bombs', name: 'ダブルボム', desc: 'ボムを2個おとす', charge: 30, power: 5.38, amount: 2 }, 'クマの毛皮がお気に入りの戦士。'],
  ['skull', 'ドクロ', 'R', 121, { kind: 'random', name: 'カラカラわらい', desc: 'ランダムに14個消す', charge: 30, power: 2.73, amount: 14 }, 'カラカラ笑うおちゃめなドクロ。'],
  ['skel_minion', 'ホネっこ', 'R', 112, { kind: 'tapPop', name: 'ホネまわし', desc: '3秒間タップでまとめて消せる', charge: 40, power: 1.76, dur: 3 }, 'ホネだけど元気いっぱい。'],
  ['c_merchant', 'あきんど', 'R', 116, { kind: 'bombMaker', name: 'おまけボム', desc: '3個をボムに変える', charge: 30, power: 1.9, amount: 3 }, 'なんでも売ってる旅の商人。おまけつき。'],
  ['c_archer', 'ゆみつかい', 'R', 118, { kind: 'arrows', name: 'アローレイン', desc: '細い縦の列を3本消す', charge: 30, power: 2.6, amount: 3, size: 0.9 }, '森で育った弓の名手。'],
  ['c_pony', 'ポニテ', 'R', 117, { kind: 'shuriken', name: 'クナイなげ', desc: '3か所を小さく丸く消す', charge: 28, power: 3.2, amount: 3, size: 1.7 }, 'ポニーテールがトレードマークのしのび見習い。'],
  ['c_maskbob', 'マスクボブ', 'R', 116, { kind: 'paint', name: 'おそろいカラー', desc: '16個を多い色にぬりかえる', charge: 26, power: 1.8, amount: 16 }, '人見知りなのでマスクがてばなせない。'],
  ['b_chan', 'ブレンちゃん', 'R', 117, { kind: 'ring', name: 'ドーナツリング', desc: 'まんなかを大きなドーナツ形に消す', charge: 28, power: 3.3, size: 1.9 }, 'ドーナツとおさるさんが大好きな3Dの女の子。'],
  ['q_anne', 'アン', 'R', 117, { kind: 'cross', name: 'ダブルアックス', desc: '太い十字にまとめて消す', charge: 28, power: 2.6, size: 1.5 }, '力じまんの女海賊。'],
  ['q_yeti', 'イエティ', 'R', 118, { kind: 'circle', name: 'ゆきだまドーン', desc: 'まんなかを大きく丸く消す', charge: 30, power: 5.6, amount: 1, size: 4.1 }, '寒いのは平気、暑いのは苦手。'],
  ['q_goleling', 'ゴブバット', 'R', 116, { kind: 'random', name: 'ばさばさ乱れうち', desc: 'ランダムに14個消す', charge: 30, power: 2.73, amount: 14 }, '夜になると元気になる。'],
  ['q_orc', 'オークン', 'R', 119, { kind: 'bottom', name: 'どすこいスタンプ', desc: 'ボウルの底を広くまとめて消す', charge: 28, power: 2.5, size: 2.8 }, '見た目はこわいけど、やさしい力持ち。'],
  // SR
  ['knight', 'ナイト', 'SR', 190, { kind: 'colorBlast', name: 'いっせい攻撃', desc: 'いちばん多い色を全部消す', charge: 18, power: 11.0 }, '王国を守る正義の騎士。'],
  ['barbarian', 'バーバリアン', 'SR', 192, { kind: 'bottom', name: 'じならし', desc: 'ボウルの下半分をまとめて消す', charge: 22, power: 5.8, size: 4.4 }, 'クマの頭をかぶった豪快な戦士。'],
  ['rogue', 'ローグ', 'SR', 188, { kind: 'random', name: 'れんぞくアロー', desc: 'ランダムに32個消す', charge: 30, power: 4.53, amount: 32 }, '身軽な弓の名手。'],
  ['hood', 'フードローグ', 'SR', 186, { kind: 'tapPop', name: 'フードの手品', desc: '4.5秒間タップでまとめて消せる', charge: 32, power: 3.8, dur: 4.5 }, 'フードの奥で何を考えているのかな？'],
  ['c_ninja', 'くのいち', 'SR', 188, { kind: 'shuriken', name: 'しゅりけん乱舞', desc: '5か所を小さく丸く消す', charge: 24, power: 13.1, amount: 5, size: 1.8 }, '口数は少ないけど面倒見はいい。'],
  ['c_maskT', 'マスクぱっつん', 'SR', 190, { kind: 'circle', name: 'ダブルドーン', desc: '大きな丸を2回消す', charge: 26, power: 9.0, amount: 2, size: 3.0 }, 'ぱっつん前髪とマスクのしのび。'],
  ['b_chanG', 'ゴーグルブレン', 'SR', 189, { kind: 'cross', name: 'レンダリングビーム', desc: '太い十字にまとめて消す', charge: 24, power: 6.3, size: 1.7 }, 'ゴーグルをかけると本気モード。'],
  ['q_ninja', 'ドロン', 'SR', 189, { kind: 'random', name: 'かげぶんしん', desc: 'ランダムに28個消す', charge: 28, power: 3.7, amount: 28 }, '音もなくあらわれる、ねむそうな忍者。'],
  ['q_dragon', 'ドラコ', 'SR', 191, { kind: 'hline', name: 'ほのおのブレス', desc: '太い横一列を消す', charge: 24, power: 5.0, size: 2.4 }, '小さいけれど立派なドラゴン。'],
  // SSR
  ['skel_warrior', 'ホネ戦士', 'SSR', 250, { kind: 'twoColor', name: 'ダブルブレイク', desc: '多い2色を全部消す', charge: 20, power: 8.0 }, '角かぶとのスケルトン戦士。'],
  ['skel_rogue', 'ホネ盗賊', 'SSR', 245, { kind: 'feverTap', name: 'かげのうたげ', desc: 'フィーバー突入＋その間タップでまとめて消せる', charge: 60, power: 2.8 }, '赤いフードの神出鬼没なスケルトン。'],
  ['c_knight', 'ひめきし', 'SSR', 248, { kind: 'xBlast', name: 'クロスジャッジ', desc: '大きな×字に消して、フィーバーゲージ+15%', charge: 22, power: 7.82, size: 1.5 }, 'かぶとの下はひみつのお姫さま。'],
  ['q_captain', 'バルバロッサ船長', 'SSR', 249, { kind: 'twoColor', name: 'いっせい砲撃', desc: '多い2色を全部消す', charge: 21, power: 7.6 }, '七つの海をまたにかける大海賊。'],
  ['c_pumpkin', 'パンプキン', 'SSR', 250, { kind: 'megaBombs', name: 'ジャック・オ・ボム', desc: '大きなボムを3個おとす', charge: 22, power: 6.0, amount: 3 }, 'ハロウィンにだけあらわれる、かぼちゃ帽子の女の子。'],
];

const PASSIVES: Record<string, Passive> = {
  skel_warrior: { kind: 'guard', name: 'ホネのよろい', desc: 'ボスの妨害を3回まではじく\n7つ以上つなぐとダメージ1.3倍' },
  c_pumpkin: { kind: 'treat', name: 'ハロウィンのおかし', desc: 'もらえるコインが1.3倍' },
  c_knight: { kind: 'oath', name: 'きしのちかい', desc: 'フィーバーが2秒長い\nフィーバー中のダメージ1.2倍' },
  q_captain: { kind: 'treat', name: 'おたからの地図', desc: 'もらえるコインが1.3倍' },
  skel_rogue: { kind: 'shadow', name: 'かげのしのび', desc: 'ボスの妨害がすぐおわる（時間半分）\nコンボがきれにくい' },
};

/** New and limited characters: release dates and limited windows (JST dates, inclusive). */
const SCHEDULE: Record<string, { release?: string; limitedUntil?: string }> = {
  c_maskT: { release: '2026-10-29' },
  c_pumpkin: { release: '2026-10-22', limitedUntil: '2026-11-03' },
  b_chan: { release: '2026-10-23' },
  b_chanG: { release: '2026-11-05' },
  q_goleling: { release: '2026-10-30' },
  q_orc: { release: '2026-10-30' },
  q_ninja: { release: '2026-11-06' },
  q_dragon: { release: '2026-11-06' },
  q_captain: { release: '2026-11-13' },
};

export const CHARACTERS: CharDef[] = ROWS.map(([id, name, rarity, atk, skill, catchCopy]) => ({ id, name, rarity, atk, skill, catch: catchCopy, passive: PASSIVES[id], ...SCHEDULE[id] }));

/** Today's date in Japan as YYYY-MM-DD (release and limited windows use JST days). */
export function jstToday(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

export function isReleased(c: CharDef, now = Date.now()): boolean {
  return !c.release || jstToday(now) >= c.release;
}

/** Can be pulled from the gacha right now. */
export function inGacha(c: CharDef, now = Date.now()): boolean {
  return isReleased(c, now) && (!c.limitedUntil || jstToday(now) <= c.limitedUntil);
}

/** "11/3" for a YYYY-MM-DD date. */
export function shortDate(d: string): string {
  const [, m, day] = d.split('-').map(Number);
  return `${m}/${day}`;
}

/** Characters taken out of the roster (pointy hats don't fit a round piece); copies are refunded. */
export const RETIRED: Record<string, { name: string; refund: number }> = {
  l_mage: { name: 'とんがり帽', refund: 6000 },
  mage: { name: 'メイジ', refund: 20000 },
  skel_mage: { name: 'ホネ魔導士', refund: 60000 },
};

export const STARTER_ID = 'kh_a';

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c])) as Record<string, CharDef>;

export const RARITY_INFO: Record<Rarity, { color: number; stars: number; rate: number; label: string }> = {
  N: { color: 0x9aa7b8, stars: 1, rate: 0.55, label: 'N' },
  R: { color: 0x4fc3ff, stars: 2, rate: 0.3, label: 'R' },
  SR: { color: 0xffb020, stars: 3, rate: 0.12, label: 'SR' },
  SSR: { color: 0xff4fd8, stars: 4, rate: 0.03, label: 'SSR' },
};

/** Level cap by rarity; levels come from playing (EXP). */
export const MAX_LV: Record<Rarity, number> = { N: 50, R: 70, SR: 90, SSR: 100 };
export const MAX_SKILL_LV = 6;
/** Limit break: every duplicate from the gacha adds +1 (tiny bonus). */
export const MAX_PLUS = 99;

/** Growth state of an owned character. */
export interface Growth {
  lv: number;
  exp: number;
  skill: number;
  plus: number;
}

export function growthOf(owned?: Partial<Growth>): Growth {
  return { lv: owned?.lv ?? 1, exp: owned?.exp ?? 0, skill: owned?.skill ?? 1, plus: owned?.plus ?? 0 };
}

/** EXP from `lv` to `lv + 1`. A normal round gives ~100–150 EXP. */
export function expToNext(lv: number): number {
  // early levels take about one round each, later ones several
  return Math.round(110 + lv * 15 + lv * lv * 0.3);
}

/** EXP for a round: a base, the score, and a boss bonus. */
export function expForRound(score: number, defeated: boolean): number {
  return Math.round(30 + Math.min(score, 3_000_000) / 5000 + (defeated ? 20 : 0));
}

/** Adds EXP and returns how many levels were gained. */
export function addExp(c: CharDef, g: Growth, exp: number): number {
  const cap = MAX_LV[c.rarity];
  let ups = 0;
  g.exp += exp;
  while (g.lv < cap && g.exp >= expToNext(g.lv)) {
    g.exp -= expToNext(g.lv);
    g.lv++;
    ups++;
  }
  if (g.lv >= cap) g.exp = 0;
  return ups;
}

/** Skill tickets needed to go from skill level `sl` to `sl + 1` (same ticket for everyone, like Tsum Tsum). */
export function skillTicketCost(sl: number): number {
  return [0, 1, 2, 3, 5, 8][sl] ?? Infinity;
}

/** Attack including level (+1.5%/Lv) and limit break (+0.1%/+Lv). */
export function charAtk(c: CharDef, g: Growth): number {
  return Math.round(c.atk * (1 + (g.lv - 1) * 0.015) * (1 + g.plus * 0.001));
}

/**
 * Coin skill by rarity (Tsum Tsum-style "coin tsums"): coins per piece a special move clears,
 * plus a flat bonus per activation. This is what makes higher ranks earn far more.
 */
export const COIN_SKILL: Record<Rarity, { perPiece: number; flat: number }> = {
  N: { perPiece: 0, flat: 0 },
  R: { perPiece: 1.6, flat: 50 },
  SR: { perPiece: 7.2, flat: 240 },
  SSR: { perPiece: 11.2, flat: 480 },
};

/** Coins dropped by an n-chain: none below 4, then fast growth (4→1, 10→17, 30→195). */
export function chainCoins(n: number): number {
  if (n < 4) return 0;
  const k = n - 3;
  return Math.round(0.75 * k + 0.24 * k * k);
}

/** Skills are meant to be a highlight, not a spam button: every gauge is 2.4x the listed charge. */
export const CHARGE_SCALE = 2.4;

/** Pieces needed to charge the skill (each skill level shaves 5% off). */
export function charCharge(c: CharDef, g: Growth): number {
  return Math.round(c.skill.charge * CHARGE_SCALE * (1 - (g.skill - 1) * 0.05));
}

/** The skill at a skill level: stronger, bigger, longer. */
export function skillAt(c: CharDef, sl: number): Skill {
  const k = sl - 1;
  const s = c.skill;
  return {
    ...s,
    // gauges fill 20% faster than they used to, so each use hits a bit softer
    power: s.power * 0.8 * (1 + k * 0.1),
    amount: s.amount && (['bombs', 'megaBombs', 'circle', 'bombMaker', 'arrows', 'shuriken'].includes(s.kind) ? s.amount + Math.floor(k / 2) : Math.round(s.amount * (1 + k * 0.1))),
    size: s.size && s.size * (1 + k * 0.05),
    dur: s.dur && s.dur + k * 0.6,
  };
}
