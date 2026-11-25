/**
 * 外部アプリ受信 API のテスト（DB 不要。ストアをフェイクに差し替える）
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { areNeighborCells, latLngToCell } from 'h3-js';
import { createApp } from '../server/src/app';
import { loadConfig } from '../server/src/config';
import { Bus, TicketBook, type RealtimeEvent } from '../server/src/realtime';
import { parseOverland, parseOwnTracks } from '../server/src/ingest/parse';
import type { Store, AppliedGroup } from '../server/src/store';
import type { Anchor, CellHit, HomeZone } from '../shared/cells';

const LAT = 35.681236;
const LNG = 139.767125;
const T0 = Date.parse('2026-05-01T09:00:00Z');
const TOKEN = 'test-token-abc';
const USER = '11111111-1111-1111-1111-111111111111';
const GROUPS = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'];

function eastLng(m: number) {
  return LNG + m / (111_320 * Math.cos((LAT * Math.PI) / 180));
}

class FakeStore {
  states = new Map<string, Anchor>();
  zones: HomeZone[] = [];
  applied: CellHit[][] = [];
  async findUserByIngestToken(t: string) {
    return t === TOKEN ? USER : null;
  }
  async listHomeZones() {
    return this.zones;
  }
  async getIngestState(_u: string, d: string) {
    return this.states.get(d) ?? null;
  }
  async setIngestState(_u: string, d: string, a: Anchor | null) {
    if (a) this.states.set(d, a);
    else this.states.delete(d);
  }
  async applyHits(_u: string, hits: CellHit[]): Promise<AppliedGroup[]> {
    this.applied.push(hits);
    return GROUPS.map((g) => ({
      groupId: g,
      cells: hits.map((h) => [h.h3, USER, USER, h.t, h.t, 1]),
      newCells: hits.map((h) => h.h3),
    }));
  }
  get allCells() {
    return this.applied.flat().map((h) => h.h3);
  }
}

function overlandFeature(lat: number, lng: number, ts: string, acc = 10, device = 'iphone') {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { timestamp: ts, horizontal_accuracy: acc, device_id: device, speed: 1.2, altitude: 10 },
  };
}

let store: FakeStore;
let events: RealtimeEvent[];
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = new FakeStore();
  events = [];
  const bus = new Bus();
  for (const g of GROUPS) bus.subscribe(g, (e) => events.push(e));
  app = createApp({
    cfg: loadConfig({ NODE_ENV: 'test' }),
    store: store as unknown as Store,
    bus,
    tickets: new TicketBook(),
    mailer: { sendMagicLink: async () => {} },
  });
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /ingest/overland/:token', () => {
  it('locations を受け取って {"result":"ok"} を返し、セルを反映する', async () => {
    const res = await post(`/ingest/overland/${TOKEN}`, {
      locations: [
        overlandFeature(LAT, LNG, '2026-05-01T09:00:00Z'),
        overlandFeature(LAT, eastLng(500), '2026-05-01T09:02:00Z'),
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'ok' });
    const cells = store.allCells;
    expect(cells[0]).toBe(latLngToCell(LAT, LNG, 10));
    expect(cells.at(-1)).toBe(latLngToCell(LAT, eastLng(500), 10));
    // 間が gridPathCells で埋まっている
    for (let i = 1; i < cells.length; i++) expect(areNeighborCells(cells[i - 1], cells[i])).toBe(true);
    // 所属する全グループにリアルタイム配信される
    expect(events.filter((e) => e.type === 'cells').map((e) => e.groupId).sort()).toEqual([...GROUPS].sort());
  });

  it('誤差 50m 超の点は捨てる', async () => {
    const res = await post(`/ingest/overland/${TOKEN}`, {
      locations: [overlandFeature(LAT, LNG, '2026-05-01T09:00:00Z', 120)],
    });
    expect(await res.json()).toEqual({ result: 'ok' });
    expect(store.applied).toHaveLength(0);
  });

  it('バッチをまたいでも前回の直前セルから塗り繋ぐ（座標ではなくセルだけ保持）', async () => {
    await post(`/ingest/overland/${TOKEN}`, { locations: [overlandFeature(LAT, LNG, '2026-05-01T09:00:00Z')] });
    const anchor = store.states.get('iphone')!;
    expect(anchor).toEqual({ h3: latLngToCell(LAT, LNG, 10), t: T0 });
    expect(Object.keys(anchor).sort()).toEqual(['h3', 't']);
    await post(`/ingest/overland/${TOKEN}`, { locations: [overlandFeature(LAT, eastLng(400), '2026-05-01T09:01:00Z')] });
    const cells = store.allCells;
    for (let i = 1; i < cells.length; i++) expect(areNeighborCells(cells[i - 1], cells[i])).toBe(true);
  });

  it('端末（device_id）ごとに直前セルを分ける', async () => {
    await post(`/ingest/overland/${TOKEN}`, {
      locations: [
        overlandFeature(LAT, LNG, '2026-05-01T09:00:00Z', 10, 'a'),
        overlandFeature(LAT + 0.003, LNG, '2026-05-01T09:00:30Z', 10, 'b'),
      ],
    });
    expect(store.states.get('a')!.h3).toBe(latLngToCell(LAT, LNG, 10));
    expect(store.states.get('b')!.h3).toBe(latLngToCell(LAT + 0.003, LNG, 10));
  });

  it('自宅ゾーン内の点は記録しない', async () => {
    store.zones = [{ h3: latLngToCell(LAT, LNG, 10), radiusM: 300 }];
    await post(`/ingest/overland/${TOKEN}`, {
      locations: [overlandFeature(LAT, LNG, '2026-05-01T09:00:00Z'), overlandFeature(LAT, eastLng(100), '2026-05-01T09:00:40Z')],
    });
    expect(store.applied).toHaveLength(0);
    expect(store.states.has('iphone')).toBe(false);
  });

  it('不正なトークンは 401', async () => {
    const res = await post('/ingest/overland/wrong', { locations: [] });
    expect(res.status).toBe(401);
  });

  it('locations が無い・JSON が壊れている場合は 400', async () => {
    expect((await post(`/ingest/overland/${TOKEN}`, { foo: 1 })).status).toBe(400);
    expect((await post(`/ingest/overland/${TOKEN}`, '{oops')).status).toBe(400);
  });

  it('空の locations でも ok を返す（Overland の再送を止めるため）', async () => {
    const res = await post(`/ingest/overland/${TOKEN}`, { locations: [] });
    expect(await res.json()).toEqual({ result: 'ok' });
  });

  it('Point 以外の Feature は無視する', async () => {
    const res = await post(`/ingest/overland/${TOKEN}`, {
      locations: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[LNG, LAT]] }, properties: {} }],
    });
    expect(await res.json()).toEqual({ result: 'ok' });
    expect(store.applied).toHaveLength(0);
  });
});

describe('POST /ingest/owntracks/:token', () => {
  const loc = (lat: number, lon: number, tst: number, acc = 8) => ({ _type: 'location', lat, lon, tst, acc, tid: 'mt' });

  it('_type: "location" を受け取って [] を返す', async () => {
    const res = await post(`/ingest/owntracks/${TOKEN}`, loc(LAT, LNG, T0 / 1000));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(store.allCells).toEqual([latLngToCell(LAT, LNG, 10)]);
    expect(store.applied[0][0].t).toBe(T0); // tst は秒
  });

  it('location 以外の _type は無視して [] を返す', async () => {
    for (const body of [{ _type: 'transition', event: 'enter' }, { _type: 'lwt' }, { _type: 'waypoint' }]) {
      const res = await post(`/ingest/owntracks/${TOKEN}`, body);
      expect(await res.json()).toEqual([]);
    }
    expect(store.applied).toHaveLength(0);
  });

  it('連続する location の間を埋める（X-Limit-D を端末キーに使う）', async () => {
    await post(`/ingest/owntracks/${TOKEN}`, loc(LAT, LNG, T0 / 1000), { 'X-Limit-D': 'pixel' });
    await post(`/ingest/owntracks/${TOKEN}`, loc(LAT, eastLng(600), T0 / 1000 + 90), { 'X-Limit-D': 'pixel' });
    expect(store.states.has('pixel')).toBe(true);
    const cells = store.allCells;
    expect(cells.length).toBeGreaterThan(3);
    for (let i = 1; i < cells.length; i++) expect(areNeighborCells(cells[i - 1], cells[i])).toBe(true);
  });

  it('acc が 50m 超なら捨てる', async () => {
    await post(`/ingest/owntracks/${TOKEN}`, loc(LAT, LNG, T0 / 1000, 65));
    expect(store.applied).toHaveLength(0);
  });

  it('不正なトークンは 401、壊れた JSON は 400', async () => {
    expect((await post('/ingest/owntracks/nope', loc(LAT, LNG, 1))).status).toBe(401);
    expect((await post(`/ingest/owntracks/${TOKEN}`, 'not json')).status).toBe(400);
  });
});

describe('パーサー', () => {
  it('parseOverland: 端末別にまとめ、座標順は [lng, lat]', () => {
    const r = parseOverland({
      locations: [overlandFeature(LAT, LNG, '2026-05-01T09:00:00Z', 5, 'x'), overlandFeature(1, 2, '2026-05-01T09:00:01Z', 5, 'y')],
    });
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ device: 'x', points: [{ lat: LAT, lng: LNG, t: T0, accuracy: 5 }] });
  });

  it('parseOverland: timestamp が無ければ受信時刻を使う', () => {
    const now = 1_800_000_000_000;
    const r = parseOverland({ locations: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [LNG, LAT] }, properties: {} }] }, now);
    expect(r[0].points[0].t).toBe(now);
    expect(r[0].device).toBe('overland');
  });

  it('parseOwnTracks: 配列でも受け付け、文字列の数値も読む', () => {
    const r = parseOwnTracks([{ _type: 'location', lat: String(LAT), lon: String(LNG), tst: T0 / 1000, acc: '7' }], undefined);
    expect(r[0].points[0]).toEqual({ lat: LAT, lng: LNG, t: T0, accuracy: 7 });
  });
});
