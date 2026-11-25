/**
 * 遊んだ記録（コイン・持っているキャップ・リーグの途中経過・ベスト記録）。
 * この端末のブラウザに保存する。保存できない環境でも遊べる（その場限りになる）。
 */
import type { LeagueState } from './league';

export interface SaveData {
  v: 1;
  coins: number;
  /** 持っているキャップ（銘柄 id → 枚数） */
  caps: Record<string, number>;
  capSel: string;
  teamId: string;
  league: LeagueState | null;
  /** 優勝した回数（杯の id → 回数） */
  cupsWon: Record<string, number>;
  best: { target: number; derby: number };
  stats: { games: number; wins: number; hr: number; so: number };
}

const KEY = 'capball.save.v1';

function fresh(): SaveData {
  return {
    v: 1,
    coins: 300,
    caps: { kirari: 1, orange: 1 },
    capSel: 'kirari',
    teamId: 'cider',
    league: null,
    cupsWon: {},
    best: { target: 0, derby: 0 },
    stats: { games: 0, wins: 0, hr: 0, so: 0 },
  };
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      if (d && d.v === 1) return { ...fresh(), ...d, best: { ...fresh().best, ...d.best }, stats: { ...fresh().stats, ...d.stats } };
    }
  } catch {
    /* 読めない・壊れている → 新しく始める */
  }
  return fresh();
}

export const save: SaveData = load();

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* 保存できない環境 */
  }
}

export function addCoins(n: number) {
  save.coins = Math.max(0, Math.round(save.coins + n));
  persist();
}

export function ownsCap(id: string) {
  return (save.caps[id] ?? 0) > 0;
}

export function resetSave() {
  Object.assign(save, fresh());
  persist();
}
