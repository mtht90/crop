/**
 * 端末内の保存（IndexedDB）。オフラインでも記録し、ログイン/オンライン時にサーバーへ送る。
 * - cells:  この端末で塗ったセル（ログイン前の「この端末」マップ）
 * - outbox: まだサーバーに送っていないセル
 * - kv:     設定やキャッシュ
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CellHit } from '../../shared/cells';

interface Schema extends DBSchema {
  cells: { key: string; value: { h3: string; firstAt: number; lastAt: number } };
  outbox: { key: number; value: CellHit & { id?: number } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
function db() {
  dbp ??= openDB<Schema>('scratch-map', 1, {
    upgrade(d) {
      d.createObjectStore('cells', { keyPath: 'h3' });
      d.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

export async function loadLocalCells(): Promise<string[]> {
  return (await (await db()).getAllKeys('cells')) as string[];
}

/** セルを端末に保存し、送信待ちに積む。新しく塗ったセルを返す */
export async function recordHits(hits: CellHit[], queue: boolean): Promise<string[]> {
  const tx = (await db()).transaction(['cells', 'outbox'], 'readwrite');
  const cells = tx.objectStore('cells');
  const outbox = tx.objectStore('outbox');
  const fresh: string[] = [];
  for (const h of hits) {
    const cur = await cells.get(h.h3);
    if (!cur) {
      fresh.push(h.h3);
      await cells.put({ h3: h.h3, firstAt: h.t, lastAt: h.t });
    } else if (h.t > cur.lastAt) {
      await cells.put({ ...cur, lastAt: h.t });
    }
    if (queue) await outbox.add({ h3: h.h3, t: h.t });
  }
  await tx.done;
  return fresh;
}

export async function peekOutbox(limit: number): Promise<(CellHit & { id: number })[]> {
  const d = await db();
  const out: (CellHit & { id: number })[] = [];
  let cur = await d.transaction('outbox').store.openCursor();
  while (cur && out.length < limit) {
    out.push(cur.value as CellHit & { id: number });
    cur = await cur.continue();
  }
  return out;
}

export async function outboxCount(): Promise<number> {
  return (await db()).count('outbox');
}

export async function outboxCells(): Promise<string[]> {
  return [...new Set((await (await db()).getAll('outbox')).map((x) => x.h3))];
}

export async function deleteOutbox(ids: number[]) {
  const tx = (await db()).transaction('outbox', 'readwrite');
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

/** 自宅ゾーン追加時など、条件に合うセルを端末からも消す */
export async function purgeLocal(pred: (h3: string) => boolean) {
  const tx = (await db()).transaction(['cells', 'outbox'], 'readwrite');
  for (const k of (await tx.objectStore('cells').getAllKeys()) as string[]) if (pred(k)) await tx.objectStore('cells').delete(k);
  let cur = await tx.objectStore('outbox').openCursor();
  while (cur) {
    if (pred(cur.value.h3)) await cur.delete();
    cur = await cur.continue();
  }
  await tx.done;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown) {
  await (await db()).put('kv', value, key);
}
