import { Decimal } from '../core/decimal';
import type { Game } from '../core/game';
import { CHALLENGE_MAP, CHALLENGE_TIERS, type ChallengeDef } from '../data/challenges';
import { doPrestige, resetRun, snGain } from './prestige';

export function challengesUnlocked(g: Game): boolean {
  return g.s.stats.galaxyTotal > 0;
}

export function completions(g: Game, id: string): number {
  return g.s.challenges.completions[id] ?? 0;
}

export function challengeGoal(g: Game, c: ChallengeDef): Decimal {
  return Decimal.pow(10, c.goalLog(completions(g, c.id)));
}

export function enterChallenge(g: Game, id: string): boolean {
  const c = CHALLENGE_MAP.get(id);
  if (!c || !challengesUnlocked(g) || completions(g, id) >= CHALLENGE_TIERS) return false;
  g.s.challenges.active = id;
  resetRun(g);
  return true;
}

export function exitChallenge(g: Game): void {
  if (!g.s.challenges.active) return;
  g.s.challenges.active = null;
  resetRun(g);
}

export function checkChallenge(g: Game): void {
  const id = g.s.challenges.active;
  if (!id) return;
  const c = CHALLENGE_MAP.get(id);
  if (!c) {
    g.s.challenges.active = null;
    return;
  }
  if (g.s.run.earned.lt(challengeGoal(g, c))) return;
  const comp = completions(g, id) + 1;
  g.s.challenges.completions[id] = comp;
  g.s.stats.challengesDone++;
  g.events.emit({ type: 'challenge-done', id, comp });
  // 報酬を反映したうえで通常の超新星として周回を終える
  g.s.challenges.active = null;
  g.recalc();
  if (snGain(g).gte(1)) doPrestige(g, 'sn');
  else resetRun(g);
}
