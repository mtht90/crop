/**
 * セーブデータの置き場所。
 * - ServerBackend: 同じサイトに /api があれば、サーバーのアカウントに保存（端末をまたいで引き継げる）
 * - LocalBackend: サーバーがない環境（オフライン版など）では、このブラウザの中に保存
 * どちらも同じ economy.ts のルールで動く。
 */
import { apply, migrate, newProfile, GameError, type Action, type ActionResult, type Profile } from './economy';

export interface Backend {
  readonly kind: 'server' | 'local';
  profile: Profile;
  act(a: Action): Promise<ActionResult>;
  ranking?(): Promise<{ name: string; trophies: number; me?: boolean }[]>;
}

const KEY = 'beacon-brawl-save';
const TOKEN = 'beacon-brawl-token';
const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 保存できない環境 */ } };

class LocalBackend implements Backend {
  readonly kind = 'local' as const;
  profile: Profile;
  constructor() {
    let raw: unknown = null;
    try { raw = JSON.parse(safeGet(KEY) ?? 'null'); } catch { raw = null; }
    this.profile = raw ? migrate(raw, Date.now()) : newProfile(Date.now());
    this.save();
  }
  private save() { safeSet(KEY, JSON.stringify(this.profile)); }
  async act(a: Action) {
    const draft = structuredClone(this.profile);
    const r = apply(draft, a, Date.now()); // 失敗したら GameError（元のデータは変わらない）
    this.profile = draft; this.save();
    return r;
  }
}

class ServerBackend implements Backend {
  readonly kind = 'server' as const;
  constructor(public profile: Profile, private token: string) {}
  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new GameError(data.error ?? `通信エラー (${res.status})`);
    return data as T;
  }
  async act(a: Action) {
    const { profile, result } = await this.call<{ profile: Profile; result: ActionResult }>('act', a);
    this.profile = profile;
    return result;
  }
  async ranking() { return (await this.call<{ ranking: { name: string; trophies: number; me?: boolean }[] }>('ranking')).ranking; }

  static async connect(): Promise<ServerBackend | null> {
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 2500);
      const health = await fetch('/api/health', { signal: ctl.signal }).finally(() => clearTimeout(timer));
      if (!health.ok || !(await health.json().catch(() => null))?.ok) return null;
      let token = safeGet(TOKEN);
      if (token) {
        const res = await fetch('/api/profile', { headers: { authorization: `Bearer ${token}` } });
        if (res.ok) return new ServerBackend((await res.json()).profile, token);
      }
      // はじめての端末: ゲストアカウントを作る
      const res = await fetch('/api/guest', { method: 'POST' });
      if (!res.ok) return null;
      const data = await res.json();
      token = data.token as string; safeSet(TOKEN, token);
      return new ServerBackend(data.profile, token);
    } catch { return null; }
  }
}

export async function openBackend(): Promise<Backend> {
  return (await ServerBackend.connect()) ?? new LocalBackend();
}
