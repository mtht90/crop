import '@fontsource/dela-gothic-one/400.css';
import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/700.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import './ui/style.css';
import { AudioEngine, type AudioSettings } from './audio';
import { ACHIEVEMENTS, BUILDINGS } from './core/data';
import { fmt } from './core/format';
import { Game } from './core/sim';
import { SAVE_KEY, exportSave, hydrate, importSave, newState, serialize } from './core/state';
import { Ui } from './ui/ui';
import { loadWorldAssets } from './world/assets';
import { World } from './world/world';

const SETTINGS_KEY = 'chiisana-oukoku/settings/v1';
const AUTOSAVE_SEC = 10;

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return hydrate(JSON.parse(raw));
  } catch { /* storage unavailable or corrupt */ }
  return newState();
}
function loadSettings(): Partial<AudioSettings> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

async function boot() {
  const loading = document.getElementById('loading')!;
  const fill = loading.querySelector('.fill') as HTMLElement;
  const txt = loading.querySelector('.txt') as HTMLElement;
  const setP = (p: number) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    txt.textContent = `${Math.round(p * 100)}%`;
  };

  await Promise.all([document.fonts.load('40px "Dela Gothic One"'), document.fonts.load('700 14px "M PLUS Rounded 1c"')]).catch(() => {});
  await loadWorldAssets((p) => setP(p * 0.95));
  setP(1);

  const game = new Game(loadState());
  const audio = new AudioEngine();
  Object.assign(audio.settings, loadSettings());
  const saveSettings = () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(audio.settings)); } catch { /* ignore */ }
  };

  let resetting = false;
  const save = () => {
    if (resetting) return;
    game.s.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, serialize(game.s)); } catch { /* ignore */ }
  };

  const sfx = (k: string, o?: { vol?: number; rate?: number }) => audio.sfx(k, o);

  const world = new World(game, {
    onMineClick: () => game.click(),
    onGolden: () => game.collectGolden(),
    onDuck: () => {
      const v = game.collectDuck();
      ui.toast(`あひるが金貨 ${fmt(v)} 枚を落としていった！`, 'yellow');
      sfx('coins2');
    },
    sfx,
  });

  const ui: Ui = new Ui(game, {
    sfx,
    focusMain: () => world.focusMain(),
    focusWorld: () => world.focusWorld(),
    focusRival: (id) => world.focusRival(id),
    toggleMute: () => {
      audio.settings.muted = !audio.settings.muted;
      audio.applySettings();
      saveSettings();
      return audio.settings.muted;
    },
    getSettings: () => ({ ...audio.settings }),
    setSettings: (s) => {
      Object.assign(audio.settings, s);
      audio.applySettings();
      saveSettings();
    },
    exportSave: () => exportSave(game.s),
    importSave: (text) => {
      try {
        const s = importSave(text);
        game.load(s);
        save();
        return true;
      } catch {
        return false;
      }
    },
    hardReset: () => {
      resetting = true;
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      location.reload();
    },
    skipTrack: () => audio.skipTrack(),
    beforePrestige: () => audio.ceremony(),
  });

  await world.init(document.getElementById('stage')!);
  ui.mount();
  ui.mineScreen = () => world.mineScreen();
  audio.onTrack = (t) => ui.showTrack(t);

  const layoutInsets = () => {
    const mobile = window.innerWidth <= 820;
    world.insetRight = mobile ? 0 : 446;
    world.insetBottom = mobile ? window.innerHeight * 0.46 : 0;
    world.insetTop = mobile ? 70 : 64;
    world.focusMain(true);
  };
  layoutInsets();
  window.addEventListener('resize', layoutInsets);

  // ------------------------------------------------------------ events → visuals & sound
  game.on((e) => {
    switch (e.type) {
      case 'click': {
        world.mineHit(e.crit, e.auto, fmt(e.value));
        if (e.auto) {
          sfx('mine1', { vol: 0.18, rate: 1.1 });
        } else {
          sfx('mine1', { vol: 0.55, rate: 0.9 + game.heat * 0.25 });
          if (Math.random() < 0.45) sfx(`clink${1 + ((Math.random() * 3) | 0)}`, { vol: 0.45 });
          if (Math.random() < 0.3) sfx(`coin${1 + ((Math.random() * 3) | 0)}`, { vol: 0.35 });
          if (e.crit) {
            sfx('coins1', { vol: 0.9 });
            sfx('clash', { vol: 0.5, rate: 1.3 });
          }
        }
        break;
      }
      case 'hire':
        world.syncPawns();
        if (e.count > 0) sfx(e.count > 1 ? 'coins2' : 'coins1', { vol: 0.7 });
        break;
      case 'train':
        sfx('unsheathe', { vol: 0.7 });
        sfx('coins1', { vol: 0.5 });
        break;
      case 'buildStart':
        world.syncBuildings();
        sfx('chop', { vol: 0.8 });
        sfx('coins2', { vol: 0.5 });
        break;
      case 'buildDone': {
        world.onBuildDone(e.c);
        world.syncPawns();
        sfx('build_done', { vol: 0.8 });
        const b = BUILDINGS.find((x) => x.id === e.c.building)!;
        ui.toast(e.c.building === 'castle' ? `城が ${game.s.buildings.castle} 段階目に！` : `${b.name}が完成しました`);
        break;
      }
      case 'research':
        sfx('upgrade', { vol: 0.8 });
        world.updateStoneTier();
        ui.toast(`研究完了「${e.def.name}」`, 'blue', e.def.desc);
        break;
      case 'achievement': {
        const a = ACHIEVEMENTS.find((x) => x.id === e.id)!;
        sfx('achievement', { vol: 0.8 });
        ui.toast(`実績「${a.name}」`, 'yellow', '全生産 +2%');
        break;
      }
      case 'goldenSpawn':
        world.spawnGolden(e.id, e.x, e.y);
        sfx('magic', { vol: 0.5, rate: 1.3 });
        break;
      case 'goldenCollect':
        if (e.kind === 'frenzy') {
          world.collectGoldenFx('黄金の祭り！ ×7');
          ui.toast('黄金の祭り！ 30秒間 生産×7', 'yellow');
          sfx('levelup', { vol: 0.9 });
        } else {
          world.collectGoldenFx('+' + fmt(e.value));
          sfx('coins1');
          sfx('coins2', { vol: 0.7 });
        }
        break;
      case 'goldenExpire':
        world.removeGolden();
        break;
      case 'duckSpawn':
        world.spawnDuck();
        break;
      case 'battleStart':
        audio.battle();
        world.startBattle(e.battle);
        ui.toast(`${e.battle.rival.forts[e.battle.fort]}へ出陣！`, 'red');
        break;
      case 'battleEnd':
        world.endBattle(e.battle);
        audio.sting(e.battle.win ? 'victory' : 'defeat');
        setTimeout(() => ui.showBattleResult(e.battle), 900);
        break;
      case 'prestige':
        world.resetViews();
        ui.renderTabs();
        ui.renderContent(true);
        ui.showCoronation(e.crowns);
        setTimeout(() => audio.field(), 20000);
        save();
        break;
      case 'reset':
        world.resetViews();
        ui.renderTabs();
        ui.renderContent(true);
        break;
      case 'perk':
        sfx('magic', { vol: 0.7 });
        ui.toast('王家の遺産を受け継ぎました', 'purple');
        break;
      case 'notEnough':
        break;
    }
  });

  // ------------------------------------------------------------ offline progress
  const report = game.applyOffline();
  world.syncAll();

  // ------------------------------------------------------------ main loop (wall-clock driven so background tabs keep progressing)
  let last = performance.now();
  let uiAcc = 0;
  let saveAcc = 0;
  const step = () => {
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    if (dt <= 0) return;
    if (dt > 2) {
      // 長時間止まっていた（バックグラウンド等）: 1秒刻みで早送り（最大10分ぶん詳細に、残りはまとめて）
      const chunks = Math.min(600, Math.floor(dt));
      const per = dt / Math.max(1, chunks);
      for (let i = 0; i < chunks; i++) game.tick(per);
      dt = 0;
    } else game.tick(dt);
    uiAcc += dt;
    saveAcc += dt;
    if (uiAcc >= 0.25) {
      uiAcc = 0;
      ui.tick();
    }
    if (saveAcc >= AUTOSAVE_SEC) {
      saveAcc = 0;
      save();
    }
  };
  world.app.ticker.add(() => {
    step();
    ui.frame();
  });
  setInterval(() => {
    if (document.hidden) step();
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  window.addEventListener('pagehide', save);

  // keyboard: space / enter to strike the mine
  window.addEventListener('keydown', (e) => {
    if (ui.modalOpen) {
      if (e.key === 'Escape') ui.closeModal();
      return;
    }
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      game.click();
    }
  });

  // ------------------------------------------------------------ start screen (audio needs a user gesture)
  loading.classList.add('ready');
  const startBtn = loading.querySelector('.start') as HTMLButtonElement;
  const isNew = game.s.stats.clicks === 0 && game.s.reignGold === 0;
  startBtn.querySelector('.label')!.textContent = isNew ? '王国をはじめる' : '王国へ戻る';
  await new Promise<void>((res) => startBtn.addEventListener('click', () => res(), { once: true }));
  await audio.unlock().catch(() => {});
  sfx('door', { vol: 0.6 });
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 700);
  ui.tick();
  if (report) {
    ui.showOffline(report);
    sfx('coins2');
  }
  (window as unknown as { __game: Game }).__game = game;
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.querySelector('.sub')!.textContent = '読み込みに失敗しました。ページを再読み込みしてください。';
});
