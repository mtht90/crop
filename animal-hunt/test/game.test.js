import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { generateMap, TILE } from '../shared/map.js';
import { BTN, HEALTH, SURVIVOR, HUNTER, TICK_RATE } from '../shared/constants.js';
import { simulate } from '../scripts/simulate.js';

const ROSTER = [
  { id: 'h', name: 'ウルフ', role: 'hunter' },
  { id: 'a', name: 'うさ', role: 'survivor', animal: 'rabbit' },
  { id: 'b', name: 'ねこ', role: 'survivor', animal: 'cat' },
];

function makeGame(roster = ROSTER, seed = 7) {
  return new Game(roster, { seed });
}

// 入力を与えて n tick 進める
let seq = 1000;
function run(game, ticks, inputs = {}) {
  for (let i = 0; i < ticks; i++) {
    for (const [id, cmd] of Object.entries(inputs)) {
      const c = typeof cmd === 'function' ? cmd(i) : cmd;
      game.queueInput(id, { seq: ++seq, buttons: 0, ...c });
    }
    game.update();
  }
}

// 周囲 5x5 が床の開けた場所
function openSpot(game, avoid = []) {
  const { map, grid } = game;
  for (let y = 4; y < map.h - 4; y++) {
    for (let x = 4; x < map.w - 4; x++) {
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) if (grid.isSolid(x + dx, y + dy)) ok = false;
      if (ok && avoid.every((a) => Math.hypot(a.x - x, a.y - y) > 6)) return { x: x + 0.5, y: y + 0.5 };
    }
  }
  throw new Error('no open spot');
}

function place(p, pos, angle = 0) {
  p.x = pos.x;
  p.y = pos.y;
  p.angle = angle;
  p.aim = angle;
}

test('マップ生成は決定的で、重要なオブジェクトはすべて到達可能', () => {
  for (const seed of [1, 2, 3, 99, 12345]) {
    const a = generateMap(seed);
    const b = generateMap(seed);
    assert.deepEqual(a.tiles, b.tiles);
    assert.equal(a.gates.length, 2);
    assert.ok(a.gens.length >= 7, 'gens');
    assert.ok(a.cages.length >= 8, 'cages');
    assert.ok(a.pallets.length >= 6, 'pallets');

    const W = a.w;
    const pass = (x, y) => x >= 0 && y >= 0 && x < W && y < a.h && (a.tiles[y * W + x] === TILE.FLOOR || a.tiles[y * W + x] === TILE.WINDOW);
    const seen = new Set();
    const start = [Math.floor(a.spawns.hunter.x), Math.floor(a.spawns.hunter.y)];
    const q = [start];
    seen.add(start.join());
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const k = `${x + dx},${y + dy}`;
        if (!seen.has(k) && pass(x + dx, y + dy)) {
          seen.add(k);
          q.push([x + dx, y + dy]);
        }
      }
    }
    // 固体の小物は「隣のマス」に立てれば OK
    const adj = (o) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => seen.has(`${o.x + dx},${o.y + dy}`));
    for (const g of a.gens) assert.ok(adj(g), `gen ${g.id} reachable (seed ${seed})`);
    for (const c of a.cages) assert.ok(adj(c), `cage ${c.id} reachable (seed ${seed})`);
    for (const s of a.spawns.survivors) assert.ok(seen.has(`${Math.floor(s.x)},${Math.floor(s.y)}`), 'survivor spawn reachable');
    for (const g of a.gates) {
      const [x, y] = g.tiles[0];
      const inner = g.side === 'left' ? x + 1 : x - 1;
      assert.ok(seen.has(`${inner},${y}`) || seen.has(`${inner},${y + 1}`), 'gate front reachable');
    }
    // 丸太は両側が壁
    for (const p of a.pallets) {
      const solid = (x, y) => [TILE.WALL, TILE.TREE].includes(a.tiles[y * W + x]);
      if (p.axis === 'v') assert.ok(solid(p.x - 1, p.y) && solid(p.x + 1, p.y));
      else assert.ok(solid(p.x, p.y - 1) && solid(p.x, p.y + 1));
    }
  }
});

test('かみつき 2 回で 元気 → 負傷 → ダウン、被弾後はダッシュ', () => {
  const g = makeGame();
  const h = g.players.get('h');
  const s = g.players.get('a');
  const spot = openSpot(g);
  place(h, spot, 0);
  place(s, { x: spot.x + 1.0, y: spot.y });
  run(g, 1, { h: { buttons: BTN.ATTACK, aim: 0 } });
  run(g, 3, { h: { aim: 0 } });
  assert.equal(s.health, HEALTH.INJURED);
  assert.ok(s.hasteUntil > g.time, 'haste after hit');
  assert.equal(h.action.type, 'wipe');
  // 拭き取り中はもう一度攻撃できない
  run(g, 1, { h: { buttons: BTN.ATTACK, aim: 0 } });
  assert.equal(s.health, HEALTH.INJURED);
  run(g, Math.ceil(HUNTER.hitWipe * TICK_RATE) + 2, { h: { aim: 0 } });
  place(s, { x: h.x + 1.0, y: h.y });
  run(g, 1, { h: { buttons: BTN.ATTACK, aim: 0 } });
  run(g, 3, { h: { aim: 0 } });
  assert.equal(s.health, HEALTH.DOWNED);
});

test('ハンターの視野は前方のコーンだけ。霧の中のサバイバーはスナップショットに含まれない', () => {
  const g = makeGame();
  const h = g.players.get('h');
  const s = g.players.get('a');
  const spot = openSpot(g);
  place(h, spot, 0); // 右を向く
  place(s, { x: spot.x - 2.0, y: spot.y }); // 背後 (近距離の気配範囲より外)
  s.x = spot.x - 1.8 - 1.0;
  let snap = g.snapshotFor('h');
  assert.ok(!snap.players.some((p) => p.id === 'a'), '背後のサバイバーは見えない');
  place(h, spot, Math.PI); // 振り向く
  snap = g.snapshotFor('h');
  assert.ok(
    snap.players.some((p) => p.id === 'a'),
    '前方なら見える',
  );
  // サバイバー側は 360° 見える
  place(h, spot, 0);
  const ss = g.snapshotFor('a');
  assert.ok(ss.players.some((p) => p.id === 'h'));
  // 足あとはハンターにだけ送られる
  g.prints.push({ x: spot.x, y: spot.y, t: g.time, life: 5, kind: 'paw' });
  assert.ok(g.snapshotFor('h').prints.length > 0);
  assert.equal(g.snapshotFor('a').prints, undefined);
});

test('木のうろに隠れるとハンターから見えず、調べられると担がれる', () => {
  const g = makeGame();
  const h = g.players.get('h');
  const s = g.players.get('a');
  const l = g.lockers[0];
  place(s, { x: l.x + 0.5, y: l.y + 1.4 });
  place(h, { x: l.x + 0.5, y: l.y + 3.5 }, -Math.PI / 2);
  run(g, 1, { a: { buttons: BTN.INTERACT } });
  run(g, Math.ceil(SURVIVOR.lockerEnter * TICK_RATE) + 2, { a: { buttons: 0 } });
  assert.equal(s.hidden, l.id);
  assert.ok(!g.snapshotFor('h').players.some((p) => p.id === 'a'));
  // ハンターがうろの前で Space
  place(h, { x: l.x + 0.5, y: l.y + 1.4 }, -Math.PI / 2);
  run(g, 1, { h: { buttons: BTN.ACTION } });
  run(g, Math.ceil(HUNTER.searchLockerTime * TICK_RATE) + 2, { h: {} });
  assert.equal(s.health, HEALTH.CARRIED);
  assert.equal(h.carrying, 'a');
});

test('丸太を倒すと下にいるハンターが気絶し、担いでいたサバイバーを落とす', () => {
  const g = makeGame();
  const h = g.players.get('h');
  const s = g.players.get('a');
  const b = g.players.get('b');
  const p = g.pallets.find((pl) => pl.axis === 'v') || g.pallets[0];
  const c = { x: p.x + 0.5, y: p.y + 0.5 };
  const off = p.axis === 'v' ? { x: 0, y: 1 } : { x: 1, y: 0 };
  // b を担いだハンターが丸太の真下に
  b.health = HEALTH.DOWNED;
  g.carry(h, b);
  place(h, c);
  place(s, { x: c.x + off.x * 0.9, y: c.y + off.y * 0.9 });
  run(g, 1, { a: { buttons: BTN.ACTION } });
  assert.equal(g.pallets[p.id].state, 'down');
  assert.equal(h.action.type, 'stunned');
  assert.equal(h.carrying, null);
  assert.equal(b.health, HEALTH.INJURED);
  assert.equal(s.stats.stuns, 1);
  // 倒れた丸太はハンターには通れないが、壊せる
  run(g, Math.ceil(HUNTER.palletStun * TICK_RATE) + 2, {});
  assert.ok(g.grid.isSolid(p.x, p.y));
  place(h, { x: c.x - off.x * 1.0, y: c.y - off.y * 1.0 });
  run(g, 1, { h: { buttons: BTN.ACTION } });
  assert.equal(h.action.type, 'break_pallet');
  run(g, Math.ceil(HUNTER.breakPalletTime * TICK_RATE) + 2, { h: {} });
  assert.equal(g.pallets[p.id].state, 'broken');
  assert.ok(!g.grid.isSolid(p.x, p.y));
});

test('鳥かご: 段階 1 → 2 → 風船。救出されるとお守り (1 回だけ攻撃を防ぐ)', () => {
  const g = makeGame();
  const h = g.players.get('h');
  const s = g.players.get('a');
  const r = g.players.get('b');
  const cage = g.cages[0];
  s.health = HEALTH.DOWNED;
  g.carry(h, s);
  place(h, { x: cage.x + 0.5, y: cage.y + 1.3 }, -Math.PI / 2);
  run(g, 1, { h: { buttons: BTN.ACTION } });
  run(g, Math.ceil(HUNTER.hookTime * TICK_RATE) + 2, { h: {} });
  assert.equal(s.health, HEALTH.CAGED);
  assert.equal(s.hookStage, 1);
  // 仲間が救出
  place(r, { x: cage.x + 0.5, y: cage.y - 0.7 });
  place(h, openSpot(g, [cage]));
  run(g, Math.ceil(SURVIVOR.unhookTime * TICK_RATE) + 3, { b: { buttons: BTN.INTERACT } });
  assert.equal(s.health, HEALTH.INJURED);
  assert.ok(s.enduranceUntil > g.time);
  assert.equal(r.stats.rescues, 1);
  // お守りが一撃を防ぐ
  g.damage(s, h);
  assert.equal(s.health, HEALTH.INJURED);
  g.damage(s, h);
  assert.equal(s.health, HEALTH.DOWNED);

  // 2 回目の鳥かごは段階 2 から。時間切れで風船
  g.carry(h, s);
  g.cageSurvivor(h, s, g.cages[1]);
  assert.equal(s.hookStage, 2);
  s.skill = null;
  g.rng = () => 0.99; // スキルチェックを出さない
  run(g, Math.ceil(SURVIVOR.hookStage2 * TICK_RATE) + 5, {});
  assert.equal(s.health, HEALTH.DEAD);
  assert.ok(g.cages[1].broken, '使われた鳥かごは壊れる');
});

test('3 回目の鳥かごで即座に風船になる', () => {
  const g = makeGame();
  const h = g.players.get('h');
  const s = g.players.get('a');
  s.hookCount = 2;
  s.health = HEALTH.DOWNED;
  g.carry(h, s);
  g.cageSurvivor(h, s, g.cages[0]);
  assert.equal(s.health, HEALTH.DEAD);
});

test('担がれたサバイバーは左右交互連打で逃げ出せる', () => {
  const g = makeGame();
  const h = g.players.get('h');
  const s = g.players.get('a');
  place(h, openSpot(g));
  s.health = HEALTH.DOWNED;
  g.carry(h, s);
  let i = 0;
  while (s.health === HEALTH.CARRIED && i < 400) {
    const b = i % 2 ? BTN.LEFT : BTN.RIGHT;
    run(g, 1, { a: { buttons: b } });
    run(g, 1, { a: { buttons: 0 } });
    i++;
  }
  assert.equal(s.health, HEALTH.INJURED);
  assert.equal(h.carrying, null);
  assert.equal(h.action.type, 'stunned');
});

test('オルゴールを規定数直すとゲートに電気が通り、開けて脱出すると試合終了', () => {
  const g = makeGame([
    { id: 'h', name: 'ウルフ', role: 'hunter' },
    { id: 'a', name: 'うさ', role: 'survivor', animal: 'tanuki' },
  ]);
  const s = g.players.get('a');
  const h = g.players.get('h');
  assert.equal(g.gensRequired, 2);
  g.rng = () => 0.99; // スキルチェック無し
  for (let k = 0; k < g.gensRequired; k++) {
    const gen = g.gens[k];
    place(s, { x: gen.x + 0.5, y: gen.y + 1.3 });
    place(h, { x: 2.5, y: 2.5 });
    let n = 0;
    while (!gen.done && n++ < 60 * TICK_RATE) run(g, 1, { a: { buttons: BTN.INTERACT } });
    assert.ok(gen.done, `gen ${k} done`);
    run(g, 1, { a: { buttons: 0 } });
  }
  assert.ok(g.gates.every((gt) => gt.powered));
  const gate = g.gates[0];
  const front = { x: gate.side === 'left' ? 1.5 : g.map.w - 1.5, y: gate.y };
  place(s, front);
  let n = 0;
  while (!gate.open && n++ < 20 * TICK_RATE) run(g, 1, { a: { buttons: BTN.INTERACT } });
  assert.ok(gate.open);
  assert.ok(g.collapse, '夜明けのカウントダウン開始');
  const dir = gate.side === 'left' ? BTN.LEFT : BTN.RIGHT;
  n = 0;
  while (!g.over && n++ < 5 * TICK_RATE) run(g, 1, { a: { buttons: dir } });
  assert.equal(s.health, HEALTH.ESCAPED);
  assert.ok(g.over);
  assert.equal(g.result.winner, 'survivors');
});

test('スキルチェック失敗で進捗が下がり、ハンターに物音が届く', () => {
  const g = makeGame();
  const s = g.players.get('a');
  const gen = g.gens[0];
  gen.progress = 0.5;
  place(s, { x: gen.x + 0.5, y: gen.y + 1.3 });
  run(g, 2, { a: { buttons: BTN.INTERACT } });
  assert.equal(s.action.type, 'repair');
  s.skill = { id: 42, source: 'gen', deadline: g.time + 5 };
  g.resolveSkill(s, 42, 'miss');
  assert.ok(gen.progress < 0.45);
  assert.ok(g.snapshotFor('h').noises.some((n) => n.k === 'gen_fail'));
  // 不正な id は無視
  const before = gen.progress;
  g.resolveSkill(s, 9999, 'great');
  assert.equal(gen.progress, before);
});

test('最後の 1 匹になるとハッチが開き、飛び込めば脱出', () => {
  const g = makeGame();
  const b = g.players.get('b');
  g.kill(b);
  run(g, 1, {});
  assert.ok(g.hatch && g.hatch.open);
  const s = g.players.get('a');
  place(s, { x: g.hatch.x + 0.5, y: g.hatch.y + 0.5 });
  run(g, 1, { a: { buttons: BTN.INTERACT } });
  run(g, 30, { a: {} });
  assert.equal(s.health, HEALTH.ESCAPED);
  assert.ok(g.over);
  assert.equal(g.result.winner, 'draw');
});

test('ボット同士の試合が例外なく最後まで進む', () => {
  for (const seed of [3, 11, 27]) {
    const { game } = simulate(seed, { maxMinutes: 25 });
    assert.ok(game.over, `seed ${seed} finished`);
    assert.ok(['hunter', 'survivors', 'draw'].includes(game.result.winner));
    const sv = game.result.players.filter((p) => p.role === 'survivor');
    assert.equal(sv.length, 4);
    for (const p of sv) assert.ok(['escaped', 'dead'].includes(p.outcome));
  }
});
