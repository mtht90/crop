// ============================================================================
// Online client: one WebSocket to the home server, with automatic reconnect,
// the player's anonymous identity (kept in localStorage), and a small store
// the lobby reads. Game messages are handed to the battle controller.
// ============================================================================
import { create } from 'zustand';
import { PROTOCOL, type ClientMsg, type MatchKind, type OnlineProfile, type OppInfo, type RoomInfo, type ServerMsg } from './protocol';

const KEY = 'arcane-beasts-online-v1';
const SERVER_KEY = 'arcane-beasts-server';

interface Creds {
  id?: string;
  secret?: string;
  name?: string;
  portrait?: string;
}

function loadCreds(): Creds {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Creds;
  } catch {
    return {};
  }
}
function saveCreds(c: Creds) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

const inFrame = () => {
  try {
    return window.top !== window;
  } catch {
    return true;
  }
};

/** online play needs the standalone site (the claude.ai Artifact frame cannot reach the server) */
export const onlineSupported = () => import.meta.env.MODE !== 'artifact' && !inFrame();

/** where the server is: ?server=host:port, a saved address, or the page's own origin */
export function serverUrl(): string {
  let custom: string | null = null;
  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q) localStorage.setItem(SERVER_KEY, q); // remember it, so the link only has to be opened once
    custom = q || localStorage.getItem(SERVER_KEY);
  } catch {
    /* ignore */
  }
  const secure = location.protocol === 'https:';
  if (custom) {
    if (/^wss?:\/\//.test(custom)) return custom;
    return `${/^(localhost|127\.|192\.168\.|10\.)/.test(custom) ? 'ws' : secure ? 'wss' : 'ws'}://${custom.replace(/\/ws$/, '')}/ws`;
  }
  // the game's static host has no server of its own: use the one it was built for
  const home = import.meta.env.VITE_SERVER_HOST as string | undefined;
  if (home && location.host !== home && !/^(localhost|127\.)/.test(location.hostname)) return `wss://${home}/ws`;
  return `${secure ? 'wss' : 'ws'}://${location.host}/ws`;
}

/** point the game at another server (empty = the page's own origin) */
export function setServerAddress(addr: string) {
  try {
    const v = addr.trim();
    if (v) localStorage.setItem(SERVER_KEY, v);
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    /* ignore */
  }
}

export type Status = 'idle' | 'connecting' | 'open';

export interface MatchInfo {
  you: 0 | 1;
  kind: MatchKind;
  code: string;
  opp: OppInfo;
  me: OppInfo;
}

interface OnlineStore {
  status: Status;
  /** a connection attempt failed (server unreachable) */
  failed: boolean;
  profile: OnlineProfile | null;
  online: number;
  waiting: number;
  room: RoomInfo | null;
  queued: 'random' | null;
  transfer: { code: string; expires: number } | null;
  /** last error text (cleared when read by the UI) */
  error: string | null;
  /** the game in progress, if any */
  match: MatchInfo | null;
}

export const useOnline = create<OnlineStore>(() => ({
  status: 'idle',
  failed: false,
  profile: null,
  online: 0,
  waiting: 0,
  room: null,
  queued: null,
  transfer: null,
  error: null,
  match: null,
}));

type GameMsg = Extract<ServerMsg, { t: 'snapshot' | 'batch' | 'over' | 'peer' | 'stamp' }>;
type Listener = (m: GameMsg) => void;

class OnlineClient {
  /** exposed for debugging */
  ws: WebSocket | null = null;
  private wanted = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pings = 0;
  private listeners = new Set<Listener>();
  /**
   * the game's messages since its last snapshot: a controller that subscribes
   * late (the battle screen is still loading) or anew gets the table from here
   */
  private buffer: GameMsg[] = [];
  /** when anything last came from the server (a link can die without closing) */
  private lastHeard = 0;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  /** called when a game starts (the app opens the battle screen) */
  onStart: ((m: MatchInfo) => void) | null = null;

  get creds() {
    return loadCreds();
  }

  connect() {
    this.wanted = true;
    if (this.ws || !onlineSupported()) return;
    this.open();
  }

  disconnect() {
    this.wanted = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopPing();
    this.ws?.close();
    this.ws = null;
    useOnline.setState({ status: 'idle', room: null, queued: null, match: null });
  }

  private open() {
    useOnline.setState({ status: 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(serverUrl());
    } catch {
      useOnline.setState({ status: 'idle', failed: true });
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.lastHeard = Date.now();
      const c = loadCreds();
      this.raw({ t: 'hello', v: PROTOCOL, id: c.id, secret: c.secret, name: c.name, portrait: c.portrait });
      this.startPing();
    };
    ws.onmessage = (e) => {
      this.lastHeard = Date.now();
      try {
        this.handle(JSON.parse(String(e.data)) as ServerMsg);
      } catch (err) {
        console.error('bad server message', err);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      useOnline.setState({ status: 'idle', queued: null, failed: this.retry >= 1 });
      if (this.wanted) {
        const wait = Math.min(8000, 800 * 2 ** this.retry++);
        this.retryTimer = setTimeout(() => this.open(), wait);
      }
    };
    ws.onerror = () => ws.close();
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => this.raw({ t: 'ping', n: ++this.pings }), 15_000);
    // the server answers every ping: a long silence means the link is dead (a phone that
    // changed networks or slept) even if the socket never closed — drop it and reconnect
    this.watchTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && Date.now() - this.lastHeard > 40_000) this.drop();
    }, 5_000);
  }
  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.pingTimer = null;
    this.watchTimer = null;
  }
  /** give up on the current socket now; onclose reconnects */
  private drop() {
    const ws = this.ws;
    if (!ws) return;
    try {
      ws.close();
    } catch {
      /* already gone */
    }
    // some browsers wait long before firing close on a dead link: act now
    ws.onclose?.(new CloseEvent('close'));
  }
  /**
   * back from the background: check the link at once (a ping must be answered
   * within a few seconds) instead of waiting for the next one
   */
  checkLink() {
    if (!this.wanted) return;
    if (!this.ws) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retry = 0;
      this.open();
      return;
    }
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const asked = Date.now();
    this.raw({ t: 'ping', n: ++this.pings });
    setTimeout(() => {
      if (this.ws && this.lastHeard < asked) this.drop();
    }, 6_000);
  }

  private raw(m: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(m));
      return true;
    } catch {
      return false;
    }
  }

  /** false when it could not go out (no link): the caller can resync after the reconnect */
  send(m: ClientMsg): boolean {
    return this.raw(m);
  }

  private handle(m: ServerMsg) {
    const set = useOnline.setState;
    switch (m.t) {
      case 'welcome': {
        const c = loadCreds();
        saveCreds({ ...c, id: m.profile.id, secret: m.secret, name: m.profile.name, portrait: m.profile.portrait });
        set({ status: 'open', failed: false, profile: m.profile, online: m.online, waiting: m.waiting });
        return;
      }
      case 'renamed':
        saveCreds({ ...loadCreds(), name: m.profile.name, portrait: m.profile.portrait });
        set({ profile: m.profile });
        return;
      case 'linked':
        saveCreds({ ...loadCreds(), id: m.profile.id, secret: m.secret, name: m.profile.name, portrait: m.profile.portrait });
        set({ profile: m.profile, error: null });
        // log in again as the transferred identity
        this.ws?.close();
        return;
      case 'transferCode':
        set({ transfer: { code: m.code, expires: m.expires } });
        return;
      case 'room':
        if (m.room.state !== 'over') set({ room: m.room, queued: null });
        return;
      case 'queued':
        set({ queued: m.kind, waiting: m.waiting });
        return;
      case 'pong':
        set({ online: m.online, waiting: m.waiting });
        return;
      case 'error':
        set({ error: m.message, queued: m.code === 'busy' ? useOnline.getState().queued : null });
        return;
      case 'start': {
        const info: MatchInfo = { you: m.you, kind: m.kind, code: m.code, opp: m.opp, me: m.me };
        const cur = useOnline.getState().match;
        // a reconnect into the game already on screen: keep the battle screen (and its
        // controller); the snapshot that follows puts the table right
        if (cur && cur.code === m.code && cur.you === m.you && this.listeners.size) return;
        this.buffer = [];
        set({ match: info, queued: null });
        this.onStart?.(info);
        return;
      }
      case 'snapshot':
      case 'batch':
      case 'over':
      case 'peer':
      case 'stamp':
        if (m.t === 'over') set({ room: null });
        // keep what a late (or new) controller needs: the last snapshot and what came after
        // (a batch folds into one snapshot of where it ends, so this stays small)
        if (m.t === 'snapshot') this.buffer = [m];
        else if (!this.listeners.size) {
          // nobody watching yet (the battle screen is loading): keep every frame so it plays them all
          this.buffer.push(m);
        } else if (m.t === 'batch') {
          const prev = this.buffer.find((x) => x.t === 'snapshot') as Extract<GameMsg, { t: 'snapshot' }> | undefined;
          const state = m.frames.length ? m.frames[m.frames.length - 1].state : prev?.state;
          if (state) this.buffer = [{ t: 'snapshot', state, prompt: m.prompt, legal: m.legal, seq: m.seq, actor: m.actor, deadline: m.deadline }];
        } else if (m.t === 'over') this.buffer.push(m);
        this.listeners.forEach((l) => l(m));
        return;
    }
  }

  /** the battle controller subscribes; messages that came earlier are replayed */
  listen(l: Listener): () => void {
    this.listeners.add(l);
    for (const m of this.buffer) l(m);
    return () => void this.listeners.delete(l);
  }

  clearMatch() {
    this.buffer = [];
    useOnline.setState({ match: null });
  }

  // ---- lobby helpers ------------------------------------------------------
  createRoom(deck: string[]) {
    this.send({ t: 'create', deck });
  }
  joinRoom(code: string, deck: string[]) {
    this.send({ t: 'join', code, deck });
  }
  queue(kind: 'random', deck: string[]) {
    this.send({ t: 'queue', kind, deck });
  }
  cancel() {
    this.send({ t: 'cancel' });
    this.send({ t: 'ping', n: ++this.pings });
    useOnline.setState({ queued: null, room: null });
  }
  rename(name: string, portrait?: string) {
    this.send({ t: 'rename', name, portrait });
  }
  requestTransfer() {
    this.send({ t: 'transfer' });
  }
  link(code: string) {
    this.send({ t: 'link', code });
  }
  leave() {
    this.send({ t: 'leave' });
    useOnline.setState({ room: null, queued: null });
  }
}

export const online = new OnlineClient();

// a phone brought back from the background often has a dead socket: check it at once
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) online.checkLink();
  });
  window.addEventListener('online', () => online.checkLink());
}

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__online = { online, useOnline };
