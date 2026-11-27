// ダイスキングダム：起動と画面の流れ
import './style.css';
import { HEROES, HERO_ORDER, STAGES } from './data/defs.ts';
import { audio, type Bgm } from './audio.ts';
import { AIController } from './game/ai.ts';
import { Game, type Controller } from './game/engine.ts';
import type { HeroId, StageId } from './game/types.ts';
import { applyMatch, DICE_SKINS, loadSave, unlockedCards, writeSave } from './meta.ts';
import { heroPortraits, World } from './render/world.ts';
import { achievementsScreen, creditsScreen, helpScreen, resultsScreen, setupScreen, titleScreen, vaultScreen } from './ui/screens.ts';
import { UI } from './ui/ui.ts';
import { GameView, HumanController } from './view.ts';

const QS = new URLSearchParams(location.search);
const AUTO = QS.has('auto'); // 動作確認用：自分の手番も自動で打つ
const ROUNDS = AUTO && QS.get('rounds') ? Number(QS.get('rounds')) : 20; // 動作確認用：ラウンド数
const save = loadSave();
const world = new World(document.getElementById('stage')!);
const ui = new UI(document.getElementById('ui')!);
audio.setMuted(save.muted);
ui.speed = 1;
world.diceModel = DICE_SKINS.find((d) => d.id === save.dice)?.model ?? 'D6_A';

// 最初の操作で音を出せるようにする
const unlock = () => {
  audio.unlock();
  removeEventListener('pointerdown', unlock);
  removeEventListener('keydown', unlock);
};
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

let portraits: Record<string, string> = {};
let builtStage: StageId | null = null;

async function ensureWorld(stage: StageId) {
  if (builtStage === stage) return;
  builtStage = stage;
  await world.build(STAGES[stage]);
  const empty = { owner: null, level: 0, festival: 0, dragon: 0 };
  for (let i = 0; i < 30; i++) await world.setTile(i, empty, false);
}

function bgm(name: Bgm) {
  audio.playBgm(name);
}

async function boot() {
  const loading = document.getElementById('loading')!;
  await ensureWorld(save.lastStage in STAGES ? save.lastStage : 'meadow');
  // タイトル背景：建物が少し建った王国
  const demo: [number, number, number][] = [[1, 0, 2], [2, 0, 1], [6, 1, 3], [12, 2, 2], [16, 3, 4], [19, 3, 1], [23, 1, 2], [28, 0, 3], [29, 2, 1]];
  for (const [i, o, l] of demo) await world.setTile(i, { owner: o, level: l, festival: 0, dragon: 0 }, false);
  portraits = await heroPortraits(Object.fromEntries(HERO_ORDER.map((h) => [h, HEROES[h].model])));
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 600);
  await titleLoop();
}

async function titleLoop() {
  for (;;) {
    ui.hud.hidden = true;
    world.labels.hidden = true;
    world.overview();
    bgm('title');
    const go = await titleScreen(ui, save);
    if (go === 'play') {
      const pick = await setupScreen(ui, save, portraits);
      writeSave(save);
      if (!pick) continue;
      await playLoop(pick.hero, pick.stage);
    } else if (go === 'vault') {
      await vaultScreen(ui, save, (id) => {
        save.dice = id;
        world.diceModel = DICE_SKINS.find((d) => d.id === id)!.model;
        writeSave(save);
      });
    } else if (go === 'achievements') await achievementsScreen(ui, save);
    else if (go === 'help') await helpScreen(ui);
    else await creditsScreen(ui);
  }
}

async function playLoop(hero: HeroId, stage: StageId) {
  for (;;) {
    const again = await playGame(hero, stage);
    if (!again) return;
  }
}

/** 1試合遊ぶ。もう一回なら true */
async function playGame(hero: HeroId, stage: StageId): Promise<boolean> {
  save.lastHero = hero;
  save.lastStage = stage;
  writeSave(save);
  ui.hideScreen();
  builtStage = null;
  await ensureWorld(stage);
  world.labels.hidden = false;

  const others = HERO_ORDER.filter((h) => h !== hero).sort(() => Math.random() - 0.5).slice(0, 3);
  const heroes = [hero, ...others];
  const names = ['あなた', ...others.map((h) => HEROES[h].name)];
  const seed = (Math.random() * 1e9) | 0;
  const view = new GameView(world, ui, 0);
  view.cpuSpeed = save.speed;
  ui.speed = 1;
  const human = new HumanController(ui, world);
  let g!: Game;
  const ctrls: Controller[] = heroes.map((_, i) => (i === 0 && !AUTO ? human : new AIController(STAGES[stage].aiSkill)));
  g = new Game({ stage, rounds: ROUNDS, heroes, names, humanIndex: 0, cardPool: unlockedCards(save), seed }, view, ctrls);
  view.g = g;
  if (AUTO) {
    g.s.players[0].human = false;
    view.cpuSpeed = 4;
  }
  await world.addPieces(heroes.map((h) => HEROES[h].model));
  ui.hud.hidden = false;
  ui.logEl.innerHTML = '';
  bgm((['main1', 'main2', 'main3'] as const)[Math.floor(Math.random() * 3)]);
  view.sync();

  // マスの説明
  world.onTileClick = (i) => {
    const s = world.toScreen(world.tileWorld(i));
    ui.showTooltip(ui.tileInfo(g, i), s.x, s.y);
  };
  world.onTileHover = (i, x, y) => {
    if (i === null) ui.hideTooltip();
    else ui.showTooltip(ui.tileInfo(g, i), x, y);
  };
  world.labels.onclick = (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.tile-label');
    if (el && !el.classList.contains('selectable')) {
      const r = el.getBoundingClientRect();
      ui.showTooltip(ui.tileInfo(g, Number(el.dataset.tile)), r.left, r.bottom);
    }
  };
  // 上部のボタン
  let quit = false;
  const onTop = async (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('.speed')) {
      save.speed = save.speed === 1 ? 2 : save.speed === 2 ? 4 : 1;
      view.cpuSpeed = save.speed;
      ui.speed = 1;
      writeSave(save);
      view.sync();
    } else if (t.closest('.sound')) {
      save.muted = !save.muted;
      audio.setMuted(save.muted);
      writeSave(save);
      view.sync();
    } else if (t.closest('.jackpot')) {
      const r = t.closest('.jackpot')!.getBoundingClientRect();
      ui.showTooltip(ui.tileInfo(g, 15), r.left, r.bottom);
    } else if (t.closest('.menu')) {
      const v = await ui.dialog<'resume' | 'help' | 'quit'>({
        title: 'メニュー',
        icon: 'cog',
        body: '<p>ゲームはいつでも続きから遊べます（試合を途中でやめると結果は記録されません）。</p>',
        buttons: [
          { label: '遊び方', value: 'help' },
          { label: '試合をやめる', value: 'quit', kind: 'danger' },
          { label: '続ける', value: 'resume', kind: 'primary' },
        ],
      });
      if (v === 'help') {
        await helpScreen(ui);
        ui.hideScreen();
      } else if (v === 'quit') {
        quit = true;
        location.reload();
      }
    }
  };
  ui.top.addEventListener('click', onTop);

  if (!save.seenHelp && !AUTO) {
    save.seenHelp = true;
    writeSave(save);
    await ui.dialog({
      title: 'ようこそ、ダイスキングダムへ',
      icon: 'crown',
      body: `<p>サイコロを振って王国をめぐり、土地を買って建物を育てよう。止まった相手から通行料を取り、<b>20ラウンド後に一番お金持ち</b>なら勝ち。</p><p>同じ色の土地を3つそろえると通行料が2倍。<b>3色そろえれば即勝利！</b></p><p class="note">マスや上の文字をタップすると詳しい説明が出ます。</p>`,
      buttons: [{ label: 'はじめる', value: true, kind: 'gold' }],
    });
  }
  await ui.banner(`${STAGES[stage].name}`, '20ラウンドの戦いが始まる', 'k-start', 1600);
  await g.run();
  ui.top.removeEventListener('click', onTop);
  world.onTileClick = null;
  world.onTileHover = null;
  ui.hideTooltip();
  if (quit) return false;
  await new Promise((r) => setTimeout(r, 1200));
  const res = applyMatch(save, g, g.s.players[0]);
  ui.hud.hidden = true;
  const next = await resultsScreen(ui, g, g.s.players[0], res);
  return next === 'again';
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading')!.innerHTML = `<p>読み込みに失敗しました。再読み込みしてください。</p><pre>${String(e)}</pre>`;
});
