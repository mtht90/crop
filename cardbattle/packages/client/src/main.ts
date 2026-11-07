import './style.css';
import {
  loadContent,
  LocalMatchSession,
  MATCHMAKING_TIMEOUT_SECONDS,
  OnlineMatchSession,
  replayFromSimulation,
  ReplaySession,
  type BotProfile,
  type MatchSession,
  type MatchSetup,
  type ServerMessage,
} from '@cardbattle/sim';
import { ArenaView } from './render/arenaView';
import { BattleView } from './render/battleView';
import { setArenaSize, simToWorld } from './render/coords';
import { Fx } from './render/fx';
import { Stage } from './render/stage';
import { WorldUi } from './render/worldUi';
import { CardInput } from './input/cardInput';
import { Hud, crownIcons, escapeHtml } from './ui/hud';
import { showDeckEditor } from './ui/deck';
import { assets } from './assets/assets';
import { applyTheme } from './ui/theme';
import { audio } from './audio';
import { addReplay, profile, saveProfile, type SavedReplay } from './profile';
import { NetClient, serverUrl } from './net';

const content = loadContent();
setArenaSize(content.rules.width, content.rules.height);

const gameEl = document.getElementById('game')!;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hudEl = document.getElementById('hud')!;
const worldUiEl = document.getElementById('world-ui')!;
const screensEl = document.getElementById('screens')!;

let stage!: Stage;
let worldUi!: WorldUi;
let fx!: Fx;

/**
 * 対戦の種類
 * - online：ランダムマッチで人と対戦（トロフィー増減あり）
 * - ranked-bot：ランダムマッチで相手が見つからず BOT と対戦（トロフィー増減あり）
 * - practice：BOT 練習（トロフィー増減なし）
 * - replay：リプレイ再生
 */
type Mode = 'online' | 'ranked-bot' | 'practice' | 'replay';

interface Battle {
  session: MatchSession;
  arena: ArenaView;
  view: BattleView;
  hud: Hud;
  input: CardInput | null;
  mode: Mode;
  resultShown: boolean;
  bot: BotProfile | null;
  net: NetClient | null;
}
let battle: Battle | null = null;

const click = () => audio.play('click', 0.6, 0);

// ---------------------------------------------------------------- 画面サイズ

function layout(): void {
  if (!stage) return;
  // 縦長（9:16）の画面を基準にする。PC の横長画面では中央に縦長で表示
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  gameEl.style.width = `${Math.min(vw, Math.round((vh * 9) / 16))}px`;
  gameEl.style.height = `${vh}px`;
  if (battle) {
    stage.bottomInset = battle.hud.bottomFraction();
    stage.topInset = battle.hud.topFraction();
  }
  stage.resize(gameEl.clientWidth, gameEl.clientHeight);
}
window.addEventListener('resize', layout);

// ---------------------------------------------------------------- 対戦

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] | 0;
}

function startBattle(session: MatchSession, mode: Mode, bot: BotProfile | null, net: NetClient | null = null): void {
  endBattle(false);
  screensEl.innerHTML = '';
  const sim = session.simulation;
  // プレイヤー1（オンラインの後手）は、自陣が手前に来るようにカメラを反対側に回す
  stage.flipped = session.localPlayer === 1;
  const arena = new ArenaView(sim);
  const view = new BattleView(sim, session.localPlayer, stage, worldUi, fx);
  const hud = new Hud(hudEl, sim, session.localPlayer);
  stage.scene.add(arena.root, view.root);
  const input = mode === 'replay' ? null : new CardInput(session, stage, arena, hud, gameEl);
  if (input) {
    input.onPlaced = () => {
      navigator.vibrate?.(12);
      audio.play('place', 0.6, 0);
    };
    input.onInvalid = () => {
      hud.announce('そこには置けません', 'small', 700);
      audio.play('invalid', 0.6, 0);
    };
    input.onSelect = () => audio.play('select', 0.5, 0);
  }
  if (mode === 'replay') hud.announce('リプレイ再生中', 'small', 1500);
  battle = { session, arena, view, hud, input, mode, resultShown: false, bot, net };
  audio.playMusic('battle');
  gameEl.classList.add('in-battle');
  layout();
  view.update(0, 1);
}

function startBotMatch(bot: BotProfile, mode: 'ranked-bot' | 'practice'): void {
  const seed = randomSeed();
  const botName = content.botNames[Math.abs(seed) % content.botNames.length];
  const session = new LocalMatchSession(
    { seed, decks: [profile.deck.slice(), content.starterDeck.slice()], names: [profile.name, botName] },
    content.rules,
    content.cards,
    0,
  );
  session.setBot(1, bot);
  startBattle(session, mode, bot);
}

/** トロフィーに合わせた BOT の強さ（相手が見つからなかったとき用） */
function botForTrophies(): BotProfile {
  const id = profile.trophies < 90 ? 'easy' : profile.trophies < 300 ? 'normal' : 'hard';
  return content.bots.find((b) => b.id === id) ?? content.bots[0];
}

function endBattle(closeNet = true): void {
  if (!battle) return;
  if (closeNet) battle.net?.close();
  battle.input?.dispose();
  battle.view.dispose();
  stage.scene.remove(battle.arena.root, battle.view.root);
  fx.clear();
  worldUi.clear();
  hudEl.innerHTML = '';
  gameEl.classList.remove('in-battle');
  stage.flipped = false;
  battle = null;
  layout();
}

// ---------------------------------------------------------------- オンライン

function startOnline(net: NetClient, setup: MatchSetup, you: number): void {
  const session = new OnlineMatchSession(setup, content.rules, content.cards, you, (cmd) => net.send({ t: 'cmd', ...cmd }));
  session.onDesync = (tick) => console.error('同期ずれを検出しました tick', tick);
  startBattle(session, 'online', null, net);
  net.onMessage = (msg: ServerMessage) => {
    const b = battle;
    if (!b || b.session !== session) return;
    switch (msg.t) {
      case 'frame':
        session.pushFrame(msg.tick, msg.cmds);
        break;
      case 'hash':
        session.pushHash(msg.tick, msg.hash);
        break;
      case 'reject':
        if (msg.reason === 'notEnoughMana') b.hud.announce('マナが足りません', 'small', 700);
        break;
      case 'opponentDisconnected':
        b.hud.announce(`相手の接続が切れました\n${msg.graceSeconds}秒以内に戻らなければ勝利`, 'small', 2500);
        break;
      case 'opponentReconnected':
        b.hud.announce('相手が戻ってきました', 'small', 1500);
        break;
      case 'resumeState':
        // 再接続：受理済みのコマンドから状態を作り直し、画面も作り直す
        session.restore(msg.log, msg.tick);
        startBattle(session, 'online', null, net);
        break;
      case 'end':
        session.forceEnd(msg.winner);
        break;
    }
  };
  net.onConnectionChange = (state) => {
    if (!battle || battle.session !== session) return;
    if (state === 'reconnecting') battle.hud.announce('再接続しています…', 'small', 3000);
    if (state === 'lost') {
      battle.hud.announce('接続が切れました', 'small', 3000);
      session.forceEnd(1 - you);
    }
  };
}

/** マッチング：相手を探し、10秒で見つからなければ BOT と対戦する */
async function showMatchmaking(): Promise<void> {
  endBattle();
  let cancelled = false;
  let started = false;
  let left = MATCHMAKING_TIMEOUT_SECONDS;
  screensEl.innerHTML = `
    <div class="screen matching">
      <div class="panel">
        <div class="panel-title">対戦相手を探しています</div>
        <div class="spinner"></div>
        <div class="matching-time" data-k="time">${left}</div>
        <div class="hint" data-k="status">サーバーに接続中…</div>
        <button class="btn secondary" data-act="cancel">やめる</button>
      </div>
    </div>`;
  const timeEl = screensEl.querySelector<HTMLElement>('[data-k="time"]')!;
  const statusEl = screensEl.querySelector<HTMLElement>('[data-k="status"]')!;
  let net: NetClient | null = null;
  const fallback = () => {
    if (cancelled || started) return;
    started = true;
    window.clearInterval(timer);
    if (net) {
      net.send({ t: 'cancel' });
      net.close();
    }
    startBotMatch(botForTrophies(), 'ranked-bot');
  };
  const timer = window.setInterval(() => {
    left--;
    timeEl.textContent = String(Math.max(0, left));
    if (left <= 0) fallback();
  }, 1000);
  screensEl.querySelector('[data-act="cancel"]')!.addEventListener('click', () => {
    click();
    cancelled = true;
    window.clearInterval(timer);
    net?.send({ t: 'cancel' });
    net?.close();
    showHome();
  });

  const url = serverUrl();
  if (!url) {
    statusEl.textContent = 'この環境ではオンライン対戦に接続できません';
    return;
  }
  net = new NetClient(url);
  try {
    await net.connect();
  } catch {
    // 接続できない（サーバーが無い・埋め込み表示で通信が禁止されている等）場合は、待ち時間のあと BOT 戦
    if (!cancelled) statusEl.textContent = 'サーバーに接続できませんでした';
    return;
  }
  if (cancelled || started) {
    net.close();
    return;
  }
  statusEl.textContent = '相手を探しています…';
  const n = net;
  n.onMessage = (msg) => {
    if (msg.t === 'start' && !cancelled && !started) {
      started = true;
      window.clearInterval(timer);
      startOnline(n, msg.setup, msg.you);
    } else if (msg.t === 'start') {
      n.send({ t: 'cancel' });
      n.close();
    }
  };
  n.send({ t: 'queue', name: profile.name, deck: profile.deck });
}

// ---------------------------------------------------------------- ホーム・各画面

function showHome(): void {
  endBattle();
  audio.playMusic('home');
  screensEl.innerHTML = `
    <div class="screen home">
      <div class="logo">
        <div class="logo-main">RUNE ARENA</div>
        <div class="logo-sub">ルーン・アリーナ</div>
      </div>
      <div class="trophy"><i class="trophy-icon"></i> <span>${profile.trophies}</span></div>
      <label class="name-field">名前 <input id="player-name" maxlength="12" value="${escapeHtml(profile.name)}"></label>
      <div class="panel">
        <div class="home-buttons">
          <button class="btn big" data-act="battle">対戦</button>
          <button class="btn secondary" data-act="practice">BOT 練習</button>
          <div class="row">
            <button class="btn secondary" data-act="deck">デッキ</button>
            <button class="btn secondary" data-act="replays">リプレイ</button>
          </div>
        </div>
        <p class="hint">カードを手札からアリーナへドラッグ（またはタップ→アリーナをタップ）して出します。PCでは 1〜4 キーでカードを選べます。</p>
      </div>
      <div class="footer">描画: ${stage.backendName}（${stage.quality.name === 'high' ? '高画質' : '軽量'}）${assets.available ? '' : '・素材なし（仮表示）'}${
        assets.failures.length ? `<br>読み込めなかった素材 ${assets.failures.length} 件：${escapeHtml(assets.failures[0])}` : ''
      }</div>
      <button class="mute-btn" data-act="mute">${audio.muted ? '音 OFF' : '音 ON'}</button>
    </div>`;
  const nameInput = screensEl.querySelector<HTMLInputElement>('#player-name')!;
  nameInput.addEventListener('change', () => {
    profile.name = nameInput.value.trim().slice(0, 12) || 'あなた';
    saveProfile();
  });
  const on = (act: string, fn: () => void) =>
    screensEl.querySelector(`[data-act="${act}"]`)?.addEventListener('click', () => {
      click();
      fn();
    });
  on('battle', () => void showMatchmaking());
  on('practice', showPractice);
  on('deck', () => showDeckEditor(screensEl, content, profile, () => (saveProfile(), showHome())));
  on('replays', showReplays);
  screensEl.querySelector('[data-act="mute"]')?.addEventListener('click', (e) => {
    (e.currentTarget as HTMLElement).textContent = audio.toggleMute() ? '音 OFF' : '音 ON';
  });
}

function showPractice(): void {
  screensEl.innerHTML = `
    <div class="screen">
      <div class="panel">
        <div class="panel-title">BOT 練習（トロフィーは増減しません）</div>
        <div class="bot-buttons">
          ${content.bots.map((b) => `<button class="btn" data-bot="${b.id}">${escapeHtml(b.name)}</button>`).join('')}
          <button class="btn secondary" data-act="back">もどる</button>
        </div>
      </div>
    </div>`;
  screensEl.querySelectorAll<HTMLButtonElement>('[data-bot]').forEach((b) =>
    b.addEventListener('click', () => {
      click();
      startBotMatch(content.bots.find((x) => x.id === b.dataset.bot)!, 'practice');
    }),
  );
  screensEl.querySelector('[data-act="back"]')!.addEventListener('click', () => (click(), showHome()));
}

function playReplay(r: SavedReplay): void {
  startBattle(new ReplaySession(r.data, content.rules, content.cards, r.me), 'replay', null);
}

function showReplays(): void {
  const rows = profile.replays
    .map((r, i) => {
      const result = r.winner === -1 ? '引き分け' : r.winner === r.me ? '勝利' : '敗北';
      const d = new Date(r.date);
      return `<button class="replay-row ${r.winner === r.me ? 'win' : r.winner === -1 ? 'draw' : 'lose'}" data-i="${i}">
        <span class="replay-result">${result}</span>
        <span class="replay-names">${escapeHtml(r.names[r.me])} ${r.crowns[r.me]} - ${r.crowns[1 - r.me]} ${escapeHtml(r.names[1 - r.me])}</span>
        <span class="replay-date">${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>
      </button>`;
    })
    .join('');
  screensEl.innerHTML = `
    <div class="screen">
      <div class="panel">
        <div class="panel-title">リプレイ（最新${profile.replays.length}件）</div>
        <div class="replay-list">${rows || '<p class="hint">まだリプレイがありません。対戦すると自動で保存されます。</p>'}</div>
        <button class="btn secondary" data-act="back">もどる</button>
      </div>
    </div>`;
  screensEl.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) =>
    b.addEventListener('click', () => (click(), playReplay(profile.replays[Number(b.dataset.i)]))),
  );
  screensEl.querySelector('[data-act="back"]')!.addEventListener('click', () => (click(), showHome()));
}

function showResult(b: Battle): void {
  b.resultShown = true;
  b.input?.cancel();
  const sim = b.session.simulation;
  const me = b.session.localPlayer;
  const won = sim.winner === me;
  const draw = sim.winner === -1;
  const ranked = b.mode === 'online' || b.mode === 'ranked-bot';
  let delta = 0;
  let saved: SavedReplay | null = null;
  if (b.mode !== 'replay') {
    if (ranked) {
      const before = profile.trophies;
      profile.trophies = Math.max(0, profile.trophies + (draw ? 0 : won ? 30 : -30));
      delta = profile.trophies - before;
    }
    const setup =
      b.session instanceof LocalMatchSession ? b.session.setup : b.session instanceof OnlineMatchSession ? b.session.setup : null;
    if (setup) {
      addReplay({
        names: [sim.players[0].name, sim.players[1].name],
        crowns: [sim.players[0].crowns, sim.players[1].crowns],
        me,
        winner: sim.winner,
        data: replayFromSimulation(setup, sim),
      });
      saved = profile.replays[0];
    }
    saveProfile();
  }
  b.net?.close();
  const reasonText: Record<string, string> = {
    kingDestroyed: 'キングタワー破壊',
    crowns: 'クラウン数',
    suddenDeath: 'サドンデス',
    towerHp: 'タワーの残りHP',
    draw: '引き分け',
    forfeit: won ? '相手の切断' : '切断',
  };
  const title = draw ? '引き分け' : won ? '勝利！' : '敗北…';
  window.setTimeout(() => {
    audio.playMusic(null);
    if (b.mode !== 'replay') audio.play(won ? 'win' : 'lose', 0.9, 0);
    screensEl.innerHTML = `
      <div class="screen result ${draw ? 'draw' : won ? 'win' : 'lose'}">
        <div class="result-title">${b.mode === 'replay' ? 'リプレイ終了' : title}</div>
        <div class="result-reason">${reasonText[sim.endReason] ?? ''}</div>
        <div class="result-row enemy"><span>${escapeHtml(sim.players[1 - me].name)}</span><span class="crowns">${crownIcons(sim.players[1 - me].crowns)}</span></div>
        <div class="result-row ally"><span>${escapeHtml(sim.players[me].name)}</span><span class="crowns">${crownIcons(sim.players[me].crowns)}</span></div>
        ${ranked ? `<div class="result-trophy"><i class="trophy-icon"></i> ${profile.trophies} <span class="${delta >= 0 ? 'plus' : 'minus'}">${delta >= 0 ? '+' : ''}${delta}</span></div>` : ''}
        <div class="result-buttons">
          ${b.mode === 'replay' ? '' : `<button class="btn" data-act="again">${ranked ? 'もう一度対戦' : 'もう一度'}</button>`}
          ${saved ? '<button class="btn secondary" data-act="replay">リプレイを見る</button>' : ''}
          <button class="btn secondary" data-act="home">ホームへ</button>
        </div>
      </div>`;
    const bot = b.bot;
    const mode = b.mode;
    screensEl.querySelector('[data-act="again"]')?.addEventListener('click', () => {
      click();
      if (mode === 'practice' && bot) startBotMatch(bot, 'practice');
      else void showMatchmaking();
    });
    screensEl.querySelector('[data-act="replay"]')?.addEventListener('click', () => (click(), saved && playReplay(saved)));
    screensEl.querySelector('[data-act="home"]')?.addEventListener('click', () => (click(), showHome()));
  }, 1600);
}

// ---------------------------------------------------------------- ループ

/** デバッグ用：?speed=4 で試合を早送りする（オフラインのみ） */
const debugSpeed = Math.max(0.1, Number(new URLSearchParams(location.search).get('speed') ?? 1) || 1);
let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
const fpsEl = new URLSearchParams(location.search).has('fps') ? document.createElement('div') : null;
if (fpsEl) {
  fpsEl.className = 'fps';
  gameEl.appendChild(fpsEl);
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const b = battle;
  if (b) {
    b.session.advance(b.mode === 'online' ? dt : dt * debugSpeed, (events) => {
      b.view.handleEvents(events);
      b.hud.handleEvents(events);
      for (const ev of events) {
        if (ev.type !== 'crownScored') continue;
        const p = { x: 0, y: 0, visible: false };
        stage.projectToScreen(simToWorld(ev.pos.x, ev.pos.y, 3), p);
        b.hud.flyCrown(p.x, p.y, ev.owner);
      }
    });
    // advance の中で再接続により画面が作り直されることがあるので、取り直す
    const cur = battle;
    if (cur) {
      cur.view.update(dt, cur.session.interpolation);
      cur.hud.update(cur.input?.selected ?? -1, cur.input?.dragging ?? -1);
      if (cur.session.simulation.isOver && !cur.resultShown) showResult(cur);
    }
  }
  fx.update(dt);
  stage.update(dt);
  stage.render();
  if (fpsEl) {
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      const info = stage.renderer.info.render;
      fpsEl.textContent = `${Math.round(fpsFrames / fpsAcc)} fps · ${info.drawCalls ?? info.calls} draws · ${info.triangles} tris`;
      fpsAcc = 0;
      fpsFrames = 0;
    }
  }
}

async function boot(): Promise<void> {
  screensEl.innerHTML = `<div class="screen loading"><div class="logo"><div class="logo-main">RUNE ARENA</div></div><div class="bar"><div></div></div><div class="footer">読み込み中…</div></div>`;
  const bar = screensEl.querySelector<HTMLDivElement>('.bar div')!;
  stage = await Stage.create(canvas);
  worldUi = new WorldUi(worldUiEl, stage);
  fx = new Fx(stage.scene);
  await assets.load((done, total) => (bar.style.width = `${Math.round((done / total) * 100)}%`)).catch((e) => console.warn(e));
  await applyTheme(assets.available);
  // ブラウザの制限で、音は最初のタップ／クリックから鳴らせる
  window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  layout();
  showHome();
  stage.renderer.setAnimationLoop(frame);
  // デバッグ用：コンソールから状態を見られるようにする
  (window as unknown as Record<string, unknown>).__game = { get battle() { return battle; }, content, profile };
}

boot().catch((err) => {
  console.error(err);
  screensEl.innerHTML = `<div class="screen error">起動できませんでした：${escapeHtml(String(err))}</div>`;
});
