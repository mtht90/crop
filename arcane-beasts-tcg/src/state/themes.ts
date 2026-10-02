// ============================================================================
// Theme packs and the daily line-up.
//
// Besides the three set series (第1弾〜第3弾), the shop sells daily packs that
// draw from every set; each favours one or two types. Two series are on sale at
// a time and the line-up changes every day at local midnight. Every third day
// one slot carries a set series instead.
// ============================================================================
import type { EType, SetCode } from '../engine/types';
import type { Booster } from './store';

export interface ThemeDef {
  id: string;
  /** the card on the pack; the pack is named after it */
  mascot: string;
  /** these types come out more often (cards of every set can appear) */
  types: EType[];
}

const TYPE_JP: Record<EType, string> = { fire: '炎', water: '水', grass: '草', lightning: '雷', psychic: '超', fighting: '闘', dark: '悪', colorless: '無色' } as Record<EType, string>;
const TYPE_HUE: Record<EType, [string, string]> = {
  fire: ['#ff6a3a', '#3a0a02'],
  water: ['#3fa8ff', '#04193a'],
  grass: ['#6fdc5a', '#0a2a0c'],
  lightning: ['#ffd84a', '#2e2602'],
  psychic: ['#d48aff', '#22093a'],
  fighting: ['#e3a36a', '#2e1406'],
  dark: ['#9a8cff', '#0e0a26'],
  colorless: ['#e8e4da', '#22201a'],
} as Record<EType, [string, string]>;

/** daily packs: every pack draws from all sets; only which types come out more often differs */
export const THEMES: ThemeDef[] = [
  { id: 't-infer', mascot: 'インフェルドレイク', types: ['fire'] },
  { id: 't-tauroch', mascot: 'タウロクプロテクター', types: ['fire', 'fighting'] },
  { id: 't-kraken', mascot: 'クラーケン', types: ['water'] },
  { id: 't-warlord', mascot: 'ナーガウォーロード', types: ['water', 'psychic'] },
  { id: 't-ant', mascot: 'クイーンアント', types: ['grass'] },
  { id: 't-elf', mascot: 'エルフハイロード', types: ['grass', 'lightning'] },
  { id: 't-hurricane', mascot: 'ハリケーンドレイク', types: ['lightning'] },
  { id: 't-blade', mascot: 'ブレードマスター', types: ['lightning', 'colorless'] },
  { id: 't-witch', mascot: 'アークウィッチ', types: ['psychic'] },
  { id: 't-gaunt', mascot: 'ナイトゴーント', types: ['psychic', 'dark'] },
  { id: 't-troll', mascot: 'トロルキング', types: ['fighting'] },
  { id: 't-dwarf', mascot: 'ドワーフロード', types: ['fighting', 'water'] },
  { id: 't-death', mascot: 'デスナイト', types: ['dark'] },
  { id: 't-vampire', mascot: 'ヴァンパイア', types: ['dark', 'fire'] },
  { id: 't-knight', mascot: 'グランドナイト', types: ['colorless'] },
  { id: 't-roc', mascot: 'ロック', types: ['colorless', 'grass'] },
];

export const THEME_BY_ID: Record<string, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export const typesLabel = (types: EType[]) => `${types.map((t) => TYPE_JP[t]).join('・')}タイプが出やすい`;

export function themeBooster(t: ThemeDef): Booster {
  const [hue, hue2] = TYPE_HUE[t.types[0]];
  return { id: t.id, name: `${t.mascot}パック`, set: 'AB1', theme: t.id, title: t.mascot, mascot: t.mascot, types: t.types, hue, hue2, share: t.types.length > 1 ? 0.6 : 0.45 };
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
    return { id: t.id, kind: 'theme', name: `${t.mascot}パック`, blurb: typesLabel(t.types), boosters: [themeBooster(t)] };
  };
  // theme slots used before this day: two a day, one on set days (every third day)
  const k = 2 * day - Math.ceil(day / 3);
  if (day % 3 === 0) return [setSeries[SET_CYCLE[Math.floor(day / 3) % SET_CYCLE.length]], themeAt(k)];
  const a = themeAt(k);
  let b = themeAt(k + 1);
  if (b.id === a.id) b = themeAt(k + 2);
  return [a, b];
}
