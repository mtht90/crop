/** アプリ全体の状態と、状態を変える操作 */
import { makeZoneExcluder, type CellHit, type HomeZone } from '../../shared/cells';
import { api, ApiError, session, type CellTuple, type Group, type Member, type MeResponse } from './api';
import * as local from './localdb';

export type ViewMode = 'mine' | 'all' | 'members';

export interface GroupView {
  group: Group;
  members: Member[];
  viewer: { userId: string | null; isMember: boolean };
  invite: string | null;
}

type Listener = (kind: 'cells' | 'ui') => void;
const listeners = new Set<Listener>();
export function onChange(fn: Listener) {
  listeners.add(fn);
}
export function emit(kind: 'cells' | 'ui') {
  for (const fn of listeners) fn(kind);
}

export const state = {
  me: null as MeResponse | null,
  /** null = ログイン前の「この端末」マップ */
  currentGroupId: null as string | null,
  view: null as GroupView | null,
  groupCells: new Map<string, CellTuple>(),
  mine: new Set<string>(),
  localCells: new Set<string>(),
  /** サーバー未送信のセル */
  pending: new Set<string>(),
  localZones: [] as HomeZone[],
  viewMode: 'all' as ViewMode,
  walking: false,
  walkNew: 0,
  lastAccuracy: null as number | null,
  realtime: 'off' as 'off' | 'connecting' | 'live',
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  /** 直近の描画で霧を晴らしていたセル（新規判定用） */
  displayed: new Set<string>(),
};

export const isLoggedIn = () => !!state.me;

export function homeZones(): HomeZone[] {
  return state.me ? state.me.homeZones.map((z) => ({ h3: z.h3, radiusM: z.radiusM })) : state.localZones;
}

let excluderCache: { key: string; fn: ((h: string) => boolean) | undefined } = { key: '', fn: undefined };
export function excluder() {
  const zones = homeZones();
  const key = zones.map((z) => `${z.h3}:${z.radiusM}`).join(',');
  if (key !== excluderCache.key) excluderCache = { key, fn: makeZoneExcluder(zones) };
  return excluderCache.fn;
}

function myMembership(): Member | undefined {
  const uid = state.me?.user.id;
  return state.view?.members.find((m) => m.userId === uid);
}

/** 自分の未送信セルを今見ているグループに重ねて表示してよいか */
function pendingVisibleHere(): boolean {
  if (!state.view) return true;
  if (!state.view.viewer.isMember) return false;
  return state.view.group.isPersonal || (myMembership()?.shareEnabled ?? false);
}

export interface Display {
  fog: string[];
  /** 色分け表示: 色 → セル */
  colored: { color: string; cells: string[] }[] | null;
}

export function computeDisplay(): Display {
  if (!state.view) {
    const s = new Set([...state.localCells, ...state.pending]);
    return { fog: [...s], colored: null };
  }
  const pending = pendingVisibleHere() ? state.pending : new Set<string>();
  const base = state.viewMode === 'mine' ? state.mine : new Set(state.groupCells.keys());
  const fog = new Set([...base, ...pending]);
  let colored: Display['colored'] = null;
  if (state.viewMode === 'members') {
    const colorOf = new Map(state.view.members.map((m) => [m.userId, m.color]));
    const byColor = new Map<string, string[]>();
    const push = (color: string, h: string) => (byColor.get(color) ?? byColor.set(color, []).get(color)!).push(h);
    for (const [h, t] of state.groupCells) push(colorOf.get(t[1] ?? '') ?? '#9ca3af', h);
    const myColor = myMembership()?.color ?? '#ffffff';
    for (const h of pending) if (!state.groupCells.has(h)) push(myColor, h);
    colored = [...byColor].map(([color, cells]) => ({ color, cells }));
  } else if (state.viewMode === 'mine') {
    colored = [{ color: myMembership()?.color ?? '#ffffff', cells: [...fog] }];
  }
  return { fog: [...fog], colored };
}

// ------------------------------------------------------------------ 起動・ログイン

export async function boot() {
  state.localCells = new Set(await local.loadLocalCells());
  state.pending = new Set(await local.outboxCells());
  state.localZones = (await local.kvGet<HomeZone[]>('localZones')) ?? [];
  if (session.get()) await refreshMe().catch(() => {});
}

export async function refreshMe() {
  try {
    state.me = await api<MeResponse>('GET', '/api/me');
    await local.kvSet('cachedMe', state.me);
  } catch (e) {
    // ネットワークに繋がらない時（HTTP エラー以外）はキャッシュで動かす
    if (e instanceof ApiError) throw e;
    state.me = (await local.kvGet<MeResponse>('cachedMe')) ?? null;
  }
  emit('ui');
}

/** ログイン直後: 端末だけで設定していた自宅ゾーンをアカウントへ移す */
export async function afterLogin(token: string) {
  session.set(token);
  await refreshMe();
  for (const z of state.localZones) {
    await api('POST', '/api/home-zones', { h3: z.h3, radiusM: z.radiusM, purge: false }).catch(() => {});
  }
  if (state.localZones.length) {
    state.localZones = [];
    await local.kvSet('localZones', []);
    await refreshMe();
  }
}

export async function logout() {
  await api('POST', '/api/auth/logout').catch(() => {});
  session.set(null);
  state.me = null;
  await local.kvSet('cachedMe', null);
  state.view = null;
  state.currentGroupId = null;
  state.groupCells.clear();
  state.mine.clear();
  emit('ui');
  emit('cells');
}

// ------------------------------------------------------------------ 記録

export interface RecordResult {
  newForView: string[];
}

export async function recordHits(hits: CellHit[]): Promise<RecordResult> {
  if (!hits.length) return { newForView: [] };
  // IndexedDB を待つ前に表示側の集合へ入れる（位置更新が並行しても同じセルを二重に数えない）
  const visibleHere = pendingVisibleHere();
  const newForView = [...new Set(hits.map((h) => h.h3))].filter((h) => !state.displayed.has(h));
  for (const h of hits) {
    state.localCells.add(h.h3);
    state.pending.add(h.h3);
    if (visibleHere) state.displayed.add(h.h3);
  }
  emit('cells');
  await local.recordHits(hits, true);
  return { newForView: visibleHere ? newForView : [] };
}

/** サーバーから届いた（または送信成功した）セルを反映 */
export function mergeCells(tuples: CellTuple[], byUserId: string | null) {
  for (const t of tuples) {
    state.groupCells.set(t[0], t);
    if (byUserId && byUserId === state.me?.user.id) state.mine.add(t[0]);
  }
  emit('cells');
}
