// Fast-forward balance sim: runs real battles with rendering stopped and GSAP/scene stepped manually.
// usage: node sim.mjs [runs=3] [ids=all] [url=http://localhost:5199]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const runs = +(process.argv[2] ?? 3);
// HUMAN=1: slower, shorter chains (a casual player) for economy tuning
const HUMAN = !!process.env.HUMAN;
const ALL = ['kh_a','kh_b','kh_c','rh_a','rh_b','rh_c','mh_a','mh_b','mh_c','bh_a','bh_b','l_knight','l_barbarian','skull','skel_minion','knight','barbarian','rogue','hood','skel_warrior','skel_rogue'];
const ids = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : ALL;
const url = process.argv[4] ?? 'http://localhost:5199';
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const out = {};
for (const id of ids) {
  out[id] = [];
  for (let r = 0; r < runs; r++) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', (e) => console.log(id, 'pageerror', e.message));
    await p.addInitScript(([id, ALL]) => {
      const owned = Object.fromEntries(ALL.map((i) => [i, { lv: 1, count: 1 }]));
      localStorage.setItem('punitto-battle-save-v2', JSON.stringify({ coins: 0, owned, selected: id, bossLv: 1, tutorialDone: true }));
    }, [id, ALL]);
    await p.goto(`${url}/?scene=battle`);
    await p.waitForFunction(() => window.__game?.Scenes.current?.board, null, { timeout: 60000 });
    const res = await p.evaluate(async (HUMAN) => {
      const G = window.__game, g = G.gsap;
      G.App.pixi.ticker.stop();
      g.ticker.remove(g.updateRoot);
      let T = g.ticker.time;
      const sc = G.Scenes.current;
      const dt = 1 / 60;
      let k = 0;
      const step = async () => { T += dt; g.updateRoot(T); sc.update(dt); for (let i = 0; i < 4; i++) await 0; if (++k % 120 === 0) await new Promise((r) => setTimeout(r, 0)); };
      const log = [];
      { let v = sc.board.inputEnabled; Object.defineProperty(sc.board, 'inputEnabled', { get: () => v, set: (x) => { v = x; log.push(x + ' @' + Math.round(T * 10) / 10 + ' ' + sc.phase + ' ' + new Error().stack.split('\n').slice(2, 4).join('|').replace(/http:\/\/localhost:5199/g, '')); } }); }
      let guard = 0;
      while (sc.phase !== 'play' && guard++ < 1200) await step();
      let idleN = 0; const fails = []; let lastFailed = false; let next = 0, chains = 0, skills = 0, bombs = 0, simT = 0;
      const b = sc.board;
      while (sc.phase !== 'end' && sc.phase !== 'result' && simT < 400) {
        await step();
        simT += dt;
        if (sc.phase !== 'play' || (sc.timeLeft <= 0)) { if (sc.timeLeft <= 0) break; continue; }
        if ((next -= dt) > 0) continue;
        next = HUMAN ? 1.0 + Math.random() * 0.6 : 0.55 + Math.random() * 0.35; // HUMAN: a casual player's pace
        const sk = b.pieces.find((q) => q.kind === 'skill' && q.state === 'live' && b.onBoard(q));
        if (sk) { b.pointerDown(sk.x, sk.y); b.pointerUp(); skills++; continue; }
        const bomb = b.pieces.find((q) => (q.kind === 'bomb' || q.kind === 'mega') && q.state === 'live' && b.onBoard(q));
        if (bomb && Math.random() < 0.5) { b.pointerDown(bomb.x, bomb.y); bombs++; continue; }
        let grp = b.bestGroup();
        if (lastFailed) {
          // after a failed trace, try some other group like a person would
          const live = b.pieces.filter((q) => q.linkable && b.onBoard(q));
          for (let t = 0; t < 30; t++) { const g2 = b.groupOf(live[Math.floor(Math.random() * live.length)]); if (g2.length >= 3) { grp = g2; break; } }
        }
        if (grp.length < 3) { idleN++; continue; }
        if (b.tapPop) { b.pointerDown(grp[0].x, grp[0].y); b.pointerUp(); continue; }
        // trace a path through the group (greedy walk over adjacent members)
        const want = HUMAN ? Math.min(grp.length, 3 + Math.floor(Math.random() * Math.random() * 8)) : Math.random() < 0.6 ? grp.length : 3 + Math.floor(Math.random() * Math.max(1, grp.length - 2));
        // try every start, greedy walk preferring the neighbor with the fewest onward options; keep the longest
        let path = [];
        for (const start of grp) {
          const pth = [start]; const used = new Set(pth);
          while (pth.length < want) {
            const last = pth[pth.length - 1];
            const cands = grp.filter((q) => !used.has(q) && b.adjacent(q, last));
            if (!cands.length) break;
            cands.sort((x, y) => grp.filter((q) => !used.has(q) && q !== x && b.adjacent(q, x)).length - grp.filter((q) => !used.has(q) && q !== y && b.adjacent(q, y)).length);
            used.add(cands[0]); pth.push(cands[0]);
          }
          if (pth.length > path.length) path = pth;
          if (path.length >= want) break;
        }
        if (path.length < 3) continue;
        b.pointerDown(path[0].x, path[0].y);
        for (const q of path.slice(1)) b.pointerMove(q.x, q.y);
        const got = b.chain.length;
        lastFailed = got < 3;
        if (got < 3 && fails.length < 6) fails.push({ want: path.length, got, first: [Math.round(path[0].x), Math.round(path[0].y)], st0: path[0].state, kinds: path.map((q) => q.kind).join(''), d01: Math.round(Math.hypot(path[0].x - path[1].x, path[0].y - path[1].y)), r: Math.round(path[0].r), inp: b.inputEnabled, ph: sc.phase, tap: b.tapPop });
        b.pointerUp();
        chains++;
      }
      const st = {}; for (const q of b.pieces) { const k = q.kind + ':' + q.state + ':' + (b.onBoard(q) ? 'in' : 'out'); st[k] = (st[k] ?? 0) + 1; } return { idle: idleN, fails, st, best: b.bestGroup().length, input: b.inputEnabled, ys: b.pieces.slice(0, 6).map((q) => Math.round(q.y)), score: Math.round(sc.committed), coins: sc.coinsEarned + Math.floor(Math.min(4000, Math.min(sc.committed, 1e6) / 400 + Math.max(0, sc.committed - 1e6) / 2000)), chains, skills, bombs, maxChain: sc.maxChain, fever: sc.feverCount };
    }, HUMAN);
    out[id].push(res);
    await p.close();
  }
  const s = out[id].map((x) => x.score);
  const avg = s.reduce((a, c) => a + c, 0) / s.length;
  for (const x of out[id]) if (x.chains < 70) console.log("  short:", JSON.stringify(x).slice(0, 1500)); console.log(`${id.padEnd(13)} avg=${Math.round(avg).toString().padStart(9)} runs=${s.join(',')} skills=${out[id].map((x) => x.skills).join(',')} chains=${out[id].map((x) => x.chains).join(',')} fever=${out[id].map((x) => x.fever).join(',')} coins=${out[id].map((x) => x.coins).join(',')}`);
}
await b.close();
