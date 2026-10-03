// ============================================================================
// Where player records live when the server's own disk cannot be trusted
// (free cloud hosts wipe it on every restart): a small hosted database.
// Supabase is supported through its REST interface, so no extra package is needed.
//
//   SUPABASE_URL          https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  the "service_role" secret (kept on the server only)
//
// One table does it (see docs/ONLINE.md):
//   create table if not exists public.players (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
//   alter table public.players enable row level security;
// ============================================================================
import type { PlayerRecord } from './players';

export interface PlayerBackend {
  /** every saved player */
  loadAll(): Promise<PlayerRecord[]>;
  /** insert or update these players */
  saveMany(players: PlayerRecord[]): Promise<void>;
}

type Fetch = typeof fetch;

export class SupabaseBackend implements PlayerBackend {
  private readonly base: string;
  constructor(
    url: string,
    private readonly key: string,
    private readonly fetcher: Fetch = fetch,
    table = 'players',
  ) {
    this.base = `${url.replace(/\/+$/, '')}/rest/v1/${table}`;
  }

  private headers(extra: Record<string, string> = {}) {
    // the older service_role key is a JWT and goes in both headers; the newer sb_secret_ keys only in apikey
    const auth: Record<string, string> = this.key.startsWith('eyJ') ? { authorization: `Bearer ${this.key}` } : {};
    return { apikey: this.key, ...auth, 'content-type': 'application/json', ...extra };
  }

  async loadAll(): Promise<PlayerRecord[]> {
    const out: PlayerRecord[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const res = await this.fetcher(`${this.base}?select=data&order=id`, { headers: this.headers({ range: `${from}-${from + page - 1}`, 'range-unit': 'items' }) });
      if (!res.ok) throw new Error(`database read failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      const rows = (await res.json()) as { data: PlayerRecord }[];
      for (const r of rows) if (r?.data?.id) out.push(r.data);
      if (rows.length < page) break;
    }
    return out;
  }

  async saveMany(players: PlayerRecord[]): Promise<void> {
    if (!players.length) return;
    // a few hundred at a time keeps every request small
    for (let i = 0; i < players.length; i += 200) {
      const chunk = players.slice(i, i + 200).map((p) => ({ id: p.id, data: p, updated_at: new Date().toISOString() }));
      const res = await this.fetcher(`${this.base}?on_conflict=id`, {
        method: 'POST',
        headers: this.headers({ prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(chunk),
      });
      if (!res.ok) throw new Error(`database write failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  }
}

/** the backend the environment asks for, or null (then the JSON file is used) */
export function backendFromEnv(env: NodeJS.ProcessEnv = process.env): PlayerBackend | null {
  const url = env.SUPABASE_URL?.trim();
  const key = (env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_KEY)?.trim();
  return url && key ? new SupabaseBackend(url, key) : null;
}
