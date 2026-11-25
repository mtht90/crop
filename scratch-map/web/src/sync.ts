/** 送信待ちセルのアップロードと、グループのリアルタイム購読（SSE） */
import { API_BASE, ApiError, api, type CellTuple, type Group, type Member } from './api';
import * as local from './localdb';
import { emit, mergeCells, state, type GroupView } from './state';

// ------------------------------------------------------------------ outbox

let flushing = false;
let flushAgain = false;
let timer: number | undefined;

export function scheduleFlush(delayMs = 3000) {
  clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), delayMs);
}

/** 送信待ちを空になるまで送る。送信中に呼ばれたら、終わった後にもう一度回す */
export async function flush(): Promise<void> {
  if (!state.me || !navigator.onLine) return;
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  try {
    do {
      flushAgain = false;
      for (;;) {
        const batch = await local.peekOutbox(1000);
        if (!batch.length) break;
        const r = await api<{ groups: { groupId: string }[] }>('POST', '/api/cells', { hits: batch.map(({ h3, t }) => ({ h3, t })) });
        await local.deleteOutbox(batch.map((b) => b.id));
        // SSE が届く前でも表示が崩れないよう、今見ているグループには自分の分を即反映
        const uid = state.me!.user.id;
        if (state.currentGroupId && r.groups.some((g) => g.groupId === state.currentGroupId)) {
          const tuples: CellTuple[] = batch
            .filter((b) => !state.groupCells.has(b.h3))
            .map((b) => [b.h3, uid, uid, b.t, b.t, 1]);
          for (const b of batch) state.mine.add(b.h3);
          mergeCells(tuples, uid);
        }
        state.pending = new Set(await local.outboxCells());
        emit('ui');
      }
    } while (flushAgain);
    emit('cells');
  } catch (e) {
    if (!(e instanceof ApiError)) scheduleFlush(15_000); // ネットワークエラーは後で再試行
  } finally {
    flushing = false;
  }
}

// ------------------------------------------------------------------ group load + realtime

let es: EventSource | null = null;
let rtGroup: string | null = null;
let retry = 0;
let retryTimer: number | undefined;
let firstHello = true;

type OtherCellsHandler = (cells: string[], userId: string) => void;
let onOthersNewCells: OtherCellsHandler = () => {};
export function setOthersNewCellsHandler(fn: OtherCellsHandler) {
  onOthersNewCells = fn;
}

export async function loadGroup(groupId: string | null, invite: string | null = null) {
  closeRealtime();
  state.currentGroupId = groupId;
  state.groupCells = new Map();
  state.mine = new Set();
  state.view = null;
  if (!groupId) {
    emit('ui');
    emit('cells');
    return;
  }
  try {
    localStorage.setItem('scratch.group', groupId);
  } catch {
    /* noop */
  }
  type Info = { group: Group; members: Member[]; viewer: GroupView['viewer'] };
  let info: Info;
  try {
    info = await api<Info>('GET', `/api/groups/${groupId}`, undefined, { invite });
  } catch (e) {
    // オフライン: 最後に見た状態を表示し、オンラインになったら取り直す
    const cached = !(e instanceof ApiError) && !invite ? await local.kvGet<CachedGroup>(`group:${groupId}`) : undefined;
    if (!cached) throw e;
    if (state.currentGroupId !== groupId) return;
    state.view = { ...cached.info, invite: null };
    state.groupCells = new Map(cached.cells.map((c) => [c[0], c]));
    state.mine = new Set(cached.mine);
    emit('ui');
    emit('cells');
    rtGroup = groupId;
    reconnectLater();
    return;
  }
  if (state.currentGroupId !== groupId) return;
  state.view = { ...info, invite };
  if (!info.viewer.isMember && state.viewMode === 'mine') state.viewMode = 'all';
  emit('ui');
  await fetchCells();
  connectRealtime(groupId);
}

interface CachedGroup {
  info: { group: Group; members: Member[]; viewer: GroupView['viewer'] };
  cells: CellTuple[];
  mine: string[];
}

async function fetchCells() {
  const gid = state.currentGroupId;
  if (!gid || !state.view) return;
  const r = await api<{ cells: CellTuple[]; mine: string[] }>('GET', `/api/groups/${gid}/cells`, undefined, { invite: state.view.invite });
  if (state.currentGroupId !== gid || !state.view) return;
  state.groupCells = new Map(r.cells.map((c) => [c[0], c]));
  state.mine = new Set(r.mine);
  emit('cells');
  emit('ui');
  if (state.view.viewer.isMember) {
    const { group, members, viewer } = state.view;
    void local.kvSet(`group:${gid}`, { info: { group, members, viewer }, cells: r.cells, mine: r.mine } satisfies CachedGroup);
  }
}

async function refreshMembers() {
  const gid = state.currentGroupId;
  if (!gid || !state.view) return;
  const info = await api<{ group: Group; members: Member[]; viewer: GroupView['viewer'] }>('GET', `/api/groups/${gid}`, undefined, {
    invite: state.view.invite,
  });
  if (state.currentGroupId !== gid || !state.view) return;
  state.view = { ...state.view, ...info };
  emit('ui');
  emit('cells');
}

export function closeRealtime() {
  es?.close();
  es = null;
  rtGroup = null;
  clearTimeout(retryTimer);
  state.realtime = 'off';
}

function connectRealtime(groupId: string) {
  closeRealtime();
  rtGroup = groupId;
  firstHello = true;
  void open();
}

async function open() {
  const gid = rtGroup;
  if (!gid || !state.view) return;
  state.realtime = 'connecting';
  emit('ui');
  try {
    const { ticket } = await api<{ ticket: string }>('POST', `/api/groups/${gid}/stream-ticket`, undefined, { invite: state.view.invite });
    if (rtGroup !== gid) return;
    const src = new EventSource(`${API_BASE}/api/stream?ticket=${encodeURIComponent(ticket)}`);
    es = src;
    src.addEventListener('hello', () => {
      retry = 0;
      state.realtime = 'live';
      emit('ui');
      // 再接続時は切断中の取りこぼしを拾うため取り直す
      if (!firstHello) void refreshMembers().then(fetchCells);
      firstHello = false;
    });
    src.addEventListener('message', (ev) => handleEvent(JSON.parse((ev as MessageEvent).data)));
    src.onerror = () => {
      // チケットは1回限りなので、EventSource の自動再接続に任せず張り直す
      src.close();
      if (es === src) es = null;
      reconnectLater();
    };
  } catch {
    reconnectLater();
  }
}

function reconnectLater() {
  if (!rtGroup) return;
  state.realtime = 'connecting';
  emit('ui');
  const delay = Math.min(30_000, 1000 * 2 ** retry++);
  clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void open(), delay);
}

function handleEvent(e: any) {
  if (e.groupId !== state.currentGroupId) return;
  if (e.type === 'cells') {
    const fresh = (e.newCells as string[]).filter((h) => !state.displayed.has(h));
    mergeCells(e.cells as CellTuple[], e.userId);
    if (e.userId !== state.me?.user.id && fresh.length) onOthersNewCells(fresh, e.userId);
  } else if (e.type === 'members') {
    void refreshMembers();
  } else if (e.type === 'reload') {
    void fetchCells();
  }
}

/** バックグラウンドから戻ったら接続を確認 */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (rtGroup && !es) void open();
    void flush();
  }
});
window.addEventListener('online', () => {
  state.online = true;
  emit('ui');
  void flush();
  if (rtGroup && !es) void open();
});
window.addEventListener('offline', () => {
  state.online = false;
  emit('ui');
});
