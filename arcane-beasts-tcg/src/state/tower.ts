// ============================================================================
// 覇王の塔: 30 floors, one battle each, climbed from the bottom. It takes the
// event slot every other two weeks (the stage event has the other two weeks).
//   • the climb is kept through the period; a lost floor can be tried again
//   • each floor has a foe type and a rule; floors 10 / 20 / 30 are bosses
//   • floors 1–10 are about the stage event's strength, 11–20 bring the
//     strongest decks and a longer-thinking CPU, 21–30 a CPU that sees
//     everything (hidden cards included)
//   • every floor pays gems the first time; 10, 20, 30 pay more, and the top
//     gives the tower's own card (a different one every tower) and a title
// ============================================================================
import type { BattleMods, EType } from '../engine/types';
import { weekKey } from './progress';

export interface TowerDef {
  id: string;
  /** the tower's name under 覇王の塔 */
  sub: string;
  /** the painting behind the floors */
  bg: string;
  /** the type of the bosses */
  type: EType;
  bosses: [{ name: string; portrait: string }, { name: string; portrait: string }, { name: string; portrait: string }];
  /** the card of the top floor */
  card: string;
}

export const TOWERS: TowerDef[] = [
  {
    id: 'sky', sub: '天翔ける覇者', bg: 'story/tower-main', type: 'lightning', card: 'EVENT-tower-sky',
    bosses: [{ name: '雷鳴の番兵', portrait: 'drakes/hurricane' }, { name: '嵐の竜騎士', portrait: 'drakes/enforcer' }, { name: '天穹の女神アウラ', portrait: 'event/tower-goddess' }],
  },
  {
    id: 'lava', sub: '灼熱の覇者', bg: 'story/tower-main', type: 'fire', card: 'EVENT-tower-lava',
    bosses: [{ name: '溶岩の番人', portrait: 'drakes/burner' }, { name: '炎獄の将', portrait: 'drakes/flameheart' }, { name: '溶鉄の巨神ヴォルガ', portrait: 'event/tower-lavagolem' }],
  },
  {
    id: 'grave', sub: '冥府の覇者', bg: 'story/tower-main', type: 'dark', card: 'EVENT-tower-grave',
    bosses: [{ name: '骸骨の門番', portrait: 'undead/skeleton' }, { name: '死霊の大司祭', portrait: 'undead/lich' }, { name: '不死王モルディス', portrait: 'event/tower-elderlich' }],
  },
  {
    id: 'holy', sub: '聖光の覇者', bg: 'story/tower-main', type: 'psychic', card: 'EVENT-tower-holy',
    bosses: [{ name: '聖堂の守護者', portrait: 'humans/mage-white' }, { name: '光の大魔導', portrait: 'humans/mage-light+female' }, { name: '天上の審判者セラフィム', portrait: 'event/tower-claimant' }],
  },
];

export const TOWER_FLOORS = 30;
export const isBossFloor = (f: number) => f % 10 === 0;

/** the decks the foes bring: a usual one, and the strongest one of the type */
const DECKS: Record<EType, [string, string]> = {
  fire: ['fire', 'dragoon'],
  water: ['water', 'naga'],
  grass: ['grass', 'highelf'],
  lightning: ['lightning', 'thunder-peak'],
  psychic: ['psychic', 'elder'],
  fighting: ['fighting', 'horde'],
  dark: ['dark', 'lich'],
  colorless: ['fighting', 'troll'],
};
const FOE_PORTRAIT: Record<EType, string> = {
  fire: 'drakes/fighter', water: 'merfolk/hoplite', grass: 'elves/captain', lightning: 'drakes/hurricane',
  psychic: 'humans/mage-silver', fighting: 'dwarves/fighter', dark: 'undead/deathblade', colorless: 'humans/spearman',
};
const TYPES: EType[] = ['fire', 'water', 'grass', 'lightning', 'psychic', 'fighting', 'dark'];

export interface Floor {
  /** 1…30 */
  n: number;
  boss: boolean;
  type: EType;
  name: string;
  portrait: string;
  deck: string;
  /** the CPU's level (10: thinks longer, 11: also sees hidden cards) */
  cpu: number;
  /** how strong the printings in the foe's deck are (0…3) */
  tier: number;
  mods: BattleMods;
  /** first clear */
  gems: number;
  coins: number;
  tickets?: { premium?: number; sure3?: number };
  /** the top floor: the tower's card and the title */
  card?: string;
}

/** the rule of each floor (index 0 = floor 1); T is the floor's foe type */
function floorRule(n: number, T: EType): { mods: BattleMods; cpu: number; tier: number } {
  const R: [BattleMods, number, number][] = [
    // 1–10: about the stage event, ending near its 3-5
    [{ prizes: 4 }, 3, 0],
    [{ prizes: 4, firstAttack: true }, 4, 0],
    [{ prizes: 4, hp: [0, 20] }, 4, 0],
    [{ prizes: 5, dmg: [{ side: 'both', type: T, n: 20 }] }, 5, 1],
    [{ prizes: 5, hp: [0, 30] }, 5, 1],
    [{ prizes: 5, oppFirst: true }, 6, 1],
    [{ prizes: 6, dmg: [{ side: 1, n: 10 }] }, 7, 2],
    [{ prizes: 6, hp: [0, 30] }, 7, 2],
    [{ prizes: 6, hand: [6, 7] }, 8, 3],
    [{ prizes: 6, hp: [0, 50], dmg: [{ side: 1, n: 20 }] }, 9, 3],
    // 11–20: the strongest decks, a CPU that thinks longer
    [{ prizes: 6, hp: [0, 30] }, 9, 3],
    [{ prizes: 6, oppFirst: true, dmg: [{ side: 1, n: 10 }] }, 9, 3],
    [{ prizes: 6, hp: [0, 40] }, 10, 3],
    [{ prizes: 6, dmg: [{ side: 1, type: T, n: 30 }] }, 10, 3],
    [{ prizes: 6, hand: [6, 8] }, 10, 3],
    [{ prizes: 6, hp: [0, 50] }, 10, 3],
    [{ prizes: 6, oppFirst: true, hp: [0, 30] }, 10, 3],
    [{ prizes: 6, dmg: [{ side: 1, n: 20 }], hp: [0, 20] }, 10, 3],
    [{ prizes: 6, hp: [-20, 40] }, 10, 3],
    [{ prizes: 6, hp: [0, 60], dmg: [{ side: 1, n: 20 }], oppFirst: true }, 10, 3],
    // 21–30: the CPU sees everything
    [{ prizes: 6, hp: [0, 30] }, 11, 3],
    [{ prizes: 6, oppFirst: true, dmg: [{ side: 1, n: 10 }] }, 11, 3],
    [{ prizes: 6, hp: [0, 50] }, 11, 3],
    [{ prizes: 6, hand: [6, 8], dmg: [{ side: 1, n: 20 }] }, 11, 3],
    [{ prizes: 6, hp: [-20, 50] }, 11, 3],
    [{ prizes: 6, oppFirst: true, hp: [0, 50] }, 11, 3],
    [{ prizes: 6, dmg: [{ side: 1, n: 30 }], hp: [0, 30] }, 11, 3],
    [{ prizes: 6, hand: [5, 8], hp: [0, 40] }, 11, 3],
    [{ prizes: 6, hp: [-30, 60], dmg: [{ side: 1, n: 20 }] }, 11, 3],
    [{ prizes: 6, hp: [0, 80], dmg: [{ side: 1, n: 30 }], oppFirst: true }, 11, 3],
  ];
  const [mods, cpu, tier] = R[n - 1];
  return { mods, cpu, tier };
}

/** the foe types of a tower's floors: a fixed shuffle per tower, bosses of the tower's type */
function floorTypes(t: TowerDef): EType[] {
  let seed = [...t.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const out: EType[] = [];
  let last: EType | null = null;
  for (let n = 1; n <= TOWER_FLOORS; n++) {
    if (isBossFloor(n)) {
      out.push(t.type);
      last = t.type;
      continue;
    }
    let ty: EType;
    do ty = TYPES[Math.floor(rand() * TYPES.length)];
    while (ty === last);
    out.push(ty);
    last = ty;
  }
  return out;
}

export function floorsOf(t: TowerDef): Floor[] {
  const types = floorTypes(t);
  return types.map((type, i) => {
    const n = i + 1;
    const r = floorRule(n, type);
    const boss = isBossFloor(n);
    const b = boss ? t.bosses[n / 10 - 1] : null;
    return {
      n,
      boss,
      type,
      name: b ? b.name : `${n}階の守り手`,
      portrait: b ? b.portrait : FOE_PORTRAIT[type],
      deck: DECKS[type][n > 10 || boss ? 1 : 0],
      cpu: r.cpu,
      tier: r.tier,
      mods: r.mods,
      gems: 200 + (n - 1) * 20 + (n === 30 ? 5000 : 0),
      coins: n % 5 === 0 ? 2000 : 0,
      tickets: n === 10 ? { premium: 1 } : n === 20 ? { sure3: 3 } : undefined,
      card: n === 30 ? t.card : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// The calendar: the event slot changes every two weeks; even periods hold the
// stage event, odd ones the tower
// ---------------------------------------------------------------------------
const WEEK = 7 * 86400000;
function periodOf(now: Date) {
  const w = Math.floor(new Date(weekKey(now).slice(1) + 'T00:00:00').getTime() / WEEK);
  return { period: Math.floor((w - 1) / 2), w };
}
/** the tower runs all the time now (in the boss raid's place); each tower stays two weeks */
export const towerOn = () => true;

/** the tower of this period (or the next one, while the stage event runs) */
export function currentTower(now = new Date()): { t: TowerDef; key: string; ends: Date; open: boolean } {
  const { period, w } = periodOf(now);
  const p = period;
  const t = TOWERS[(((p - 1482) % TOWERS.length) + TOWERS.length) % TOWERS.length];
  const monday = new Date(weekKey(now).slice(1) + 'T00:00:00');
  const ends = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (w - (period * 2 + 1)) * 7 + 14);
  return { t, key: `tower:${t.id}:${p}`, ends, open: towerOn() };
}

export interface TowerSave {
  key: string;
  /** the highest floor cleared (0 = none) */
  cleared: number;
}
export function towerNow(sv: TowerSave | undefined, now = new Date()): TowerSave {
  const { key } = currentTower(now);
  return sv && sv.key === key ? sv : { key, cleared: 0 };
}

/** the title the top floor gives */
export const TOWER_TITLE = 'title-tower';
