// セーブ：localStorage に自動保存。文字列で書き出し・読み込みもできる。
// 形式にはバージョン番号を付け、古い形式は MIGRATIONS で順に新しい形式へ移す。
import { TIME } from '../config/economy';
import { advance, type TickSummary } from './engine';
import { SAVE_VERSION, type GameState } from './types';

const KEY = 'city-conglomerate-save';

/** 古いバージョン → 次のバージョンへの変換。例：MIGRATIONS[1] は v1 → v2 */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  // 1: (s) => ({ ...s, version: 2, newField: 0 }),
};

export function migrate(raw: Record<string, unknown>): GameState {
  let s = raw;
  let v = Number(s.version ?? 1);
  if (v > SAVE_VERSION) throw new Error('新しいバージョンのセーブデータです');
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`セーブデータ（v${v}）を変換できません`);
    s = m(s);
    v = Number(s.version);
  }
  return s as unknown as GameState;
}

export function saveLocal(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 容量不足やプライベートモードでは保存できない
  }
}

export function loadLocal(): GameState | null {
  try {
    const t = localStorage.getItem(KEY);
    if (!t) return null;
    return migrate(JSON.parse(t));
  } catch {
    return null;
  }
}

export function clearLocal() {
  try { localStorage.removeItem(KEY); } catch { /* 何もしない */ }
}

/** 書き出し用の文字列（JSON を base64 にしたもの） */
export function exportString(s: GameState): string {
  const json = JSON.stringify(s);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'CC1:' + btoa(bin);
}

export function importString(text: string): GameState {
  const t = text.trim();
  if (!t.startsWith('CC1:')) throw new Error('セーブデータの文字列ではありません');
  const bin = atob(t.slice(4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return migrate(JSON.parse(new TextDecoder().decode(bytes)));
}

/** 留守中の進行。上限は TIME.offlineCapHours */
export function catchUp(s: GameState, now: number): (TickSummary & { awayHours: number; cappedHours: number }) | null {
  const awayMs = now - s.realTime;
  if (awayMs < 5_000) {
    s.realTime = now;
    return null;
  }
  const awayHours = awayMs / 3_600_000;
  const capped = Math.min(awayHours, TIME.offlineCapHours);
  const dtDays = (capped * 3600) / TIME.realSecondsPerDay;
  const summary = advance(s, dtDays, { offline: true });
  s.realTime = now;
  return { ...summary, awayHours, cappedHours: capped };
}
