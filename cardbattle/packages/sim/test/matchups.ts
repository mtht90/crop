/** カード同士の相性（じゃんけん）を、他に何もない状態で確かめる。npm run matchups */
import { BattleSimulation, TICK_RATE, UNIT, type CardStats } from '../src/index';
import { content } from './helpers';

const deck = (): CardStats[] => content.starterDeck.map((id) => content.cards.require(id));
const t = (x: number, y: number) => ({ x: x * UNIT, y: y * UNIT });

export interface MatchupResult {
  name: string;
  towerDamage: number;
  attackerAlive: number;
  defenderAlive: number;
}

/** player0 が attack を (x,y) に出し、delay 秒後に player1 が defend を出す。seconds 秒後の結果 */
export function matchup(name: string, attack: string, at: [number, number], defend: string, dAt: [number, number], delay: number, seconds = 30): MatchupResult {
  const sim = new BattleSimulation(content.rules, deck(), deck(), 1);
  sim.players[0].hand[0] = content.cards.require(attack);
  sim.players[1].hand[0] = content.cards.require(defend);
  sim.players[0].manaUnits = sim.players[1].manaUnits = 10 * content.rules.manaUnit;
  const towerHp0 = sim.getTower(1, 'left')!.hp + sim.getTower(1, 'right')!.hp + sim.getTower(1, 'king')!.hp;
  sim.tryAccept({ player: 0, cardId: attack, pos: t(...at), issueTick: 0 });
  for (let i = 0; i < seconds * TICK_RATE && !sim.isOver; i++) {
    if (i === Math.round(delay * TICK_RATE)) sim.tryAccept({ player: 1, cardId: defend, pos: t(...dAt), issueTick: sim.tick });
    sim.clearEvents();
    sim.step();
  }
  const towerHp1 = sim.getTower(1, 'left')!.hp + sim.getTower(1, 'right')!.hp + sim.getTower(1, 'king')!.hp;
  const alive = (o: number) => sim.entities.filter((e) => e.owner === o && e.kind !== 'tower' && e.hp > 0).length;
  return { name, towerDamage: towerHp0 - towerHp1, attackerAlive: alive(0), defenderAlive: alive(1) };
}

export const MATCHUPS = () => [
  matchup('巨兵 → 砲台で止める', 'rock_giant', [14.5, 14.5], 'guard_cannon', [9.5, 22.5], 5),
  matchup('巨兵（守りなし）', 'rock_giant', [14.5, 14.5], 'thunder_strike', [1, 31], 50),
  matchup('骨の軍団 → 雷撃', 'bone_legion', [14.5, 13.5], 'thunder_strike', [14.5, 17.5], 2.6),
  matchup('骨の軍団 → 翼竜', 'bone_legion', [14.5, 13.5], 'wyvern', [14.5, 22.5], 1),
  matchup('翼竜 → 弓兵', 'wyvern', [14.5, 13.5], 'archer_duo', [14.5, 23.5], 2),
  matchup('翼竜（守りなし）', 'wyvern', [14.5, 13.5], 'thunder_strike', [1, 31], 50),
  matchup('騎士 → 骨の軍団', 'iron_knight', [14.5, 13.5], 'bone_legion', [14.5, 21.5], 4),
  matchup('弓兵 → 騎士', 'archer_duo', [14.5, 13.5], 'iron_knight', [14.5, 21.5], 4),
];

if (process.argv[1]?.endsWith('matchups.ts')) for (const r of MATCHUPS()) console.log(r);
