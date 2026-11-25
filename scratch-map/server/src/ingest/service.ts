import { makeZoneExcluder, pointsToCells, type Anchor, type CellHit, type HomeZone } from '../../../shared/cells.js';
import type { AppliedGroup } from '../store.js';
import type { ParsedBatch } from './parse.js';

/** 受信処理が必要とするストア操作（テストで差し替えられるよう最小限に絞る） */
export interface IngestStore {
  findUserByIngestToken(token: string): Promise<string | null>;
  listHomeZones(userId: string): Promise<HomeZone[]>;
  getIngestState(userId: string, device: string): Promise<Anchor | null>;
  setIngestState(userId: string, device: string, anchor: Anchor | null): Promise<void>;
  applyHits(userId: string, hits: CellHit[]): Promise<AppliedGroup[]>;
}

/** 未来すぎる時刻は端末時計のずれとみなし現在時刻に丸める */
const MAX_FUTURE_MS = 10 * 60 * 1000;

export interface IngestResult {
  points: number;
  dropped: number;
  hits: number;
  applied: AppliedGroup[];
}

export async function ingestBatches(store: IngestStore, userId: string, batches: ParsedBatch[], now = Date.now()): Promise<IngestResult> {
  const zones = await store.listHomeZones(userId);
  const exclude = makeZoneExcluder(zones);
  const allHits: CellHit[] = [];
  let points = 0;
  let dropped = 0;
  for (const b of batches) {
    points += b.points.length;
    const pts = b.points.map((p) => (p.t > now + MAX_FUTURE_MS ? { ...p, t: now } : p));
    const prev = await store.getIngestState(userId, b.device);
    const r = pointsToCells(pts, { prev, exclude });
    dropped += r.dropped;
    allHits.push(...r.hits);
    // 生座標は保持しない。次のバッチと繋ぐための「直前セル」だけ残す
    if (r.last && (!prev || r.last.t >= prev.t)) await store.setIngestState(userId, b.device, r.last);
    else if (!r.last && pts.length && r.dropped < pts.length) await store.setIngestState(userId, b.device, null);
  }
  const applied = allHits.length ? await store.applyHits(userId, allHits) : [];
  return { points, dropped, hits: allHits.length, applied };
}
