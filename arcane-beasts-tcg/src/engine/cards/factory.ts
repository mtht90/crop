// Card factories shared by every set
import type { Ability, Attack, EType, MonsterCard, Rarity, SetCode, Stage, TrainerCard, TrainerSub } from '../types';

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

type Opt = Partial<Pick<MonsterCard, 'evolvesFrom' | 'weakness' | 'resistance' | 'omega' | 'ex' | 'flavor' | 'scene'>> & {
  ability?: Ability;
  noWeak?: boolean;
};

export function monsterFactory(set: SetCode) {
  let counter = 0;
  return function m(
  name: string,
  art: string,
  type: EType,
  stage: Stage,
  hp: number,
  retreat: number,
  rarity: Rarity,
  species: string,
  attacks: Attack[],
  opt: Opt = {},
): MonsterCard {
  counter++;
  const no = counter;
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
    omega: opt.omega,
    flavor: opt.flavor,
    scene: opt.scene,
    ex: opt.ex,
  };
  };
}


export function trainerFactory(set: SetCode, start = 100) {
  let n = start;
  return function t(key: string, name: string, sub: TrainerSub, rarity: Rarity, text: string, art: string, extra: Partial<TrainerCard> = {}): TrainerCard {
    n++;
    return { kind: 'trainer', key, id: `${set}-${n}`, no: n, set, name, sub, rarity, text, art, ...extra };
  };
}
