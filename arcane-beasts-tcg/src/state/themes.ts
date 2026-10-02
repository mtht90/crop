// ============================================================================
// Theme packs and the daily line-up.
//
// Besides the three set series (第1弾〜第3弾), the shop sells theme packs built
// from cards of every set — dragons, the undead, the sea, one per type… Only
// two series are on sale at a time; the line-up changes every day at local
// midnight. Every third day one slot carries a set series instead.
// ============================================================================
import type { CardDef, EType, MonsterCard, SetCode } from '../engine/types';
import type { Booster } from './store';

export interface ThemeDef {
  id: string;
  /** shown on the pack and the shop tab */
  title: string;
  /** one line for the shop */
  blurb: string;
  mascot: string;
  hue: string;
  hue2: string;
  test: (m: MonsterCard) => boolean;
  /** packs with only strong cards cost more */
  price?: number;
}

const art = (...prefixes: string[]) => (m: MonsterCard) => prefixes.some((p) => m.art.startsWith(p));
const named = (re: RegExp) => (m: MonsterCard) => re.test(m.name) || re.test(m.art);
const typed = (t: EType) => (m: MonsterCard) => m.type === t;
const any = (...fs: ((m: MonsterCard) => boolean)[]) => (m: MonsterCard) => fs.some((f) => f(m));

export const THEMES: ThemeDef[] = [
  { id: 't-dragon', title: '竜の巣', blurb: 'ドレイク、ワイバーン、古竜。翼ある者たちのパック。', mascot: 'ヴォルカリオン', hue: '#ff8a3a', hue2: '#3a1004', test: any(art('drakes/'), named(/dragon|wyvern|wyrm|ドラゴン|ドラグーン|ワイバーン|ワーム|ワイアーム/)) },
  { id: 't-undead', title: '冥府の門', blurb: '骸骨、亡霊、吸血の女王。死者たちのパック。', mascot: 'リッチロード', hue: '#a78bff', hue2: '#120a2c', test: any(art('undead/'), named(/ghost|wraith|vampire|nightgaunt|pyre-wight|ゾンビ|ドラウグ/)) },
  { id: 't-sea', title: '深き海', blurb: '人魚、ナーガ、海の怪物。潮騒のパック。', mascot: 'リヴァイアサーペント', hue: '#3fb8ff', hue2: '#04213f', test: any(art('merfolk/', 'nagas/'), named(/serpent|kraken|cuttlefish|caribe|nibbler|seahorse|crab|tentacle|naga|naiad|galleon|canoe/)) },
  { id: 't-elf', title: 'エルフの森', blurb: '森の弓手、樹の巨人。緑深きパック。', mascot: 'エルフハイロード', hue: '#7fe07a', hue2: '#0d2c12', test: any(art('elves/', 'woses/'), named(/wesmere|ancient-wose/)) },
  { id: 't-dwarf', title: '鉄と坑道', blurb: 'ドワーフの戦士と、からくり仕掛け。', mascot: 'ドワーフロード', hue: '#9cc4ff', hue2: '#0c1a33', test: any(art('dwarves/', 'transport/mechanical-raider'), named(/grenadier|golem/)) },
  { id: 't-horde', title: '蛮族の行進', blurb: 'オーク、ゴブリン、トロル、オーガ。力のパック。', mascot: 'オークソブリン', hue: '#e3934a', hue2: '#331405', test: any(art('orcs/', 'goblins/', 'trolls/'), named(/ogre|orcish/)) },
  { id: 't-knight', title: '騎士と魔導', blurb: '騎士、槍兵、魔法使い。人の技のパック。', mascot: 'グランドナイト', hue: '#ffd36b', hue2: '#2e2208', test: art('humans/') },
  { id: 't-sun', title: '砂陽の民', blurb: '灼熱の砂漠をゆく民と大牛タウロク。', mascot: 'タウロクプロテクター', hue: '#ffb05a', hue2: '#3a1c04', test: any(art('camp/q-', 'dunefolk/'), named(/tauroch/)) },
  { id: 't-beast', title: '獣の牙', blurb: '狼、熊、猪、山猫、馬。野の獣たちのパック。', mascot: 'グレートウルフ', hue: '#d9b07a', hue2: '#2a1a08', test: any(art('wolves/'), named(/bear|boar|piglet|cat|horse|stallion|stoat|rat|crocodile|jumpcat/)) },
  { id: 't-bug', title: '蟲の巣', blurb: '蟻、蜘蛛、蠍、甲虫。群れなす者のパック。', mascot: 'ヒアリクイーン', hue: '#c7e05a', hue2: '#1f2606', test: named(/ant-|spider|scorpion|scarab|dragonfly|scamperer|scuttler|mudcrawler/) },
  { id: 't-sky', title: '空の覇者', blurb: '隼、グリフォン、ロック鳥、蝙蝠。空のパック。', mascot: 'サンダーグリフォン', hue: '#8fd8ff', hue2: '#0a2236', test: named(/falcon|gryphon|roc|raven|herald|harbinger|bat|wyvern|dragonfly/) },
  { id: 't-mage', title: '魔導の塔', blurb: '魔法使い、魔女、術士。呪文を操る者たちのパック。', mascot: 'アークウィッチ', hue: '#b9a0ff', hue2: '#170c33', test: named(/mage|adept|shaman|druid|sorceress|enchantress|runemaster|rune|necromancer|lich|sorcerer|mystic|shynal|witch|sage/) },
  { id: 't-fire', title: '炎の章', blurb: '炎タイプだけを集めたパック。', mascot: 'インフェルドレイク', hue: '#ff6a3a', hue2: '#3a0a02', test: typed('fire') },
  { id: 't-water', title: '水の章', blurb: '水タイプだけを集めたパック。', mascot: 'クラーケン', hue: '#3fa8ff', hue2: '#04193a', test: typed('water') },
  { id: 't-grass', title: '草の章', blurb: '草タイプだけを集めたパック。', mascot: 'エンシェントウッド', hue: '#6fdc5a', hue2: '#0a2a0c', test: typed('grass') },
  { id: 't-lightning', title: '雷の章', blurb: '雷タイプだけを集めたパック。', mascot: 'サンダーグリフォン', hue: '#ffe25a', hue2: '#2e2602', test: typed('lightning') },
  { id: 't-psychic', title: '超の章', blurb: '超タイプだけを集めたパック。', mascot: 'アークウィッチ', hue: '#d48aff', hue2: '#22093a', test: typed('psychic') },
  { id: 't-fighting', title: '闘の章', blurb: '闘タイプだけを集めたパック。', mascot: 'トロルジェネラル', hue: '#e3a36a', hue2: '#2e1406', test: typed('fighting') },
  { id: 't-dark', title: '悪の章', blurb: '悪タイプだけを集めたパック。', mascot: 'ドラウグロード', hue: '#9a8cff', hue2: '#0e0a26', test: typed('dark') },
  { id: 't-colorless', title: '無色の章', blurb: '無色タイプだけを集めたパック。', mascot: 'グランドナイト', hue: '#e8e4da', hue2: '#22201a', test: typed('colorless') },
  { id: 't-crown', title: '覇者の系譜', blurb: 'EXとΩ、そして進化の頂点。強者だけのパック。', mascot: 'ドラグーン', hue: '#ffe08a', hue2: '#2a1d02', price: 150, test: (m) => !!m.ex || !!m.omega || m.stage === 'stage2' },
  { id: 't-night', title: '夜の眷属', blurb: '吸血鬼、悪夢、影。闇に棲む者のパック。', mascot: 'ヴァンパイア', hue: '#ff6f9a', hue2: '#2a0614', test: named(/vampire|nightmare|shadow|nightgaunt|bat|familiar|imp|dark-adept|necro|lich|dark-horse|stallion/) },
  { id: 't-small', title: 'ちびっこ大集合', blurb: 'たねモンスターだけのパック。デッキの土台づくりに。', mascot: 'コダマギ', hue: '#ffc6e0', hue2: '#2a0f1c', test: (m) => m.stage === 'basic' && !m.ex && !m.omega },
  { id: 't-giant', title: '巨躯の咆哮', blurb: 'HPの高い大物だけのパック。', mascot: 'トロルキング', hue: '#c9a27a', hue2: '#24160a', price: 150, test: (m) => m.hp >= 150 },
];

export const THEME_BY_ID: Record<string, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/** does a printing belong to a theme? (variants share the art and type of their base card) */
export function inTheme(theme: string, c: CardDef): boolean {
  const t = THEME_BY_ID[theme];
  return !!t && c.kind === 'monster' && t.test(c);
}

export function themeBooster(t: ThemeDef): Booster {
  return { id: t.id, name: `${t.title}パック`, set: 'AB1', theme: t.id, title: t.title, mascot: t.mascot, types: [], hue: t.hue, hue2: t.hue2, price: t.price };
}

// ---------------------------------------------------------------------------
// Daily line-up
// ---------------------------------------------------------------------------
export interface Series {
  id: string;
  kind: 'set' | 'theme';
  name: string;
  blurb: string;
  set?: SetCode;
  boosters: Booster[];
}

const DAY = 86_400_000;
/** local calendar day number (changes at local midnight) */
export function dayNumber(t = Date.now()): number {
  const d = new Date(t);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
}
/** ms until the next local midnight */
export function msToNextLineup(t = Date.now()): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - t;
}

/** a fixed shuffle so every theme comes round evenly */
function shuffled<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** the set series come round on every third day, newest set most often */
const SET_CYCLE: SetCode[] = ['AB3', 'AB1', 'AB3', 'AB2'];

export function lineupFor(day: number, setSeries: Record<SetCode, Series>): [Series, Series] {
  const T = THEMES.length;
  /** the k-th theme slot ever: each cycle of T slots shows every theme once, in a fresh order */
  const themeAt = (k: number): Series => {
    const t = THEME_BY_ID[shuffled(THEMES.map((x) => x.id), 7919 + Math.floor(k / T))[k % T]];
    return { id: t.id, kind: 'theme', name: t.title, blurb: t.blurb, boosters: [themeBooster(t)] };
  };
  // theme slots used before this day: two a day, one on set days (every third day)
  const k = 2 * day - Math.ceil(day / 3);
  if (day % 3 === 0) return [setSeries[SET_CYCLE[Math.floor(day / 3) % SET_CYCLE.length]], themeAt(k)];
  const a = themeAt(k);
  let b = themeAt(k + 1);
  if (b.id === a.id) b = themeAt(k + 2);
  return [a, b];
}
