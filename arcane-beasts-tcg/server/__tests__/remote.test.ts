import { describe, expect, test, vi } from 'vitest';
import { PlayerStore, type PlayerRecord } from '../players';
import { backendFromEnv, SupabaseBackend } from '../remote';

/** a tiny stand-in for the Supabase REST interface */
function fakeDb() {
  const rows = new Map<string, PlayerRecord>();
  const calls: { method: string; url: string; n?: number }[] = [];
  let fail = 0;
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (fail > 0) {
      fail--;
      return new Response('boom', { status: 500 });
    }
    if (method === 'POST') {
      const body = JSON.parse(String(init.body)) as { id: string; data: PlayerRecord }[];
      calls.push({ method, url, n: body.length });
      for (const r of body) rows.set(r.id, r.data);
      return new Response(null, { status: 201 });
    }
    calls.push({ method, url });
    const range = String((init.headers as Record<string, string>).range ?? '0-999').split('-').map(Number);
    const all = [...rows.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    return new Response(JSON.stringify(all.slice(range[0], range[1] + 1).map((data) => ({ data }))), { status: 200 });
  }) as unknown as typeof fetch;
  return { rows, calls, fetcher, failNext: (n: number) => (fail = n) };
}

describe('hosted player database', () => {
  test('players are saved to the database and come back after a restart', async () => {
    const db = fakeDb();
    const a = new PlayerStore(null, Date.now, new SupabaseBackend('https://x.supabase.co/', 'key', db.fetcher));
    await a.init();
    const { player } = a.create('アリス');
    a.recordRanked(player, true);
    await a.close();
    expect(db.rows.get(player.id)?.name).toBe('アリス');
    expect(db.rows.get(player.id)?.games).toBe(1);

    const b = new PlayerStore(null, Date.now, new SupabaseBackend('https://x.supabase.co', 'key', db.fetcher));
    await b.init();
    expect(b.size).toBe(1);
    expect(b.get(player.id)?.rank.pts).toBe(player.rank.pts);
  });

  test('reads every page, and writes in small batches', async () => {
    const db = fakeDb();
    const be = new SupabaseBackend('https://x.supabase.co', 'key', db.fetcher);
    const store = new PlayerStore(null, Date.now, be);
    for (let i = 0; i < 450; i++) store.create(`p${i}`);
    await store.close();
    expect(db.rows.size).toBe(450);
    expect(db.calls.filter((c) => c.method === 'POST').map((c) => c.n)).toEqual([200, 200, 50]);
    const again = await new SupabaseBackend('https://x.supabase.co', 'key', db.fetcher).loadAll();
    expect(again.length).toBe(450);
  });

  test('only the players that changed are written again', async () => {
    const db = fakeDb();
    const store = new PlayerStore(null, Date.now, new SupabaseBackend('https://x.supabase.co', 'key', db.fetcher));
    const p1 = store.create('A').player;
    store.create('B');
    await store.close();
    db.calls.length = 0;
    store.recordCasual(p1, true);
    await store.close();
    expect(db.calls.filter((c) => c.method === 'POST').map((c) => c.n)).toEqual([1]);
  });

  test('a failed write is kept and tried again', async () => {
    vi.useFakeTimers();
    try {
      const db = fakeDb();
      const store = new PlayerStore(null, Date.now, new SupabaseBackend('https://x.supabase.co', 'key', db.fetcher));
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      store.create('A');
      db.failNext(1);
      store.flush();
      await vi.advanceTimersByTimeAsync(1);
      expect(db.rows.size).toBe(0);
      await vi.advanceTimersByTimeAsync(16_000);
      expect(db.rows.size).toBe(1);
      err.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  test('the database is only used when both settings are present', () => {
    expect(backendFromEnv({})).toBeNull();
    expect(backendFromEnv({ SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(backendFromEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' })).not.toBeNull();
  });
});
