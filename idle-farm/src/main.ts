import './ui/style.css';
import { CROP_IDS, CROPS } from './game/data';
import { formatMoney } from './game/format';
import { buyUpgrade, harvest, isRipe, plant, sell, tickGrowth, upgradeCost } from './game/logic';
import { clearSave, type GameState, loadGame, newGame, restore, saveGame } from './game/state';
import { Farmers } from './scene/farmers';
import { World } from './scene/world';
import { Ui } from './ui/ui';

// claude.ai のプレビューで更新されたとき、遊んでいた状態を引き継ぐためのフック
interface HotApi {
  data?: { state?: unknown };
  snapshot?: (fn: () => unknown) => void;
  ready?: (start: (data: { state?: unknown }) => void) => void;
}
const hot = (window as unknown as { claude?: { hot?: HotApi } }).claude?.hot;

function start(hotData: { state?: unknown } = {}) {
  let state: GameState = restore(hotData.state) ?? loadGame() ?? newGame();
  hot?.snapshot?.(() => ({ state }));

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const world = new World(canvas);
  const farmers = new Farmers(world, (index, r) => {
    if (r.ok) floatAt(index, r.crop, r.quality);
  });

  const ui = new Ui(() => state, {
    onSave: () => saveGame(state),
    onReset: () => {
      clearSave();
      state = newGame();
      location.reload();
    },
    onPurchase: () => saveGame(state),
  });

  function floatAt(index: number, crop: (typeof CROP_IDS)[number], quality: number) {
    const p = world.toScreen(world.plotPosition(index).setY(0.6));
    ui.floater(p.x, p.y, crop, quality);
  }

  // ---- 畑のクリック・ドラッグ ------------------------------------------
  let dragging = false;
  const touched = new Set<number>();

  function actOn(clientX: number, clientY: number, firstPress: boolean) {
    const hit = world.pick(clientX, clientY, state);
    if (hit.kind === 'market' && firstPress) return ui.openTab('warehouse');
    if (hit.kind === 'expand' && firstPress) {
      const cost = upgradeCost(state, 'expand');
      if (cost !== null && buyUpgrade(state, 'expand')) {
        ui.toast('畑を広げた');
        saveGame(state);
      } else if (cost !== null) {
        ui.toast(`畑を広げるには ${formatMoney(cost)}円 必要です`, true, 'expand');
      }
      return;
    }
    if (hit.kind !== 'plot' || touched.has(hit.index)) return;
    touched.add(hit.index);
    const plot = state.plots[hit.index];
    if (isRipe(plot)) {
      const r = harvest(state, hit.index, true);
      if (r.ok) floatAt(hit.index, r.crop, r.quality);
      else ui.toast('倉庫がいっぱいです。作物を売りましょう', true, 'full');
    } else if (!plot.crop) {
      plant(state, hit.index);
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    touched.clear();
    canvas.setPointerCapture(e.pointerId);
    actOn(e.clientX, e.clientY, true);
  });
  canvas.addEventListener('pointermove', (e) => {
    const hit = world.pick(e.clientX, e.clientY, state);
    world.setHover(hit.kind === 'plot' ? hit.index : null);
    canvas.classList.toggle('pointer', hit.kind !== 'none');
    if (dragging) actOn(e.clientX, e.clientY, false);
  });
  const endDrag = () => {
    dragging = false;
    touched.clear();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => world.setHover(null));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      world.zoomBy(e.deltaY);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const n = Number(e.key);
    if (n >= 1 && n <= CROP_IDS.length) ui.selectSeed(CROP_IDS[n - 1]);
    if (e.key === 's' || e.key === 'S') ui.doSell();
  });

  // ---- 画面サイズ ------------------------------------------------------
  const resize = () => world.resize(canvas.clientWidth, canvas.clientHeight);
  window.addEventListener('resize', resize);
  resize();

  // ---- 保存 ------------------------------------------------------------
  setInterval(() => saveGame(state), 10_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame(state);
  });
  window.addEventListener('pagehide', () => saveGame(state));

  // ---- 読み込みとループ ------------------------------------------------
  const loadingSub = document.getElementById('loading-sub')!;
  Promise.all([world.load(), farmers.load()])
    .then(() => {
      document.getElementById('loading')!.classList.add('done');
      let last = performance.now();
      let uiTimer = 0;
      const frame = (now: number) => {
        // タブが裏にあった直後に大きく進みすぎないよう 0.25秒で区切る
        const dt = Math.min(0.25, (now - last) / 1000);
        last = now;
        tickGrowth(state, dt);
        farmers.update(dt, state);
        world.update(dt, state);
        uiTimer -= dt;
        if (uiTimer <= 0) {
          uiTimer = 0.2;
          ui.refresh();
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    })
    .catch((err) => {
      console.error(err);
      loadingSub.textContent = '素材の読み込みに失敗しました。ページを再読み込みしてください。';
    });

  // デバッグ用（ブラウザのコンソールから触れる）
  Object.assign(window, { idleFarm: { get state() { return state; }, sell, CROPS } });
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
