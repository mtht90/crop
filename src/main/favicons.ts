// ファビコンをメインプロセスで取得し、data: URL にして UI に渡す。
// UI (アプリ本体) が外部サイトへ直接リクエストしないようにするため。
import { session } from 'electron';

const MAX_BYTES = 128 * 1024;
const MAX_ENTRIES = 400;
const TIMEOUT_MS = 5000;

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function remember(url: string, value: string | null): void {
  cache.set(url, value);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

/** ファビコンの URL を data: URL に変換する。取得できなければ null */
export function resolveFavicon(url: string): Promise<string | null> {
  if (url.startsWith('data:image/')) return Promise.resolve(url.length <= MAX_BYTES * 1.4 ? url : null);
  if (!/^https?:\/\//i.test(url)) return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  const inflight = pending.get(url);
  if (inflight) return inflight;

  const task = (async () => {
    let value: string | null = null;
    try {
      // 閲覧に使っているセッションで取得する (ページ表示時と同じキャッシュが使われる)
      const res = await session.defaultSession.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const type = res.headers.get('content-type')?.split(';')[0].trim() ?? '';
      if (res.ok && type.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length <= MAX_BYTES) value = `data:${type};base64,${buf.toString('base64')}`;
      }
    } catch {
      value = null;
    }
    pending.delete(url);
    remember(url, value);
    return value;
  })();
  pending.set(url, task);
  return task;
}
