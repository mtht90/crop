/** API クライアント。セッショントークンは localStorage に置き Bearer で送る（別オリジンでも動くように） */
function apiBase(): string {
  const v = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_HOST ?? '').trim();
  if (!v) return ''; // 開発時は Vite のプロキシ経由で同一オリジン
  return (/^https?:\/\//.test(v) ? v : `https://${v}`).replace(/\/+$/, '');
}
export const API_BASE = apiBase();

const SESSION_KEY = 'scratch.session';

export const session = {
  get: () => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(SESSION_KEY, t);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* プライベートモード等 */
    }
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
  opts: { invite?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const s = session.get();
  if (s) headers.Authorization = `Bearer ${s}`;
  if (opts.invite) headers['X-Invite-Token'] = opts.invite;
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && s && data.error === 'login_required') onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

// ---- 型（サーバーと揃える）
export interface User {
  id: string;
  email: string | null;
  displayName: string;
}
export interface GroupSummary {
  id: string;
  name: string;
  isPersonal: boolean;
  role: string;
  color: string;
  shareEnabled: boolean;
  memberCount: number;
  cellCount: number;
}
export interface Member {
  userId: string;
  displayName: string;
  color: string;
  role: string;
  shareEnabled: boolean;
  joinedAt: number;
}
export interface Group {
  id: string;
  name: string;
  isPersonal: boolean;
  ownerId: string | null;
  mode: string;
}
export type CellTuple = [string, string | null, string | null, number, number, number];
export interface HomeZoneDto {
  id?: string;
  h3: string;
  radiusM: number;
  label?: string;
}
export interface MeResponse {
  user: User;
  groups: GroupSummary[];
  homeZones: HomeZoneDto[];
  ingest: { createdAt: number; lastUsedAt: number | null } | null;
  passkeyCount: number;
}
export interface Stats {
  totalCells: number;
  newSince: number;
  since: number;
  members: { userId: string; displayName: string; color: string; pioneered: number; visited: number; newSince: number }[];
  formerMembersPioneered: number;
}
