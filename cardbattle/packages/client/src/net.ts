import {
  MATCHMAKING_TIMEOUT_SECONDS,
  RECONNECT_GRACE_SECONDS,
  type ClientMessage,
  type ServerMessage,
} from '@cardbattle/sim';

/** 接続先：?server=wss://... で指定。無ければ配信元と同じホストの /ws */
export function serverUrl(): string | null {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/**
 * ゲームサーバーとの WebSocket 接続。切断されたら、試合中であれば再接続を試み続ける
 * （サーバーは 10 秒以内に戻れば試合を続けさせ、戻れなければ負けにする）。
 */
export class NetClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private closedByUser = false;
  onMessage?: (msg: ServerMessage) => void;
  onConnectionChange?: (state: 'connected' | 'reconnecting' | 'lost') => void;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error('timeout'));
        }
      }, 5000);
      ws.onopen = () => {
        settled = true;
        window.clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error('connection failed'));
        }
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMessage;
        if (msg.t === 'start') this.token = msg.token;
        if (msg.t === 'end') this.token = null;
        this.onMessage?.(msg);
      };
      ws.onclose = () => {
        if (settled && !this.closedByUser && this.token) void this.reconnectLoop();
      };
    });
  }

  private async reconnectLoop(): Promise<void> {
    this.onConnectionChange?.('reconnecting');
    const until = Date.now() + RECONNECT_GRACE_SECONDS * 1000;
    while (Date.now() < until && !this.closedByUser && this.token) {
      try {
        await this.connect();
        this.send({ t: 'resume', token: this.token });
        this.onConnectionChange?.('connected');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!this.closedByUser) this.onConnectionChange?.('lost');
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUser = true;
    this.token = null;
    this.ws?.close();
  }
}

export { MATCHMAKING_TIMEOUT_SECONDS };
