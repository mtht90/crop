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

export type Ears = 'none' | 'sprout' | 'cat' | 'bunny' | 'bear' | 'horns' | 'crest' | 'flame' | 'antenna' | 'halo' | 'crown' | 'dragon';
export type BodyShape = 'round' | 'mochi' | 'drop' | 'tall';
export type EyeStyle = 'dot' | 'big' | 'visor' | 'sharp';
export type Mouth = 'smile' | 'cat' | 'beak' | 'fang';

export interface CharDesign {
  body: BodyShape;
  ears: Ears;
  eyes: EyeStyle;
  mouth: Mouth;
  blush?: boolean;
  wings?: boolean;
  /** Optional accent color for accessories (horns, crown, beak...). */
  accent?: string;
}

export interface CharDef {
  id: string;
  name: string;
  rarity: Rarity;
  atk: number;
  skill: { kind: SkillKind; name: string; desc: string; charge: number; power: number; amount?: number };
  design: CharDesign;
  /**
   * Optional custom art. Put PNGs (square, transparent, character centered) at
   * public/assets/characters/<id>/<color>.png where color is red|blue|green|yellow|purple
   * and set `customArt: true` to replace the procedural pieces.
   */
  customArt?: boolean;
  catch: string;
}

export const CHARACTERS: CharDef[] = [
  {
    id: 'punimaru', name: 'ぷにまる', rarity: 'N', atk: 100,
    skill: { kind: 'bombs', name: 'ぷにボム', desc: 'ボムを1個つくる', charge: 26, power: 2, amount: 1 },
    design: { body: 'round', ears: 'sprout', eyes: 'dot', mouth: 'smile', blush: true },
    catch: 'どこにでもいる、ふつうのぷに。でも元気はいちばん！',
  },
  {
    id: 'nyanpu', name: 'にゃんぷ', rarity: 'N', atk: 104,
    skill: { kind: 'hline', name: 'ねこパンチ', desc: '横一列をまとめて消す', charge: 28, power: 3 },
    design: { body: 'mochi', ears: 'cat', eyes: 'dot', mouth: 'cat', blush: true },
    catch: 'きまぐれな、ねこ型ぷに。おひるねが大好き。',
  },
  {
    id: 'usapuni', name: 'うさぷに', rarity: 'N', atk: 98,
    skill: { kind: 'random', name: 'ぴょんぴょん', desc: 'ランダムに8個消す', charge: 25, power: 3, amount: 8 },
    design: { body: 'round', ears: 'bunny', eyes: 'big', mouth: 'smile', blush: true },
    catch: 'ぴょこぴょこ跳ねまわる、いたずらうさぎ。',
  },
  {
    id: 'kumappu', name: 'くまっぷ', rarity: 'R', atk: 126,
    skill: { kind: 'circle', name: 'くまハグ', desc: '中央の円の範囲を消す', charge: 30, power: 3.5 },
    design: { body: 'mochi', ears: 'bear', eyes: 'dot', mouth: 'smile', blush: true },
    catch: 'ちからもちのくまぷに。ハグは強め。',
  },
  {
    id: 'tsunoppu', name: 'つのっぷ', rarity: 'R', atk: 132,
    skill: { kind: 'bombs', name: 'あくまのボム', desc: 'ボムを2個つくる', charge: 32, power: 3, amount: 2 },
    design: { body: 'round', ears: 'horns', eyes: 'sharp', mouth: 'fang', accent: '#3a2a4a' },
    catch: 'こあくまなぷに。ほんとうは さみしがりや。',
  },
  {
    id: 'hiyoppu', name: 'ひよっぷ', rarity: 'R', atk: 122,
    skill: { kind: 'paint', name: 'ぬりぬり', desc: '10個を多い色にぬりかえる', charge: 28, power: 1.5, amount: 10 },
    design: { body: 'round', ears: 'crest', eyes: 'big', mouth: 'beak', accent: '#ff9f1c' },
    catch: 'ぴよぴよ鳴く、とりぷに。ぬりえが得意。',
  },
  {
    id: 'shizukun', name: 'しずくん', rarity: 'R', atk: 128,
    skill: { kind: 'vline', name: 'しずくスプラッシュ', desc: '縦一列をまとめて消す', charge: 30, power: 3.5 },
    design: { body: 'drop', ears: 'none', eyes: 'big', mouth: 'smile', blush: true },
    catch: 'あめの日にうまれた、しずくのぷに。',
  },
  {
    id: 'honoon', name: 'ほのおん', rarity: 'SR', atk: 158,
    skill: { kind: 'colorBlast', name: 'バーニングフレア', desc: 'いちばん多い色を全部消す', charge: 34, power: 4 },
    design: { body: 'round', ears: 'flame', eyes: 'sharp', mouth: 'fang', accent: '#ff7a1a' },
    catch: 'あつい魂をもつ、ほのおのぷに。',
  },
  {
    id: 'robopuni', name: 'ロボぷに', rarity: 'SR', atk: 152,
    skill: { kind: 'bigMaker', name: 'ビッグメーカー', desc: '6個をデカぷにに変える', charge: 32, power: 2, amount: 6 },
    design: { body: 'tall', ears: 'antenna', eyes: 'visor', mouth: 'smile', accent: '#c9d3e0' },
    catch: 'みらいから来た、メカぷに。ピピピ。',
  },
  {
    id: 'tenshipuni', name: 'てんしぷに', rarity: 'SR', atk: 150,
    skill: { kind: 'fever', name: 'エンジェルフィーバー', desc: 'すぐにフィーバー突入！', charge: 36, power: 2 },
    design: { body: 'round', ears: 'halo', eyes: 'big', mouth: 'smile', blush: true, wings: true, accent: '#ffe066' },
    catch: 'そらからまいおりた、しあわせのぷに。',
  },
  {
    id: 'dorapuni', name: 'ドラぷに', rarity: 'SSR', atk: 192,
    skill: { kind: 'twoColor', name: 'ドラゴンブレス', desc: '多い2色を全部消す', charge: 40, power: 5 },
    design: { body: 'round', ears: 'dragon', eyes: 'sharp', mouth: 'fang', wings: true, accent: '#ffd23f' },
    catch: 'でんせつの竜のちをひく、さいきょうのぷに。',
  },
  {
    id: 'punyking', name: 'ぷにキング', rarity: 'SSR', atk: 186,
    skill: { kind: 'allClear', name: 'キングダムクラッシュ', desc: '盤面のぷにを全部消す', charge: 44, power: 6 },
    design: { body: 'mochi', ears: 'crown', eyes: 'big', mouth: 'smile', blush: true, accent: '#ffcc33' },
    catch: 'ぷにの国の王さま。ひげが じまん。',
  },
];

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
