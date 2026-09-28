import type { Game } from '../core/game';
import { ACHIEVEMENTS } from '../data/achievements';

export function checkAchievements(g: Game): void {
  let any = false;
  for (const a of ACHIEVEMENTS) {
    if (g.achSet.has(a.id)) continue;
    if (!a.check(g)) continue;
    g.achSet.add(a.id);
    g.s.achievements.push(a.id);
    any = true;
    g.events.emit({ type: 'achievement', id: a.id });
  }
  if (any) g.markDirty();
}
