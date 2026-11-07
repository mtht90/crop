import './style.css';
import {
  loadContent,
  LocalMatchSession,
  ReplaySession,
  type BotProfile,
  type MatchSession,
  type ReplayData,
} from '@cardbattle/sim';
import { ArenaView } from './render/arenaView';
import { BattleView } from './render/battleView';
import { setArenaSize } from './render/coords';
import { Fx } from './render/fx';
import { Stage } from './render/stage';
import { WorldUi } from './render/worldUi';
import { CardInput } from './input/cardInput';
import { Hud, crownIcons, escapeHtml } from './ui/hud';
import { assets } from './assets/assets';
import { applyTheme } from './ui/theme';
import { audio } from './audio';
import { profile, saveProfile } from './profile';

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

/** 進行中の対戦（オフライン BOT 戦・リプレイ再生で共通） */
interface Battle {
  session: MatchSession;
  arena: ArenaView;
  view: BattleView;
  hud: Hud;
  input: CardInput | null;
  isReplay: boolean;
  resultShown: boolean;
  bot: BotProfile | null;
}
let battle: Battle | null = null;

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

function startBattle(session: MatchSession, isReplay: boolean, bot: BotProfile | null): void {
  endBattle();
  screensEl.innerHTML = '';
  const sim = session.simulation;
  const arena = new ArenaView(sim);
  const view = new BattleView(sim, session.localPlayer, stage, worldUi, fx);
  const hud = new Hud(hudEl, sim, session.localPlayer);
  stage.scene.add(arena.root, view.root);
  const input = isReplay ? null : new CardInput(session, stage, arena, hud, gameEl);
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
  if (isReplay) hud.announce('リプレイ再生中', 'small', 1500);
  battle = { session, arena, view, hud, input, isReplay, resultShown: false, bot };
  audio.playMusic('battle');
  gameEl.classList.add('in-battle');
  layout();
  view.update(0, 1);
}

function startBotMatch(bot: BotProfile): void {
  const seed = randomSeed();
  const botName = content.botNames[Math.abs(seed) % content.botNames.length];
  const session = new LocalMatchSession(
    { seed, decks: [profile.deck.slice(), content.starterDeck.slice()], names: [profile.name, botName] },
    content.rules,
    content.cards,
    0,
  );
  session.setBot(1, bot);
  startBattle(session, false, bot);
}

function endBattle(): void {
  if (!battle) return;
  battle.input?.dispose();
  battle.view.dispose();
  stage.scene.remove(battle.arena.root, battle.view.root);
  fx.clear();
  worldUi.clear();
  hudEl.innerHTML = '';
  gameEl.classList.remove('in-battle');
  battle = null;
}

// ---------------------------------------------------------------- 画面

function showTitle(): void {
  endBattle();
  audio.playMusic('home');
  screensEl.innerHTML = `
    <div class="screen title">
      <div class="logo">
        <div class="logo-main">RUNE ARENA</div>
        <div class="logo-sub">ルーン・アリーナ</div>
      </div>
      <div class="trophy">🏆 <span>${profile.trophies}</span></div>
      <div class="panel">
        <div class="panel-title">BOTと対戦</div>
        <div class="bot-buttons">
          ${content.bots.map((b) => `<button class="btn" data-bot="${b.id}">${escapeHtml(b.name)}</button>`).join('')}
        </div>
        <p class="hint">カードを手札からアリーナへドラッグ（またはタップ→アリーナをタップ）して出します。<br>PCでは 1〜4 キーでカードを選べます。</p>
      </div>
      <div class="footer">描画: ${stage.backendName}${assets.available ? '' : '（素材なし・仮表示）'}${
        assets.failures.length ? `<br>読み込めなかった素材 ${assets.failures.length} 件：${escapeHtml(assets.failures[0])}` : ''
      }</div>
      <button class="mute-btn" data-act="mute">${audio.muted ? '🔇' : '🔊'}</button>
    </div>`;
  screensEl.querySelector('[data-act="mute"]')?.addEventListener('click', (e) => {
    (e.currentTarget as HTMLElement).textContent = audio.toggleMute() ? '🔇' : '🔊';
  });
  screensEl.querySelectorAll<HTMLButtonElement>('[data-bot]').forEach((b) =>
    b.addEventListener('click', () => {
      audio.play('click', 0.6, 0);
      startBotMatch(content.bots.find((x) => x.id === b.dataset.bot)!);
    }),
  );
}

function showResult(b: Battle): void {
  b.resultShown = true;
  b.input?.cancel();
  const sim = b.session.simulation;
  const me = b.session.localPlayer;
  const won = sim.winner === me;
  const draw = sim.winner === -1;
  let delta = 0;
  let replay: ReplayData | null = null;
  if (!b.isReplay && b.session instanceof LocalMatchSession) {
    delta = draw ? 0 : won ? 30 : -30;
    const before = profile.trophies;
    profile.trophies = Math.max(0, profile.trophies + delta);
    delta = profile.trophies - before;
    replay = b.session.createReplay();
    profile.lastReplay = replay;
    saveProfile();
  }
  const reasonText: Record<string, string> = {
    kingDestroyed: 'キングタワー破壊',
    crowns: 'クラウン数',
    suddenDeath: 'サドンデス',
    towerHp: 'タワーの残りHP',
    draw: '引き分け',
    forfeit: '相手の切断',
  };
  const crowns = crownIcons;
  const title = draw ? '引き分け' : won ? '勝利！' : '敗北…';
  window.setTimeout(() => {
    audio.playMusic(null);
    if (!b.isReplay) audio.play(won ? 'win' : 'lose', 0.9, 0);
    screensEl.innerHTML = `
      <div class="screen result ${draw ? 'draw' : won ? 'win' : 'lose'}">
        <div class="result-title">${b.isReplay ? 'リプレイ終了' : title}</div>
        <div class="result-reason">${reasonText[sim.endReason] ?? ''}</div>
        <div class="result-row enemy"><span>${escapeHtml(sim.players[1 - me].name)}</span><span class="crowns">${crowns(sim.players[1 - me].crowns)}</span></div>
        <div class="result-row ally"><span>${escapeHtml(sim.players[me].name)}</span><span class="crowns">${crowns(sim.players[me].crowns)}</span></div>
        ${b.isReplay ? '' : `<div class="result-trophy">🏆 ${profile.trophies} <span class="${delta >= 0 ? 'plus' : 'minus'}">${delta >= 0 ? '+' : ''}${delta}</span></div>`}
        <div class="result-buttons">
          ${b.bot && !b.isReplay ? '<button class="btn" data-act="again">もう一度</button>' : ''}
          ${replay || b.isReplay ? '<button class="btn secondary" data-act="replay">リプレイを見る</button>' : ''}
          <button class="btn secondary" data-act="home">ホームへ</button>
        </div>
      </div>`;
    const bot = b.bot;
    screensEl.querySelector('[data-act="again"]')?.addEventListener('click', () => bot && startBotMatch(bot));
    screensEl.querySelector('[data-act="replay"]')?.addEventListener('click', () => {
      if (profile.lastReplay) startBattle(new ReplaySession(profile.lastReplay, content.rules, content.cards, 0), true, bot);
    });
    screensEl.querySelector('[data-act="home"]')?.addEventListener('click', showTitle);
  }, 1600);
}

// ---------------------------------------------------------------- ループ

/** デバッグ用：?speed=4 で試合を早送りする */
const debugSpeed = Math.max(0.1, Number(new URLSearchParams(location.search).get('speed') ?? 1) || 1);
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const b = battle;
  if (b) {
    b.session.advance(dt * debugSpeed, (events) => {
      b.view.handleEvents(events);
      b.hud.handleEvents(events);
    });
    b.view.update(dt, b.session.interpolation);
    b.hud.update(b.input?.selected ?? -1, b.input?.dragging ?? -1);
    if (b.session.simulation.isOver && !b.resultShown) showResult(b);
  }
  fx.update(dt);
  stage.update(dt);
  stage.render();
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
  showTitle();
  stage.renderer.setAnimationLoop(frame);
  // デバッグ用：コンソールから状態を見られるようにする
  (window as unknown as Record<string, unknown>).__game = { get battle() { return battle; }, content, profile };
}

boot().catch((err) => {
  console.error(err);
  screensEl.innerHTML = `<div class="screen error">起動できませんでした：${escapeHtml(String(err))}</div>`;
});
