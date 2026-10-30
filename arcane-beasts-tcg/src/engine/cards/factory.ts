// Card factories shared by every set
import type { Ability, Attack, EType, LegacyRarity, MonsterCard, Rarity, SetCode, Stage, TrainerCard, TrainerSub } from '../types';

// ★ says how rare a printing is: regular cards are ★1–★3, the special
// printings carry ★3 (full art), ★4 (special art) and ★5 (gold).
const STAR: Record<LegacyRarity, Rarity> = { C: 1, U: 2, R: 3, RR: 3 };

/** the old EX / Ω monsters are ordinary ★3 cards now: their stats come down to the top of the ★3 range */
const ACE_HP: Record<Stage, [number, number]> = { basic: [130, 170], stage1: [140, 180], stage2: [170, 210] };
const ACE_TOP: Record<Stage, number> = { basic: 130, stage1: 140, stage2: 160 };
const round10 = (n: number) => Math.round(n / 10) * 10;

const WEAK: Record<EType, EType | undefined> = {
  fire: 'water',
  water: 'lightning',
  grass: 'fire',
  lightning: 'fighting',
  psychic: 'dark',
  fighting: 'psychic',
  dark: 'grass',
  colorless: 'fighting',
};

type Opt = Partial<Pick<MonsterCard, 'evolvesFrom' | 'weakness' | 'resistance' | 'flavor' | 'scene'>> & {
  ability?: Ability;
  noWeak?: boolean;
  /** the old "Ω" mark in the card lists: now a regular ★3 (an ace) */
  omega?: boolean;
  /** the old "EX" mark: now a regular ★3 (an ace) */
  ex?: boolean;
};

/** an old EX / Ω monster brought down to ordinary ★3 strength */
function aceStats(stage: Stage, hp: number, attacks: Attack[]): { hp: number; attacks: Attack[] } {
  const [lo, hi] = ACE_HP[stage];
  const top = Math.max(1, ...attacks.map((a) => a.damage ?? 0));
  const k = Math.min(0.7, ACE_TOP[stage] / top);
  return {
    hp: Math.max(lo, Math.min(hi, round10(hp * 0.6))),
    attacks: attacks.map((a) => (a.damage ? { ...a, damage: Math.max(10, round10(a.damage * k)) } : a)),
  };
}

export function monsterFactory(set: SetCode) {
  let counter = 0;
  return function m(
  name: string,
  art: string,
  type: EType,
  stage: Stage,
  hp: number,
  retreat: number,
  legacy: LegacyRarity,
  species: string,
  attacks: Attack[],
  opt: Opt = {},
): MonsterCard {
  counter++;
  const no = counter;
  const ace = !!(opt.ex || opt.omega);
  const rarity: Rarity = ace ? 3 : STAR[legacy];
  if (ace) ({ hp, attacks } = aceStats(stage, hp, attacks));
  return {
    kind: 'monster',
    id: `${set}-${String(no).padStart(3, '0')}`,
    set,
    no,
    name,
    art,
    type,
    stage,
    hp,
    retreat,
    rarity,
    species,
    attacks,
    weakness: opt.noWeak ? undefined : opt.weakness ?? WEAK[type],
    resistance: opt.resistance,
    evolvesFrom: opt.evolvesFrom,
    ability: opt.ability,
    ace: ace || undefined,
    flavor: opt.flavor,
    scene: opt.scene,
  };
  };
}


export function trainerFactory(set: SetCode, start = 100) {
  let n = start;
  return function t(key: string, name: string, sub: TrainerSub, legacy: LegacyRarity, text: string, art: string, extra: Partial<TrainerCard> = {}): TrainerCard {
    n++;
    return { kind: 'trainer', key, id: `${set}-${n}`, no: n, set, name, sub, rarity: STAR[legacy], text, art, ...extra };
  };
}
