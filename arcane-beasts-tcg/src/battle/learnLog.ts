// Records the player's own moves in CPU battles (online games are recorded by
// the server) and sends finished games to the server, where they are kept to
// teach the CPU. Off when the player turns it off in the settings.
import type { Game } from '../engine/game';
import { moveRecord, type GameRec, type MoveRec } from '../engine/learn';
import type { Action } from '../engine/types';
import { onlineSupported, serverUrl } from '../online/client';
import { useStore } from '../state/store';

const KEY = 'arcane-beasts-learn';
/** games waiting to be sent (oldest dropped past this) */
const KEEP = 20;

let mode = '';
let moves: MoveRec[] = [];

const enabled = () => useStore.getState().save.settings.shareMoves !== false;

export function beginLog(m: string) {
  mode = m;
  moves = [];
}

export function logMove(g: Game, action: Action) {
  if (!mode || !enabled()) return;
  try {
    moves.push(moveRecord(g.s, 0, action, g.legalActions(0).length));
  } catch {
    /* never get in the way of the game */
  }
}

export function endLog(win: boolean) {
  if (!mode || !moves.length || !enabled()) return void (mode = '');
  const rec: GameRec = { v: 1, mode, win, moves };
  mode = '';
  moves = [];
  try {
    const q = JSON.parse(localStorage.getItem(KEY) ?? '[]') as GameRec[];
    q.push(rec);
    localStorage.setItem(KEY, JSON.stringify(q.slice(-KEEP)));
  } catch {
    /* storage full or blocked: skip */
  }
  void flushLog();
}

/** send what is waiting (quietly; kept for next time if the server can't be reached) */
export async function flushLog() {
  if (!onlineSupported()) return;
  let q: GameRec[];
  try {
    q = JSON.parse(localStorage.getItem(KEY) ?? '[]') as GameRec[];
  } catch {
    return;
  }
  if (!q.length) return;
  try {
    const base = serverUrl().replace(/^ws/, 'http').replace(/\/ws$/, '');
    const res = await fetch(`${base}/api/learn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q), cache: 'no-store' });
    if (res.ok) localStorage.removeItem(KEY);
  } catch {
    /* try again after the next game */
  }
}
