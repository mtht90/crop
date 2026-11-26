import './ui/style.css';
import { applySkin, preloadCapFonts } from './ui/skin';
import { CAPS } from './game/caps';
import { loadAssets, type Assets } from './core/assets';
import { Character } from './render/character';
import { DIFFICULTIES, TEAMS } from './game/data';
import { capById } from './game/caps';
import { cupById, recordRound, userGame } from './game/league';
import { addCoins, persist, save } from './game/save';
import { LEAGUE_TEAMS, teamById } from './game/teams';
import type { GameState } from './game/rules';
import { capsScreen, challengeResult, challengeScreen, cupsScreen, homeScreen, leagueEndScreen, leagueScreen, vendingScreen } from './ui/menus';
import { audio } from './core/audio';
import { Engine } from './render/engine';
import { buildField } from './render/field';
import { Hud } from './ui/hud';
import { Match, type MatchOptions } from './game/match';
import { loadingScreen, pauseMenu, resultScreen, setupScreen, titleScreen } from './ui/screens';

async function main() {
  applySkin();
  const app = document.getElementById('app')!;
  const engine = new Engine(app);
  engine.start();

  // タイトルを先に出し、裏で素材を読み込む
  let setProgress: (p: number) => void = () => {};
  const assetsP = loadAssets((p) => setProgress(p * 0.85));
  let warm: Promise<void> = Promise.resolve();
  const ready = assetsP.then(async (assets) => {
    buildField(engine.scene, assets, engine.renderer);
    setProgress(1);
    // 選手のユニフォーム塗り替えとシェーダーの準備は、タイトル・設定画面の裏で進める
    // 準備に失敗しても試合はできる（その場で作る）ので、エラーは握りつぶす
    warm = new Promise((r) => setTimeout(r, 600)).then(() => warmUp(engine, assets)).catch((e) => console.warn(e));
    return assets;
  });
  const title = titleScreen(app, ready, (cb) => (setProgress = cb));
  const assets = await ready.catch(() => new Promise<never>(() => {})); // 失敗時はタイトルで読み直しを促す

  // タイトル背景：球場をゆっくり回る
  let t = 0;
  let orbit = true;
  engine.onUpdate((dt) => {
    if (!orbit) return;
    t += dt * 0.05;
    engine.fixedVFov = 50;
    engine.fitFov();
    engine.camera.position.set(Math.sin(t) * 20, 7 + Math.sin(t * 0.7) * 1.5, 4 + Math.cos(t) * 8);
    engine.camera.lookAt(0, 1, -8);
  });

  // キャップのラベルの書体（タイトルを見ている間に読み込む）
  const fontsReady = preloadCapFonts(CAPS.map((c) => c.mark + c.name + (c.badge ?? '') + (c.sub ?? '') + c.genre).join('') + '0123456789・');
  const hud = new Hud(app);
  hud.show(false);
  await title;
  await fontsReady;
  audio.bgm('title');
  audio.ambience(true);

  const autoplay = new URLSearchParams(location.search).has('auto');

  /** 1試合（またはミニゲーム）を遊ぶ。途中でやめたら null */
  const play = async (opts: MatchOptions): Promise<{ st: GameState; score: number } | null> => {
    let warmed = false;
    warm.then(() => (warmed = true));
    await new Promise((r) => setTimeout(r, 0));
    if (!warmed) {
      const l = loadingScreen(app);
      l.set(0.9);
      await warm;
      l.done();
    }
    orbit = false;
    hud.show(true);
    audio.bgm('game');
    // 確認用（開発時のみ）：?inn=1 で回数を短くする
    const innQ = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('inn')) : 0;
    const match = new Match(engine, assets, hud, { ...opts, autoplay, innings: innQ || opts.innings });
    let quit = false;
    hud.pauseBtn.onclick = async () => {
      engine.paused = true;
      audio.play('ui_ok');
      const r = await pauseMenu(app);
      engine.paused = false;
      if (r === 'quit') {
        quit = true;
        match.dispose();
      }
    };
    const st = await match.run();
    hud.show(false);
    orbit = true;
    if (quit) {
      audio.bgm('title');
      return null;
    }
    match.dispose();
    return { st, score: match.score };
  };

  /** 試合の成績をコインと記録に反映する */
  const reward = (st: GameState, user: 'away' | 'home', mul: number) => {
    const me = user === 'away' ? st.away : st.home, op = user === 'away' ? st.home : st.away;
    const d = st.score(me) - st.score(op);
    let hr = 0, so = 0;
    for (const [p, l] of st.lines) if (me.team.players.includes(p)) hr += l.hr;
    for (const [p, l] of st.lines) if (op.team.players.includes(p)) so += l.so;
    save.stats.games++;
    if (d > 0) save.stats.wins++;
    save.stats.hr += hr;
    save.stats.so += so;
    const coins = Math.round(((d > 0 ? 100 : d === 0 ? 50 : 30) + st.score(me) * 10 + hr * 20 + so * 5) * mul);
    addCoins(coins);
    return coins;
  };

  const settings = () => ({ predict: true });

  for (;;) {
    orbit = true;
    hud.show(false);
    audio.bgm('title');
    const choice = await homeScreen(app);

    if (choice === 'league') {
      for (;;) {
        const lg = await cupsScreen(app);
        if (!lg) break;
        let left = false;
        while (!lg.done) {
          const a = await leagueScreen(app, lg);
          if (a === 'back') { left = true; break; }
          const cup = cupById(lg.cupId);
          const g = userGame(lg)!;
          const me = teamById(lg.teams[0]), opp = teamById(lg.teams[g.oppIndex]);
          const caps = { away: g.user === 'away' ? capById(save.capSel) : capById(opp.capId), home: g.user === 'home' ? capById(save.capSel) : capById(opp.capId) };
          const res = await play({
            away: g.user === 'away' ? me : opp,
            home: g.user === 'home' ? me : opp,
            user: g.user,
            innings: cup.innings,
            difficulty: DIFFICULTIES[cup.diff],
            predict: settings().predict,
            caps,
          });
          if (!res) continue; // 途中でやめたら、この節はやり直し
          const ms = g.user === 'away' ? res.st.away : res.st.home, os = g.user === 'away' ? res.st.home : res.st.away;
          recordRound(lg, res.st.score(ms), res.st.score(os));
          persist();
          const coins = reward(res.st, g.user, 1 + cup.diff * 0.25);
          await resultScreen(app, res.st, g.user, { coins, again: '', back: lg.done ? '最終結果へ' : '順位表へ' });
          audio.bgm('title');
        }
        if (lg.done) await leagueEndScreen(app, lg);
        if (left || lg.done) break;
      }
      continue;
    }

    if (choice === 'vending') {
      await vendingScreen(app);
      continue;
    }
    if (choice === 'caps') {
      await capsScreen(app);
      continue;
    }

    if (choice === 'challenge') {
      for (;;) {
        const k = await challengeScreen(app);
        if (!k) break;
        let again = true;
        while (again) {
          const me = teamById(save.teamId);
          const rival = LEAGUE_TEAMS.find((t) => t.id !== me.id && t.rank <= 2) ?? LEAGUE_TEAMS[1];
          // 的当て：自分が投げる（後攻で守る）。ホームラン競争：自分が打つ（先攻）
          const res = await play(k === 'target'
            ? { away: rival, home: me, user: 'home', innings: 1, difficulty: DIFFICULTIES[1], predict: false, caps: { away: capById(rival.capId), home: capById(save.capSel) }, mode: 'target' }
            : { away: me, home: rival, user: 'away', innings: 1, difficulty: DIFFICULTIES[0], predict: settings().predict, caps: { away: capById(save.capSel), home: capById(rival.capId) }, mode: 'derby' });
          if (!res) break;
          again = (await challengeResult(app, k, res.score)) === 'again';
        }
        audio.bgm('title');
      }
      continue;
    }

    // フリー試合
    const cfg = await setupScreen(app);
    if (!cfg) continue;
    const away = cfg.user === 'away' ? cfg.team : cfg.opp;
    const home = cfg.user === 'home' ? cfg.team : cfg.opp;
    const res = await play({ away, home, user: cfg.user, innings: cfg.innings, difficulty: cfg.difficulty, predict: cfg.predict, caps: { away: cfg.user === 'away' ? cfg.cap : cfg.oppCap, home: cfg.user === 'home' ? cfg.cap : cfg.oppCap } });
    if (!res) continue;
    const coins = reward(res.st, cfg.user, 0.5);
    await resultScreen(app, res.st, cfg.user, { coins, again: '', back: 'ホームへ' });
  }
}

/** 両チーム・両ユニフォームの選手を一度作って描き、テクスチャとシェーダーを用意しておく */
async function warmUp(engine: Engine, assets: Assets) {
  const tmp: Character[] = [];
  for (const team of TEAMS) {
    for (const uni of [team.uniform, team.awayUniform]) {
      for (const p of [...team.players, ...team.bench]) {
        const c = new Character(assets.models[p.model], p.model, uni, assets.anims);
        if (assets.bat) c.attachBat(assets.bat.scene);
        c.root.position.set(0, -50, 0);
        engine.scene.add(c.root);
        tmp.push(c);
        await new Promise((r) => setTimeout(r, 16));
      }
    }
  }
  try {
    // compileAsync は端末によって終わらないことがあるので、待つのは最大2秒
    await Promise.race([engine.renderer.compileAsync(engine.scene, engine.camera), new Promise((r) => setTimeout(r, 2000))]);
  } catch {
    /* 描画時にコンパイルされる */
  }
  for (const c of tmp) engine.scene.remove(c.root);
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fff;padding:16px;white-space:pre-wrap">${String(e?.stack || e)}</pre>`);
});
