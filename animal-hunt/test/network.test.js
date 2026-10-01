import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d);
    inbox.push(msg);
    for (const w of [...waiters]) {
      if (w.pred(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  return {
    ws,
    inbox,
    open: () => new Promise((r) => ws.once('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    wait(pred, ms = 3000) {
      const hit = inbox.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => reject(new Error('timeout waiting for message')), ms);
      });
    },
  };
}

test('部屋を作って参加し、ゲームが始まりスナップショットと入力の確認応答が届く', async () => {
  const { server, wss, port } = await startServer(0);
  try {
    const a = client(port);
    const b = client(port);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'create', name: 'あるふぁ' });
    const joined = await a.wait((m) => m.type === 'joined');
    assert.match(joined.room, /^[A-Z0-9]{4}$/);

    b.send({ type: 'join', room: joined.room.toLowerCase(), name: 'べーた' });
    const bj = await b.wait((m) => m.type === 'joined');
    b.send({ type: 'setRole', role: 'hunter' });
    await a.wait((m) => m.type === 'lobby' && m.players.some((p) => p.id === bj.you && p.role === 'hunter'));

    // ホスト以外は開始できない
    b.send({ type: 'start' });
    a.send({ type: 'addBot', role: 'survivor' });
    await a.wait((m) => m.type === 'lobby' && m.players.length === 3);
    a.send({ type: 'start' });

    const sa = await a.wait((m) => m.type === 'start');
    const sb = await b.wait((m) => m.type === 'start');
    assert.equal(sa.role, 'survivor');
    assert.equal(sb.role, 'hunter');
    assert.equal(sa.map.tiles.length, sa.map.w * sa.map.h);

    // 入力を送ると seq が確認応答される
    for (let i = 1; i <= 10; i++) a.send({ type: 'input', seq: i, buttons: 8, pressed: 0, aim: 0 });
    const snap = await a.wait((m) => m.type === 'snap' && m.you.seq >= 10, 4000);
    assert.equal(snap.you.role, 'survivor');
    assert.equal(snap.team.length, 2);
    // サバイバーには足あと情報が送られない
    assert.equal(snap.prints, undefined);
    const hs = await b.wait((m) => m.type === 'snap');
    assert.ok(Array.isArray(hs.prints));

    // 部屋が見つからない
    const c = client(port);
    await c.open();
    c.send({ type: 'join', room: 'ZZZZ', name: 'x' });
    const err = await c.wait((m) => m.type === 'error');
    assert.ok(err.text.length > 0);
    c.ws.close();

    // ゲーム中に抜けるとボットが引き継ぐ
    b.ws.close();
    const after = await a.wait((m) => m.type === 'snap' && m.time > snap.time + 0.5, 4000);
    assert.ok(after);
    a.ws.close();
  } finally {
    for (const c of wss.clients) c.terminate();
    await new Promise((r) => server.close(r));
  }
});

test('静的ファイル: 公開ディレクトリ外は配信しない', async () => {
  const { server, wss, port } = await startServer(0);
  try {
    const ok = await fetch(`http://localhost:${port}/shared/constants.js`);
    assert.equal(ok.status, 200);
    const idx = await fetch(`http://localhost:${port}/`);
    assert.match(await idx.text(), /もふもふハント/);
    const bad = await fetch(`http://localhost:${port}/shared/..%2fserver%2fgame.js`);
    assert.notEqual(bad.status, 200);
  } finally {
    for (const c of wss.clients) c.terminate();
    await new Promise((r) => server.close(r));
  }
});
