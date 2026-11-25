/**
 * 実際の Postgres を使った結合テスト。TEST_DATABASE_URL が無ければスキップする。
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/scratchmap_test npm test
 * 注意: 指定した DB の public スキーマを毎回作り直す。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { latLngToCell } from 'h3-js';
import path from 'node:path';
import { createPool, migrate, type Pool } from '../server/src/db';
import { Store } from '../server/src/store';
import { createApp } from '../server/src/app';
import { loadConfig } from '../server/src/config';
import { Bus, TicketBook, type RealtimeEvent } from '../server/src/realtime';

const url = process.env.TEST_DATABASE_URL;
const LAT = 35.681236;
const LNG = 139.767125;
const east = (m: number) => LNG + m / (111_320 * Math.cos((LAT * Math.PI) / 180));
const cellAt = (m: number) => latLngToCell(LAT, east(m), 10);

describe.skipIf(!url)('Postgres 結合テスト', () => {
  let pool: Pool;
  let store: Store;
  let app: ReturnType<typeof createApp>;
  const events: RealtimeEvent[] = [];
  const bus = new Bus();

  beforeAll(async () => {
    pool = createPool(url!);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool, path.resolve(__dirname, '../server/src/migrations'));
    store = new Store(pool);
    app = createApp({ cfg: loadConfig({ NODE_ENV: 'test' }), store, bus, tickets: new TicketBook(), mailer: { sendMagicLink: async () => {} } });
  });
  afterAll(async () => {
    await pool?.end();
  });

  const call = async (method: string, p: string, session?: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  let alice: { session: string; id: string };
  let bob: { session: string; id: string };
  let groupId: string;
  let invite: string;

  it('マジックリンクでログインするとマイマップ付きのユーザーができる', async () => {
    const req = await call('POST', '/api/auth/magic/request', undefined, { email: 'alice@example.com' });
    expect(req.status).toBe(200);
    const token = new URL(req.json.devLink).searchParams.get('token')!;
    const v = await call('POST', '/api/auth/magic/verify', undefined, { token });
    expect(v.status).toBe(200);
    alice = { session: v.json.session, id: v.json.user.id };
    // 同じリンクは2回使えない
    expect((await call('POST', '/api/auth/magic/verify', undefined, { token })).status).toBe(401);
    const me = await call('GET', '/api/me', alice.session);
    expect(me.json.groups).toHaveLength(1);
    expect(me.json.groups[0].isPersonal).toBe(true);

    const r2 = await call('POST', '/api/auth/magic/request', undefined, { email: 'bob@example.com' });
    const v2 = await call('POST', '/api/auth/magic/verify', undefined, { token: new URL(r2.json.devLink).searchParams.get('token') });
    bob = { session: v2.json.session, id: v2.json.user.id };
  });

  it('グループを作って招待リンクで参加できる（ログイン前でも閲覧可）', async () => {
    const g = await call('POST', '/api/groups', alice.session, { name: '週末さんぽ部' });
    groupId = g.json.group.id;
    const inv = await call('POST', `/api/groups/${groupId}/invites`, alice.session);
    invite = inv.json.token;
    expect(inv.json.url).toContain(`/invite/${invite}`);

    // 未ログインでも招待トークンがあれば閲覧できる
    const pub = await call('GET', `/api/invites/${invite}`);
    expect(pub.json.group.name).toBe('週末さんぽ部');
    expect((await call('GET', `/api/groups/${groupId}/cells`)).status).toBe(403);
    expect((await call('GET', `/api/groups/${groupId}/cells`, undefined, undefined, { 'X-Invite-Token': invite })).status).toBe(200);

    const j = await call('POST', `/api/invites/${invite}/join`, bob.session, { bringHistory: false });
    expect(j.json.joined).toBe(true);
    const members = await call('GET', `/api/groups/${groupId}`, bob.session);
    expect(members.json.members).toHaveLength(2);
    const colors = members.json.members.map((m: any) => m.color);
    expect(new Set(colors).size).toBe(2);
  });

  it('散歩でアップロードしたセルは所属する全グループに反映され、配信される', async () => {
    const unsub = bus.subscribe(groupId, (e) => events.push(e));
    const t = Date.now() - 60_000;
    const r = await call('POST', '/api/cells', alice.session, { hits: [{ h3: cellAt(0), t }, { h3: cellAt(120), t: t + 1000 }, { h3: 'bad', t }] });
    expect(r.json.accepted).toBe(2);
    expect(r.json.rejected).toBe(1);
    expect(r.json.groups).toHaveLength(2);
    expect(events.some((e) => e.type === 'cells' && e.newCells.length === 2)).toBe(true);
    unsub();

    const cells = await call('GET', `/api/groups/${groupId}/cells`, bob.session);
    expect(cells.json.cells.map((c: any) => c[0]).sort()).toEqual([cellAt(0), cellAt(120)].sort());
    expect(cells.json.cells[0][1]).toBe(alice.id); // first_user
    expect(cells.json.mine).toEqual([]); // bob はまだ塗っていない
  });

  it('外部アプリ（Overland）から受信したセルも全グループに反映。反映オフのグループには入らない', async () => {
    const tk = await call('POST', '/api/ingest-token', bob.session);
    expect(tk.json.overlandSetupLink).toMatch(/^overland:\/\/setup\?url=/);
    // bob のマイマップは反映、共同マップはオフにする
    await call('PATCH', `/api/groups/${groupId}/members/me`, bob.session, { shareEnabled: false });
    const now = Date.now();
    const loc = (m: number, dt: number) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [east(m), LAT] },
      properties: { timestamp: new Date(now - 120_000 + dt).toISOString(), horizontal_accuracy: 8, device_id: 'b' },
    });
    const res = await app.request(`/ingest/overland/${tk.json.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: [loc(1000, 0), loc(1400, 60_000)] }),
    });
    expect(await res.json()).toEqual({ result: 'ok' });
    const shared = await call('GET', `/api/groups/${groupId}/cells`, bob.session);
    expect(shared.json.cells).toHaveLength(2); // 変化なし
    const me = await call('GET', '/api/me', bob.session);
    const personal = me.json.groups.find((g: any) => g.isPersonal);
    expect(personal.cellCount).toBeGreaterThan(2);
    // 生座標を保存するテーブルが無いこと: ingest_state にはセルと時刻だけ
    const st = await pool.query('SELECT * FROM ingest_state');
    expect(Object.keys(st.rows[0]).sort()).toEqual(['device', 'last_at', 'last_h3', 'user_id']);

    // 反映をオンに戻して再送すると共同マップにも入る
    await call('PATCH', `/api/groups/${groupId}/members/me`, bob.session, { shareEnabled: true });
    await app.request(`/ingest/overland/${tk.json.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: [loc(120, 90_000)] }),
    });
    const after = await call('GET', `/api/groups/${groupId}/cells`, bob.session);
    const c120 = after.json.cells.find((c: any) => c[0] === cellAt(120));
    expect(c120[1]).toBe(alice.id); // 最初に塗ったのは alice のまま
    expect(c120[2]).toBe(bob.id); // 最後に通ったのは bob
    expect(after.json.mine).toContain(cellAt(120));
  });

  it('統計: 総セル数・メンバー別貢献・今週の新規', async () => {
    const s = await call('GET', `/api/groups/${groupId}/stats?since=${new Date(Date.now() - 86400_000).toISOString()}`, alice.session);
    expect(s.json.totalCells).toBeGreaterThanOrEqual(2);
    const a = s.json.members.find((m: any) => m.userId === alice.id);
    expect(a.pioneered).toBe(2);
    expect(s.json.newSince).toBe(s.json.totalCells);
  });

  it('自宅ゾーンを設定すると以後記録されず、既存の記録からも消せる', async () => {
    const z = await call('POST', '/api/home-zones', alice.session, { h3: cellAt(0), radiusM: 100, purge: true });
    expect(z.status).toBe(200);
    const cells = await call('GET', `/api/groups/${groupId}/cells`, alice.session);
    expect(cells.json.cells.map((c: any) => c[0])).not.toContain(cellAt(0));
    // cellAt(120) は bob も通っているので残る（first_user は bob に再計算される）
    const c120 = cells.json.cells.find((c: any) => c[0] === cellAt(120));
    if (c120) expect([alice.id, bob.id]).toContain(c120[1]);
    const r = await call('POST', '/api/cells', alice.session, { hits: [{ h3: cellAt(0), t: Date.now() }] });
    expect(r.json.groups).toEqual([]);
  });

  it('退出時に自分の寄与を消すと、他の人の記録だけが残る', async () => {
    await call('POST', '/api/cells', alice.session, { hits: [{ h3: cellAt(2000), t: Date.now() }] });
    const before = await call('GET', `/api/groups/${groupId}/cells`, bob.session);
    expect(before.json.cells.map((c: any) => c[0])).toContain(cellAt(2000));
    const del = await call('DELETE', `/api/groups/${groupId}/members/me?purge=1`, alice.session);
    expect(del.json.groupDeleted).toBe(false);
    const after = await call('GET', `/api/groups/${groupId}/cells`, bob.session);
    const ids = after.json.cells.map((c: any) => c[0]);
    expect(ids).not.toContain(cellAt(2000));
    expect(ids).toContain(cellAt(120)); // bob も通ったセル
    for (const c of after.json.cells) {
      expect(c[1]).toBe(bob.id);
      expect(c[2]).toBe(bob.id);
    }
    // オーナーが抜けたので bob がオーナーになる
    const g = await call('GET', `/api/groups/${groupId}`, bob.session);
    expect(g.json.group.ownerId).toBe(bob.id);
    // マイマップからは退出できない
    const me = await call('GET', '/api/me', alice.session);
    const personal = me.json.groups.find((x: any) => x.isPersonal);
    expect((await call('DELETE', `/api/groups/${personal.id}/members/me`, alice.session)).status).toBe(409);
  });

  it('参加時にマイマップの足跡を持ち込める', async () => {
    const j = await call('POST', `/api/invites/${invite}/join`, alice.session, { bringHistory: true });
    expect(j.json.joined).toBe(true);
    expect(j.json.copied).toBeGreaterThan(0);
    const cells = await call('GET', `/api/groups/${groupId}/cells`, alice.session);
    expect(cells.json.mine).toContain(cellAt(2000));
    expect(cells.json.mine).not.toContain(cellAt(0)); // 自宅ゾーン内は持ち込まない
  });

  it('SSE チケットはグループ閲覧権限がないと発行されない', async () => {
    const other = await call('POST', '/api/groups', alice.session, { name: '秘密' });
    expect((await call('POST', `/api/groups/${other.json.group.id}/stream-ticket`, bob.session)).status).toBe(403);
    const ok = await call('POST', `/api/groups/${groupId}/stream-ticket`, bob.session);
    expect(typeof ok.json.ticket).toBe('string');
  });
});
