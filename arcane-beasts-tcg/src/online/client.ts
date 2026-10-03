// ============================================================================
// Online client: one WebSocket to the home server, with automatic reconnect,
// the player's anonymous identity (kept in localStorage), and a small store
// the lobby reads. Game messages are handed to the battle controller.
// ============================================================================
import { create } from 'zustand';
import { PROTOCOL, type ClientMsg, type LiveGame, type MatchKind, type OnlineProfile, type OppInfo, type RoomInfo, type ServerMsg } from './protocol';

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
  you: 0 | 1 | 'spectator';
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
  /** the OAuth client id for the Google button (null: Google login is not set up on the server) */
  googleClientId: string | null;
  online: number;
  waiting: number;
  room: RoomInfo | null;
  queued: 'random' | 'ranked' | null;
  live: LiveGame[];
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
  googleClientId: null,
  online: 0,
  waiting: 0,
  room: null,
  queued: null,
  live: [],
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
  /** game messages that arrived before a controller was listening */
  private buffer: GameMsg[] = [];
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
      const c = loadCreds();
      this.raw({ t: 'hello', v: PROTOCOL, id: c.id, secret: c.secret, name: c.name, portrait: c.portrait });
      this.startPing();
    };
    ws.onmessage = (e) => {
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
    this.pingTimer = setInterval(() => this.raw({ t: 'ping', n: ++this.pings }), 20_000);
  }
  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private raw(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  send(m: ClientMsg) {
    this.raw(m);
  }

  private handle(m: ServerMsg) {
    const set = useOnline.setState;
    switch (m.t) {
      case 'welcome': {
        const c = loadCreds();
        saveCreds({ ...c, id: m.profile.id, secret: m.secret, name: m.profile.name, portrait: m.profile.portrait });
        set({ status: 'open', failed: false, profile: m.profile, googleClientId: m.googleClientId ?? null, online: m.online, waiting: m.waiting });
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
      case 'account':
        saveCreds({ ...loadCreds(), id: m.profile.id, ...(m.secret ? { secret: m.secret } : {}), name: m.profile.name, portrait: m.profile.portrait });
        set({ profile: m.profile, error: null });
        // switched to another account: log in again as it
        if (m.mode === 'login') this.ws?.close();
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
      case 'live':
        set({ live: m.games });
        return;
      case 'pong':
        set({ online: m.online, waiting: m.waiting });
        return;
      case 'error':
        set({ error: m.message, queued: m.code === 'busy' ? useOnline.getState().queued : null });
        return;
      case 'start': {
        this.buffer = [];
        const info: MatchInfo = { you: m.you, kind: m.kind, code: m.code, opp: m.opp, me: m.me };
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
        if (!this.listeners.size) this.buffer.push(m);
        else this.listeners.forEach((l) => l(m));
        return;
    }
  }

  /** the battle controller subscribes; messages that came earlier are replayed */
  listen(l: Listener): () => void {
    this.listeners.add(l);
    const early = this.buffer.splice(0);
    for (const m of early) l(m);
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
  queue(kind: 'random' | 'ranked', deck: string[]) {
    this.send({ t: 'queue', kind, deck });
  }
  cancel() {
    this.send({ t: 'cancel' });
    this.send({ t: 'ping', n: ++this.pings });
    useOnline.setState({ queued: null, room: null });
  }
  watch(code: string) {
    this.send({ t: 'spectate', code });
  }
  refreshLive() {
    this.send({ t: 'live' });
  }
  rename(name: string, portrait?: string) {
    this.send({ t: 'rename', name, portrait });
  }
  googleSignIn(credential: string) {
    this.send({ t: 'google', credential });
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

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__online = { online, useOnline };
