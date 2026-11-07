import { randomBytes, randomInt } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { loadContent, type ClientMessage, type ServerMessage } from '@cardbattle/sim';
import { Match, type Seat } from './match';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

export interface ServerOptions {
  port: number;
  /** ビルド済みクライアント（packages/client/dist）。あれば同じサーバーから配信する */
  staticDir?: string;
  graceMs?: number;
  /** テスト用：時間の進み方の倍率 */
  speed?: number;
}

interface Conn {
  ws: WebSocket;
  match: Match | null;
  player: number;
  queued: { name: string; deck: string[] } | null;
}

/** ゲームサーバー：ランダムマッチの待ち行列と、進行中の試合を管理する */
export function startServer(opts: ServerOptions): { http: Server; close: () => Promise<void>; matches: Map<string, Match> } {
  const content = loadContent();
  const matches = new Map<string, Match>();
  const byToken = new Map<string, { match: Match; player: number }>();
  const queue: Conn[] = [];

  const http = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, matches: matches.size, queued: queue.length }));
      return;
    }
    if (!opts.staticDir) {
      res.writeHead(404).end();
      return;
    }
    const root = resolve(opts.staticDir);
    let file = join(root, normalize(decodeURIComponent(url)));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': file.includes(`${'/'}assets${'/'}`) ? 'public, max-age=3600' : 'no-cache',
    });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

  const send = (ws: WebSocket) => (msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const tryPair = () => {
    while (queue.length >= 2) {
      const a = queue.shift()!;
      const b = queue.shift()!;
      if (a.ws.readyState !== a.ws.OPEN) {
        queue.unshift(b);
        continue;
      }
      if (b.ws.readyState !== b.ws.OPEN) {
        queue.unshift(a);
        continue;
      }
      const seat = (c: Conn): Seat => ({ name: c.queued!.name, deck: c.queued!.deck, token: randomBytes(16).toString('hex'), send: send(c.ws), disconnectedAt: null });
      const id = randomBytes(6).toString('hex');
      const match = new Match(id, [seat(a), seat(b)], content, randomInt(2 ** 31), opts.graceMs, opts.speed);
      [a, b].forEach((c, i) => {
        c.match = match;
        c.player = i;
        c.queued = null;
        byToken.set(match.seats[i].token, { match, player: i });
      });
      matches.set(id, match);
      match.onEnded = () =>
        setTimeout(() => {
          matches.delete(id);
          for (const s of match.seats) byToken.delete(s.token);
        }, 60_000);
      match.start();
    }
  };

  const validDeck = (deck: unknown): deck is string[] =>
    Array.isArray(deck) && deck.length === content.rules.deckSize && new Set(deck).size === deck.length && deck.every((d) => typeof d === 'string' && !!content.cards.get(d));

  wss.on('connection', (ws) => {
    const conn: Conn = { ws, match: null, player: -1, queued: null };
    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      switch (msg.t) {
        case 'queue': {
          if (conn.match || conn.queued) return;
          if (!validDeck(msg.deck)) return send(ws)({ t: 'error', message: 'invalid deck' });
          conn.queued = { name: String(msg.name ?? 'Player').slice(0, 16) || 'Player', deck: msg.deck };
          queue.push(conn);
          send(ws)({ t: 'queued' });
          tryPair();
          break;
        }
        case 'cancel': {
          const i = queue.indexOf(conn);
          if (i >= 0) queue.splice(i, 1);
          conn.queued = null;
          // 対戦が決まった直後に取り消された場合は、その人の負けにする
          if (conn.match && !conn.match.ended) {
            conn.match.sim.forfeit(conn.player);
            conn.match.disconnect(conn.player);
          }
          break;
        }
        case 'cmd':
          conn.match?.submit(conn.player, msg);
          break;
        case 'resume': {
          const found = byToken.get(String(msg.token));
          if (!found || found.match.ended) return send(ws)({ t: 'error', message: 'match not found' });
          conn.match = found.match;
          conn.player = found.player;
          found.match.reconnect(found.player, send(ws));
          break;
        }
        case 'ping':
          send(ws)({ t: 'pong', at: msg.at });
          break;
      }
    });
    ws.on('close', () => {
      const i = queue.indexOf(conn);
      if (i >= 0) queue.splice(i, 1);
      if (conn.match && !conn.match.ended && conn.match.seats[conn.player].send) conn.match.disconnect(conn.player);
    });
  });

  http.listen(opts.port);
  return {
    http,
    matches,
    close: () =>
      new Promise<void>((done) => {
        for (const m of matches.values()) m.stop();
        for (const c of wss.clients) c.terminate();
        wss.close();
        http.close(() => done());
      }),
  };
}
