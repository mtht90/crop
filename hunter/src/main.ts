import * as THREE from 'three';
import './style.css';
import { assets } from './assets';
import { audio } from './audio';
import { input } from './input';
import { Game, type HuntResult } from './game';
import { Base } from './base';
import { save, persist, addMats } from './save';
import { MATERIALS, LORE, type MatId } from './data';

const $ = (id: string) => document.getElementById(id)!;

type Screen = 'loading' | 'title' | 'base' | 'hunt' | 'result';
let screen: Screen = 'loading';

const canvas = $('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
input.attach(canvas);
const AUTOLOCK = new URLSearchParams(location.search).has('autolock');
if (AUTOLOCK) {
  input.lock = () => {
    input.locked = true;
    $('click-to-play').style.display = 'none';
  };
}

let game: Game;
let base: Base;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  game?.resize(w, h);
  base?.resize(w, h);
}
window.addEventListener('resize', resize);

async function boot() {
  const bar = $('load-fill');
  const label = $('load-label');
  let mp = 0;
  let ap = 0;
  const upd = () => (bar.style.width = (mp * 0.75 + ap * 0.25) * 100 + '%');
  audio.init();
  await Promise.all([
    assets.loadAll((p, l) => {
      mp = p;
      label.textContent = '読み込み中… ' + l;
      upd();
    }),
    audio.loadAll((p) => {
      ap = p;
      upd();
    }),
  ]);
  label.textContent = '炉に火を入れています…';
  await new Promise((r) => setTimeout(r, 30));
  game = new Game(renderer);
  game.buildOnce();
  base = new Base();
  base.build();
  resize();
  // シェーダのコンパイルを先に済ませる
  renderer.compile(game.scene, game.camera);
  game.onEnd = (r) => showResult(r);
  game.onPause = (p) => ($('pause').style.display = p ? 'flex' : 'none');
  base.onSortie = (lo) => startHunt(lo);
  $('loading').style.display = 'none';
  $('title').style.display = 'flex';
  $('title-lore').innerHTML = `${LORE.world}<br>${LORE.guild}`;
  screen = 'title';
}

function startHunt(lo: typeof save.loadout) {
  base.close();
  screen = 'hunt';
  input.enabled = true;
  game.start(lo);
  resize();
  $('click-to-play').style.display = 'flex';
  input.lock();
}

function showResult(r: HuntResult) {
  screen = 'result';
  input.enabled = false;
  input.unlock();
  $('pause').style.display = 'none';
  $('click-to-play').style.display = 'none';
  save.hunts++;
  if (r.success) {
    save.bossKills++;
    save.bestTime = Math.min(save.bestTime ?? Infinity, r.time);
  }
  addMats(r.mats);
  persist();
  const m = Math.floor(r.time / 60);
  const s = Math.floor(r.time % 60);
  $('result').style.display = 'flex';
  $('result-body').innerHTML = `
    <h1 class="${r.success ? 'ok' : 'ng'}">${r.success ? '狩猟成功' : '狩猟失敗'}</h1>
    <p>${r.success ? '骸鍛王グラウムドルを討伐した。' : '力尽き、工房船に回収された。持ち帰れた素材は半分だけだ。'}</p>
    <table>
      <tr><td>狩猟時間</td><td>${m}分${s}秒</td></tr>
      <tr><td>討伐数</td><td>${r.kills}</td></tr>
      <tr><td>部位破壊</td><td>${r.partsBroken}</td></tr>
      <tr><td>喰わせた魔核</td><td>${r.coresEaten}</td></tr>
    </table>
    <h3>持ち帰った素材</h3>
    <p>${Object.entries(r.mats).filter(([, v]) => v).map(([k, v]) => `${MATERIALS[k as MatId].name}×${v}`).join('　') || 'なし'}</p>
    <button class="big" id="back">工房船へ戻る</button>`;
  audio.playBgm('base', 2);
  $('back').addEventListener('click', () => {
    $('result').style.display = 'none';
    screen = 'base';
    base.render();
    base.open();
  });
}

$('start').addEventListener('click', () => {
  audio.resume();
  audio.play('ui_open', { vol: 0.8 });
  $('title').style.display = 'none';
  screen = 'base';
  if (audio.ctx) audio.master.gain.value = save.volume;
  base.open();
});

$('click-to-play').addEventListener('click', () => {
  audio.resume();
  input.lock();
});
input.onUnlock = () => {
  if (screen === 'hunt' && game.running && !game.ended) {
    game.setPaused(true);
  }
};
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    $('click-to-play').style.display = 'none';
    if (screen === 'hunt') game.setPaused(false);
  } else if (screen === 'hunt' && game.running && game.ended) {
    $('click-to-play').style.display = 'flex';
  }
});
$('resume').addEventListener('click', () => {
  audio.resume();
  input.lock();
});
$('abandon').addEventListener('click', () => {
  $('pause').style.display = 'none';
  game.paused = false;
  game.running = false;
  game.success = false;
  game.finish();
});

let last = performance.now();
function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (screen === 'hunt') game.update(dt);
  else if (screen === 'base' || screen === 'result' || screen === 'title') base?.update(dt, renderer);
  input.endFrame();
}
requestAnimationFrame(loop);

// デバッグ・自動テスト用フック
(window as any).__hunt = {
  get game() {
    return game;
  },
  get base() {
    return base;
  },
  startHunt: (lo?: any) => startHunt(lo ?? save.loadout),
  input,
  press: (code: string) => input.pressed.add(code),
  /** 当たり判定の可視化（デバッグ専用） */
  debugHitboxes() {
    const g = game;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const list: { m: THREE.Mesh; hb: any }[] = [];
    const sync = () => {
      for (const c of g.creatures)
        for (const hb of c.hitboxes)
          if (!list.find((x) => x.hb === hb)) {
            const m = new THREE.Mesh(geo, mat.clone());
            (m.material as THREE.MeshBasicMaterial).color.set(hb.def.kind === 'weak' ? 0xffff00 : hb.def.kind === 'part' ? 0x00ccff : 0xff00ff);
            g.scene.add(m);
            list.push({ m, hb });
          }
      for (const { m, hb } of list) {
        m.position.copy(hb.pos);
        m.scale.setScalar(hb.r);
        m.visible = hb.active;
      }
    };
    const orig = g.render.bind(g);
    g.render = () => {
      sync();
      orig();
    };
  },
  get screen() {
    return screen;
  },
};

boot().catch((e) => {
  $('load-label').textContent = '読み込みに失敗しました: ' + e;
  console.error(e);
});
