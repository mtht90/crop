// Card factories shared by every set
import type { Ability, Attack, EType, LegacyRarity, MonsterCard, Rarity, SetCode, Stage, TrainerCard, TrainerSub } from '../types';

const STAR: Record<LegacyRarity, Rarity> = { C: 1, U: 2, R: 3, RR: 4 };

/** the few ★5 monsters: the strongest of what used to be EX */
export const FIVE_STAR = new Set(['ドラグーン', 'クイーンアント', 'リッチロード', 'アークウィッチ', 'グランドナイト']);

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
  /** the old "Ω" mark in the card lists: becomes ★4 */
  omega?: boolean;
  /** the old "EX" mark: ★5 for the few in FIVE_STAR, ★4 for the rest */
  ex?: boolean;
};

/** the big attack of a ★4 / ★5 monster, nudged to fit its tier */
function adjustTop(attacks: Attack[], by: number): Attack[] {
  let top = -1;
  attacks.forEach((a, i) => {
    if ((a.damage ?? 0) > (attacks[top]?.damage ?? -1)) top = i;
  });
  return attacks.map((a, i) => (i === top && a.damage ? { ...a, damage: Math.max(10, a.damage + by) } : a));
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
  const rarity: Rarity = opt.ex ? (FIVE_STAR.has(name) ? 5 : 4) : opt.omega ? 4 : STAR[legacy];
  // ★5 carries 3 prizes: a little more HP and punch. Former EX that are now ★4 come down to the ★4 level.
  if (rarity === 5) {
    hp += 30;
    attacks = adjustTop(attacks, 20);
  } else if (opt.ex) {
    hp -= 30;
    attacks = adjustTop(attacks, -20);
  }
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
