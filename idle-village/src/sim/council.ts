// 長老会議:季節ごとに村の方針を決める(ルール版)。AIが使えるときはAIの判断で上書きされる。
import { BUILDINGS, BUILDING_ORDER, SEASONS, STAGE_NAMES, TRAITS } from './config';
import type { BuildingKind, CouncilLine, Policy, Villager } from './types';
import type { Sim } from './sim';
import { pick } from './util';

export function ruleNextBuild(sim: Sim): BuildingKind | null {
  const s = sim.s;
  const pop = sim.population;
  const cap = sim.capacity;
  const sitesHouse = s.buildings.some((b) => !b.done && b.kind === 'house');
  if (pop >= cap - 1 && !sitesHouse && sim.canBuild('house')) return 'house';
  // 段階の条件を満たすための建物を優先
  for (const k of BUILDING_ORDER) {
    if (k === 'house') continue;
    if (!sim.canBuild(k)) continue;
    if (s.buildings.some((b) => b.kind === k)) {
      if (k !== 'tower') continue;
      if (sim.countBuildings('tower', false) >= Math.min(1 + s.stage, BUILDINGS.tower.limit)) continue;
    }
    return k;
  }
  if (sim.canBuild('house') && !sitesHouse && pop >= cap - 3) return 'house';
  return null;
}

export function elders(sim: Sim): Villager[] {
  return [...sim.s.villagers]
    .filter((v) => v.role !== 'child')
    .sort((a, b) => b.age - a.age)
    .slice(0, 3);
}

export function rulePolicy(sim: Sim): Policy {
  const s = sim.s;
  const pop = sim.population;
  const w = { wood: 1.2, meat: 1, gold: s.stage >= 1 ? 0.9 : 0, build: 1.5 };
  const next = ruleNextBuild(sim);
  const cost = next ? BUILDINGS[next].cost : {};
  if (s.res.meat < pop * 2) w.meat += 1;
  if (sim.season === 2) w.meat += 0.5; // 冬に備える
  if (next && (cost.wood ?? 0) > s.res.wood) w.wood += 0.8;
  if (next && (cost.gold ?? 0) > s.res.gold) w.gold += 0.8;
  if (s.res.wood > 80 && s.res.wood > ((cost.wood ?? 0) * 2)) w.wood *= 0.5;
  if (s.res.gold > 60 && s.res.gold > ((cost.gold ?? 0) * 2)) w.gold *= 0.5;
  if (s.res.meat > pop * 6) w.meat *= 0.6;
  const festival = s.stage >= 2 && (sim.season === 2 || Math.random() < 0.25) && s.res.meat > pop * 2;

  const el = elders(sim);
  const lines: CouncilLine[] = [];
  const season = SEASONS[sim.season];
  if (el[0]) {
    const opener = pick([
      `${season}になった。皆の者、村のことを話し合おう。`,
      `${season}じゃな。さて、これからどうするか。`,
      `この${season}も、皆で力を合わせよう。`,
    ]);
    lines.push({ speaker: el[0].name, text: opener });
  }
  const proposals: string[] = [];
  if (next) proposals.push(`次は${BUILDINGS[next].name}を建てよう`);
  if (w.meat > 1.6) proposals.push('食べ物が足りない。羊の世話を急ごう');
  if (w.wood > 1.6) proposals.push('木材がもっと要る');
  if (w.gold > 1.4) proposals.push('金を掘りに行こう');
  if (festival) proposals.push('祭りを開こう!');
  if (!proposals.length) proposals.push('今は暮らしを楽しもう');
  for (let i = 1; i < el.length && i - 1 < proposals.length; i++) {
    lines.push({ speaker: el[i].name, text: flavor(el[i], proposals[i - 1]) });
  }
  if (el.length === 1 && proposals[0]) lines.push({ speaker: el[0].name, text: proposals[0] });
  return { weights: w, nextBuild: next, festival, lines, source: 'rule' };
}

function flavor(v: Villager, text: string): string {
  switch (v.trait) {
    case 'cheer':
      return `${text}!きっと楽しくなるよ`;
    case 'shy':
      return `あの…${text}…と思います`;
    case 'pious':
      return `天の導きのままに。${text}`;
    case 'brave':
      return `${text}!迷っている暇はない`;
    case 'lazy':
      return `まあ…${text}かな。ほどほどにね`;
    case 'glutton':
      return `${text}。ついでにごちそうも!`;
    case 'dreamer':
      return `${text}。いつかこの島を王国に…`;
    default:
      return `${text}。`;
  }
}

/** AIに渡す村の要約 */
export function councilSummary(sim: Sim) {
  const s = sim.s;
  const counts: Record<string, number> = {};
  for (const b of s.buildings) if (b.done) counts[BUILDINGS[b.kind].name] = (counts[BUILDINGS[b.kind].name] ?? 0) + 1;
  const candidates = BUILDING_ORDER.filter((k) => sim.canBuild(k)).map((k) => ({
    id: k,
    name: BUILDINGS[k].name,
    cost: BUILDINGS[k].cost,
    desc: BUILDINGS[k].desc,
  }));
  return {
    island: s.islandName,
    time: sim.timeLabel,
    era: STAGE_NAMES[s.stage],
    population: sim.population,
    capacity: sim.capacity,
    resources: { 木: Math.floor(s.res.wood), 肉: Math.floor(s.res.meat), 金: Math.floor(s.res.gold) },
    buildings: counts,
    underConstruction: s.buildings.filter((b) => !b.done).map((b) => BUILDINGS[b.kind].name),
    candidates,
    elders: elders(sim).map((v) => ({ name: v.name, age: Math.floor(v.age), personality: TRAITS[v.trait] })),
    recent: s.chronicle.slice(-8).map((c) => c.text),
  };
}
