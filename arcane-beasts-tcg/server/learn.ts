// ============================================================================
// 対戦の手順 (to teach the CPU): finished games arrive from players' devices
// (CPU battles) and from the hub (online games). They are appended to a daily
// JSON-lines file, and also to the database table "learn_games" when one is set
// up (a free host's disk does not last):
//   create table if not exists public.learn_games (id bigint generated always as identity primary key, at timestamptz not null default now(), data jsonb not null);
//   alter table public.learn_games enable row level security;
// ============================================================================
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameRec } from '../src/engine/learn';

export class LearnStore {
  constructor(
    private readonly dir: string,
    private readonly db: { url: string; key: string } | null,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** a plausible game record (anything else is dropped) */
  static valid(g: unknown): g is GameRec {
    const r = g as GameRec;
    return !!r && r.v === 1 && typeof r.mode === 'string' && r.mode.length < 24 && typeof r.win === 'boolean' && Array.isArray(r.moves) && r.moves.length > 0 && r.moves.length <= 800;
  }

  async add(games: GameRec[]) {
    const ok = games.filter(LearnStore.valid);
    if (!ok.length) return 0;
    try {
      await mkdir(this.dir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      await appendFile(join(this.dir, `${day}.jsonl`), ok.map((g) => JSON.stringify(g)).join('\n') + '\n');
    } catch (e) {
      console.error('learn: file write failed', e instanceof Error ? e.message : e);
    }
    if (this.db) {
      const key = this.db.key;
      const auth: Record<string, string> = key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {};
      try {
        const res = await this.fetcher(`${this.db.url.replace(/\/+$/, '')}/rest/v1/learn_games`, {
          method: 'POST',
          headers: { apikey: key, ...auth, 'content-type': 'application/json', prefer: 'return=minimal' },
          body: JSON.stringify(ok.map((data) => ({ data }))),
        });
        if (!res.ok) console.error('learn: database write failed', res.status, (await res.text()).slice(0, 160));
      } catch (e) {
        console.error('learn: database unreachable', e instanceof Error ? e.message : e);
      }
    }
    return ok.length;
  }
}
