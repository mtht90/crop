import { Save } from '../core/Save';
import { giveReward, type Reward } from './missions';

/** 7-day login calendar (loops). */
export const LOGIN_REWARDS: Reward[] = [
  { coins: 1000 },
  { coins: 2000 },
  { coins: 3000 },
  { tickets: 1 },
  { coins: 5000 },
  { coins: 8000 },
  { tickets: 2, coins: 10000 },
];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Claims today's login bonus once a day. Returns the day (1–7) and what was given, or null. */
export function claimLogin(now = new Date()): { day: number; got: string[] } | null {
  const l = Save.data.login;
  const today = dayKey(now);
  if (l.day === today) return null;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  // consecutive days advance the calendar; a missed day starts it over
  const day = l.day === dayKey(y) ? (l.streak % 7) + 1 : 1;
  Save.data.login = { day: today, streak: day };
  const got = giveReward(LOGIN_REWARDS[day - 1]);
  Save.write();
  return { day, got };
}
