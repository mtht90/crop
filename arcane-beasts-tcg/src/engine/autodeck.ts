// ============================================================================
// おすすめ編成: build a legal 60-card deck around an ace from the cards you own
//
//   1. the ace's whole evolution line (basic ×4, middle ×3, ace ×3)
//   2. one or two support lines of the same type (or colourless-cost cards)
//   3. staple trainers, in priority order, as far as they are owned
//   4. basic energy of the ace's type to 60
// Fancy printings (gold, full art, …) are used first when you own them.
// ============================================================================
import { ALL_CARDS, byName, MAIN_SET, RARITIES } from './cards';
import type { CardDef, EType, MonsterCard } from './types';

export type OwnedFn = (cid: string) => number;

const printingsByName = new Map<string, CardDef[]>();
for (const c of ALL_CARDS) {
  const list = printingsByName.get(c.name) ?? [];
  list.push(c);
  printingsByName.set(c.name, list);
}
// fanciest printing first
for (const list of printingsByName.values()) list.sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || (b.variant ? 1 : 0) - (a.variant ? 1 : 0));

const MONSTERS = MAIN_SET.filter((c): c is MonsterCard => c.kind === 'monster');

export const ownedOfName = (name: string, owned: OwnedFn) => (printingsByName.get(name) ?? []).reduce((n, c) => n + owned(c.id), 0);

/** strongest monsters you own, as ace candidates (Ω / EX / final evolutions first) */
export function aceCandidates(owned: OwnedFn): MonsterCard[] {
  const hasEvolution = new Set(MONSTERS.map((m) => m.evolvesFrom).filter(Boolean));
  return MONSTERS.filter((m) => ownedOfName(m.name, owned) > 0 && !hasEvolution.has(m.name) && (m.stage !== 'basic' || m.omega || m.ex || m.hp >= 110))
    .map((m) => ({ m, v: power(m) }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.m);
}

function power(m: MonsterCard) {
  const dmg = Math.max(0, ...m.attacks.map((a) => a.damage ?? 30));
  return dmg + m.hp * 0.35 + (m.ability ? 25 : 0) + (m.ex ? 45 : m.omega ? 30 : 0) + (m.stage === 'stage2' ? 15 : 0);
}

/** the evolution chain ending at `top` (basic first) */
function chainTo(top: MonsterCard): MonsterCard[] {
  const out: MonsterCard[] = [top];
  let cur = top;
  while (cur.evolvesFrom) {
    const prev = byName(cur.evolvesFrom) as MonsterCard;
    out.unshift(prev);
    cur = prev;
  }
  return out;
}

/** attack costs that the deck's energy can pay (its type or colourless only) */
const fitsType = (m: MonsterCard, t: EType) => m.attacks.every((a) => a.cost.every((c) => c === t || c === 'colorless'));

export interface AutoDeck {
  cards: string[];
  ace: string;
  type: EType;
  notes: string[];
}

export function buildDeck(aceName: string, owned: OwnedFn): AutoDeck {
  const ace = byName(aceName) as MonsterCard;
  const type = ace.type === 'colorless' ? (ace.attacks.flatMap((a) => a.cost).find((c) => c !== 'colorless') ?? 'fighting') : ace.type;
  const used = new Map<string, number>(); // cid → copies taken
  const byNameCount = new Map<string, number>();
  const cards: string[] = [];
  const notes: string[] = [];

  /** take up to n copies of a card name, respecting ownership and the 4-copy rule */
  const take = (name: string, n: number): number => {
    const def = byName(name);
    const basicEnergy = def.kind === 'energy' && def.basic;
    let got = 0;
    for (const p of printingsByName.get(name) ?? []) {
      while (got < n) {
        if (!basicEnergy && (byNameCount.get(name) ?? 0) >= 4) return got;
        const have = basicEnergy ? Infinity : owned(p.id) - (used.get(p.id) ?? 0);
        if (have <= 0) break;
        used.set(p.id, (used.get(p.id) ?? 0) + 1);
        byNameCount.set(name, (byNameCount.get(name) ?? 0) + 1);
        cards.push(p.id);
        got++;
      }
      if (got >= n) break;
    }
    return got;
  };
  const monsterCount = () => cards.filter((id) => ALL_CARDS.find((c) => c.id === id)!.kind === 'monster').length;

  // 1. the ace line
  const line = chainTo(ace);
  const want = line.length === 1 ? [3] : line.length === 2 ? [4, 3] : [4, 3, 3];
  line.forEach((m, i) => {
    const got = take(m.name, want[i]);
    if (got < want[i]) notes.push(`${m.name}は${got}枚しか持っていません`);
  });

  // 2. support lines: same type or colourless-cost, strongest first
  const inDeck = new Set(line.map((m) => m.name));
  const tops = MONSTERS.filter((m) => !inDeck.has(m.name) && fitsType(m, type) && (m.type === type || m.type === 'colorless'))
    .filter((m) => !MONSTERS.some((x) => x.evolvesFrom === m.name && ownedOfName(x.name, owned) > 0 && fitsType(x, type)))
    .map((m) => ({ m, chain: chainTo(m) }))
    .filter(({ chain }) => chain.every((c) => ownedOfName(c.name, owned) > 0 && fitsType(c, type)))
    .sort((a, b) => power(b.m) / b.chain.length - power(a.m) / a.chain.length);
  for (const { chain } of tops) {
    if (monsterCount() >= 17) break;
    const counts = chain.length === 1 ? [2] : chain.length === 2 ? [3, 2] : [3, 2, 2];
    chain.forEach((m, i) => {
      if (!inDeck.has(m.name)) take(m.name, counts[i]);
      inDeck.add(m.name);
    });
  }
  if (monsterCount() < 12) notes.push('モンスターが少なめです。パックで同じタイプを集めると強くなります');

  // 3. trainers (priority order)
  const hasStage2 = [...inDeck].some((n) => (byName(n) as MonsterCard).stage === 'stage2');
  const hasRule = [...inDeck].some((n) => {
    const m = byName(n) as MonsterCard;
    return m.omega || m.ex;
  });
  const STADIUM: Partial<Record<EType, string>> = { fire: '灼熱の火山帯', water: '嵐の海岸', grass: 'エルフの森', dark: '亡者の港', fighting: '英雄の古戦場', psychic: '瘴気の沼', lightning: '嵐の海岸' };
  const trainers: [string, number, boolean?][] = [
    ['大賢者の研究', 4],
    ['召喚の巻物', 4],
    ['魔獣の笛', 2],
    ['司令官の号令', 2],
    ['進化の秘薬', 2, hasStage2],
    ['騎士の突撃', 2],
    ['狩人の知恵', 2],
    ['転移の羽', 2],
    ['賢者の水晶', 1],
    ['エネルギー結晶', 2],
    ['覇者の紋章', 1, hasRule],
    [STADIUM[type] ?? '英雄の古戦場', 2],
    ['回復薬', 2],
    ['運命のコイン', 2],
    ['書庫の整理', 2],
    ['見習い魔導士', 2],
  ];
  const maxTrainers = 60 - cards.length - 15; // keep room for at least 15 energy
  let t = 0;
  for (const [name, n, cond] of trainers) {
    if (cond === false || t >= maxTrainers) continue;
    t += take(name, Math.min(n, maxTrainers - t));
  }

  // 4. energy
  const energyName = MAIN_SET.find((c) => c.kind === 'energy' && c.basic && c.energyType === type)!.name;
  take(energyName, 60 - cards.length);

  return { cards, ace: ace.name, type, notes };
}
