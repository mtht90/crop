/**
 * グループ単位のリアルタイム配信（SSE 用のインメモリ Pub/Sub）。
 * Render Starter 1インスタンス前提。複数インスタンスにする場合はこのクラスを
 * Postgres LISTEN/NOTIFY や Redis に置き換える（インターフェースは publish/subscribe のみ）。
 */
import { randomToken } from './crypto.js';

export type RealtimeEvent =
  | { type: 'cells'; groupId: string; userId: string; cells: unknown[]; newCells: string[] }
  | { type: 'members'; groupId: string }
  | { type: 'reload'; groupId: string };

type Listener = (e: RealtimeEvent) => void;

export class Bus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(groupId: string, fn: Listener): () => void {
    let set = this.listeners.get(groupId);
    if (!set) this.listeners.set(groupId, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) this.listeners.delete(groupId);
    };
  }

  publish(e: RealtimeEvent) {
    for (const fn of this.listeners.get(e.groupId) ?? []) {
      try {
        fn(e);
      } catch {
        /* 個々の接続エラーは無視 */
      }
    }
  }

  connectionCount(): number {
    let n = 0;
    for (const s of this.listeners.values()) n += s.size;
    return n;
  }
}

/**
 * EventSource はヘッダーを付けられないため、短命・1回限りのチケットを URL に載せる。
 * セッショントークン自体を URL に載せない（ログに残さない）ための仕組み。
 */
export class TicketBook {
  private tickets = new Map<string, { groupId: string; userId: string | null; exp: number }>();

  issue(groupId: string, userId: string | null, ttlMs = 60_000): string {
    this.gc();
    const t = randomToken(18);
    this.tickets.set(t, { groupId, userId, exp: Date.now() + ttlMs });
    return t;
  }

  take(ticket: string) {
    const v = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!v || v.exp < Date.now()) return null;
    return v;
  }

  private gc() {
    const now = Date.now();
    for (const [k, v] of this.tickets) if (v.exp < now) this.tickets.delete(k);
  }
}
