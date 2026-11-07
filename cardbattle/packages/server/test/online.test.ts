import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { BotBrain, loadContent, OnlineMatchSession, type ServerMessage } from '@cardbattle/sim';
import { startServer } from '../src/server';

const content = loadContent();
const PORT = 18787;
let server: ReturnType<typeof startServer>;

beforeAll(() => {
  server = startServer({ port: PORT, graceMs: 600, speed: 20 });
});
afterAll(async () => {
  await server.close();
});

interface Client {
  ws: WebSocket;
  session: OnlineMatchSession | null;
  ended: Extract<ServerMessage, { t: 'end' }> | null;
  desync: number;
  rejects: number;
  token: string;
  opponentLeft: boolean;
}

/** BOT の頭脳を持ったクライアント。受け取った frame を自分のシミュレーションで再生し、BOT が出したいコマンドを送る */
function connect(name: string, bot = true): Promise<Client> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const c: Client = { ws, session: null, ended: null, desync: 0, rejects: 0, token: '', opponentLeft: false };
    let brain: BotBrain | null = null;
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'queue', name, deck: content.starterDeck }));
      resolve(c);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as ServerMessage;
      if (msg.t === 'start') {
        c.token = msg.token;
        c.session = new OnlineMatchSession(msg.setup, content.rules, content.cards, msg.you, (cmd) => ws.send(JSON.stringify({ t: 'cmd', ...cmd })));
        c.session.onDesync = () => c.desync++;
        if (bot) brain = new BotBrain(msg.you, content.bots[1], 7 + msg.you);
      } else if (msg.t === 'frame' && c.session) {
        c.session.pushFrame(msg.tick, msg.cmds);
        c.session.advance(1, () => undefined); // テストでは届いた分をすぐ進める
        const cmd = brain?.think(c.session.simulation);
        if (process.env.DBG && c.session.simulation.tick % 400 === 0) console.log(name, 'tick', c.session.simulation.tick, 'mana', c.session.simulation.mana(c.session.localPlayer), 'cmd', !!cmd, 'log', c.session.simulation.acceptedLog.length);
        if (cmd && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'cmd', cardId: cmd.cardId, pos: cmd.pos, issueTick: cmd.issueTick }));
      } else if (msg.t === 'hash') c.session?.pushHash(msg.tick, msg.hash);
      else if (msg.t === 'reject') { c.rejects++; if (process.env.DBG && c.rejects < 2) { const m = [...server.matches.values()].at(-1)!; console.log('REJECT', JSON.stringify(msg), 'client', c.session?.simulation.players[msg.cmd.player].hand.map((h) => h.id).join(','), c.session?.simulation.tick, 'server', m.sim.players[msg.cmd.player].hand.map((h) => h.id).join(','), m.sim.tick, m.setup.seed, c.session?.setup.seed); } }
      else if (msg.t === 'end') c.ended = msg;
      else if (msg.t === 'opponentDisconnected') c.opponentLeft = true;
    });
  });
}

const waitFor = async (cond: () => boolean, ms: number) => {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('オンライン対戦', () => {
  it('2人のクライアントが最後まで同じ状態で対戦できる', async () => {
    const a = await connect('Alice');
    const b = await connect('Bob');
    await waitFor(() => !!a.ended && !!b.ended, 60_000);
    if (process.env.DBG) console.log('desync', a.desync, b.desync, 'rejects', a.rejects, b.rejects, 'end', JSON.stringify(a.ended), a.session!.simulation.tick);
    expect(a.ended!.winner).toBe(b.ended!.winner);
    // 最後の frame まで再生しきってから比べる
    await waitFor(() => a.session!.buffered === 0 && b.session!.buffered === 0, 2000);
    expect(a.desync).toBe(0);
    expect(b.desync).toBe(0);
    expect(a.session!.simulation.acceptedLog.length).toBeGreaterThan(3);
    expect(a.session!.simulation.stateHash()).toBe(b.session!.simulation.stateHash());
    a.ws.close();
    b.ws.close();
  }, 70_000);

  it('切断して戻らなければ負けになる', async () => {
    const a = await connect('Alice', false);
    const b = await connect('Bob', false);
    await waitFor(() => !!a.session && !!b.session, 5000);
    b.ws.terminate();
    await waitFor(() => !!a.ended, 5000);
    expect(a.opponentLeft).toBe(true);
    expect(a.ended!.reason).toBe('forfeit');
    expect(a.ended!.winner).toBe(a.session!.localPlayer);
    a.ws.close();
  }, 10_000);

  it('切断しても時間内に戻れば、受理済みのコマンドから状態を復元して続けられる', async () => {
    const a = await connect('Alice');
    const b = await connect('Bob', false);
    await waitFor(() => !!a.session && (a.session.simulation.acceptedLog.length ?? 0) > 2, 20_000);
    const token = b.token;
    const you = b.session!.localPlayer;
    b.ws.terminate();
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const resumed = await new Promise<Extract<ServerMessage, { t: 'resumeState' }>>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ t: 'resume', token })));
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as ServerMessage;
        if (msg.t === 'resumeState') resolve(msg);
      });
    });
    expect(resumed.you).toBe(you);
    const s = new OnlineMatchSession(resumed.setup, content.rules, content.cards, you, () => undefined);
    s.restore(resumed.log, resumed.tick);
    expect(s.simulation.tick).toBe(resumed.tick);
    expect(s.simulation.acceptedLog.length).toBe(resumed.log.length);
    ws.close();
    a.ws.close();
  }, 30_000);
});
